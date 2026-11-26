import { createClient } from '@supabase/supabase-js'
import { createApiClient } from './apiClient'

/**
 * Selección del backend (el nombre `supabase` se conserva para no tocar los ~24 archivos que lo importan):
 *   1. `VITE_API_URL` definido  -> 'api'      API PHP + MySQL (Hostinger). Es el modo principal.
 *   2. `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` -> 'supabase' (modo anterior, se conserva).
 *   3. ninguna                  -> 'local'    modo demo en el navegador (localStorage); solo se puede entrar con VITE_ALLOW_DEMO o en desarrollo.
 * En los tres modos `supabase` expone la misma superficie (from/rpc/auth/storage); es null solo en 'local'.
 */
const apiUrl = String(import.meta.env.VITE_API_URL ?? '').trim()
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** @typedef {'api' | 'supabase' | 'local'} BackendModo */

export const backendModo = apiUrl ? 'api' : url && anonKey ? 'supabase' : 'local'

/** true cuando hay un backend real (API propia o Supabase); false = modo demo local. Nombre histórico: se conserva. */
export const isSupabaseConfigured = backendModo !== 'local'

export const supabase =
  backendModo === 'api'
    ? createApiClient({ baseUrl: apiUrl })
    : backendModo === 'supabase'
      ? (createClient(url, anonKey))
      : null
