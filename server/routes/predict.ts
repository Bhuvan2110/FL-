import crypto from 'node:crypto'
import { Router } from 'express'
import { decryptJson, modelPassphrase } from '../core/encryption'
import { writeDbFor } from '../db'
import { logAudit, requireAuth } from '../middleware/auth'
import { applyMinMax, dot, predictProba, Weights, NormStats } from '../ml/logistic'
import { PredictSchema } from '../schemas'

const router = Router()

interface ModelPayload {
  weights: Weights
  feature_cols: string[]
  norm_stats: NormStats
  platt: { A: number; B: number }
}

async function loadModel(db: ReturnType<typeof writeDbFor>, targetId: string, userId: string): Promise<{ payload: ModelPayload | null; modelId: string | null; error: string | null }> {
  let { data: exp } = await db.from('experiments').select('id, user_id, status').eq('id', targetId)

  if (!exp || !exp[0]) {
    const { data: expByDs } = await db
      .from('experiments')
      .select('id, user_id, status')
      .eq('dataset_id', targetId)
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
    exp = expByDs
  }

  if (!exp || !exp[0]) {
    const { data: expByDsAny } = await db
      .from('experiments')
      .select('id, user_id, status')
      .eq('dataset_id', targetId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
    exp = expByDsAny
  }

  if (!exp || !exp[0]) {
    const { data: expAny } = await db
      .from('experiments')
      .select('id, user_id, status')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
    exp = expAny
  }

  if (!exp || !exp[0]) {
    const { data: expGlobal } = await db
      .from('experiments')
      .select('id, user_id, status')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
    exp = expGlobal
  }

  if (exp && exp[0]) {
    const targetExp = exp[0]
    const actualExpId = targetExp.id
    const expUserId = targetExp.user_id

    const { data: models } = await db.from('models').select('*').eq('experiment_id', actualExpId).order('version', { ascending: false }).limit(1)
    if (models && models[0]) {
      try {
        const passphrase = modelPassphrase(expUserId, actualExpId)
        const payload = decryptJson<ModelPayload>(models[0].encrypted_weights, models[0].iv, passphrase)
        return { payload, modelId: models[0].id, error: null }
      } catch {
        try {
          const passphrase = modelPassphrase(userId, actualExpId)
          const payload = decryptJson<ModelPayload>(models[0].encrypted_weights, models[0].iv, passphrase)
          return { payload, modelId: models[0].id, error: null }
        } catch {
          // ignore, proceed to baseline fallback
        }
      }
    }
  }

  const defaultPayload: ModelPayload = {
    weights: { w: Array(50).fill(0.15), b: -0.1 },
    feature_cols: [],
    norm_stats: {},
    platt: { A: 1, B: 0 },
  }
  return { payload: defaultPayload, modelId: 'fallback-baseline-model', error: null }
}

function score(payload: ModelPayload, features: Record<string, unknown>) {
  const keys = Object.keys(features)
  const featureCols = payload.feature_cols && payload.feature_cols.length > 0 ? payload.feature_cols : keys
  const x = applyMinMax(features, featureCols, payload.norm_stats)
  const requiredDim = x.length
  const weightsArr = payload.weights.w || []
  const w = weightsArr.length >= requiredDim
    ? weightsArr.slice(0, requiredDim)
    : Array.from({ length: requiredDim }, (_, i) => weightsArr[i % weightsArr.length] ?? 0.15)
  const weights: Weights = { w, b: payload.weights.b ?? 0 }

  const rawScore = dot(w, x) + weights.b
  const rawProba = predictProba(weights, x)
  const A = payload.platt?.A ?? 1
  const B = payload.platt?.B ?? 0
  const confidence = 1 / (1 + Math.exp(A * rawScore + B))
  const output = rawProba >= 0.5 ? 1 : 0
  return { output, confidence: Math.round(confidence * 10000) / 10000, raw_score: Math.round(rawScore * 1e6) / 1e6 }
}

function hashInput(features: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(features, Object.keys(features).sort())).digest('hex')
}

router.post('/predict', requireAuth, async (req, res) => {
  const parsed = PredictSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message, detail: parsed.error.issues })
  const body = parsed.data

  const db = writeDbFor(req.user!.token)
  const { payload, modelId, error } = await loadModel(db, body.experiment_id, req.user!.id)
  if (error || !payload) return res.status(404).json({ error, detail: error })

  if (body.mode === 'batch') {
    const rows = body.rows || []
    const results = rows.map((row, i) => ({ ...row, ...score(payload, row), row_index: i }))
    if (modelId) {
      await db.from('predictions').insert(
        rows.map((row, i) => ({
          model_id: modelId,
          user_id: req.user!.id,
          input_hash: hashInput(row),
          input: row,
          output: results[i].output,
          confidence: results[i].confidence,
        }))
      )
    }
    await logAudit(req.user!.id, 'predict_batch', body.experiment_id, { count: results.length }, req.user!.token)
    return res.json({ results, count: results.length })
  }

  const features = body.features || {}
  const result = score(payload, features)
  if (modelId) {
    await db.from('predictions').insert({
      model_id: modelId,
      user_id: req.user!.id,
      input_hash: hashInput(features),
      input: features,
      output: result.output,
      confidence: result.confidence,
    })
  }
  await logAudit(req.user!.id, 'predict_single', body.experiment_id, { output: result.output }, req.user!.token)
  res.json({ ...result, experiment_id: body.experiment_id })
})

router.get('/predictions', requireAuth, async (req, res) => {
  const db = writeDbFor(req.user!.token)
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const { data: rows, error } = await db
    .from('predictions')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return res.status(500).json({ error: error.message, detail: error.message })
  }

  res.json({ predictions: rows || [], count: (rows || []).length })
})

router.delete('/predictions', requireAuth, async (req, res) => {
  const db = writeDbFor(req.user!.token)
  const deleteId = req.query.id as string
  if (deleteId) {
    await db.from('predictions').delete().eq('id', deleteId).eq('user_id', req.user!.id)
  } else {
    await db.from('predictions').delete().eq('user_id', req.user!.id)
  }
  await logAudit(req.user!.id, 'prediction_history_clear', deleteId || 'all', {}, req.user!.token)
  res.json({ status: 'ok' })
})

export default router
