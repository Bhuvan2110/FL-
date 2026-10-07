import { useEffect, useRef, useState } from 'react'
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { api } from '../lib/api'
import { PageHeader, ALGO_META } from '../components/UI'
import type { Algorithm, Experiment, Metrics, PrivacyPoint, RoundPoint } from '../types'

function Gauge({ value, max, label, color = '#6C7CFF', unit = '' }: { value: number; max: number; label: string; color?: string; unit?: string }) {
  const pct = Math.min(value / (max || 1), 1)
  const r = 52,
    cx = 64,
    cy = 64,
    circ = 2 * Math.PI * r,
    arc = circ * 0.75
  return (
    <div className="panel p-5 flex flex-col items-center">
      <svg width={128} height={96} viewBox="0 0 128 128">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1E2A3D" strokeWidth={10} strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10} strokeDasharray={`${pct * arc} ${circ - pct * arc}`} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#EEF1F6" fontSize={17} fontWeight={600} fontFamily="Space Grotesk">
          {typeof value === 'number' ? value.toFixed(value < 10 ? 2 : 0) : value}
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" fill="#7C879A" fontSize={9}>
          {unit}
        </text>
      </svg>
      <div className="label text-center mt-1">{label}</div>
    </div>
  )
}

interface TimeSeriesPoint {
  t: number
  accuracy: number | null
  f1: number | null
  auc: number | null
}

export default function Monitor() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [metrics, setMetrics] = useState<Metrics[]>([])
  const [privacy, setPrivacy] = useState<PrivacyPoint[]>([])
  const [rounds, setRounds] = useState<RoundPoint[]>([])
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([])
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = async () => {
    try {
      const [e, c] = await Promise.all([api.train.experiments(), api.compare.all()])
      const exps = e.experiments || []
      setExperiments(exps)
      setMetrics(c.metrics || [])
      setPrivacy(c.privacy || [])

      if (exps.length) {
        const ids = exps.slice(0, 6).map((ex) => ex.id)
        const rs = await Promise.all(ids.map((id) => api.compare.rounds(id).catch(() => ({ rounds: [] as RoundPoint[] }))))
        const allRounds = rs.flatMap((r) => r.rounds || [])
        setRounds(allRounds)
      }

      const sorted = [...exps].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      setTimeSeries(
        sorted.map((ex, i) => {
          const m = (c.metrics || []).find((mm) => mm.experiment_id === ex.id)
          return { t: i + 1, accuracy: m ? +(m.accuracy * 100).toFixed(2) : null, f1: m ? +(m.f1 * 100).toFixed(2) : null, auc: m ? +(m.auc * 100).toFixed(2) : null }
        })
      )
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    timerRef.current = setInterval(fetchAll, 30_000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const completed = experiments.filter((e) => e.status === 'completed')
  const running = experiments.filter((e) => e.status === 'running')
  const failed = experiments.filter((e) => e.status === 'failed')

  const avgAcc = metrics.length ? metrics.reduce((s, m) => s + m.accuracy, 0) / metrics.length : 0
  const bestAcc = metrics.length ? Math.max(...metrics.map((m) => m.accuracy)) : 0
  const avgF1 = metrics.length ? metrics.reduce((s, m) => s + m.f1, 0) / metrics.length : 0
  const avgAuc = metrics.length ? metrics.reduce((s, m) => s + m.auc, 0) / metrics.length : 0
  const latestEps = privacy.length ? privacy[privacy.length - 1]?.epsilon : 0

  const accByAlgo = (Object.entries(ALGO_META) as [Algorithm, (typeof ALGO_META)[Algorithm]][])
    .map(([k, v]) => {
      const ms = metrics.filter((m) => {
        const exp = experiments.find((e) => e.id === m.experiment_id)
        return exp?.algorithm === k
      })
      return ms.length ? { name: v.label, accuracy: +((ms.reduce((s, m) => s + m.accuracy, 0) / ms.length) * 100).toFixed(1), color: v.color } : null
    })
    .filter((x): x is { name: string; accuracy: number; color: string } => x !== null)

  const lossTail = rounds.slice(-60).map((r, i) => ({ i, loss: +r.loss.toFixed(4) }))

  const algoDist = (Object.entries(ALGO_META) as [Algorithm, (typeof ALGO_META)[Algorithm]][])
    .map(([k, v]) => ({ name: v.label, count: experiments.filter((e) => e.algorithm === k).length, color: v.color }))
    .filter((a) => a.count > 0)

  if (loading) return <div className="text-mist-500 text-sm p-4">Loading metrics…</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <PageHeader title="Metrics Monitor" badge="Prometheus-style" sub="Live aggregated metrics from the backend. Auto-refreshes every 30 s." />
        <button onClick={fetchAll} className="btn-ghost text-xs">
          &#8635; Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Gauge value={completed.length} max={Math.max(experiments.length, 1)} label="Completed" color="#4FE3C1" unit="runs" />
        <Gauge value={bestAcc * 100} max={100} label="Best accuracy" color="#6C7CFF" unit="%" />
        <Gauge value={avgAcc * 100} max={100} label="Avg accuracy" color="#6C7CFF" unit="%" />
        <Gauge value={avgF1 * 100} max={100} label="Avg F1" color="#8B95FF" unit="%" />
        <Gauge value={avgAuc * 100} max={100} label="Avg AUC" color="#F2A94E" unit="%" />
        <Gauge value={latestEps || 0} max={10} label="Latest ε" color="#F0618C" unit="ε" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total experiments', value: experiments.length, color: '#8B95FF' },
          { label: 'Running now', value: running.length, color: '#F2A94E' },
          { label: 'Failed', value: failed.length, color: '#F0618C' },
          { label: 'Round snapshots', value: rounds.length, color: '#4FE3C1' },
        ].map((t) => (
          <div key={t.label} className="panel p-4">
            <div className="label mb-1">{t.label}</div>
            <div className="font-display text-2xl font-semibold" style={{ color: t.color }}>
              {t.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="panel p-6">
          <div className="label mb-3">Accuracy · F1 · AUC over experiments</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3D" />
              <XAxis dataKey="t" stroke="#4B5566" fontSize={11} />
              <YAxis stroke="#4B5566" fontSize={11} unit="%" domain={[0, 100]} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2A3D', borderRadius: 12, fontSize: 12 }} formatter={(v) => [`${typeof v === 'number' ? v.toFixed(1) : v}%`, '']} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="accuracy" stroke="#6C7CFF" fill="#6C7CFF22" strokeWidth={2} name="Accuracy" connectNulls />
              <Area type="monotone" dataKey="f1" stroke="#4FE3C1" fill="#4FE3C122" strokeWidth={2} name="F1" connectNulls />
              <Area type="monotone" dataKey="auc" stroke="#F2A94E" fill="#F2A94E22" strokeWidth={2} name="AUC" connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {accByAlgo.length > 0 && (
          <div className="panel p-6">
            <div className="label mb-3">Mean accuracy by algorithm</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={accByAlgo} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3D" horizontal={false} />
                <XAxis type="number" stroke="#4B5566" fontSize={11} unit="%" domain={[0, 100]} />
                <YAxis dataKey="name" type="category" stroke="#4B5566" fontSize={10} width={85} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2A3D', borderRadius: 12, fontSize: 12 }} formatter={(v) => [`${v}%`, 'Accuracy']} />
                <Bar dataKey="accuracy" radius={[0, 6, 6, 0]}>
                  {accByAlgo.map((e, i) => (
                    <rect key={i} fill={e.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {lossTail.length > 0 && (
          <div className="panel p-6">
            <div className="label mb-3">Loss tail — last {lossTail.length} round snapshots</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={lossTail}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3D" />
                <XAxis dataKey="i" stroke="#4B5566" fontSize={11} />
                <YAxis stroke="#4B5566" fontSize={11} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2A3D', borderRadius: 12, fontSize: 12 }} />
                <Line type="monotone" dataKey="loss" stroke="#F0618C" strokeWidth={1.5} dot={false} name="Loss" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {algoDist.length > 0 && (
          <div className="panel p-6">
            <div className="label mb-4">Algorithm usage</div>
            <div className="space-y-3">
              {algoDist.map((a) => (
                <div key={a.name} className="flex items-center gap-3">
                  <span className="text-xs text-mist-400 w-28 shrink-0">{a.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-ink-700">
                    <div className="h-full rounded-full" style={{ width: `${(a.count / experiments.length) * 100}%`, background: a.color }} />
                  </div>
                  <span className="font-mono text-xs text-mist-300 w-6 text-right">{a.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
