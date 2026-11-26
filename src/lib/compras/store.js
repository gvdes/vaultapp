/**
 * Infraestructura común de las cachés de Compras Indirectas (mismo patrón que lib/inventario/cargosPerdida.js):
 * una caché en memoria por tabla; con Supabase se carga/escribe en `cmp_*`, sin Supabase (modo demo) vive en localStorage
 * (llaves `dga_cmp_*`). Los getters que consumen las pantallas llaman a `track()` (ver lib/reactive.js).
 *
 * Nada se borra: este módulo NO expone ninguna operación de borrado.
 */
import { track } from '../reactive'
import { supabase, isSupabaseConfigured } from '../supabase'
import { user } from '../auth'
import { canReadTabla } from '../access'

export function modoLocal() {
  return !(isSupabaseConfigured && supabase)
}

// ---- Reloj (solo para sembrar datos de demostración con fechas coherentes) --------------------------------------------
let relojOverride = null
export function setRelojCompras(fn) {
  relojOverride = fn
}
export function ahora() {
  return relojOverride ? relojOverride() : Date.now()
}

export function nuevoId() {
  return `${ahora()}-${Math.round(Math.random() * 1e6)}`
}

/** Token aleatorio de 64 caracteres hexadecimales (256 bits). */
export function nuevoToken() {
  const bytes = new Uint8Array(32)
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Nombre de quien opera (sesión actual) o 'Sistema'. */
export function usuarioActual() {
  return user.value?.displayName ?? user.value?.username ?? 'Sistema'
}

export function errorDe(e) {
  if (e instanceof Error) return e
  if (e && typeof e === 'object' && 'message' in e) return new Error(String(e.message))
  return new Error(String(e))
}

// ---- Conversión camelCase <-> snake_case -------------------------------------------------------------------------------
function aSnake(s) {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}
function aCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/**
 * @template T
 * @typedef {object} DefTabla
 * @property {string} key - Llave de localStorage (modo local).
 * @property {string} tabla - Tabla de Supabase.
 * @property {keyof T & string} pk - Campo clave primaria (en la app).
 * @property {(keyof T & string)[]} [ts] - Campos timestamp (ms en la app, timestamptz en la base).
 * @property {(keyof T & string)[]} [num] - Campos numéricos (la base puede devolver numeric como texto).
 * @property {string} [orderBy] - Columna de orden al cargar.
 * @property {string} [columnas] - Columnas que se piden a la base al cargar la caché (por omisión `*`). Sirve para NO bajar columnas pesadas (fotos en línea) en cada inicio de sesión.
 * @property {boolean} [soloLocal] - Nadie con sesión puede leer esta tabla con un backend real (la API responde 403 a todos los roles): no se pide. Solo se carga en modo demo local.
 * @property {() => T[]} [seed] - Datos iniciales del modo local cuando no hay nada guardado todavía.
 * @property {string} [conflict] - Si se define, insert hace upsert con estas columnas de conflicto (tablas de clave compuesta).
 * @property {string[]} [soloLectura] - Columnas de la base que no se envían nunca (calculadas por el servidor).
 * @property {(t: T) => T} [alCargar] - Ajusta cada fila recién cargada de la base (p. ej. calcular un id local para tablas de clave compuesta).
 */

/** @typedef {Record<string, unknown>} Fila */

export class TablaCache {
  cache = []
  ready = false

  /** @param {DefTabla<T>} def */
  constructor(def) {
    this.def = def
  }

  fromRow(r) {
    const out = {}
    const ts = new Set(this.def.ts ?? [])
    const num = new Set(this.def.num ?? [])
    for (const [k, v] of Object.entries(r)) {
      const key = aCamel(k)
      if (v === null || v === undefined) continue
      if (ts.has(key)) out[key] = new Date(v).getTime()
      else if (num.has(key)) out[key] = Number(v)
      else out[key] = v
    }
    return out
  }

  toRow(item) {
    const out = {}
    const ts = new Set(this.def.ts ?? [])
    const skip = new Set(this.def.soloLectura ?? [])
    for (const [k, v] of Object.entries(item)) {
      if (v === undefined) continue
      const col = aSnake(k)
      if (skip.has(col)) continue
      if (ts.has(k)) out[col] = typeof v === 'number' ? new Date(v).toISOString() : v
      else out[col] = v === '' ? null : v
    }
    return out
  }

  readLocal() {
    try {
      const raw = localStorage.getItem(this.def.key)
      if (raw) return JSON.parse(raw)
    } catch {
      /* almacenamiento no disponible o corrupto */
    }
    return this.def.seed ? this.def.seed().map((x) => ({ ...x })) : []
  }

  writeLocal() {
    try {
      localStorage.setItem(this.def.key, JSON.stringify(this.cache))
    } catch {
      /* sin espacio: el dato vive solo en esta sesión */
    }
  }

  async load() {
    if (modoLocal()) {
      this.cache = this.readLocal()
      this.ready = true
      return
    }
    // soloLocal: nadie la lee con backend. canReadTabla: la API niega la lectura a este rol (403): no se pide y la caché queda vacía.
    if (this.def.soloLocal || !canReadTabla(user.value?.role, this.def.tabla)) {
      this.cache = []
      this.ready = true
      return
    }
    const filas = []
    for (let desde = 0; ; desde += 1000) {
      let q = supabase.from(this.def.tabla).select(this.def.columnas ?? '*')
      if (this.def.orderBy) q = q.order(this.def.orderBy, { ascending: true })
      const { data, error } = await q.range(desde, desde + 999)
      if (error) {
        // Sin permiso de lectura para este rol o tabla aún no migrada: la caché queda vacía (la app sigue funcionando).
        console.warn(`[compras] no se pudo leer ${this.def.tabla}:`, error.message)
        break
      }
      filas.push(...data)
      if (!data || data.length < 1000) break
    }
    this.cache = filas.map((r) => {
      const t = this.fromRow(r)
      return this.def.alCargar ? this.def.alCargar(t) : t
    })
    if (this.def.seed && this.cache.length === 0 && this.def.tabla !== 'cmp_notificaciones') {
      // catálogos: si la migración aún no sembró nada, se usa el seed local solo para lectura
      this.cache = this.def.seed().map((x) => ({ ...x }))
    }
    this.ready = true
  }

  isReady() {
    return this.ready
  }

  /** Lectura interna sin suscripción reactiva. */
  raw() {
    return this.cache
  }

  /** Lectura para pantallas: suscribe la plantilla al contador reactivo. */
  list() {
    track()
    return this.cache
  }

  get(pk) {
    track()
    return this.cache.find((x) => x[this.def.pk] === pk)
  }

  async insert(item) {
    if (!modoLocal()) {
      const q = supabase.from(this.def.tabla)
      const { error } = this.def.conflict
        ? await q.upsert(this.toRow(item), { onConflict: this.def.conflict })
        : await q.insert(this.toRow(item))
      if (error) throw errorDe(error)
    }
    const pk = item[this.def.pk]
    this.cache = [...this.cache.filter((x) => x[this.def.pk] !== pk), item]
    if (modoLocal()) this.writeLocal()
    return item
  }

  async update(pk, patch) {
    const prev = this.cache.find((x) => x[this.def.pk] === pk)
    if (!prev) throw new Error('Registro no encontrado')
    if (!modoLocal()) {
      const { error } = await supabase.from(this.def.tabla).update(this.toRow(patch)).eq(aSnake(this.def.pk), pk)
      if (error) throw errorDe(error)
    }
    const next = { ...prev, ...patch }
    this.cache = this.cache.map((x) => (x[this.def.pk] === pk ? next : x))
    if (modoLocal()) this.writeLocal()
    return next
  }

  /** Reemplaza un registro de la caché sin tocar la base (cuando ya lo escribió una RPC o un trigger). */
  setLocal(item) {
    const pk = item[this.def.pk]
    const existe = this.cache.some((x) => x[this.def.pk] === pk)
    this.cache = existe ? this.cache.map((x) => (x[this.def.pk] === pk ? item : x)) : [...this.cache, item]
    if (modoLocal()) this.writeLocal()
  }

  /** Borra TODAS las llaves locales de la tabla (solo para sembrar datos de demostración; no hay borrado de registros). */
  reiniciarLocal() {
    try {
      localStorage.removeItem(this.def.key)
    } catch {
      /* nada */
    }
  }
}

export function crearTabla(def) {
  return new TablaCache(def)
}

/** Quita campos sensibles (tokens) antes de mandar un objeto a la bitácora. */
export function paraBitacora(o) {
  if (!o) return undefined
  const out = {}
  for (const [k, v] of Object.entries(o)) {
    if (/token/i.test(k)) continue
    out[k] = v
  }
  return out
}

/** Normaliza texto para comparar (minúsculas, sin acentos ni espacios repetidos). */
export function normalizar(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
