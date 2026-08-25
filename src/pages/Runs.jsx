import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts'
import { api } from '../lib/api'
import { PageHeader, ALGO_META } from '../components/UI'

const STATUS_CLS = {
  pending: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30',
  queued: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30',
  running: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
  completed: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  failed: 'bg-rose-500/10 text-rose-400 border border-rose-500/30',
  cancelled: 'bg-gray-500/10 text-gray-400 border border-gray-500/30',
}
export default function Runs() {
  const [runs, setRuns] = useState([])
  const [metrics, setMetrics] = useState([])
  const [rounds, setRounds] = useState({})
  const [sel, setSel] = useState(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [loading, setLoading] = useState(true)

  const loadData = () => {
    setLoading(true)
    api.compare.all()
      .then(d => {
        const exps = d.experiments || []
        setRuns(exps)
        setMetrics(d.metrics || [])
        if (exps.length && !sel) setSel(exps[0].id)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(loadData, [])

  // Lazy-load rounds for selected run
  useEffect(() => {
    if (!sel || rounds[sel]) return
    api.compare.rounds(sel).then(d => {
      setRounds(r => ({ ...r, [sel]: d.rounds || [] }))
    }).catch(console.error)
  }, [sel])

  const handleDeleteRun = async (rId, e) => {
    if (e) e.stopPropagation()
    if (!confirm(`Delete training run "${rId}"?`)) return
    try {
      await api.train.delete(rId).catch(() => { })
      setRuns(prev => prev.filter(r => r.id !== rId))
      setMetrics(prev => prev.filter(m => m.experiment_id !== rId))
      if (sel === rId) {
        const remaining = runs.filter(r => r.id !== rId)
        setSel(remaining[0]?.id || null)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const filtered = useMemo(() => {
    let list = runs.filter(r => {
      const q = search.toLowerCase()
      return r.id.toLowerCase().includes(q) || (r.algorithm || '').toLowerCase().includes(q)
    })
    if (sort === 'newest') list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    if (sort === 'oldest') list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    if (sort === 'accuracy') list.sort((a, b) => {
      const ma = metrics.find(m => m.experiment_id === a.id)?.accuracy || 0
      const mb = metrics.find(m => m.experiment_id === b.id)?.accuracy || 0
      return mb - ma
    })
    return list
  }, [runs, search, sort, metrics])

  const selRun = runs.find(r => r.id === sel)
  const selMetrics = metrics.find(m => m.experiment_id === sel)
  const selRounds = rounds[sel] || []

  const radarData = selMetrics ? [
    { metric: 'Accuracy', value: +(selMetrics.accuracy * 100).toFixed(1) },
    { metric: 'F1', value: +(selMetrics.f1 * 100).toFixed(1) },
    { metric: 'AUC', value: +(selMetrics.auc * 100).toFixed(1) },
    { metric: 'Precision', value: +(selMetrics.precision_score * 100).toFixed(1) },
    { metric: 'Recall', value: +(selMetrics.recall * 100).toFixed(1) },
  ] : []

  const convData = selRounds.map(r => ({
    round: r.round_num,
    loss: +r.loss.toFixed(4),
    accuracy: +r.accuracy.toFixed(4),
  }))

  if (loading) return <div className="text-mist-500 text-sm p-4">Loading runs...</div>

  return (
    <div className="space-y-8">
      <PageHeader title="Run History" badge="MLflow-style"
        sub="Every Python training run tracked — parameters, metrics, convergence, and encrypted artifacts." />

      <div className="flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Search ID or algorithm..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input w-40" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="accuracy">Best accuracy</option>
        </select>
        <span className="text-xs text-mist-500 self-center ml-auto">{filtered.length} run{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        {/* Run list */}
        <div className="panel p-0 overflow-hidden h-fit">
          <div className="divide-y divide-ink-700/60 max-h-[600px] overflow-y-auto scrollbar-thin">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-mist-500">No runs found.</div>
            ) : filtered.map((run, idx) => {
              const m = metrics.find(mm => mm.experiment_id === run.id)
              const isSel = sel === run.id
              return (
                <div key={run.id} onClick={() => setSel(run.id)}
                  className={`w-full text-left px-4 py-3.5 transition border-l-2 cursor-pointer flex items-center justify-between ${isSel ? 'bg-signal-500/10 border-signal-500' : 'hover:bg-ink-800/50 border-transparent'}`}>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-signal-400">#M{idx + 1}</span>
                      <span className="font-medium text-sm" style={{ color: ALGO_META[run.algorithm]?.color }}>
                        {ALGO_META[run.algorithm]?.label}
                      </span>
                      <span className={`badge text-[10px] ${STATUS_CLS[run.status] || STATUS_CLS.pending}`}>{run.status}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-mist-500">
                      <span>Acc: <span className="text-mist-300">{m ? `${(m.accuracy * 100).toFixed(1)}%` : '—'}</span></span>
                      <span>F1: <span className="text-mist-300">{m ? m.f1.toFixed(3) : '—'}</span></span>
                      <span>AUC: <span className="text-mist-300">{m ? m.auc.toFixed(3) : '—'}</span></span>
                    </div>
                    <div className="text-[10px] text-mist-700 mt-1 font-mono">
                      {run.id.slice(0, 16)}... · {new Date(run.created_at).toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={ev => handleDeleteRun(run.id, ev)}
                    title="Delete training run"
                    className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20"
                  >
                    delete
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Run detail */}
        {selRun ? (
          <div className="space-y-5">
            <div className="panel p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-display font-semibold text-lg" style={{ color: ALGO_META[selRun.algorithm]?.color }}>
                    {ALGO_META[selRun.algorithm]?.label}
                  </span>
                  <span className={`badge ${STATUS_CLS[selRun.status]}`}>{selRun.status}</span>
                </div>
                <div className="font-mono text-xs text-mist-500 mb-1">{selRun.id}</div>
                <div className="text-xs text-mist-500">
                  Started {new Date(selRun.created_at).toLocaleString()}
                  {selRun.completed_at && ` · finished ${new Date(selRun.completed_at).toLocaleString()}`}
                </div>
              </div>
              <button
                type="button"
                onClick={e => handleDeleteRun(selRun.id, e)}
                className="btn-ghost text-xs text-rose-400 border-rose-500/40 hover:bg-rose-500/20 px-4 py-2"
              >
                Delete Training Run
              </button>
            </div>

            {selMetrics && (
              <div className="panel p-5 grid sm:grid-cols-2 gap-6">
                <div>
                  <div className="label mb-3">Test-set metrics</div>
                  {[
                    { k: 'Accuracy', v: selMetrics.accuracy },
                    { k: 'F1', v: selMetrics.f1 },
                    { k: 'AUC', v: selMetrics.auc },
                    { k: 'Precision', v: selMetrics.precision_score },
                    { k: 'Recall', v: selMetrics.recall },
                  ].map(({ k, v }) => (
                    <div key={k} className="flex items-center gap-3 mb-2">
                      <span className="text-xs text-mist-500 w-20">{k}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-ink-700">
                        <div className="h-full rounded-full bg-signal-500" style={{ width: `${v * 100}%` }} />
                      </div>
                      <span className="font-mono text-xs text-mist-100 w-12 text-right">{(v * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="label mb-2">Metric radar</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#1E2A3D" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: '#7C879A', fontSize: 10 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar dataKey="value" stroke="#6C7CFF" fill="#6C7CFF" fillOpacity={0.2} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {convData.length > 0 && (
              <div className="panel p-5">
                <div className="label mb-3">Convergence — loss &amp; accuracy per round</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={convData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3D" />
                    <XAxis dataKey="round" stroke="#4B5566" fontSize={11} />
                    <YAxis stroke="#4B5566" fontSize={11} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2A3D', borderRadius: 12, fontSize: 12 }} />
                    <Legend />
                    <Line type="monotone" dataKey="loss" stroke="#F0618C" strokeWidth={2} dot={false} name="Loss" />
                    <Line type="monotone" dataKey="accuracy" stroke="#4FE3C1" strokeWidth={2} dot={false} name="Accuracy" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="panel p-5">
              <div className="label mb-3">Hyperparameters</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(selRun.config || {}).map(([k, v]) => (
                  <div key={k} className="bg-ink-900 rounded-xl px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-mist-700">{k}</div>
                    <div className="font-mono text-sm text-mist-100 mt-0.5">{String(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="panel p-12 text-center text-sm text-mist-500">
            &larr; Select a run to see detail
          </div>
        )}
      </div>
    </div>
  )
}
