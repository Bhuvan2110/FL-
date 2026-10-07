import cors from 'cors'
import express, { NextFunction, Request, Response } from 'express'
import 'express-async-errors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfig } from './config'
import adminRouter from './routes/admin'
import authRouter from './routes/auth'
import compareRouter from './routes/compare'
import datasetsRouter from './routes/datasets'
import experimentsRouter from './routes/experiments'
import healthRouter from './routes/health'
import predictRouter from './routes/predict'
import trainRouter from './routes/train'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const cfg = getConfig()

app.use(
  cors({
    origin: cfg.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'x-filename'],
  })
)

// JSON body parsing for every route except the raw-CSV upload endpoint,
// which reads the request stream itself.
app.use((req, res, next) => {
  if (req.path === '/api/datasets/upload') return next()
  express.json({ limit: '5mb' })(req, res, next)
})

app.use('/api', healthRouter)
app.use('/api', authRouter)
app.use('/api', datasetsRouter)
app.use('/api', experimentsRouter)
app.use('/api', trainRouter)
app.use('/api', predictRouter)
app.use('/api', compareRouter)
app.use('/api', adminRouter)

app.get('/api', (_req, res) => {
  res.json({ service: 'FedShield API', version: '3.0.0-ts' })
})

// Serve production frontend build static files
const distPath = path.resolve(__dirname, '../dist')
app.use(express.static(distPath))

// SPA Fallback for client side routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      next()
    }
  })
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err)
  res.status(500).json({ error: err.message, detail: err.message })
})

export default app
