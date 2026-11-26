import { track } from './reactive'
import { supabase, isSupabaseConfigured } from './supabase'
import { leerTodo } from './supabaseTodo'
import { user } from './auth'
import { canReadTabla } from './access'

/**
 * Bitácora de cambios (regla de oro: NO SE BORRA NADA; todo cambio deja huella).
 *
 * - Con Supabase la bitácora la escriben los TRIGGERS de la base de datos (migración 014: `bitacora_trigger()` en cada
 *   tabla inv_* / cmp_*), así que `registrarBitacora()` no hace nada: no se puede omitir ni falsificar desde el cliente.
 * - En modo demo local se guarda en localStorage (`dga_inv_bitacora`) para que la capacitación muestre el mismo rastro.
 *
 * Convención de `tabla`: el nombre de la tabla de la base de datos (inv_equipos, inv_proveedores, cmp_requisiciones…).
 */

/**
 * @typedef {object} BitacoraEntry
 * @property {string} id
 * @property {number} fecha
 * @property {string} [usuarioId]
 * @property {string} usuario
 * @property {string} tabla
 * @property {string} registroId
 * @property {string} accion - Con Supabase: INSERT | UPDATE. En modo local: alta, cambio, baja, desactivación…
 * @property {unknown} [antes]
 * @property {unknown} [despues]
 * @property {string} [detalle] - Texto libre con el resumen del cambio (solo modo local).
 */

/**
 * @typedef {object} BitacoraInput
 * @property {string} tabla
 * @property {string} registroId
 * @property {string} accion
 * @property {unknown} [antes]
 * @property {unknown} [despues]
 * @property {string} [detalle]
 * @property {string} [usuario] - Solo modo local: nombre de quien actuó, si no es el de la sesión (p. ej. el ejemplo de la demo).
 * @property {number} [fecha] - Solo modo local: marca de tiempo (ms), si no es ahora (p. ej. el ejemplo de la demo).
 */

/**
 * @typedef {object} BitacoraFiltros
 * @property {string} [tabla]
 * @property {string} [usuario]
 * @property {string} [accion]
 * @property {number} [desde] - Timestamp (ms) inicial, inclusive.
 * @property {number} [hasta] - Timestamp (ms) final, inclusive.
 * @property {string} [texto]
 * @property {number} [limit]
 */

const KEY = 'dga_inv_bitacora'
/** Tope de entradas guardadas en modo local (se descartan las más viejas SOLO del demo; con Supabase es ilimitada). */
const MAX_LOCAL = 5000
const MAX_STR = 400

let cache = []
let ready = false

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeLocal(items) {
  let list = items
  // Si el almacenamiento está lleno se reduce a la mitad más reciente y se reintenta una vez.
  for (let intento = 0; intento < 2; intento++) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list))
      return
    } catch {
      list = list.slice(0, Math.floor(list.length / 2))
    }
  }
}

/** Evita guardar archivos (data URLs) o textos enormes dentro de la bitácora local. */
function limpiar(valor, profundidad = 0) {
  if (valor === null || valor === undefined) return valor
  if (typeof valor === 'string') {
    if (valor.startsWith('data:')) return '[archivo adjunto]'
    return valor.length > MAX_STR ? `${valor.slice(0, MAX_STR)}…` : valor
  }
  if (typeof valor !== 'object') return valor
  if (profundidad >= 4) return '[…]'
  if (Array.isArray(valor)) return valor.slice(0, 50).map((v) => limpiar(v, profundidad + 1))
  const out = {}
  for (const [k, v] of Object.entries(valor)) out[k] = limpiar(v, profundidad + 1)
  return out
}

/**
 * Registra un cambio. Fire-and-forget: nunca lanza ni bloquea la operación que la invoca.
 * Con Supabase no hace nada (la bitácora real la escriben los triggers de la base de datos).
 */
export function registrarBitacora(entry) {
  if (isSupabaseConfigured && supabase) return
  try {
    const now = entry.fecha ?? Date.now()
    const u = user.value
    const item = {
      id: `${now}-${Math.round(Math.random() * 1e6)}`,
      fecha: now,
      usuarioId: entry.usuario ? undefined : u?.id,
      usuario: entry.usuario ?? u?.displayName ?? u?.username ?? 'Sistema',
      tabla: entry.tabla,
      registroId: entry.registroId,
      accion: entry.accion,
      antes: limpiar(entry.antes),
      despues: limpiar(entry.despues),
      detalle: entry.detalle,
    }
    // Lee del almacenamiento (no solo de la caché) para no pisar entradas escritas desde otra pestaña.
    const todas = [item, ...readLocal()].slice(0, MAX_LOCAL)
    writeLocal(todas)
    cache = [item, ...cache].slice(0, MAX_LOCAL)
  } catch {
    /* la bitácora local nunca debe romper la operación */
  }
}

/** Acción con la que la bitácora (local y de Supabase, migración 021) anota un intento de borrar un registro. */
export const ACCION_INTENTO_BORRADO = 'intento_borrado'

/**
 * Regla de oro: NADA se borra. Cualquier camino de código que algún día pudiera borrar un registro debe pasar por aquí EN VEZ de
 * borrar: la fila no se toca y el intento queda en la bitácora (modo demo local) para que Dirección lo vea en sus alertas.
 * Con Supabase no hace nada: lo registra y avisa por correo el trigger `bloquear_borrado()` de la base (migración 021).
 * Hoy NINGUNA pantalla ni función de la app borra datos (solo baja, cancelación o desactivación con motivo), así que solo la usan
 * el ejemplo de la demo y el botón de prueba de la Bitácora.
 */
export function registrarIntentoBorrado(
  tabla,
  id,
  detalle,
  opciones,
) {
  registrarBitacora({
    tabla,
    registroId: id,
    accion: ACCION_INTENTO_BORRADO,
    antes: opciones?.antes,
    despues: { rol: opciones?.rol ?? user.value?.role, motivo: 'DELETE cancelado: en esta plataforma nada se borra', avisados: 0 },
    detalle: detalle ?? 'Intento de borrar un registro: no se borró.',
    usuario: opciones?.usuario,
    fecha: opciones?.fecha,
  })
}

/** De un registro previo y un parche, devuelve solo los campos que realmente cambiaron (antes/después) para la bitácora. */
export function cambios(prev, patch) {
  const antes = {}
  const despues = {}
  for (const [k, v] of Object.entries(patch)) {
    const anterior = prev ? prev[k] : undefined
    if (JSON.stringify(anterior ?? null) !== JSON.stringify(v ?? null)) {
      antes[k] = anterior ?? null
      despues[k] = v ?? null
    }
  }
  return { antes, despues }
}

export async function loadBitacoraCache() {
  if (!isSupabaseConfigured || !supabase) {
    cache = readLocal()
    ready = true
    return
  }
  // Roles a los que la API niega la bitácora (403): no se pide.
  if (!canReadTabla(user.value?.role, 'inv_bitacora')) {
    cache = []
    ready = true
    return
  }
  const { data } = await leerTodo('inv_bitacora', { orden: 'fecha', ascendente: false, maxFilas: 2000 })
  cache = (data ?? []).map((r) => ({
    id: String(r.id),
    fecha: new Date(r.fecha).getTime(),
    usuarioId: r.usuario_id ?? undefined,
    usuario: r.usuario_nombre ?? 'Sistema',
    tabla: r.tabla,
    registroId: String(r.registro_id ?? ''),
    accion: r.accion,
    antes: r.antes ?? undefined,
    despues: r.despues ?? undefined,
  }))
  ready = true
}

export function isBitacoraCacheReady() {
  return ready
}

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Entradas de la bitácora (más reciente primero), con filtros opcionales. Solo lectura. */
export function listBitacora(filtros) {
  track()
  let list = [...cache].sort((a, b) => b.fecha - a.fecha)
  if (!filtros) return list
  if (filtros.tabla) list = list.filter((e) => e.tabla === filtros.tabla)
  if (filtros.accion) list = list.filter((e) => e.accion === filtros.accion)
  if (filtros.usuario) {
    const q = norm(filtros.usuario)
    list = list.filter((e) => norm(e.usuario).includes(q))
  }
  if (filtros.desde !== undefined) list = list.filter((e) => e.fecha >= filtros.desde)
  if (filtros.hasta !== undefined) list = list.filter((e) => e.fecha <= filtros.hasta)
  if (filtros.texto) {
    const q = norm(filtros.texto)
    list = list.filter((e) => norm(`${e.tabla} ${e.registroId} ${e.accion} ${e.usuario} ${e.detalle ?? ''} ${JSON.stringify(e.despues ?? e.antes ?? '')}`).includes(q))
  }
  return filtros.limit ? list.slice(0, filtros.limit) : list
}
