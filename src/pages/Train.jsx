import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { api } from '../lib/api'
import { PageHeader, EncryptionBadge, ErrorBox, ALGO_META } from '../components/UI'

const DEFAULTS = { rounds: 20, lr: 0.4, local_epochs: 3, num_clients: 4, iid: true, alpha: 0.5, mu: 0.05, clip_norm: 1.0, noise_multiplier: 1.2, delta: 1e-5 }

const PRESETS = [
  { name: 'Fast', rounds: 10, lr: 0.5, num_clients: 3, local_epochs: 2, algo: 'fedavg', desc: 'Quick prototype' },
  { name: 'Balanced', rounds: 20, lr: 0.4, num_clients: 4, local_epochs: 3, algo: 'fedavg', desc: 'Standard FL research' },
  { name: 'Thorough', rounds: 30, lr: 0.3, num_clients: 6, local_epochs: 4, algo: 'scaffold', desc: 'High precision' },
  { name: 'Privacy-First', rounds: 20, lr: 0.4, clip_norm: 1.0, noise_multiplier: 1.5, algo: 'dpsgd', desc: 'Tight ε guarantees' },
  { name: 'Byzantine-Robust', rounds: 20, lr: 0.4, num_clients: 5, local_epochs: 3, algo: 'krum', desc: 'Model poisoning defense' },
]

function NumField({ label, value, onChange, step=1, min, max }) {
  return (
    <div>
      <label className="label block mb-1.5">{label}</label>
      <input type="number" className="input" value={value} step={step} min={min} max={max}
        onChange={e => onChange(parseFloat(e.target.value))} />
    </div>
  )
}

function MetricBox({ label, value }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="font-display text-lg font-semibold">{typeof value === 'number' ? (value * 100).toFixed(1) + '%' : value || '—'}</div>
    </div>
  )
}

export default function Train() {
  const [datasets,    setDatasets]    = useState([])
  const [datasetId,   setDatasetId]   = useState('')
  const [algorithm,   setAlgorithm]   = useState('fedavg')
  const [cfg,         setCfg]         = useState(DEFAULTS)
  const [status,      setStatus]      = useState('idle')
  const [history,     setHistory]     = useState([])
  const [privacy,     setPrivacy]     = useState([])
  const [finalResult, setFinalResult] = useState(null)
  const [encActive,   setEncActive]   = useState(false)
  const [log,         setLog]         = useState('')
  const [error,       setError]       = useState('')

  // Load datasets & restore last training run from localStorage
  useEffect(() => {
    api.datasets.list().then(d => {
      const ds = d.datasets || []
      setDatasets(ds)
      if (ds.length) setDatasetId(ds[0].id)
    }).catch(console.error)

    try {
      const cached = localStorage.getItem('fedshield_last_run')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed.history?.length) {
          setHistory(parsed.history)
          setPrivacy(parsed.privacy || [])
          setFinalResult(parsed.finalResult || null)
          setEncActive(true)
          setStatus('done')
          setLog('Restored previous session training results.')
        }
      }
    } catch (e) {
      console.error('Failed to load cached run', e)
    }
  }, [])

  const applyPreset = preset => {
    setAlgorithm(preset.algo)
    setCfg(prev => ({
      ...prev,
      rounds: preset.rounds,
      lr: preset.lr,
      num_clients: preset.num_clients || prev.num_clients,
      local_epochs: preset.local_epochs || prev.local_epochs,
      clip_norm: preset.clip_norm || prev.clip_norm,
      noise_multiplier: preset.noise_multiplier || prev.noise_multiplier,
    }))
  }

  const run = async () => {
    setStatus('running'); setError(''); setHistory([]); setPrivacy([])
    setFinalResult(null); setEncActive(false)
    setLog('Sending training request to Python backend...')
    try {
      const body = { dataset_id: datasetId, algorithm, ...cfg }
      setLog(`Running ${ALGO_META[algorithm]?.label} for up to ${cfg.rounds} rounds on Vercel Python...`)
      const result = await api.train.run(body)
      setHistory(result.history || [])
      setPrivacy(result.privacy || [])
      setFinalResult({ metrics: result.metrics, roc: result.roc })
      setEncActive(true)
      setStatus('done')
      setLog('Done — model encrypted with AES-256-GCM and saved.')

      // Cache to localStorage
      try {
        localStorage.setItem('fedshield_last_run', JSON.stringify({
          history: result.history,
          privacy: result.privacy,
          finalResult: { metrics: result.metrics, roc: result.roc }
        }))
      } catch (e) {}
    } catch (e) {
      setError(e.message || String(e))
      setStatus('error')
      setLog('')
    }
  }

  const algoNeedsClients = ['fedavg', 'fedprox', 'scaffold', 'krum'].includes(algorithm)

  // Estimated DP-SGD privacy epsilon calculation for live utility simulator
  const simEpsilon = algorithm === 'dpsgd'
    ? (Math.sqrt(2 * cfg.rounds * Math.log(1.25 / (cfg.delta || 1e-5))) / (cfg.noise_multiplier || 1.1)).toFixed(2)
    : null

  return (
    <div className="space-y-8">
      <PageHeader title="Train & Simulation Lab" sub="Configure an FL algorithm with live privacy-utility estimation and training presets." />

      {/* Quick Presets Bar */}
      <div className="panel p-4 flex flex-wrap items-center gap-3 bg-surface-container-low border border-outline-variant">
        <span className="font-label-caps text-xs text-on-surface-variant mr-1 font-bold">Quick Presets:</span>
        {PRESETS.map(p => (
          <button
            key={p.name}
            onClick={() => applyPreset(p)}
            className="px-3 py-1.5 rounded-lg border border-outline-variant hover:border-primary text-xs font-code-sm text-on-surface hover:text-primary bg-surface-container-high transition-all flex items-center gap-1.5"
            title={p.desc}
          >
            <span className="font-bold text-primary">{p.name}</span>
            <span className="text-[10px] text-on-surface-variant font-mono">({p.algo})</span>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <div className="panel p-6 space-y-5 h-fit">
          <div>
            <label className="label block mb-1.5">Dataset</label>
            <select className="input" value={datasetId} onChange={e => setDatasetId(e.target.value)}>
              {datasets.length === 0 && <option>No datasets — generate one first</option>}
              {datasets.map(d => <option key={d.id} value={d.id}>{d.filename} ({d.rows_count} rows)</option>)}
            </select>
          </div>

          <div>
            <label className="label block mb-1.5">Algorithm</label>
            <div className="space-y-1.5">
              {Object.entries(ALGO_META).map(([key, meta]) => (
                <button key={key} onClick={() => setAlgorithm(key)}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-sm transition ${algorithm === key ? 'border-signal-500/50 bg-signal-500/10' : 'border-ink-600 text-mist-500 hover:border-ink-500'}`}>
                  <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: meta.color }} />
                  {meta.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumField label="Rounds (max 30)" value={cfg.rounds} onChange={v => setCfg({ ...cfg, rounds: Math.min(v, 30) })} min={5} max={30} />
            <NumField label="Learning rate" value={cfg.lr} onChange={v => setCfg({ ...cfg, lr: v })} step={0.05} min={0.01} max={2} />
            {algoNeedsClients && <NumField label="Clients" value={cfg.num_clients} onChange={v => setCfg({ ...cfg, num_clients: v })} min={2} max={12} />}
            {algoNeedsClients && <NumField label="Local epochs" value={cfg.local_epochs} onChange={v => setCfg({ ...cfg, local_epochs: v })} min={1} max={10} />}
            {algorithm === 'fedprox' && <NumField label="Proximal μ" value={cfg.mu} onChange={v => setCfg({ ...cfg, mu: v })} step={0.01} min={0} max={1} />}
            {algorithm === 'dpsgd' && <NumField label="Clip norm" value={cfg.clip_norm} onChange={v => setCfg({ ...cfg, clip_norm: v })} step={0.1} min={0.1} max={5} />}
            {algorithm === 'dpsgd' && <NumField label="Noise σ" value={cfg.noise_multiplier} onChange={v => setCfg({ ...cfg, noise_multiplier: v })} step={0.1} min={0.3} max={5} />}
          </div>

          {/* Privacy-Utility Live Simulator Card when DP-SGD selected */}
          {algorithm === 'dpsgd' && (
            <div className="p-4 rounded-xl border border-encryption-gold/40 bg-encryption-gold/10 space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-encryption-gold font-bold">DP Privacy Trade-off</span>
                <span className="px-2 py-0.5 rounded bg-encryption-gold/20 text-encryption-gold font-bold">
                  Est. ε ≈ {simEpsilon}
                </span>
              </div>
              <div className="text-[11px] text-on-surface-variant font-mono space-y-1">
                <p>Noise σ: <strong className="text-on-surface">{cfg.noise_multiplier}</strong> | Clip: <strong className="text-on-surface">{cfg.clip_norm}</strong></p>
                <p>Guarantee: {simEpsilon < 3 ? '🔒 Strong Privacy' : simEpsilon < 6 ? '🛡️ Moderate Privacy' : '⚠️ Loose Privacy'}</p>
              </div>
            </div>
          )}

          {/* Data Distribution selector & Dirichlet Alpha slider */}
          {algoNeedsClients && (
            <div className="space-y-2">
              <label className="label block mb-1">Data distribution</label>
              <div className="flex gap-2">
                <button onClick={() => setCfg({ ...cfg, iid: true })}  className={`flex-1 px-3 py-2 rounded-xl border text-sm ${cfg.iid  ? 'border-signal-500/50 bg-signal-500/10 font-bold' : 'border-ink-600 text-mist-500'}`}>IID</button>
                <button onClick={() => setCfg({ ...cfg, iid: false })} className={`flex-1 px-3 py-2 rounded-xl border text-sm ${!cfg.iid ? 'border-signal-500/50 bg-signal-500/10 font-bold' : 'border-ink-600 text-mist-500'}`}>Non-IID</button>
              </div>
              {!cfg.iid && (
                <div className="pt-2">
                  <div className="flex justify-between text-xs font-mono text-mist-400 mb-1">
                    <span>Dirichlet Heterogeneity (α):</span>
                    <strong className="text-primary">{cfg.alpha}</strong>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="5.0"
                    step="0.1"
                    value={cfg.alpha}
                    onChange={e => setCfg({ ...cfg, alpha: parseFloat(e.target.value) })}
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-mist-500 font-mono">
                    <span>α=0.1 (Extreme skew)</span>
                    <span>α=5.0 (Near IID)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <button className="btn-primary w-full" disabled={!datasetId || status === 'running'} onClick={run}>
            {status === 'running' ? '⟳ Running on Python (Vercel)…' : 'Run training'}
          </button>
          <ErrorBox message={error} />
          {log && <div className="font-mono text-xs text-mist-500 border-t border-ink-700/70 pt-3">› {log}</div>}
        </div>

        <div className="space-y-6">
          <div className="panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Training progress</h2>
              <EncryptionBadge active={encActive} label={encActive ? 'AES-256-GCM saved' : 'awaiting run'} />
            </div>
            {history.length === 0 ? (
              <div className="h-60 flex items-center justify-center text-sm text-mist-500 font-mono">
                {status === 'running' ? 'Python training in progress…' : 'awaiting run…'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3D" />
                  <XAxis dataKey="round" stroke="#4B5566" fontSize={11} />
                  <YAxis stroke="#4B5566" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2A3D', borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="loss"     stroke="#F0618C" strokeWidth={2} dot={false} name="Loss" />
                  <Line type="monotone" dataKey="accuracy" stroke="#4FE3C1" strokeWidth={2} dot={false} name="Accuracy" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {privacy.length > 0 && (
            <div className="panel p-6">
              <h2 className="text-base font-semibold mb-4">Privacy budget ε (DP-SGD)</h2>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={privacy}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3D" />
                  <XAxis dataKey="round" stroke="#4B5566" fontSize={11} />
                  <YAxis stroke="#4B5566" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2A3D', borderRadius: 12, fontSize: 12 }} />
                  <Line type="monotone" dataKey="epsilon" stroke="#F2A94E" strokeWidth={2} dot={false} name="ε" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {finalResult && (
            <div className="panel p-6">
              <h2 className="text-base font-semibold mb-4">Test-set report</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <MetricBox label="Accuracy"  value={finalResult.metrics.accuracy} />
                <MetricBox label="Precision" value={finalResult.metrics.precision} />
                <MetricBox label="Recall"    value={finalResult.metrics.recall} />
                <MetricBox label="F1"        value={finalResult.metrics.f1} />
              </div>

              {/* Extra Convergence Speed Metric callout */}
              {finalResult.metrics.conv_round && (
                <div className="mb-4 p-3 rounded-lg border border-primary/30 bg-primary/10 text-xs font-mono flex items-center justify-between">
                  <span className="text-on-surface">Convergence Speed (80% target):</span>
                  <span className="text-primary font-bold">{finalResult.metrics.conv_round} Rounds</span>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <div className="label mb-2">Confusion matrix</div>
                  <div className="grid grid-cols-2 gap-1.5 text-center text-sm font-mono max-w-[200px]">
                    <div className="bg-cipher-500/15 border border-cipher-500/30 rounded-lg py-3">TP {finalResult.metrics.tp}</div>
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg py-3">FP {finalResult.metrics.fp}</div>
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg py-3">FN {finalResult.metrics.fn}</div>
                    <div className="bg-cipher-500/15 border border-cipher-500/30 rounded-lg py-3">TN {finalResult.metrics.tn}</div>
                  </div>
                </div>
                <div>
                  <div className="label mb-2">ROC — AUC {finalResult.metrics.auc?.toFixed(3)}</div>
                  {finalResult.roc && (
                    <ResponsiveContainer width="100%" height={140}>
                      <LineChart data={finalResult.roc}>
                        <XAxis dataKey="fpr" stroke="#4B5566" fontSize={10} domain={[0,1]} type="number" />
                        <YAxis stroke="#4B5566" fontSize={10} domain={[0,1]} />
                        <Line type="monotone" dataKey="tpr" stroke="#6C7CFF" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
