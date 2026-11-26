import { track } from '../reactive'
import { supabase, isSupabaseConfigured } from '../supabase'
import { leerTodo } from '../supabaseTodo'
import { getFamilia } from './comunes'
import { registrarBitacora, cambios } from '../bitacora'

/** @typedef {'disponible' | 'asignado' | 'danado' | 'en_reparacion' | 'baja'} EstadoEquipo */

/**
 * @typedef {object} Equipo
 * @property {string} id
 * @property {string} familiaId
 * @property {string} [modelo]
 * @property {string} [marca]
 * @property {string} [numeroSerie]
 * @property {string} [fotoUrl]
 * @property {string} [ubicacionId]
 * @property {string} [areaDepartamento]
 * @property {string} [usuarioAsignado]
 * @property {string} [puesto]
 * @property {string} [fechaAsignacion]
 * @property {string} [proveedor]
 * @property {string} [fechaCompra]
 * @property {string} [numeroFactura]
 * @property {number} costoTotal
 * @property {string} [facturaUrl]
 * @property {number} [garantiaMeses]
 * @property {string} [responsivaUrl]
 * @property {EstadoEquipo} estado
 * @property {string} [qrCode]
 * @property {string} [notas]
 * @property {string} [compraRef] - Referencia única de la compra importada (evita duplicar al re-importar).
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** @typedef {'asignacion' | 'reasignacion' | 'cambio_estado' | 'baja'} MovimientoTipo */

/**
 * @typedef {object} EquipoMovimiento
 * @property {string} id
 * @property {string} equipoId
 * @property {number} fecha
 * @property {MovimientoTipo} tipo
 * @property {string} [ubicacionAnteriorId]
 * @property {string} [ubicacionNuevaId]
 * @property {string} [usuarioAnterior]
 * @property {string} [usuarioNuevo]
 * @property {string} [estadoAnterior]
 * @property {string} [estadoNuevo]
 * @property {string} [motivo]
 * @property {string} [registradoPor]
 */

const EQUIPOS_KEY = 'dga_inv_equipos'
const MOVS_KEY = 'dga_inv_equipos_movimientos'

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

function fromRow(r) {
  return {
    id: r.id,
    familiaId: r.familia_id,
    modelo: r.modelo ?? undefined,
    marca: r.marca ?? undefined,
    numeroSerie: r.numero_serie ?? undefined,
    fotoUrl: r.foto_url ?? undefined,
    ubicacionId: r.ubicacion_id ?? undefined,
    areaDepartamento: r.area_departamento ?? undefined,
    usuarioAsignado: r.usuario_asignado ?? undefined,
    puesto: r.puesto ?? undefined,
    fechaAsignacion: r.fecha_asignacion ?? undefined,
    proveedor: r.proveedor ?? undefined,
    fechaCompra: r.fecha_compra ?? undefined,
    numeroFactura: r.numero_factura ?? undefined,
    costoTotal: Number(r.costo_total ?? 0),
    facturaUrl: r.factura_url ?? undefined,
    garantiaMeses: r.garantia_meses != null ? Number(r.garantia_meses) : undefined,
    responsivaUrl: r.responsiva_url ?? undefined,
    estado: r.estado,
    qrCode: r.qr_code ?? undefined,
    notas: r.notas ?? undefined,
    compraRef: r.compra_ref ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  }
}

function toRow(e) {
  const row = {}
  if (e.familiaId !== undefined) row.familia_id = e.familiaId
  if (e.modelo !== undefined) row.modelo = e.modelo || null
  if (e.marca !== undefined) row.marca = e.marca || null
  if (e.numeroSerie !== undefined) row.numero_serie = e.numeroSerie || null
  if (e.fotoUrl !== undefined) row.foto_url = e.fotoUrl || null
  if (e.ubicacionId !== undefined) row.ubicacion_id = e.ubicacionId || null
  if (e.areaDepartamento !== undefined) row.area_departamento = e.areaDepartamento || null
  if (e.usuarioAsignado !== undefined) row.usuario_asignado = e.usuarioAsignado || null
  if (e.puesto !== undefined) row.puesto = e.puesto || null
  if (e.fechaAsignacion !== undefined) row.fecha_asignacion = e.fechaAsignacion || null
  if (e.proveedor !== undefined) row.proveedor = e.proveedor || null
  if (e.fechaCompra !== undefined) row.fecha_compra = e.fechaCompra || null
  if (e.numeroFactura !== undefined) row.numero_factura = e.numeroFactura || null
  if (e.costoTotal !== undefined) row.costo_total = e.costoTotal
  if (e.facturaUrl !== undefined) row.factura_url = e.facturaUrl || null
  if (e.garantiaMeses !== undefined) row.garantia_meses = e.garantiaMeses ?? null
  if (e.responsivaUrl !== undefined) row.responsiva_url = e.responsivaUrl || null
  if (e.estado !== undefined) row.estado = e.estado
  if (e.qrCode !== undefined) row.qr_code = e.qrCode || null
  if (e.notas !== undefined) row.notas = e.notas || null
  if (e.compraRef !== undefined) row.compra_ref = e.compraRef || null
  return row
}

let equiposCache = []
let movimientosCache = []
let ready = false

export async function loadSistemasCache() {
  if (!isSupabaseConfigured || !supabase) {
    equiposCache = readLocal(EQUIPOS_KEY)
    movimientosCache = readLocal(MOVS_KEY)
    ready = true
    return
  }
  const [eqRes, movRes] = await Promise.all([
    leerTodo('inv_equipos'),
    leerTodo('inv_equipos_movimientos', { orden: 'fecha', ascendente: false }),
  ])
  equiposCache = (eqRes.data ?? []).map(fromRow)
  movimientosCache = (movRes.data ?? []).map((r) => ({
    id: r.id,
    equipoId: r.equipo_id,
    fecha: new Date(r.fecha).getTime(),
    tipo: r.tipo,
    ubicacionAnteriorId: r.ubicacion_anterior_id ?? undefined,
    ubicacionNuevaId: r.ubicacion_nueva_id ?? undefined,
    usuarioAnterior: r.usuario_anterior ?? undefined,
    usuarioNuevo: r.usuario_nuevo ?? undefined,
    estadoAnterior: r.estado_anterior ?? undefined,
    estadoNuevo: r.estado_nuevo ?? undefined,
    motivo: r.motivo ?? undefined,
    registradoPor: r.registrado_por ?? undefined,
  }))
  ready = true
}

export function isSistemasCacheReady() {
  return ready
}

export function listEquipos() {
  track()
  return equiposCache
}

export function listEquiposPorFamilia(familiaId) {
  track()
  return equiposCache.filter((e) => e.familiaId === familiaId)
}

/** ¿Ya existe un equipo importado con esta referencia de compra? */
export function existeCompraRef(ref) {
  track()
  return equiposCache.some((e) => e.compraRef === ref)
}

export function getEquipo(id) {
  track()
  return equiposCache.find((e) => e.id === id)
}

async function persistMovimiento(mov) {
  movimientosCache = [mov, ...movimientosCache]
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_equipos_movimientos').insert({
      id: mov.id,
      equipo_id: mov.equipoId,
      fecha: new Date(mov.fecha).toISOString(),
      tipo: mov.tipo,
      ubicacion_anterior_id: mov.ubicacionAnteriorId ?? null,
      ubicacion_nueva_id: mov.ubicacionNuevaId ?? null,
      usuario_anterior: mov.usuarioAnterior ?? null,
      usuario_nuevo: mov.usuarioNuevo ?? null,
      estado_anterior: mov.estadoAnterior ?? null,
      estado_nuevo: mov.estadoNuevo ?? null,
      motivo: mov.motivo ?? null,
      registrado_por: mov.registradoPor ?? null,
    })
    if (error) throw error
  } else {
    writeLocal(MOVS_KEY, movimientosCache)
  }
}

export function listMovimientos(equipoId) {
  track()
  const list = equipoId ? movimientosCache.filter((m) => m.equipoId === equipoId) : movimientosCache
  return [...list].sort((a, b) => b.fecha - a.fecha)
}

/** Series provisionales (p. ej. importadas sin número real) no cuentan para la unicidad. */
const PREFIJO_SERIE_PENDIENTE = 'PENDIENTE-'

function normalizarSerie(serie) {
  return (serie ?? '').trim().toLowerCase()
}

/** ¿Esta serie cuenta para el control de unicidad? (no vacía y no provisional) */
export function serieControlable(serie) {
  const n = normalizarSerie(serie)
  return n !== '' && !n.startsWith(PREFIJO_SERIE_PENDIENTE.toLowerCase())
}

/** ¿Ya existe un equipo (de cualquier familia o dominio, incluidos los dados de baja) con esta serie? */
export function existeSerie(serie) {
  track()
  if (!serieControlable(serie)) return false
  const n = normalizarSerie(serie)
  return equiposCache.some((e) => normalizarSerie(e.numeroSerie) === n)
}

export async function addEquipo(input, registradoPor) {
  if (existeSerie(input.numeroSerie)) {
    throw new Error(`La serie "${(input.numeroSerie ?? '').trim()}" ya está registrada en otro equipo. Cada pieza debe tener un número de serie único.`)
  }
  const now = Date.now()
  const equipo = { id: `${now}-${Math.round(Math.random() * 1e6)}`, ...input, createdAt: now, updatedAt: now }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_equipos').insert({ id: equipo.id, ...toRow(equipo) })
    if (error) throw error
  } else {
    writeLocal(EQUIPOS_KEY, [...readLocal(EQUIPOS_KEY), equipo])
  }
  equiposCache = [...equiposCache, equipo]
  registrarBitacora({
    tabla: 'inv_equipos',
    registroId: equipo.id,
    accion: 'alta',
    despues: equipo,
    detalle: `Alta de equipo ${equipo.modelo || equipo.numeroSerie || equipo.id}`,
  })
  await persistMovimiento({
    id: `${now}-${Math.round(Math.random() * 1e6)}-mov`,
    equipoId: equipo.id,
    fecha: now,
    tipo: 'asignacion',
    ubicacionNuevaId: equipo.ubicacionId,
    usuarioNuevo: equipo.usuarioAsignado,
    estadoNuevo: equipo.estado,
    motivo: 'Alta de equipo',
    registradoPor,
  })
  return equipo
}

export async function updateEquipo(
  id,
  patch,
  registradoPor,
) {
  const prev = equiposCache.find((e) => e.id === id)
  if (!prev) throw new Error('Equipo no encontrado')
  if (
    patch.numeroSerie !== undefined &&
    serieControlable(patch.numeroSerie) &&
    normalizarSerie(patch.numeroSerie) !== normalizarSerie(prev.numeroSerie) &&
    equiposCache.some((e) => e.id !== id && normalizarSerie(e.numeroSerie) === normalizarSerie(patch.numeroSerie))
  ) {
    throw new Error(`La serie "${patch.numeroSerie.trim()}" ya está registrada en otro equipo. Cada pieza debe tener un número de serie único.`)
  }
  const next = { ...prev, ...patch, updatedAt: Date.now() }
  equiposCache = equiposCache.map((e) => (e.id === id ? next : e))
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_equipos').update({ ...toRow(patch), updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  } else {
    writeLocal(EQUIPOS_KEY, equiposCache)
  }

  const huboReasignacion = patch.ubicacionId !== undefined && patch.ubicacionId !== prev.ubicacionId
  const huboCambioEstado = patch.estado !== undefined && patch.estado !== prev.estado
  const dif = cambios(prev, patch)
  if (Object.keys(dif.despues).length > 0) {
    registrarBitacora({
      tabla: 'inv_equipos',
      registroId: id,
      accion: next.estado === 'baja' && huboCambioEstado ? 'baja' : huboReasignacion ? 'traslado' : huboCambioEstado ? 'cambio de estado' : 'cambio',
      antes: dif.antes,
      despues: dif.despues,
      detalle: `Equipo ${prev.modelo || prev.numeroSerie || prev.id}`,
    })
  }
  if (huboReasignacion || huboCambioEstado) {
    await persistMovimiento({
      id: `${Date.now()}-${Math.round(Math.random() * 1e6)}-mov`,
      equipoId: id,
      fecha: Date.now(),
      tipo: next.estado === 'baja' ? 'baja' : huboReasignacion ? 'reasignacion' : 'cambio_estado',
      ubicacionAnteriorId: prev.ubicacionId,
      ubicacionNuevaId: next.ubicacionId,
      usuarioAnterior: prev.usuarioAsignado,
      usuarioNuevo: next.usuarioAsignado,
      estadoAnterior: prev.estado,
      estadoNuevo: next.estado,
      registradoPor,
    })
  }
}

/** Equipos activos de Sistemas (no cuenta las piezas serializadas de Mantenimiento). */
export function totalEquipos() {
  track()
  return equiposCache.filter((e) => e.estado !== 'baja' && getFamilia(e.familiaId)?.tipo === 'sistemas').length
}
