import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { StatCard, EncryptionBadge, ALGO_META } from '../components/UI'

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats,  setStats]  = useState(null)
  const [recent, setRecent] = useState([])
  const [loading,setLoading]= useState(true)

  useEffect(() => {
    Promise.all([api.compare.summary(), api.train.experiments()])
      .then(([s, e]) => {
        setStats(s)
        setRecent((e.experiments || []).slice(0, 6))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="glass-panel rounded-lg p-8 relative overflow-hidden glow-hover transition-all">
        <div className="absolute right-0 top-0 h-full w-1/2 opacity-30 pointer-events-none">
          <FLArt />
        </div>
        <div className="relative max-w-lg z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-primary/10 text-primary border border-primary/30 text-xs font-label-caps font-bold mb-4">
            <span className="material-symbols-outlined text-[14px]">terminal</span> Python &middot; FastAPI &middot; Privacy Core
          </div>
          <h1 className="font-headline-xl text-3xl font-extrabold text-on-surface mb-2">
            {profile?.role === 'super_admin' ? 'Root Admin Workspace' : 'Federated Core Workspace'}
          </h1>
          <p className="font-body-md text-on-surface-variant text-sm leading-relaxed mb-6">
            All ML algorithms run server-side in Python — Central, FedAvg, FedProx, SCAFFOLD, DP-SGD.
            Model weights are AES-256-GCM encrypted before saving to cloud storage.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/train" className="btn-primary">
              <span className="material-symbols-outlined text-[18px]">play_arrow</span> Start Training Run
            </Link>
            <Link to="/datasets" className="btn-ghost">
              <span className="material-symbols-outlined text-[18px]">folder_open</span> Manage Datasets
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Datasets"        value={loading ? '—' : stats?.datasets ?? 0}     sub="uploaded or synthetic"   accent="signal" />
        <StatCard label="Experiments"     value={loading ? '—' : stats?.experiments ?? 0}  sub="across 5 algorithms"     accent="signal" />
        <StatCard label="Best Accuracy"   value={loading || !stats?.best_accuracy ? '—' : `${(stats.best_accuracy*100).toFixed(1)}%`} sub="highest recorded" accent="cipher" />
        <StatCard label="Privacy Spent ε" value={loading || !stats?.latest_epsilon ? '—' : stats.latest_epsilon.toFixed(3)} sub="latest DP-SGD run" accent="amber" />
      </div>

      {/* Recent experiments */}
      <div className="glass-panel rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h2 className="font-label-caps text-label-caps text-on-surface font-bold">Recent Experiments</h2>
          <EncryptionBadge />
        </div>
        {recent.length === 0 ? (
          <div className="text-sm text-on-surface-variant text-center py-8 font-body-sm">
            No experiments recorded yet.{' '}
            <Link to="/train" className="text-primary hover:underline font-bold">Run your first training job</Link>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left border-collapse font-code-sm text-sm">
              <thead>
                <tr className="border-b-2 border-outline-variant bg-surface-container-highest">
                  <th className="py-3 px-4 font-label-caps text-label-caps text-on-surface-variant font-semibold">Algorithm</th>
                  <th className="py-3 px-4 font-label-caps text-label-caps text-on-surface-variant font-semibold">Status</th>
                  <th className="py-3 px-4 font-label-caps text-label-caps text-on-surface-variant font-semibold">Started</th>
                  <th className="py-3 px-4 font-label-caps text-label-caps text-on-surface-variant font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {recent.map(e => (
                  <tr key={e.id} className="hover:bg-surface-variant/20 transition-colors">
                    <td className="py-3 px-4 font-medium" style={{ color: ALGO_META[e.algorithm]?.color || '#60eca8' }}>
                      {ALGO_META[e.algorithm]?.label || e.algorithm}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
                        e.status === 'completed' ? 'bg-primary/10 text-primary border border-primary/30' :
                        e.status === 'running'   ? 'bg-encryption-gold/10 text-encryption-gold border border-encryption-gold/30' :
                        e.status === 'failed'    ? 'bg-alert-red/10 text-alert-red border border-alert-red/30' :
                        'bg-surface-variant text-on-surface-variant'
                      }`}>{e.status}</span>
                    </td>
                    <td className="py-3 px-4 text-on-surface-variant text-xs">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      <Link to="/compare" className="text-primary hover:text-primary-fixed text-xs font-bold inline-flex items-center gap-1">
                        View <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Python backend badge */}
      <div className="glass-panel rounded-lg p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-encryption-gold/10 border border-encryption-gold/30 flex items-center justify-center text-encryption-gold font-bold font-code-sm">
            Py
          </div>
          <div>
            <div className="text-sm font-bold text-on-surface font-headline-lg">Python FastAPI Backend Engine</div>
            <div className="text-xs text-on-surface-variant font-body-sm">All ML runs server-side &middot; AES-256-GCM encryption &middot; Multi-Node Distributed Architecture</div>
          </div>
        </div>

        <div className="ml-auto">
          <EncryptionBadge active label="Cryptography Active" />
        </div>
      </div>
    </div>
  )
}

function FLArt() {
  return (
    <svg viewBox="0 0 300 220" className="h-full w-full">
      <circle cx="230" cy="110" r="28" fill="none" stroke="#60eca8" strokeWidth="1.5" opacity="0.7" />
      <text x="230" y="107" textAnchor="middle" fontSize="10" fill="#60eca8" fontFamily="JetBrains Mono">Py</text>
      <text x="230" y="120" textAnchor="middle" fontSize="8" fill="#bbcabe">FastAPI</text>
      {[0,1,2,3].map(i => {
        const y = 28 + i * 55
        return (
          <g key={i}>
            <rect x="18" y={y-12} width="26" height="24" rx="6" fill="#010f1f" stroke="#3d4a41" />
            <text x="31" y={y+4} textAnchor="middle" fontSize="8" fill="#bbcabe">C{i+1}</text>
            <line x1="44" y1={y} x2="202" y2="110" stroke="#3d4a41" strokeWidth="1.5" />
            <circle r="3" fill="#60eca8">
              <animateMotion dur={`${2.2+i*0.3}s`} repeatCount="indefinite"
                path={`M44,${y} L202,110`} />
            </circle>
          </g>
        )
      })}
    </svg>
  )
}

