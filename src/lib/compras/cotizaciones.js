import { registrarBitacora, cambios } from '../bitacora'
import { errorExcepcion, formatoMoneda, textoFaltanCotizaciones, textoLeyendaCompraMenor, textoRegistroExcedido } from './tipos'
import { crearTabla, nuevoId, ahora, normalizar, usuarioActual } from './store'
import { getConfig } from './config'
import {
  actualizarRequisicion,
  cambiarEstado,
  getRequisicion,
  listPartidas,
  registrarValidadorTransicion,
} from './requisiciones'
import { analizarCotizaciones, evaluarEleccion, totalComparableDe } from './analisisCotizaciones'

// La lógica pura (total comparable, puntaje, recomendación, alertas) vive en analisisCotizaciones.js y se re-exporta aquí.
export * from './analisisCotizaciones'

/**
 * Cotizaciones por partida, comparativo con criterios y elección de proveedor.
 *
 * Reglas (umbrales configurables en cmp_config):
 *  - Menor a `umbralCotizacionSimple` (1,000) basta 1 cotización completa. A partir de él (>=, estricto: 1,000.00 ya exige) se exigen
 *    `cotizacionesMinimas` (3) cotizaciones completas de proveedores DISTINTOS (sin distinguir mayúsculas, acentos ni espacios), salvo EXCEPCIÓN
 *    documentada: producto o servicio especializado, adjudicación directa instruida por CEO/DGA o urgencia (justificación >= 15 caracteres). Con excepción basta 1.
 *    Al enviar a autorización con excepción, Dirección recibe un aviso informativo (aviso_excepcion_cotizaciones). La excepción (excepcionTipo / excepcionInstruidaPor / excepcionCotizaciones) se congela desde «en autorización».
 *  - COMPRA MENOR: una compra con monto ESTRICTAMENTE menor a `umbralSinCotizacion` (100) no requiere cotización, solo el REGISTRO
 *    (cotización `esRegistro` de una sola línea: proveedor y precio por partida, sin criterios, comparativo ni justificación; se elige sola).
 *    Sigue requiriendo autorización de Finanzas. El registro es EXCLUYENTE: no se mezcla con cotizaciones normales activas y solo
 *    puede haber uno activo por requisición. Si el monto llega a >= umbral no puede pasar a autorización como registro.
 *  - El monto de una cotización es su COSTO TOTAL COMPARABLE: (Σ precio×cantidad − descuento + flete) × (1 + IVA si no está incluido).
 *    Ese monto es el que se compara, el que se autoriza y contra el que se miden los umbrales (espejo de `cmp_monto_cotizacion`, migración 020).
 *  - Si el proveedor elegido NO es el más barato o NO es el recomendado por el comparativo, la justificación es obligatoria (un solo aviso).
 *  - Las cotizaciones se descartan (activo = false), nunca se borran.
 */
const tCot = crearTabla({
  key: 'dga_cmp_cotizaciones',
  tabla: 'cmp_cotizaciones',
  pk: 'id',
  ts: ['createdAt'],
  num: ['tiempoEntregaDias', 'descuentoMonto', 'flete', 'garantiaMeses', 'diasCredito', 'anticipoPct', 'calificacionProveedor'],
  orderBy: 'created_at',
  // La API puede devolver es_registro (TINYINT) como 0/1 o '0'/'1': en la app es siempre boolean.
  alCargar: (c) => ({ ...c, esRegistro: c.esRegistro === true || c.esRegistro === 1 || c.esRegistro === '1' }),
})
const tItems = crearTabla({
  key: 'dga_cmp_cotizacion_items',
  tabla: 'cmp_cotizacion_items',
  pk: 'id',
  num: ['precioUnitario'],
  conflict: 'cotizacion_id,partida_id',
  soloLectura: ['id'],
  alCargar: (i) => ({ ...i, id: `${i.cotizacionId}:${i.partidaId}` }),
})

export const loadCotizacionesCache = async () => {
  await Promise.all([tCot.load(), tItems.load()])
}
export const isCotizacionesCacheReady = () => tCot.isReady() && tItems.isReady()
export function reiniciarCotizacionesLocal() {
  tCot.reiniciarLocal()
  tItems.reiniciarLocal()
}

// ---- Lectura -----------------------------------------------------------------------------------------------------------
export function listCotizaciones(folio, opts) {
  let list = tCot.list()
  if (folio) list = list.filter((c) => c.folio === folio)
  if (!opts?.incluirDescartadas) list = list.filter((c) => c.activo)
  return [...list].sort((a, b) => a.createdAt - b.createdAt)
}

export function getCotizacion(id) {
  return id ? tCot.get(id) : undefined
}

export function listItemsCotizacion(cotizacionId) {
  const list = tItems.list()
  return cotizacionId ? list.filter((i) => i.cotizacionId === cotizacionId) : [...list]
}

/** { partidaId: precio unitario } de una cotización. */
export function preciosDe(cotizacionId) {
  const out = {}
  for (const i of listItemsCotizacion(cotizacionId)) out[i.partidaId] = i.precioUnitario
  return out
}

/** Σ precio × cantidad de las partidas con precio y si la cotización trae precio en TODAS las partidas. */
function subtotalDe(cotizacionId, partidas) {
  const precios = preciosDe(cotizacionId)
  let subtotal = 0
  let completa = partidas.length > 0
  for (const p of partidas) {
    const pr = precios[p.id]
    if (pr === undefined) completa = false
    else subtotal += pr * p.cantidad
  }
  return { subtotal, completa }
}

const LLAVES_CRITERIOS = [
  'descuentoMonto', 'flete', 'ivaIncluido', 'tiempoEntregaDias', 'garantiaMeses', 'garantiaResponsable', 'diasCredito', 'anticipoPct',
  'distribuidorAutorizado', 'soporteTecnico', 'vigenciaHasta', 'aceptaDevoluciones', 'calificacionProveedor',
]

/** Criterios de una cotización con `null` (base de datos) convertido a `undefined`. */
export function criteriosDe(c) {
  const out = {}
  for (const k of LLAVES_CRITERIOS) {
    const v = c[k]
    if (v !== undefined && v !== null) out[k] = v
  }
  return out
}

function entradaDe(c, partidas) {
  const { subtotal, completa } = subtotalDe(c.id, partidas)
  return { id: c.id, proveedor: c.proveedor, subtotal, completa, sinPrecios: listItemsCotizacion(c.id).length === 0, ...criteriosDe(c) }
}

/** Desglose del costo total comparable de una cotización (subtotal, descuento, flete, IVA y total). */
export function desgloseCotizacion(cotizacionId) {
  const c = getCotizacion(cotizacionId)
  if (!c) return undefined
  const { subtotal, completa } = subtotalDe(cotizacionId, listPartidas(c.folio))
  return { ...totalComparableDe(subtotal, criteriosDe(c), getConfig().ivaPct, listItemsCotizacion(cotizacionId).length === 0), completa }
}

/** Costo total comparable de la cotización (es el monto que se compara y se autoriza). */
export function totalCotizacion(cotizacionId) {
  return desgloseCotizacion(cotizacionId)?.total ?? 0
}

/** Total de la cotización elegida de la requisición (0 si aún no hay). */
export function montoElegido(folio) {
  const c = listCotizaciones(folio).find((x) => x.elegida)
  return c ? totalCotizacion(c.id) : 0
}

export function cotizacionElegida(folio) {
  return listCotizaciones(folio).find((c) => c.elegida)
}

// ---- Alta / edición ----------------------------------------------------------------------------------------------------
/**
 * Campos editables de una cotización (datos del proveedor, notas y criterios).
 * @typedef {Partial<Omit<Cotizacion, 'id' | 'folio' | 'elegida' | 'justificacion' | 'registradoPor' | 'activo' |
 *   'createdAt'>>} CamposCotizacion
 */

/**
 * Extiende CriteriosCotizacion.
 * @typedef {object} CotizacionInput
 * @property {string} folio
 * @property {string} proveedor
 * @property {string} [contacto]
 * @property {string} [telefono]
 * @property {string} [direccion]
 * @property {string} [calidad]
 * @property {string} [condiciones]
 * @property {string} [archivoUrl]
 * @property {boolean} [esRegistro] - true = registro de compra menor (solo proveedor y precios).
 * @property {Record<string, number>} precios - { partidaId: precio unitario } (al menos un precio).
 * @property {string} [registradoPor]
 */

function exigirCotizando(folio) {
  const req = getRequisicion(folio)
  if (!req) throw new Error('Requisición no encontrada.')
  if (!(req.estado === 'recibida' || req.estado === 'en_cotizacion')) {
    throw new Error('Solo se pueden registrar o cambiar cotizaciones mientras la requisición está recibida o en cotización.')
  }
  return req
}

function validarPrecios(folio, precios) {
  const ids = new Set(listPartidas(folio).map((p) => p.id))
  const entradas = Object.entries(precios).filter(([, v]) => v !== undefined && v !== null && !Number.isNaN(v))
  if (entradas.length === 0) throw new Error('Captura al menos un precio unitario.')
  for (const [pid, v] of entradas) {
    if (!ids.has(pid)) throw new Error('Un precio no corresponde a una partida de esta requisición.')
    if (!(v >= 0)) throw new Error('Los precios no pueden ser negativos.')
  }
  return entradas
}

const vacio = (v) => v === undefined || v === null || v === ''
function entero(nombre, v, min, max) {
  if (vacio(v)) return undefined
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${nombre}: escribe un número entero entre ${min} y ${max}.`)
  return n
}
function decimal(nombre, v, min, max = Number.POSITIVE_INFINITY) {
  if (vacio(v)) return undefined
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${nombre}: escribe un número ${max === Number.POSITIVE_INFINITY ? `de ${min} o más` : `entre ${min} y ${max}`}.`)
  return n
}

/**
 * Valida y limpia los campos de una cotización. Solo toca las llaves presentes en `campos` (una llave con `undefined` o '' la VACÍA).
 * Descuento, flete e IVA incluido nunca quedan vacíos (0, 0 y true).
 */
function limpiarCampos(campos) {
  const out = {}
  const tiene = (k) => Object.prototype.hasOwnProperty.call(campos, k)
  const c = campos
  for (const k of ['proveedor', 'contacto', 'telefono', 'direccion', 'calidad', 'condiciones']) {
    if (tiene(k)) out[k] = typeof c[k] === 'string' ? c[k].trim() || undefined : undefined
  }
  if (tiene('archivoUrl')) out.archivoUrl = c.archivoUrl || undefined
  if (tiene('tiempoEntregaDias')) out.tiempoEntregaDias = decimal('Tiempo de entrega', c.tiempoEntregaDias, 0, 3650)
  if (tiene('descuentoMonto')) out.descuentoMonto = decimal('Descuento', c.descuentoMonto, 0) ?? 0
  if (tiene('flete')) out.flete = decimal('Flete', c.flete, 0) ?? 0
  if (tiene('ivaIncluido')) out.ivaIncluido = c.ivaIncluido === false ? false : true
  if (tiene('garantiaMeses')) out.garantiaMeses = entero('Garantía (meses)', c.garantiaMeses, 0, 240)
  if (tiene('garantiaResponsable')) {
    const r = c.garantiaResponsable
    if (!vacio(r) && r !== 'proveedor' && r !== 'fabricante' && r !== 'ninguna') throw new Error('Garantía: el responsable debe ser proveedor, fabricante o ninguna.')
    out.garantiaResponsable = vacio(r) ? undefined : r
    if (r === 'ninguna') out.garantiaMeses = 0
  }
  if (tiene('diasCredito')) out.diasCredito = entero('Días de crédito', c.diasCredito, 0, 365)
  if (tiene('anticipoPct')) out.anticipoPct = decimal('Anticipo (%)', c.anticipoPct, 0, 100)
  for (const k of ['distribuidorAutorizado', 'soporteTecnico', 'aceptaDevoluciones']) {
    if (tiene(k)) out[k] = c[k] === true || c[k] === false ? c[k] : undefined
  }
  if (tiene('vigenciaHasta')) {
    const v = c.vigenciaHasta
    if (!vacio(v) && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error('Vigencia: escribe la fecha como AAAA-MM-DD.')
    out.vigenciaHasta = vacio(v) ? undefined : String(v)
  }
  if (tiene('calificacionProveedor')) out.calificacionProveedor = entero('Calificación del proveedor', c.calificacionProveedor, 1, 5)
  return out
}

const CAMPOS_TEXTO = ['proveedor', 'contacto', 'telefono', 'direccion', 'calidad', 'condiciones', 'archivoUrl']

/** Solo los campos editables de una cotización (descarta folio, precios, etc.). */
function camposDe(origen) {
  const out = {}
  for (const k of [...CAMPOS_TEXTO, ...LLAVES_CRITERIOS]) {
    const v = origen[k]
    if (v !== undefined) out[k] = v
  }
  return out
}

// ---- Compra menor (registro) -----------------------------------------------------------------------------------------------
/** Leyenda que ve Finanzas cuando la cotización elegida es un registro de compra menor (con el umbral real de la configuración). */
export function leyendaCompraMenor(umbral = getConfig().umbralSinCotizacion) {
  return textoLeyendaCompraMenor(umbral)
}

/** Mensaje cuando un registro de compra menor llega al umbral o lo rebasa (espejo del mensaje del servidor). */
export function mensajeRegistroExcedido(umbral = getConfig().umbralSinCotizacion) {
  return textoRegistroExcedido(umbral)
}

/** ¿El monto califica como compra menor? (estrictamente menor al umbral, comparado a centavos). */
export function esCompraMenor(monto, umbral = getConfig().umbralSinCotizacion) {
  return Math.round(monto * 100) < Math.round(umbral * 100)
}

/** Registro de compra menor ACTIVO de la requisición (undefined si no hay). */
export function registroActivo(folio) {
  return listCotizaciones(folio).find((c) => c.esRegistro)
}

/** Cotizaciones NORMALES activas (no registro) de la requisición. */
export function cotizacionesNormales(folio) {
  return listCotizaciones(folio).filter((c) => !c.esRegistro)
}

/** Exclusión mutua: un registro de compra menor no se mezcla con cotizaciones normales activas (ni hay dos registros). */
function exigirExclusion(folio, esRegistro, ignorarId) {
  const otras = listCotizaciones(folio).filter((c) => c.id !== ignorarId)
  if (esRegistro) {
    if (otras.some((c) => c.esRegistro)) throw new Error('Esta requisición ya tiene un registro de compra menor activo. Descártalo (con su motivo) si necesitas registrar otro.')
    if (otras.length > 0) throw new Error('Esta requisición ya tiene cotizaciones normales activas: una compra menor (solo registro) es excluyente. Descarta las cotizaciones (con su motivo) para usar el registro.')
  } else if (otras.some((c) => c.esRegistro)) {
    throw new Error('Esta requisición tiene un registro de compra menor activo: es excluyente y no se mezcla con cotizaciones normales. Descarta el registro (con su motivo) para cotizar de forma completa.')
  }
}

/** Registra una cotización con su precio por partida. La primera cotización pasa la requisición a "En cotización". */
export async function addCotizacion(input) {
  const req = exigirCotizando(input.folio)
  if (!input.proveedor.trim()) throw new Error('El proveedor es obligatorio.')
  const entradas = validarPrecios(input.folio, input.precios)
  const esRegistro = input.esRegistro === true
  exigirExclusion(input.folio, esRegistro)
  const usuario = input.registradoPor ?? usuarioActual()
  // El registro de compra menor no lleva criterios (descuento, flete, garantía…): solo proveedor y precios.
  const campos = limpiarCampos(esRegistro ? { proveedor: input.proveedor } : camposDe(input))
  const c = {
    ...Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined)),
    id: `cot-${nuevoId()}`,
    folio: input.folio,
    proveedor: input.proveedor.trim(),
    ...(esRegistro ? { esRegistro: true } : {}),
    elegida: false,
    registradoPor: usuario,
    activo: true,
    createdAt: ahora(),
  }
  await tCot.insert(c)
  for (const [partidaId, precioUnitario] of entradas) {
    await tItems.insert({ id: `${c.id}:${partidaId}`, cotizacionId: c.id, partidaId, precioUnitario })
  }
  registrarBitacora({
    tabla: 'cmp_cotizaciones',
    registroId: c.id,
    accion: 'alta',
    despues: { ...c, precios: Object.fromEntries(entradas) },
    detalle: `${usuario} registró ${esRegistro ? 'la compra menor (solo registro)' : 'la cotización'} de ${c.proveedor} para ${c.folio}`,
  })
  if (req.estado === 'recibida') {
    await cambiarEstado(c.folio, 'en_cotizacion', { usuario, comentario: 'Primera cotización registrada' })
  }
  return c
}

/**
 * Edita datos, criterios y/o precios de una cotización (solo mientras se cotiza). Si nada cambió no escribe nada.
 * Un precio ya guardado no puede quedar vacío (nada se borra): se corrige o se descarta la cotización.
 */
export async function actualizarCotizacion(
  id,
  patch,
  precios,
  opts = {},
) {
  const prev = getCotizacion(id)
  if (!prev) throw new Error('Cotización no encontrada.')
  exigirCotizando(prev.folio)
  const usuario = opts.usuario ?? usuarioActual()
  // Un registro de compra menor solo admite proveedor (sin criterios).
  const limpio = limpiarCampos(prev.esRegistro ? Object.fromEntries(Object.entries(patch).filter(([k]) => k === 'proveedor')) : patch)
  if ('proveedor' in limpio && !limpio.proveedor) throw new Error('El proveedor es obligatorio.')
  // Solo lo que cambió de verdad (el vaciado explícito se manda como null: la base lo guarda como sin dato).
  const aEscribir = {}
  for (const [k, v] of Object.entries(limpio)) {
    const anterior = (prev)[k]
    if (JSON.stringify(anterior ?? null) !== JSON.stringify(v ?? null)) aEscribir[k] = v === undefined ? null : v
  }
  let preciosNuevos = []
  if (precios) {
    const previos = preciosDe(id)
    const validos = validarPrecios(prev.folio, precios)
    if (prev.esRegistro) {
      // Un registro de compra menor no puede subir al umbral con una edición de precios.
      const cfg = getConfig()
      const mapa = { ...previos, ...Object.fromEntries(validos) }
      const sub = listPartidas(prev.folio).reduce((s, p) => s + (mapa[p.id] ?? 0) * p.cantidad, 0)
      if (!esCompraMenor(totalComparableDe(sub, {}, cfg.ivaPct, false).total, cfg.umbralSinCotizacion)) throw new Error(mensajeRegistroExcedido(cfg.umbralSinCotizacion))
    }
    preciosNuevos = validos.filter(([pid, v]) => previos[pid] !== v)
    for (const pid of Object.keys(previos)) {
      if (!(pid in precios) || precios[pid] === undefined || Number.isNaN(precios[pid])) throw new Error('Un precio ya guardado no se puede dejar vacío (nada se borra): corrígelo o descarta la cotización.')
    }
  }
  if (Object.keys(aEscribir).length === 0 && preciosNuevos.length === 0) return prev
  let next = prev
  if (Object.keys(aEscribir).length > 0) next = await tCot.update(id, aEscribir)
  for (const [partidaId, precioUnitario] of preciosNuevos) {
    await tItems.insert({ id: `${id}:${partidaId}`, cotizacionId: id, partidaId, precioUnitario })
  }
  const { antes, despues } = cambios(prev, aEscribir)
  registrarBitacora({
    tabla: 'cmp_cotizaciones',
    registroId: id,
    accion: 'cambio',
    antes,
    despues: { ...despues, ...(preciosNuevos.length ? { precios: Object.fromEntries(preciosNuevos) } : {}) },
    detalle: `${usuario} editó la cotización de ${prev.proveedor}`,
  })
  return next
}

/** Descarta una cotización (no se borra: queda inactiva con su motivo). Si era la elegida, se des-elige. */
export async function descartarCotizacion(id, opts) {
  const prev = getCotizacion(id)
  if (!prev) throw new Error('Cotización no encontrada.')
  exigirCotizando(prev.folio)
  if (!opts.motivo?.trim()) throw new Error('Escribe el motivo del descarte.')
  await tCot.update(id, { activo: false, elegida: false, justificacion: `Descartada: ${opts.motivo.trim()}` })
  if (prev.elegida) await actualizarRequisicion(prev.folio, { proveedorElegido: '' }, { usuario: opts.usuario })
  registrarBitacora({ tabla: 'cmp_cotizaciones', registroId: id, accion: 'desactivación', antes: { activo: true }, despues: { activo: false, motivo: opts.motivo }, detalle: `${opts.usuario ?? usuarioActual()} descartó la cotización de ${prev.proveedor}` })
}

// ---- Hoja del cotizador (guardado de varias columnas a la vez) ------------------------------------------------------------
/**
 * @typedef {object} ColumnaHoja
 * @property {string} [id] - Id de la cotización ya guardada (sin id = nueva).
 * @property {CamposCotizacion & { proveedor: string }} datos
 * @property {Record<string, number>} precios - { partidaId: precio unitario } de las partidas con precio capturado.
 */

/**
 * Guarda todas las columnas de la hoja (altas y cambios) usando `addCotizacion` / `actualizarCotizacion`. Valida TODO antes de escribir
 * para no dejar la hoja a medias por un error de captura. Devuelve los ids en el mismo orden que las columnas.
 */
export async function guardarHoja(folio, columnas, opts = {}) {
  exigirCotizando(folio)
  exigirExclusion(folio, false)
  const vistos = new Set()
  for (const col of columnas) {
    const nombre = col.datos.proveedor?.trim()
    if (!nombre) throw new Error('Cada columna necesita el nombre del proveedor.')
    const n = normalizar(nombre)
    if (vistos.has(n)) throw new Error(`«${nombre}» está dos veces en la hoja. Si es una nueva versión de su cotización, descarta la anterior.`)
    vistos.add(n)
    validarPrecios(folio, col.precios)
    limpiarCampos(col.datos)
  }
  const ids = []
  for (const col of columnas) {
    if (col.id) {
      await actualizarCotizacion(col.id, col.datos, col.precios, opts)
      ids.push(col.id)
    } else {
      const c = await addCotizacion({ ...col.datos, folio, precios: col.precios, registradoPor: opts.usuario })
      ids.push(c.id)
    }
  }
  return ids
}

// ---- Memoria de proveedores (autocompletar y calificación sugerida) ------------------------------------------------------
/**
 * @typedef {object} ProveedorPrevio
 * @property {string} proveedor
 * @property {string} [contacto]
 * @property {string} [telefono]
 * @property {string} [direccion]
 * @property {number} cotizaciones - Cotizaciones anteriores de este proveedor en la plataforma (activas y descartadas).
 * @property {number} elegidas - Veces que se le eligió.
 * @property {number} compras - Veces que se le eligió y la requisición ya se compró o entregó.
 * @property {number} [calificacionPromedio] - Promedio (1-5, redondeado) de las calificaciones capturadas antes.
 * @property {number} ultima
 */

/** Proveedores usados antes en cotizaciones de la plataforma (más usados primero), con su último contacto y calificación promedio. */
export function proveedoresPrevios(opts = {}) {
  const mapa = new Map()
  const todas = [...tCot.list()].filter((c) => c.folio !== opts.excluirFolio).sort((a, b) => a.createdAt - b.createdAt)
  for (const c of todas) {
    const k = normalizar(c.proveedor)
    if (!k) continue
    const e = mapa.get(k) ?? { p: { proveedor: c.proveedor, cotizaciones: 0, elegidas: 0, compras: 0, ultima: 0 }, califs: [] }
    e.p.proveedor = c.proveedor
    e.p.contacto = c.contacto || e.p.contacto
    e.p.telefono = c.telefono || e.p.telefono
    e.p.direccion = c.direccion || e.p.direccion
    e.p.cotizaciones++
    e.p.ultima = c.createdAt
    if (c.elegida) {
      e.p.elegidas++
      const estado = getRequisicion(c.folio)?.estado
      if (estado === 'comprada' || estado === 'entregada') e.p.compras++
    }
    if (typeof c.calificacionProveedor === 'number') e.califs.push(c.calificacionProveedor)
    mapa.set(k, e)
  }
  return [...mapa.values()]
    .map(({ p, califs }) => ({ ...p, calificacionPromedio: califs.length ? Math.min(5, Math.max(1, Math.round(califs.reduce((s, x) => s + x, 0) / califs.length))) : undefined }))
    .sort((a, b) => b.cotizaciones - a.cotizaciones || b.ultima - a.ultima)
}

/** Calificación sugerida para un proveedor según sus cotizaciones anteriores (undefined si no hay). */
export function calificacionSugerida(proveedor, folioActual) {
  const k = normalizar(proveedor)
  return k ? proveedoresPrevios({ excluirFolio: folioActual }).find((p) => normalizar(p.proveedor) === k)?.calificacionPromedio : undefined
}

// ---- Comparativo -------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} FilaComparativo
 * @property {Cotizacion} cotizacion
 * @property {Record<string, number | undefined>} precios - { partidaId: precio unitario | undefined }
 * @property {number} total - Costo total comparable (con descuento, flete e IVA normalizado).
 * @property {boolean} completa
 * @property {boolean} esMasBarata
 * @property {number} diferencia - Diferencia contra la más barata completa (>= 0).
 * @property {number} subtotal - Σ precio × cantidad antes de descuento, flete e IVA.
 * @property {AnalisisCotizacion} analisis - Puntaje, insignias, razones y alertas de esta cotización.
 */

/**
 * @typedef {object} Comparativo
 * @property {string} folio
 * @property {Partida[]} partidas
 * @property {FilaComparativo[]} filas
 * @property {string} [masBarataId] - id de la cotización completa más barata.
 * @property {string} [recomendadaId] - id de la cotización recomendada por el comparativo.
 * @property {string} [elegidaId]
 * @property {Record<string, number>} mejorPrecioPorPartida - { partidaId: precio mínimo cotizado } para resaltar el mejor precio por renglón.
 * @property {ResultadoAnalisis} analisis
 */

/** Análisis (puntaje y recomendación) con la configuración vigente. */
export function analizarConConfig(entradas, hoy) {
  const cfg = getConfig()
  return analizarCotizaciones(entradas, { pesos: cfg.cotizadorPesos, ivaPct: cfg.ivaPct, hoy })
}

export function comparativo(folio) {
  const partidas = listPartidas(folio)
  const cots = listCotizaciones(folio)
  const analisis = analizarConConfig(cots.map((c) => entradaDe(c, partidas)))
  const filas = cots.map((c, i) => {
    const precios = preciosDe(c.id)
    const a = analisis.filas[i]
    return {
      cotizacion: c,
      precios: Object.fromEntries(partidas.map((p) => [p.id, precios[p.id]])),
      total: a.total,
      completa: a.completa,
      esMasBarata: a.esMasBarata,
      diferencia: a.diferencia,
      subtotal: a.desglose.subtotal,
      analisis: a,
    }
  })
  const mejor = {}
  for (const p of partidas) {
    const ps = filas.map((f) => f.precios[p.id]).filter((x) => x !== undefined)
    if (ps.length) mejor[p.id] = Math.min(...ps)
  }
  return {
    folio,
    partidas,
    filas,
    masBarataId: analisis.masBarataId,
    recomendadaId: analisis.recomendadaId,
    elegidaId: cots.find((c) => c.elegida)?.id,
    mejorPrecioPorPartida: mejor,
    analisis,
  }
}

/**
 * @typedef {object} EvaluacionCotizaciones
 * @property {number} monto - Monto de referencia para los umbrales: el de la elegida o, si no hay, el de la más barata completa.
 * @property {number} completas - Cotizaciones completas de proveedores distintos.
 * @property {number} requeridas - Cotizaciones requeridas para ese monto (0 en un registro de compra menor; 1 si < umbral simple; si no, el mínimo configurado).
 * @property {boolean} requiereExcepcion - true cuando faltan cotizaciones y habrá que documentar una excepción.
 * @property {boolean} registroExcedido - true cuando la elegida es un registro de compra menor y el monto llegó al umbral (>=): no puede enviarse así.
 * @property {string[]} mensajes
 */

/** Cantidad de proveedores DISTINTOS (sin distinguir mayúsculas, acentos ni espacios sobrantes) en una lista de nombres. */
export function contarProveedoresDistintos(nombres) {
  return new Set(nombres.map((n) => normalizar(n)).filter(Boolean)).size
}

/** Cotizaciones completas (precio en todas las partidas) de PROVEEDORES DISTINTOS de la requisición. */
export function completasDistintas(folio) {
  const partidas = listPartidas(folio)
  return contarProveedoresDistintos(listCotizaciones(folio).filter((c) => subtotalDe(c.id, partidas).completa).map((c) => c.proveedor))
}

/** Excepción de cotizaciones de una requisición con la forma { tipo, instruidaPor, justificacion }. */
export function excepcionDe(req) {
  return { tipo: req?.excepcionTipo || undefined, instruidaPor: req?.excepcionInstruidaPor || undefined, justificacion: req?.excepcionCotizaciones ?? '' }
}

/** ¿La requisición trae una excepción válida (tipo, «instruida por» si es adjudicación directa y justificación >= 15)? */
export function excepcionValida(req) {
  return errorExcepcion(excepcionDe(req)) === ''
}

/**
 * Cotizaciones requeridas para un monto: 0 si es un registro de compra menor (< umbral sin cotización); si no, 1 por debajo del umbral
 * simple y `cotizacionesMinimas` a partir de él (>=).
 */
export function cotizacionesRequeridas(monto, esRegistro = false) {
  const cfg = getConfig()
  if (esRegistro && esCompraMenor(monto, cfg.umbralSinCotizacion)) return 0
  return monto >= cfg.umbralCotizacionSimple ? cfg.cotizacionesMinimas : 1
}

/**
 * Regla de cotizaciones mínimas con datos ya calculados (la usa la hoja del cotizador con la captura todavía sin guardar).
 * `completas` = cotizaciones completas de proveedores DISTINTOS. `esRegistro`: la cotización de referencia es un registro de compra menor.
 */
export function evaluarMinimas(monto, completas, esRegistro = false) {
  const cfg = getConfig()
  const registroExcedido = esRegistro && !esCompraMenor(monto, cfg.umbralSinCotizacion)
  const requeridas = cotizacionesRequeridas(monto, esRegistro)
  const requiereExcepcion = !registroExcedido && completas < requeridas
  const mensajes = []
  if (registroExcedido) mensajes.push(mensajeRegistroExcedido(cfg.umbralSinCotizacion))
  else if (completas === 0) mensajes.push('Aún no hay una cotización completa (con precio en todas las partidas).')
  else if (requiereExcepcion) mensajes.push(textoFaltanCotizaciones(cfg.umbralCotizacionSimple, requeridas, completas))
  return { monto, completas, requeridas, requiereExcepcion, registroExcedido, mensajes }
}

export function evaluarCotizaciones(folio) {
  const comp = comparativo(folio)
  const completas = comp.filas.filter((f) => f.completa)
  const ref = comp.filas.find((f) => f.cotizacion.id === comp.elegidaId && f.completa) ?? completas.find((f) => f.esMasBarata)
  return evaluarMinimas(ref?.total ?? 0, contarProveedoresDistintos(completas.map((f) => f.cotizacion.proveedor)), ref?.cotizacion.esRegistro === true)
}

// ---- Elegir proveedor --------------------------------------------------------------------------------------------------
export async function elegirProveedor(
  folio,
  cotizacionId,
  opts = {},
) {
  const req = exigirCotizando(folio)
  const cot = getCotizacion(cotizacionId)
  if (!cot || cot.folio !== folio || !cot.activo) throw new Error('Cotización no válida para esta requisición.')
  const partidas = listPartidas(folio)
  const { subtotal, completa } = subtotalDe(cotizacionId, partidas)
  if (!completa) throw new Error('La cotización elegida debe traer precio en todas las partidas.')
  const cfg = getConfig()
  const total = totalComparableDe(subtotal, criteriosDe(cot), cfg.ivaPct, false).total

  const comp = comparativo(folio)
  const esRegistro = cot.esRegistro === true
  // Registro de compra menor: sin comparativo ni justificación, pero SOLO por debajo del umbral.
  if (esRegistro && !esCompraMenor(total, cfg.umbralSinCotizacion)) throw new Error(mensajeRegistroExcedido(cfg.umbralSinCotizacion))
  const justificacion = esRegistro ? '' : opts.justificacion?.trim()
  const ev = esRegistro ? { requiereJustificacion: false } : evaluarEleccion(comp.analisis, cotizacionId)
  if (ev.requiereJustificacion && !justificacion) throw new Error(ev.motivo ?? 'Escribe la justificación de la elección.')

  const requeridas = cotizacionesRequeridas(total, esRegistro)
  const completas = contarProveedoresDistintos(comp.filas.filter((f) => f.completa).map((f) => f.cotizacion.proveedor))
  const faltan = completas < requeridas
  // Excepción: la que llega en opts (campo por campo) o, si no, la ya guardada en la requisición.
  const tiene = (k) => Object.prototype.hasOwnProperty.call(opts, k)
  const exc = {
    tipo: tiene('excepcionTipo') ? opts.excepcionTipo || undefined : req.excepcionTipo || undefined,
    instruidaPor: tiene('excepcionInstruidaPor') ? opts.excepcionInstruidaPor || undefined : req.excepcionInstruidaPor || undefined,
    justificacion: (tiene('excepcionCotizaciones') ? opts.excepcionCotizaciones : req.excepcionCotizaciones)?.trim() ?? '',
  }
  if (faltan) {
    if (!exc.tipo && !exc.justificacion) throw new Error(textoFaltanCotizaciones(cfg.umbralCotizacionSimple, requeridas, completas))
    const e = errorExcepcion(exc)
    if (e) throw new Error(e)
  }

  const usuario = opts.usuario ?? usuarioActual()
  for (const otra of listCotizaciones(folio)) {
    if (otra.id !== cotizacionId && otra.elegida) await tCot.update(otra.id, { elegida: false })
  }
  await tCot.update(cotizacionId, { elegida: true, justificacion: justificacion || undefined })
  await actualizarRequisicion(
    folio,
    {
      proveedorElegido: cot.proveedor,
      // Si ya no hacen falta cotizaciones (hay suficientes o el monto bajó del umbral) la excepción se limpia.
      excepcionTipo: faltan ? exc.tipo : '',
      excepcionInstruidaPor: faltan && exc.tipo === 'adjudicacion_directa' ? exc.instruidaPor : '',
      excepcionCotizaciones: faltan ? exc.justificacion : '',
    },
    { usuario },
  )
  registrarBitacora({
    tabla: 'cmp_cotizaciones',
    registroId: cotizacionId,
    accion: 'elección',
    despues: { folio, proveedor: cot.proveedor, total, justificacion, recomendada: comp.recomendadaId === cotizacionId, excepcion: faltan ? exc : undefined },
    detalle: `${usuario} eligió a ${cot.proveedor} (${formatoMoneda(total)}) para ${folio}${justificacion ? ` · ${justificacion}` : ''}`,
  })
}

/**
 * Guarda la excepción de cotizaciones de la requisición (borrador de la hoja) sin elegir proveedor. Con todo vacío la limpia; si trae algo, se
 * valida completa (tipo, «instruida por» solo en adjudicación directa, justificación >= 15). Solo en recibida / en cotización (después queda congelada).
 * @param {string} folio
 * @param {{ tipo?: string, instruidaPor?: string, justificacion?: string }} x
 */
export async function guardarExcepcion(folio, x, opts = {}) {
  exigirCotizando(folio)
  const tipo = x.tipo || ''
  const por = tipo === 'adjudicacion_directa' ? x.instruidaPor || '' : ''
  const just = (x.justificacion ?? '').trim()
  if (tipo || just) {
    const e = errorExcepcion({ tipo, instruidaPor: por, justificacion: just })
    if (e) throw new Error(e)
  }
  await actualizarRequisicion(folio, { excepcionTipo: tipo, excepcionInstruidaPor: por, excepcionCotizaciones: just }, opts)
}

/**
 * Compra menor (< umbral sin cotización): registra el proveedor y el precio por partida como REGISTRO y lo elige solo.
 * Sin criterios, comparativo ni justificación. Exige que el total capturado sea estrictamente menor al umbral y que no haya
 * cotizaciones normales activas (ni otro registro).
 * @param {{ folio: string, proveedor: string, precios: Record<string, number>, usuario?: string }} input
 */
export async function registrarCompraMenor(input) {
  const cfg = getConfig()
  exigirCotizando(input.folio)
  const partidas = listPartidas(input.folio)
  const entradas = validarPrecios(input.folio, input.precios)
  const precios = Object.fromEntries(entradas)
  if (partidas.some((p) => precios[p.id] === undefined)) throw new Error('Captura el precio de todas las partidas.')
  const total = totalComparableDe(partidas.reduce((s, p) => s + precios[p.id] * p.cantidad, 0), {}, cfg.ivaPct, false).total
  if (!esCompraMenor(total, cfg.umbralSinCotizacion)) throw new Error(mensajeRegistroExcedido(cfg.umbralSinCotizacion))
  const c = await addCotizacion({ folio: input.folio, proveedor: input.proveedor, precios, esRegistro: true, registradoPor: input.usuario })
  await elegirProveedor(input.folio, c.id, { usuario: input.usuario })
  return getCotizacion(c.id) ?? c
}

/** Cotizaciones que se parecen por proveedor (para avisar al capturar el mismo proveedor dos veces). */
export function proveedorYaCotizado(folio, proveedor) {
  const n = normalizar(proveedor)
  return listCotizaciones(folio).some((c) => normalizar(c.proveedor) === n)
}

// Requisito para entrar a "En autorización" (espejo de cmp_requisitos_estado en la base).
registrarValidadorTransicion((req, a) => {
  if (a !== 'en_autorizacion') return null
  if (listPartidas(req.folio).length === 0) return 'La requisición no tiene partidas.'
  const elegida = listCotizaciones(req.folio).find((c) => c.elegida)
  if (!elegida) return 'Elige una cotización ganadora antes de enviar a autorización.'
  // Un registro de compra menor solo vale por debajo del umbral (espejo de cmp_requisitos_estado).
  if (elegida.esRegistro && !esCompraMenor(totalCotizacion(elegida.id))) return mensajeRegistroExcedido()
  // Cotizaciones de proveedores distintos a partir del umbral simple, salvo excepción válida (espejo de Reglas::requisitosEstado).
  if (!elegida.esRegistro) {
    const requeridas = cotizacionesRequeridas(totalCotizacion(elegida.id))
    const hay = completasDistintas(req.folio)
    if (hay < requeridas && !excepcionValida(req)) {
      return req.excepcionTipo || req.excepcionCotizaciones?.trim() ? errorExcepcion(excepcionDe(req)) : textoFaltanCotizaciones(getConfig().umbralCotizacionSimple, requeridas, hay)
    }
  }
  return null
})
