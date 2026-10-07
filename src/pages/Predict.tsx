import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { PageHeader, EncryptionBadge, ErrorBox } from '../components/UI'
import type { Dataset, PredictBatchRow, PredictSingleResult } from '../types'

const toStrCol = (c: string | { name?: string; key?: string; label?: string }): string => {
  if (typeof c === 'string') return c
  if (c && typeof c === 'object') return c.name || c.key || c.label || String(c)
  return String(c)
}

interface DomainControl {
  type: 'select' | 'number'
  options?: { label: string; value: string }[]
  min?: number
  max?: number
  label: string
}

const getFeatureDomainControl = (colName: string): DomainControl => {
  const name = String(colName).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (name === 'sex' || name === 'gender') return { type: 'select', options: [{ label: 'Male (1)', value: '1' }, { label: 'Female (0)', value: '0' }], label: 'Male / Female' }
  if (name === 'fbs' || name.includes('fastingsugar')) return { type: 'select', options: [{ label: 'False — <= 120 mg/dl (0)', value: '0' }, { label: 'True — > 120 mg/dl (1)', value: '1' }], label: 'False / True' }
  if (name === 'exang' || name.includes('exerciseangina')) return { type: 'select', options: [{ label: 'No (0)', value: '0' }, { label: 'Yes (1)', value: '1' }], label: 'No / Yes' }
  if (name === 'cp' || name.includes('chestpain')) {
    return {
      type: 'select',
      options: [
        { label: '0: Typical Angina', value: '0' },
        { label: '1: Atypical Angina', value: '1' },
        { label: '2: Non-anginal Pain', value: '2' },
        { label: '3: Asymptomatic', value: '3' },
      ],
      label: 'Categorical (0-3)',
    }
  }
  if (name === 'restecg' || name.includes('ecg')) {
    return {
      type: 'select',
      options: [
        { label: '0: Normal', value: '0' },
        { label: '1: ST-T Wave Abnormality', value: '1' },
        { label: '2: LV Hypertrophy', value: '2' },
      ],
      label: 'Categorical (0-2)',
    }
  }
  if (name === 'slope') {
    return {
      type: 'select',
      options: [
        { label: '0: Upsloping', value: '0' },
        { label: '1: Flat', value: '1' },
        { label: '2: Downsloping', value: '2' },
      ],
      label: 'Categorical (0-2)',
    }
  }
  if (name === 'thal') {
    return {
      type: 'select',
      options: [
        { label: '0: Normal', value: '0' },
        { label: '1: Fixed Defect', value: '1' },
        { label: '2: Reversible Defect', value: '2' },
      ],
      label: 'Categorical (0-2)',
    }
  }
  if (name.includes('age')) return { type: 'number', min: 0, max: 120, label: '0 to 120 years' }
  if (name.includes('bp') || name.includes('sbp') || name.includes('dbp') || name.includes('pressure')) return { type: 'number', min: 0, max: 300, label: '0+ mmHg' }
  if (name.includes('chol') || name.includes('glucose') || name.includes('sugar')) return { type: 'number', min: 0, max: 1000, label: '0+ mg/dL' }
  if (name.includes('bmi')) return { type: 'number', min: 0, max: 100, label: '0 to 100' }
  if (name.includes('income') || name.includes('salary') || name.includes('amount') || name.includes('balance') || name.includes('debt')) return { type: 'number', min: 0, label: '0 to ∞' }
  return { type: 'number', min: 0, label: '0 to ∞ (Non-negative)' }
}

interface DomainCategoryPreset {
  name: string
  defaultDatasetName: string
  features: string[]
  targetCandidates: string[]
  defaultTarget: string
}

const CATEGORY_PRESETS: Record<string, DomainCategoryPreset> = {
  Medical: {
    name: 'Medical',
    defaultDatasetName: 'medical_sample_predictions',
    features: ['age', 'systolic_bp', 'cholesterol_mg', 'max_heart_rate', 'bmi', 'fasting_blood_sugar', 'exercise_angina'],
    targetCandidates: ['heart_disease_risk', 'diabetes_risk', 'stroke_flag'],
    defaultTarget: 'heart_disease_risk',
  },
  Financial: {
    name: 'Financial',
    defaultDatasetName: 'financial_sample_predictions',
    features: ['annual_income_k', 'credit_score', 'debt_to_income_ratio', 'revolving_balance', 'late_payment_count', 'credit_age_years'],
    targetCandidates: ['fraud_flag', 'loan_default_risk', 'credit_approval'],
    defaultTarget: 'fraud_flag',
  },
  Cybersecurity: {
    name: 'Cybersecurity',
    defaultDatasetName: 'cybersecurity_sample_predictions',
    features: ['packet_size_bytes', 'failed_logins', 'session_duration_s', 'port_number', 'payload_entropy', 'request_rate_per_min'],
    targetCandidates: ['intrusion_detected', 'malware_flag', 'anomaly_score'],
    defaultTarget: 'intrusion_detected',
  },
  Telecom: {
    name: 'Telecom',
    defaultDatasetName: 'telecom_sample_predictions',
    features: ['tenure_months', 'monthly_charge_usd', 'support_calls_count', 'data_usage_gb', 'contract_type_months', 'international_plan'],
    targetCandidates: ['churn_risk', 'service_upgrade', 'payment_default'],
    defaultTarget: 'churn_risk',
  },
  Energy: {
    name: 'Energy',
    defaultDatasetName: 'energy_sample_predictions',
    features: ['grid_load_mw', 'voltage_kv', 'temperature_celsius', 'solar_output_kw', 'substation_age_years', 'peak_demand_ratio'],
    targetCandidates: ['power_outage_risk', 'grid_failure_flag', 'overload_warning'],
    defaultTarget: 'power_outage_risk',
  },
  Education: {
    name: 'Education',
    defaultDatasetName: 'education_sample_predictions',
    features: ['gpa_score', 'attendance_rate_pct', 'weekly_study_hours', 'assignment_completion_pct', 'family_income_k', 'prior_credits'],
    targetCandidates: ['dropout_risk', 'honor_roll_status', 'graduation_flag'],
    defaultTarget: 'dropout_risk',
  },
}

interface SampleModalState {
  category: string
  datasetName: string
  nRows: number
  selectedFeatures: Record<string, boolean>
  targetCol: string
}

const generateSampleRows = (
  nRows: number,
  featureCols: string[],
  seed = Math.floor(Math.random() * 99999)
): Record<string, number>[] => {
  const rows: Record<string, number>[] = []
  let a = seed >>> 0
  const rng = () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  for (let i = 0; i < nRows; i++) {
    const row: Record<string, number> = {}
    featureCols.forEach((col) => {
      const name = col.toLowerCase()
      if (name.includes('age')) row[col] = Math.floor(20 + rng() * 55)
      else if (name.includes('bp') || name.includes('pressure')) row[col] = Math.floor(105 + rng() * 50)
      else if (name.includes('chol')) row[col] = Math.floor(160 + rng() * 120)
      else if (name.includes('income')) row[col] = +(25 + rng() * 110).toFixed(1)
      else if (name.includes('score') || name.includes('credit')) row[col] = Math.floor(560 + rng() * 240)
      else if (name.includes('rate') || name.includes('pct')) row[col] = +(rng() * 100).toFixed(1)
      else if (name.includes('size') || name.includes('packet')) row[col] = Math.floor(64 + rng() * 1400)
      else {
        const u1 = Math.max(rng(), 1e-9)
        const u2 = rng()
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
        row[col] = +(z * 2 + 5).toFixed(2)
      }
    })
    rows.push(row)
  }
  return rows
}

interface PredictionLogEntry {
  id: number
  datasetName: string
  label: string
  confidencePct: string
  selectedCount: number
  totalCount: number
  isHighRisk: boolean
  ts: string
}

export default function Predict() {
  const { isGuest } = useAuth()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [selectedDsId, setSelectedDsId] = useState('')
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [form, setForm] = useState<Record<string, string>>({})
  const [enabledFeatures, setEnabledFeatures] = useState<Record<string, boolean>>({})
  const [nlpInput, setNlpInput] = useState('')
  const [singleTab, setSingleTab] = useState<'form' | 'nlp'>('form')
  const [result, setResult] = useState<PredictSingleResult | null>(null)
  const [predictionLog, setPredictionLog] = useState<PredictionLogEntry[]>([])
  const [batchRes, setBatchRes] = useState<PredictBatchRow[] | null>(null)
  const [batchSearch, setBatchSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sampleModal, setSampleModal] = useState<SampleModalState | null>(null)

  useEffect(() => {
    api.datasets
      .list()
      .then((dData) => {
        const dsList = (dData.datasets || []).filter((d) => d.filename || d.id)
        setDatasets(dsList)
        if (dsList.length > 0) setSelectedDsId(String(dsList[0].id))
      })
      .catch((e) => setError(e.message))
  }, [isGuest])

  const activeDs = datasets.find((d) => String(d.id) === selectedDsId)
  const rawCols = (activeDs?.cols as (string | { name?: string })[]) || []
  const featureCols = rawCols.map(toStrCol)

  useEffect(() => {
    if (!featureCols.length) return
    const initialForm: Record<string, string> = {}
    const initialEnabled: Record<string, boolean> = {}
    featureCols.forEach((col) => {
      const ctrl = getFeatureDomainControl(col)
      initialForm[col] = ctrl.type === 'select' && ctrl.options ? ctrl.options[0].value : '0'
      initialEnabled[col] = true
    })
    setForm(initialForm)
    setEnabledFeatures(initialEnabled)
    setResult(null)
    setBatchRes(null)
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDsId])

  const toggleFeature = (col: string) => setEnabledFeatures((prev) => ({ ...prev, [col]: !prev[col] }))
  const selectAllFeatures = () => {
    const next: Record<string, boolean> = {}
    featureCols.forEach((col) => (next[col] = true))
    setEnabledFeatures(next)
  }
  const deselectAllFeatures = () => {
    const next: Record<string, boolean> = {}
    featureCols.forEach((col) => (next[col] = false))
    setEnabledFeatures(next)
  }

  const enabledColsList = featureCols.filter((c) => enabledFeatures[c])

  const logPrediction = (res: PredictSingleResult) => {
    setPredictionLog((prev) => [
      {
        id: Date.now(),
        datasetName: activeDs?.filename || `Dataset #${selectedDsId}`,
        label: `Class ${res.output}`,
        confidencePct: (res.confidence * 100).toFixed(1),
        selectedCount: enabledColsList.length,
        totalCount: featureCols.length,
        isHighRisk: res.output === 1 || res.confidence > 0.5,
        ts: new Date().toLocaleTimeString([], { hour12: false }),
      },
      ...prev,
    ])
  }

  const submitSingle = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    if (enabledColsList.length === 0) {
      setError('Please select at least one feature to run prediction.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const features: Record<string, number> = {}
      featureCols.forEach((col) => {
        features[col] = enabledFeatures[col] ? Number(form[col]) || 0 : 0
      })
      const res = await api.predict.single({ experiment_id: selectedDsId, features })
      setResult(res)
      logPrediction(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const submitNlpSingle = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    if (!nlpInput.trim()) return
    if (enabledColsList.length === 0) {
      setError('Please select at least one feature to run prediction.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const nums = (nlpInput.match(/-?\d+(\.\d+)?/g) || []).map(Number)
      const features: Record<string, number> = {}
      featureCols.forEach((col, idx) => {
        if (enabledFeatures[col]) {
          const val = nums[idx] !== undefined ? nums[idx] : Number(form[col]) || 0
          const ctrl = getFeatureDomainControl(col)
          features[col] = ctrl.type === 'number' && ctrl.min !== undefined ? Math.max(ctrl.min, val) : val
        } else {
          features[col] = 0
        }
      })
      const res = await api.predict.single({ experiment_id: selectedDsId, features })
      setResult(res)
      logPrediction(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const submitBatch = (file: File | undefined) => {
    if (!file) return
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: async (res) => {
        setBusy(true)
        setError('')
        try {
          const rows = res.data.map((r) => {
            const out: Record<string, number> = {}
            Object.entries(r).forEach(([k, v]) => {
              out[k] = Number(v) || 0
            })
            return out
          })
          const data = await api.predict.batch({ experiment_id: selectedDsId, rows })
          setBatchRes(data.results || [])
        } catch (e) {
          setError(e.message)
        } finally {
          setBusy(false)
        }
      },
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

  const exportModelPackage = () => {
    if (!activeDs) return
    const modelPkg = {
      dataset_id: activeDs.id,
      filename: activeDs.filename,
      label_col: toStrCol(activeDs.label_col as string | { name?: string }),
      feature_cols: featureCols,
      exported_at: new Date().toISOString(),
      platform: 'FedShield v3.0 (TypeScript)',
      security: 'AES-256-GCM Encrypted Pipeline',
      format_version: '1.0',
    }
    const blob = new Blob([JSON.stringify(modelPkg, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `fedshield_model_${activeDs.filename || selectedDsId}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const openSampleModal = (cat = 'Medical') => {
    const preset = CATEGORY_PRESETS[cat] || CATEGORY_PRESETS.Medical
    const featuresToUse = featureCols.length > 0 ? featureCols : preset.features
    const featMap: Record<string, boolean> = {}
    featuresToUse.forEach((f) => {
      featMap[f] = true
    })
    setSampleModal({
      category: cat,
      datasetName: `${cat.toLowerCase()}_sample_test_batch`,
      nRows: 20,
      selectedFeatures: featMap,
      targetCol: activeDs ? toStrCol(activeDs.label_col as string) : preset.defaultTarget,
    })
  }

  const switchSampleCategory = (cat: string) => {
    const preset = CATEGORY_PRESETS[cat] || CATEGORY_PRESETS.Medical
    const featMap: Record<string, boolean> = {}
    preset.features.forEach((f) => {
      featMap[f] = true
    })
    setSampleModal({
      category: cat,
      datasetName: `${cat.toLowerCase()}_sample_test_batch`,
      nRows: sampleModal?.nRows || 20,
      selectedFeatures: featMap,
      targetCol: preset.defaultTarget,
    })
  }

  const handleGenerateAndPredictSample = async () => {
    if (!sampleModal) return
    const chosenFeatures = Object.keys(sampleModal.selectedFeatures).filter((f) => sampleModal.selectedFeatures[f])
    if (chosenFeatures.length === 0) {
      setError('Please select at least one feature column for the sample dataset.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const rows = generateSampleRows(sampleModal.nRows, chosenFeatures)
      const data = await api.predict.batch({ experiment_id: selectedDsId, rows })
      setBatchRes(data.results || [])
      setMode('batch')
      setSampleModal(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Predict & Inference Console" sub="Select dataset features to include in predictions with domain-specific input validation (e.g., Sex: Male/Female, Age: 0 to ∞)." badge="Uploaded Datasets" />

      {datasets.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-mist-500 space-y-3">
          <p>No uploaded datasets found.</p>
          <p className="text-xs text-mist-600">Please upload a dataset in the Datasets tab to start making predictions.</p>
        </div>
      ) : (
        <>
          <div className="panel p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1 min-w-[280px]">
                <label className="label block mb-1.5">Select Uploaded Dataset</label>
                <select className="input w-full max-w-md" value={selectedDsId} onChange={(e) => setSelectedDsId(e.target.value)}>
                  {datasets.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.filename} ({d.rows_count} rows · Label: {toStrCol(d.label_col as string | { name?: string })})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openSampleModal('Medical')}
                  className="px-3.5 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-mono font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span>✨</span>
                  <span>Create Sample Test Dataset</span>
                </button>

                <button type="button" onClick={exportModelPackage} className="px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-mono font-semibold transition flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Export Model Package
                </button>

                <Link to="/predict-history" className="px-3 py-2 rounded-lg border border-signal-500/40 bg-signal-500/10 text-signal-300 hover:bg-signal-500/20 text-xs font-mono font-semibold transition flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">history</span>
                  Prediction History
                </Link>
              </div>

              <div className="flex items-center gap-2 bg-ink-950 p-1.5 rounded-xl border border-line">
                <button type="button" onClick={() => setMode('single')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mode === 'single' ? 'bg-signal-500/20 text-signal-300 border border-signal-500/40 shadow-sm' : 'text-mist-400 hover:text-mist-200'}`}>
                  Single Prediction
                </button>
                <button type="button" onClick={() => setMode('batch')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mode === 'batch' ? 'bg-signal-500/20 text-signal-300 border border-signal-500/40 shadow-sm' : 'text-mist-400 hover:text-mist-200'}`}>
                  Multiple Predictions (Batch CSV)
                  {batchRes && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-signal-500/20 text-signal-300 font-mono">{batchRes.length}</span>}
                </button>
              </div>
            </div>

            {activeDs && (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-line text-xs">
                <EncryptionBadge active label="Uploaded Dataset Synced" />
                <span className="font-mono text-mist-400">
                  Rows: <strong className="text-mist-200">{activeDs.rows_count}</strong>
                </span>
                <span className="font-mono text-mist-400">
                  Target Label: <strong className="text-signal-400">{toStrCol(activeDs.label_col as string | { name?: string })}</strong>
                </span>
                <span className="font-mono text-mist-400">
                  Selected Features: <strong className="text-signal-300">{enabledColsList.length} of {featureCols.length}</strong>
                </span>
              </div>
            )}

            <ErrorBox message={error} />
          </div>

          {sampleModal && (
            <div className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
              <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-amber-500/40 bg-ink-950 p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 scrollbar-thin">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div>
                    <h2 className="text-base font-semibold text-amber-300">Create Sample Dataset for Prediction Output</h2>
                    <p className="text-xs text-mist-400">Select category, row count, domain feature columns, and target label.</p>
                  </div>
                  <button type="button" onClick={() => setSampleModal(null)} className="text-mist-400 hover:text-mist-100 font-mono text-sm">
                    ✕
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="label text-[11px] uppercase tracking-wider">1. DATASET CATEGORY / FIELD</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(CATEGORY_PRESETS).map((catKey) => {
                      const active = sampleModal.category === catKey
                      return (
                        <button
                          key={catKey}
                          type="button"
                          onClick={() => switchSampleCategory(catKey)}
                          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                            active
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                              : 'bg-ink-900/60 text-mist-400 border-line hover:text-mist-200 hover:border-mist-700'
                          }`}
                        >
                          {catKey}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="label text-[11px] uppercase tracking-wider">2. SAMPLE DATASET NAME</label>
                    <input
                      type="text"
                      value={sampleModal.datasetName}
                      onChange={(e) => setSampleModal({ ...sampleModal, datasetName: e.target.value })}
                      className="input w-full text-xs font-mono p-2.5"
                      placeholder="e.g. medical_prediction_samples"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="label text-[11px] uppercase tracking-wider">3. NUMBER OF SAMPLE ROWS</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      step={5}
                      value={sampleModal.nRows}
                      onChange={(e) =>
                        setSampleModal({
                          ...sampleModal,
                          nRows: Math.max(1, Math.min(500, Number(e.target.value) || 10)),
                        })
                      }
                      className="input w-full text-xs font-mono p-2.5"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="label text-[11px] uppercase tracking-wider">4. TARGETED COLUMN (LABEL TARGET)</label>
                  <select
                    value={sampleModal.targetCol}
                    onChange={(e) => setSampleModal({ ...sampleModal, targetCol: e.target.value })}
                    className="input w-full text-xs font-mono p-2.5 cursor-pointer text-amber-300 bg-ink-900"
                  >
                    {(CATEGORY_PRESETS[sampleModal.category]?.targetCandidates || ['label']).map((tgt) => (
                      <option key={tgt} value={tgt}>
                        🎯 {tgt} (Target Output Label)
                      </option>
                    ))}
                    {Object.keys(sampleModal.selectedFeatures).map((f) => (
                      <option key={`feat-${f}`} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="label text-[11px] uppercase tracking-wider">
                      5. DOMAIN FEATURE COLUMNS ({Object.values(sampleModal.selectedFeatures).filter(Boolean).length} selected)
                    </label>
                    <span className="text-[10px] font-mono text-mist-500">Toggle features for prediction sample</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2.5 rounded-xl bg-ink-900/40 border border-line">
                    {Object.keys(sampleModal.selectedFeatures).map((f) => {
                      const active = Boolean(sampleModal.selectedFeatures[f])
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() =>
                            setSampleModal({
                              ...sampleModal,
                              selectedFeatures: { ...sampleModal.selectedFeatures, [f]: !active },
                            })
                          }
                          className={`px-3 py-1 rounded-md text-xs font-mono transition-all border ${
                            active
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.2)] font-semibold'
                              : 'bg-ink-950/60 text-mist-500 border-line hover:text-mist-300'
                          }`}
                        >
                          {f}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                  <button type="button" onClick={() => setSampleModal(null)} className="btn-ghost text-xs py-2 px-4">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateAndPredictSample}
                    disabled={busy}
                    className="btn-primary text-xs py-2 px-5 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-ink-950 font-bold"
                  >
                    <span>⚡</span>
                    <span>{busy ? 'Evaluating Output...' : 'Generate & Predict Output'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {mode === 'single' && (
            <div className="panel p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
                <div>
                  <h2 className="text-base font-semibold text-mist-100">Single Case Evaluation</h2>
                  <p className="text-xs text-mist-500">Select wanted features to include in prediction & enter domain values (e.g. Sex: Male / Female)</p>
                </div>
                <div className="flex items-center gap-1 bg-ink-950 p-1 rounded-lg border border-line text-xs">
                  <button type="button" onClick={() => setSingleTab('form')} className={`px-3 py-1 rounded font-mono ${singleTab === 'form' ? 'bg-signal-500/20 text-signal-300 font-semibold' : 'text-mist-400'}`}>
                    Feature Inputs & Selectors
                  </button>
                  <button type="button" onClick={() => setSingleTab('nlp')} className={`px-3 py-1 rounded font-mono ${singleTab === 'nlp' ? 'bg-signal-500/20 text-signal-300 font-semibold' : 'text-mist-400'}`}>
                    Natural Language
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between bg-ink-950/40 p-3 rounded-xl border border-line text-xs">
                <span className="text-mist-300">
                  Include/Exclude Features: <strong className="text-signal-300 font-mono">{enabledColsList.length}</strong> selected
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={selectAllFeatures} className="text-xs font-mono text-signal-400 hover:underline">
                    Select All
                  </button>
                  <span className="text-mist-600">·</span>
                  <button type="button" onClick={deselectAllFeatures} className="text-xs font-mono text-mist-400 hover:underline">
                    Deselect All
                  </button>
                </div>
              </div>

              {singleTab === 'form' ? (
                <form onSubmit={submitSingle} className="space-y-6">
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {featureCols.map((col) => {
                      const enabled = enabledFeatures[col]
                      const ctrl = getFeatureDomainControl(col)
                      return (
                        <div key={col} className={`p-3.5 rounded-xl border transition-all space-y-2 ${enabled ? 'border-signal-500/50 bg-ink-950/80 shadow-[0_0_10px_rgba(31,200,180,0.08)]' : 'border-line/40 bg-ink-950/30 opacity-60'}`}>
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-mist-100 truncate">
                              <input type="checkbox" checked={!!enabled} onChange={() => toggleFeature(col)} className="rounded border-line bg-ink-900 text-signal-500 focus:ring-0 cursor-pointer accent-signal-400" />
                              <span className={enabled ? 'text-mist-100 font-semibold' : 'text-mist-500'}>{col}</span>
                            </label>
                            <span className="text-[10px] font-mono text-mist-500">{enabled ? 'Active' : 'Excluded'}</span>
                          </div>
                          {enabled && (
                            <div className="space-y-1 pt-1 border-t border-line/40">
                              {ctrl.type === 'select' && ctrl.options ? (
                                <select className="input w-full text-sm font-mono cursor-pointer" value={form[col] || ctrl.options[0].value} onChange={(ev) => setForm({ ...form, [col]: ev.target.value })}>
                                  {ctrl.options.map((opt) => (
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
                                  onChange={(ev) => {
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
                    placeholder={`e.g. "Case with ${enabledColsList.slice(0, 3).map((c) => `${c} 12.5`).join(', ')}"`}
                    value={nlpInput}
                    onChange={(e) => setNlpInput(e.target.value)}
                  />
                  <button className="btn-primary px-8 py-2.5" type="submit" disabled={busy || !nlpInput.trim() || enabledColsList.length === 0}>
                    {busy ? 'Evaluating...' : 'Parse & Evaluate Selected Features'}
                  </button>
                </form>
              )}

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
                    <span>
                      Confidence: <strong className="text-signal-300 font-mono">{(result.confidence * 100).toFixed(1)}%</strong>
                    </span>
                    {result.raw_score !== undefined && <span className="font-mono text-xs text-mist-500">Raw Score: {result.raw_score}</span>}
                  </div>
                </div>
              )}
            </div>
          )}

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
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => submitBatch(e.target.files?.[0])} />
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
                    <input type="text" placeholder="Search results..." value={batchSearch} onChange={(e) => setBatchSearch(e.target.value)} className="input text-xs py-1.5 px-3 max-w-xs" />
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
                    {predictionLog.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-mist-500">{p.ts}</td>
                        <td className="font-mono text-mist-200">{p.datasetName}</td>
                        <td className="font-mono text-signal-400">
                          {p.selectedCount} / {p.totalCount}
                        </td>
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
