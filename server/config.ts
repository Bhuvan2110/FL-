import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

if (!process.env.SUPABASE_URL && typeof process.loadEnvFile === 'function') {
  try {
    const envPath = path.resolve(process.cwd(), '.env')
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath)
    }
  } catch {
    // ignore if missing or failed to parse
  }
}

const EnvSchema = z.object({
  SUPABASE_URL: z.string().default(''),
  SUPABASE_ANON_KEY: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  ENCRYPTION_SECRET: z.string().default('fedshield-aes-secret-key-32chars!!'),
  FRONTEND_URL: z.string().default('https://fedshield-fl.vercel.app'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  SUPER_ADMIN_EMAILS: z.string().default('sbhuvan847@gmail.com,sbhuvan832@gmail.com'),
  CORS_ORIGINS: z.string().default(''),
  MAX_TRAINING_ROUNDS: z.coerce.number().default(30),
})

export interface Config {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  encryptionSecret: string
  frontendUrl: string
  googleClientId: string
  googleClientSecret: string
  superAdminEmails: Set<string>
  corsOrigins: string[]
  maxTrainingRounds: number
}

let cached: Config | null = null

export function getConfig(): Config {
  if (cached) return cached
  const env = EnvSchema.parse(process.env)
  const userCors = env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean) : []
  const defaultOrigins = [env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000']
  const mergedCors = Array.from(new Set([...userCors, ...defaultOrigins])).filter(Boolean)

  cached = {
    supabaseUrl: env.SUPABASE_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    encryptionSecret: env.ENCRYPTION_SECRET,
    frontendUrl: env.FRONTEND_URL,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    superAdminEmails: new Set(
      env.SUPER_ADMIN_EMAILS.split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
    corsOrigins: mergedCors,
    maxTrainingRounds: env.MAX_TRAINING_ROUNDS,
  }
  return cached
}

/** Test-only: clear the cached config so a test can re-read process.env. */
export function _resetConfigCache(): void {
  cached = null
}
