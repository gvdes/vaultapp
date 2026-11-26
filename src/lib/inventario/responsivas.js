import { track } from '../reactive'
import { supabase, isSupabaseConfigured } from '../supabase'
import { leerTodo } from '../supabaseTodo'
import { todayLocalDateString } from '../dateUtils'
import { registrarBitacora, cambios } from '../bitacora'

/**
 * Cadena de custodia de un equipo: cada entrega (o devolución) es su propia responsiva.
 * Los datos de compra del equipo (factura, costo, proveedor…) nunca cambian con ellas.
 * @typedef {'entrega' | 'devolucion'} ResponsivaTipo
 */

/**
 * @typedef {object} Responsiva
 * @property {string} id
 * @property {string} equipoId
 * @property {string} folio
 * @property {string} fecha - YYYY-MM-DD (hora local).
 * @property {ResponsivaTipo} tipo
 * @property {string} [responsable] - Colaborador que recibe (responsable real del equipo).
 * @property {string} [puesto]
 * @property {string} [ubicacionId]
 * @property {string} [entregadoPor] - Quien entrega (responsable anterior o Soporte).
 * @property {string} [autorizadoPor] - Gerente que firma/autoriza.
 * @property {EstadoEquipo} [estadoEquipo]
 * @property {string} [fotoUrl] - Foto del equipo al momento de la entrega.
 * @property {string} [documentoUrl] - Responsiva firmada (escaneo).
 * @property {string} [notas]
 * @property {number} createdAt
 */

/** @typedef {Omit<Responsiva, 'id' | 'folio' | 'createdAt' | 'fecha'> & { fecha?: string }} ResponsivaInput */

const KEY = 'dga_inv_responsivas'

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
    equipoId: r.equipo_id,
    folio: r.folio,
    fecha: String(r.fecha ?? '').slice(0, 10),
    tipo: r.tipo ?? 'entrega',
    responsable: r.responsable ?? undefined,
    puesto: r.puesto ?? undefined,
    ubicacionId: r.ubicacion_id ?? undefined,
    entregadoPor: r.entregado_por ?? undefined,
    autorizadoPor: r.autorizado_por ?? undefined,
    estadoEquipo: r.estado_equipo ?? undefined,
    fotoUrl: r.foto_url ?? undefined,
    documentoUrl: r.documento_url ?? undefined,
    notas: r.notas ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
  }
}

function toRow(r) {
  const row = {}
  if (r.equipoId !== undefined) row.equipo_id = r.equipoId
  if (r.folio !== undefined) row.folio = r.folio
  if (r.fecha !== undefined) row.fecha = r.fecha
  if (r.tipo !== undefined) row.tipo = r.tipo
  if (r.responsable !== undefined) row.responsable = r.responsable || null
  if (r.puesto !== undefined) row.puesto = r.puesto || null
  if (r.ubicacionId !== undefined) row.ubicacion_id = r.ubicacionId || null
  if (r.entregadoPor !== undefined) row.entregado_por = r.entregadoPor || null
  if (r.autorizadoPor !== undefined) row.autorizado_por = r.autorizadoPor || null
  if (r.estadoEquipo !== undefined) row.estado_equipo = r.estadoEquipo || null
  if (r.fotoUrl !== undefined) row.foto_url = r.fotoUrl || null
  if (r.documentoUrl !== undefined) row.documento_url = r.documentoUrl || null
  if (r.notas !== undefined) row.notas = r.notas || null
  return row
}

let cache = []
let ready = false

export async function loadResponsivasCache() {
  if (!isSupabaseConfigured || !supabase) {
    cache = readLocal()
    ready = true
    return
  }
  const { data } = await leerTodo('inv_responsivas', { orden: 'created_at', ascendente: false })
  cache = (data ?? []).map(fromRow)
  ready = true
}

export function isResponsivasCacheReady() {
  return ready
}

function ordenar(list) {
  // Más reciente primero; el desempate por createdAt mantiene el orden cuando hay varias el mismo día.
  return [...list].sort((a, b) => (a.fecha === b.fecha ? b.createdAt - a.createdAt : a.fecha < b.fecha ? 1 : -1))
}

/** Responsivas (más reciente primero), de un equipo o de todos. */
export function listResponsivas(equipoId) {
  track()
  return ordenar(equipoId ? cache.filter((r) => r.equipoId === equipoId) : cache)
}

/** Responsiva vigente: la última entrega, salvo que después se haya registrado una devolución. */
export function getResponsivaActual(equipoId) {
  const ultima = listResponsivas(equipoId)[0]
  return ultima && ultima.tipo === 'entrega' ? ultima : undefined
}

function siguienteFolio(fecha) {
  const year = fecha.slice(0, 4)
  const prefix = `RESP-${year}-`
  const max = cache.reduce((acc, r) => {
    if (!r.folio.startsWith(prefix)) return acc
    const n = Number(r.folio.slice(prefix.length))
    return Number.isFinite(n) && n > acc ? n : acc
  }, 0)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export async function registrarResponsiva(input) {
  const now = Date.now()
  const fecha = input.fecha || todayLocalDateString()
  const resp = {
    ...input,
    id: `${now}-${Math.round(Math.random() * 1e6)}-resp`,
    folio: siguienteFolio(fecha),
    fecha,
    createdAt: now,
  }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_responsivas').insert({ id: resp.id, ...toRow(resp) })
    if (error) throw error
  } else {
    writeLocal([...readLocal(), resp])
  }
  cache = [resp, ...cache]
  registrarBitacora({
    tabla: 'inv_responsivas',
    registroId: resp.id,
    accion: resp.tipo === 'devolucion' ? 'devolución' : 'responsiva',
    despues: resp,
    detalle: `${resp.folio}: ${resp.tipo === 'devolucion' ? 'devolución de' : 'entrega a'} ${resp.responsable || '—'}`,
  })
  return resp
}

/** Actualiza una responsiva (p. ej. adjuntar el documento firmado después de imprimirla). */
export async function actualizarResponsiva(id, patch) {
  const prev = cache.find((r) => r.id === id)
  if (!prev) throw new Error('Responsiva no encontrada')
  const next = { ...prev, ...patch }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_responsivas').update(toRow(patch)).eq('id', id)
    if (error) throw error
  } else {
    writeLocal(cache.map((r) => (r.id === id ? next : r)))
  }
  cache = cache.map((r) => (r.id === id ? next : r))
  const dif = cambios(prev, patch)
  registrarBitacora({ tabla: 'inv_responsivas', registroId: id, accion: 'cambio', antes: dif.antes, despues: dif.despues, detalle: `Responsiva ${prev.folio}` })
}
