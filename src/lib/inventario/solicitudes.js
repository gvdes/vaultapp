import { track } from '../reactive'
import { supabase, isSupabaseConfigured } from '../supabase'
import { leerTodo } from '../supabaseTodo'
import { getEquipo, updateEquipo } from './sistemas'
import { getMaterial, registrarSalida } from './mantenimiento'
import { todayLocalDateString } from '../dateUtils'
import { registrarBitacora } from '../bitacora'

/** @typedef {'sistemas' | 'mantenimiento'} SolicitudTipo */
/** @typedef {'equipo_nuevo' | 'reparacion' | 'material'} SolicitudSubtipo */
/** @typedef {'pendiente' | 'asignado' | 'pendiente_compra' | 'completada' | 'cancelada'} SolicitudEstado */

/**
 * @typedef {object} Solicitud
 * @property {string} id
 * @property {SolicitudTipo} tipo
 * @property {SolicitudSubtipo} subtipo
 * @property {string} [familiaId]
 * @property {string} [ubicacionId]
 * @property {string} solicitanteNombre
 * @property {string} [creadoPor]
 * @property {string} descripcion
 * @property {number} cantidad
 * @property {SolicitudEstado} estado
 * @property {string} [equipoId]
 * @property {string} [materialId]
 * @property {number} fechaSolicitud
 * @property {string} [fechaEstimada]
 * @property {number} [fechaCierre]
 * @property {string} [atendidoPor]
 * @property {string} [notas]
 * @property {number} createdAt
 */

const KEY = 'dga_inv_solicitudes'

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function writeLocal(items) {
  localStorage.setItem(KEY, JSON.stringify(items))
}

function fromRow(r) {
  return {
    id: r.id,
    tipo: r.tipo,
    subtipo: r.subtipo,
    familiaId: r.familia_id ?? undefined,
    ubicacionId: r.ubicacion_id ?? undefined,
    solicitanteNombre: r.solicitante_nombre,
    creadoPor: r.creado_por ?? undefined,
    descripcion: r.descripcion,
    cantidad: Number(r.cantidad ?? 1),
    estado: r.estado,
    equipoId: r.equipo_id ?? undefined,
    materialId: r.material_id ?? undefined,
    fechaSolicitud: new Date(r.fecha_solicitud).getTime(),
    fechaEstimada: r.fecha_estimada ?? undefined,
    fechaCierre: r.fecha_cierre ? new Date(r.fecha_cierre).getTime() : undefined,
    atendidoPor: r.atendido_por ?? undefined,
    notas: r.notas ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
  }
}

let cache = []
let ready = false

export async function loadSolicitudesCache() {
  if (!isSupabaseConfigured || !supabase) {
    cache = readLocal()
    ready = true
    return
  }
  const { data } = await leerTodo('inv_solicitudes', { orden: 'fecha_solicitud', ascendente: false })
  cache = (data ?? []).map(fromRow)
  ready = true
}

export function isSolicitudesCacheReady() {
  return ready
}

export function listSolicitudes(filter) {
  track()
  let list = [...cache]
  if (filter?.tipo) list = list.filter((s) => s.tipo === filter.tipo)
  if (filter?.estado) list = list.filter((s) => s.estado === filter.estado)
  return list.sort((a, b) => b.fechaSolicitud - a.fechaSolicitud)
}

export function getSolicitud(id) {
  track()
  return cache.find((s) => s.id === id)
}

async function persist(s, isNew) {
  if (isSupabaseConfigured && supabase) {
    const row = {
      id: s.id,
      tipo: s.tipo,
      subtipo: s.subtipo,
      familia_id: s.familiaId ?? null,
      ubicacion_id: s.ubicacionId ?? null,
      solicitante_nombre: s.solicitanteNombre,
      creado_por: s.creadoPor ?? null,
      descripcion: s.descripcion,
      cantidad: s.cantidad,
      estado: s.estado,
      equipo_id: s.equipoId ?? null,
      material_id: s.materialId ?? null,
      fecha_solicitud: new Date(s.fechaSolicitud).toISOString(),
      fecha_estimada: s.fechaEstimada ?? null,
      fecha_cierre: s.fechaCierre ? new Date(s.fechaCierre).toISOString() : null,
      atendido_por: s.atendidoPor ?? null,
      notas: s.notas ?? null,
    }
    if (isNew) {
      const { error } = await supabase.from('inv_solicitudes').insert(row)
      if (error) throw error
    } else {
      const { error } = await supabase.from('inv_solicitudes').update(row).eq('id', s.id)
      if (error) throw error
    }
  } else {
    const all = readLocal()
    writeLocal(isNew ? [...all, s] : all.map((x) => (x.id === s.id ? s : x)))
  }
}

export async function crearSolicitud(
  input,
) {
  const now = Date.now()
  const solicitud = {
    id: `${now}-${Math.round(Math.random() * 1e6)}`,
    estado: 'pendiente',
    fechaSolicitud: now,
    createdAt: now,
    ...input,
  }
  await persist(solicitud, true)
  cache = [solicitud, ...cache]
  registrarBitacora({ tabla: 'inv_solicitudes', registroId: solicitud.id, accion: 'alta', despues: solicitud, detalle: `Solicitud de ${solicitud.solicitanteNombre}: ${solicitud.descripcion}` })
  return solicitud
}

async function actualizarEstado(id, patch) {
  const prev = cache.find((s) => s.id === id)
  if (!prev) throw new Error('Solicitud no encontrada')
  const next = { ...prev, ...patch }
  cache = cache.map((s) => (s.id === id ? next : s))
  await persist(next, false)
  registrarBitacora({
    tabla: 'inv_solicitudes',
    registroId: id,
    accion: next.estado === 'cancelada' ? 'cancelación' : 'cambio de estado',
    antes: { estado: prev.estado },
    despues: { estado: next.estado, equipoId: next.equipoId, materialId: next.materialId, atendidoPor: next.atendidoPor, fechaEstimada: next.fechaEstimada },
    detalle: `Solicitud "${prev.descripcion}"`,
  })
  return next
}

export async function cancelarSolicitud(id) {
  await actualizarEstado(id, { estado: 'cancelada', fechaCierre: Date.now() })
}

export async function marcarPendienteCompra(id, fechaEstimada, atendidoPor) {
  await actualizarEstado(id, { estado: 'pendiente_compra', fechaEstimada, atendidoPor })
}

/** Resuelve asignando un equipo disponible existente (subtipo equipo_nuevo o reparacion). */
export async function resolverConEquipo(id, equipoId, atendidoPor) {
  const solicitud = getSolicitud(id)
  if (!solicitud) throw new Error('Solicitud no encontrada')
  const equipo = getEquipo(equipoId)
  if (!equipo) throw new Error('Equipo no encontrado')

  if (solicitud.subtipo === 'reparacion') {
    await updateEquipo(equipoId, { estado: 'en_reparacion' }, atendidoPor)
  } else {
    await updateEquipo(
      equipoId,
      {
        estado: 'asignado',
        ubicacionId: solicitud.ubicacionId,
        usuarioAsignado: solicitud.solicitanteNombre,
        fechaAsignacion: todayLocalDateString(),
      },
      atendidoPor,
    )
  }
  await actualizarEstado(id, { estado: 'asignado', equipoId, atendidoPor, fechaCierre: Date.now() })
}

/** Resuelve descontando de un material en stock (subtipo material). */
export async function resolverConMaterial(id, materialId, atendidoPor) {
  const solicitud = getSolicitud(id)
  if (!solicitud) throw new Error('Solicitud no encontrada')
  const material = getMaterial(materialId)
  if (!material) throw new Error('Material no encontrado')

  await registrarSalida({
    materialId,
    fecha: todayLocalDateString(),
    cantidad: solicitud.cantidad,
    motivo: `Solicitud: ${solicitud.descripcion}`,
    ubicacionDestinoId: solicitud.ubicacionId,
    quienSolicito: solicitud.solicitanteNombre,
    quienEntrego: atendidoPor,
  })
  await actualizarEstado(id, { estado: 'completada', materialId, atendidoPor, fechaCierre: Date.now() })
}

export async function completarSolicitud(id, atendidoPor) {
  await actualizarEstado(id, { estado: 'completada', atendidoPor, fechaCierre: Date.now() })
}

export function solicitudesPendientesCompra() {
  track()
  return cache.filter((s) => s.estado === 'pendiente_compra')
}

export function solicitudesPendientesCount() {
  track()
  return cache.filter((s) => s.estado === 'pendiente' || s.estado === 'pendiente_compra').length
}
