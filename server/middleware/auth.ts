import type { NextFunction, Request, Response } from 'express'
import { dbWithToken, getServiceDb, writeDbFor } from '../db'

export interface CurrentUser {
  id: string
  email: string
  token: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: CurrentUser
    }
  }
}

function bearerToken(req: Request): string {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

/** Populates req.user if a valid Bearer token is present; never rejects
 * the request itself. Use requireAuth for routes that must reject. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = bearerToken(req)
  if (!token) return next()
  try {
    const db = getServiceDb() ?? dbWithToken(token)
    const { data, error } = await db.auth.getUser(token)
    if (!error && data.user) {
      req.user = { id: data.user.id, email: data.user.email ?? '', token }
    }
  } catch {
    // leave req.user unset
  }
  next()
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearerToken(req)
  if (!token) return res.status(401).json({ error: 'Not authenticated', detail: 'Not authenticated' })
  try {
    const db = getServiceDb() ?? dbWithToken(token)
    const { data, error } = await db.auth.getUser(token)
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired token', detail: 'Invalid or expired token' })
    }
    req.user = { id: data.user.id, email: data.user.email ?? '', token }
    next()
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token', detail: String(e) })
  }
}

export async function getProfile(userId: string, token: string): Promise<{ role?: string } & Record<string, unknown>> {
  const db = dbWithToken(token)
  const { data } = await db.from('profiles').select('*').eq('id', userId).limit(1)
  return (data && data[0]) || {}
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const profile = await getProfile(req.user!.id, req.user!.token)
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required', detail: 'Admin access required' })
    }
    next()
  })
}

/** Best-effort audit log write — never throws; a failed audit write must
 * not fail the request it's auditing. */
export async function logAudit(userId: string, action: string, resource = '', detail: Record<string, unknown> = {}, token = '') {
  try {
    const db = getServiceDb() ?? writeDbFor(token)
    await db.from('audit_logs').insert({ user_id: userId, action, resource, detail })
  } catch {
    // swallow — audit logging is best-effort
  }
}
