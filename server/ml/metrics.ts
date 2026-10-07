import { Weights, predict, predictProba } from './logistic'

export interface ConfusionMatrix {
  tp: number
  tn: number
  fp: number
  fn: number
}

export function confusionMatrix(w: Weights, X: number[][], y: number[]): ConfusionMatrix {
  const cm: ConfusionMatrix = { tp: 0, tn: 0, fp: 0, fn: 0 }
  for (let i = 0; i < X.length; i++) {
    const p = predict(w, X[i])
    const actual = y[i]
    if (p === 1 && actual === 1) cm.tp++
    else if (p === 0 && actual === 0) cm.tn++
    else if (p === 1 && actual === 0) cm.fp++
    else cm.fn++
  }
  return cm
}

export interface RocPoint {
  fpr: number
  tpr: number
}

export interface RocResult {
  auc: number
  points: RocPoint[]
}

/** ROC curve + AUC via trapezoidal rule, sweeping 101 thresholds. */
export function rocCurve(w: Weights, X: number[][], y: number[]): RocResult {
  const scores = X.map((x) => predictProba(w, x))
  const nPos = y.filter((v) => v === 1).length || 1
  const nNeg = y.length - nPos || 1

  const points: RocPoint[] = []
  for (let i = 0; i <= 100; i++) {
    const threshold = i / 100
    let tp = 0,
      fp = 0
    for (let j = 0; j < scores.length; j++) {
      const pred = scores[j] >= threshold ? 1 : 0
      if (pred === 1 && y[j] === 1) tp++
      else if (pred === 1 && y[j] === 0) fp++
    }
    points.push({ fpr: fp / nNeg, tpr: tp / nPos })
  }
  points.sort((a, b) => a.fpr - b.fpr)

  let auc = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].fpr - points[i - 1].fpr
    const avgY = (points[i].tpr + points[i - 1].tpr) / 2
    auc += dx * avgY
  }
  return { auc, points }
}

export interface ClassificationReport extends ConfusionMatrix {
  accuracy: number
  precision: number
  recall: number
  f1: number
}

export function classificationReport(w: Weights, X: number[][], y: number[]): ClassificationReport {
  const cm = confusionMatrix(w, X, y)
  const total = cm.tp + cm.tn + cm.fp + cm.fn || 1
  const precision = cm.tp / (cm.tp + cm.fp || 1)
  const recall = cm.tp / (cm.tp + cm.fn || 1)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { ...cm, accuracy: (cm.tp + cm.tn) / total, precision, recall, f1 }
}

/**
 * Platt scaling: fit a 1-D logistic regression (A, B) mapping raw decision
 * scores to calibrated probabilities, P(y=1|f) = 1 / (1 + exp(A*f + B)).
 * Fit via simple gradient descent on the calibration set — a standard,
 * well-documented approach (Platt 1999); this is one of the places noted
 * in the project README as an implementation choice rather than a known
 * original value, since the exact original fitting procedure wasn't
 * available to port from.
 */
export function plattScale(rawScores: number[], y: number[], iters = 300, lr = 0.01): { A: number; B: number } {
  let A = 0,
    B = 0
  const n = rawScores.length || 1
  for (let it = 0; it < iters; it++) {
    let gA = 0,
      gB = 0
    for (let i = 0; i < rawScores.length; i++) {
      const f = rawScores[i]
      const p = 1 / (1 + Math.exp(A * f + B))
      const err = p - y[i]
      gA += err * f
      gB += err
    }
    A -= (lr * gA) / n
    B -= (lr * gB) / n
  }
  return { A, B }
}
