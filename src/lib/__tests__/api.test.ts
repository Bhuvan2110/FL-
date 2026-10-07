import { describe, expect, it, vi } from 'vitest'
import { api, saveToken, clearToken, hasToken } from '../api'
import { mockFetch } from '../../test/test-utils'

describe('token storage helpers', () => {
  it('saveToken/hasToken/clearToken round-trip through localStorage', () => {
    expect(hasToken()).toBe(false)
    saveToken('abc123')
    expect(hasToken()).toBe(true)
    expect(localStorage.getItem('fedshield_token')).toBe('abc123')
    clearToken()
    expect(hasToken()).toBe(false)
  })
})

describe('api client — request handling', () => {
  it('attaches Authorization header when a token is stored', async () => {
    saveToken('my-token')
    const fetchMock = mockFetch({ '/api/auth/me': { user: { id: 'u1', email: 'a@b.com' }, profile: { email: 'a@b.com', role: 'user' } } })
    await api.auth.me()
    const [, init] = fetchMock.mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer my-token')
  })

  it('omits Authorization header when no token is stored', async () => {
    const fetchMock = mockFetch({ '/api/auth/signin': { access_token: 't', token_type: 'bearer', user: { id: 'u1', email: 'a@b.com' }, profile: { email: 'a@b.com', role: 'user' } } })
    await api.auth.signIn('a@b.com', 'password123')
    const [, init] = fetchMock.mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('parses a successful JSON response into the expected shape', async () => {
    mockFetch({ '/api/datasets/index': { datasets: [{ id: 'd1', filename: 'x.csv', rows_count: 10 }] } })
    const result = await api.datasets.list()
    expect(result.datasets).toHaveLength(1)
    expect(result.datasets[0].filename).toBe('x.csv')
  })

  it('throws using the error message from a non-OK response', async () => {
    mockFetch({ '/api/train': () => ({ status: 404, body: { error: 'Dataset not found' } }) })
    await expect(
      api.train.run({ dataset_id: 'missing', algorithm: 'fedavg', rounds: 5, lr: 0.1, local_epochs: 1, num_clients: 2, iid: true, mu: 0, clip_norm: 1, noise_multiplier: 1, delta: 1e-5 })
    ).rejects.toThrow('Dataset not found')
  })

  it('falls back to detail when error key is absent', async () => {
    mockFetch({ '/api/experiments': () => ({ status: 500, body: { detail: 'Internal error' } }) })
    await expect(api.train.experiments()).rejects.toThrow('Internal error')
  })

  it('rejects with a clear message when the response is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>not json</html>', { status: 200, headers: { 'content-type': 'text/html' } })))
    await expect(api.health.ping()).rejects.toThrow(/unavailable/)
  })

  it('sends x-filename header and raw file body on dataset upload', async () => {
    const fetchMock = mockFetch({ '/api/datasets/upload': { dataset: { id: 'd1', filename: 'new.csv', rows_count: 3 }, preview: [], cols: ['a'], label_col: 'a' } })
    const file = new File(['a,b\n1,2'], 'new.csv', { type: 'text/csv' })
    await api.datasets.upload(file)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/datasets/upload')
    const headers = init?.headers as Record<string, string>
    expect(headers['x-filename']).toBe('new.csv')
    expect(init?.body).toBe(file)
  })

  it('builds query strings for delete/rounds endpoints correctly', async () => {
    const fetchMock = mockFetch({ '/api/experiments': { deleted: true } })
    await api.train.delete('exp-42')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/experiments?delete=exp-42')
    expect(init?.method).toBe('DELETE')
  })
})
