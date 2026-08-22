import { useEffect } from 'react'

export function StatCard({ label, value, sub, accent = 'signal' }) {
  const colors = { signal: 'text-signal-400', cipher: 'text-cipher-400', amber: 'text-amber-400', mist: 'text-mist-300' }
  return (
    <div className="panel p-5">
      <div className="label mb-1.5">{label}</div>
      <div className={`font-display text-2xl font-semibold mt-1 ${colors[accent] || colors.signal}`}>{value}</div>
      {sub && <div className="text-xs text-mist-500 mt-1">{sub}</div>}
    </div>
  )
}

export function EncryptionBadge({ active = true, label }) {
  const text = label || (active ? 'AES-256-GCM active' : 'not encrypted')
  return (
    <span className={`badge ${active ? 'border-cipher-500/40 text-cipher-400 bg-cipher-500/10' : 'border-mist-700 text-mist-500'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-cipher-400 animate-pulseline' : 'bg-mist-700'}`} />
      {text}
    </span>
  )
}

export function PageHeader({ title, sub, badge, children }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {badge && <span className="badge border-signal-500/30 text-signal-400 bg-signal-500/10">{badge}</span>}
        </div>
        {sub && <p className="text-mist-500 text-sm">{sub}</p>}
      </div>
      {children && <div className="flex gap-3">{children}</div>}
    </div>
  )
}

export function ErrorBox({ message }) {
  if (!message) return null
  return <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{message}</div>
}

export function AlgoBadge({ algo }) {
  const COLORS = {
    central:  '#7C879A', fedavg: '#6C7CFF', fedprox: '#4FE3C1',
    scaffold: '#F2A94E', dpsgd: '#F0618C',
  }
  const LABELS = {
    central: 'Central', fedavg: 'FedAvg', fedprox: 'FedProx',
    scaffold: 'SCAFFOLD', dpsgd: 'DP-SGD',
  }
  return (
    <span className="font-medium text-sm" style={{ color: COLORS[algo] || '#7C879A' }}>
      {LABELS[algo] || algo}
    </span>
  )
}

export const ALGO_META = {
  central:  { label: 'Central Training', color: '#7C879A' },
  fedavg:   { label: 'FedAvg',           color: '#6C7CFF' },
  fedprox:  { label: 'FedProx',          color: '#4FE3C1' },
  scaffold: { label: 'SCAFFOLD',         color: '#F2A94E' },
  dpsgd:    { label: 'FL + DP-SGD',      color: '#F0618C' },
}

export function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={`${sizes[size]} border-2 border-signal-500/30 border-t-signal-400 rounded-full animate-spin`} />
    </div>
  )
}

export function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  const colors = {
    info: 'bg-signal-500/10 border-signal-500/30 text-signal-400',
    success: 'bg-cipher-500/10 border-cipher-500/30 text-cipher-400',
    error: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  }

  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' }

  return (
    <div className={`fixed bottom-4 right-4 max-w-sm px-4 py-3 rounded-xl border flex items-center gap-3 shadow-lg ${colors[type]}`}>
      <span>{icons[type]}</span>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-auto opacity-60 hover:opacity-100">×</button>
    </div>
  )
}
