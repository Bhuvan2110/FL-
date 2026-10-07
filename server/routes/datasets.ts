import { Router } from 'express'
import { logAudit, requireAuth } from '../middleware/auth'
import { writeDbFor } from '../db'
import { generateSyntheticDataset } from '../ml/logistic'
import { SyntheticDatasetSchema } from '../schemas'

const router = Router()

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length === 0) return []
  const headers = lines[0].split(',').map((h) => h.trim())
  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = line.split(',')
    const row: Record<string, unknown> = {}
    headers.forEach((h, i) => {
      const raw = (cells[i] ?? '').trim()
      const num = Number(raw)
      row[h] = raw !== '' && !Number.isNaN(num) ? num : raw
    })
    return row
  })
}

function profileColumns(cols: string[], rows: Record<string, unknown>[], withMissing = true) {
  return cols.map((c) => {
    const vals = rows.map((r) => r[c]).filter((v) => v !== undefined && v !== null)
    const numeric = vals.every((v) => typeof v === 'number')
    return {
      name: c,
      dtype: numeric ? 'numeric' : 'categorical',
      missingPct: withMissing && rows.length ? Math.round(((rows.length - vals.length) / rows.length) * 1000) / 10 : 0,
      unique: new Set(vals.map(String)).size,
    }
  })
}

router.get('/datasets/index', requireAuth, async (req, res) => {
  const db = writeDbFor(req.user!.token)
  const { data } = await db.from('datasets').select('*').eq('user_id', req.user!.id).order('created_at', { ascending: false })
  res.json({ datasets: data || [] })
})

router.post('/datasets/upload', requireAuth, async (req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', async () => {
    try {
      const raw = Buffer.concat(chunks)
      const text = raw.toString('utf8')
      const rows = parseCsv(text)
      if (!rows.length) return res.status(400).json({ error: 'CSV is empty or could not be parsed', detail: 'CSV is empty or could not be parsed' })

      const cols = Object.keys(rows[0])
      const labelCol = cols.includes('label') ? 'label' : cols[cols.length - 1]
      const filename = String(req.headers['x-filename'] || 'upload.csv')

      const db = writeDbFor(req.user!.token)
      const storagePath = `${req.user!.id}/${filename}`
      await db.storage.from('datasets').upload(storagePath, raw, { contentType: 'text/csv', upsert: true })
      const { data: inserted } = await db
        .from('datasets')
        .insert({
          user_id: req.user!.id,
          filename,
          storage_path: storagePath,
          cols: profileColumns(cols, rows),
          label_col: labelCol,
          rows_count: rows.length,
          is_synthetic: false,
        })
        .select()

      await logAudit(req.user!.id, 'dataset_upload', filename, { rows: rows.length }, req.user!.token)
      res.json({ dataset: (inserted && inserted[0]) || {}, preview: rows.slice(0, 8), cols, label_col: labelCol })
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message || e) })
    }
  })
})

router.post('/datasets/synthetic', requireAuth, async (req, res) => {
  const parsed = SyntheticDatasetSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message, detail: parsed.error.issues })

  const seed = parsed.data.seed ?? Math.floor(Math.random() * 99999)
  const featureNames = parsed.data.feature_names
  const customLabel = parsed.data.label_col
  const nFeatures = featureNames?.length || parsed.data.n_features || 5

  const ds = generateSyntheticDataset(parsed.data.n_rows, nFeatures, seed, featureNames, customLabel)
  const allCols = [...ds.cols, ds.labelCol]
  const colProfile = profileColumns(allCols, ds.rows, false)
  const nameBase = parsed.data.dataset_name?.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || `synthetic_${seed}`
  const filename = `${nameBase}.csv`

  const csvLines = [
    allCols.join(','),
    ...ds.rows.map((r) => allCols.map((h) => r[h] ?? 0).join(',')),
  ]
  const csvBuffer = Buffer.from(csvLines.join('\n'), 'utf8')

  const db = writeDbFor(req.user!.token)
  const storagePath = `${req.user!.id}/${filename}`
  await db.storage.from('datasets').upload(storagePath, csvBuffer, { contentType: 'text/csv', upsert: true })
  const { data: inserted } = await db
    .from('datasets')
    .insert({
      user_id: req.user!.id,
      filename,
      storage_path: storagePath,
      cols: colProfile,
      label_col: ds.labelCol,
      rows_count: ds.rows.length,
      is_synthetic: true,
    })
    .select()

  await logAudit(req.user!.id, 'dataset_generate', filename, { rows: ds.rows.length, seed, field: parsed.data.field }, req.user!.token)
  res.json({ dataset: (inserted && inserted[0]) || {}, preview: ds.rows.slice(0, 8), cols: allCols, label_col: ds.labelCol })
})

router.delete('/datasets/delete', requireAuth, async (req, res) => {
  const id = String(req.query.id || '')
  if (!id) return res.status(400).json({ error: 'Missing dataset id', detail: 'Missing dataset id' })

  const db = writeDbFor(req.user!.token)
  const { data } = await db.from('datasets').select('*').eq('id', id).eq('user_id', req.user!.id)
  if (!data || !data[0]) return res.status(404).json({ error: 'Dataset not found', detail: 'Dataset not found' })
  const ds = data[0]

  if (ds.storage_path) {
    try {
      await db.storage.from('datasets').remove([ds.storage_path])
    } catch {
      // best-effort
    }
  }
  await db.from('datasets').delete().eq('id', id)
  await logAudit(req.user!.id, 'dataset_delete', ds.filename || '', {}, req.user!.token)
  res.json({ deleted: true })
})

export default router
