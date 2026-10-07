import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import app from './app'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distIndexPath = path.resolve(__dirname, '../dist/index.html')

if (!fs.existsSync(distIndexPath)) {
  // eslint-disable-next-line no-console
  console.log('Production build dist/index.html not found. Triggering build...')
  try {
    execSync('npm run build', { stdio: 'inherit' })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed auto-building frontend:', err)
  }
}

const port = Number(process.env.PORT) || 8000
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`FedShield API (TypeScript) listening on http://127.0.0.1:${port}`)
})
