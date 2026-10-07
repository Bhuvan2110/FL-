/**
 * Logistic regression from first principles — zero ML libraries, matching
 * the project's research constraint. Reimplemented from spec (see the
 * top-level README's note on why this isn't a line-for-line port of the
 * original Python); signatures match what server/routes/train.ts,
 * predict.ts, and the test suite expect.
 */

export interface Weights {
  w: number[]
  b: number
}

export interface Dataset {
  rows: Record<string, number>[]
  cols: string[]
  labelCol: string
}

export interface NormStats {
  [col: string]: { min: number; max: number }
}

/** Deterministic seeded PRNG (mulberry32) — same seed always gives the same
 * sequence, so `seed` in dataset generation / splitting / partitioning is
 * actually reproducible, not just a label. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sigmoid(z: number): number {
  if (z >= 0) {
    const ez = Math.exp(-z)
    return 1 / (1 + ez)
  }
  const ez = Math.exp(z)
  return ez / (1 + ez)
}

export function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

export function initWeights(dim: number): Weights {
  return { w: new Array(dim).fill(0), b: 0 }
}

export function cloneWeights(w: Weights): Weights {
  return { w: [...w.w], b: w.b }
}

export function predictProba(w: Weights, x: number[]): number {
  return sigmoid(dot(w.w, x) + w.b)
}

export function predict(w: Weights, x: number[]): 0 | 1 {
  return predictProba(w, x) >= 0.5 ? 1 : 0
}

export function crossEntropyLoss(w: Weights, X: number[][], y: number[]): number {
  const eps = 1e-12
  let loss = 0
  for (let i = 0; i < X.length; i++) {
    const p = Math.min(1 - eps, Math.max(eps, predictProba(w, X[i])))
    loss += -(y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p))
  }
  return loss / X.length
}

export function accuracy(w: Weights, X: number[][], y: number[]): number {
  if (X.length === 0) return 0
  let correct = 0
  for (let i = 0; i < X.length; i++) if (predict(w, X[i]) === y[i]) correct++
  return correct / X.length
}

/** One full-batch gradient-descent step on binary cross-entropy loss. */
export function gradientStep(w: Weights, X: number[][], y: number[], lr: number): Weights {
  const n = X.length
  const dim = w.w.length
  const gradW = new Array(dim).fill(0)
  let gradB = 0
  for (let i = 0; i < n; i++) {
    const err = predictProba(w, X[i]) - y[i]
    for (let j = 0; j < dim; j++) gradW[j] += err * X[i][j]
    gradB += err
  }
  const newW = w.w.map((wj, j) => wj - (lr * gradW[j]) / n)
  const newB = w.b - (lr * gradB) / n
  return { w: newW, b: newB }
}

/** Per-example gradients (used by DP-SGD for per-example clipping). */
export function perExampleGradients(w: Weights, X: number[][], y: number[]): { gw: number[]; gb: number }[] {
  return X.map((x, i) => {
    const err = predictProba(w, x) - y[i]
    return { gw: x.map((xj) => err * xj), gb: err }
  })
}

export function gradNorm(g: { gw: number[]; gb: number }): number {
  return Math.sqrt(g.gw.reduce((s, v) => s + v * v, 0) + g.gb * g.gb)
}

/** FedAvg aggregation: sample-size-weighted average of client weight vectors. */
export function averageWeights(updates: { weights: Weights; nSamples: number }[]): Weights {
  const total = updates.reduce((s, u) => s + u.nSamples, 0) || 1
  const dim = updates[0].weights.w.length
  const w = new Array(dim).fill(0)
  let b = 0
  for (const u of updates) {
    const frac = u.nSamples / total
    for (let j = 0; j < dim; j++) w[j] += u.weights.w[j] * frac
    b += u.weights.b * frac
  }
  return { w, b }
}

// ── Dataset generation / preparation ───────────────────────────────────

export function generateSyntheticDataset(
  nRows: number,
  nFeatures: number,
  seed: number,
  customCols?: string[],
  customLabelCol?: string
): Dataset {
  const rng = makeRng(seed)
  const cols = customCols && customCols.length > 0
    ? customCols
    : Array.from({ length: nFeatures }, (_, i) => `feature_${i + 1}`)
  const labelCol = customLabelCol && customLabelCol.trim() ? customLabelCol.trim() : 'label'
  const trueW = Array.from({ length: cols.length }, () => rng() * 2 - 1)
  const rows: Record<string, number>[] = []
  for (let i = 0; i < nRows; i++) {
    const row: Record<string, number> = {}
    const x: number[] = []
    for (const c of cols) {
      const u1 = Math.max(rng(), 1e-9)
      const u2 = rng()
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      row[c] = +z.toFixed(4)
      x.push(z)
    }
    const score = dot(trueW, x) + (rng() * 2 - 1) * 0.8 // label noise
    row[labelCol] = score > 0 ? 1 : 0
    rows.push(row)
  }
  return { rows, cols, labelCol }
}

export function minMaxNormalize(rows: Record<string, number>[], featureCols: string[]): [Record<string, number>[], NormStats] {
  const stats: NormStats = {}
  for (const c of featureCols) {
    const vals = rows.map((r) => Number(r[c]) || 0)
    stats[c] = { min: Math.min(...vals), max: Math.max(...vals) }
  }
  const norm = rows.map((r) => {
    const out: Record<string, number> = { ...r }
    for (const c of featureCols) {
      const { min, max } = stats[c]
      const range = max - min
      out[c] = range === 0 ? 0 : (Number(r[c]) - min) / range
    }
    return out
  })
  return [norm, stats]
}

export function applyMinMax(features: Record<string, unknown>, featureCols: string[], stats: NormStats): number[] {
  return featureCols.map((c) => {
    const s = stats[c]
    if (!s) return Number(features[c]) || 0
    const range = s.max - s.min
    const v = Number(features[c]) || 0
    return range === 0 ? 0 : (v - s.min) / range
  })
}

export function toXY(rows: Record<string, number>[], featureCols: string[], labelCol: string): [number[][], number[]] {
  const X = rows.map((r) => featureCols.map((c) => Number(r[c]) || 0))
  const y = rows.map((r) => Number(r[labelCol]) || 0)
  return [X, y]
}

/** Stratified 70/15/15 split — preserves label balance across splits. */
export function stratifiedSplit(
  rows: Record<string, number>[],
  labelCol: string,
  seed = 42
): [Record<string, number>[], Record<string, number>[], Record<string, number>[]] {
  const rng = makeRng(seed)
  const byLabel = new Map<number, Record<string, number>[]>()
  for (const r of rows) {
    const l = Number(r[labelCol]) || 0
    if (!byLabel.has(l)) byLabel.set(l, [])
    byLabel.get(l)!.push(r)
  }
  const train: Record<string, number>[] = []
  const val: Record<string, number>[] = []
  const test: Record<string, number>[] = []
  for (const group of byLabel.values()) {
    const shuffled = shuffle(group, rng)
    const nTrain = Math.floor(shuffled.length * 0.7)
    const nVal = Math.floor(shuffled.length * 0.15)
    train.push(...shuffled.slice(0, nTrain))
    val.push(...shuffled.slice(nTrain, nTrain + nVal))
    test.push(...shuffled.slice(nTrain + nVal))
  }
  return [shuffle(train, rng), shuffle(val, rng), shuffle(test, rng)]
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Partition rows across clients. IID: random even split. Non-IID: a
 * Dirichlet(alpha) draw per label controls how concentrated each label
 * is among clients — standard FL non-IID simulation (lower alpha = more
 * skewed / heterogeneous client data).
 */
export function partitionClients(
  rows: Record<string, number>[],
  labelCol: string,
  nClients: number,
  iid: boolean,
  seed = 1,
  alpha = 0.5
): Record<string, number>[][] {
  const rng = makeRng(seed)
  const clients: Record<string, number>[][] = Array.from({ length: nClients }, () => [])

  if (iid) {
    const shuffled = shuffle(rows, rng)
    shuffled.forEach((r, i) => clients[i % nClients].push(r))
    return clients
  }

  const byLabel = new Map<number, Record<string, number>[]>()
  for (const r of rows) {
    const l = Number(r[labelCol]) || 0
    if (!byLabel.has(l)) byLabel.set(l, [])
    byLabel.get(l)!.push(r)
  }

  for (const group of byLabel.values()) {
    const shuffled = shuffle(group, rng)
    const proportions = sampleDirichlet(nClients, alpha, rng)
    let idx = 0
    proportions.forEach((p, ci) => {
      const count = ci === nClients - 1 ? shuffled.length - idx : Math.round(p * shuffled.length)
      clients[ci].push(...shuffled.slice(idx, idx + count))
      idx += count
    })
  }
  return clients
}

/** Dirichlet(alpha,...,alpha) sample via normalized Gamma draws (Marsaglia-Tsang). */
function sampleDirichlet(k: number, alpha: number, rng: () => number): number[] {
  const samples = Array.from({ length: k }, () => sampleGamma(alpha, rng))
  const sum = samples.reduce((s, v) => s + v, 0) || 1
  return samples.map((v) => v / sum)
}

function sampleGamma(shape: number, rng: () => number): number {
  if (shape < 1) {
    const u = Math.max(rng(), 1e-9)
    return sampleGamma(1 + shape, rng) * Math.pow(u, 1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number, v: number
    do {
      const u1 = Math.max(rng(), 1e-9)
      const u2 = rng()
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) // standard normal
      x = z
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rng()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}
