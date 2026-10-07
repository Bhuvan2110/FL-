import { Router } from 'express'
import { writeDbFor } from '../db'
import { getProfile, logAudit, requireAuth } from '../middleware/auth'

const router = Router()

async function isAdmin(userId: string, token: string): Promise<boolean> {
  const profile = await getProfile(userId, token)
  return profile.role === 'admin' || profile.role === 'super_admin'
}

router.get('/compare', requireAuth, async (req, res) => {
  const db = writeDbFor(req.user!.token)
  const admin = await isAdmin(req.user!.id, req.user!.token)

  if (req.query.summary === 'true') {
    const { count: dsCount } = await db.from('datasets').select('id', { count: 'exact', head: true }).eq('user_id', req.user!.id)
    const { count: expCount } = await db.from('experiments').select('id', { count: 'exact', head: true }).eq('user_id', req.user!.id)
    const { data: metricsRows } = await db.from('metrics').select('accuracy')
    const { data: privacyRows } = await db.from('privacy_budget').select('epsilon').order('created_at', { ascending: false }).limit(1)

    const accuracies = (metricsRows || []).map((m: { accuracy: number }) => m.accuracy).filter((a: number) => typeof a === 'number')
    const bestAcc = accuracies.length ? Math.max(...accuracies) : null
    const latestEps = privacyRows && privacyRows[0] ? privacyRows[0].epsilon : null

    return res.json({
      datasets: dsCount || 0,
      experiments: expCount || 0,
      best_accuracy: bestAcc !== null ? Math.round(bestAcc * 10000) / 10000 : null,
      latest_epsilon: latestEps !== null ? Math.round(latestEps * 10000) / 10000 : null,
    })
  }

  const roundsId = req.query.rounds ? String(req.query.rounds) : ''
  if (roundsId) {
    const { data: exp } = await db.from('experiments').select('user_id').eq('id', roundsId)
    if (!exp || !exp[0]) return res.status(404).json({ error: 'Not found', detail: 'Not found' })
    if (exp[0].user_id !== req.user!.id && !admin) return res.status(403).json({ error: 'Not authorised', detail: 'Not authorised' })
    const { data } = await db.from('rounds').select('*').eq('experiment_id', roundsId).order('round_num')
    return res.json({ rounds: data || [] })
  }

  let query = db.from('experiments').select('*').eq('status', 'completed').order('created_at', { ascending: false })
  if (!(req.query.admin_view === 'true' && admin)) query = query.eq('user_id', req.user!.id)
  const { data: experiments } = await query
  if (!experiments || !experiments.length) return res.json({ experiments: [], metrics: [], privacy: [] })

  const ids = experiments.map((e: { id: string }) => e.id)
  const { data: metrics } = await db.from('metrics').select('*').in('experiment_id', ids)
  const { data: privacy } = await db.from('privacy_budget').select('*').in('experiment_id', ids).order('round_num')
  res.json({ experiments, metrics: metrics || [], privacy: privacy || [] })
})

router.delete('/compare', requireAuth, async (req, res) => {
  const id = String(req.query.delete || '')
  if (!id) return res.status(400).json({ error: 'Missing experiment id', detail: 'Missing experiment id' })

  const db = writeDbFor(req.user!.token)
  const { data: exp } = await db.from('experiments').select('id, user_id, algorithm').eq('id', id)
  if (!exp || !exp[0]) return res.status(404).json({ error: 'Experiment not found', detail: 'Experiment not found' })
  if (exp[0].user_id !== req.user!.id && !(await isAdmin(req.user!.id, req.user!.token))) {
    return res.status(403).json({ error: 'Not authorised', detail: 'Not authorised' })
  }

  const { data: models } = await db.from('models').select('id').eq('experiment_id', id)
  const modelIds = (models || []).map((m: { id: string }) => m.id)
  if (modelIds.length) await db.from('predictions').delete().in('model_id', modelIds)
  for (const table of ['rounds', 'metrics', 'privacy_budget', 'models']) {
    await db.from(table).delete().eq('experiment_id', id)
  }
  await db.from('experiments').delete().eq('id', id)

  await logAudit(req.user!.id, 'experiment_delete', exp[0].algorithm || '', {}, req.user!.token)
  res.json({ deleted: true, experiment_id: id })
})

export default router
