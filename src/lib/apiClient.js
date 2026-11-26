/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Cliente de la API Laravel + MySQL (backend-laravel/): implementa el MISMO subconjunto de la superficie de `@supabase/supabase-js` que
 * usa esta app, para que las pantallas y la lógica no cambien al pasar de Supabase a la API propia.
 *
 *   from(tabla).select/insert/update/upsert + eq neq gt gte lt lte like ilike is in contains containedBy match not or filter
 *               + order range limit single maybeSingle throwOnError abortSignal      → GET/POST/PATCH  {base}/rest/{tabla}
 *   rpc(nombre, args)                                                                  → POST            {base}/rpc/{nombre}
 *   auth.signInWithPassword / getSession / getUser / onAuthStateChange / signOut       → {base}/auth/*
 *   storage.from(bucket).upload / getPublicUrl                                          → {base}/storage/{bucket}
 *
 * Todo se resuelve como `{ data, error, count?, status }` (nunca rechaza, salvo `throwOnError()`), igual que supabase-js.
 * El error es un `Error` con `{ message, code, details, hint, status }` (los mensajes del servidor ya vienen en español).
 *
 * Sesión: el JWT (8 h) vive en localStorage (con try/catch). Se valida su vigencia ANTES de cada petición; un 401 con token cierra la
 * sesión y avisa a `onAuthStateChange` (SIGNED_OUT). Renovación automática (`POST /auth/refresh`): cuando faltan menos de 1 h para que
 * venza y el usuario estuvo activo en los últimos 30 min, la siguiente petición renueva el token primero (UNA sola renovación a la vez;
 * si falla no se insiste: tras un error de red se reintenta a los 60 s, tras un 401 no se vuelve a intentar con ese token). La renovación
 * es silenciosa: no emite eventos. El servidor limita la sesión a 7 días desde el login (después hay que entrar de nuevo). Reintentos (con espera creciente) solo en lecturas
 * (GET y RPC de consulta) ante fallo de red/timeout/502/503/504. Este módulo no usa `import.meta`: es probable en Node.
 */

// ---------------------------------------------------------------------------------------------------------- tipos públicos

/**
 * @typedef {object} ApiClientErrorInit
 * @property {string} [code]
 * @property {string | null} [details]
 * @property {string | null} [hint]
 * @property {number} [status]
 * @property {number} [retryAfter]
 */

/** Misma forma que PostgrestError de supabase-js, más `status` (HTTP) y `retryAfter` (segundos, solo en 429). */
export class ApiClientError extends Error {
  code
  details
  hint
  status
  retryAfter

  constructor(message, init = {}) {
    super(message)
    this.name = 'ApiClientError'
    this.code = init.code ?? ''
    this.details = init.details ?? null
    this.hint = init.hint ?? null
    this.status = init.status ?? 0
    if (init.retryAfter !== undefined) this.retryAfter = init.retryAfter
  }
}

/**
 * @template T
 * @typedef {object} ApiResponse
 * @property {T | null} data
 * @property {ApiClientError | null} error
 * @property {number | null} [count]
 * @property {number} status
 */

/**
 * @typedef {object} ApiAuthUser
 * @property {string} id
 * @property {string} email
 * @property {Record<string, unknown>} app_metadata
 * @property {{ username: string; display_name: string; role: string; participante_id: string | null }} user_metadata
 */

/**
 * @typedef {object} ApiSession
 * @property {string} access_token
 * @property {string} token_type
 * @property {number} expires_in - Segundos de vigencia al emitirse.
 * @property {number} expires_at - Segundo (epoch) en el que vence.
 * @property {ApiAuthUser} user
 */

/** @typedef {'SIGNED_IN' | 'SIGNED_OUT'} ApiAuthEvent */

/**
 * @typedef {object} ApiClientOptions
 * @property {string} baseUrl - URL base de la API, p. ej. `/api` o `https://dominio.mx/api`.
 * @property {typeof fetch} [fetch] - Para pruebas o entornos sin fetch global.
 * @property {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null} [storage] - Almacenamiento de la sesión (por omisión localStorage; `null` = solo memoria).
 * @property {string} [storageKey]
 * @property {number} [timeoutMs] - Tiempo máximo de una petición normal (ms).
 * @property {number} [uploadTimeoutMs] - Tiempo máximo de una subida de archivo (ms).
 * @property {number} [retries] - Reintentos EXTRA solo para lecturas.
 * @property {number} [retryDelayMs] - Espera base entre reintentos (ms; se duplica en cada uno).
 * @property {number} [maxUploadBytes] - Tamaño máximo de archivo aceptado antes de subirlo (bytes; la API aplica el suyo).
 * @property {number} [refreshWindowMs] - Renovar el token cuando falte menos de esto para que venza (ms). 0 desactiva la renovación. Por omisión 1 h.
 * @property {number} [inactivityMs] - No renovar si el usuario lleva más de esto sin actividad (ms). Por omisión 30 min.
 * @property {number} [refreshRetryMs] - Espera tras una renovación fallida por red/servidor antes de intentarlo otra vez (ms). Por omisión 60 s.
 * @property {() => number} [now]
 */

// ---------------------------------------------------------------------------------------------------------- utilidades

/** @typedef {[string, string]} Par */

const RPC_DE_LECTURA = new Set([
  'verificar_equipo',
  'verificar_material',
  'cmp_consultar_requisicion',
  'cmp_formulario_publico',
  'cmp_directorio_publico',
])

const MSG_RED = 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
const MSG_TIMEOUT = 'El servidor tardó demasiado en responder. Inténtalo de nuevo.'
const MSG_SESION = 'Tu sesión expiró. Vuelve a iniciar sesión.'

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

/** Valor de un filtro como texto (Date → ISO, null → "null"). */
function fmt(v) {
  if (v === null || v === undefined) return 'null'
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

/** Elemento de `in.(…)`: entre comillas si trae comas, paréntesis, comillas, barras o espacios en los extremos. */
function elementoLista(v) {
  const s = fmt(v)
  return s === '' || /[,()"\\]|^\s|\s$/.test(s) ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : s
}

/** Operando de cs/cd: arreglo/objeto → JSON; texto tal cual. */
function operandoJson(v) {
  return typeof v === 'string' ? v : JSON.stringify(v)
}

function qs(pares) {
  return pares.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
}

function proyectar(data, columnas) {
  if (!columnas || columnas.trim() === '*' || data === null || typeof data !== 'object') return data
  const cols = columnas.split(',').map((c) => c.trim()).filter(Boolean)
  if (cols.includes('*')) return data
  const una = (f) => (f && typeof f === 'object' ? Object.fromEntries(cols.filter((c) => c in f).map((c) => [c, f[c]])) : f)
  return Array.isArray(data) ? data.map(una) : una(data)
}

function cuentaDeRango(cr) {
  const m = /\/(\d+|\*)\s*$/.exec(cr ?? '')
  return m && m[1] !== '*' ? Number(m[1]) : null
}

/** Nombre de archivo/segmento seguro para la API de archivos (letras, números, punto, guion y guion bajo). */
function segmentoSeguro(s) {
  const limpio = s.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 120)
  return limpio === '' ? '_' : limpio
}

/**
 * @typedef {object} Op
 * @property {'GET' | 'POST' | 'PATCH'} metodo
 * @property {string} ruta
 * @property {Par[]} [query]
 * @property {BodyInit | null} [cuerpo]
 * @property {unknown} [json]
 * @property {Record<string, string>} [headers]
 * @property {boolean} [escritura] - Escrituras: con la sesión vencida no se manda anónima, se devuelve el error de sesión.
 * @property {boolean} [reintentable] - Lecturas y RPC de consulta: se pueden repetir sin efecto secundario.
 * @property {boolean} [sinToken] - No manda el token ni trata el 401 como sesión perdida (login).
 * @property {number} [timeoutMs]
 * @property {AbortSignal} [signal]
 * @property {boolean} [esperaJson] - Se espera JSON (si llega otra cosa con 2xx es una API mal configurada).
 */

/**
 * @typedef {object} Crudo
 * @property {number} status
 * @property {any} data
 * @property {ApiClientError | null} error
 * @property {string | null} contentRange
 */

// ---------------------------------------------------------------------------------------------------------- cliente

export function createApiClient(opts) {
  const base = opts.baseUrl.replace(/\/+$/, '')
  const f = opts.fetch ?? ((...a) => globalThis.fetch(...a))
  const now = opts.now ?? (() => Date.now())
  const timeoutMs = opts.timeoutMs ?? 30_000
  const uploadTimeoutMs = opts.uploadTimeoutMs ?? 120_000
  const reintentos = opts.retries ?? 2
  const esperaBase = opts.retryDelayMs ?? 400
  const maxSubida = opts.maxUploadBytes ?? 10 * 1024 * 1024
  const claveSesion = opts.storageKey ?? 'dga_api_session'
  const ventanaRenovar = opts.refreshWindowMs ?? 3_600_000
  const inactividadMax = opts.inactivityMs ?? 1_800_000
  const esperaRenovar = opts.refreshRetryMs ?? 60_000

  let almacen = null
  try {
    almacen = opts.storage !== undefined ? opts.storage : typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    almacen = null
  }

  // ---- sesión ----------------------------------------------------------------------------------------------------
  let sesion = null
  const oyentes = new Map()
  let siguienteOyente = 1

  function leerAlmacen() {
    try {
      const raw = almacen?.getItem(claveSesion)
      if (!raw) return null
      const s = JSON.parse(raw)
      if (!s || typeof s.access_token !== 'string' || typeof s.expires_at !== 'number' || !s.user?.id) return null
      return s
    } catch {
      return null
    }
  }
  function escribirAlmacen(s) {
    try {
      if (s) almacen?.setItem(claveSesion, JSON.stringify(s))
      else almacen?.removeItem(claveSesion)
    } catch {
      /* almacenamiento no disponible (ventana privada, cuota): la sesión vive solo en memoria */
    }
  }
  function emitir(evento, s) {
    for (const cb of [...oyentes.values()]) {
      try {
        cb(evento, s)
      } catch {
        /* un oyente con error no debe romper a los demás */
      }
    }
  }
  const vencida = (s) => now() >= s.expires_at * 1000 - 10_000

  sesion = leerAlmacen()
  if (sesion && vencida(sesion)) {
    sesion = null
    escribirAlmacen(null)
  }

  function cerrarLocal(emite = true) {
    const habia = sesion !== null
    sesion = null
    escribirAlmacen(null)
    if (habia && emite) emitir('SIGNED_OUT', null)
  }

  /** Token a enviar: null si no hay sesión; si venció, la cierra (y avisa) y devuelve null. */
  function tokenVigente() {
    if (!sesion) return { token: null, vencio: false }
    if (vencida(sesion)) {
      cerrarLocal()
      return { token: null, vencio: true }
    }
    return { token: sesion.access_token, vencio: false }
  }

  // Sesión iniciada o cerrada en otra pestaña.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && almacen) {
    window.addEventListener('storage', (e) => {
      if (e.key !== claveSesion && e.key !== null) return
      const nueva = leerAlmacen()
      const antes = sesion?.access_token
      const usuarioAntes = sesion?.user.id
      sesion = nueva && !vencida(nueva) ? nueva : null
      if (sesion && sesion.access_token !== antes) {
        // otra pestaña renovó el token del MISMO usuario: se adopta sin avisar (no es un inicio de sesión nuevo)
        if (usuarioAntes === undefined || usuarioAntes !== sesion.user.id) emitir('SIGNED_IN', sesion)
      } else if (!sesion && antes) emitir('SIGNED_OUT', null)
    })
  }

  // ---- actividad y renovación del token --------------------------------------------------------------------------
  // Actividad = interacción real del usuario (en el navegador). Sin DOM (pruebas/Node) cada petición cuenta como actividad.
  let ultimaActividad = now()
  let actividadDeDom = false
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    actividadDeDom = true
    const marcar = () => {
      ultimaActividad = now()
    }
    for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) window.addEventListener(ev, marcar, { passive: true, capture: true })
  }
  let renovando = null
  let proximoIntentoRenovar = 0
  let renovacionNegada = null   // token al que el servidor ya dijo que no (401): no se insiste con ese

  async function renovar(s) {
    // Otra pestaña pudo renovar ya: se adopta su token en lugar de pedir otro.
    const otra = leerAlmacen()
    if (otra && otra.access_token !== s.access_token && otra.user.id === s.user.id && !vencida(otra) && otra.expires_at > s.expires_at) {
      sesion = otra
      return
    }
    const r = await unaVez({ metodo: 'POST', ruta: 'auth/refresh', timeoutMs: 15_000, esperaJson: true }, s.access_token)
    if (sesion?.access_token !== s.access_token) return   // mientras tanto hubo logout/login/otra renovación: se descarta
    const nuevoToken = r.data?.access_token
    if (r.error || typeof nuevoToken !== 'string' || nuevoToken === '') {
      if (r.status === 401 || r.status === 403) renovacionNegada = s.access_token   // ya no se puede renovar; la próxima petición decidirá si cierra la sesión
      else proximoIntentoRenovar = now() + esperaRenovar
      return
    }
    const expiresIn = Number(r.data.expires_in) > 0 ? Number(r.data.expires_in) : 28_800
    const u = r.data.user
    sesion = {
      ...s,
      access_token: nuevoToken,
      token_type: String(r.data.token_type ?? s.token_type),
      expires_in: expiresIn,
      expires_at: Math.floor(now() / 1000) + expiresIn,
      user: u?.id === s.user.id ? { ...s.user, user_metadata: { ...s.user.user_metadata, username: u.username, display_name: u.display_name, role: u.role, participante_id: u.participante_id ?? null } } : s.user,
    }
    renovacionNegada = null
    proximoIntentoRenovar = now() + esperaRenovar   // separación mínima entre renovaciones (protege de un servidor que emita tokens muy cortos)
    escribirAlmacen(sesion)
  }

  /** Antes de cada petición con sesión: si faltan menos de `refreshWindowMs` y el usuario estuvo activo, renueva el token (una sola a la vez). */
  async function renovarSiHaceFalta() {
    if (ventanaRenovar <= 0) return
    if (renovando) {
      await renovando   // las peticiones simultáneas esperan a la renovación en curso y salen con el token nuevo
      return
    }
    const s = sesion
    if (!s || vencida(s)) return
    if (s.expires_at * 1000 - now() > ventanaRenovar) return
    if (now() - ultimaActividad > inactividadMax) return
    if (now() < proximoIntentoRenovar || renovacionNegada === s.access_token) return
    renovando = renovar(s)
      .catch(() => {
        proximoIntentoRenovar = now() + esperaRenovar
      })
      .finally(() => {
        renovando = null
      })
    await renovando
  }

  // ---- HTTP ------------------------------------------------------------------------------------------------------
  function url(ruta, query) {
    return `${base}/${ruta}${query && query.length ? `?${qs(query)}` : ''}`
  }

  function falla(status, message, extra = {}) {
    return { status, data: null, error: new ApiClientError(message, { status, ...extra }), contentRange: null }
  }

  function errorDeRespuesta(status, cuerpo, texto, retryAfter) {
    if (cuerpo && typeof cuerpo === 'object' && typeof cuerpo.message === 'string') {
      return new ApiClientError(cuerpo.message, { code: cuerpo.code ?? '', details: cuerpo.details ?? null, hint: cuerpo.hint ?? null, status, retryAfter })
    }
    let msg
    if (status === 401) msg = MSG_SESION
    else if (status === 403) msg = 'No tienes permiso para realizar esta acción.'
    else if (status === 404) msg = 'No se encontró el servicio de la API. Revisa la configuración (VITE_API_URL) o avisa a Desarrollo.'
    else if (status === 413) msg = 'El archivo o la petición es demasiado grande para el servidor.'
    else if (status === 429) msg = 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.'
    else if (status === 502 || status === 503 || status === 504) msg = 'El servidor no está disponible por el momento. Inténtalo de nuevo en unos minutos.'
    else if (status >= 500) msg = 'Error interno del servidor. Avisa a Desarrollo si persiste.'
    else msg = `El servidor respondió con un error (HTTP ${status}).`
    return new ApiClientError(msg, { code: `HTTP_${status}`, details: texto ? texto.slice(0, 200) : null, status, retryAfter })
  }

  async function unaVez(op, token) {
    const ctrl = new AbortController()
    let porTiempo = false
    const limite = op.timeoutMs ?? timeoutMs
    const temporizador = setTimeout(() => {
      porTiempo = true
      ctrl.abort()
    }, limite)
    const alAbortarUsuario = () => ctrl.abort()
    if (op.signal) {
      if (op.signal.aborted) ctrl.abort()
      else op.signal.addEventListener('abort', alAbortarUsuario, { once: true })
    }
    try {
      const headers = { Accept: 'application/json', ...(op.headers ?? {}) }
      if (token) headers.Authorization = `Bearer ${token}`
      let body = op.cuerpo
      if (op.json !== undefined) {
        body = JSON.stringify(op.json)
        headers['Content-Type'] = 'application/json'
      }
      const res = await f(url(op.ruta, op.query), { method: op.metodo, headers, body: body ?? undefined, signal: ctrl.signal, credentials: 'omit', cache: 'no-store' })
      const texto = await res.text()
      let data = null
      let esJson = false
      if (texto.trim() !== '') {
        try {
          data = JSON.parse(texto)
          esJson = true
        } catch {
          data = null
        }
      }
      const ra = res.headers.get('Retry-After')
      const retryAfter = ra && /^\d+$/.test(ra.trim()) ? Number(ra.trim()) : undefined
      const contentRange = res.headers.get('Content-Range')
      if (!res.ok) {
        return { status: res.status, data: null, error: errorDeRespuesta(res.status, data, texto, retryAfter), contentRange, transitorio: [502, 503, 504].includes(res.status) }
      }
      if (op.esperaJson && texto.trim() !== '' && !esJson) {
        return {
          ...falla(res.status, 'La API devolvió una respuesta inesperada (no es JSON). Revisa VITE_API_URL y que /api llegue al backend Laravel.', { code: 'BAD_RESPONSE', details: texto.slice(0, 120) }),
          transitorio: false,
        }
      }
      return { status: res.status, data, error: null, contentRange, transitorio: false }
    } catch (e) {
      if (op.signal?.aborted) return { ...falla(0, 'La solicitud fue cancelada.', { code: 'ABORTED' }), transitorio: false }
      if (porTiempo) return { ...falla(0, MSG_TIMEOUT, { code: 'TIMEOUT', details: String(e?.message ?? e) }), transitorio: true }
      return { ...falla(0, MSG_RED, { code: 'NETWORK', details: String(e?.message ?? e) }), transitorio: true }
    } finally {
      clearTimeout(temporizador)
      op.signal?.removeEventListener('abort', alAbortarUsuario)
    }
  }

  async function intentar(op, token) {
    const max = op.reintentable ? reintentos : 0
    let r = await unaVez(op, token)
    for (let i = 0; i < max && r.transitorio && !op.signal?.aborted; i++) {
      await esperar(esperaBase * 2 ** i + Math.floor(Math.random() * 50))
      r = await unaVez(op, token)
    }
    return r
  }

  /** Una petición completa: vigencia del token, 401 → cierra sesión, reintento anónimo solo si es lectura/RPC. */
  async function pedir(op) {
    let token = null
    if (!op.sinToken) {
      if (!actividadDeDom) ultimaActividad = now()
      await renovarSiHaceFalta()
      const t = tokenVigente()
      token = t.token
      if (t.vencio && op.escritura) return falla(401, MSG_SESION, { code: 'SESSION_EXPIRED' })
    }
    let r = await intentar(op, token)
    if (r.status === 401 && token) {
      // El servidor rechazó el token (vencido, revocado, rol cambiado, usuario desactivado): la sesión ya no sirve.
      if (sesion?.access_token === token) cerrarLocal()
      // El 401 se responde antes de ejecutar nada: repetir sin token es seguro y deja funcionar las RPC públicas (enlaces con token).
      if (op.metodo === 'GET' || op.ruta.startsWith('rpc/')) r = await intentar(op, null)
    }
    return r
  }

  // ---- constructor de consultas ---------------------------------------------------------------------------------
  /** @typedef {'select' | 'insert' | 'update' | 'upsert'} Accion */

  class Consulta {
    filtros = []
    ordenes = []
    columnas
    limite
    desde
    conteo
    soloCabecera = false
    unico = ''
    devolver = false
    lanzar = false
    senal
    vacio = false
    promesa = null
    onConflict
    ignorarDuplicados = false

    /**
     * @param {string} tabla
     * @param {Accion} accion
     * @param {unknown} [valores]
     */
    constructor(tabla, accion, valores) {
      this.tabla = tabla
      this.accion = accion
      this.valores = valores
    }

    // -- selección y forma
    select(columnas = '*', o = {}) {
      this.columnas = columnas.replace(/\s+/g, '')
      if (this.accion !== 'select') this.devolver = true
      if (o.count) this.conteo = o.count
      if (o.head) this.soloCabecera = true
      return this
    }
    order(columna, o = {}) {
      let t = `${columna}.${o.ascending === false ? 'desc' : 'asc'}`
      if (o.nullsFirst === true) t += '.nullsfirst'
      else if (o.nullsFirst === false) t += '.nullslast'
      this.ordenes.push(t)
      return this
    }
    limit(n) {
      this.limite = n
      return this
    }
    range(desde, hasta) {
      this.desde = desde
      this.limite = hasta - desde + 1
      return this
    }
    single() {
      this.unico = 'single'
      return this
    }
    maybeSingle() {
      this.unico = 'maybe'
      return this
    }
    throwOnError() {
      this.lanzar = true
      return this
    }
    abortSignal(s) {
      this.senal = s
      return this
    }

    // -- filtros
    f(col, op, v) {
      this.filtros.push([col, `${op}.${v}`])
      return this
    }
    eq(c, v) { return this.f(c, 'eq', fmt(v)) }
    neq(c, v) { return this.f(c, 'neq', fmt(v)) }
    gt(c, v) { return this.f(c, 'gt', fmt(v)) }
    gte(c, v) { return this.f(c, 'gte', fmt(v)) }
    lt(c, v) { return this.f(c, 'lt', fmt(v)) }
    lte(c, v) { return this.f(c, 'lte', fmt(v)) }
    like(c, p) { return this.f(c, 'like', p) }
    ilike(c, p) { return this.f(c, 'ilike', p) }
    is(c, v) { return this.f(c, 'is', v === null ? 'null' : String(v)) }
    in(c, valores) {
      if (valores.length === 0) this.vacio = true
      return this.f(c, 'in', `(${valores.map(elementoLista).join(',')})`)
    }
    contains(c, v) { return this.f(c, 'cs', operandoJson(v)) }
    containedBy(c, v) { return this.f(c, 'cd', operandoJson(v)) }
    match(q) {
      for (const [k, v] of Object.entries(q)) this.eq(k, v)
      return this
    }
    not(c, op, v) {
      this.filtros.push([c, `not.${op}.${op === 'in' && Array.isArray(v) ? `(${v.map(elementoLista).join(',')})` : fmt(v)}`])
      return this
    }
    or(expr) {
      this.filtros.push(['or', `(${expr})`])
      return this
    }
    filter(c, op, v) {
      return this.f(c, op, op === 'in' && Array.isArray(v) ? `(${v.map(elementoLista).join(',')})` : fmt(v))
    }
    /** Para upsert encadenado a la manera de PostgREST (alternativa a las opciones de `upsert`). */
    _conflicto(onConflict, ignorar) {
      this.onConflict = onConflict
      this.ignorarDuplicados = ignorar
      return this
    }

    // -- ejecución
    then(onfulfilled, onrejected) {
      this.promesa ??= this.ejecutar()
      return this.promesa.then(onfulfilled, onrejected)
    }

    async ejecutar() {
      const r = await this.enviar()
      if (r.error && this.lanzar) throw r.error
      return r
    }

    async enviar() {
      const query = []
      const headers = {}
      const prefer = []
      const t = encodeURIComponent(this.tabla)
      const ruta = `rest/${t}`

      if (this.vacio) {
        // in.() no devuelve nada en PostgREST; la API lo rechazaría como mal formado.
        if (this.accion === 'select' && this.unico === 'single') {
          return { data: null, error: new ApiClientError('JSON object requested, multiple (or no) rows returned', { code: 'PGRST116', details: 'The result contains 0 rows', status: 406 }), status: 406 }
        }
        return { data: this.accion === 'select' && this.unico === '' ? [] : null, error: null, count: this.conteo ? 0 : null, status: 200 }
      }

      const comunes = () => {
        for (const p of this.filtros) query.push(p)
        if (this.unico === 'single') query.push(['__single', '1'])
        else if (this.unico === 'maybe') query.push(['__maybe', '1'])
      }

      let op
      if (this.accion === 'select') {
        if (this.columnas && this.columnas !== '*') query.push(['select', this.columnas])
        comunes()
        if (this.ordenes.length) query.push(['order', this.ordenes.join(',')])
        if (this.soloCabecera) query.push(['limit', '0'])
        else if (this.limite !== undefined) query.push(['limit', String(Math.max(0, this.limite))])
        if (this.desde !== undefined && this.desde > 0) query.push(['offset', String(this.desde)])
        if (this.conteo) prefer.push('count=exact')
        op = { metodo: 'GET', ruta, query, reintentable: true, esperaJson: true, signal: this.senal }
      } else if (this.accion === 'update') {
        comunes()
        prefer.push(this.devolver ? 'return=representation' : 'return=minimal')
        op = { metodo: 'PATCH', ruta, query, json: this.valores, escritura: true, esperaJson: this.devolver, signal: this.senal }
      } else {
        if (this.accion === 'upsert' && this.onConflict) query.push(['on_conflict', this.onConflict])
        comunes()
        if (this.accion === 'upsert') prefer.push(this.ignorarDuplicados ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates')
        prefer.push(this.devolver ? 'return=representation' : 'return=minimal')
        op = { metodo: 'POST', ruta, query, json: this.valores, escritura: true, esperaJson: this.devolver, signal: this.senal }
      }
      if (prefer.length) headers.Prefer = prefer.join(',')
      op.headers = headers

      const r = await pedir(op)
      if (r.error) return { data: null, error: r.error, count: null, status: r.status }
      const data = this.soloCabecera ? null : this.accion === 'select' || this.devolver ? proyectar(r.data, this.columnas) : null
      return { data, error: null, count: this.conteo ? cuentaDeRango(r.contentRange) : null, status: r.status }
    }
  }

  class Tabla {
    /** @param {string} tabla */
    constructor(tabla) {
      this.tabla = tabla
    }
    select(columnas = '*', o = {}) {
      return new Consulta(this.tabla, 'select').select(columnas, o)
    }
    insert(valores, _o) {
      return new Consulta(this.tabla, 'insert', valores)
    }
    update(valores) {
      return new Consulta(this.tabla, 'update', valores)
    }
    upsert(valores, o = {}) {
      return new Consulta(this.tabla, 'upsert', valores)._conflicto(o.onConflict, o.ignoreDuplicates === true)
    }
  }

  // ---- RPC --------------------------------------------------------------------------------------------------------
  class Rpc {
    unico = ''
    lanzar = false
    senal
    promesa = null

    /**
     * @param {string} nombre
     * @param {Record<string, unknown>} [args]
     */
    constructor(nombre, args) {
      this.nombre = nombre
      this.args = args
    }

    single() { this.unico = 'single'; return this }
    maybeSingle() { this.unico = 'maybe'; return this }
    throwOnError() { this.lanzar = true; return this }
    abortSignal(s) { this.senal = s; return this }
    /** Compatibilidad: el resultado de una RPC ya viene completo. */
    select(_columnas) { return this }

    then(onfulfilled, onrejected) {
      this.promesa ??= this.ejecutar()
      return this.promesa.then(onfulfilled, onrejected)
    }

    async ejecutar() {
      const r = await this.enviar()
      if (r.error && this.lanzar) throw r.error
      return r
    }

    async enviar() {
      const r = await pedir({
        metodo: 'POST',
        ruta: `rpc/${encodeURIComponent(this.nombre)}`,
        json: this.args ?? {},
        reintentable: RPC_DE_LECTURA.has(this.nombre),
        esperaJson: true,
        signal: this.senal,
      })
      if (r.error) return { data: null, error: r.error, status: r.status }
      let data = r.data
      if (this.unico) {
        const filas = Array.isArray(data) ? data : data === null || data === undefined ? [] : [data]
        if (filas.length === 1 || (this.unico === 'maybe' && filas.length === 0)) data = filas[0] ?? null
        else return { data: null, error: new ApiClientError('JSON object requested, multiple (or no) rows returned', { code: 'PGRST116', details: `The result contains ${filas.length} rows`, status: 406 }), status: 406 }
      }
      return { data: data ?? null, error: null, status: r.status }
    }
  }

  // ---- auth -------------------------------------------------------------------------------------------------------
  const auth = {
    /** `email` = `usuario@dominio-interno`: la API autentica por usuario, se toma la parte anterior a la arroba. */
    async signInWithPassword(cred) {
      const arroba = cred.email.indexOf('@')
      const username = (arroba >= 0 ? cred.email.slice(0, arroba) : cred.email).trim()
      const r = await pedir({ metodo: 'POST', ruta: 'auth/login', json: { username, password: cred.password }, sinToken: true, esperaJson: true, timeoutMs: 20_000 })
      const u = r.data?.user
      if (r.error || !r.data?.access_token || !u?.id) {
        return {
          data: { user: null, session: null },
          error: r.error ?? new ApiClientError('La API devolvió una respuesta de inicio de sesión inválida.', { code: 'BAD_RESPONSE', status: r.status }),
        }
      }
      const expiresIn = Number(r.data.expires_in) > 0 ? Number(r.data.expires_in) : 28_800
      const user = {
        id: String(u.id),
        email: cred.email,
        app_metadata: {},
        user_metadata: { username: u.username, display_name: u.display_name, role: u.role, participante_id: u.participante_id ?? null },
      }
      const s = {
        access_token: String(r.data.access_token),
        token_type: String(r.data.token_type ?? 'bearer'),
        expires_in: expiresIn,
        expires_at: Math.floor(now() / 1000) + expiresIn,
        user,
      }
      sesion = s
      renovacionNegada = null
      proximoIntentoRenovar = 0
      ultimaActividad = now()
      escribirAlmacen(s)
      emitir('SIGNED_IN', s)
      return { data: { user, session: s }, error: null }
    },

    async getSession() {
      tokenVigente()
      return { data: { session: sesion }, error: null }
    },

    /** Valida el token con el servidor (`GET /auth/session`). */
    async getUser() {
      if (!tokenVigente().token) return { data: { user: null }, error: new ApiClientError(MSG_SESION, { code: 'SESSION_EXPIRED', status: 401 }) }
      const r = await pedir({ metodo: 'GET', ruta: 'auth/session', reintentable: true, esperaJson: true })
      return r.error ? { data: { user: null }, error: r.error } : { data: { user: sesion?.user ?? null }, error: null }
    },

    onAuthStateChange(cb) {
      const id = siguienteOyente++
      oyentes.set(id, cb)
      return { data: { subscription: { id: String(id), unsubscribe: () => void oyentes.delete(id) } } }
    },

    /** Revoca el token en el servidor (mejor esfuerzo) y limpia la sesión local. Nunca falla. */
    async signOut() {
      const token = sesion && !vencida(sesion) ? sesion.access_token : null
      if (token) {
        try {
          await unaVez({ metodo: 'POST', ruta: 'auth/logout', timeoutMs: 8_000 }, token)
        } catch {
          /* sin red: igual se cierra localmente */
        }
      }
      cerrarLocal()
      return { error: null }
    },
  }

  // ---- storage ----------------------------------------------------------------------------------------------------
  const urlsSubidas = new Map()
  const origenDeBase = () => {
    if (/^https?:\/\//i.test(base)) return new URL(base).origin
    return typeof location !== 'undefined' && location.origin ? location.origin : ''
  }
  const absoluta = (u) => (/^https?:\/\//i.test(u) ? u : `${origenDeBase()}${u.startsWith('/') ? '' : '/'}${u}`)

  const storage = {
    from(bucket) {
      // const urlPublica = (ruta) => `${absoluta(base)}/storage/${encodeURIComponent(bucket)}/${ruta.split('/').map(encodeURIComponent).join('/')}`
      const urlPublica = (ruta) => {
        const path = ruta.split('/').map(encodeURIComponent).join('/')

        if (bucket === 'inventario-fotos') {
          return `https://mersbock.s3.us-east-2.amazonaws.com/dga/inventario-fotos/${path}`
        }

        return `${absoluta(base)}/storage/${encodeURIComponent(bucket)}/${path}`
      }
      return {
        /** La API no sobrescribe jamás (409 si existe): `upsert` se ignora. Devuelve la ruta REAL (saneada). */
        async upload(
          ruta,
          archivo,
          _o,
        ) {
          const segs = ruta.split('/').filter((s) => s !== '').map(segmentoSeguro)
          if (segs.length === 0) return { data: null, error: new ApiClientError('Ruta de archivo inválida.', { code: 'PGRST100', status: 400 }) }
          if (segs.length > 6) segs.splice(0, segs.length - 6)   // la API admite hasta 6 niveles: se conservan los últimos
          const path = segs.join('/')
          if (archivo.size > maxSubida) {
            const mb = (archivo.size / 1048576).toFixed(1)
            return { data: null, error: new ApiClientError(`El archivo pesa ${mb} MB y el máximo permitido es ${Math.floor(maxSubida / 1048576)} MB.`, { code: 'FILE_TOO_LARGE', status: 413 }) }
          }
          if (archivo.size === 0) return { data: null, error: new ApiClientError('El archivo está vacío.', { code: 'EMPTY_FILE', status: 400 }) }
          const fd = new FormData()
          fd.append('path', path)
          const nombre = archivo.name || segs[segs.length - 1]
          fd.append('file', archivo, nombre)
          const r = await pedir({ metodo: 'POST', ruta: `storage/${encodeURIComponent(bucket)}`, cuerpo: fd, escritura: true, esperaJson: true, timeoutMs: uploadTimeoutMs })
          if (r.error) return { data: null, error: r.error }
          const realPath = String(r.data?.path ?? path)
          // const url = typeof r.data?.url === 'string' && r.data.url ? absoluta(r.data.url) : urlPublica(realPath)
          // const url = bucket === 'inventario-fotos'
          //   ? urlPublica(realPath)
          //   : (typeof r.data?.url === 'string' && r.data.url ? absoluta(r.data.url) : urlPublica(realPath))
          const url = urlPublica(realPath)
          urlsSubidas.set(`${bucket}/${realPath}`, url)
          return { data: { path: realPath, fullPath: `${bucket}/${realPath}`, url }, error: null }
        },
        getPublicUrl(ruta) {
          return { data: { publicUrl: urlsSubidas.get(`${bucket}/${ruta}`) ?? urlPublica(ruta) } }
        },
      }
    },
  }

  return {
    from: (tabla) => new Tabla(tabla),
    rpc: (nombre, args = {}, _o) => new Rpc(nombre, args),
    auth,
    storage,
    /** Solo lectura: URL base normalizada de la API. */
    baseUrl: base,
  }
}

/** @typedef {ReturnType<typeof createApiClient>} ApiClient */
