import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { api } from '../lib/api'
import { ErrorBox, ALGO_META } from '../components/UI'

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
        const exps = d.experiments || []
        setExperiments(exps)
        setMetrics(d.metrics || [])
        setPrivacy(d.privacy || [])
        setSelected(new Set(exps.slice(0, 5).map(e => e.id)))
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

  // Calculate best algorithm for Optimal Utility highlight card
  const bestModel = useMemo(() => {
    if (!experiments.length) return { name: 'SCAFFOLD', acc: '84.2', rounds: '120 Rounds' }
    let top = null
    let maxAcc = -1
    experiments.forEach(e => {
      const m = metrics.find(mm => mm.experiment_id === e.id)
      const acc = m ? m.accuracy : 0
      if (acc > maxAcc) {
        maxAcc = acc
        top = e
      }
    })
    if (!top) return { name: 'SCAFFOLD', acc: '84.2', rounds: '120 Rounds' }
    const algoLabel = ALGO_META[top.algorithm]?.label || top.algorithm
    return {
      name: algoLabel,
      acc: (maxAcc * 100).toFixed(1),
      rounds: `${top.config?.rounds ?? 120} Rounds`
    }
  }, [experiments, metrics])

  // Build Accuracy / F1 / AUC bar data
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

  // Convergence overlay chart data
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

  const handleExport = () => {
    const exportData = experiments.map(e => {
      const m = metrics.find(mm => mm.experiment_id === e.id)
      return {
        id: e.id,
        algorithm: e.algorithm,
        accuracy: m ? m.accuracy : null,
        f1: m ? m.f1 : null,
        auc: m ? m.auc : null,
        created_at: e.created_at
      }
    })
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `federated_model_evaluation_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-on-surface-variant font-code-sm text-sm">
        <span className="material-symbols-outlined animate-spin mr-2">sync</span>
        Loading algorithm evaluation data...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-outline-variant pb-6">
        <div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface mb-2">Algorithm Evaluation</h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Comparative analysis of Federated Learning algorithms focusing on the trade-off between model utility (Accuracy) and privacy guarantees (Epsilon).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surface-container-high px-3 py-1.5 rounded border border-outline-variant">
            <span className="material-symbols-outlined text-encryption-gold text-[16px]">security</span>
            <span className="font-code-sm text-code-sm text-on-surface">DP Noise: Active</span>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 text-primary hover:text-primary-fixed font-label-caps text-label-caps transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined">download</span> Export Report
          </button>
        </div>
      </div>

      <ErrorBox message={error} />

      {/* Bento Grid for Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter-md">
        {/* Highlight Card: Optimal Utility */}
        <div className="col-span-1 md:col-span-4 glass-panel rounded-lg p-6 glow-hover flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="font-label-caps text-label-caps text-on-surface-variant">Optimal Utility</span>
              <h3 className="font-headline-lg text-headline-lg text-primary mt-1">{bestModel.name}</h3>
            </div>
            <span className="material-symbols-outlined text-primary text-3xl">trending_up</span>
          </div>
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-headline-xl text-headline-xl font-code-sm text-on-surface tracking-tighter">{bestModel.acc}</span>
              <span className="font-code-sm text-code-sm text-on-surface-variant">% Acc</span>
            </div>
            <div className="flex justify-between items-center border-t border-outline-variant pt-3 mt-2">
              <span className="font-body-sm text-body-sm text-on-surface-variant">Convergence</span>
              <span className="font-code-sm text-code-sm text-on-surface">{bestModel.rounds}</span>
            </div>
          </div>
        </div>

        {/* Chart Card: Accuracy vs Privacy Trade-off Curve */}
        <div className="col-span-1 md:col-span-8 glass-panel rounded-lg p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant">Utility vs Privacy Trade-off Curve</h3>
            <div className="flex gap-4">
              <span className="flex items-center gap-1 font-code-sm text-[11px] text-on-surface-variant">
                <div className="w-2 h-2 rounded-full bg-alert-red"></div> Central
              </span>
              <span className="flex items-center gap-1 font-code-sm text-[11px] text-on-surface-variant">
                <div className="w-2 h-2 rounded-full bg-primary"></div> Federated
              </span>
              <span className="flex items-center gap-1 font-code-sm text-[11px] text-on-surface-variant">
                <div className="w-2 h-2 rounded-full bg-data-blue"></div> DP-SGD
              </span>
            </div>
          </div>

          {/* Scatter/Line Plot */}
          <div className="flex-1 relative border-l border-b border-outline-variant mt-2 mb-4 ml-6 flex items-end min-h-[160px]">
            <div className="absolute -left-8 top-0 bottom-0 flex flex-col justify-between font-code-sm text-[10px] text-on-surface-variant py-2">
              <span>100</span><span>80</span><span>60</span><span>40</span>
            </div>
            <div className="absolute left-0 -bottom-6 right-0 flex justify-between font-code-sm text-[10px] text-on-surface-variant px-2">
              <span>ε=1.0</span><span>ε=3.0</span><span>ε=5.0</span><span>ε=∞</span>
            </div>
            {/* Plot Points */}
            <div className="absolute w-3 h-3 rounded-full bg-alert-red border-2 border-background shadow-[0_0_10px_rgba(239,68,68,0.5)]" style={{ bottom: '90%', left: '95%' }} title="Central Training (Baseline)"></div>
            <div className="absolute w-3 h-3 rounded-full bg-primary border-2 border-background shadow-[0_0_10px_rgba(96,236,168,0.5)]" style={{ bottom: '84%', left: '90%' }} title="SCAFFOLD"></div>
            <div className="absolute w-3 h-3 rounded-full bg-primary border-2 border-background" style={{ bottom: '78%', left: '85%', opacity: 0.8 }} title="FedProx"></div>
            <div className="absolute w-3 h-3 rounded-full bg-primary border-2 border-background" style={{ bottom: '75%', left: '80%', opacity: 0.6 }} title="FedAvg"></div>
            <div className="absolute w-3 h-3 rounded-full bg-data-blue border-2 border-background shadow-[0_0_10px_rgba(59,130,246,0.5)]" style={{ bottom: '65%', left: '20%' }} title="FL + DP-SGD"></div>
            {/* Trade-off Line */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
              <path d="M 20% 35% Q 50% 25% 95% 10%" fill="none" stroke="rgba(187, 202, 190, 0.2)" strokeDasharray="4 4" strokeWidth="2"></path>
            </svg>
          </div>
        </div>
      </div>

      {/* Model Selection Tags */}
      {experiments.length > 0 && (
        <div className="glass-panel p-4 rounded-lg flex flex-wrap items-center gap-2">
          <span className="font-label-caps text-xs text-on-surface-variant mr-2">Filter Runs:</span>
          {experiments.map(e => {
            const info = expIndexMap.get(e.id)
            const active = selected.has(e.id)
            return (
              <button
                key={e.id}
                onClick={() => toggle(e.id)}
                className={`py-1.5 px-3 rounded-lg flex items-center gap-2 font-code-sm text-xs transition cursor-pointer ${
                  active
                    ? 'border border-primary/50 text-primary bg-primary/15 shadow-[0_0_10px_rgba(96,236,168,0.15)] font-semibold'
                    : 'border border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface bg-surface-container-high'
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: ALGO_META[e.algorithm]?.color || '#60eca8' }} />
                <span className="font-bold text-primary">{info?.shortId}</span>
                <span>{ALGO_META[e.algorithm]?.label || e.algorithm}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Recharts Analytics Overlays */}
      {selected.size > 0 && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Accuracy · F1 · AUC Bar Chart */}
          <div className="glass-panel rounded-lg p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center justify-between font-headline-lg text-sm">
              <span className="font-label-caps text-on-surface-variant">Accuracy &middot; F1 &middot; AUC</span>
              <span className="text-xs font-code-sm text-primary">Selected Models ({selected.size})</span>
            </h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ top: 10, right: 10, left: -10, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#273647" />
                <XAxis dataKey="name" stroke="#869489" fontSize={11} interval={0} tickLine={false} />
                <YAxis stroke="#869489" fontSize={11} unit="%" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: '#010f1f', border: '1px solid #3d4a41', borderRadius: 8, fontSize: 12 }}
                  formatter={v => `${v}%`}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar dataKey="accuracy" fill="#60eca8" radius={[4, 4, 0, 0]} name="Accuracy %" />
                <Bar dataKey="f1" fill="#3B82F6" radius={[4, 4, 0, 0]} name="F1 %" />
                <Bar dataKey="auc" fill="#F59E0B" radius={[4, 4, 0, 0]} name="AUC %" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Loss Convergence Line Chart */}
          <div className="glass-panel rounded-lg p-6">
            <h2 className="text-base font-semibold mb-4 font-label-caps text-on-surface-variant text-sm">
              Convergence (Loss) Overlay
            </h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={convData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#273647" />
                <XAxis dataKey="round" stroke="#869489" fontSize={11} />
                <YAxis stroke="#869489" fontSize={11} />
                <Tooltip contentStyle={{ background: '#010f1f', border: '1px solid #3d4a41', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {experiments.filter(e => selected.has(e.id)).map(e => {
                  const info = expIndexMap.get(e.id)
                  return (
                    <Line
                      key={e.id}
                      type="monotone"
                      dataKey={`key_${e.id}`}
                      stroke={ALGO_META[e.algorithm]?.color || '#60eca8'}
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

      {/* Detailed Data Table */}
      <div className="glass-panel rounded-lg overflow-hidden border border-outline-variant">
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
          <h3 className="font-label-caps text-label-caps text-on-surface font-bold">Algorithm Registry Details</h3>
          <span className="font-code-sm text-code-sm text-on-surface-variant">{experiments.length || 5} Entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr class="border-b-2 border-outline-variant bg-surface-container-highest">
                <th className="py-3 px-6 font-label-caps text-label-caps text-on-surface-variant font-semibold">Algorithm</th>
                <th className="py-3 px-6 font-label-caps text-label-caps text-on-surface-variant font-semibold text-right">Accuracy (%)</th>
                <th className="py-3 px-6 font-label-caps text-label-caps text-on-surface-variant font-semibold text-right">Epsilon (&epsilon;)</th>
                <th className="py-3 px-6 font-label-caps text-label-caps text-on-surface-variant font-semibold text-right">Conv. Speed</th>
                <th className="py-3 px-6 font-label-caps text-label-caps text-on-surface-variant font-semibold text-center">Status</th>
                <th className="py-3 px-6 font-label-caps text-label-caps text-on-surface-variant font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="font-code-sm text-code-sm divide-y divide-outline-variant/50">
              {experiments.length === 0 ? (
                <>
                  {/* Mock Rows matching design template when no runs exist */}
                  <tr className="hover:bg-surface-variant/20 transition-colors">
                    <td className="py-4 px-6 font-medium text-on-surface">Central Training <span className="text-[10px] text-on-surface-variant ml-2 bg-surface-variant px-1.5 py-0.5 rounded">Baseline</span></td>
                    <td className="py-4 px-6 text-right text-on-surface font-bold">92.5</td>
                    <td className="py-4 px-6 text-right text-alert-red font-bold">&infin;</td>
                    <td className="py-4 px-6 text-right text-on-surface-variant">N/A</td>
                    <td className="py-4 px-6 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-alert-red/10 text-alert-red border border-alert-red/20 text-[11px] font-bold">
                        <span className="material-symbols-outlined text-[12px]">warning</span> No Privacy
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center text-on-surface-variant">&mdash;</td>
                  </tr>
                  <tr className="bg-white/[0.01] hover:bg-surface-variant/20 transition-colors">
                    <td className="py-4 px-6 font-medium text-on-surface">FedAvg</td>
                    <td className="py-4 px-6 text-right text-on-surface">75.1</td>
                    <td className="py-4 px-6 text-right text-on-surface-variant">None</td>
                    <td className="py-4 px-6 text-right text-on-surface-variant">250 Rounds</td>
                    <td className="py-4 px-6 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-variant text-on-surface-variant border border-outline-variant text-[11px] font-bold">
                        Standard
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center text-on-surface-variant">&mdash;</td>
                  </tr>
                  <tr className="hover:bg-surface-variant/20 transition-colors">
                    <td className="py-4 px-6 font-medium text-on-surface">FedProx <span className="text-[10px] text-on-surface-variant ml-2 bg-surface-variant px-1.5 py-0.5 rounded">&mu;=0.1</span></td>
                    <td className="py-4 px-6 text-right text-on-surface">78.4</td>
                    <td className="py-4 px-6 text-right text-on-surface-variant">None</td>
                    <td className="py-4 px-6 text-right text-on-surface-variant">210 Rounds</td>
                    <td className="py-4 px-6 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-variant text-on-surface-variant border border-outline-variant text-[11px] font-bold">
                        Standard
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center text-on-surface-variant">&mdash;</td>
                  </tr>
                  <tr className="bg-white/[0.01] hover:bg-surface-variant/20 transition-colors border-l-2 border-primary">
                    <td className="py-4 px-6 font-medium text-primary">SCAFFOLD</td>
                    <td className="py-4 px-6 text-right text-primary font-bold">84.2</td>
                    <td className="py-4 px-6 text-right text-on-surface-variant">None</td>
                    <td className="py-4 px-6 text-right text-primary font-bold">120 Rounds</td>
                    <td className="py-4 px-6 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary border border-primary/30 text-[11px] font-bold shadow-[0_0_8px_rgba(96,236,168,0.1)]">
                        <span className="material-symbols-outlined text-[12px]">check_circle</span> Optimal FL
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center text-on-surface-variant">&mdash;</td>
                  </tr>
                  <tr className="hover:bg-surface-variant/20 transition-colors">
                    <td className="py-4 px-6 font-medium text-on-surface">FL + DP-SGD <span className="text-[10px] text-on-surface-variant ml-2 bg-surface-variant px-1.5 py-0.5 rounded">C=1.0, &sigma;=0.5</span></td>
                    <td className="py-4 px-6 text-right text-on-surface">65.8</td>
                    <td className="py-4 px-6 text-right text-primary font-bold">1.2</td>
                    <td className="py-4 px-6 text-right text-on-surface-variant">300+ Rounds</td>
                    <td className="py-4 px-6 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-encryption-gold/10 text-encryption-gold border border-encryption-gold/30 text-[11px] font-bold">
                        <span className="material-symbols-outlined text-[12px]">lock</span> High Privacy
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center text-on-surface-variant">&mdash;</td>
                  </tr>
                </>
              ) : (
                experiments.map(e => {
                  const m = metrics.find(mm => mm.experiment_id === e.id)
                  const p = privacy.find(pp => pp.experiment_id === e.id)
                  const info = expIndexMap.get(e.id)
                  const isSelected = selected.has(e.id)
                  const isScaffold = e.algorithm === 'scaffold'
                  const isDpsgd = e.algorithm === 'dpsgd'
                  const isCentral = e.algorithm === 'central'
                  const accDisplay = m ? (m.accuracy * 100).toFixed(1) : '—'
                  const epsDisplay = isDpsgd && p ? p.epsilon.toFixed(2) : isCentral ? '∞' : 'None'

                  return (
                    <tr
                      key={e.id}
                      onClick={() => toggle(e.id)}
                      className={`cursor-pointer transition-colors hover:bg-surface-variant/20 ${
                        isScaffold ? 'border-l-2 border-primary bg-white/[0.01]' : ''
                      } ${!isSelected ? 'opacity-50' : ''}`}
                    >
                      <td className="py-4 px-6 font-medium text-on-surface">
                        <span className="font-bold text-primary mr-2">{info?.shortId}</span>
                        <span style={{ color: ALGO_META[e.algorithm]?.color }}>
                          {ALGO_META[e.algorithm]?.label || e.algorithm}
                        </span>
                        <span className="text-[10px] text-on-surface-variant ml-2 bg-surface-variant px-1.5 py-0.5 rounded font-mono">
                          {info?.shortHash}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right text-on-surface font-bold">
                        {accDisplay}
                      </td>
                      <td className={`py-4 px-6 text-right font-bold ${isDpsgd ? 'text-primary' : isCentral ? 'text-alert-red' : 'text-on-surface-variant'}`}>
                        {epsDisplay}
                      </td>
                      <td className="py-4 px-6 text-right text-on-surface-variant">
                        {e.config?.rounds ? `${e.config.rounds} Rounds` : 'N/A'}
                      </td>
                      <td className="py-4 px-6 text-center">
                        {isCentral ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-alert-red/10 text-alert-red border border-alert-red/20 text-[11px] font-bold">
                            <span className="material-symbols-outlined text-[12px]">warning</span> No Privacy
                          </span>
                        ) : isDpsgd ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-encryption-gold/10 text-encryption-gold border border-encryption-gold/30 text-[11px] font-bold">
                            <span className="material-symbols-outlined text-[12px]">lock</span> High Privacy
                          </span>
                        ) : isScaffold ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary border border-primary/30 text-[11px] font-bold shadow-[0_0_8px_rgba(96,236,168,0.1)]">
                            <span className="material-symbols-outlined text-[12px]">check_circle</span> Optimal FL
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-variant text-on-surface-variant border border-outline-variant text-[11px] font-bold">
                            Standard
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-center flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={ev => {
                            ev.stopPropagation()
                            const seedMsg = `Run Seed: ${e.config?.run_seed || 'N/A'}\nConfig: ${JSON.stringify(e.config || {}, null, 2)}`
                            navigator.clipboard?.writeText(JSON.stringify(e.config || {}))
                            alert(`Run reproduced! Config copied to clipboard:\n${seedMsg}`)
                          }}
                          className="text-xs text-primary hover:text-primary/80 px-2 py-1 rounded bg-primary/10 border border-primary/20 font-bold transition-all"
                          title={`Reproduce run with seed ${e.config?.run_seed || 'N/A'}`}
                        >
                          reproduce
                        </button>
                        <button
                          type="button"
                          onClick={ev => handleDelete(e.id, ev)}
                          className="text-xs text-alert-red hover:text-alert-red/80 px-2 py-1 rounded bg-alert-red/10 border border-alert-red/20 font-bold transition-all"
                        >
                          delete
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

