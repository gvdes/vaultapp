import { track } from '../reactive'
import { supabase, isSupabaseConfigured } from '../supabase'
import { leerTodo } from '../supabaseTodo'
import { appUrl } from '../qr'
import { registrarBitacora } from '../bitacora'
import { getFamilia, listUbicaciones } from './comunes'
import { listEquipos } from './sistemas'
import { listMateriales } from './mantenimiento'

/**
 * Auditoría física (GV-INF-008): registro vs. equipo/material físico por sucursal.
 *
 * Flujo: `en_conteo` (el contador marca en sitio, por la liga pública o en la app) → `por_verificar` (el contador envió)
 * → `completada` (se muestra "Cerrada"; INMUTABLE: no se reabre, no se edita, no se borra). El verificador (Uriel, o el
 * Gerente de Mantenimiento en su dominio) puede devolver ítems sueltos con `pedirReconteo` (la auditoría regresa a
 * `en_conteo` y solo esos ítems quedan pendientes).
 *
 * Compatibilidad: el estado anterior `en_proceso` se trata como `en_conteo`. El valor final sigue siendo `'completada'`
 * (alertasControl cuenta auditorías en ese estado) y la semántica de los ítems (`encontrado`/`condicion`/
 * `cantidadContada`) no cambia, para que alertas e indicadores sigan funcionando.
 */

/** @typedef {'sistemas' | 'mantenimiento' | 'ambos'} AuditoriaTipo */
/**
 * `en_proceso` es el valor del modelo anterior; al leer se normaliza a `en_conteo`.
 * @typedef {'en_conteo' | 'por_verificar' | 'completada'} AuditoriaEstado
 */
/** @typedef {'interna' | 'auditor' | 'gerente_sucursal'} AuditoriaModalidad */

export const ESTADO_AUDITORIA_LABEL = {
  en_conteo: 'En conteo',
  por_verificar: 'Por verificar',
  completada: 'Cerrada',
}
export const ESTADO_AUDITORIA_TONE = {
  en_conteo: 'warning',
  por_verificar: 'info',
  completada: 'success',
}
export const MODALIDAD_LABEL = {
  interna: 'Interna (la corre el responsable)',
  auditor: 'Auditor asignado',
  gerente_sucursal: 'Gerente de la sucursal',
}
export const TIPO_AUDITORIA_LABEL = {
  sistemas: 'Sistemas',
  mantenimiento: 'Mantenimiento',
  ambos: 'Sistemas y Mantenimiento',
}

/** Cadencia de auditoría por sucursal (GV-INF-008: trimestral). */
export const FRECUENCIA_AUDITORIA_DIAS = 90
/** Meta de exactitud del inventario (%), GV-INF-008. */
export const META_EXACTITUD_AUDITORIA = 98

/**
 * @typedef {object} Auditoria
 * @property {string} id
 * @property {string} ubicacionId
 * @property {AuditoriaTipo} tipo
 * @property {number} fechaInicio
 * @property {number} [fechaCierre]
 * @property {string} [realizadaPor] - Quién abrió/creó la auditoría.
 * @property {AuditoriaEstado} estado
 * @property {string} [notas]
 * @property {number} createdAt
 * @property {AuditoriaModalidad} modalidad
 * @property {string} [auditorNombre]
 * @property {string} [auditorCorreo]
 * @property {string} [fechaProgramada] - Fecha programada (YYYY-MM-DD).
 * @property {string} [alcance] - Nota de alcance (qué se audita / consideraciones).
 * @property {boolean} [sorpresa] - Auditoría sorpresa (sin aviso previo a la sucursal).
 * @property {number} [fechaEnvio] - Cuándo el contador envió el conteo a verificación.
 * @property {string} [verificadaPor] - Quién verificó y cerró.
 * @property {string} [token] - Token de la liga pública de conteo.
 */

/** @typedef {'equipo' | 'material'} AuditoriaItemTipo */
/** @typedef {'bien' | 'danado' | 'perdido'} Condicion */

/**
 * @typedef {object} AuditoriaItem
 * @property {string} id
 * @property {string} auditoriaId
 * @property {AuditoriaItemTipo} tipo
 * @property {string} [equipoId]
 * @property {string} [materialId]
 * @property {boolean} [encontrado]
 * @property {Condicion} [condicion]
 * @property {number} [cantidadEsperada] - Solo materiales: existencia que el sistema esperaba encontrar al iniciar la auditoría.
 * @property {number} [cantidadContada] - Solo materiales: lo que realmente se contó en sitio.
 * @property {string} [notas]
 * @property {string} [verificadoPor] - Quién contó (nombre del auditor/usuario).
 * @property {number} [fechaVerificado]
 * @property {string} [fotoUrl] - Evidencia fotográfica (URL o imagen comprimida en data URL).
 * @property {boolean} [reconteo] - El verificador pidió contar este ítem de nuevo.
 * @property {string} [notaReconteo]
 * @property {string} [resolucion] - Cómo se resolvió la discrepancia (baja por pérdida, ajuste de existencia…), antes de cerrar.
 * @property {number} createdAt
 */

/**
 * @typedef {object} AuditoriaOpciones
 * @property {AuditoriaModalidad} [modalidad]
 * @property {string} [auditorNombre]
 * @property {string} [auditorCorreo]
 * @property {string} [fechaProgramada]
 * @property {string} [alcance]
 * @property {boolean} [sorpresa]
 */

const AUDITORIAS_KEY = 'dga_inv_auditorias'
const ITEMS_KEY = 'dga_inv_auditoria_items'
const DIA_MS = 86400000

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

/** Token aleatorio (192 bits) para la liga pública de conteo. */
export function generarToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function normEstado(e) {
  if (e === 'por_verificar' || e === 'completada') return e
  return 'en_conteo' // 'en_proceso' (modelo anterior) o cualquier otro
}

/** Normaliza una auditoría guardada con el modelo anterior (sin modalidad/token…). */
function normalizarAuditoria(a) {
  return { ...a, estado: normEstado(a.estado), modalidad: a.modalidad ?? 'interna' }
}

function auditoriaFromRow(r) {
  return {
    id: r.id,
    ubicacionId: r.ubicacion_id,
    tipo: r.tipo,
    fechaInicio: new Date(r.fecha_inicio).getTime(),
    fechaCierre: r.fecha_cierre ? new Date(r.fecha_cierre).getTime() : undefined,
    realizadaPor: r.realizada_por ?? undefined,
    estado: normEstado(r.estado),
    notas: r.notas ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
    modalidad: r.modalidad ?? 'interna',
    auditorNombre: r.auditor_nombre ?? undefined,
    auditorCorreo: r.auditor_correo ?? undefined,
    fechaProgramada: r.fecha_programada ? String(r.fecha_programada).slice(0, 10) : undefined,
    alcance: r.alcance ?? undefined,
    sorpresa: Boolean(r.sorpresa),
    fechaEnvio: r.fecha_envio ? new Date(r.fecha_envio).getTime() : undefined,
    verificadaPor: r.verificada_por ?? undefined,
    token: r.token ?? undefined,
  }
}

function itemFromRow(r) {
  return {
    id: r.id,
    auditoriaId: r.auditoria_id,
    tipo: r.tipo,
    equipoId: r.equipo_id ?? undefined,
    materialId: r.material_id ?? undefined,
    encontrado: r.encontrado ?? undefined,
    condicion: r.condicion ?? undefined,
    cantidadEsperada: r.cantidad_esperada != null ? Number(r.cantidad_esperada) : undefined,
    cantidadContada: r.cantidad_contada != null ? Number(r.cantidad_contada) : undefined,
    notas: r.notas ?? undefined,
    verificadoPor: r.verificado_por ?? undefined,
    fechaVerificado: r.fecha_verificado ? new Date(r.fecha_verificado).getTime() : undefined,
    fotoUrl: r.foto_url ?? undefined,
    reconteo: Boolean(r.reconteo),
    notaReconteo: r.nota_reconteo ?? undefined,
    resolucion: r.resolucion ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
  }
}

function itemToRow(p) {
  const r = {}
  if ('encontrado' in p) r.encontrado = p.encontrado ?? null
  if ('condicion' in p) r.condicion = p.condicion ?? null
  if ('cantidadContada' in p) r.cantidad_contada = p.cantidadContada ?? null
  if ('notas' in p) r.notas = p.notas ?? null
  if ('verificadoPor' in p) r.verificado_por = p.verificadoPor ?? null
  if ('fechaVerificado' in p) r.fecha_verificado = p.fechaVerificado ? new Date(p.fechaVerificado).toISOString() : null
  if ('fotoUrl' in p) r.foto_url = p.fotoUrl ?? null
  if ('reconteo' in p) r.reconteo = p.reconteo ?? false
  if ('notaReconteo' in p) r.nota_reconteo = p.notaReconteo ?? null
  if ('resolucion' in p) r.resolucion = p.resolucion ?? null
  return r
}

function auditoriaToRow(p) {
  const r = {}
  if ('estado' in p) r.estado = p.estado
  if ('fechaCierre' in p) r.fecha_cierre = p.fechaCierre ? new Date(p.fechaCierre).toISOString() : null
  if ('fechaEnvio' in p) r.fecha_envio = p.fechaEnvio ? new Date(p.fechaEnvio).toISOString() : null
  if ('notas' in p) r.notas = p.notas ?? null
  if ('verificadaPor' in p) r.verificada_por = p.verificadaPor ?? null
  return r
}

let auditoriasCache = []
let itemsCache = []
let ready = false

export async function loadAuditoriasCache() {
  if (!isSupabaseConfigured || !supabase) {
    let cambio = false
    auditoriasCache = readLocal(AUDITORIAS_KEY).map((a) => {
      const n = normalizarAuditoria(a)
      // Auditorías guardadas con el modelo anterior: se les asigna token para poder compartirlas por liga.
      if (!n.token && n.estado !== 'completada') {
        n.token = generarToken()
        cambio = true
      }
      if (n.estado !== a.estado || n.modalidad !== a.modalidad) cambio = true
      return n
    })
    itemsCache = readLocal(ITEMS_KEY)
    if (cambio) {
      try {
        writeLocal(AUDITORIAS_KEY, auditoriasCache)
      } catch {
        /* almacenamiento lleno: la normalización se repetirá en la próxima carga */
      }
    }
    ready = true
    return
  }
  const [audRes, itemsRes] = await Promise.all([
    leerTodo('inv_auditorias', { orden: 'fecha_inicio', ascendente: false }),
    leerTodo('inv_auditoria_items'),
  ])
  auditoriasCache = (audRes.data ?? []).map(auditoriaFromRow)
  itemsCache = (itemsRes.data ?? []).map(itemFromRow)
  ready = true
}

export function isAuditoriasCacheReady() {
  return ready
}

export function listAuditorias() {
  track()
  return [...auditoriasCache].sort((a, b) => b.fechaInicio - a.fechaInicio)
}

export function getAuditoria(id) {
  track()
  return auditoriasCache.find((a) => a.id === id)
}

/** Busca por token de la liga pública (solo caché local; con Supabase el acceso anónimo va por RPC). */
export function getAuditoriaPorToken(token) {
  track()
  if (!token) return undefined
  return auditoriasCache.find((a) => a.token === token)
}

export function listItems(auditoriaId) {
  track()
  return itemsCache.filter((i) => i.auditoriaId === auditoriaId)
}

/** Liga pública (sin login) para que el contador cuente en sitio. */
export function auditoriaLink(a) {
  return appUrl(`/auditar/${a.token ?? ''}`)
}

// ---- Escritura -------------------------------------------------------------------------------------------------------

function exigir(a, estados, mensaje) {
  if (!a) throw new Error('Auditoría no encontrada')
  if (a.estado === 'completada') throw new Error('La auditoría está cerrada: es inmutable y no puede modificarse.')
  if (!estados.includes(a.estado)) throw new Error(mensaje)
  return a
}

async function patchAuditoria(auditoriaId, patch) {
  const prev = auditoriasCache.find((a) => a.id === auditoriaId)
  if (!prev) throw new Error('Auditoría no encontrada')
  const next = { ...prev, ...patch }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_auditorias').update(auditoriaToRow(patch)).eq('id', auditoriaId)
    if (error) throw error
  } else {
    writeLocal(
      AUDITORIAS_KEY,
      auditoriasCache.map((a) => (a.id === auditoriaId ? next : a)),
    )
  }
  auditoriasCache = auditoriasCache.map((a) => (a.id === auditoriaId ? next : a))
  return next
}

async function patchItem(itemId, patch) {
  const prev = itemsCache.find((i) => i.id === itemId)
  if (!prev) throw new Error('Ítem de auditoría no encontrado')
  const next = { ...prev, ...patch }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_auditoria_items').update(itemToRow(patch)).eq('id', itemId)
    if (error) throw error
    itemsCache = itemsCache.map((i) => (i.id === itemId ? next : i))
  } else {
    const nuevos = itemsCache.map((i) => (i.id === itemId ? next : i))
    writeLocal(ITEMS_KEY, nuevos)
    itemsCache = nuevos
  }
  return next
}

/**
 * Toma una "foto" de lo que el sistema dice que debería estar en la ubicación (equipos activos + materiales con
 * existencia, filtrados por tipo) y crea un ítem de checklist por cada uno. La auditoría nace `en_conteo` con su token.
 */
export async function iniciarAuditoria(
  ubicacionId,
  tipo,
  realizadaPor,
  opciones = {},
) {
  const now = Date.now()
  const auditoria = {
    id: `${now}-${Math.round(Math.random() * 1e6)}`,
    ubicacionId,
    tipo,
    fechaInicio: now,
    estado: 'en_conteo',
    realizadaPor,
    createdAt: now,
    modalidad: opciones.modalidad ?? 'interna',
    auditorNombre: opciones.auditorNombre?.trim() || undefined,
    auditorCorreo: opciones.auditorCorreo?.trim() || undefined,
    fechaProgramada: opciones.fechaProgramada || undefined,
    alcance: opciones.alcance?.trim() || undefined,
    sorpresa: opciones.sorpresa ?? false,
    token: generarToken(),
  }

  let seq = 0
  const nextId = () => `${now}-${seq++}-${Math.round(Math.random() * 1e6)}`
  const items = []

  if (tipo === 'sistemas' || tipo === 'ambos') {
    listEquipos()
      .filter((e) => e.ubicacionId === ubicacionId && e.estado !== 'baja' && getFamilia(e.familiaId)?.tipo === 'sistemas')
      .forEach((e) => items.push({ id: nextId(), auditoriaId: auditoria.id, tipo: 'equipo', equipoId: e.id, createdAt: now }))
  }
  if (tipo === 'mantenimiento' || tipo === 'ambos') {
    listEquipos()
      .filter((e) => e.ubicacionId === ubicacionId && e.estado !== 'baja' && getFamilia(e.familiaId)?.tipo === 'mantenimiento')
      .forEach((e) => items.push({ id: nextId(), auditoriaId: auditoria.id, tipo: 'equipo', equipoId: e.id, createdAt: now }))
    listMateriales()
      .filter((m) => m.ubicacionId === ubicacionId && m.cantidadActual > 0)
      .forEach((m) =>
        items.push({ id: nextId(), auditoriaId: auditoria.id, tipo: 'material', materialId: m.id, cantidadEsperada: m.cantidadActual, createdAt: now }),
      )
  }

  if (isSupabaseConfigured && supabase) {
    const { error: errAud } = await supabase.from('inv_auditorias').insert({
      id: auditoria.id,
      ubicacion_id: auditoria.ubicacionId,
      tipo: auditoria.tipo,
      fecha_inicio: new Date(auditoria.fechaInicio).toISOString(),
      realizada_por: auditoria.realizadaPor ?? null,
      estado: auditoria.estado,
      modalidad: auditoria.modalidad,
      auditor_nombre: auditoria.auditorNombre ?? null,
      auditor_correo: auditoria.auditorCorreo ?? null,
      fecha_programada: auditoria.fechaProgramada ?? null,
      alcance: auditoria.alcance ?? null,
      sorpresa: auditoria.sorpresa ?? false,
      token: auditoria.token,
    })
    if (errAud) throw errAud
    if (items.length > 0) {
      const { error: errItems } = await supabase.from('inv_auditoria_items').insert(
        items.map((it) => ({
          id: it.id,
          auditoria_id: it.auditoriaId,
          tipo: it.tipo,
          equipo_id: it.equipoId ?? null,
          material_id: it.materialId ?? null,
          cantidad_esperada: it.cantidadEsperada ?? null,
        })),
      )
      if (errItems) throw errItems
    }
  } else {
    writeLocal(AUDITORIAS_KEY, [...readLocal(AUDITORIAS_KEY), auditoria])
    writeLocal(ITEMS_KEY, [...readLocal(ITEMS_KEY), ...items])
  }

  auditoriasCache = [auditoria, ...auditoriasCache]
  itemsCache = [...itemsCache, ...items]
  registrarBitacora({
    tabla: 'inv_auditorias',
    registroId: auditoria.id,
    accion: 'alta',
    despues: { ubicacionId, tipo, realizadaPor, modalidad: auditoria.modalidad, auditor: auditoria.auditorNombre, partidas: items.length },
    detalle: `Auditoría ${tipo} iniciada (${items.length} partidas, modalidad ${auditoria.modalidad})`,
  })
  return auditoria
}

/** Marca un equipo (solo mientras la auditoría está en conteo). Limpia la bandera de reconteo. */
export async function marcarEquipoItem(
  itemId,
  patch,
) {
  const prev = itemsCache.find((i) => i.id === itemId)
  if (!prev) throw new Error('Ítem de auditoría no encontrado')
  exigir(auditoriasCache.find((a) => a.id === prev.auditoriaId), ['en_conteo'], 'La auditoría ya no está en conteo.')
  const cambios = {
    ...patch,
    condicion: patch.condicion ?? (patch.encontrado ? 'bien' : 'perdido'),
    reconteo: false,
    fechaVerificado: Date.now(),
  }
  // fotoUrl: undefined = sin cambio, '' = quitar, otro valor = reemplazar.
  if (patch.fotoUrl === undefined) delete cambios.fotoUrl
  else cambios.fotoUrl = patch.fotoUrl || undefined
  const next = await patchItem(itemId, cambios)
  registrarBitacora({
    tabla: 'inv_auditoria_items',
    registroId: itemId,
    accion: 'cambio',
    antes: { encontrado: prev.encontrado ?? null, condicion: prev.condicion ?? null },
    despues: { encontrado: next.encontrado, condicion: next.condicion ?? null, notas: next.notas ?? null },
    detalle: 'Verificación de equipo en auditoría',
  })
}

export async function marcarMaterialItem(
  itemId,
  cantidadContada,
  notas,
  verificadoPor,
  fotoUrl,
) {
  const prev = itemsCache.find((i) => i.id === itemId)
  if (!prev) throw new Error('Ítem de auditoría no encontrado')
  exigir(auditoriasCache.find((a) => a.id === prev.auditoriaId), ['en_conteo'], 'La auditoría ya no está en conteo.')
  const cambios = { cantidadContada, notas, verificadoPor, reconteo: false, fechaVerificado: Date.now() }
  if (fotoUrl !== undefined) cambios.fotoUrl = fotoUrl || undefined
  await patchItem(itemId, cambios)
  registrarBitacora({
    tabla: 'inv_auditoria_items',
    registroId: itemId,
    accion: 'cambio',
    antes: { cantidadContada: prev.cantidadContada ?? null },
    despues: { cantidadContada, cantidadEsperada: prev.cantidadEsperada ?? null, notas: notas ?? null },
    detalle: 'Conteo de material en auditoría',
  })
}

/** El contador envía su conteo a verificación (todo contado y sin reconteos pendientes). */
export async function enviarAVerificacion(auditoriaId) {
  const a = exigir(
    auditoriasCache.find((x) => x.id === auditoriaId),
    ['en_conteo'],
    'La auditoría ya no está en conteo.',
  )
  const faltan = pendientesAuditoria(auditoriaId)
  if (faltan > 0) throw new Error(`Aún faltan ${faltan} artículo(s) por contar.`)
  await patchAuditoria(a.id, { estado: 'por_verificar', fechaEnvio: Date.now() })
  registrarBitacora({
    tabla: 'inv_auditorias',
    registroId: a.id,
    accion: 'cambio',
    antes: { estado: a.estado },
    despues: { estado: 'por_verificar' },
    detalle: 'Conteo enviado a verificación',
  })
}

/**
 * El verificador devuelve un ítem al contador: queda pendiente (reconteo) y la auditoría regresa a `en_conteo`.
 * El valor anterior se conserva hasta que se vuelva a contar.
 */
export async function pedirReconteo(itemId, nota) {
  const prev = itemsCache.find((i) => i.id === itemId)
  if (!prev) throw new Error('Ítem de auditoría no encontrado')
  const a = exigir(
    auditoriasCache.find((x) => x.id === prev.auditoriaId),
    ['en_conteo', 'por_verificar'],
    'La auditoría no admite reconteos.',
  )
  await patchItem(itemId, { reconteo: true, notaReconteo: nota?.trim() || undefined })
  if (a.estado !== 'en_conteo') await patchAuditoria(a.id, { estado: 'en_conteo' })
  registrarBitacora({
    tabla: 'inv_auditoria_items',
    registroId: itemId,
    accion: 'cambio',
    despues: { reconteo: true, nota: nota?.trim() || null },
    detalle: 'Reconteo solicitado por el verificador',
  })
}

/** Deja asentado cómo se resolvió una discrepancia (aparece en el acta). Solo antes de cerrar. */
export async function registrarResolucion(itemId, resolucion) {
  const prev = itemsCache.find((i) => i.id === itemId)
  if (!prev) throw new Error('Ítem de auditoría no encontrado')
  exigir(
    auditoriasCache.find((a) => a.id === prev.auditoriaId),
    ['en_conteo', 'por_verificar'],
    'La auditoría no admite cambios.',
  )
  await patchItem(itemId, { resolucion })
  registrarBitacora({
    tabla: 'inv_auditoria_items',
    registroId: itemId,
    accion: 'cambio',
    despues: { resolucion },
    detalle: 'Resolución de discrepancia de auditoría',
  })
}

/** Cierra la auditoría (estado final 'completada', mostrado como "Cerrada"). Irreversible. */
export async function cerrarAuditoria(auditoriaId, notas, verificadaPor) {
  const prev = exigir(
    auditoriasCache.find((a) => a.id === auditoriaId),
    ['en_conteo', 'por_verificar'],
    'La auditoría no se puede cerrar en este estado.',
  )
  const next = await patchAuditoria(prev.id, {
    estado: 'completada',
    fechaCierre: Date.now(),
    notas: notas ?? prev.notas,
    verificadaPor: verificadaPor ?? prev.verificadaPor,
  })
  registrarBitacora({
    tabla: 'inv_auditorias',
    registroId: auditoriaId,
    accion: 'cierre',
    antes: { estado: prev.estado },
    despues: { estado: 'completada', notas: next.notas ?? null, verificadaPor: next.verificadaPor ?? null },
    detalle: 'Auditoría cerrada (inmutable)',
  })
}

// ---- Consulta / indicadores ------------------------------------------------------------------------------------------

/** ¿El ítem coincide con el registro? `null` = todavía sin contar. Misma regla que el indicador de exactitud. */
export function itemCoincide(i) {
  if (i.tipo === 'equipo') {
    if (i.encontrado === undefined) return null
    return i.encontrado && (i.condicion === undefined || i.condicion === 'bien')
  }
  if (i.cantidadContada == null) return null
  return i.cantidadEsperada != null && i.cantidadContada === i.cantidadEsperada
}

/** Ítems con discrepancia: equipo no encontrado o en mala condición, material con conteo distinto al esperado. */
export function discrepanciasAuditoria(auditoriaId) {
  track()
  return listItems(auditoriaId).filter((i) => {
    if (i.tipo === 'equipo') return i.encontrado === false || i.condicion === 'danado' || i.condicion === 'perdido'
    return i.cantidadContada != null && i.cantidadEsperada != null && i.cantidadContada !== i.cantidadEsperada
  })
}

/** Cuántos ítems siguen pendientes de contar (sin marcar, o devueltos a reconteo). */
export function pendientesAuditoria(auditoriaId) {
  track()
  return listItems(auditoriaId).filter((i) => i.reconteo || (i.tipo === 'equipo' ? i.encontrado === undefined : i.cantidadContada == null)).length
}

/**
 * @typedef {object} ExactitudAuditoria
 * @property {number} total
 * @property {number} coinciden
 * @property {number} discrepancias
 * @property {number | null} pct - null = sin partidas contadas.
 */

export function exactitudAuditoria(auditoriaId) {
  track()
  let total = 0
  let coinciden = 0
  listItems(auditoriaId).forEach((i) => {
    const c = itemCoincide(i)
    if (c === null) return
    total += 1
    if (c) coinciden += 1
  })
  return { total, coinciden, discrepancias: total - coinciden, pct: total > 0 ? Math.round((coinciden / total) * 1000) / 10 : null }
}

/**
 * @typedef {object} PuntoExactitud
 * @property {string} auditoriaId
 * @property {string} ubicacionId
 * @property {number} fecha
 * @property {number | null} pct
 * @property {number} total
 * @property {number} coinciden
 */

/** Exactitud (%) de cada auditoría CERRADA, de la más antigua a la más reciente (opcionalmente de una sucursal). */
export function historialExactitud(ubicacionId, tipos) {
  track()
  return auditoriasCache
    .filter((a) => a.estado === 'completada' && (!ubicacionId || a.ubicacionId === ubicacionId) && (!tipos || tipos.includes(a.tipo)))
    .map((a) => {
      const e = exactitudAuditoria(a.id)
      return { auditoriaId: a.id, ubicacionId: a.ubicacionId, fecha: a.fechaCierre ?? a.fechaInicio, pct: e.pct, total: e.total, coinciden: e.coinciden }
    })
    .sort((a, b) => a.fecha - b.fecha)
}

/**
 * @typedef {object} TendenciaExactitud
 * @property {number | null} ultima
 * @property {number | null} anterior
 * @property {number | null} delta
 * @property {'sube' | 'baja' | 'igual' | null} direccion
 */

export function tendenciaExactitud(ubicacionId, tipos) {
  const puntos = historialExactitud(ubicacionId, tipos).filter((p) => p.pct !== null)
  const ultima = puntos.length > 0 ? puntos[puntos.length - 1].pct : null
  const anterior = puntos.length > 1 ? puntos[puntos.length - 2].pct : null
  if (ultima === null || anterior === null) return { ultima, anterior, delta: null, direccion: null }
  const delta = Math.round((ultima - anterior) * 10) / 10
  return { ultima, anterior, delta, direccion: delta > 0 ? 'sube' : delta < 0 ? 'baja' : 'igual' }
}

/** Exactitud agregada de las auditorías cerradas en los últimos `dias` días (GV-INF-008, meta ≥ 98% trimestral). */
export function exactitudPeriodo(dias = FRECUENCIA_AUDITORIA_DIAS, tipos) {
  track()
  const desde = Date.now() - dias * DIA_MS
  let total = 0
  let coinciden = 0
  let auditorias = 0
  auditoriasCache.forEach((a) => {
    if (a.estado !== 'completada' || (a.fechaCierre ?? a.fechaInicio) < desde || (tipos && !tipos.includes(a.tipo))) return
    const e = exactitudAuditoria(a.id)
    total += e.total
    coinciden += e.coinciden
    auditorias += 1
  })
  return { total, coinciden, auditorias, pct: total > 0 ? Math.round((coinciden / total) * 1000) / 10 : null }
}

/**
 * @typedef {object} ProgramacionSucursal
 * @property {string} ubicacionId
 * @property {number | null} ultimoCierre - Fecha del último cierre (null = nunca auditada).
 * @property {number} proxima - Próxima auditoría según la frecuencia (último cierre + 90 días; hoy si nunca se auditó).
 * @property {number} dias - Días hasta la próxima (negativo = vencida).
 * @property {boolean} vencida
 * @property {boolean} nunca
 * @property {string | null} abiertaId - Auditoría abierta (en conteo o por verificar) de la sucursal, si hay.
 * @property {AuditoriaEstado | null} abiertaEstado
 * @property {string | null} fechaProgramada - Fecha programada de la auditoría abierta (YYYY-MM-DD).
 * @property {boolean} programadaVencida - La auditoría abierta sigue en conteo y su fecha programada ya pasó.
 * @property {boolean} sorpresa
 * @property {number | null} exactitudUltima
 */

function inicioDeHoy(ts) {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Ubicaciones que tienen inventario: equipos activos o materiales con existencia (mismo criterio que alertasControl). */
function ubicacionesConInventario(dominio) {
  const set = new Set()
  const enDom = (familiaId) => !dominio || dominio === 'ambos' || getFamilia(familiaId)?.tipo === dominio
  listEquipos().forEach((e) => {
    if (e.estado !== 'baja' && e.ubicacionId && enDom(e.familiaId)) set.add(e.ubicacionId)
  })
  listMateriales().forEach((m) => {
    if (m.cantidadActual > 0 && m.ubicacionId && enDom(m.familiaId)) set.add(m.ubicacionId)
  })
  return [...set]
}

/** Programación trimestral: próxima auditoría por sucursal (vencidas primero). */
export function programacionAuditorias(tipos) {
  track()
  const now = Date.now()
  const hoy0 = inicioDeHoy(now)
  const activas = new Set(listUbicaciones().map((u) => u.id))
  const auditoriasDe = tipos ? auditoriasCache.filter((a) => tipos.includes(a.tipo)) : auditoriasCache
  const dominio = tipos && tipos.length === 1 && tipos[0] !== 'ambos' ? tipos[0] : undefined
  const ubicaciones = new Set([...ubicacionesConInventario(dominio), ...auditoriasDe.map((a) => a.ubicacionId)])

  const res = []
  ubicaciones.forEach((ubicacionId) => {
    if (!activas.has(ubicacionId)) return
    const propias = auditoriasDe.filter((a) => a.ubicacionId === ubicacionId)
    const cerradas = propias
      .filter((a) => a.estado === 'completada')
      .sort((a, b) => (b.fechaCierre ?? b.fechaInicio) - (a.fechaCierre ?? a.fechaInicio))
    const ultima = cerradas[0]
    const ultimoCierre = ultima ? (ultima.fechaCierre ?? ultima.fechaInicio) : null
    const proxima = ultimoCierre === null ? hoy0 : ultimoCierre + FRECUENCIA_AUDITORIA_DIAS * DIA_MS
    const dias = Math.ceil((proxima - now) / DIA_MS)
    const abierta = propias.filter((a) => a.estado !== 'completada').sort((a, b) => b.fechaInicio - a.fechaInicio)[0]
    const progTs = abierta?.fechaProgramada ? new Date(`${abierta.fechaProgramada}T00:00:00`).getTime() : NaN
    res.push({
      ubicacionId,
      ultimoCierre,
      proxima,
      dias,
      vencida: ultimoCierre === null || proxima < now,
      nunca: ultimoCierre === null,
      abiertaId: abierta?.id ?? null,
      abiertaEstado: abierta?.estado ?? null,
      fechaProgramada: abierta?.fechaProgramada ?? null,
      programadaVencida: abierta?.estado === 'en_conteo' && Number.isFinite(progTs) && progTs < hoy0,
      sorpresa: Boolean(abierta?.sorpresa),
      exactitudUltima: ultima ? exactitudAuditoria(ultima.id).pct : null,
    })
  })
  return res.sort((a, b) => a.proxima - b.proxima)
}
