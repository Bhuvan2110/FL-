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
        setSelected(new Set((d.experiments || []).slice(0, 4).map(e => e.id)))
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

  // Delete training result experiment
  const handleDelete = async (eId, event) => {
    if (event) event.stopPropagation()
    const info = expIndexMap.get(eId)
    const displayLabel = info?.shortId || eId
    if (!confirm(`Are you sure you want to delete training result ${displayLabel}?`)) return

    setError('')
    try {
      await api.train.delete(eId).catch(() => {})
      setExperiments(prev => prev.filter(e => e.id !== eId))
      setMetrics(prev => prev.filter(m => m.experiment_id !== eId))
      setSelected(prev => {
        const next = new Set(prev)
        next.delete(eId)
        return next
      })
    } catch (e) {
      setError(`Failed to delete run: ${e.message}`)
    }
  }

  // Map experiment to short unique model ID (e.g., #M1 · FedAvg)
  const expIndexMap = useMemo(() => {
    const map = new Map()
    experiments.forEach((e, idx) => {
      const shortHash = e.id ? e.id.slice(0, 6) : 'model'
      const shortTag = `#M${idx + 1}`
      const algoLabel = ALGO_META[e.algorithm]?.label || e.algorithm
      map.set(e.id, {
        shortId: shortTag,
        shortHash,
        label: `${shortTag} · ${algoLabel}`,
        fullLabel: e.name ? `${e.name} (${shortTag})` : `${shortTag} · ${algoLabel} (${shortHash})`
      })
    })
    return map
  }, [experiments])

  // Build Accuracy / F1 / AUC bar data labeled by small unique model IDs
  const barData = useMemo(() =>
    experiments.filter(e => selected.has(e.id)).map(e => {
      const m = metrics.find(mm => mm.experiment_id === e.id)
      const info = expIndexMap.get(e.id)
      return {
        id: e.id,
        name: info?.label || `#M · ${e.algorithm}`,
        fullTitle: info?.fullLabel || e.id,
        accuracy: m ? +(m.accuracy * 100).toFixed(1) : 0,
        f1:       m ? +(m.f1 * 100).toFixed(1)       : 0,
        auc:      m ? +(m.auc * 100).toFixed(1)      : 0,
      }
    }), [experiments, metrics, selected, expIndexMap])

  const convData = useMemo(() => {
    const maxLen = Math.max(0, ...Object.values(rounds).map(r => r.length))
    return Array.from({ length: maxLen }, (_, i) => {
      const pt = { round: i + 1 }
      experiments.filter(e => selected.has(e.id)).forEach(e => {
        const r = rounds[e.id]?.[i]
        const keyName = `key_${e.id}`
        if (r) pt[keyName] = +r.loss.toFixed(4)
      })
      return pt
    })
  }, [rounds, experiments, selected])

  if (loading) return <div className="text-mist-500 text-sm p-4">Loading comparison data...</div>

  return (
    <div className="space-y-8">
      <PageHeader
        title="Compare"
        sub="Select completed experiments to overlay metrics, convergence curves labeled by small unique model IDs (#M1, #M2...), or delete unwanted training results."
      />
      <ErrorBox message={error} />

      {experiments.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-mist-500">No completed experiments yet.</div>
      ) : (
        <>
          {/* Small Unique ID Experiment Selectors */}
          <div className="flex flex-wrap gap-2">
            {experiments.map(e => {
              const info = expIndexMap.get(e.id)
              const active = selected.has(e.id)
              return (
                <button
                  key={e.id}
                  onClick={() => toggle(e.id)}
                  className={`badge cursor-pointer transition py-1.5 px-3 rounded-lg flex items-center gap-2 ${
                    active
                      ? 'border-signal-500/50 text-signal-300 bg-signal-500/15 shadow-[0_0_10px_rgba(31,200,180,0.15)] font-semibold'
                      : 'border-ink-600 text-mist-400 hover:border-ink-500 hover:text-mist-200 bg-ink-950/60'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: ALGO_META[e.algorithm]?.color }} />
                  <span className="font-mono text-xs font-bold text-signal-400">{info?.shortId}</span>
                  <span>{ALGO_META[e.algorithm]?.label}</span>
                  <span className="font-mono text-[10px] opacity-60">({info?.shortHash})</span>
                </button>
              )
            })}
          </div>

          {selected.size > 0 && (
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Accuracy · F1 · AUC Bar Chart */}
              <div className="panel p-6">
                <h2 className="text-base font-semibold mb-4 flex items-center justify-between">
                  <span>Accuracy &middot; F1 &middot; AUC</span>
                  <span className="text-xs font-mono text-signal-400">Unique IDs: #M1, #M2...</span>
                </h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: -10, bottom: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3D" />
                    <XAxis
                      dataKey="name"
                      stroke="#8B9BB4"
                      fontSize={11}
                      interval={0}
                      tickLine={false}
                    />
                    <YAxis stroke="#8B9BB4" fontSize={11} unit="%" domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: '#111827', border: '1px solid #1E2A3D', borderRadius: 12, fontSize: 12 }}
                      formatter={v => `${v}%`}
                      labelFormatter={(label, payload) => {
                        const item = payload?.[0]?.payload
                        return `Trained Model: ${item?.fullTitle || label}`
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                    <Bar dataKey="accuracy" fill="#6C7CFF" radius={[6, 6, 0, 0]} name="Accuracy %" />
                    <Bar dataKey="f1"       fill="#4FE3C1" radius={[6, 6, 0, 0]} name="F1 %" />
                    <Bar dataKey="auc"      fill="#F2A94E" radius={[6, 6, 0, 0]} name="AUC %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Loss Convergence Line Chart */}
              <div className="panel p-6">
                <h2 className="text-base font-semibold mb-4">Convergence (loss) overlay</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={convData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3D" />
                    <XAxis dataKey="round" stroke="#8B9BB4" fontSize={11} />
                    <YAxis stroke="#8B9BB4" fontSize={11} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2A3D', borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {experiments.filter(e => selected.has(e.id)).map(e => {
                      const info = expIndexMap.get(e.id)
                      return (
                        <Line
                          key={e.id}
                          type="monotone"
                          dataKey={`key_${e.id}`}
                          stroke={ALGO_META[e.algorithm]?.color}
                          strokeWidth={2}
                          dot={false}
                          name={info?.label || e.id}
                          connectNulls
                        />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Metrics Table with Delete Option */}
          <div className="panel p-6">
            <h2 className="text-base font-semibold mb-4">Full metrics table</h2>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">Unique Model ID</th>
                    <th className="whitespace-nowrap">Algorithm</th>
                    <th className="whitespace-nowrap">Accuracy</th>
                    <th className="whitespace-nowrap">F1</th>
                    <th className="whitespace-nowrap">AUC</th>
                    <th className="whitespace-nowrap">Precision</th>
                    <th className="whitespace-nowrap">Recall</th>
                    <th className="whitespace-nowrap">Rounds</th>
                    <th className="whitespace-nowrap">Ran</th>
                    <th className="whitespace-nowrap">Action</th>
                  </tr>
                </thead>

              <tbody>
                {experiments.map(e => {
                  const m = metrics.find(mm => mm.experiment_id === e.id)
                  const info = expIndexMap.get(e.id)
                  return (
                    <tr
                      key={e.id}
                      onClick={() => toggle(e.id)}
                      className={`cursor-pointer transition-colors ${selected.has(e.id) ? '' : 'opacity-50'}`}
                    >
                      <td className="font-mono text-xs text-signal-400 font-bold">
                        {info?.shortId} <span className="text-mist-500 font-normal">({info?.shortHash})</span>
                      </td>
                      <td className="font-medium" style={{ color: ALGO_META[e.algorithm]?.color }}>
                        {ALGO_META[e.algorithm]?.label}
                      </td>
                      <td className="font-mono font-semibold">{m ? `${(m.accuracy * 100).toFixed(1)}%` : '—'}</td>
                      <td className="font-mono">{m ? m.f1.toFixed(3) : '—'}</td>
                      <td className="font-mono">{m ? m.auc.toFixed(3) : '—'}</td>
                      <td className="font-mono">{m ? m.precision_score.toFixed(3) : '—'}</td>
                      <td className="font-mono">{m ? m.recall.toFixed(3) : '—'}</td>
                      <td className="font-mono">{e.config?.rounds ?? '—'}</td>
                      <td className="text-mist-500 text-xs">{new Date(e.created_at).toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          onClick={ev => handleDelete(e.id, ev)}
                          className="text-xs text-rose-400 hover:text-rose-300 hover:underline px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20"
                        >
                          delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>

      )}
    </div>
  )
}
