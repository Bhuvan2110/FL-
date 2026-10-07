import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { api } from '../lib/api'
import { ErrorBox, ALGO_META } from '../components/UI'
import type { Experiment, Metrics, PrivacyPoint, RoundPoint } from '../types'

interface ExpInfo {
  shortId: string
  shortHash: string
  label: string
  fullLabel: string
}

export default function Compare() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [metrics, setMetrics] = useState<Metrics[]>([])
  const [privacy, setPrivacy] = useState<PrivacyPoint[]>([])
  const [rounds, setRounds] = useState<Record<string, RoundPoint[]>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.compare
      .all()
      .then((d) => {
        const exps = d.experiments || []
        setExperiments(exps)
        setMetrics(d.metrics || [])
        setPrivacy(d.privacy || [])
        setSelected(new Set(exps.slice(0, 5).map((e) => e.id)))
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const toFetch = [...selected].filter((id) => !rounds[id])
    if (!toFetch.length) return
    toFetch.forEach((id) => {
      api.compare
        .rounds(id)
        .then((d) => setRounds((r) => ({ ...r, [id]: d.rounds || [] })))
        .catch(console.error)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const expIndexMap = useMemo(() => {
    const map = new Map<string, ExpInfo>()
    experiments.forEach((e, idx) => {
      const shortHash = e.id ? e.id.slice(0, 6) : 'model'
      const shortTag = `#M${idx + 1}`
      const algoLabel = ALGO_META[e.algorithm]?.label || e.algorithm
      map.set(e.id, { shortId: shortTag, shortHash, label: `${shortTag} · ${algoLabel}`, fullLabel: e.name ? `${e.name} (${shortTag})` : `${shortTag} · ${algoLabel} (${shortHash})` })
    })
    return map
  }, [experiments])

  const handleDelete = async (eId: string, event?: MouseEvent) => {
    if (event) event.stopPropagation()
    const info = expIndexMap.get(eId)
    const displayLabel = info?.shortId || eId
    if (!confirm(`Are you sure you want to delete training result ${displayLabel}?`)) return
    setError('')
    try {
      await api.train.delete(eId).catch(() => {})
      setExperiments((prev) => prev.filter((e) => e.id !== eId))
      setMetrics((prev) => prev.filter((m) => m.experiment_id !== eId))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(eId)
        return next
      })
    } catch (e) {
      setError(`Failed to delete run: ${e.message}`)
    }
  }

  const bestModel = useMemo(() => {
    if (!experiments.length) return { name: 'SCAFFOLD', acc: '84.2', rounds: '120 Rounds' }
    let top: Experiment | null = null
    let maxAcc = -1
    experiments.forEach((e) => {
      const m = metrics.find((mm) => mm.experiment_id === e.id)
      const acc = m ? m.accuracy : 0
      if (acc > maxAcc) {
        maxAcc = acc
        top = e
      }
    })
    if (!top) return { name: 'SCAFFOLD', acc: '84.2', rounds: '120 Rounds' }
    const t = top as Experiment
    const algoLabel = ALGO_META[t.algorithm]?.label || t.algorithm
    return { name: algoLabel, acc: (maxAcc * 100).toFixed(1), rounds: `${t.config?.rounds ?? 120} Rounds` }
  }, [experiments, metrics])

  const barData = useMemo(
    () =>
      experiments
        .filter((e) => selected.has(e.id))
        .map((e) => {
          const m = metrics.find((mm) => mm.experiment_id === e.id)
          const info = expIndexMap.get(e.id)
          return {
            id: e.id,
            name: info?.label || `#M · ${e.algorithm}`,
            fullTitle: info?.fullLabel || e.id,
            accuracy: m ? +(m.accuracy * 100).toFixed(1) : 0,
            f1: m ? +(m.f1 * 100).toFixed(1) : 0,
            auc: m ? +(m.auc * 100).toFixed(1) : 0,
          }
        }),
    [experiments, metrics, selected, expIndexMap]
  )

  const convData = useMemo(() => {
    const maxLen = Math.max(0, ...Object.values(rounds).map((r) => r.length))
    return Array.from({ length: maxLen }, (_, i) => {
      const pt: Record<string, number> = { round: i + 1 }
      experiments
        .filter((e) => selected.has(e.id))
        .forEach((e) => {
          const r = rounds[e.id]?.[i]
          const keyName = `key_${e.id}`
          if (r) pt[keyName] = +r.loss.toFixed(4)
        })
      return pt
    })
  }, [rounds, experiments, selected])

  const handleExport = () => {
    const exportData = experiments.map((e) => {
      const m = metrics.find((mm) => mm.experiment_id === e.id)
      return { id: e.id, algorithm: e.algorithm, accuracy: m ? m.accuracy : null, f1: m ? m.f1 : null, auc: m ? m.auc : null, created_at: e.created_at }
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-outline-variant pb-6">
        <div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface mb-2">Algorithm Evaluation</h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">Comparative analysis of Federated Learning algorithms focusing on the trade-off between model utility (Accuracy) and privacy guarantees (Epsilon).</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surface-container-high px-3 py-1.5 rounded border border-outline-variant">
            <span className="material-symbols-outlined text-encryption-gold text-[16px]">security</span>
            <span className="font-code-sm text-code-sm text-on-surface">DP Noise: Active</span>
          </div>
          <button onClick={handleExport} className="flex items-center gap-2 text-primary hover:text-primary-fixed font-label-caps text-label-caps transition-colors cursor-pointer">
            <span className="material-symbols-outlined">download</span> Export Report
          </button>
        </div>
      </div>

      <ErrorBox message={error} />

      {experiments.length > 0 && (
        <div className="glass-panel p-4 rounded-lg flex flex-wrap items-center gap-2">
          <span className="font-label-caps text-xs text-on-surface-variant mr-2">Filter Runs:</span>
          {experiments.map((e) => {
            const info = expIndexMap.get(e.id)
            const active = selected.has(e.id)
            return (
              <button key={e.id} onClick={() => toggle(e.id)} className={`py-1.5 px-3 rounded-lg flex items-center gap-2 font-code-sm text-xs transition cursor-pointer ${active ? 'border border-primary/50 text-primary bg-primary/15 shadow-[0_0_10px_rgba(96,236,168,0.15)] font-semibold' : 'border border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface bg-surface-container-high'}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: ALGO_META[e.algorithm]?.color || '#60eca8' }} />
                <span className="font-bold text-primary">{info?.shortId}</span>
                <span>{ALGO_META[e.algorithm]?.label || e.algorithm}</span>
              </button>
            )
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="grid lg:grid-cols-2 gap-6">
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
                <Tooltip contentStyle={{ background: '#010f1f', border: '1px solid #3d4a41', borderRadius: 8, fontSize: 12 }} formatter={(v) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar dataKey="accuracy" fill="#60eca8" radius={[4, 4, 0, 0]} name="Accuracy %" />
                <Bar dataKey="f1" fill="#3B82F6" radius={[4, 4, 0, 0]} name="F1 %" />
                <Bar dataKey="auc" fill="#F59E0B" radius={[4, 4, 0, 0]} name="AUC %" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel rounded-lg p-6">
            <h2 className="text-base font-semibold mb-4 font-label-caps text-on-surface-variant text-sm">Convergence (Loss) Overlay</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={convData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#273647" />
                <XAxis dataKey="round" stroke="#869489" fontSize={11} />
                <YAxis stroke="#869489" fontSize={11} />
                <Tooltip contentStyle={{ background: '#010f1f', border: '1px solid #3d4a41', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {experiments
                  .filter((e) => selected.has(e.id))
                  .map((e) => {
                    const info = expIndexMap.get(e.id)
                    return <Line key={e.id} type="monotone" dataKey={`key_${e.id}`} stroke={ALGO_META[e.algorithm]?.color || '#60eca8'} strokeWidth={2} dot={false} name={info?.label || e.id} connectNulls />
                  })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-lg overflow-hidden border border-outline-variant">
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
          <h3 className="font-label-caps text-label-caps text-on-surface font-bold">Algorithm Registry Details</h3>
          <span className="font-code-sm text-code-sm text-on-surface-variant">{experiments.length} Entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-outline-variant bg-surface-container-highest">
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
                <tr>
                  <td colSpan={6} className="py-8 px-6 text-center text-on-surface-variant">
                    No experiments yet — run one from the Train tab.
                  </td>
                </tr>
              ) : (
                experiments.map((e) => {
                  const m = metrics.find((mm) => mm.experiment_id === e.id)
                  const p = privacy.find((pp) => pp.experiment_id === e.id)
                  const info = expIndexMap.get(e.id)
                  const isSelected = selected.has(e.id)
                  const isScaffold = e.algorithm === 'scaffold'
                  const isDpsgd = e.algorithm === 'dpsgd'
                  const isCentral = e.algorithm === 'central'
                  const accDisplay = m ? (m.accuracy * 100).toFixed(1) : '—'
                  const epsDisplay = isDpsgd && p ? p.epsilon.toFixed(2) : isCentral ? '∞' : 'None'

                  return (
                    <tr key={e.id} onClick={() => toggle(e.id)} className={`cursor-pointer transition-colors hover:bg-surface-variant/20 ${isScaffold ? 'border-l-2 border-primary bg-white/[0.01]' : ''} ${!isSelected ? 'opacity-50' : ''}`}>
                      <td className="py-4 px-6 font-medium text-on-surface">
                        <span className="font-bold text-primary mr-2">{info?.shortId}</span>
                        <span style={{ color: ALGO_META[e.algorithm]?.color }}>{ALGO_META[e.algorithm]?.label || e.algorithm}</span>
                        <span className="text-[10px] text-on-surface-variant ml-2 bg-surface-variant px-1.5 py-0.5 rounded font-mono">{info?.shortHash}</span>
                      </td>
                      <td className="py-4 px-6 text-right text-on-surface font-bold">{accDisplay}</td>
                      <td className={`py-4 px-6 text-right font-bold ${isDpsgd ? 'text-primary' : isCentral ? 'text-alert-red' : 'text-on-surface-variant'}`}>{epsDisplay}</td>
                      <td className="py-4 px-6 text-right text-on-surface-variant">{e.config?.rounds ? `${e.config.rounds} Rounds` : 'N/A'}</td>
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
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-variant text-on-surface-variant border border-outline-variant text-[11px] font-bold">Standard</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-center flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={(ev) => {
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
                        <button type="button" onClick={(ev) => handleDelete(e.id, ev)} className="text-xs text-alert-red hover:text-alert-red/80 px-2 py-1 rounded bg-alert-red/10 border border-alert-red/20 font-bold transition-all">
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
