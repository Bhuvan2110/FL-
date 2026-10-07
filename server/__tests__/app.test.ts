import { describe, expect, it } from 'vitest'
import request from 'supertest'
import '../test/setup'
import app from '../app'

describe('GET /api', () => {
  it('returns the service banner', async () => {
    const res = await request(app).get('/api')
    expect(res.status).toBe(200)
    expect(res.body.service).toBe('FedShield API')
  })
})

describe('GET /api/health?ping=true', () => {
  it('responds without authentication', async () => {
    const res = await request(app).get('/api/health?ping=true')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})

describe('GET /api/health (full suite)', () => {
  it('rejects without a token', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/datasets/index', () => {
  it('rejects without a token', async () => {
    const res = await request(app).get('/api/datasets/index')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/signup', () => {
  it('rejects a short password with 422, not a 500', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'a@example.com', password: 'short' })
    expect(res.status).toBe(422)
  })

  it('rejects an invalid email with 422', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'not-an-email', password: 'longenoughpassword' })
    expect(res.status).toBe(422)
  })
})

describe('POST /api/train', () => {
  it('rejects an unknown algorithm or missing auth, never a 500', async () => {
    const res = await request(app)
      .post('/api/train')
      .set('Authorization', 'Bearer fake')
      .send({ dataset_id: 'x', algorithm: 'not_a_real_algorithm' })
    expect([401, 422]).toContain(res.status)
  })
})

describe('DELETE /api/experiments', () => {
  it('rejects without auth (the original Python handler had no method dispatch here at all)', async () => {
    const res = await request(app).delete('/api/experiments?delete=some-id')
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/compare', () => {
  it('rejects without auth', async () => {
    const res = await request(app).delete('/api/compare?delete=some-id')
    expect(res.status).toBe(401)
  })
})

describe('error shape', () => {
  it('includes both error and detail keys for frontend compatibility', async () => {
    const res = await request(app).get('/api/health')
    expect(res.body).toHaveProperty('error')
    expect(res.body).toHaveProperty('detail')
  })
})
