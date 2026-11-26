import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from './supabase'
import { resetAllCaches } from './dataSync'

/**
 * @typedef {'admin' | 'capturista' | 'mantenimiento' | 'adquisiciones' | 'finanzas' | 'tesoreria' | 'cuentas_por_pagar' |
 *   'talento' | 'solicitante'} Role
 */

/**
 * @typedef {object} AuthUser
 * @property {string} id
 * @property {string} username
 * @property {string} displayName
 * @property {Role} role
 * @property {string} [participanteId] - Participante del directorio de Compras al que está ligado el usuario (`profiles.participante_id`). Un usuario con rol finanzas solo puede decidir autorizaciones si está ligado a un participante activo con rol finanzas cuyo tope cubra el monto (sin liga: no aprueba).
 */

/** Dominio interno usado solo para armar el correo que pide Supabase Auth; nunca se muestra ni se escribe. La API propia (modo `api`) toma solo la parte anterior a la arroba (el usuario). */
const EMAIL_DOMAIN = 'dga-inventarios.interno'

// La contraseña demo solo existe si el modo demo está permitido (desarrollo o VITE_ALLOW_DEMO=true): en un build de
// producción la condición es falsa en tiempo de compilación y la cadena ni siquiera viaja en el JavaScript.
export const DEMO_PASSWORD = import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEMO === 'true' ? 'Vizcarra2025' : ''

// Roster local: solo se usa si no hay backend configurado (ni API propia ni Supabase): desarrollo sin internet / sin .env.
const DEMO_USERS = [
  { id: 'demo-admin', username: 'admin', displayName: 'Dirección General', role: 'admin' },
  { id: 'demo-capturista', username: 'soporte', displayName: 'Soporte e Infraestructura', role: 'capturista' },
  { id: 'demo-mantenimiento', username: 'mantenimiento', displayName: 'Gerencia de Mantenimiento', role: 'mantenimiento' },
  { id: 'demo-adquisiciones', username: 'adquisiciones', displayName: 'Adquisiciones (Compras de Insumos)', role: 'adquisiciones' },
  // Aprobadores de Finanzas de la demo (sembrarComprasDemo crea sus participantes con estos ids): `finanzas` = SIN tope (aprueba cualquier
  // monto, el caso de Ángel) y `finanzas2` = tope de $10,000 (el caso de Janeth). Los nombres reales viven en el directorio, no aquí.
  { id: 'demo-finanzas', username: 'finanzas', displayName: 'Finanzas', role: 'finanzas', participanteId: 'demo-part-finanzas1' },
  { id: 'demo-finanzas2', username: 'finanzas2', displayName: 'Finanzas (apoyo)', role: 'finanzas', participanteId: 'demo-part-finanzas2' },
  { id: 'demo-tesoreria', username: 'tesoreria', displayName: 'Tesorería (Caja chica)', role: 'tesoreria' },
  { id: 'demo-cuentas', username: 'cuentas', displayName: 'Cuentas por pagar', role: 'cuentas_por_pagar' },
  { id: 'demo-talento', username: 'talento', displayName: 'Talento', role: 'talento' },
  { id: 'demo-solicitante', username: 'solicitante', displayName: 'Área solicitante', role: 'solicitante' },
]

export const ROLE_LABELS = {
  admin: 'Dirección General',
  capturista: 'Soporte e Infraestructura',
  mantenimiento: 'Gerencia de Mantenimiento',
  adquisiciones: 'Adquisiciones',
  finanzas: 'Finanzas',
  tesoreria: 'Tesorería',
  cuentas_por_pagar: 'Cuentas por pagar',
  talento: 'Talento',
  solicitante: 'Solicitante',
}

/** Notas de los usuarios demo que comparten rol (se muestran como ayuda en la pantalla de acceso). */
const NOTAS_DEMO = {
  finanzas: 'Finanzas: aprobador SIN tope (aprueba cualquier monto)',
  finanzas2: 'Finanzas (apoyo): aprobador con tope de $10,000',
}
export const DEMO_USERS_PUBLIC = DEMO_USERS.map((u) => ({ username: u.username, role: u.role, nota: NOTAS_DEMO[u.username] }))

const STORAGE_KEY = 'dga_inv_auth_username'

/**
 * El modo demo (usuarios de prueba con contraseña conocida) solo existe en desarrollo, o si se activa a propósito con
 * VITE_ALLOW_DEMO=true. En un build de producción sin Supabase configurado NO se puede entrar: así un despliegue
 * mal configurado en el dominio de la empresa nunca queda abierto con credenciales demo.
 */
export const demoAllowed = import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEMO === 'true'
export const appMisconfigured = !isSupabaseConfigured && !demoAllowed

function findDemoUser(username) {
  return DEMO_USERS.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())
}

async function fetchProfile(userId) {
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error || !data) return null
  // select('*'): así el login sigue funcionando en una base que todavía no corrió 022 (sin la columna participante_id).
  return { id: data.id, username: data.username, displayName: data.display_name, role: data.role, participanteId: data.participante_id ?? undefined }
}

const initialUser = () => {
  if (isSupabaseConfigured || !demoAllowed) return null
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved ? (findDemoUser(saved) ?? null) : null
}

/** Estado global de sesión (módulo singleton; se usa igual desde cualquier componente). */
export const user = ref(initialUser())
/** true mientras se restaura la sesión (API propia o Supabase) al cargar la app. */
export const loading = ref(isSupabaseConfigured)

let readyResolve = () => {}
const readyPromise = new Promise((resolve) => {
  readyResolve = resolve
})
if (!isSupabaseConfigured) readyResolve()

/** Se resuelve cuando ya se sabe si hay sesión o no (inmediato en modo demo local). */
export function authReady() {
  return readyPromise
}

let initialized = false
export function initAuth() {
  if (initialized) return
  initialized = true
  if (!isSupabaseConfigured || !supabase) return

  supabase.auth.getSession().then(async ({ data }) => {
    const profile = data.session?.user ? await fetchProfile(data.session.user.id) : null
    user.value = profile
    loading.value = false
    readyResolve()
  })

  supabase.auth.onAuthStateChange(async (_event, session) => {
    const profile = session?.user ? await fetchProfile(session.user.id) : null
    if ((profile?.id ?? null) !== (user.value?.id ?? null)) resetAllCaches()
    user.value = profile
  })
}

/** Texto en español para un fallo de inicio de sesión: bloqueo por intentos (429), servidor inaccesible o credenciales. */
function mensajeErrorLogin(error) {
  const e = error
  if (e?.status === 429) {
    const seg = e.retryAfter
    const espera = seg && seg > 0 ? (seg >= 120 ? `${Math.ceil(seg / 60)} minutos` : seg >= 60 ? '1 minuto' : `${seg} segundos`) : 'unos minutos'
    return `Demasiados intentos fallidos. Espera ${espera} e inténtalo de nuevo.`
  }
  // El servidor respondió, pero con un error interno: no es la red ni la contraseña (típico de un .env incompleto o de permisos del servidor).
  if (e && e.status !== undefined && e.status >= 500) {
    return `El servidor respondió con un error interno (${e.status}). Tu usuario y contraseña no tienen la falla: avisa a Desarrollo para que revise la configuración y el registro de errores.`
  }
  if (e && (e.code === 'NETWORK' || e.code === 'TIMEOUT' || e.code === 'BAD_RESPONSE')) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo; si persiste, avisa a Desarrollo.'
  }
  return 'Usuario o contraseña incorrectos.'
}

export async function login(username, password) {
  if (!isSupabaseConfigured || !supabase) {
    if (!demoAllowed) return { ok: false, error: 'La aplicación no está configurada (falta la dirección del servidor, VITE_API_URL). Avisa a Desarrollo.' }
    const found = findDemoUser(username)
    if (!found) return { ok: false, error: 'Usuario no reconocido.' }
    if (password !== DEMO_PASSWORD) return { ok: false, error: 'Contraseña incorrecta.' }
    localStorage.setItem(STORAGE_KEY, found.username)
    resetAllCaches() // otro usuario en la misma pestaña: las cachés se recargan
    user.value = found
    return { ok: true }
  }

  const email = `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) return { ok: false, error: mensajeErrorLogin(error) }

  const profile = await fetchProfile(data.user.id)
  if (!profile) {
    await supabase.auth.signOut()
    return { ok: false, error: 'Tu cuenta no tiene un perfil configurado todavía. Avisa al administrador.' }
  }
  resetAllCaches() // otro usuario en la misma pestaña: las cachés se recargan con SU rol (nada del anterior)
  user.value = profile
  return { ok: true }
}

export async function logout() {
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut()
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
  resetAllCaches()
  user.value = null
}

/** Mismo contrato que el useAuth() de la versión React, pero con refs: `const { user } = useAuth()` → `user.value`. */
export function useAuth() {
  return { user, loading, login, logout }
}
