import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, saveToken, clearToken, hasToken } from '../lib/api'
import type { Profile, Session } from '../types'

interface AuthContextValue {
  session: Session | null | undefined
  user: Session['user'] | null
  profile: Profile | null
  loading: boolean
  isGuest: boolean
  isAdmin: boolean
  signUp: (email: string, password: string) => Promise<{ message: string; user_id: string }>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  continueAsGuest: () => void
}

const AuthCtx = createContext<AuthContextValue | null>(null)
const GUEST_KEY = 'fedshield_guest'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [isGuest, setIsGuest] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    const params = new URLSearchParams(hash.replace('#', ''))
    const hashToken = params.get('access_token')
    if (hashToken) {
      saveToken(hashToken)
      window.history.replaceState(null, '', window.location.pathname)
    }

    if (!hasToken()) {
      localStorage.removeItem(GUEST_KEY)
      setSession(null)
      return
    }

    api.auth
      .me()
      .then((data) => {
        setSession({ user: data.user })
        setProfile(data.profile)
      })
      .catch(() => {
        clearToken()
        setSession(null)
      })
  }, [])

  useEffect(() => {
    if (!session) return
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        signOut()
      }, 30 * 60 * 1000)
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll']
    events.forEach((e) => window.addEventListener(e, resetTimer))
    resetTimer()

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      events.forEach((e) => window.removeEventListener(e, resetTimer))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const continueAsGuest = () => {
    localStorage.setItem(GUEST_KEY, 'true')
    setIsGuest(true)
    setSession({ user: { id: 'guest', email: 'guest@local' } })
    setProfile({ email: 'Guest', role: 'guest' })
  }

  const signUp = async (email: string, password: string) => {
    return api.auth.signUp(email, password)
  }

  const signIn = async (email: string, password: string) => {
    setLoading(true)
    try {
      const data = await api.auth.signIn(email, password)
      saveToken(data.access_token)
      setSession({ user: data.user })
      setProfile(data.profile)
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    if (!isGuest) {
      try {
        await api.auth.signOut()
      } catch {
        // best-effort — we clear local state regardless
      }
    }
    localStorage.removeItem(GUEST_KEY)
    clearToken()
    setIsGuest(false)
    setSession(null)
    setProfile(null)
  }

  const signInWithGoogle = async () => {
    const data = await api.auth.googleUrl()
    window.location.href = data.url
  }

  return (
    <AuthCtx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        isGuest,
        isAdmin: profile?.role === 'admin' || profile?.role === 'super_admin',
        signUp,
        signIn,
        signOut,
        signInWithGoogle,
        continueAsGuest,
      }}
    >
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be within AuthProvider')
  return ctx
}
