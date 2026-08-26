import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { StatCard, EncryptionBadge, ALGO_META } from '../components/UI'

export default function Dashboard() {
  const { user, profile } = useAuth()
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
    <div className="space-y-8">
      {/* Hero */}
      <div className="panel panel-glow p-8 relative overflow-hidden">
        <div className="absolute right-0 top-0 h-full w-1/2 opacity-50 pointer-events-none">
          <FLArt />
        </div>
        <div className="relative max-w-lg">
          <div className="badge border-signal-500/30 text-signal-400 bg-signal-500/10 mb-4">
            Python · FastAPI · Supabase
          </div>
          <h1 className="text-2xl font-semibold mb-2">
            {profile?.role === 'super_admin' ? 'Super Admin workspace' : 'Research workspace'}
          </h1>
          <p className="text-mist-500 text-sm leading-relaxed mb-6">
            All ML algorithms run server-side in Python — Central, FedAvg, FedProx, SCAFFOLD, DP-SGD.
            Model weights are AES-256-GCM encrypted before storing in Supabase. Sign in with Google or email.
          </p>
          <div className="flex gap-3">
            <Link to="/train"    className="btn-primary">Start training run</Link>
            <Link to="/datasets" className="btn-ghost">Manage datasets</Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Datasets"        value={loading ? '—' : stats?.datasets ?? 0}     sub="uploaded or synthetic"   accent="signal" />
        <StatCard label="Experiments"     value={loading ? '—' : stats?.experiments ?? 0}  sub="across 5 algorithms"     accent="signal" />
        <StatCard label="Best accuracy"   value={loading || !stats?.best_accuracy ? '—' : `${(stats.best_accuracy*100).toFixed(1)}%`} sub="highest recorded" accent="cipher" />
        <StatCard label="Privacy spent ε" value={loading || !stats?.latest_epsilon ? '—' : stats.latest_epsilon.toFixed(3)} sub="latest DP-SGD run" accent="amber" />
      </div>

      {/* Recent experiments */}
      <div className="panel p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h2 className="text-base font-semibold">Recent experiments</h2>
          <EncryptionBadge />
        </div>
        {recent.length === 0 ? (
          <div className="text-sm text-mist-500 text-center py-8">
            No experiments yet.{' '}
            <Link to="/train" className="text-signal-400 hover:text-signal-300">Run your first training job</Link>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="data-table">
              <thead><tr><th>Algorithm</th><th>Status</th><th>Started</th><th></th></tr></thead>
              <tbody>
                {recent.map(e => (
                  <tr key={e.id}>
                    <td className="font-medium whitespace-nowrap" style={{ color: ALGO_META[e.algorithm]?.color }}>
                      {ALGO_META[e.algorithm]?.label || e.algorithm}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={`badge ${
                        e.status === 'completed' ? 'border-cipher-500/30 text-cipher-400' :
                        e.status === 'running'   ? 'border-amber-400/30 text-amber-400' :
                        e.status === 'failed'    ? 'border-rose-500/30 text-rose-400' :
                        'border-mist-700 text-mist-500'
                      }`}>{e.status}</span>
                    </td>
                    <td className="text-mist-500 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="whitespace-nowrap"><Link to="/compare" className="text-signal-400 hover:text-signal-300 text-xs">view →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Python backend badge */}
      <div className="panel p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 shrink-0 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 text-sm font-bold font-mono">Py</div>
          <div>
            <div className="text-sm font-medium">Python FastAPI backend</div>
            <div className="text-xs text-mist-500">All ML runs server-side · AES-256-GCM encryption · Google OAuth · Render deployment</div>
          </div>
        </div>

        <div className="ml-auto">
          <EncryptionBadge active label="Python cryptography lib" />
        </div>
      </div>
    </div>
  )
}

function FLArt() {
  return (
    <svg viewBox="0 0 300 220" className="h-full w-full">
      <circle cx="230" cy="110" r="28" fill="none" stroke="#6C7CFF" strokeWidth="1.5" opacity="0.7" />
      <text x="230" y="107" textAnchor="middle" fontSize="10" fill="#8B95FF" fontFamily="JetBrains Mono">Py</text>
      <text x="230" y="120" textAnchor="middle" fontSize="8" fill="#4B5566">FastAPI</text>
      {[0,1,2,3].map(i => {
        const y = 28 + i * 55
        return (
          <g key={i}>
            <rect x="18" y={y-12} width="26" height="24" rx="6" fill="#111827" stroke="#1E2A3D" />
            <text x="31" y={y+4} textAnchor="middle" fontSize="8" fill="#4B5566">C{i+1}</text>
            <line x1="44" y1={y} x2="202" y2="110" stroke="#1E2A3D" strokeWidth="1.5" />
            <circle r="3" fill="#4FE3C1">
              <animateMotion dur={`${2.2+i*0.3}s`} repeatCount="indefinite"
                path={`M44,${y} L202,110`} />
            </circle>
          </g>
        )
      })}
    </svg>
  )
}
