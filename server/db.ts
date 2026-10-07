import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getConfig } from './config'

export function getAnonDb(): SupabaseClient {
  const cfg = getConfig()
  const key = cfg.supabaseAnonKey || cfg.supabaseServiceRoleKey
  return createClient(cfg.supabaseUrl, key)
}

export function getServiceDb(): SupabaseClient | null {
  const cfg = getConfig()
  if (!cfg.supabaseUrl || !cfg.supabaseServiceRoleKey) return null
  return createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** User-scoped client with the caller's JWT attached, for RLS-aware reads. */
export function dbWithToken(token: string): SupabaseClient {
  const cfg = getConfig()
  const key = cfg.supabaseAnonKey || cfg.supabaseServiceRoleKey
  return createClient(cfg.supabaseUrl, key, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Best available client for writes: service role if configured, else user-scoped. */
export function writeDbFor(token: string): SupabaseClient {
  return getServiceDb() ?? dbWithToken(token)
}
