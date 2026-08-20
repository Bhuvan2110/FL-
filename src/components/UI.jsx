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
