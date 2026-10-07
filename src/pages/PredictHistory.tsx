import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { PageHeader, EncryptionBadge, ErrorBox, StatCard } from '../components/UI'
import type { PredictionRecord } from '../types'

export default function PredictHistory() {
  const { isGuest } = useAuth()
  const [history, setHistory] = useState<PredictionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState<'all' | '0' | '1'>('all')
  const [selectedItem, setSelectedItem] = useState<PredictionRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadHistory = () => {
    setLoading(true)
    setError('')
    api.predict
      .history(200)
      .then((res) => {
        setHistory(res.predictions || [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadHistory()
  }, [isGuest])

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear all prediction history?')) return
    try {
      await api.predict.clearHistory()
      setHistory([])
      setSelectedItem(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDeleteItem = async (id: string) => {
    setDeletingId(id)
    try {
      await api.predict.clearHistory(id)
      setHistory((prev) => prev.filter((item) => item.id !== id))
      if (selectedItem?.id === id) setSelectedItem(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  const exportCsv = () => {
    if (history.length === 0) return
    const exportData = history.map((h) => ({
      id: h.id,
      timestamp: new Date(h.created_at).toLocaleString(),
      input_hash: h.input_hash,
      model_id: h.model_id,
      output_class: h.output,
      confidence_pct: (h.confidence * 100).toFixed(1) + '%',
      input_features: JSON.stringify(h.input),
    }))
    const csv = Papa.unparse(exportData)
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `prediction_history_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const filteredHistory = history.filter((item) => {
    if (classFilter !== 'all' && String(item.output) !== classFilter) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const inputStr = JSON.stringify(item.input).toLowerCase()
    const hashStr = String(item.input_hash).toLowerCase()
    const modelStr = String(item.model_id).toLowerCase()
    return inputStr.includes(q) || hashStr.includes(q) || modelStr.includes(q)
  })

  const highRiskCount = history.filter((h) => h.output === 1 || h.confidence > 0.5).length
  const avgConfidence =
    history.length > 0 ? (history.reduce((acc, curr) => acc + (curr.confidence || 0), 0) / history.length) * 100 : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prediction History & Audit Log"
        sub="Browse, search, inspect input features, and export previous model inference predictions."
        badge="Encrypted History"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Inferences" value={loading ? '—' : history.length} sub="recorded predictions" accent="signal" />
        <StatCard label="High Risk / Class 1" value={loading ? '—' : highRiskCount} sub={`${history.length ? ((highRiskCount / history.length) * 100).toFixed(1) : 0}% of total`} accent="amber" />
        <StatCard label="Avg Confidence" value={loading ? '—' : `${avgConfidence.toFixed(1)}%`} sub="across evaluated inputs" accent="cipher" />
        <StatCard label="Audited Hashes" value={loading ? '—' : new Set(history.map((h) => h.input_hash)).size} sub="unique SHA-256 payloads" accent="signal" />
      </div>

      <div className="panel p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-3 flex-1 min-w-[260px]">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-mist-500 text-[18px]">search</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by input feature, hash, or model ID..."
                className="input pl-9 text-xs font-mono py-2"
              />
            </div>
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-xs text-mist-400 hover:text-mist-100 font-mono">
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-ink-950 p-1 rounded-xl border border-line text-xs">
              <button
                type="button"
                onClick={() => setClassFilter('all')}
                className={`px-3 py-1 rounded-lg font-mono text-xs font-semibold transition ${
                  classFilter === 'all' ? 'bg-signal-500/20 text-signal-300 border border-signal-500/40' : 'text-mist-400 hover:text-mist-200'
                }`}
              >
                All ({history.length})
              </button>
              <button
                type="button"
                onClick={() => setClassFilter('0')}
                className={`px-3 py-1 rounded-lg font-mono text-xs font-semibold transition ${
                  classFilter === '0' ? 'bg-cipher-500/20 text-cipher-400 border border-cipher-500/40' : 'text-mist-400 hover:text-mist-200'
                }`}
              >
                Class 0 Low
              </button>
              <button
                type="button"
                onClick={() => setClassFilter('1')}
                className={`px-3 py-1 rounded-lg font-mono text-xs font-semibold transition ${
                  classFilter === '1' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-mist-400 hover:text-mist-200'
                }`}
              >
                Class 1 High
              </button>
            </div>

            <button
              type="button"
              onClick={exportCsv}
              disabled={history.length === 0}
              className="px-3.5 py-2 rounded-xl border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-mono font-semibold transition flex items-center gap-1.5 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Export CSV
            </button>

            {history.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="px-3 py-2 rounded-xl border border-alert-red/30 bg-alert-red/10 text-alert-red hover:bg-alert-red/20 text-xs font-mono font-semibold transition flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                Clear All
              </button>
            )}
          </div>
        </div>

        <ErrorBox message={error} />

        {loading ? (
          <div className="p-12 text-center text-mist-500 text-sm font-mono space-y-2">
            <div className="inline-block animate-spin text-primary">⚡</div>
            <p>Fetching prediction records from encrypted store...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="p-10 text-center text-sm text-mist-500 space-y-3">
            <p className="font-semibold text-mist-300">No prediction history entries found.</p>
            <p className="text-xs text-mist-600">Run predictions in the Prediction Console to store evaluation records here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left border-collapse font-code-sm text-xs">
              <thead>
                <tr className="border-b-2 border-outline-variant bg-surface-container-highest text-mist-400">
                  <th className="py-3 px-4 font-label-caps text-[11px]">Timestamp</th>
                  <th className="py-3 px-4 font-label-caps text-[11px]">Input SHA-256 Hash</th>
                  <th className="py-3 px-4 font-label-caps text-[11px]">Features Sample</th>
                  <th className="py-3 px-4 font-label-caps text-[11px]">Output Class</th>
                  <th className="py-3 px-4 font-label-caps text-[11px]">Confidence</th>
                  <th className="py-3 px-4 font-label-caps text-[11px] text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {filteredHistory.map((item) => {
                  const isHigh = item.output === 1 || item.confidence > 0.5
                  const featurePairs = Object.entries(item.input || {})
                  const sampleText = featurePairs.slice(0, 3).map(([k, v]) => `${k}:${v}`).join(', ')
                  const truncatedHash = item.input_hash ? `${item.input_hash.slice(0, 10)}...${item.input_hash.slice(-6)}` : '—'

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="hover:bg-surface-variant/30 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 text-mist-300 font-mono whitespace-nowrap">
                        {new Date(item.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                      </td>
                      <td className="py-3 px-4 text-signal-300 font-mono">{truncatedHash}</td>
                      <td className="py-3 px-4 text-mist-400 max-w-xs truncate" title={JSON.stringify(item.input)}>
                        {sampleText || 'Default Features'}
                        {featurePairs.length > 3 && <span className="text-mist-600"> (+{featurePairs.length - 3} more)</span>}
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono border ${
                            isHigh
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                              : 'bg-cipher-500/15 text-cipher-400 border-cipher-500/40'
                          }`}
                        >
                          {isHigh ? '⚠️ Class 1 (High Risk)' : '✅ Class 0 (Low Risk)'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-mist-100">
                        {(item.confidence * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(ev) => ev.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className="px-2.5 py-1 rounded bg-ink-900 border border-line text-mist-300 hover:text-signal-300 hover:border-signal-500/40 text-[11px] transition"
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 rounded text-mist-500 hover:text-alert-red hover:bg-alert-red/10 transition"
                            title="Delete Record"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-signal-500/40 bg-ink-950 p-6 shadow-2xl space-y-5 scrollbar-thin">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-base font-semibold text-signal-300">Prediction Record Inspection</h2>
                <p className="text-xs text-mist-400">ID: {selectedItem.id}</p>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)} className="text-mist-400 hover:text-mist-100 font-mono text-sm">
                ✕
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3 rounded-xl bg-ink-900 border border-line space-y-1">
                <span className="text-mist-500 uppercase tracking-wider text-[10px]">INFERENCE RESULT</span>
                <div className="text-lg font-bold text-mist-100">
                  {selectedItem.output === 1 ? '⚠️ Class 1 (High Risk)' : '✅ Class 0 (Low Risk)'}
                </div>
                <div className="text-signal-300">Confidence: {(selectedItem.confidence * 100).toFixed(2)}%</div>
              </div>

              <div className="p-3 rounded-xl bg-ink-900 border border-line space-y-1">
                <span className="text-mist-500 uppercase tracking-wider text-[10px]">AUDIT SECURITY</span>
                <div className="text-mist-200 truncate">Model ID: {selectedItem.model_id}</div>
                <div className="text-encryption-gold flex items-center gap-1">
                  <EncryptionBadge active label="SHA-256 Input Verified" />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="label text-[11px] uppercase tracking-wider">SHA-256 INPUT PAYLOAD HASH</span>
              <div className="p-3 rounded-xl bg-ink-900 border border-line text-xs font-mono text-signal-300 break-all select-all">
                {selectedItem.input_hash}
              </div>
            </div>

            <div className="space-y-1">
              <span className="label text-[11px] uppercase tracking-wider">INPUT FEATURE DICTIONARY</span>
              <pre className="p-4 rounded-xl bg-ink-900 border border-line text-xs font-mono text-mist-200 max-h-60 overflow-y-auto scrollbar-thin select-all">
                {JSON.stringify(selectedItem.input, null, 2)}
              </pre>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-line text-xs">
              <span className="text-mist-500 font-mono">
                Evaluated: {new Date(selectedItem.created_at).toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteItem(selectedItem.id)}
                  className="px-3 py-1.5 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red hover:bg-alert-red/20 font-mono transition"
                >
                  Delete Entry
                </button>
                <button type="button" onClick={() => setSelectedItem(null)} className="btn-ghost py-1.5 px-4 text-xs">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
