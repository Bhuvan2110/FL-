import { Router } from 'express'
import { getConfig } from '../config'
import { getAnonDb, getServiceDb, writeDbFor } from '../db'
import { logAudit, requireAuth } from '../middleware/auth'
import { SigninSchema, SignupSchema } from '../schemas'

const router = Router()

function roleFor(email: string): string {
  return getConfig().superAdminEmails.has(email.toLowerCase()) ? 'super_admin' : 'user'
}

async function ensureProfile(writeDb: ReturnType<typeof writeDbFor>, userId: string, email: string) {
  const { data } = await writeDb.from('profiles').select('*').eq('id', userId).limit(1)
  if (data && data[0]) return data[0]
  const role = roleFor(email)
  const { data: created } = await writeDb.from('profiles').insert({ id: userId, email, role }).select()
  return (created && created[0]) || { id: userId, email, role }
}

router.post('/auth/signup', async (req, res) => {
  const parsed = SignupSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message, detail: parsed.error.issues })

  const db = getAnonDb()
  const { data, error } = await db.auth.signUp({ email: parsed.data.email, password: parsed.data.password })
  if (error || !data.user) return res.status(400).json({ error: error?.message || 'Signup failed', detail: error?.message })

  const writeDb = writeDbFor('')
  await writeDb.from('profiles').upsert({ id: data.user.id, email: parsed.data.email, role: roleFor(parsed.data.email) })

  res.json({ message: 'Account created. Sign in now.', user_id: data.user.id })
})

router.post('/auth/signin', async (req, res) => {
  const parsed = SigninSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message, detail: parsed.error.issues })

  const db = getAnonDb()
  const { data, error } = await db.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password })
  if (error || !data.user || !data.session) {
    return res.status(401).json({ error: error?.message || 'Invalid email or password', detail: error?.message })
  }

  const token = data.session.access_token
  const writeDb = writeDbFor(token)
  const profile = await ensureProfile(writeDb, data.user.id, parsed.data.email)
  await logAudit(data.user.id, 'login', 'auth', {}, token)

  res.json({
    access_token: token,
    token_type: 'bearer',
    user: { id: data.user.id, email: data.user.email },
    profile,
  })
})

router.post('/auth/signout', requireAuth, async (req, res) => {
  try {
    // Revoking a specific token server-side requires the admin API
    // (service-role client). Without a service role key configured,
    // sign-out is a client-side no-op — the frontend clears its stored
    // token regardless, which is what actually ends the session for the
    // browser.
    const svc = getServiceDb()
    if (svc) await svc.auth.admin.signOut(req.user!.token)
  } catch {
    // best-effort
  }
  res.json({ message: 'Signed out successfully' })
})

router.get('/auth/me', requireAuth, async (req, res) => {
  const writeDb = writeDbFor(req.user!.token)
  const profile = await ensureProfile(writeDb, req.user!.id, req.user!.email)
  res.json({ user: { id: req.user!.id, email: req.user!.email }, profile })
})

router.get('/auth/google', async (_req, res) => {
  // See note in google_start's Python predecessor: Supabase for this
  // project uses OAuth *implicit* flow — the session token comes back in
  // the URL fragment (#access_token=...), which only client-side JS can
  // ever read. redirect_to MUST point at the frontend, never this
  // backend. The frontend's AuthContext already parses #access_token on
  // mount, which is what actually completes sign-in.
  const cfg = getConfig()
  const redirectUri = `${cfg.frontendUrl.replace(/\/$/, '')}/auth/callback`

  const db = getAnonDb()
  const { data, error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectUri, scopes: 'openid email profile', skipBrowserRedirect: true },
  })
  if (error || !data.url) return res.status(500).json({ error: error?.message || 'OAuth start failed', detail: error?.message })
  res.json({ url: data.url })
})

router.get('/auth/callback', async (req, res) => {
  // Kept for a project that switches Supabase's Google provider to PKCE
  // (authorization-code) flow in the future — NOT used by the current
  // implicit-flow setup, since redirect_to now points at the frontend.
  const code = String(req.query.code || '')
  if (!code) return res.status(400).json({ error: 'Missing OAuth code', detail: 'Missing OAuth code' })

  const db = getAnonDb()
  const { data, error } = await db.auth.exchangeCodeForSession(code)
  if (error || !data.session) return res.status(400).json({ error: error?.message || 'OAuth code exchange failed', detail: error?.message })

  const token = data.session.access_token
  const writeDb = writeDbFor(token)
  await ensureProfile(writeDb, data.user!.id, data.user!.email ?? '')
  await logAudit(data.user!.id, 'google_login', 'auth', {}, token)

  const cfg = getConfig()
  res.redirect(302, `${cfg.frontendUrl.replace(/\/$/, '')}/login#access_token=${token}`)
})

export default router
