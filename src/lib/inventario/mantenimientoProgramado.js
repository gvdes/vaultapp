import { track } from '../reactive'
import { supabase, isSupabaseConfigured } from '../supabase'
import { leerTodo } from '../supabaseTodo'
import { parseLocalDate, toLocalDateString, todayLocalDateString } from '../dateUtils'
import { registrarBitacora, cambios } from '../bitacora'

/**
 * @typedef {object} MantenimientoProgramado
 * @property {string} id
 * @property {string} nombre
 * @property {string} [ubicacionId]
 * @property {string} [equipoId]
 * @property {number} frecuenciaMeses
 * @property {string} proximaFecha
 * @property {string} [responsable]
 * @property {boolean} activo
 * @property {string} [notas]
 * @property {number} createdAt
 */

/**
 * @typedef {object} MantenimientoRealizado
 * @property {string} id
 * @property {string} programadoId
 * @property {string} fechaRealizado
 * @property {string} [realizadoPor]
 * @property {string} [notas]
 * @property {number} createdAt
 */

const PROG_KEY = 'dga_inv_mantenimientos_programados'
const HIST_KEY = 'dga_inv_mantenimientos_historial'

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function writeLocal(key, items) {
  localStorage.setItem(key, JSON.stringify(items))
}

let programadosCache = []
let historialCache = []
let ready = false

export async function loadMantenimientoProgramadoCache() {
  if (!isSupabaseConfigured || !supabase) {
    programadosCache = readLocal(PROG_KEY)
    historialCache = readLocal(HIST_KEY)
    ready = true
    return
  }
  const [progRes, histRes] = await Promise.all([
    leerTodo('inv_mantenimientos_programados', { orden: 'proxima_fecha' }),
    leerTodo('inv_mantenimientos_historial', { orden: 'fecha_realizado', ascendente: false }),
  ])
  programadosCache = (progRes.data ?? []).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    ubicacionId: r.ubicacion_id ?? undefined,
    equipoId: r.equipo_id ?? undefined,
    frecuenciaMeses: Number(r.frecuencia_meses),
    proximaFecha: r.proxima_fecha,
    responsable: r.responsable ?? undefined,
    activo: r.activo,
    notas: r.notas ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
  }))
  historialCache = (histRes.data ?? []).map((r) => ({
    id: r.id,
    programadoId: r.programado_id,
    fechaRealizado: r.fecha_realizado,
    realizadoPor: r.realizado_por ?? undefined,
    notas: r.notas ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
  }))
  ready = true
}

export function isMantenimientoProgramadoCacheReady() {
  return ready
}

export function listMantenimientosProgramados(soloActivos = true) {
  track()
  const list = soloActivos ? programadosCache.filter((p) => p.activo) : programadosCache
  return [...list].sort((a, b) => a.proximaFecha.localeCompare(b.proximaFecha))
}

export function listHistorial(programadoId) {
  track()
  const list = programadoId ? historialCache.filter((h) => h.programadoId === programadoId) : historialCache
  return [...list].sort((a, b) => b.createdAt - a.createdAt)
}

/** Programaciones cuya próxima fecha cae dentro de los próximos `diasAntes` días (incluye vencidas). */
export function proximosMantenimientos(diasAntes = 7) {
  track()
  const limite = new Date()
  limite.setDate(limite.getDate() + diasAntes)
  const limiteStr = toLocalDateString(limite)
  return listMantenimientosProgramados().filter((p) => p.proximaFecha <= limiteStr)
}

export async function addMantenimientoProgramado(input) {
  const now = Date.now()
  const item = { id: `${now}-${Math.round(Math.random() * 1e6)}`, createdAt: now, ...input }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_mantenimientos_programados').insert({
      id: item.id,
      nombre: item.nombre,
      ubicacion_id: item.ubicacionId ?? null,
      equipo_id: item.equipoId ?? null,
      frecuencia_meses: item.frecuenciaMeses,
      proxima_fecha: item.proximaFecha,
      responsable: item.responsable ?? null,
      activo: item.activo,
      notas: item.notas ?? null,
    })
    if (error) throw error
  } else {
    writeLocal(PROG_KEY, [...readLocal(PROG_KEY), item])
  }
  programadosCache = [...programadosCache, item]
  registrarBitacora({ tabla: 'inv_mantenimientos_programados', registroId: item.id, accion: 'alta', despues: item, detalle: `Mantenimiento programado "${item.nombre}"` })
  return item
}

export async function updateMantenimientoProgramado(id, patch) {
  const prev = programadosCache.find((p) => p.id === id)
  programadosCache = programadosCache.map((p) => (p.id === id ? { ...p, ...patch } : p))
  if (isSupabaseConfigured && supabase) {
    const row = {}
    if (patch.nombre !== undefined) row.nombre = patch.nombre
    if (patch.ubicacionId !== undefined) row.ubicacion_id = patch.ubicacionId || null
    if (patch.equipoId !== undefined) row.equipo_id = patch.equipoId || null
    if (patch.frecuenciaMeses !== undefined) row.frecuencia_meses = patch.frecuenciaMeses
    if (patch.proximaFecha !== undefined) row.proxima_fecha = patch.proximaFecha
    if (patch.responsable !== undefined) row.responsable = patch.responsable || null
    if (patch.activo !== undefined) row.activo = patch.activo
    if (patch.notas !== undefined) row.notas = patch.notas || null
    const { error } = await supabase.from('inv_mantenimientos_programados').update(row).eq('id', id)
    if (error) throw error
  } else {
    writeLocal(PROG_KEY, programadosCache)
  }
  const { antes, despues } = cambios(prev, patch)
  const accion = patch.activo === undefined || patch.activo === prev?.activo ? 'cambio' : patch.activo ? 'reactivación' : 'desactivación'
  registrarBitacora({ tabla: 'inv_mantenimientos_programados', registroId: id, accion, antes, despues, detalle: prev ? `Mantenimiento programado "${prev.nombre}"` : undefined })
}

/** Desactiva una programación (nunca se borra: conserva su historial y se puede reactivar). */
export async function desactivarMantenimientoProgramado(id) {
  await updateMantenimientoProgramado(id, { activo: false })
}

export async function reactivarMantenimientoProgramado(id) {
  await updateMantenimientoProgramado(id, { activo: true })
}

/** Registra que se realizó el mantenimiento hoy y recalcula la próxima fecha (+frecuenciaMeses). */
export async function marcarRealizado(programadoId, realizadoPor, notas) {
  const programado = programadosCache.find((p) => p.id === programadoId)
  if (!programado) throw new Error('Mantenimiento programado no encontrado')

  const now = Date.now()
  const fechaRealizado = todayLocalDateString()
  const registro = { id: `${now}-${Math.round(Math.random() * 1e6)}`, programadoId, fechaRealizado, realizadoPor, notas, createdAt: now }

  const proxima = parseLocalDate(programado.proximaFecha)
  proxima.setMonth(proxima.getMonth() + programado.frecuenciaMeses)
  const proximaFecha = toLocalDateString(proxima)

  if (isSupabaseConfigured && supabase) {
    const { error: e1 } = await supabase.from('inv_mantenimientos_historial').insert({
      id: registro.id,
      programado_id: registro.programadoId,
      fecha_realizado: registro.fechaRealizado,
      realizado_por: registro.realizadoPor ?? null,
      notas: registro.notas ?? null,
    })
    if (e1) throw e1
  } else {
    writeLocal(HIST_KEY, [...readLocal(HIST_KEY), registro])
  }
  historialCache = [registro, ...historialCache]
  registrarBitacora({
    tabla: 'inv_mantenimientos_historial',
    registroId: registro.id,
    accion: 'alta',
    despues: registro,
    detalle: `Mantenimiento realizado: "${programado.nombre}"`,
  })
  await updateMantenimientoProgramado(programadoId, { proximaFecha })
}
