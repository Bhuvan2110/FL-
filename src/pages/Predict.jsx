import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { PageHeader, EncryptionBadge, ErrorBox } from '../components/UI'

// Helper to normalize column descriptors (string vs object {name, dtype, ...}) into clean string names
const toStrCol = c => {
  if (typeof c === 'string') return c
  if (c && typeof c === 'object') return c.name || c.key || c.label || String(c)
  return String(c)
}

// Domain-specific input validation & control definitions (e.g., Sex: Male/Female select, Age: 0 to 120, etc.)
const getFeatureDomainControl = (colName) => {
  const name = String(colName).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (name === 'sex' || name === 'gender') {
    return {
      type: 'select',
      options: [
        { label: 'Male (1)', value: '1' },
        { label: 'Female (0)', value: '0' }
      ],
      label: 'Male / Female'
    }
  }
  if (name === 'fbs' || name.includes('fastingsugar')) {
    return {
      type: 'select',
      options: [
        { label: 'False — <= 120 mg/dl (0)', value: '0' },
        { label: 'True — > 120 mg/dl (1)', value: '1' }
      ],
      label: 'False / True'
    }
  }
  if (name === 'exang' || name.includes('exerciseangina')) {
    return {
      type: 'select',
      options: [
        { label: 'No (0)', value: '0' },
        { label: 'Yes (1)', value: '1' }
      ],
      label: 'No / Yes'
    }
  }
  if (name === 'cp' || name.includes('chestpain')) {
    return {
      type: 'select',
      options: [
        { label: '0: Typical Angina', value: '0' },
        { label: '1: Atypical Angina', value: '1' },
        { label: '2: Non-anginal Pain', value: '2' },
        { label: '3: Asymptomatic', value: '3' }
      ],
      label: 'Categorical (0-3)'
    }
  }
  if (name === 'restecg' || name.includes('ecg')) {
    return {
      type: 'select',
      options: [
        { label: '0: Normal', value: '0' },
        { label: '1: ST-T Wave Abnormality', value: '1' },
        { label: '2: LV Hypertrophy', value: '2' }
      ],
      label: 'Categorical (0-2)'
    }
  }
  if (name === 'slope') {
    return {
      type: 'select',
      options: [
        { label: '0: Upsloping', value: '0' },
        { label: '1: Flat', value: '1' },
        { label: '2: Downsloping', value: '2' }
      ],
      label: 'Categorical (0-2)'
    }
  }
  if (name === 'thal') {
    return {
      type: 'select',
      options: [
        { label: '0: Normal', value: '0' },
        { label: '1: Fixed Defect', value: '1' },
        { label: '2: Reversible Defect', value: '2' }
      ],
      label: 'Categorical (0-2)'
    }
  }
  if (name.includes('age')) return { type: 'number', min: 0, max: 120, label: '0 to 120 years' }
  if (name.includes('bp') || name.includes('sbp') || name.includes('dbp') || name.includes('pressure')) return { type: 'number', min: 0, max: 300, label: '0+ mmHg' }
  if (name.includes('chol') || name.includes('glucose') || name.includes('sugar')) return { type: 'number', min: 0, max: 1000, label: '0+ mg/dL' }
  if (name.includes('bmi')) return { type: 'number', min: 0, max: 100, label: '0 to 100' }
  if (name.includes('income') || name.includes('salary') || name.includes('amount') || name.includes('balance') || name.includes('debt')) return { type: 'number', min: 0, label: '0 to ∞' }

  return { type: 'number', min: 0, label: '0 to ∞ (Non-negative)' }
}

export default function Predict() {
  const { isGuest } = useAuth()
  const [datasets,          setDatasets]          = useState([])
  const [selectedDsId,      setSelectedDsId]      = useState('')
  const [mode,             setMode]             = useState('single') // 'single' | 'batch'
  const [form,             setForm]             = useState({})
  const [enabledFeatures,  setEnabledFeatures]  = useState({}) // Record<colName, boolean>
  const [nlpInput,         setNlpInput]         = useState('')
  const [singleTab,        setSingleTab]        = useState('form')   // 'form' | 'nlp'
  const [result,           setResult]           = useState(null)
  const [predictionLog,    setPredictionLog]    = useState([])
  const [batchRes,         setBatchRes]         = useState(null)
  const [batchSearch,      setBatchSearch]      = useState('')
  const [busy,             setBusy]             = useState(false)
  const [error,            setError]            = useState('')

  useEffect(() => {
    api.datasets.list()
      .then(dData => {
        const dsList = (dData.datasets || []).filter(d => d.filename || d.id)
        setDatasets(dsList)
        if (dsList.length > 0) {
          setSelectedDsId(String(dsList[0].id))
        }
      })
      .catch(e => setError(e.message))
  }, [isGuest])

  const activeDs = datasets.find(d => String(d.id) === selectedDsId)
  const rawCols = activeDs?.cols || activeDs?.feature_cols || []
  const featureCols = rawCols.map(toStrCol)

  // Re-build form state & feature enablement when selected dataset changes
  useEffect(() => {
    if (!featureCols.length) return
    const initialForm = {}
    const initialEnabled = {}
    featureCols.forEach(col => {
      const ctrl = getFeatureDomainControl(col)
      // Default value: first select option or '0'
      initialForm[col] = ctrl.type === 'select' ? ctrl.options[0].value : '0'
      initialEnabled[col] = true // Enabled by default
    })
    setForm(initialForm)
    setEnabledFeatures(initialEnabled)
    setResult(null)
    setBatchRes(null)
    setError('')
  }, [selectedDsId])

  // Feature Selection Toggles
  const toggleFeature = col => {
    setEnabledFeatures(prev => ({ ...prev, [col]: !prev[col] }))
  }

  const selectAllFeatures = () => {
    const next = {}
    featureCols.forEach(col => { next[col] = true })
    setEnabledFeatures(next)
  }

  const deselectAllFeatures = () => {
    const next = {}
    featureCols.forEach(col => { next[col] = false })
    setEnabledFeatures(next)
  }

  const enabledColsList = featureCols.filter(c => enabledFeatures[c])

  const submitSingle = async e => {
    if (e) e.preventDefault()
    if (enabledColsList.length === 0) {
      setError('Please select at least one feature to run prediction.')
      return
    }
    setBusy(true); setError('')
    try {
      const features = {}
      featureCols.forEach(col => {
        features[col] = enabledFeatures[col] ? (Number(form[col]) || 0) : 0
      })

      const res = await api.predict.single({ experiment_id: selectedDsId, features })
      setResult(res)
      setPredictionLog(prev => [{
        id: Date.now(),
        datasetName: activeDs?.filename || `Dataset #${selectedDsId}`,
        label: `Class ${res.output}`,
        confidencePct: (res.confidence * 100).toFixed(1),
        selectedCount: enabledColsList.length,
        totalCount: featureCols.length,
        isHighRisk: res.output === 1 || res.confidence > 0.5,
        ts: new Date().toLocaleTimeString([], { hour12: false })
      }, ...prev])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const submitNlpSingle = async e => {
    if (e) e.preventDefault()
    if (!nlpInput.trim()) return
    if (enabledColsList.length === 0) {
      setError('Please select at least one feature to run prediction.')
      return
    }
    setBusy(true); setError('')
    try {
      const nums = (nlpInput.match(/-?\d+(\.\d+)?/g) || []).map(Number)
      const features = {}
      featureCols.forEach((col, idx) => {
        if (enabledFeatures[col]) {
          const val = nums[idx] !== undefined ? nums[idx] : (Number(form[col]) || 0)
          const ctrl = getFeatureDomainControl(col)
          if (ctrl.type === 'number' && ctrl.min !== undefined) {
            features[col] = Math.max(ctrl.min, val)
          } else {
            features[col] = val
          }
        } else {
          features[col] = 0
        }
      })
      const res = await api.predict.single({ experiment_id: selectedDsId, features })
      setResult(res)
      setPredictionLog(prev => [{
        id: Date.now(),
        datasetName: activeDs?.filename || `Dataset #${selectedDsId}`,
        label: `Class ${res.output}`,
        confidencePct: (res.confidence * 100).toFixed(1),
        selectedCount: enabledColsList.length,
        totalCount: featureCols.length,
        isHighRisk: res.output === 1 || res.confidence > 0.5,
        ts: new Date().toLocaleTimeString([], { hour12: false })
      }, ...prev])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
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
            Object.entries(r).forEach(([k, v]) => { out[k] = Number(v) || 0 })
            return out
          })
          const data = await api.predict.batch({ experiment_id: selectedDsId, rows })
          setBatchRes(data.results || [])
        } catch (e) { setError(e.message) }
        finally { setBusy(false) }
      }
    })
  }

  const downloadSampleTemplate = () => {
    if (!featureCols.length) return
    const header = featureCols.join(',')
    const row1 = featureCols.map(() => '0.5').join(',')
    const row2 = featureCols.map(() => '1.2').join(',')
    const csvContent = `${header}\n${row1}\n${row2}`
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sample_${activeDs?.filename || 'dataset'}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const exportCsv = () => {
    if (!batchRes) return
    const csv = Papa.unparse(batchRes)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `predictions_${activeDs?.filename || 'dataset'}.csv`
    a.click()
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Predict & Inference Console"
        sub="Select dataset features to include in predictions with domain-specific input validation (e.g., Sex: Male/Female, Age: 0 to ∞)."
        badge="Uploaded Datasets"
      />

      {datasets.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-mist-500 space-y-3">
          <p>No uploaded datasets found.</p>
          <p className="text-xs text-mist-600">Please upload a dataset in the Datasets tab to start making predictions.</p>
        </div>
      ) : (
        <>
          {/* Dataset Selector Header & Mode Switcher */}
          <div className="panel p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1 min-w-[280px]">
                <label className="label block mb-1.5">Select Uploaded Dataset</label>
                <select
                  className="input w-full max-w-md"
                  value={selectedDsId}
                  onChange={e => setSelectedDsId(e.target.value)}
                >
                  {datasets.map(d => (
                    <option key={d.id} value={String(d.id)}>
                      {d.filename} ({d.rows_count} rows · Label: {toStrCol(d.label_col)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-2 bg-ink-950 p-1.5 rounded-xl border border-line">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    mode === 'single'
                      ? 'bg-signal-500/20 text-signal-300 border border-signal-500/40 shadow-sm'
                      : 'text-mist-400 hover:text-mist-200'
                  }`}
                >
                  Single Prediction
                </button>
                <button
                  type="button"
                  onClick={() => setMode('batch')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    mode === 'batch'
                      ? 'bg-signal-500/20 text-signal-300 border border-signal-500/40 shadow-sm'
                      : 'text-mist-400 hover:text-mist-200'
                  }`}
                >
                  Multiple Predictions (Batch CSV)
                  {batchRes && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-signal-500/20 text-signal-300 font-mono">
                      {batchRes.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Dataset Metadata Badge & Feature Summary */}
            {activeDs && (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-line text-xs">
                <EncryptionBadge active label="Uploaded Dataset Synced" />
                <span className="font-mono text-mist-400">
                  Rows: <strong className="text-mist-200">{activeDs.rows_count}</strong>
                </span>
                <span className="font-mono text-mist-400">
                  Target Label: <strong className="text-signal-400">{toStrCol(activeDs.label_col)}</strong>
                </span>
                <span className="font-mono text-mist-400">
                  Selected Features: <strong className="text-signal-300">{enabledColsList.length} of {featureCols.length}</strong>
                </span>
              </div>
            )}

            <ErrorBox message={error} />
          </div>

          {/* MODE 1: SINGLE PREDICTION */}
          {mode === 'single' && (
            <div className="panel p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
                <div>
                  <h2 className="text-base font-semibold text-mist-100">Single Case Evaluation</h2>
                  <p className="text-xs text-mist-500">
                    Select wanted features to include in prediction & enter domain values (e.g. Sex: Male / Female)
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-ink-950 p-1 rounded-lg border border-line text-xs">
                  <button
                    type="button"
                    onClick={() => setSingleTab('form')}
                    className={`px-3 py-1 rounded font-mono ${singleTab === 'form' ? 'bg-signal-500/20 text-signal-300 font-semibold' : 'text-mist-400'}`}
                  >
                    Feature Inputs & Selectors
                  </button>
                  <button
                    type="button"
                    onClick={() => setSingleTab('nlp')}
                    className={`px-3 py-1 rounded font-mono ${singleTab === 'nlp' ? 'bg-signal-500/20 text-signal-300 font-semibold' : 'text-mist-400'}`}
                  >
                    Natural Language
                  </button>
                </div>
              </div>

              {/* Feature Selection Quick Actions */}
              <div className="flex items-center justify-between bg-ink-950/40 p-3 rounded-xl border border-line text-xs">
                <span className="text-mist-300">
                  Include/Exclude Features: <strong className="text-signal-300 font-mono">{enabledColsList.length}</strong> selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllFeatures}
                    className="text-xs font-mono text-signal-400 hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-mist-600">·</span>
                  <button
                    type="button"
                    onClick={deselectAllFeatures}
                    className="text-xs font-mono text-mist-400 hover:underline"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {singleTab === 'form' ? (
                <form onSubmit={submitSingle} className="space-y-6">
                  {/* Feature Grid with Checkboxes & Domain Controls */}
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {featureCols.map(col => {
                      const enabled = enabledFeatures[col]
                      const ctrl = getFeatureDomainControl(col)
                      return (
                        <div
                          key={col}
                          className={`p-3.5 rounded-xl border transition-all space-y-2 ${
                            enabled
                              ? 'border-signal-500/50 bg-ink-950/80 shadow-[0_0_10px_rgba(31,200,180,0.08)]'
                              : 'border-line/40 bg-ink-950/30 opacity-60'
                          }`}
                        >
                          {/* Checkbox Header */}
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-mist-100 truncate">
                              <input
                                type="checkbox"
                                checked={!!enabled}
                                onChange={() => toggleFeature(col)}
                                className="rounded border-line bg-ink-900 text-signal-500 focus:ring-0 cursor-pointer accent-signal-400"
                              />
                              <span className={enabled ? 'text-mist-100 font-semibold' : 'text-mist-500'}>
                                {col}
                              </span>
                            </label>
                            <span className="text-[10px] font-mono text-mist-500">
                              {enabled ? 'Active' : 'Excluded'}
                            </span>
                          </div>

                          {/* Domain Control: Dropdown (Sex, ECG, FBS, etc.) or Numeric Input (Age, BP, Chol) */}
                          {enabled && (
                            <div className="space-y-1 pt-1 border-t border-line/40">
                              {ctrl.type === 'select' ? (
                                <select
                                  className="input w-full text-sm font-mono cursor-pointer"
                                  value={form[col] || ctrl.options[0].value}
                                  onChange={ev => setForm({ ...form, [col]: ev.target.value })}
                                >
                                  {ctrl.options.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  required={enabled}
                                  type="number"
                                  min={ctrl.min}
                                  max={ctrl.max}
                                  step="any"
                                  placeholder={`Enter ${col}`}
                                  className="input w-full text-sm font-mono"
                                  value={form[col] || '0'}
                                  onChange={ev => {
                                    const valStr = ev.target.value
                                    const valNum = Number(valStr)
                                    if (ctrl.min !== undefined && valNum < ctrl.min && valStr !== '') return
                                    setForm({ ...form, [col]: valStr })
                                  }}
                                />
                              )}
                              <div className="flex justify-between text-[10px] font-mono text-mist-500">
                                <span>Domain Range:</span>
                                <span className="text-signal-400 font-medium">{ctrl.label}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <button className="btn-primary px-8 py-2.5" type="submit" disabled={busy || enabledColsList.length === 0}>
                    {busy ? 'Evaluating...' : `Evaluate Selected Features (${enabledColsList.length})`}
                  </button>
                </form>
              ) : (
                <form onSubmit={submitNlpSingle} className="space-y-4">
                  <p className="text-xs text-mist-400">Describe a case in natural text (values will map to selected features):</p>
                  <textarea
                    rows={3}
                    className="input w-full text-sm p-3 font-mono"
                    placeholder={`e.g. "Case with ${enabledColsList.slice(0, 3).map(c => `${c} 12.5`).join(', ')}"`}
                    value={nlpInput}
                    onChange={e => setNlpInput(e.target.value)}
                  />
                  <button className="btn-primary px-8 py-2.5" type="submit" disabled={busy || !nlpInput.trim() || enabledColsList.length === 0}>
                    {busy ? 'Evaluating...' : 'Parse & Evaluate Selected Features'}
                  </button>
                </form>
              )}

              {/* Single Result Display Card */}
              {result && (
                <div className="p-6 rounded-xl border border-signal-500/40 bg-signal-500/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-mist-400 font-mono">Prediction Output</span>
                    <span className="text-xs font-mono text-signal-400">
                      Evaluated on {enabledColsList.length} of {featureCols.length} features
                    </span>
                  </div>
                  <div className="text-3xl font-display font-semibold text-mist-100">Class {result.output}</div>
                  <div className="text-sm text-mist-400 flex items-center gap-4 pt-1">
                    <span>Confidence: <strong className="text-signal-300 font-mono">{(result.confidence * 100).toFixed(1)}%</strong></span>
                    {result.raw_score !== undefined && (
                      <span className="font-mono text-xs text-mist-500">Raw Score: {result.raw_score}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODE 2: MULTIPLE PREDICTIONS (BATCH CSV) */}
          {mode === 'batch' && (
            <div className="panel p-6 space-y-6">
              <div>
                <h2 className="text-base font-semibold mb-1 text-mist-100">Multiple Predictions — Batch CSV Inference</h2>
                <p className="text-xs text-mist-400">
                  Upload a CSV file with headers matching dataset features: <span className="font-mono text-signal-400">{featureCols.join(', ')}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 border-2 border-dashed border-line p-8 rounded-xl text-center bg-ink-950/40">
                <label className="btn-primary cursor-pointer inline-flex items-center gap-2 px-6 py-2.5">
                  <span>Select CSV File</span>
                  <input type="file" accept=".csv" className="hidden" onChange={e => submitBatch(e.target.files[0])} />
                </label>
                <button type="button" onClick={downloadSampleTemplate} className="btn-ghost text-xs">
                  Download Sample CSV Template
                </button>
                {batchRes && (
                  <button type="button" onClick={exportCsv} className="btn-ghost text-xs text-signal-400">
                    Export Scored CSV Results
                  </button>
                )}
              </div>

              {batchRes && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-mist-400">{batchRes.length} rows scored successfully</span>
                    <input
                      type="text"
                      placeholder="Search results..."
                      value={batchSearch}
                      onChange={e => setBatchSearch(e.target.value)}
                      className="input text-xs py-1.5 px-3 max-w-xs"
                    />
                  </div>

                  <div className="overflow-x-auto border border-line rounded-lg bg-ink-950">
                    <table className="data-table w-full">
                      <thead className="bg-ink-900">
                        <tr>
                          <th>Row #</th>
                          <th>Output Class</th>
                          <th>Confidence %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchRes
                          .filter((r, i) => !batchSearch || String(r.output).includes(batchSearch) || String(i + 1).includes(batchSearch))
                          .map((r, i) => (
                            <tr key={i}>
                              <td className="font-mono text-mist-500">#{i + 1}</td>
                              <td className="font-mono font-semibold text-signal-300">Class {r.output}</td>
                              <td className="font-mono text-cipher-400">{(r.confidence * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PREDICTION LOG PANEL */}
          {predictionLog.length > 0 && (
            <div className="panel p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="text-sm font-semibold text-mist-100">Prediction History Log</h3>
                <button type="button" onClick={() => setPredictionLog([])} className="text-xs text-mist-500 hover:text-rose-400">
                  Clear Log
                </button>
              </div>

              <div className="overflow-x-auto border border-line rounded-lg bg-ink-950">
                <table className="data-table w-full text-xs">
                  <thead className="bg-ink-900">
                    <tr>
                      <th>Time</th>
                      <th>Dataset</th>
                      <th>Selected Features</th>
                      <th>Prediction</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictionLog.map(p => (
                      <tr key={p.id}>
                        <td className="font-mono text-mist-500">{p.ts}</td>
                        <td className="font-mono text-mist-200">{p.datasetName}</td>
                        <td className="font-mono text-signal-400">{p.selectedCount} / {p.totalCount}</td>
                        <td className={`font-semibold ${p.isHighRisk ? 'text-rose-400' : 'text-signal-300'}`}>{p.label}</td>
                        <td className="font-mono text-cipher-400">{p.confidencePct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
