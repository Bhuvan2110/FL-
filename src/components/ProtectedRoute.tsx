import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-950">
        <div className="text-mist-500 text-sm font-mono animate-pulseline">connecting…</div>
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin, session } = useAuth()
  if (session === undefined) return null
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}
