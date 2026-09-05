export function StatCard({ label, value, sub, accent = 'signal' }) {
  const colors = {
    signal: 'text-primary',
    cipher: 'text-primary',
    amber: 'text-encryption-gold',
    mist: 'text-on-surface-variant'
  }
  return (
    <div className="glass-panel rounded-lg p-5 glow-hover transition-all">
      <div className="label text-on-surface-variant mb-1 font-label-caps text-[11px]">{label}</div>
      <div className={`font-headline-lg text-2xl font-bold mt-1 ${colors[accent] || colors.signal}`}>{value}</div>
      {sub && <div className="text-xs text-on-surface-variant/80 mt-1 font-body-sm">{sub}</div>}
    </div>
  )
}

export function EncryptionBadge({ active = true, label }) {
  const text = label || (active ? 'AES-256-GCM Active' : 'Not Encrypted')
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded border text-xs font-code-sm ${
      active
        ? 'border-encryption-gold/30 text-encryption-gold bg-encryption-gold/10 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
        : 'border-outline-variant text-on-surface-variant bg-surface-container-high'
    }`}>
      <span className="material-symbols-outlined text-[14px]">
        {active ? 'lock' : 'lock_open'}
      </span>
      {text}
    </span>
  )
}

export function PageHeader({ title, sub, badge, children }) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-outline-variant pb-6 mb-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">{title}</h1>
          {badge && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-primary/10 text-primary border border-primary/30 text-xs font-label-caps font-bold">
              {badge}
            </span>
          )}
        </div>
        {sub && <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  )
}

export function ErrorBox({ message }) {
  if (!message) return null
  return (
    <div className="text-sm text-alert-red bg-alert-red/10 border border-alert-red/30 rounded-lg px-4 py-3 font-body-sm flex items-center gap-2">
      <span class="material-symbols-outlined text-base">warning</span>
      {message}
    </div>
  )
}

export function GuestNotice({ feature = 'this' }) {
  return (
    <div className="text-sm text-encryption-gold bg-encryption-gold/10 border border-encryption-gold/30 rounded-lg px-4 py-3 font-body-sm flex items-center gap-2">
      <span class="material-symbols-outlined text-base">info</span>
      You're browsing as a guest — sign in to use {feature}.
    </div>
  )
}

export function AlgoBadge({ algo }) {
  const COLORS = {
    central:  '#EF4444',
    fedavg:   '#bbcabe',
    fedprox:  '#bbcabe',
    scaffold: '#60eca8',
    krum:     '#A78BFA',
    dpsgd:    '#F59E0B',
  }
  const LABELS = {
    central: 'Central',
    fedavg:  'FedAvg',
    fedprox: 'FedProx',
    scaffold:'SCAFFOLD',
    krum:    'FedAvg + Krum',
    dpsgd:   'FL + DP-SGD',
  }
  return (
    <span className="font-medium text-sm font-code-sm" style={{ color: COLORS[algo] || '#bbcabe' }}>
      {LABELS[algo] || algo}
    </span>
  )
}

export const ALGO_META = {
  central:  { label: 'Central Training', color: '#EF4444' },
  fedavg:   { label: 'FedAvg',           color: '#bbcabe' },
  fedprox:  { label: 'FedProx',          color: '#3B82F6' },
  scaffold: { label: 'SCAFFOLD',         color: '#60eca8' },
  krum:     { label: 'FedAvg + Krum',    color: '#A78BFA' },
  dpsgd:    { label: 'FL + DP-SGD',      color: '#F59E0B' },
}

