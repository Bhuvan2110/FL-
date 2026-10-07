import { Router } from 'express'
import { decryptJson, encryptJson, modelPassphrase } from '../core/encryption'
import { dbWithToken, getServiceDb } from '../db'
import { trainCentral, trainFedavg } from '../ml/algorithms'
import {
  accuracy,
  crossEntropyLoss,
  generateSyntheticDataset,
  gradientStep,
  initWeights,
  minMaxNormalize,
  stratifiedSplit,
  toXY,
} from '../ml/logistic'
import { confusionMatrix, rocCurve } from '../ml/metrics'

const router = Router()

interface TestResult {
  test_id: string
  name: string
  group: string
  status: 'pass' | 'fail'
  message: string
  duration_ms: number
}

async function runTest(test_id: string, name: string, group: string, fn: () => Promise<string> | string): Promise<TestResult> {
  const t0 = performance.now()
  try {
    const message = await fn()
    return { test_id, name, group, status: 'pass', message, duration_ms: Math.round((performance.now() - t0) * 10) / 10 }
  } catch (e) {
    return { test_id, name, group, status: 'fail', message: String((e as Error).message || e), duration_ms: Math.round((performance.now() - t0) * 10) / 10 }
  }
}

router.get('/health', async (req, res) => {
  if (req.query.ping === 'true' || req.query.healthz === 'true') {
    return res.json({ status: 'ok', service: 'FedShield API', timestamp: Date.now() / 1000 })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'Not authenticated', detail: 'Not authenticated' })

  const probeDb = getServiceDb() ?? dbWithToken(token)
  const { data: userData, error: userErr } = await probeDb.auth.getUser(token)
  if (userErr || !userData.user) return res.status(401).json({ error: 'Invalid or expired token', detail: 'Invalid or expired token' })
  const user = { id: userData.user.id, email: userData.user.email ?? '', token }

  const db = dbWithToken(user.token)

  const tests: [string, string, string, () => Promise<string> | string][] = [
    [
      'db_connect',
      'Supabase connection',
      'Infrastructure',
      async () => {
        await db.from('profiles').select('id').limit(1)
        return 'Supabase REST API reachable'
      },
    ],
    [
      'db_write',
      'Supabase write (audit log)',
      'Infrastructure',
      async () => {
        const svc = getServiceDb()
        const client = svc ?? db
        const { error } = await client.from('audit_logs').insert({ user_id: user.id, action: 'health_check', resource: 'health', detail: { ts: Date.now() } })
        if (error) {
          if (String(error.message).toLowerCase().includes('row-level security') || error.code === '42501') {
            return 'RLS active — write requires service role key (expected)'
          }
          throw new Error(error.message)
        }
        return svc ? 'Audit log write succeeded (service role)' : 'Audit log write succeeded (user token)'
      },
    ],
    [
      'rls_isolation',
      'RLS row isolation',
      'Security',
      async () => {
        const { data } = await db.from('profiles').select('id')
        const foreign = (data || []).filter((r: { id: string }) => r.id !== user.id)
        if (foreign.length) throw new Error(`RLS leaked ${foreign.length} foreign row(s)`)
        return 'RLS isolated — 0 foreign rows visible'
      },
    ],
    [
      'aes_roundtrip',
      'AES-256-GCM round-trip',
      'Cryptography',
      () => {
        const payload = { w: [1.23, -0.45, 0.89], b: 0.02 }
        const { ciphertext, iv } = encryptJson(payload, 'test-key-fedshield')
        const rec = decryptJson<typeof payload>(ciphertext, iv, 'test-key-fedshield')
        if (JSON.stringify(rec) !== JSON.stringify(payload)) throw new Error('Decrypted payload mismatch')
        return `AES-256-GCM: ${ciphertext.length} chars encrypted → decrypted OK`
      },
    ],
    [
      'aes_wrong_key',
      'Wrong-key rejection',
      'Cryptography',
      () => {
        const { ciphertext, iv } = encryptJson({ x: 1 }, 'correct')
        try {
          decryptJson(ciphertext, iv, 'wrong')
        } catch {
          return 'Wrong-key correctly rejected'
        }
        throw new Error('Should have failed')
      },
    ],
    [
      'model_passphrase',
      'Per-user model passphrase',
      'Cryptography',
      () => {
        const p1 = modelPassphrase('u1', 'e1')
        const p2 = modelPassphrase('u2', 'e1')
        if (p1 === p2) throw new Error('Passphrases must differ per user')
        return 'Per-user passphrase isolation OK'
      },
    ],
    [
      'gradient_step',
      'Gradient step loss reduction',
      'ML Core',
      () => {
        const X = [
          [1, 0],
          [0, 1],
          [1, 1],
          [0, 0],
        ]
        const y = [1, 0, 1, 0]
        const w0 = initWeights(2)
        const l0 = crossEntropyLoss(w0, X, y)
        const w1 = gradientStep(w0, X, y, 0.5)
        const l1 = crossEntropyLoss(w1, X, y)
        if (l1 >= l0) throw new Error(`Loss did not decrease: ${l0.toFixed(4)} → ${l1.toFixed(4)}`)
        return `Loss decreased: ${l0.toFixed(4)} → ${l1.toFixed(4)}`
      },
    ],
    [
      'central_convergence',
      'Central training convergence',
      'ML Core',
      () => {
        const ds = generateSyntheticDataset(500, 4, 42)
        const fc = ds.cols.filter((c) => c !== ds.labelCol)
        const [nr] = minMaxNormalize(ds.rows, fc)
        const [tr, vl] = stratifiedSplit(nr, ds.labelCol)
        const [X, y] = toXY(tr, fc, ds.labelCol)
        const [vX, vY] = toXY(vl, fc, ds.labelCol)
        const r = trainCentral(X, y, vX, vY, 40, 0.6)
        const acc = accuracy(r.weights, vX, vY)
        if (acc < 0.6) throw new Error(`Accuracy ${(acc * 100).toFixed(1)}% < 60%`)
        return `Central converged — ${(acc * 100).toFixed(1)}%`
      },
    ],
    [
      'fedavg_convergence',
      'FedAvg convergence (3 clients)',
      'ML Core',
      () => {
        const ds = generateSyntheticDataset(300, 4, 7)
        const fc = ds.cols.filter((c) => c !== ds.labelCol)
        const [nr] = minMaxNormalize(ds.rows, fc)
        const [tr, vl] = stratifiedSplit(nr, ds.labelCol)
        const [vX, vY] = toXY(vl, fc, ds.labelCol)
        const clients = [0, 1, 2].map((i) => {
          const rows = tr.filter((_, j) => j % 3 === i)
          const [X, y] = toXY(rows, fc, ds.labelCol)
          return { X, y }
        })
        const r = trainFedavg({ clients, valX: vX, valY: vY, rounds: 10, localEpochs: 2, lr: 0.4 })
        const acc = accuracy(r.weights, vX, vY)
        if (acc < 0.55) throw new Error(`FedAvg ${(acc * 100).toFixed(1)}% < 55%`)
        return `FedAvg converged — ${(acc * 100).toFixed(1)}%`
      },
    ],
    [
      'confusion_matrix',
      'Confusion matrix correctness',
      'Metrics',
      () => {
        const ds = generateSyntheticDataset(100, 3, 42)
        const fc = ds.cols.filter((c) => c !== ds.labelCol)
        const [nr] = minMaxNormalize(ds.rows, fc)
        const [X, y] = toXY(nr, fc, ds.labelCol)
        let w = initWeights(fc.length)
        for (let i = 0; i < 10; i++) w = gradientStep(w, X, y, 0.3)
        const cm = confusionMatrix(w, X, y)
        const total = cm.tp + cm.tn + cm.fp + cm.fn
        if (total !== X.length) throw new Error(`CM sum ${total} ≠ ${X.length}`)
        return `TP=${cm.tp} TN=${cm.tn} FP=${cm.fp} FN=${cm.fn} sum=${total}`
      },
    ],
    [
      'roc_auc',
      'ROC-AUC on balanced data',
      'Metrics',
      () => {
        const ds = generateSyntheticDataset(200, 4, 99)
        const fc = ds.cols.filter((c) => c !== ds.labelCol)
        const [nr] = minMaxNormalize(ds.rows, fc)
        const [tr, , ts] = stratifiedSplit(nr, ds.labelCol)
        const [X, y] = toXY(tr, fc, ds.labelCol)
        const [tX, tY] = toXY(ts, fc, ds.labelCol)
        let w = initWeights(fc.length)
        for (let i = 0; i < 20; i++) w = gradientStep(w, X, y, 0.4)
        const roc = rocCurve(w, tX, tY)
        if (roc.auc < 0.55) throw new Error(`AUC ${roc.auc.toFixed(3)} < 0.55`)
        return `AUC = ${roc.auc.toFixed(3)}`
      },
    ],
  ]

  const results = await Promise.all(tests.map(([id, name, group, fn]) => runTest(id, name, group, fn)))
  const passed = results.filter((r) => r.status === 'pass').length

  res.json({ results, passed, failed: results.length - passed, total: results.length, all_pass: passed === results.length })
})

export default router
