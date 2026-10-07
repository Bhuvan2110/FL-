import { describe, expect, it } from 'vitest'
import { trainCentral, trainFedavg, trainFedprox, trainScaffold, trainKrum, trainDpsgd } from '../algorithms'
import {
  accuracy,
  crossEntropyLoss,
  generateSyntheticDataset,
  gradientStep,
  initWeights,
  minMaxNormalize,
  partitionClients,
  stratifiedSplit,
  toXY,
} from '../logistic'
import { confusionMatrix, rocCurve } from '../metrics'

function prepared(nRows = 400, nFeatures = 4, seed = 42) {
  const ds = generateSyntheticDataset(nRows, nFeatures, seed)
  const featureCols = ds.cols.filter((c) => c !== ds.labelCol)
  const [normRows] = minMaxNormalize(ds.rows, featureCols)
  const [train, val, test] = stratifiedSplit(normRows, ds.labelCol, seed)
  return { featureCols, labelCol: ds.labelCol, train, val, test }
}

describe('gradientStep', () => {
  it('reduces cross-entropy loss after one step', () => {
    const X = [
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 0],
    ]
    const y = [1, 0, 1, 0]
    const w0 = initWeights(2)
    const lossBefore = crossEntropyLoss(w0, X, y)
    const w1 = gradientStep(w0, X, y, 0.5)
    const lossAfter = crossEntropyLoss(w1, X, y)
    expect(lossAfter).toBeLessThan(lossBefore)
  })
})

describe('trainCentral', () => {
  it('converges to reasonable validation accuracy', () => {
    const { featureCols, labelCol, train, val } = prepared()
    const [X, y] = toXY(train, featureCols, labelCol)
    const [vX, vY] = toXY(val, featureCols, labelCol)
    const result = trainCentral(X, y, vX, vY, 40, 0.6)
    expect(accuracy(result.weights, vX, vY)).toBeGreaterThan(0.6)
  })
})

describe('trainFedavg', () => {
  it('converges across multiple clients', () => {
    const { featureCols, labelCol, train, val } = prepared(300, 4, 7)
    const [vX, vY] = toXY(val, featureCols, labelCol)
    const clientRows = partitionClients(train, labelCol, 3, true, 7)
    const clients = clientRows.map((cr) => {
      const [X, y] = toXY(cr, featureCols, labelCol)
      return { X, y }
    })
    const result = trainFedavg({ clients, valX: vX, valY: vY, rounds: 10, localEpochs: 2, lr: 0.4 })
    expect(accuracy(result.weights, vX, vY)).toBeGreaterThan(0.55)
  })
})

describe('trainFedprox', () => {
  it('runs without error and produces weights', () => {
    const { featureCols, labelCol, train, val } = prepared(200, 4, 3)
    const [vX, vY] = toXY(val, featureCols, labelCol)
    const clientRows = partitionClients(train, labelCol, 2, true, 3)
    const clients = clientRows.map((cr) => {
      const [X, y] = toXY(cr, featureCols, labelCol)
      return { X, y }
    })
    const result = trainFedprox({ clients, valX: vX, valY: vY, rounds: 5, localEpochs: 2, lr: 0.4, mu: 0.05 })
    expect(result.weights.w.length).toBe(featureCols.length)
  })
})

describe('trainScaffold', () => {
  it('runs without error and improves over random-guess accuracy', () => {
    const { featureCols, labelCol, train, val } = prepared(300, 4, 11)
    const [vX, vY] = toXY(val, featureCols, labelCol)
    const clientRows = partitionClients(train, labelCol, 3, true, 11)
    const clients = clientRows.map((cr) => {
      const [X, y] = toXY(cr, featureCols, labelCol)
      return { X, y }
    })
    const result = trainScaffold({ clients, valX: vX, valY: vY, rounds: 10, localEpochs: 2, lr: 0.3 })
    expect(accuracy(result.weights, vX, vY)).toBeGreaterThan(0.5)
  })
})

describe('trainKrum', () => {
  it('selects a single client update and improves over random guess', () => {
    const { featureCols, labelCol, train, val } = prepared(300, 4, 21)
    const [vX, vY] = toXY(val, featureCols, labelCol)
    const clientRows = partitionClients(train, labelCol, 5, true, 21)
    const clients = clientRows.map((cr) => {
      const [X, y] = toXY(cr, featureCols, labelCol)
      return { X, y }
    })
    const result = trainKrum({ clients, valX: vX, valY: vY, rounds: 10, localEpochs: 2, lr: 0.4 })
    expect(accuracy(result.weights, vX, vY)).toBeGreaterThan(0.5)
  })
})

describe('trainDpsgd', () => {
  it('produces weights and a growing epsilon per round', () => {
    const { featureCols, labelCol, train, val } = prepared(300, 4, 5)
    const [X, y] = toXY(train, featureCols, labelCol)
    const [vX, vY] = toXY(val, featureCols, labelCol)
    const epsilons: number[] = []
    const result = trainDpsgd(X, y, vX, vY, 8, 0.3, 1.0, 1.1, 1e-5, {
      onRound: (r) => {
        if (r.epsilon !== undefined) epsilons.push(r.epsilon)
      },
    })
    expect(result.weights.w.length).toBe(featureCols.length)
    expect(epsilons.length).toBe(8)
    // Privacy budget accumulates — later rounds spend more epsilon.
    expect(epsilons[7]).toBeGreaterThan(epsilons[0])
  })
})

describe('confusionMatrix', () => {
  it('counts sum to the total number of examples', () => {
    const { featureCols, labelCol, train } = prepared(120, 3)
    const [X, y] = toXY(train, featureCols, labelCol)
    let w = initWeights(featureCols.length)
    for (let i = 0; i < 10; i++) w = gradientStep(w, X, y, 0.3)
    const cm = confusionMatrix(w, X, y)
    expect(cm.tp + cm.tn + cm.fp + cm.fn).toBe(X.length)
  })
})

describe('rocCurve', () => {
  it('reports AUC above chance on separable data', () => {
    const { featureCols, labelCol, train, test } = prepared(250, 4, 99)
    const [X, y] = toXY(train, featureCols, labelCol)
    const [tX, tY] = toXY(test, featureCols, labelCol)
    let w = initWeights(featureCols.length)
    for (let i = 0; i < 25; i++) w = gradientStep(w, X, y, 0.4)
    const roc = rocCurve(w, tX, tY)
    expect(roc.auc).toBeGreaterThan(0.5)
  })
})

describe('partitionClients', () => {
  it('IID partition preserves total row count', () => {
    const { featureCols: _fc, labelCol, train } = prepared(100)
    const clientRows = partitionClients(train, labelCol, 4, true, 1)
    const total = clientRows.reduce((s, c) => s + c.length, 0)
    expect(total).toBe(train.length)
  })

  it('non-IID partition also preserves total row count', () => {
    const { labelCol, train } = prepared(150, 4, 2)
    const clientRows = partitionClients(train, labelCol, 4, false, 2, 0.3)
    const total = clientRows.reduce((s, c) => s + c.length, 0)
    expect(total).toBe(train.length)
  })
})
