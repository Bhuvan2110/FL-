import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import Papa from 'papaparse'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { PageHeader, ErrorBox, GuestNotice } from '../components/UI'
import type { Dataset } from '../types'

declare global {
  interface Window {
    JSZip?: {
      loadAsync: (data: Blob | File) => Promise<{ files: Record<string, { async: (t: 'string') => Promise<string> }> }>
    }
  }
}

async function extractCsvFromZip(fileOrBlob: File | Blob): Promise<File> {
  if (!window.JSZip) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
      script.onload = () => resolve()
      script.onerror = reject
      document.head.appendChild(script)
    })
  }
  const zip = await window.JSZip!.loadAsync(fileOrBlob)
  const csvFilename = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.csv') && !name.startsWith('__MACOSX'))
  if (!csvFilename) throw new Error('No .csv file found inside the uploaded .zip archive.')
  const csvContent = await zip.files[csvFilename].async('string')
  const cleanName = csvFilename.split('/').pop() || 'dataset.csv'
  return new File([csvContent], cleanName, { type: 'text/csv' })
}

const PROJECT_FIELDS = ['Medical', 'Financial', 'Cybersecurity', 'Telecom', 'Energy', 'Education']

interface RegistrationModal {
  file: File
  originalName: string
  datasetName: string
  dataRowsCount: number
  allCols: string[]
  labelCol: string
  selectedField: string
  selectedFeatures: Record<string, boolean>
  rawData: Record<string, unknown>[]
}

interface PreviewState {
  filename: string
  cols: string[]
  rows: Record<string, unknown>[]
  labelCol: string
}

interface SyntheticCategoryPreset {
  name: string
  defaultDatasetName: string
  features: string[]
  targetCandidates: string[]
  defaultTarget: string
}

const CATEGORY_PRESETS: Record<string, SyntheticCategoryPreset> = {
  Medical: {
    name: 'Medical',
    defaultDatasetName: 'medical_cardiac_risk',
    features: ['age', 'systolic_bp', 'cholesterol_mg', 'max_heart_rate', 'bmi', 'fasting_blood_sugar', 'exercise_angina'],
    targetCandidates: ['heart_disease_risk', 'diabetes_risk', 'stroke_flag'],
    defaultTarget: 'heart_disease_risk',
  },
  Financial: {
    name: 'Financial',
    defaultDatasetName: 'financial_fraud_detection',
    features: ['annual_income_k', 'credit_score', 'debt_to_income_ratio', 'revolving_balance', 'late_payment_count', 'credit_age_years'],
    targetCandidates: ['fraud_flag', 'loan_default_risk', 'credit_approval'],
    defaultTarget: 'fraud_flag',
  },
  Cybersecurity: {
    name: 'Cybersecurity',
    defaultDatasetName: 'cybersecurity_intrusion_logs',
    features: ['packet_size_bytes', 'failed_logins', 'session_duration_s', 'port_number', 'payload_entropy', 'request_rate_per_min'],
    targetCandidates: ['intrusion_detected', 'malware_flag', 'anomaly_score'],
    defaultTarget: 'intrusion_detected',
  },
  Telecom: {
    name: 'Telecom',
    defaultDatasetName: 'telecom_customer_churn',
    features: ['tenure_months', 'monthly_charge_usd', 'support_calls_count', 'data_usage_gb', 'contract_type_months', 'international_plan'],
    targetCandidates: ['churn_risk', 'service_upgrade', 'payment_default'],
    defaultTarget: 'churn_risk',
  },
  Energy: {
    name: 'Energy',
    defaultDatasetName: 'energy_grid_monitoring',
    features: ['grid_load_mw', 'voltage_kv', 'temperature_celsius', 'solar_output_kw', 'substation_age_years', 'peak_demand_ratio'],
    targetCandidates: ['power_outage_risk', 'grid_failure_flag', 'overload_warning'],
    defaultTarget: 'power_outage_risk',
  },
  Education: {
    name: 'Education',
    defaultDatasetName: 'education_student_retention',
    features: ['gpa_score', 'attendance_rate_pct', 'weekly_study_hours', 'assignment_completion_pct', 'family_income_k', 'prior_credits'],
    targetCandidates: ['dropout_risk', 'honor_roll_status', 'graduation_flag'],
    defaultTarget: 'dropout_risk',
  },
}

interface SyntheticModalState {
  category: string
  datasetName: string
  nRows: number
  selectedFeatures: Record<string, boolean>
  targetCol: string
}

export default function Datasets() {
  const { isGuest } = useAuth()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [modal, setModal] = useState<RegistrationModal | null>(null)
  const [syntheticModal, setSyntheticModal] = useState<SyntheticModalState | null>(null)

  const load = () => {
    if (isGuest) {
      setLoading(false)
      return
    }
    setLoading(true)
    api.datasets
      .list()
      .then((d) => setDatasets(d.datasets || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [isGuest])

  const handleFileSelected = async (file: File) => {
    if (!file) return
    const isZip = file.name.toLowerCase().endsWith('.zip')
    const isCsv = file.name.toLowerCase().endsWith('.csv')
    if (!isZip && !isCsv) {
      setError('Please select a valid .csv or .zip file.')
      return
    }
    if (isGuest) {
      setError('Sign in to upload datasets.')
      return
    }
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      let csvFile = file
      if (isZip) {
        setSuccess('Extracting CSV from ZIP archive...')
        csvFile = await extractCsvFromZip(file)
      }
      const text = await csvFile.text()
      Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const cols = res.meta.fields || []
          if (cols.length === 0) {
            setError('Could not parse valid header columns from CSV.')
            setBusy(false)
            return
          }
          const defaultName = csvFile.name.replace(/\.[^/.]+$/, '')
          const defaultLabelCol = cols.find((c) => ['target', 'label', 'fbs', 'num', 'output', 'class'].includes(c.toLowerCase())) || cols[cols.length - 1]
          const featureSelection: Record<string, boolean> = {}
          cols.forEach((c) => {
            featureSelection[c] = c !== defaultLabelCol
          })
          setModal({
            file: csvFile,
            originalName: csvFile.name,
            datasetName: defaultName,
            dataRowsCount: res.data.length,
            allCols: cols,
            labelCol: defaultLabelCol,
            selectedField: 'Medical',
            selectedFeatures: featureSelection,
            rawData: res.data,
          })
          setBusy(false)
        },
      })
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const handleUrlImport = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    if (!urlInput.trim()) return
    if (isGuest) {
      setError('Sign in to import datasets.')
      return
    }
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const cleanUrl = urlInput.trim()
      const response = await fetch(cleanUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch dataset from URL.`)
      const blob = await response.blob()
      let filename = cleanUrl.split('/').pop()?.split('?')[0] || 'url_dataset.csv'
      let csvFile: File
      if (filename.toLowerCase().endsWith('.zip') || blob.type.includes('zip')) {
        csvFile = await extractCsvFromZip(blob)
      } else {
        if (!filename.toLowerCase().endsWith('.csv')) filename += '.csv'
        csvFile = new File([blob], filename, { type: 'text/csv' })
      }
      await handleFileSelected(csvFile)
      setUrlInput('')
    } catch (e) {
      setError(`URL Import Failed: ${e.message}`)
      setBusy(false)
    }
  }

  const handleRegisterDataset = async () => {
    if (!modal) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const chosenFeatures = modal.allCols.filter((c) => c !== modal.labelCol && modal.selectedFeatures[c])
      if (chosenFeatures.length === 0) {
        setError('Please select at least one feature column to upload.')
        setBusy(false)
        return
      }
      const finalCols = [...chosenFeatures, modal.labelCol]
      const filteredRows = modal.rawData.map((row) => {
        const out: Record<string, unknown> = {}
        finalCols.forEach((c) => {
          out[c] = row[c] ?? 0
        })
        return out
      })
      const csvString = Papa.unparse(filteredRows)
      const uploadableFile = new File([csvString], `${modal.datasetName || 'dataset'}.csv`, { type: 'text/csv' })
      const res = await api.datasets.upload(uploadableFile)
      setPreview({
        filename: res.dataset.filename,
        cols: finalCols,
        rows: (res.preview as Record<string, unknown>[]) || modal.rawData.slice(0, 10),
        labelCol: modal.labelCol,
      })
      setSuccess(`Dataset "${modal.datasetName}" assigned to ${modal.selectedField} field and registered successfully! (${modal.dataRowsCount} rows, ${chosenFeatures.length} features)`)
      setModal(null)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const openSyntheticModal = (cat = 'Medical') => {
    if (isGuest) {
      setError('Sign in to generate datasets.')
      return
    }
    const preset = CATEGORY_PRESETS[cat] || CATEGORY_PRESETS.Medical
    const featMap: Record<string, boolean> = {}
    preset.features.forEach((f) => {
      featMap[f] = true
    })
    setSyntheticModal({
      category: cat,
      datasetName: preset.defaultDatasetName,
      nRows: 600,
      selectedFeatures: featMap,
      targetCol: preset.defaultTarget,
    })
  }

  const switchSyntheticCategory = (cat: string) => {
    const preset = CATEGORY_PRESETS[cat] || CATEGORY_PRESETS.Medical
    const featMap: Record<string, boolean> = {}
    preset.features.forEach((f) => {
      featMap[f] = true
    })
    setSyntheticModal({
      category: cat,
      datasetName: preset.defaultDatasetName,
      nRows: syntheticModal?.nRows || 600,
      selectedFeatures: featMap,
      targetCol: preset.defaultTarget,
    })
  }

  const handleGenerateSynthetic = async () => {
    if (!syntheticModal) return
    const chosenFeatures = Object.keys(syntheticModal.selectedFeatures).filter((f) => syntheticModal.selectedFeatures[f])
    if (chosenFeatures.length === 0) {
      setError('Please select at least one feature column for the synthetic dataset.')
      return
    }
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const seed = Math.floor(Math.random() * 99999)
      const res = await api.datasets.generate({
        field: syntheticModal.category,
        dataset_name: syntheticModal.datasetName,
        n_rows: syntheticModal.nRows,
        feature_names: chosenFeatures,
        label_col: syntheticModal.targetCol,
        seed,
      })
      setPreview({ filename: res.dataset.filename, cols: res.cols, rows: res.preview, labelCol: res.label_col })
      setSuccess(`Synthetic raw dataset "${syntheticModal.datasetName}" (${syntheticModal.nRows} rows, ${chosenFeatures.length} features, category: ${syntheticModal.category}) generated successfully!`)
      setSyntheticModal(null)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this dataset?')) return
    setError('')
    setSuccess('')
    await api.datasets.delete(id).catch((e) => setError(e.message))
    load()
  }

  const colName = (c: string | { name?: string }, fallback: string) => (typeof c === 'string' ? c : c?.name || fallback)

  return (
    <div className="space-y-8">
      <PageHeader title="Datasets" sub="Upload labeled CSV or ZIP archives, fetch from URL, select targeted features and classify datasets into project fields." />

      {isGuest && <GuestNotice feature="datasets" />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="panel p-6 space-y-3">
          <div className="label">Upload CSV / ZIP Archive</div>
          <p className="text-xs text-mist-500">Supports .csv or .zip containing dataset files. Select features & assign to field.</p>
          <label className={`btn-ghost inline-flex items-center justify-center gap-2 w-full ${isGuest ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            <span>{busy ? 'Processing...' : 'Choose CSV or ZIP file'}</span>
            <input
              type="file"
              accept=".csv,.zip,application/zip,application/x-zip-compressed"
              className="hidden"
              disabled={busy || isGuest}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelected(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>

        <div className="panel p-6 space-y-3">
          <div className="label">Import Dataset from URL</div>
          <p className="text-xs text-mist-500">Enter a direct HTTP/HTTPS link to a CSV or ZIP dataset file.</p>
          <form onSubmit={handleUrlImport} className="space-y-2">
            <input
              type="url"
              placeholder="https://example.com/dataset.csv"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              disabled={busy || isGuest}
              className="input w-full text-xs p-2.5 font-mono"
            />
            <button className="btn-primary w-full text-xs py-2" type="submit" disabled={busy || isGuest || !urlInput.trim()}>
              {busy ? 'Fetching...' : 'Fetch & Assign Dataset'}
            </button>
          </form>
        </div>

        <div className="panel p-6 space-y-3">
          <div className="label">Synthetic Demo Dataset</div>
          <p className="text-xs text-mist-500">Generate raw domain-specific dataset (Medical, Financial, Cybersecurity, etc.).</p>
          <button className="btn-primary w-full text-xs py-2 mt-auto" disabled={busy || isGuest} onClick={() => openSyntheticModal('Medical')}>
            {busy ? 'Generating...' : 'Configure & Generate Dataset'}
          </button>
        </div>
      </div>

      <ErrorBox message={error} />
      {success && (
        <div className="panel p-4 border border-signal-500/30 bg-signal-500/10 text-signal-400 text-sm rounded flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="text-xs text-mist-400 hover:text-mist-200">
            Dismiss
          </button>
        </div>
      )}

      {syntheticModal && (
        <div className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-signal-500/40 bg-ink-950 p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 scrollbar-thin">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-base font-semibold text-mist-100">Configure & Generate Synthetic Raw Dataset</h2>
                <p className="text-xs text-mist-400">Select category, row count, domain feature columns, and target label.</p>
              </div>
              <button type="button" onClick={() => setSyntheticModal(null)} className="text-mist-400 hover:text-mist-100 font-mono text-sm">
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <label className="label text-[11px] uppercase tracking-wider">1. DATASET CATEGORY / FIELD</label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(CATEGORY_PRESETS).map((catKey) => {
                  const active = syntheticModal.category === catKey
                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => switchSyntheticCategory(catKey)}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        active
                          ? 'bg-signal-500/20 text-signal-300 border-signal-500/60 shadow-[0_0_12px_rgba(31,200,180,0.25)]'
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
                <label className="label text-[11px] uppercase tracking-wider">2. DATASET NAME</label>
                <input
                  type="text"
                  value={syntheticModal.datasetName}
                  onChange={(e) => setSyntheticModal({ ...syntheticModal, datasetName: e.target.value })}
                  className="input w-full text-xs font-mono p-2.5"
                  placeholder="e.g. medical_cardiac_risk"
                />
              </div>

              <div className="space-y-1.5">
                <label className="label text-[11px] uppercase tracking-wider">3. NUMBER OF ROWS</label>
                <input
                  type="number"
                  min={10}
                  max={20000}
                  step={50}
                  value={syntheticModal.nRows}
                  onChange={(e) =>
                    setSyntheticModal({
                      ...syntheticModal,
                      nRows: Math.max(10, Math.min(20000, Number(e.target.value) || 100)),
                    })
                  }
                  className="input w-full text-xs font-mono p-2.5"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="label text-[11px] uppercase tracking-wider">4. TARGETED COLUMN (LABEL TARGET)</label>
              <select
                value={syntheticModal.targetCol}
                onChange={(e) => setSyntheticModal({ ...syntheticModal, targetCol: e.target.value })}
                className="input w-full text-xs font-mono p-2.5 cursor-pointer text-signal-300 bg-ink-900"
              >
                {(CATEGORY_PRESETS[syntheticModal.category]?.targetCandidates || ['label']).map((tgt) => (
                  <option key={tgt} value={tgt}>
                    🎯 {tgt} (Binary Target Label)
                  </option>
                ))}
                {Object.keys(syntheticModal.selectedFeatures).map((f) => (
                  <option key={`feat-${f}`} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="label text-[11px] uppercase tracking-wider">
                  5. DOMAIN FEATURE COLUMNS ({Object.values(syntheticModal.selectedFeatures).filter(Boolean).length} selected)
                </label>
                <span className="text-[10px] font-mono text-mist-500">Toggle domain features to include</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2.5 rounded-xl bg-ink-900/40 border border-line">
                {(CATEGORY_PRESETS[syntheticModal.category]?.features || []).map((f) => {
                  const active = Boolean(syntheticModal.selectedFeatures[f])
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() =>
                        setSyntheticModal({
                          ...syntheticModal,
                          selectedFeatures: { ...syntheticModal.selectedFeatures, [f]: !active },
                        })
                      }
                      className={`px-3 py-1 rounded-md text-xs font-mono transition-all border ${
                        active
                          ? 'bg-signal-500/20 text-signal-300 border-signal-500/60 shadow-[0_0_8px_rgba(31,200,180,0.2)] font-semibold'
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
              <button type="button" onClick={() => setSyntheticModal(null)} className="btn-ghost text-xs py-2 px-4">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateSynthetic}
                disabled={busy}
                className="btn-primary text-xs py-2 px-5 inline-flex items-center gap-2"
              >
                <span>⚡</span>
                <span>{busy ? 'Generating...' : 'Generate & Register Dataset'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-signal-500/40 bg-ink-950 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-base font-semibold text-mist-100">Upload dataset → assign to a field</h2>
              <button type="button" onClick={() => setModal(null)} className="text-mist-400 hover:text-mist-100 font-mono text-sm">
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between font-mono text-xs text-cipher-400 bg-ink-900/60 p-3 rounded-xl border border-line">
              <span>
                <strong className="text-signal-300">{modal.originalName}</strong> · {modal.dataRowsCount} data rows · {modal.allCols.length} columns
              </span>
              <label className="text-mist-400 hover:text-signal-300 cursor-pointer underline text-[11px]">
                change file
                <input type="file" accept=".csv,.zip" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const f = e.target.files?.[0]
                  if (f) handleFileSelected(f)
                }} />
              </label>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="label text-[11px] uppercase tracking-wider">DATASET NAME</label>
                <input type="text" value={modal.datasetName} onChange={(e) => setModal({ ...modal, datasetName: e.target.value })} className="input w-full text-xs font-mono p-2.5" />
              </div>
              <div className="space-y-1.5">
                <label className="label text-[11px] uppercase tracking-wider">LABEL COLUMN (BINARY)</label>
                <select value={modal.labelCol} onChange={(e) => setModal({ ...modal, labelCol: e.target.value })} className="input w-full text-xs font-mono p-2.5 cursor-pointer text-signal-300">
                  {modal.allCols.map((c) => (
                    <option key={c} value={c}>
                      {c} · binary ✓
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="label text-[11px] uppercase tracking-wider">PARTICULAR FIELD</label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_FIELDS.map((field) => {
                  const active = modal.selectedField === field
                  return (
                    <button
                      key={field}
                      type="button"
                      onClick={() => setModal({ ...modal, selectedField: field })}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        active ? 'bg-signal-500/20 text-signal-300 border-signal-500/60 shadow-[0_0_12px_rgba(31,200,180,0.25)]' : 'bg-ink-900/60 text-mist-400 border-line hover:text-mist-200 hover:border-mist-700'
                      }`}
                    >
                      {field}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="label text-[11px] uppercase tracking-wider">FEATURE COLUMNS ({Object.values(modal.selectedFeatures).filter(Boolean).length} selected)</label>
                <span className="text-[10px] font-mono text-mist-500">Click chips to include/exclude</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-ink-900/40 border border-line">
                {modal.allCols.map((c) => {
                  if (c === modal.labelCol) return null
                  const active = modal.selectedFeatures[c]
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setModal({ ...modal, selectedFeatures: { ...modal.selectedFeatures, [c]: !active } })}
                      className={`px-3 py-1 rounded-md text-xs font-mono transition-all border ${
                        active ? 'bg-signal-500/20 text-signal-300 border-signal-500/60 shadow-[0_0_8px_rgba(31,200,180,0.2)] font-semibold' : 'bg-ink-950/60 text-mist-500 border-line hover:text-mist-300'
                      }`}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <button type="button" onClick={() => setModal(null)} className="btn-ghost text-xs py-2 px-4">
                Cancel
              </button>
              <button type="button" onClick={handleRegisterDataset} disabled={busy} className="btn-primary text-xs py-2 px-5 inline-flex items-center gap-2">
                <span>🗄️</span>
                <span>{busy ? 'Registering...' : 'Register dataset'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="panel p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Preview — {preview.filename}</h3>
            <span className="text-xs text-mist-500 font-mono">
              {preview.rows.length} preview rows · label: {preview.labelCol}
            </span>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="data-table">
              <thead>
                <tr>
                  {preview.cols.map((c, i) => (
                    <th key={i}>{colName(c, `col_${i}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i}>
                    {preview.cols.map((c, j) => {
                      const name = colName(c, `col_${j}`)
                      return (
                        <td key={j} className="font-mono text-xs">
                          {String(r[name] ?? (r as Record<string, unknown>)[j] ?? '')}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel p-6">
        <h2 className="text-base font-semibold mb-4">Your Datasets</h2>
        {isGuest ? (
          <div className="text-sm text-mist-500 text-center py-8">Sign in to view and manage your datasets.</div>
        ) : loading ? (
          <div className="text-sm text-mist-500">Loading datasets...</div>
        ) : datasets.length === 0 ? (
          <div className="text-sm text-mist-500 text-center py-8">No datasets yet. Upload a CSV/ZIP file, fetch from URL, or generate synthetic data above.</div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Rows</th>
                  <th>Label col</th>
                  <th>Type</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.id}>
                    <td className="font-mono text-xs whitespace-nowrap">{d.filename}</td>
                    <td className="whitespace-nowrap">{d.rows_count}</td>
                    <td className="font-mono text-signal-400 whitespace-nowrap">{colName(d.label_col, 'target')}</td>
                    <td className="whitespace-nowrap">
                      <span className="badge border-mist-700 text-mist-500">{d.is_synthetic ? 'synthetic' : 'uploaded'}</span>
                    </td>
                    <td className="text-mist-500 text-xs whitespace-nowrap">{new Date(d.created_at).toLocaleDateString()}</td>
                    <td className="whitespace-nowrap">
                      <button onClick={() => handleDelete(d.id)} className="text-xs text-rose-400 hover:text-rose-300">
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
