import { Router } from 'express'
import { writeDbFor } from '../db'
import { logAudit, requireAuth } from '../middleware/auth'

const router = Router()

router.get('/experiments', requireAuth, async (req, res) => {
  const db = writeDbFor(req.user!.token)
  const roundsId = req.query.rounds ? String(req.query.rounds) : ''

  if (roundsId) {
    const { data: exp } = await db.from('experiments').select('user_id').eq('id', roundsId)
    if (!exp || !exp[0] || exp[0].user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorised', detail: 'Not authorised' })
    }
    const { data } = await db.from('rounds').select('*').eq('experiment_id', roundsId).order('round_num')
    return res.json({ rounds: data || [] })
  }

  const { data } = await db.from('experiments').select('*').eq('user_id', req.user!.id).order('created_at', { ascending: false })
  res.json({ experiments: data || [] })
})

router.delete('/experiments', requireAuth, async (req, res) => {
  const id = String(req.query.delete || '')
  if (!id) return res.status(400).json({ error: 'Missing experiment id', detail: 'Missing experiment id' })

  const db = writeDbFor(req.user!.token)
  const { data: exp } = await db.from('experiments').select('id, user_id, algorithm').eq('id', id)
  if (!exp || !exp[0]) return res.status(404).json({ error: 'Experiment not found', detail: 'Experiment not found' })
  if (exp[0].user_id !== req.user!.id) return res.status(403).json({ error: 'Not authorised', detail: 'Not authorised' })

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
