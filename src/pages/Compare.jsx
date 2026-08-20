import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { api } from '../lib/api'
import { PageHeader, ErrorBox, ALGO_META } from '../components/UI'

export default function Compare() {
  const [experiments, setExperiments] = useState([])
  const [metrics,     setMetrics]     = useState([])
  const [privacy,     setPrivacy]     = useState([])
  const [rounds,      setRounds]      = useState({})
  const [selected,    setSelected]    = useState(new Set())
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  useEffect(() => {
    api.compare.all()
      .then(d => {
        setExperiments(d.experiments || [])
        setMetrics(d.metrics || [])
        setPrivacy(d.privacy || [])
        setSelected(new Set((d.experiments||[]).slice(0,4).map(e=>e.id)))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Lazy-load rounds per selected experiment
  useEffect(() => {
    const toFetch = [...selected].filter(id => !rounds[id])
    if (!toFetch.length) return
    toFetch.forEach(id => {
      api.compare.rounds(id).then(d => {
        setRounds(r => ({ ...r, [id]: d.rounds || [] }))
      }).catch(console.error)
    })
  }, [selected])

  const toggle = id => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const barData = useMemo(() =>
    experiments.filter(e => selected.has(e.id)).map(e => {
      const m = metrics.find(mm => mm.experiment_id === e.id)
      return {
        name:     ALGO_META[e.algorithm]?.label || e.algorithm,
        accuracy: m ? +(m.accuracy*100).toFixed(1)  : 0,
        f1:       m ? +(m.f1*100).toFixed(1)         : 0,
        auc:      m ? +(m.auc*100).toFixed(1)        : 0,
      }
    }), [experiments, metrics, selected])

  const convData = useMemo(() => {
    const maxLen = Math.max(0, ...Object.values(rounds).map(r=>r.length))
    return Array.from({ length: maxLen }, (_, i) => {
      const pt = { round: i+1 }
      experiments.filter(e => selected.has(e.id)).forEach(e => {
        const r = rounds[e.id]?.[i]
        if (r) pt[`${e.algorithm}_${e.id.slice(0,6)}`] = +r.loss.toFixed(4)
      })
      return pt
    })
  }, [rounds, experiments, selected])

  if (loading) return <div className="text-mist-500 text-sm p-4">Loading comparison data…</div>

  return (
    <div className="space-y-8">
      <PageHeader title="Compare" sub="Select completed experiments to overlay their metrics and convergence curves." />
      <ErrorBox message={error} />

      {experiments.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-mist-500">No completed experiments yet.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {experiments.map(e => (
              <button key={e.id} onClick={() => toggle(e.id)}
                className={`badge cursor-pointer transition ${selected.has(e.id) ? 'border-signal-500/40 text-signal-400 bg-signal-500/10' : 'border-ink-600 text-mist-500 hover:border-ink-500'}`}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ALGO_META[e.algorithm]?.color }} />
                {ALGO_META[e.algorithm]?.label} &middot; {new Date(e.created_at).toLocaleDateString()}
              </button>
            ))}
          </div>

          {selected.size > 0 && (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="panel p-6">
                <h2 className="text-base font-semibold mb-4">Accuracy &middot; F1 &middot; AUC</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3D" />
                    <XAxis dataKey="name" stroke="#4B5566" fontSize={11} />
                    <YAxis stroke="#4B5566" fontSize={11} unit="%" domain={[0,100]} />
                    <Tooltip contentStyle={{ background:'#111827', border:'1px solid #1E2A3D', borderRadius:12, fontSize:12 }} formatter={v=>`${v}%`} />
                    <Legend wrapperStyle={{ fontSize:12 }} />
                    <Bar dataKey="accuracy" fill="#6C7CFF" radius={[6,6,0,0]} name="Accuracy" />
                    <Bar dataKey="f1"       fill="#4FE3C1" radius={[6,6,0,0]} name="F1" />
                    <Bar dataKey="auc"      fill="#F2A94E" radius={[6,6,0,0]} name="AUC" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="panel p-6">
                <h2 className="text-base font-semibold mb-4">Convergence (loss) overlay</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={convData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3D" />
                    <XAxis dataKey="round" stroke="#4B5566" fontSize={11} />
                    <YAxis stroke="#4B5566" fontSize={11} />
                    <Tooltip contentStyle={{ background:'#111827', border:'1px solid #1E2A3D', borderRadius:12, fontSize:12 }} />
                    <Legend wrapperStyle={{ fontSize:12 }} />
                    {experiments.filter(e=>selected.has(e.id)).map(e => (
                      <Line key={e.id} type="monotone"
                        dataKey={`${e.algorithm}_${e.id.slice(0,6)}`}
                        stroke={ALGO_META[e.algorithm]?.color} strokeWidth={2} dot={false}
                        name={`${ALGO_META[e.algorithm]?.label} (${e.id.slice(0,6)})`}
                        connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="panel p-6">
            <h2 className="text-base font-semibold mb-4">Full metrics table</h2>
            <table className="data-table">
              <thead><tr><th>Algorithm</th><th>Accuracy</th><th>F1</th><th>AUC</th><th>Precision</th><th>Recall</th><th>Rounds</th><th>Ran</th></tr></thead>
              <tbody>
                {experiments.map(e => {
                  const m = metrics.find(mm=>mm.experiment_id===e.id)
                  return (
                    <tr key={e.id} onClick={()=>toggle(e.id)} className={`cursor-pointer ${selected.has(e.id)?'':'opacity-50'}`}>
                      <td className="font-medium" style={{color:ALGO_META[e.algorithm]?.color}}>{ALGO_META[e.algorithm]?.label}</td>
                      <td>{m ? `${(m.accuracy*100).toFixed(1)}%`   : '—'}</td>
                      <td>{m ? m.f1.toFixed(3)               : '—'}</td>
                      <td>{m ? m.auc.toFixed(3)              : '—'}</td>
                      <td>{m ? m.precision_score.toFixed(3)  : '—'}</td>
                      <td>{m ? m.recall.toFixed(3)           : '—'}</td>
                      <td className="font-mono">{e.config?.rounds ?? '—'}</td>
                      <td className="text-mist-500 text-xs">{new Date(e.created_at).toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
