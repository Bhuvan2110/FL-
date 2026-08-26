import { createContext, useContext, useEffect, useState } from 'react'
import { api, saveToken, clearToken, hasToken } from '../lib/api'

const AuthCtx = createContext(null)
const GUEST_KEY = 'fedshield_guest'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [isGuest, setIsGuest] = useState(false)

  useEffect(() => {
    // Handle Google OAuth callback — token arrives in URL hash
    const hash   = window.location.hash
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


    api.auth.me()
      .then(data => { setSession({ user: data.user }); setProfile(data.profile) })
      .catch(() => { clearToken(); setSession(null) })
  }, [])

  const continueAsGuest = () => {
    localStorage.setItem(GUEST_KEY, 'true')
    setIsGuest(true)
    setSession({ user: { id: 'guest', email: 'guest@local' } })
    setProfile({ email: 'Guest', role: 'guest' })
  }

  const signUp = async (email, password) => {
    return api.auth.signUp(email, password)
  }

  const signIn = async (email, password) => {
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
      try { await api.auth.signOut() } catch {}
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
    <AuthCtx.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      isGuest,
      isAdmin: profile?.role === 'admin' || profile?.role === 'super_admin',
      signUp, signIn, signOut, signInWithGoogle, continueAsGuest,
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be within AuthProvider')
  return ctx
}
