import { Router } from 'express'
import { dbWithToken } from '../db'
import { logAudit, requireAdmin } from '../middleware/auth'
import { RoleUpdateSchema } from '../schemas'

const router = Router()

router.get('/admin', requireAdmin, async (req, res) => {
  const db = dbWithToken(req.user!.token)
  const action = String(req.query.action || 'audit')

  if (action === 'audit') {
    const limit = Number(req.query.limit) || 100
    const { data } = await db.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit)
    return res.json({ logs: data || [], count: (data || []).length })
  }

  if (action === 'users') {
    const { data } = await db.from('profiles').select('*').order('created_at', { ascending: false })
    return res.json({ users: data || [] })
  }

  if (action === 'stats') {
    const { count: totalUsers } = await db.from('profiles').select('id', { count: 'exact', head: true })
    const { count: totalDatasets } = await db.from('datasets').select('id', { count: 'exact', head: true })
    const { data: exps } = await db.from('experiments').select('id, algorithm, status')
    const { count: totalPredictions } = await db.from('predictions').select('id', { count: 'exact', head: true })

    const byAlgo: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    for (const e of exps || []) {
      const algo = String(e.algorithm || 'unknown')
      const status = String(e.status || 'unknown')
      byAlgo[algo] = (byAlgo[algo] || 0) + 1
      byStatus[status] = (byStatus[status] || 0) + 1
    }
    return res.json({
      total_users: totalUsers || 0,
      total_datasets: totalDatasets || 0,
      total_experiments: (exps || []).length,
      total_predictions: totalPredictions || 0,
      experiments_by_algorithm: byAlgo,
      experiments_by_status: byStatus,
    })
  }

  res.status(400).json({ error: 'Unknown action', detail: 'Unknown action' })
})

router.patch('/admin', requireAdmin, async (req, res) => {
  const action = String(req.query.action || '')
  if (action !== 'role') return res.status(400).json({ error: 'Unknown action', detail: 'Unknown action' })

  const parsed = RoleUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message, detail: parsed.error.issues })

  const db = dbWithToken(req.user!.token)
  await db.from('profiles').update({ role: parsed.data.role }).eq('id', parsed.data.user_id)
  await logAudit(req.user!.id, 'role_change', parsed.data.user_id, { new_role: parsed.data.role }, req.user!.token)
  res.json({ updated: true, user_id: parsed.data.user_id, role: parsed.data.role })
})

export default router
