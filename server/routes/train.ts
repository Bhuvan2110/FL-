import { Router } from 'express'
import { getConfig } from '../config'
import { encryptJson, modelPassphrase } from '../core/encryption'
import { writeDbFor } from '../db'
import { logAudit, requireAuth } from '../middleware/auth'
import { RoundInfo, trainCentral, trainDpsgd, trainFedavg, trainFedprox, trainKrum, trainScaffold } from '../ml/algorithms'
import { dot, minMaxNormalize, partitionClients, predictProba, stratifiedSplit, toXY } from '../ml/logistic'
import { classificationReport, plattScale, rocCurve } from '../ml/metrics'
import { TrainSchema } from '../schemas'

const router = Router()

router.post('/train', requireAuth, async (req, res) => {
  const parsed = TrainSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message, detail: parsed.error.issues })
  const body = parsed.data

  const db = writeDbFor(req.user!.token)
  let expId = ''

  try {
    const rounds = Math.min(body.rounds, getConfig().maxTrainingRounds)

    const { data: dsRows } = await db.from('datasets').select('*').eq('id', body.dataset_id).eq('user_id', req.user!.id)
    if (!dsRows || !dsRows[0]) return res.status(404).json({ error: 'Dataset not found', detail: 'Dataset not found' })
    const dsMeta = dsRows[0]

    const { data: raw } = await db.storage.from('datasets').download(dsMeta.storage_path)
    const text = await raw!.text()
    let rows: Record<string, number>[]
    let labelCol: string = dsMeta.label_col || 'label'

    if (String(dsMeta.storage_path).endsWith('.json')) {
      const parsedJson = JSON.parse(text)
      rows = parsedJson.rows || []
      labelCol = parsedJson.label_col || parsedJson.labelCol || dsMeta.label_col || 'label'
    } else {
      const lines = text.trim().split(/\r?\n/)
      const headers = lines[0].split(',').map((h) => h.trim())
      rows = lines.slice(1).filter(Boolean).map((line) => {
        const cells = line.split(',')
        const row: Record<string, number> = {}
        headers.forEach((h, i) => {
          row[h] = Number(cells[i]) || 0
        })
        return row
      })
    }

    const featureCols = Object.keys(rows[0] || {}).filter((c) => c !== labelCol)
    const runSeed = Math.floor(Math.random() * 99999)

    const [normRows, normStats] = minMaxNormalize(rows, featureCols)
    const [trainRows, valRows, testRows] = stratifiedSplit(normRows, labelCol, runSeed)

    const cfg = { ...body, run_seed: runSeed, rounds }
    const { data: expRows } = await db
      .from('experiments')
      .insert({ user_id: req.user!.id, dataset_id: body.dataset_id, algorithm: body.algorithm, status: 'running', config: cfg })
      .select()
    expId = String((expRows && expRows[0] && expRows[0].id) || '')

    const [valX, valY] = toXY(valRows, featureCols, labelCol)
    const [testX, testY] = toXY(testRows, featureCols, labelCol)

    const roundBuffer: RoundInfo[] = []
    const privacyBuffer: { round: number; epsilon: number }[] = []
    const onRound = (r: RoundInfo) => {
      roundBuffer.push(r)
      if (r.epsilon !== undefined) privacyBuffer.push({ round: r.round, epsilon: r.epsilon })
    }

    let weights
    if (body.algorithm === 'central') {
      const [X, y] = toXY(trainRows, featureCols, labelCol)
      weights = trainCentral(X, y, valX, valY, rounds, body.lr, { onRound }).weights
    } else if (body.algorithm === 'dpsgd') {
      const [X, y] = toXY(trainRows, featureCols, labelCol)
      weights = trainDpsgd(X, y, valX, valY, rounds, body.lr, body.clip_norm, body.noise_multiplier, body.delta, { onRound }).weights
    } else {
      const clientRows = partitionClients(trainRows, labelCol, body.num_clients, body.iid, runSeed, body.alpha ?? 0.5)
      const clients = clientRows.map((cr) => {
        const [cx, cy] = toXY(cr, featureCols, labelCol)
        return { X: cx, y: cy }
      })
      const fedArgs = { clients, valX, valY, rounds, localEpochs: body.local_epochs, lr: body.lr, onRound }
      if (body.algorithm === 'fedavg') weights = trainFedavg(fedArgs).weights
      else if (body.algorithm === 'fedprox') weights = trainFedprox({ ...fedArgs, mu: body.mu }).weights
      else if (body.algorithm === 'scaffold') weights = trainScaffold(fedArgs).weights
      else weights = trainKrum(fedArgs).weights // krum
    }

    if (roundBuffer.length) {
      await db.from('rounds').insert(roundBuffer.map((r) => ({ experiment_id: expId, round_num: r.round, loss: r.loss, accuracy: r.accuracy })))
    }
    if (privacyBuffer.length) {
      await db.from('privacy_budget').insert(privacyBuffer.map((p) => ({ experiment_id: expId, round_num: p.round, epsilon: p.epsilon, delta: body.delta })))
    }

    const report = classificationReport(weights, testX, testY)
    const roc = rocCurve(weights, testX, testY)
    const rawScores = testX.map((x) => dot(weights.w, x) + weights.b)
    const platt = plattScale(rawScores, testY)

    await db.from('metrics').insert({
      experiment_id: expId,
      model_label: body.algorithm,
      accuracy: report.accuracy,
      f1: report.f1,
      auc: roc.auc,
      precision_score: report.precision,
      recall: report.recall,
    })

    const passphrase = modelPassphrase(req.user!.id, expId)
    const { ciphertext, iv } = encryptJson({ weights, feature_cols: featureCols, label_col: labelCol, norm_stats: normStats, platt }, passphrase)
    await db.from('models').insert({ experiment_id: expId, encrypted_weights: ciphertext, iv, version: 1 })

    await db.from('experiments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', expId)
    await logAudit(req.user!.id, 'experiment_complete', body.algorithm, { accuracy: report.accuracy, experiment_id: expId }, req.user!.token)

    const maxAcc = roundBuffer.length ? Math.max(...roundBuffer.map((r) => r.accuracy)) : 0
    const targetAcc = 0.8 * maxAcc
    const convRound = roundBuffer.find((r) => targetAcc > 0 && r.accuracy >= targetAcc)?.round ?? null
    const areaAcc = Math.round(roundBuffer.reduce((s, r) => s + r.accuracy, 0) * 10000) / 10000

    res.json({
      experiment_id: expId,
      algorithm: body.algorithm,
      status: 'completed',
      metrics: { ...report, auc: roc.auc, conv_round: convRound, area_acc: areaAcc },
      roc: roc.points.slice(0, 20),
      privacy: privacyBuffer,
      history: roundBuffer,
    })
  } catch (e) {
    if (expId) {
      try {
        await db.from('experiments').update({ status: 'failed' }).eq('id', expId)
      } catch {
        // best-effort
      }
    }
    res.status(500).json({ error: String((e as Error).message || e) })
  }
})

export default router
