import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { api } from '../lib/api'
import { PageHeader, EncryptionBadge, ErrorBox, ALGO_META } from '../components/UI'

export default function Predict() {
  const [experiments, setExperiments] = useState([])
  const [expId,       setExpId]       = useState('')
  const [form,        setForm]        = useState({})
  const [result,      setResult]      = useState(null)
  const [batchRes,    setBatchRes]    = useState(null)
  const [busy,        setBusy]        = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    api.predict.experiments().then(d => {
      const exps = d.experiments || []
      setExperiments(exps)
      if (exps.length) setExpId(exps[0].id)
    }).catch(e => setError(e.message))
  }, [])

  // Build feature form from experiment config
  useEffect(() => {
    if (!expId) return
    const exp = experiments.find(e => e.id === expId)
    if (!exp) return
    // Guess feature names from config or use placeholders
    const n = exp.config?.feature_cols?.length || 5
    const cols = exp.config?.feature_cols || Array.from({length:n},(_,i)=>`feature_${i+1}`)
    setForm(Object.fromEntries(cols.map(c=>[c,''])))
    setResult(null); setBatchRes(null); setError('')
  }, [expId, experiments])

  const submitSingle = async e => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const features = Object.fromEntries(Object.entries(form).map(([k,v])=>[k,Number(v)]))
      const res = await api.predict.single({ experiment_id: expId, features })
      setResult(res)
    } catch(e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const submitBatch = file => {
    if (!file) return
    Papa.parse(file, {
      header: true, dynamicTyping: true, skipEmptyLines: true,
      complete: async res => {
        setBusy(true); setError('')
        try {
          const rows = res.data.map(r => {
            const out = {}
            Object.entries(r).forEach(([k,v])=>{ out[k]=Number(v) })
            return out
          })
          const data = await api.predict.batch({ experiment_id: expId, rows })
          setBatchRes(data.results || [])
        } catch(e) { setError(e.message) }
        finally { setBusy(false) }
      }
    })
  }

  const exportCsv = () => {
    if (!batchRes) return
    const csv = Papa.unparse(batchRes)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
    a.download = 'predictions.csv'; a.click()
  }

  const featureCols = Object.keys(form)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Predict"
        sub="Inference runs on the Python backend — weights are decrypted server-side using AES-256-GCM."
        badge="Python AES-256-GCM"
      />

      {experiments.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-mist-500">
          No trained models yet. Run a training job first.
        </div>
      ) : (
        <>
          <div className="panel p-6">
            <label className="label block mb-1.5">Select model</label>
            <select className="input max-w-md" value={expId} onChange={e=>setExpId(e.target.value)}>
              {experiments.map(e => (
                <option key={e.id} value={e.id}>
                  {ALGO_META[e.algorithm]?.label} — {new Date(e.created_at).toLocaleString()}
                </option>
              ))}
            </select>
            <div className="mt-3 flex items-center gap-3">
              <EncryptionBadge active label="Python AES-256-GCM decryption (server-side)" />
            </div>
            <ErrorBox message={error} />
          </div>

          {featureCols.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Single prediction */}
              <div className="panel p-6">
                <h2 className="text-base font-semibold mb-4">Single prediction</h2>
                <form onSubmit={submitSingle} className="space-y-3">
                  {featureCols.map(c => (
                    <div key={c}>
                      <label className="label block mb-1">{c}</label>
                      <input required type="number" step="any" className="input"
                        value={form[c]} onChange={ev=>setForm({...form,[c]:ev.target.value})} />
                    </div>
                  ))}
                  <button className="btn-primary w-full" type="submit" disabled={busy}>
                    {busy ? 'Predicting…' : 'Predict'}
                  </button>
                </form>

                {result && (
                  <div className="mt-4 p-4 rounded-xl border border-signal-500/30 bg-signal-500/10">
                    <div className="text-xs uppercase tracking-wider text-mist-500 mb-1">Prediction</div>
                    <div className="text-3xl font-display font-semibold text-mist-100">Class {result.output}</div>
                    <div className="text-sm text-mist-500 mt-1">
                      Confidence: <span className="text-cipher-400 font-mono">{(result.confidence*100).toFixed(1)}%</span>
                    </div>
                    <div className="text-xs text-mist-700 mt-1 font-mono">raw score: {result.raw_score}</div>
                  </div>
                )}
              </div>

              {/* Batch prediction */}
              <div className="panel p-6">
                <h2 className="text-base font-semibold mb-2">Batch prediction</h2>
                <p className="text-sm text-mist-500 mb-4">
                  Upload a CSV with columns: <span className="font-mono text-xs text-signal-400">{featureCols.join(', ')}</span>
                </p>
                <label className="btn-ghost cursor-pointer inline-flex mb-4">
                  Choose CSV
                  <input type="file" accept=".csv" className="hidden"
                    onChange={e=>submitBatch(e.target.files[0])} />
                </label>

                {batchRes && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-mist-500">{batchRes.length} rows scored</span>
                      <button onClick={exportCsv} className="text-xs text-signal-400 hover:text-signal-300">
                        Export CSV →
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto scrollbar-thin">
                      <table className="data-table">
                        <thead><tr><th>#</th><th>Output</th><th>Confidence</th></tr></thead>
                        <tbody>
                          {batchRes.slice(0,50).map((r,i) => (
                            <tr key={i}>
                              <td>{i+1}</td>
                              <td className="font-mono">{r.output}</td>
                              <td className="font-mono text-cipher-400">{(r.confidence*100).toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
