/**
 * Federated learning algorithms, reimplemented from the published specs:
 *  - FedAvg:   McMahan et al. 2017
 *  - FedProx:  Li et al. 2018
 *  - SCAFFOLD: Karimireddy et al. 2020
 *  - Krum:     Blanchard et al. 2017 (Byzantine-robust aggregation)
 *  - DP-SGD:   Abadi et al. 2016 (per-example clipping + Gaussian noise)
 */
import {
  Weights,
  accuracy,
  averageWeights,
  cloneWeights,
  crossEntropyLoss,
  gradNorm,
  gradientStep,
  initWeights,
  perExampleGradients,
  predictProba,
} from './logistic'

export interface RoundInfo {
  round: number
  loss: number
  accuracy: number
  epsilon?: number
}

export type OnRound = (r: RoundInfo) => void

export interface ClientData {
  X: number[][]
  y: number[]
}

export interface TrainResult {
  weights: Weights
}

export function trainCentral(
  X: number[][],
  y: number[],
  valX: number[][],
  valY: number[],
  rounds: number,
  lr: number,
  opts: { onRound?: OnRound } = {}
): TrainResult {
  let w = initWeights(X[0].length)
  for (let r = 1; r <= rounds; r++) {
    w = gradientStep(w, X, y, lr)
    opts.onRound?.({ round: r, loss: crossEntropyLoss(w, valX, valY), accuracy: accuracy(w, valX, valY) })
  }
  return { weights: w }
}

interface FedArgs {
  clients: ClientData[]
  valX: number[][]
  valY: number[]
  rounds: number
  localEpochs: number
  lr: number
  onRound?: OnRound
}

export function trainFedavg(args: FedArgs): TrainResult {
  const dim = args.clients[0].X[0].length
  let global_ = initWeights(dim)

  for (let r = 1; r <= args.rounds; r++) {
    const updates = args.clients.map((c) => {
      let local = cloneWeights(global_)
      for (let e = 0; e < args.localEpochs; e++) local = gradientStep(local, c.X, c.y, args.lr)
      return { weights: local, nSamples: c.X.length }
    })
    global_ = averageWeights(updates)
    args.onRound?.({ round: r, loss: crossEntropyLoss(global_, args.valX, args.valY), accuracy: accuracy(global_, args.valX, args.valY) })
  }
  return { weights: global_ }
}

export function trainFedprox(args: FedArgs & { mu: number }): TrainResult {
  const dim = args.clients[0].X[0].length
  let global_ = initWeights(dim)

  for (let r = 1; r <= args.rounds; r++) {
    const updates = args.clients.map((c) => {
      let local = cloneWeights(global_)
      for (let e = 0; e < args.localEpochs; e++) {
        const grad = gradientStep(local, c.X, c.y, args.lr)
        // Proximal term pulls the local update back toward the global
        // weights: w_new = grad_step_result - lr*mu*(local_before - global)
        local = {
          w: grad.w.map((v, j) => v - args.lr * args.mu * (local.w[j] - global_.w[j])),
          b: grad.b - args.lr * args.mu * (local.b - global_.b),
        }
      }
      return { weights: local, nSamples: c.X.length }
    })
    global_ = averageWeights(updates)
    args.onRound?.({ round: r, loss: crossEntropyLoss(global_, args.valX, args.valY), accuracy: accuracy(global_, args.valX, args.valY) })
  }
  return { weights: global_ }
}

export function trainScaffold(args: FedArgs): TrainResult {
  const dim = args.clients[0].X[0].length
  let global_ = initWeights(dim)
  const c = { w: new Array(dim).fill(0), b: 0 } // global control variate
  const clientControls = args.clients.map(() => ({ w: new Array(dim).fill(0), b: 0 }))

  for (let r = 1; r <= args.rounds; r++) {
    const updates: { weights: Weights; nSamples: number }[] = []
    const controlDeltas: { w: number[]; b: number }[] = []

    args.clients.forEach((client, i) => {
      let local = cloneWeights(global_)
      const ci = clientControls[i]
      const steps = args.localEpochs
      for (let e = 0; e < steps; e++) {
        const grad = gradientStep(local, client.X, client.y, args.lr)
        // SCAFFOLD correction: subtract (c - c_i) scaled by lr from the
        // plain gradient-step update to cancel client drift.
        local = {
          w: grad.w.map((v, j) => v - args.lr * (c.w[j] - ci.w[j])),
          b: grad.b - args.lr * (c.b - ci.b),
        }
      }
      updates.push({ weights: local, nSamples: client.X.length })

      // New local control variate (option II from the paper): c_i_new =
      // c_i - c + (global - local) / (steps * lr)
      const newCi = {
        w: ci.w.map((v, j) => v - c.w[j] + (global_.w[j] - local.w[j]) / (steps * args.lr)),
        b: ci.b - c.b + (global_.b - local.b) / (steps * args.lr),
      }
      controlDeltas.push({ w: newCi.w.map((v, j) => v - ci.w[j]), b: newCi.b - ci.b })
      clientControls[i] = newCi
    })

    global_ = averageWeights(updates)
    // Update global control variate by the average client control delta.
    const n = args.clients.length
    for (let j = 0; j < dim; j++) c.w[j] += controlDeltas.reduce((s, d) => s + d.w[j], 0) / n
    c.b += controlDeltas.reduce((s, d) => s + d.b, 0) / n

    args.onRound?.({ round: r, loss: crossEntropyLoss(global_, args.valX, args.valY), accuracy: accuracy(global_, args.valX, args.valY) })
  }
  return { weights: global_ }
}

/** FedAvg + Krum selection: pick the single client update closest to its
 * neighbors (sum of squared distances to the n-f-2 closest others),
 * discarding the rest — robust to a minority of poisoned/outlier clients. */
export function trainKrum(args: FedArgs): TrainResult {
  const dim = args.clients[0].X[0].length
  let global_ = initWeights(dim)
  const f = Math.max(1, Math.floor(args.clients.length * 0.2)) // assume ~20% could be Byzantine

  for (let r = 1; r <= args.rounds; r++) {
    const locals = args.clients.map((c) => {
      let local = cloneWeights(global_)
      for (let e = 0; e < args.localEpochs; e++) local = gradientStep(local, c.X, c.y, args.lr)
      return local
    })

    const vec = (w: Weights) => [...w.w, w.b]
    const dist2 = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0)
    const vecs = locals.map(vec)
    const n = vecs.length
    const keep = Math.max(1, n - f - 2)

    const scores = vecs.map((v, i) => {
      const dists = vecs.map((v2, j) => (i === j ? Infinity : dist2(v, v2))).sort((a, b) => a - b)
      return dists.slice(0, keep).reduce((s, d) => s + d, 0)
    })
    const bestIdx = scores.indexOf(Math.min(...scores))
    global_ = locals[bestIdx]

    args.onRound?.({ round: r, loss: crossEntropyLoss(global_, args.valX, args.valY), accuracy: accuracy(global_, args.valX, args.valY) })
  }
  return { weights: global_ }
}

/**
 * DP-SGD: per-example gradient clipping to a fixed L2 norm, then Gaussian
 * noise calibrated by noiseMultiplier added to the averaged gradient.
 * Privacy accounting here is the standard *advanced composition* bound
 * (not a tight moments/RDP accountant — same simplified formula the
 * frontend already estimates with in Train.tsx, kept consistent):
 *   epsilon(t) = sqrt(2 * t * ln(1.25/delta)) / noiseMultiplier
 */
export function trainDpsgd(
  X: number[][],
  y: number[],
  valX: number[][],
  valY: number[],
  rounds: number,
  lr: number,
  clipNorm: number,
  noiseMultiplier: number,
  delta: number,
  opts: { onRound?: OnRound } = {}
): TrainResult {
  let w = initWeights(X[0].length)
  const dim = w.w.length

  for (let r = 1; r <= rounds; r++) {
    const grads = perExampleGradients(w, X, y)
    // Clip each example's gradient to clipNorm, then average.
    const clipped = grads.map((g) => {
      const norm = gradNorm(g) || 1e-12
      const scale = Math.min(1, clipNorm / norm)
      return { gw: g.gw.map((v) => v * scale), gb: g.gb * scale }
    })
    const avgGw = new Array(dim).fill(0)
    let avgGb = 0
    for (const g of clipped) {
      for (let j = 0; j < dim; j++) avgGw[j] += g.gw[j]
      avgGb += g.gb
    }
    const n = X.length
    for (let j = 0; j < dim; j++) avgGw[j] /= n
    avgGb /= n

    // Gaussian noise, std = noiseMultiplier * clipNorm / n (per DP-SGD).
    const sigma = (noiseMultiplier * clipNorm) / n
    for (let j = 0; j < dim; j++) avgGw[j] += gaussianNoise() * sigma
    avgGb += gaussianNoise() * sigma

    w = { w: w.w.map((wj, j) => wj - lr * avgGw[j]), b: w.b - lr * avgGb }

    const epsilon = Math.sqrt(2 * r * Math.log(1.25 / delta)) / noiseMultiplier
    opts.onRound?.({ round: r, loss: crossEntropyLoss(w, valX, valY), accuracy: accuracy(w, valX, valY), epsilon })
  }
  return { weights: w }
}

function gaussianNoise(): number {
  const u1 = Math.max(Math.random(), 1e-9)
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

export { predictProba }
