import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children }) {
  const { session } = useAuth()
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-950">
        <div className="text-mist-500 text-sm font-mono animate-pulseline">connecting to FastAPI…</div>
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return children
}

export function AdminRoute({ children }) {
  const { isAdmin, session } = useAuth()
  if (session === undefined) return null
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}
