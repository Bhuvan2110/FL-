/**
 * FedShield API client — calls the TypeScript/Express backend.
 */
import type {
  AdminStats,
  AuditLog,
  Algorithm,
  CompareAllResult,
  CompareSummary,
  Dataset,
  Experiment,
  HealthResult,
  PredictBatchResult,
  PredictSingleResult,
  PredictionRecord,
  Profile,
  RoundPoint,
  TrainConfig,
  TrainResult,
  User,
} from '../types'

const BASE = ''

function getToken(): string {
  return localStorage.getItem('fedshield_token') || ''
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText || `HTTP ${res.status}` }))
    throw new Error(err.error || err.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null as T

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(`API route "${path}" is unavailable.`)
  }
  return res.json().catch(() => {
    throw new Error(`API route "${path}" returned an invalid response.`)
  })
}

export interface SignInResult {
  access_token: string
  token_type: string
  user: User
  profile: Profile
}

export interface MeResult {
  user: User
  profile: Profile
}

export interface DatasetsListResult {
  datasets: Dataset[]
}

export interface DatasetUploadResult {
  dataset: Dataset
  preview: Record<string, unknown>[]
  cols: string[]
  label_col: string
}

export interface SyntheticOpts {
  n_rows?: number
  n_features?: number
  seed?: number
  dataset_name?: string
  field?: string
  feature_names?: string[]
  label_col?: string
}

export interface ExperimentsResult {
  experiments: Experiment[]
}

export interface RoundsResult {
  rounds: RoundPoint[]
}

export interface UsersResult {
  users: (Profile & { id: string; created_at: string })[]
}

export interface AuditResult {
  logs: AuditLog[]
  count: number
}

export const api = {
  auth: {
    signUp: (email: string, password: string) =>
      request<{ message: string; user_id: string }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    signIn: (email: string, password: string) =>
      request<SignInResult>('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    signOut: () => request<{ message: string }>('/api/auth/signout', { method: 'POST' }),
    me: () => request<MeResult>('/api/auth/me'),
    googleUrl: () => request<{ url: string }>('/api/auth/google'),
  },

  datasets: {
    list: () => request<DatasetsListResult>('/api/datasets/index'),
    generate: (opts: SyntheticOpts) =>
      request<DatasetUploadResult>('/api/datasets/synthetic', { method: 'POST', body: JSON.stringify(opts) }),
    upload: (file: File): Promise<DatasetUploadResult> => {
      const token = getToken()
      return fetch('/api/datasets/upload', {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-filename': file.name,
        },
        body: file,
      }).then(async (r) => {
        const contentType = r.headers.get('content-type') || ''
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: r.statusText || `HTTP ${r.status}` }))
          throw new Error(err.error || err.detail || `Upload failed (${r.status})`)
        }
        if (!contentType.includes('application/json')) {
          throw new Error('Upload API returned a non-JSON response.')
        }
        return r.json().catch(() => {
          throw new Error('Upload API returned an invalid response.')
        })
      })
    },
    delete: (id: string) => request<{ deleted: boolean }>(`/api/datasets/delete?id=${id}`, { method: 'DELETE' }),
  },

  train: {
    run: (body: Partial<TrainConfig> & { dataset_id: string; algorithm: Algorithm }) =>
      request<TrainResult>('/api/train', { method: 'POST', body: JSON.stringify(body) }),
    experiments: () => request<ExperimentsResult>('/api/experiments'),
    rounds: (id: string) => request<RoundsResult>(`/api/experiments?rounds=${id}`),
    delete: (id: string) => request<{ deleted: boolean }>(`/api/experiments?delete=${id}`, { method: 'DELETE' }),
  },

  predict: {
    single: (body: { experiment_id: string; features: Record<string, unknown> }) =>
      request<PredictSingleResult>('/api/predict', {
        method: 'POST',
        body: JSON.stringify({ ...body, mode: 'single' }),
      }),
    batch: (body: { experiment_id: string; rows: Record<string, unknown>[] }) =>
      request<PredictBatchResult>('/api/predict', {
        method: 'POST',
        body: JSON.stringify({ ...body, mode: 'batch' }),
      }),
    experiments: () => request<ExperimentsResult>('/api/experiments'),
    history: (limit = 100) => request<{ predictions: PredictionRecord[]; count: number }>(`/api/predictions?limit=${limit}`),
    clearHistory: (id?: string) => request<{ status: string }>(`/api/predictions${id ? `?id=${id}` : ''}`, { method: 'DELETE' }),
    delete: (id: string) => request<{ deleted: boolean }>(`/api/experiments?delete=${id}`, { method: 'DELETE' }),
  },

  compare: {
    all: (adminView = false) => request<CompareAllResult>(`/api/compare${adminView ? '?admin_view=true' : ''}`),
    rounds: (id: string) => request<RoundsResult>(`/api/compare?rounds=${id}`),
    summary: () => request<CompareSummary>('/api/compare?summary=true'),
    delete: (id: string) => request<{ deleted: boolean }>(`/api/compare?delete=${id}`, { method: 'DELETE' }),
  },

  admin: {
    audit: (limit = 100) => request<AuditResult>(`/api/admin?action=audit&limit=${limit}`),
    users: () => request<UsersResult>('/api/admin?action=users'),
    updateRole: (uid: string, role: string) =>
      request<{ updated: boolean }>('/api/admin?action=role', {
        method: 'PATCH',
        body: JSON.stringify({ user_id: uid, role }),
      }),
    stats: () => request<AdminStats>('/api/admin?action=stats'),
  },

  health: {
    run: () => request<HealthResult>('/api/health'),
    ping: () => request<{ status: string }>('/api/health?ping=true'),
  },
}

export function saveToken(token: string): void {
  localStorage.setItem('fedshield_token', token)
}
export function clearToken(): void {
  localStorage.removeItem('fedshield_token')
}
export function hasToken(): boolean {
  return !!localStorage.getItem('fedshield_token')
}
