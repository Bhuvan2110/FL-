/**
 * Domain types shared across the app. These mirror the backend's zod
 * schemas and Supabase table shapes, so a change on one side is a
 * visible type error on the other.
 */

export type Algorithm = 'central' | 'fedavg' | 'fedprox' | 'scaffold' | 'krum' | 'dpsgd'
export type Role = 'user' | 'admin' | 'super_admin' | 'guest'
export type ExperimentStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface User {
  id: string
  email: string
}

export interface Profile {
  id?: string
  email: string
  role: Role
}

export interface Session {
  user: User
}

export interface Dataset {
  id: string
  user_id?: string
  filename: string
  storage_path?: string
  cols: DatasetColumn[] | string[]
  label_col: string | { name: string }
  rows_count: number
  is_synthetic: boolean
  created_at: string
}

export interface DatasetColumn {
  name: string
  dtype: 'numeric' | 'categorical'
  missingPct: number
  unique: number
}

export interface TrainConfig {
  dataset_id: string
  algorithm: Algorithm
  rounds: number
  lr: number
  local_epochs: number
  num_clients: number
  iid: boolean
  alpha?: number | null
  mu: number
  clip_norm: number
  noise_multiplier: number
  delta: number
}

export interface Experiment {
  id: string
  user_id?: string
  dataset_id?: string
  algorithm: Algorithm
  status: ExperimentStatus
  config?: Partial<TrainConfig> & { run_seed?: number }
  created_at: string
  completed_at?: string | null
  name?: string
}

export interface RoundPoint {
  round: number
  round_num?: number
  loss: number
  accuracy: number
}

export interface PrivacyPoint {
  round: number
  round_num?: number
  epsilon: number
  delta?: number
  experiment_id?: string
}

export interface Metrics {
  experiment_id: string
  model_label?: string
  accuracy: number
  f1: number
  auc: number
  precision_score: number
  recall: number
  tp?: number
  tn?: number
  fp?: number
  fn?: number
  conv_round?: number | null
  area_acc?: number
}

export interface RocPoint {
  fpr: number
  tpr: number
}

export interface TrainResult {
  experiment_id: string
  algorithm: Algorithm
  status: ExperimentStatus
  metrics: Metrics
  roc: RocPoint[]
  privacy: PrivacyPoint[]
  history: RoundPoint[]
}

export interface PredictSingleResult {
  output: number
  confidence: number
  raw_score: number
  experiment_id: string
}

export interface PredictBatchRow {
  [feature: string]: unknown
  output: number
  confidence: number
  row_index: number
}

export interface PredictBatchResult {
  results: PredictBatchRow[]
  count: number
}

export interface PredictionRecord {
  id: string
  model_id: string
  user_id: string
  input_hash: string
  input: Record<string, unknown>
  output: number
  confidence: number
  created_at: string
}

export interface CompareSummary {
  datasets: number
  experiments: number
  best_accuracy: number | null
  latest_epsilon: number | null
}

export interface CompareAllResult {
  experiments: Experiment[]
  metrics: Metrics[]
  privacy: PrivacyPoint[]
}

export interface AuditLog {
  id: string
  user_id?: string
  action: string
  resource?: string
  detail?: Record<string, unknown>
  created_at: string
}

export interface AdminStats {
  total_users: number
  total_datasets: number
  total_experiments: number
  total_predictions: number
  experiments_by_algorithm: Record<string, number>
  experiments_by_status: Record<string, number>
}

export interface HealthTestResult {
  test_id: string
  name: string
  group: string
  status: 'pass' | 'fail'
  message: string
  duration_ms: number
}

export interface HealthResult {
  results: HealthTestResult[]
  passed: number
  failed: number
  total: number
  all_pass: boolean
}

export interface ApiError extends Error {
  status?: number
}
