import { track } from '../reactive'
import { parseLocalDate } from '../dateUtils'
import { getFamilia, getUbicacion, listUbicaciones } from './comunes'
import { listEquipos, listMovimientos } from './sistemas'
import { getMaterial, listConsumos, listMateriales, materialesBajoMinimo } from './mantenimiento'
import { getResponsivaActual } from './responsivas'
import { listCargosPerdida } from './cargosPerdida'
import { listAuditorias, listItems } from './auditorias'
import {
  ESTADOS,
  RUTAS_COMPRAS,
  avisosSeparacionFunciones,
  comparativo,
  esAbierta,
  estadoAutorizacion,
  estadoDiferencia,
  getHistorial,
  listMovimientosDinero,
  listRequisiciones,
  r2,
  resumenCompra,
  resumenDinero,
} from '../compras'

/**
 * Alertas de control: reglas simples y explicables para mitigar fugas de dinero, malas prácticas, robo hormiga y
 * compras innecesarias, más los indicadores de los procesos GV-INF-008 (Inventario y Control de Equipo Informático)
 * y GV-FIN-ADQ-001 (Adquisiciones). Todos los umbrales viven aquí arriba para ajustarlos fácilmente.
 */

// ---- Umbrales (ajustables) ----
/** Equipo `disponible` sin asignar por más de estos días = capital inmovilizado (revisar antes de comprar). */
export const DIAS_OCIOSO = 60
/** Con este valor inmovilizado la alerta de ocioso sube de baja a media. */
export const VALOR_OCIOSO_MEDIA = 30000
/** Días de gracia para adjuntar la responsiva firmada. */
export const DIAS_GRACIA_RESPONSIVA = 7
/** Consumo anómalo: ventana reciente, ventana de historia previa y múltiplo sobre el promedio mensual. */
export const DIAS_CONSUMO_RECIENTE = 30
export const DIAS_CONSUMO_HISTORIA = 90
export const FACTOR_CONSUMO_ANOMALO = 2
/** Consumo mínimo (valor) de los últimos 30 días para considerarlo anómalo cuando sí hay historia. */
export const MIN_VALOR_CONSUMO_ANOMALO = 500
/** Consumo mínimo (valor) de los últimos 30 días cuando NO hay historia previa. */
export const MIN_VALOR_CONSUMO_SIN_HISTORIA = 1500
/** Con este valor consumido en 30 días la alerta de consumo anómalo es alta. */
export const VALOR_CONSUMO_ALTA = 5000
/** Pérdidas/robos por usuario en la ventana para marcarlo como reincidente. */
export const MIN_PERDIDAS_REPETIDAS = 2
export const MESES_PERDIDAS = 12
/** Números de serie temporales (`PENDIENTE-…`) que llevan más de estos días sin corregirse. */
export const DIAS_SERIE_PENDIENTE = 7
/** Equipo dañado/en reparación por más de estos días. */
export const DIAS_EQUIPO_DANADO = 15
/** Cadencia de auditoría por ubicación (GV-INF-008: trimestral). */
export const DIAS_AUDITORIA = 90
/** Compras Indirectas: requisición abierta sin ningún movimiento en el historial por más de estos días HÁBILES. */
export const DIAS_REQ_ESTANCADA = 3
/** Con tanto tiempo sin movimiento (días hábiles) la alerta de requisición estancada sube a alta. */
export const DIAS_REQ_ESTANCADA_ALTA = 7
/**
 * Requisición en "En autorización" por más de estas HORAS HÁBILES (horario de la empresa, ver `HORARIO_EMPRESA`) = Finanzas no
 * decide. Política GV-POL-ADQ-001 v1.1: antes eran 2 días hábiles; desde la migración 022 solo decide Finanzas (Dirección y los CEOs ya no).
 */
export const HORAS_AUTORIZACION_LENTA = 3
/** Con tantas horas hábiles en autorización (≈ 2.5 días hábiles) la alerta de autorización lenta sube a alta. */
export const HORAS_AUTORIZACION_ALTA = 24
/** Urgente abierta por más de estos días hábiles sube de media a alta. */
export const DIAS_URGENTE_ALTA = 2
/** Dinero entregado/gastado sin comprobar por más de este tiempo (días naturales). Política GV-POL-ADQ-001 v1.1: 1 día. */
export const DIAS_SIN_COMPROBAR = 1
/** Con tanto tiempo (días naturales) o este monto sin comprobar la alerta sube a alta. */
export const DIAS_SIN_COMPROBAR_ALTA = 3
export const VALOR_SIN_COMPROBAR_ALTA = 5000
/** Elegir un proveedor más caro por esta diferencia total (MXN) sube la alerta de baja a media. */
export const VALOR_NO_MAS_BARATA_MEDIA = 1000
/** Las excepciones/justificaciones de compras ya entregadas solo se listan durante esta ventana (días). */
export const DIAS_VENTANA_COMPRAS_CERRADAS = 30
/** Metas de los indicadores (%). */
export const META_EXACTITUD = 98
export const META_RESPONSIVAS = 100
export const META_SUCURSALES_AUDITADAS = 100
export const META_MATERIALES_EN_RANGO = 98

const DIA_MS = 86400000
const HORA_MS = 3600000
const MAX_ITEMS = 25

// ---------------------------------------------------------------------------------------------------------------------
// Horario de la empresa (política GV-POL-ADQ-001 v1.1) — fácil de editar
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Ventana de atención por día de la semana (índice = `Date.getDay()`: 0 domingo … 6 sábado): [hora de inicio, hora de fin] en horas locales; null = sin atención.
 * @typedef {readonly ([number, number] | null)[]} HorarioSemana
 */
export const HORARIO_EMPRESA = [
  null, // domingo: sin atención
  [9, 18], // lunes
  [9, 18], // martes
  [9, 18], // miércoles
  [9, 18], // jueves
  [9, 18], // viernes
  [9, 16], // sábado
]
/** Fecha local AAAA-MM-DD (mes 1-12). */
const fechaClave = (anio, mes, dia) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

/** Día del mes del n-ésimo lunes (n = 1 primero, 3 tercero) de un mes (mes 1-12). */
function nEsimoLunes(anio, mes, n) {
  const primero = new Date(anio, mes - 1, 1).getDay() // 0 domingo … 6 sábado
  return 1 + ((1 - primero + 7) % 7) + 7 * (n - 1)
}

/**
 * Días de descanso obligatorio OFICIALES de México (Ley Federal del Trabajo, art. 74) de un año, en AAAA-MM-DD (fecha local) y en orden:
 * 1 de enero; primer lunes de febrero (5 de febrero); tercer lunes de marzo (21 de marzo); 1 de mayo; 16 de septiembre; 1 de octubre
 * SOLO cuando corresponde la transmisión del Poder Ejecutivo Federal (cada seis años: 2024, 2030, 2036…); tercer lunes de noviembre
 * (20 de noviembre); 25 de diciembre. Función pura: sirve para cualquier año, sin tablas que mantener.
 */
export function festivosOficiales(anio) {
  const lista = [
    fechaClave(anio, 1, 1),
    fechaClave(anio, 2, nEsimoLunes(anio, 2, 1)),
    fechaClave(anio, 3, nEsimoLunes(anio, 3, 3)),
    fechaClave(anio, 5, 1),
    fechaClave(anio, 9, 16),
  ]
  if (anio >= 2024 && (anio - 2024) % 6 === 0) lista.push(fechaClave(anio, 10, 1))
  lista.push(fechaClave(anio, 11, nEsimoLunes(anio, 11, 3)), fechaClave(anio, 12, 25))
  return lista
}

/**
 * Días festivos sin atención (AAAA-MM-DD, fecha local): SOLO los descansos oficiales federales (LFT art. 74), calculados año por año
 * (2024–2040); no hay otros festivos. Si un festivo cae en sábado o domingo tampoco se labora (el horario ya lo cubre).
 */
export const FESTIVOS = Array.from({ length: 17 }, (_, i) => festivosOficiales(2024 + i)).flat()

function claveDia(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Horas HÁBILES transcurridas entre dos momentos: solo cuenta el tiempo que cae dentro del horario de la empresa (por defecto lunes a
 * viernes 9:00–18:00 y sábado 9:00–16:00; domingos y festivos no cuentan), en hora LOCAL. Función pura (sin reloj ni estado): se puede
 * probar con fechas a mano. Ej.: viernes 17:00 → sábado 10:00 = 1 h (vie 17–18) + 1 h (sáb 9–10) = 2 h.
 */
export function horasHabilesEntre(desde, hasta, horario = HORARIO_EMPRESA, festivos = FESTIVOS) {
  if (!(hasta > desde)) return 0
  const dia = new Date(desde)
  dia.setHours(0, 0, 0, 0)
  let ms = 0
  for (let i = 0; i < 4000 && dia.getTime() < hasta; i++) {
    const ventana = horario[dia.getDay()]
    if (ventana && !festivos.includes(claveDia(dia))) {
      const ini = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, 0, 0, 0).getTime() + ventana[0] * HORA_MS
      const fin = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, 0, 0, 0).getTime() + ventana[1] * HORA_MS
      const a = Math.max(desde, ini)
      const b = Math.min(hasta, fin)
      if (b > a) ms += b - a
    }
    dia.setDate(dia.getDate() + 1)
  }
  return ms / HORA_MS
}

export function textoHorasHabiles(h) {
  const x = Math.round(h * 10) / 10
  const n = Number.isInteger(x) ? String(x) : x.toFixed(1)
  return `${n} ${x === 1 ? 'hora hábil' : 'horas hábiles'}`
}

/** @typedef {'alta' | 'media' | 'baja'} SeveridadAlerta */

/**
 * Compras Indirectas
 * Seguridad (solo Dirección)
 * @typedef {'ocioso' | 'sin_responsiva' | 'consumo_anomalo' | 'sobre_maximo' | 'bajo_minimo' |
 *   'perdidas_repetidas' | 'serie_pendiente' | 'salida_sin_solicitante' | 'equipo_danado' |
 *   'auditoria_vencida' | 'requisicion_estancada' | 'autorizacion_lenta' | 'urgente_abierta' |
 *   'compra_sin_comprobar' | 'compra_sobre_autorizado' | 'sin_cotizaciones_requeridas' |
 *   'cotizacion_no_mas_barata' | 'separacion_funciones' | 'intentos_borrado'} ReglaAlerta
 */

/**
 * @typedef {object} AlertaItem
 * @property {string} texto
 * @property {string} [ruta]
 */

/**
 * @typedef {object} AlertaControl
 * @property {string} id
 * @property {ReglaAlerta} regla
 * @property {SeveridadAlerta} severidad
 * @property {string} titulo
 * @property {string} detalle
 * @property {number} conteo
 * @property {number} [valor] - Dinero involucrado (MXN), cuando aplica.
 * @property {string} [ubicacionId] - Solo cuando se pidió el cálculo para una ubicación concreta.
 * @property {'inventario' | 'compras'} [origen] - De dónde sale la regla (las de Compras Indirectas solo se calculan si se piden).
 * @property {AlertaItem[]} items
 */

/**
 * @typedef {object} OpcionesAlertasControl
 * @property {boolean} [incluirCompras] - Incluye las reglas de Compras Indirectas (requisiciones, dinero, cotizaciones). Por defecto NO: solo para roles con acceso a Compras.
 * @property {FamiliaTipo} [dominio] - Limita las reglas de inventario a un dominio (alcance por rol: Soporte = sistemas, Mantenimiento = mantenimiento). Sin valor = ambos.
 */

/**
 * @typedef {object} IndicadorControl
 * @property {string} id
 * @property {string} nombre
 * @property {number | null} valor - null = sin datos.
 * @property {number} meta
 * @property {'%' | ''} unidad
 * @property {boolean | null} cumple - null = sin datos.
 * @property {string} detalle
 */

const ORDEN_SEVERIDAD = { alta: 0, media: 1, baja: 2 }

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const money = (n) => currency.format(Math.round(n))
const plural = (n, uno, varios) => (n === 1 ? uno : varios)

function rutaFamilia(familiaId) {
  return getFamilia(familiaId)?.tipo === 'mantenimiento' ? '/mantenimiento' : '/sistemas'
}

function nombreEquipo(e) {
  return e.modelo || e.numeroSerie || e.id
}

function nombreUbicacion(id) {
  return getUbicacion(id)?.nombre ?? 'sin ubicación'
}

/** Marca de tiempo de una fecha YYYY-MM-DD (hora local); NaN si no es válida. */
function tsFecha(fecha) {
  if (!fecha) return NaN
  const t = parseLocalDate(fecha.slice(0, 10)).getTime()
  return t
}

function inicioDeHoy(now) {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function diasDesde(ts, now) {
  return (now - ts) / DIA_MS
}

function limitar(items) {
  if (items.length <= MAX_ITEMS) return items
  return [...items.slice(0, MAX_ITEMS), { texto: `… y ${items.length - MAX_ITEMS} más` }]
}

/** ¿El equipo asignado cuenta con responsiva firmada (documento adjunto)? */
export function tieneResponsivaFirmada(e) {
  const resp = getResponsivaActual(e.id)
  if (resp) return !!resp.documentoUrl
  return !!e.responsivaUrl
}

/** Motivo por el que un equipo asignado no tiene respaldo de responsiva (con los días de gracia); undefined = en regla. */
export function motivoSinResponsiva(e, now) {
  const resp = getResponsivaActual(e.id)
  if (!resp) return e.responsivaUrl ? undefined : 'sin responsiva registrada'
  if (resp.documentoUrl) return undefined
  const t = tsFecha(resp.fecha)
  const dias = Number.isFinite(t) ? Math.floor(diasDesde(t, now)) : 0
  return dias > DIAS_GRACIA_RESPONSIVA ? `responsiva ${resp.folio} sin documento firmado (${dias} días)` : undefined
}

/** Ubicaciones con inventario: equipos activos o materiales con existencia. */
function ubicacionesConInventario(dominio) {
  const set = new Set()
  const enDom = (familiaId) => !dominio || getFamilia(familiaId)?.tipo === dominio
  listEquipos().forEach((e) => {
    if (e.estado !== 'baja' && e.ubicacionId && enDom(e.familiaId)) set.add(e.ubicacionId)
  })
  listMateriales().forEach((m) => {
    if (m.cantidadActual > 0 && m.ubicacionId && enDom(m.familiaId)) set.add(m.ubicacionId)
  })
  const activas = new Set(listUbicaciones().map((u) => u.id))
  return new Set([...set].filter((id) => activas.has(id)))
}

function ultimaAuditoriaCompletada(ubicacionId, auditorias) {
  let ult
  auditorias.forEach((a) => {
    if (a.ubicacionId !== ubicacionId || a.estado !== 'completada') return
    const t = a.fechaCierre ?? a.fechaInicio
    if (ult === undefined || t > ult) ult = t
  })
  return ult
}

// ---------------------------------------------------------------------------------------------------------------------
// Compras Indirectas: utilidades compartidas (también las usa lib/misPendientes.js)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Días hábiles transcurridos entre dos momentos, por día calendario completo (sin festivos). Horario de la empresa:
 * lunes a viernes 9:00–18:00 y sábados 9:00–16:00, así que el sábado cuenta como día hábil y solo el domingo no
 * (política de Compras Indirectas GV-POL-ADQ-001, sección «Horarios y plazos»).
 */
export function diasHabilesEntre(desde, hasta) {
  const a = inicioDeHoy(desde)
  const b = inicioDeHoy(hasta)
  if (b <= a) return 0
  let n = 0
  const d = new Date(a)
  for (let i = 0; i < 800 && d.getTime() < b; i++) {
    d.setDate(d.getDate() + 1)
    const w = d.getDay()
    if (w !== 0) n++ // domingo = no laborable; el sábado sí se trabaja (9:00–16:00)
  }
  return n
}

export function textoDiasHabiles(n) {
  return `${n} ${plural(n, 'día hábil', 'días hábiles')}`
}
export function textoDias(n) {
  return `${n} ${plural(n, 'día', 'días')}`
}

/**
 * @typedef {object} InfoRequisicion
 * @property {Requisicion} req
 * @property {number} ultimoMovimiento - Último movimiento del historial (o la creación si no hay).
 * @property {number} enEstadoDesde - Desde cuándo está en el estado actual (última entrada a ese estado en el historial).
 */

export function infoRequisicion(req) {
  const h = getHistorial(req.folio)
  const ultimo = h[h.length - 1]
  const entrada = [...h].reverse().find((x) => x.aEstado === req.estado)
  return { req, ultimoMovimiento: ultimo?.fecha ?? req.createdAt, enEstadoDesde: entrada?.fecha ?? ultimo?.fecha ?? req.createdAt }
}

/** Con sucursal elegida: la requisición cuenta si la incluye (o si no trae sucursales). */
export function reqEnUbicacion(req, ubicacionId) {
  return !ubicacionId || req.ubicaciones.length === 0 || req.ubicaciones.includes(ubicacionId)
}

/** Dinero entregado (fondeada) o gastado (comprada/entregada) que aún no se comprueba, y desde cuándo corre el reloj. */
export function dineroSinComprobar(info) {
  const { req } = info
  if (req.estado === 'fondeada') {
    const r = resumenDinero(req.folio)
    const monto = Math.max(0, r2(r.entregado - r.comprobado - r.cambioDevuelto))
    if (monto <= 0) return null
    const entregas = listMovimientosDinero(req.folio).filter((m) => m.tipo === 'entrega_efectivo' || m.tipo === 'transferencia' || m.tipo === 'pago_tarjeta')
    return { monto, desde: entregas.length ? entregas[entregas.length - 1].fecha : info.enEstadoDesde }
  }
  if (req.estado === 'comprada' || req.estado === 'entregada') {
    const monto = resumenDinero(req.folio).pendienteComprobar
    return monto > 0 ? { monto, desde: info.enEstadoDesde } : null
  }
  return null
}

const ESTADOS_CON_DINERO = ['fondeada', 'comprada', 'entregada']
const ESTADOS_DESDE_AUTORIZACION = ['autorizada', 'fondeada', 'comprada', 'entregada']

/** ¿Cuenta la requisición para listas informativas? Las entregadas solo durante la ventana configurada. */
function vigenteParaLista(info, now) {
  return info.req.estado !== 'entregada' || diasDesde(info.enEstadoDesde, now) <= DIAS_VENTANA_COMPRAS_CERRADAS
}

function alertasCompras(ubicacionId, now) {
  const out = []
  const reqs = listRequisiciones().filter((r) => r.estado !== 'rechazada' && r.estado !== 'cancelada' && reqEnUbicacion(r, ubicacionId))
  if (reqs.length === 0) return out
  const infos = reqs.map(infoRequisicion)
  const ruta = (r) => RUTAS_COMPRAS.requisicion(r.folio)
  const cabeza = (r) => `${r.folio} · ${r.solicitanteNombre}`
  /** Quién espera una requisición en autorización: los aprobadores de Finanzas elegibles para el monto (basta uno). */
  const autorizaEspera = (folio) => {
    const est = estadoAutorizacion(folio)
    if (!est.pendiente) return ''
    return est.elegibles.length ? ` · espera a Finanzas (${est.elegibles.map((p) => p.nombre).join(' o ')})` : ' · espera a Finanzas (sin aprobador elegible)'
  }
  const ordenar = (xs) => xs.sort((a, b) => b.orden - a.orden)
  const push = (a) => out.push({ ...a, origen: 'compras' })

  // C1) Requisición estancada: abierta (no en espera) sin movimiento en el historial por más de N días hábiles
  {
    const lista = infos
      .filter((i) => esAbierta(i.req.estado) && i.req.estado !== 'en_espera')
      .map((i) => ({ i, habiles: diasHabilesEntre(i.ultimoMovimiento, now) }))
      .filter((x) => x.habiles > DIAS_REQ_ESTANCADA)
    if (lista.length > 0) {
      const alta = lista.some((x) => x.habiles > DIAS_REQ_ESTANCADA_ALTA || x.i.req.urgencia === 'urgente')
      push({
        id: 'compras_requisicion_estancada',
        regla: 'requisicion_estancada',
        severidad: alta ? 'alta' : 'media',
        titulo: 'Requisiciones estancadas',
        detalle: `${lista.length} ${plural(lista.length, 'requisición lleva', 'requisiciones llevan')} más de ${DIAS_REQ_ESTANCADA} días hábiles sin ningún movimiento. Nadie las está atendiendo.`,
        conteo: lista.length,
        items: limitar(
          ordenar(lista.map((x) => ({ orden: x.habiles, texto: `${cabeza(x.i.req)} · ${ESTADOS[x.i.req.estado].corta} · ${textoDiasHabiles(x.habiles)} sin movimiento${x.i.req.urgencia === 'urgente' ? ' · URGENTE' : ''}`, ruta: ruta(x.i.req) }))).map(({ texto, ruta }) => ({ texto, ruta })),
        ),
      })
    }
  }

  // C2) Autorización lenta: en "En autorización" por más de N horas HÁBILES (horario de la empresa) sin decisión de Finanzas
  {
    const lista = infos
      .filter((i) => i.req.estado === 'en_autorizacion')
      .map((i) => ({ i, horas: horasHabilesEntre(i.enEstadoDesde, now) }))
      .filter((x) => x.horas > HORAS_AUTORIZACION_LENTA)
    if (lista.length > 0) {
      const valor = lista.reduce((s, x) => s + estadoAutorizacion(x.i.req.folio).monto, 0)
      push({
        id: 'compras_autorizacion_lenta',
        regla: 'autorizacion_lenta',
        severidad: lista.some((x) => x.i.req.urgencia === 'urgente' || x.horas > HORAS_AUTORIZACION_ALTA) ? 'alta' : 'media',
        titulo: 'Autorizaciones lentas',
        detalle: `${lista.length} ${plural(lista.length, 'requisición espera', 'requisiciones esperan')} la decisión de Finanzas más de ${HORAS_AUTORIZACION_LENTA} horas hábiles (lunes a viernes 9:00–18:00, sábado 9:00–16:00).`,
        conteo: lista.length,
        items: limitar(
          ordenar(lista.map((x) => ({ orden: x.horas, texto: `${cabeza(x.i.req)} · ${textoHorasHabiles(x.horas)} en autorización${autorizaEspera(x.i.req.folio)}${x.i.req.urgencia === 'urgente' ? ' · URGENTE' : ''}`, ruta: ruta(x.i.req) }))).map(({ texto, ruta }) => ({ texto, ruta })),
        ),
        ...(valor > 0 ? { valor } : {}),
      })
    }
  }

  // C3) Urgentes abiertas
  {
    const lista = infos
      .filter((i) => esAbierta(i.req.estado) && i.req.urgencia === 'urgente')
      .map((i) => ({ i, habiles: diasHabilesEntre(i.req.createdAt, now) }))
    if (lista.length > 0) {
      push({
        id: 'compras_urgente_abierta',
        regla: 'urgente_abierta',
        severidad: lista.some((x) => x.habiles > DIAS_URGENTE_ALTA) ? 'alta' : 'media',
        titulo: 'Requisiciones urgentes abiertas',
        detalle: `${lista.length} ${plural(lista.length, 'requisición urgente sigue abierta', 'requisiciones urgentes siguen abiertas')}. Lo urgente sin cerrar suele terminar en compras apresuradas y sin cotizar.`,
        conteo: lista.length,
        items: limitar(
          ordenar(lista.map((x) => ({ orden: x.habiles, texto: `${cabeza(x.i.req)} · ${ESTADOS[x.i.req.estado].corta} · abierta hace ${textoDiasHabiles(x.habiles)}`, ruta: ruta(x.i.req) }))).map(({ texto, ruta }) => ({ texto, ruta })),
        ),
      })
    }
  }

  // C4) Dinero sin comprobar por más de N días (fondeada / comprada)
  {
    const lista = infos
      .filter((i) => ESTADOS_CON_DINERO.includes(i.req.estado))
      .map((i) => ({ i, d: dineroSinComprobar(i) }))
      .filter((x) => !!x.d)
      .map((x) => ({ ...x, dias: diasDesde(x.d.desde, now) }))
      .filter((x) => x.dias > DIAS_SIN_COMPROBAR)
    if (lista.length > 0) {
      const valor = lista.reduce((s, x) => s + x.d.monto, 0)
      push({
        id: 'compras_compra_sin_comprobar',
        regla: 'compra_sin_comprobar',
        severidad: valor >= VALOR_SIN_COMPROBAR_ALTA || lista.some((x) => x.dias > DIAS_SIN_COMPROBAR_ALTA) ? 'alta' : 'media',
        titulo: 'Dinero de compras sin comprobar',
        detalle: `${lista.length} ${plural(lista.length, 'compra tiene', 'compras tienen')} dinero sin comprobar (ticket/factura) por más de ${textoDias(DIAS_SIN_COMPROBAR)} natural (${money(valor)}).`,
        conteo: lista.length,
        valor,
        items: limitar(
          ordenar(lista.map((x) => ({ orden: x.dias, texto: `${cabeza(x.i.req)} · ${ESTADOS[x.i.req.estado].corta} · ${money(x.d.monto)} sin comprobar hace ${textoDias(Math.floor(x.dias))}`, ruta: ruta(x.i.req) }))).map(({ texto, ruta }) => ({ texto, ruta })),
        ),
      })
    }
  }

  // C5) Compra por encima de lo autorizado (pendiente de que Finanzas re-apruebe)
  {
    const lista = infos
      .filter((i) => ESTADOS_CON_DINERO.includes(i.req.estado) && estadoDiferencia(i.req.folio) === 'pendiente_finanzas')
      .map((i) => ({ i, r: resumenCompra(i.req.folio) }))
    if (lista.length > 0) {
      const valor = lista.reduce((s, x) => s + Math.max(0, x.r.diferencia), 0)
      push({
        id: 'compras_compra_sobre_autorizado',
        regla: 'compra_sobre_autorizado',
        severidad: 'alta',
        titulo: 'Compras por encima de lo autorizado',
        detalle: `${lista.length} ${plural(lista.length, 'compra rebasó', 'compras rebasaron')} el monto autorizado y Finanzas aún no re-aprueba la diferencia (${money(valor)} de más).`,
        conteo: lista.length,
        valor,
        items: limitar(
          ordenar(lista.map((x) => ({ orden: x.r.diferencia, texto: `${cabeza(x.i.req)} · autorizado ${money(x.r.autorizado)} · real ${money(x.r.totalReal)} · +${money(x.r.diferencia)}${x.i.req.justificacionDiferencia ? ` · Justificación: ${x.i.req.justificacionDiferencia}` : ''}`, ruta: ruta(x.i.req) }))).map(({ texto, ruta }) => ({ texto, ruta })),
        ),
      })
    }
  }

  // C6) Autorizadas con menos cotizaciones de las requeridas (excepción documentada; informativa)
  {
    const lista = infos.filter((i) => ESTADOS_DESDE_AUTORIZACION.includes(i.req.estado) && !!i.req.excepcionCotizaciones?.trim() && vigenteParaLista(i, now))
    if (lista.length > 0) {
      push({
        id: 'compras_sin_cotizaciones_requeridas',
        regla: 'sin_cotizaciones_requeridas',
        severidad: 'baja',
        titulo: 'Compras con excepción de cotizaciones',
        detalle: `${lista.length} ${plural(lista.length, 'compra se autorizó', 'compras se autorizaron')} con menos cotizaciones de las requeridas, con la excepción documentada (producto especializado, adjudicación directa o urgencia). Solo informativo.`,
        conteo: lista.length,
        valor: lista.reduce((s, x) => s + (x.req.montoAutorizado ?? 0), 0) || undefined,
        items: limitar(lista.map((i) => ({ texto: `${cabeza(i.req)} · Excepción: ${[i.req.excepcionTipo === 'adjudicacion_directa' ? `adjudicación directa${i.req.excepcionInstruidaPor ? ` instruida por ${i.req.excepcionInstruidaPor.toUpperCase()}` : ''}` : i.req.excepcionTipo === 'especializado' ? 'producto o servicio especializado' : i.req.excepcionTipo === 'urgencia' ? 'urgencia' : '', i.req.excepcionCotizaciones].filter(Boolean).join(' — ')}`, ruta: ruta(i.req) }))),
      })
    }
  }

  // C7) Proveedor elegido distinto del más barato (con su justificación)
  {
    const filas = []
    infos
      .filter((i) => i.req.estado !== 'recibida' && i.req.estado !== 'en_espera' && vigenteParaLista(i, now))
      .forEach((i) => {
        const comp = comparativo(i.req.folio)
        const elegida = comp.filas.find((f) => f.cotizacion.id === comp.elegidaId)
        const barata = comp.filas.find((f) => f.cotizacion.id === comp.masBarataId)
        if (!elegida || !barata || !elegida.completa || elegida.esMasBarata) return
        const just = elegida.cotizacion.justificacion?.trim()
        filas.push({
          i,
          dif: elegida.diferencia,
          sinJustificacion: !just,
          texto: `${cabeza(i.req)} · eligió ${elegida.cotizacion.proveedor} (${money(elegida.total)}) y no ${barata.cotizacion.proveedor} (${money(barata.total)}) · +${money(elegida.diferencia)} · Justificación: ${just || 'sin justificación'}`,
        })
      })
    if (filas.length > 0) {
      const valor = filas.reduce((s, x) => s + x.dif, 0)
      push({
        id: 'compras_cotizacion_no_mas_barata',
        regla: 'cotizacion_no_mas_barata',
        severidad: valor >= VALOR_NO_MAS_BARATA_MEDIA || filas.some((x) => x.sinJustificacion) ? 'media' : 'baja',
        titulo: 'Proveedor elegido no fue el más barato',
        detalle: `${filas.length} ${plural(filas.length, 'requisición eligió', 'requisiciones eligieron')} una cotización más cara que la mejor (${money(valor)} de sobreprecio). Revisa que la justificación sea razonable.`,
        conteo: filas.length,
        valor,
        items: limitar(filas.sort((a, b) => b.dif - a.dif).map((x) => ({ texto: x.texto, ruta: ruta(x.i.req) }))),
      })
    }
  }

  // C8) Separación de funciones (solicita ≠ cotiza ≠ aprueba ≠ entrega el dinero)
  {
    const filas = []
    infos.forEach((i) => {
      const avisos = avisosSeparacionFunciones(i.req.folio)
      if (avisos.length > 0) filas.push({ i, avisos })
    })
    if (filas.length > 0) {
      const involucraAprobacion = filas.some((x) => x.avisos.some((a) => a.includes('aprueba') || a.includes('entrega el dinero')))
      push({
        id: 'compras_separacion_funciones',
        regla: 'separacion_funciones',
        severidad: involucraAprobacion ? 'alta' : 'media',
        titulo: 'Falta separación de funciones en compras',
        detalle: `${filas.length} ${plural(filas.length, 'requisición tiene', 'requisiciones tienen')} a la misma persona en funciones incompatibles (solicita, cotiza, aprueba o entrega el dinero).`,
        conteo: filas.length,
        items: limitar(filas.map((x) => ({ texto: `${x.avisos.map((a) => a.replace(/ en REQ-[\w-]+\. Debe haber separación de funciones\.$/, '')).join('; ')} · ${cabeza(x.i.req)}`, ruta: ruta(x.i.req) }))),
      })
    }
  }

  return out
}

/** Alertas de control ordenadas por severidad y luego por valor. Con `ubicacionId` solo considera esa ubicación. */
export function getAlertasControl(ubicacionId, opciones) {
  track()
  const now = Date.now()
  const hoy0 = inicioDeHoy(now)
  const enUbi = (id) => !ubicacionId || id === ubicacionId
  const dominio = opciones?.dominio
  const enDom = (familiaId) => !dominio || getFamilia(familiaId)?.tipo === dominio
  const alertas = []
  const push = (a) => alertas.push({ ...a, ubicacionId })

  const equipos = listEquipos().filter((e) => enUbi(e.ubicacionId) && enDom(e.familiaId))
  const activos = equipos.filter((e) => e.estado !== 'baja')

  // 1) Equipo ocioso (compras innecesarias)
  {
    const ociosos = activos.filter((e) => {
      if (e.estado !== 'disponible') return false
      const base = e.fechaCompra ? tsFecha(e.fechaCompra) : e.createdAt
      return Number.isFinite(base) && diasDesde(base, now) > DIAS_OCIOSO
    })
    if (ociosos.length > 0) {
      const valor = ociosos.reduce((s, e) => s + (e.costoTotal || 0), 0)
      const porFamilia = new Map()
      ociosos.forEach((e) => {
        const g = porFamilia.get(e.familiaId) ?? { n: 0, valor: 0 }
        g.n += 1
        g.valor += e.costoTotal || 0
        porFamilia.set(e.familiaId, g)
      })
      const items = [...porFamilia.entries()]
        .sort((a, b) => b[1].valor - a[1].valor)
        .map(([familiaId, g]) => ({
          texto: `${getFamilia(familiaId)?.nombre ?? familiaId}: ${g.n} ${plural(g.n, 'equipo', 'equipos')} · ${money(g.valor)}`,
          ruta: rutaFamilia(familiaId),
        }))
      push({
        id: 'ocioso',
        regla: 'ocioso',
        severidad: valor >= VALOR_OCIOSO_MEDIA ? 'media' : 'baja',
        titulo: 'Equipos disponibles sin asignar',
        detalle: `Hay ${ociosos.length} ${plural(ociosos.length, 'equipo disponible', 'equipos disponibles')} sin asignar hace más de ${DIAS_OCIOSO} días (${money(valor)}). Revisa antes de comprar más.`,
        conteo: ociosos.length,
        valor,
        items: limitar(items),
      })
    }
  }

  // 2) Asignados sin responsiva firmada
  {
    const items = []
    let valor = 0
    let conteo = 0
    activos
      .filter((e) => e.estado === 'asignado')
      .forEach((e) => {
        const motivo = motivoSinResponsiva(e, now)
        if (!motivo) return
        conteo += 1
        valor += e.costoTotal || 0
        items.push({
          texto: `${nombreEquipo(e)}${e.numeroSerie && e.modelo ? ` (${e.numeroSerie})` : ''} · ${e.usuarioAsignado || 'sin responsable'} · ${nombreUbicacion(e.ubicacionId)}: ${motivo}`,
          ruta: rutaFamilia(e.familiaId),
        })
      })
    if (conteo > 0) {
      push({
        id: 'sin_responsiva',
        regla: 'sin_responsiva',
        severidad: 'alta',
        titulo: 'Equipos asignados sin responsiva firmada',
        detalle: `${conteo} ${plural(conteo, 'equipo asignado no tiene', 'equipos asignados no tienen')} responsiva firmada (${money(valor)} sin respaldo). GV-INF-008 exige 100%.`,
        conteo,
        valor,
        items: limitar(items),
      })
    }
  }

  // 3) Consumo anómalo (robo hormiga / mal uso) y 8) salidas sin solicitante
  {
    const reciente = DIAS_CONSUMO_RECIENTE * DIA_MS
    const historia = DIAS_CONSUMO_HISTORIA * DIA_MS
    const grupos = new Map()
    const sinSolicitante = []
    let valorSinSolicitante = 0

    listConsumos().forEach((s) => {
      const material = getMaterial(s.materialId)
      if (!material || !enDom(material.familiaId)) return
      if (!enUbi(s.ubicacionDestinoId ?? material.ubicacionId)) return
      const t = tsFecha(s.fecha)
      if (!Number.isFinite(t)) return
      const edad = hoy0 - t
      const v = s.cantidad * (material.costoUnitario || 0)
      const clave = `${s.materialId}|${s.ubicacionDestinoId ?? ''}`
      if (edad >= 0 && edad < reciente) {
        const g = grupos.get(clave) ?? { materialId: s.materialId, destino: s.ubicacionDestinoId, v30: 0, vHist: 0, q30: 0 }
        g.v30 += v
        g.q30 += s.cantidad
        grupos.set(clave, g)
        if (!s.quienSolicito?.trim()) {
          sinSolicitante.push({ texto: `${material.nombre} ×${s.cantidad} ${material.unidadMedida} · ${s.fecha}${s.ubicacionDestinoId ? ` · ${nombreUbicacion(s.ubicacionDestinoId)}` : ''}`, valor: v })
          valorSinSolicitante += v
        }
      } else if (edad >= reciente && edad < reciente + historia) {
        const g = grupos.get(clave) ?? { materialId: s.materialId, destino: s.ubicacionDestinoId, v30: 0, vHist: 0, q30: 0 }
        g.vHist += v
        grupos.set(clave, g)
      }
    })

    const anomalos = [...grupos.values()]
      .filter((g) => {
        const promedio = g.vHist / (DIAS_CONSUMO_HISTORIA / 30)
        if (g.vHist > 0) return g.v30 > FACTOR_CONSUMO_ANOMALO * promedio && g.v30 >= MIN_VALOR_CONSUMO_ANOMALO
        return g.v30 >= MIN_VALOR_CONSUMO_SIN_HISTORIA
      })
      .sort((a, b) => b.v30 - a.v30)
    if (anomalos.length > 0) {
      const valor = anomalos.reduce((s, g) => s + g.v30, 0)
      const items = anomalos.map((g) => {
        const material = getMaterial(g.materialId)
        const promedio = g.vHist / (DIAS_CONSUMO_HISTORIA / 30)
        const comparativo = g.vHist > 0 ? `${money(g.v30)} en 30 días vs. promedio mensual de ${money(promedio)}` : `${money(g.v30)} en 30 días y sin historial previo`
        return { texto: `${material?.nombre ?? 'Material'}${g.destino ? ` → ${nombreUbicacion(g.destino)}` : ''}: ${comparativo}`, ruta: '/mantenimiento' }
      })
      push({
        id: 'consumo_anomalo',
        regla: 'consumo_anomalo',
        severidad: valor >= VALOR_CONSUMO_ALTA ? 'alta' : 'media',
        titulo: 'Consumo de material fuera de lo normal',
        detalle: `${anomalos.length} ${plural(anomalos.length, 'material', 'materiales')} con consumo de los últimos ${DIAS_CONSUMO_RECIENTE} días mayor a ${FACTOR_CONSUMO_ANOMALO}× su promedio mensual (${money(valor)}). Posible robo hormiga o mal uso.`,
        conteo: anomalos.length,
        valor,
        items: limitar(items),
      })
    }

    if (sinSolicitante.length > 0) {
      push({
        id: 'salida_sin_solicitante',
        regla: 'salida_sin_solicitante',
        severidad: 'media',
        titulo: 'Salidas de material sin solicitante',
        detalle: `${sinSolicitante.length} ${plural(sinSolicitante.length, 'salida', 'salidas')} de los últimos ${DIAS_CONSUMO_RECIENTE} días sin registrar quién la solicitó (${money(valorSinSolicitante)}).`,
        conteo: sinSolicitante.length,
        valor: valorSinSolicitante,
        items: limitar(sinSolicitante.map((x) => ({ texto: x.texto, ruta: '/mantenimiento' }))),
      })
    }
  }

  // 4) Sobre máximo (sobre-compra)
  {
    const sobre = listMateriales().filter((m) => enUbi(m.ubicacionId) && enDom(m.familiaId) && m.maximo != null && m.maximo > 0 && m.cantidadActual > m.maximo)
    if (sobre.length > 0) {
      const valor = sobre.reduce((s, m) => s + (m.cantidadActual - m.maximo) * (m.costoUnitario || 0), 0)
      push({
        id: 'sobre_maximo',
        regla: 'sobre_maximo',
        severidad: 'media',
        titulo: 'Materiales por encima del máximo',
        detalle: `${sobre.length} ${plural(sobre.length, 'material excede', 'materiales exceden')} su máximo (${money(valor)} de excedente). No compres más hasta consumir.`,
        conteo: sobre.length,
        valor,
        items: limitar(
          sobre
            .sort((a, b) => b.cantidadActual - b.maximo - (a.cantidadActual - a.maximo))
            .map((m) => ({ texto: `${m.nombre}: ${m.cantidadActual}/${m.maximo} ${m.unidadMedida} · ${nombreUbicacion(m.ubicacionId)}`, ruta: '/mantenimiento' })),
        ),
      })
    }
  }

  // 5) Bajo mínimo (desabasto)
  {
    const bajo = materialesBajoMinimo().filter((m) => enUbi(m.ubicacionId) && enDom(m.familiaId))
    if (bajo.length > 0) {
      const valor = bajo.reduce((s, m) => s + Math.max(0, m.minimo - m.cantidadActual) * (m.costoUnitario || 0), 0)
      push({
        id: 'bajo_minimo',
        regla: 'bajo_minimo',
        severidad: 'media',
        titulo: 'Materiales bajo el mínimo',
        detalle: `${bajo.length} ${plural(bajo.length, 'material está', 'materiales están')} por debajo del mínimo: riesgo de desabasto (reponer ≈ ${money(valor)}).`,
        conteo: bajo.length,
        valor,
        items: limitar(bajo.map((m) => ({ texto: `${m.nombre}: ${m.cantidadActual}/${m.minimo} ${m.unidadMedida} · ${nombreUbicacion(m.ubicacionId)}`, ruta: '/mantenimiento' }))),
      })
    }
  }

  // 6) Pérdidas repetidas por usuario
  {
    const desde = new Date(now)
    desde.setMonth(desde.getMonth() - MESES_PERDIDAS)
    const porUsuario = new Map()
    listCargosPerdida().forEach((c) => {
      if (c.fecha < desde.getTime()) return
      const nombre = c.usuarioAfectado?.trim()
      if (!nombre) return
      if (ubicacionId || dominio) {
        const eq = listEquipos().find((e) => e.id === c.equipoId)
        if (ubicacionId && eq?.ubicacionId !== ubicacionId) return
        if (dominio && !(eq && enDom(eq.familiaId))) return
      }
      const clave = nombre.toLowerCase()
      const g = porUsuario.get(clave) ?? { nombre, n: 0, valor: 0 }
      g.n += 1
      g.valor += c.valorCobrado || 0
      porUsuario.set(clave, g)
    })
    const reincidentes = [...porUsuario.values()].filter((g) => g.n >= MIN_PERDIDAS_REPETIDAS).sort((a, b) => b.valor - a.valor)
    if (reincidentes.length > 0) {
      const valor = reincidentes.reduce((s, g) => s + g.valor, 0)
      push({
        id: 'perdidas_repetidas',
        regla: 'perdidas_repetidas',
        severidad: 'alta',
        titulo: 'Usuarios con pérdidas repetidas',
        detalle: `${reincidentes.length} ${plural(reincidentes.length, 'usuario tiene', 'usuarios tienen')} ${MIN_PERDIDAS_REPETIDAS} o más cargos por pérdida/robo en los últimos ${MESES_PERDIDAS} meses (${money(valor)} cobrados). Revisa el criterio de asignación.`,
        conteo: reincidentes.length,
        valor,
        items: limitar(reincidentes.map((g) => ({ texto: `${g.nombre}: ${g.n} cargos · ${money(g.valor)}`, ruta: '/sistemas' }))),
      })
    }
  }

  // 7) Serie pendiente
  {
    const pendientes = activos.filter((e) => {
      if (!e.numeroSerie?.trim().toUpperCase().startsWith('PENDIENTE-')) return false
      return diasDesde(e.createdAt, now) > DIAS_SERIE_PENDIENTE
    })
    if (pendientes.length > 0) {
      const valor = pendientes.reduce((s, e) => s + (e.costoTotal || 0), 0)
      push({
        id: 'serie_pendiente',
        regla: 'serie_pendiente',
        severidad: 'baja',
        titulo: 'Equipos con número de serie pendiente',
        detalle: `${pendientes.length} ${plural(pendientes.length, 'equipo lleva', 'equipos llevan')} más de ${DIAS_SERIE_PENDIENTE} días con serie provisional: sin serie real no hay trazabilidad ni garantía.`,
        conteo: pendientes.length,
        valor,
        items: limitar(pendientes.map((e) => ({ texto: `${nombreEquipo(e)} (${e.numeroSerie}) · ${nombreUbicacion(e.ubicacionId)}`, ruta: rutaFamilia(e.familiaId) }))),
      })
    }
  }

  // 9) Equipo dañado / en reparación por mucho tiempo
  {
    const movs = listMovimientos()
    const items = []
    let valor = 0
    activos
      .filter((e) => e.estado === 'danado' || e.estado === 'en_reparacion')
      .forEach((e) => {
        // listMovimientos viene del más reciente al más antiguo: el primero que llevó al estado actual.
        const desde = movs.find((m) => m.equipoId === e.id && m.estadoNuevo === e.estado)?.fecha ?? e.updatedAt
        const dias = Math.floor(diasDesde(desde, now))
        if (dias <= DIAS_EQUIPO_DANADO) return
        valor += e.costoTotal || 0
        items.push({
          texto: `${nombreEquipo(e)}${e.numeroSerie && e.modelo ? ` (${e.numeroSerie})` : ''} · ${e.estado === 'danado' ? 'dañado' : 'en reparación'} hace ${dias} días · ${nombreUbicacion(e.ubicacionId)}`,
          ruta: rutaFamilia(e.familiaId),
          dias,
        })
      })
    if (items.length > 0) {
      push({
        id: 'equipo_danado',
        regla: 'equipo_danado',
        severidad: 'media',
        titulo: 'Equipos dañados o en reparación por mucho tiempo',
        detalle: `${items.length} ${plural(items.length, 'equipo lleva', 'equipos llevan')} más de ${DIAS_EQUIPO_DANADO} días dañados o en reparación (${money(valor)} detenidos). Define reparar, dar de baja o reemplazar.`,
        conteo: items.length,
        valor,
        items: limitar(items.sort((a, b) => b.dias - a.dias).map(({ texto, ruta }) => ({ texto, ruta }))),
      })
    }
  }

  // 10) Auditoría vencida (GV-INF-008: trimestral por ubicación)
  {
    const auditorias = listAuditorias().filter((a) => !dominio || a.tipo === dominio)
    const limite = now - DIAS_AUDITORIA * DIA_MS
    const vencidas = [...ubicacionesConInventario(dominio)]
      .filter((id) => enUbi(id))
      .map((id) => ({ id, ultima: ultimaAuditoriaCompletada(id, auditorias) }))
      .filter((u) => u.ultima === undefined || u.ultima < limite)
    if (vencidas.length > 0) {
      const fmt = (t) => new Date(t).toLocaleDateString('es-MX')
      push({
        id: 'auditoria_vencida',
        regla: 'auditoria_vencida',
        severidad: 'media',
        titulo: 'Ubicaciones sin auditoría reciente',
        detalle: `${vencidas.length} ${plural(vencidas.length, 'ubicación con inventario no tiene', 'ubicaciones con inventario no tienen')} una auditoría completada en los últimos ${DIAS_AUDITORIA} días (GV-INF-008).`,
        conteo: vencidas.length,
        items: limitar(
          vencidas
            .sort((a, b) => (a.ultima ?? 0) - (b.ultima ?? 0))
            .map((u) => ({ texto: `${nombreUbicacion(u.id)}: ${u.ultima === undefined ? 'nunca auditada' : `última auditoría ${fmt(u.ultima)}`}`, ruta: '/auditorias' })),
        ),
      })
    }
  }

  // 11) Compras Indirectas (solo para roles con acceso al módulo; respeta la sucursal elegida)
  if (opciones?.incluirCompras) {
    alertasCompras(ubicacionId, now).forEach((a) => push(a))
  }

  // 12) Intentos de borrado (seguridad; solo Dirección y nunca por sucursal). Ver `alertaIntentosBorrado` al final del archivo.
  if (!ubicacionId) {
    const intentos = alertaIntentosBorrado(now)
    if (intentos) push(intentos)
  }

  return alertas.sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad] || (b.valor ?? 0) - (a.valor ?? 0))
}

const redondear = (n) => Math.round(n * 10) / 10

/** Indicadores de los procesos GV-INF-008 y GV-FIN-ADQ-001. `valor: null` = sin datos. */
/** Con `dominio` los indicadores se calculan solo con las auditorías/equipos/materiales de ese dominio (alcance por rol). */
export function getIndicadoresControl(dominio) {
  track()
  const now = Date.now()
  const desde = now - DIAS_AUDITORIA * DIA_MS
  const indicadores = []

  const crear = (id, nombre, meta, hechos, total, detalleConDatos, detalleSinDatos) => {
    if (total <= 0) {
      indicadores.push({ id, nombre, valor: null, meta, unidad: '%', cumple: null, detalle: detalleSinDatos })
      return
    }
    const pct = (hechos / total) * 100
    indicadores.push({ id, nombre, valor: redondear(pct), meta, unidad: '%', cumple: pct >= meta, detalle: detalleConDatos })
  }

  // 1) Exactitud del inventario (registro vs físico) — auditorías completadas en 90 días
  {
    const completadas = listAuditorias().filter((a) => (!dominio || a.tipo === dominio) && a.estado === 'completada' && (a.fechaCierre ?? a.fechaInicio) >= desde)
    let total = 0
    let bien = 0
    completadas.forEach((a) => {
      listItems(a.id).forEach((i) => {
        if (i.tipo === 'equipo') {
          if (i.encontrado === undefined) return
          total += 1
          if (i.encontrado && (i.condicion === undefined || i.condicion === 'bien')) bien += 1
        } else {
          if (i.cantidadContada == null) return
          total += 1
          if (i.cantidadEsperada != null && i.cantidadContada === i.cantidadEsperada) bien += 1
        }
      })
    })
    crear(
      'exactitud_inventario',
      'Exactitud del inventario',
      META_EXACTITUD,
      bien,
      total,
      `${bien} de ${total} partidas auditadas coinciden con el registro (${completadas.length} ${plural(completadas.length, 'auditoría', 'auditorías')} en ${DIAS_AUDITORIA} días). Meta trimestral ≥ ${META_EXACTITUD}%.`,
      `Sin auditorías completadas en los últimos ${DIAS_AUDITORIA} días. Meta trimestral ≥ ${META_EXACTITUD}%.`,
    )
  }

  // 2) % de equipos asignados con responsiva firmada
  {
    const asignados = listEquipos().filter((e) => e.estado === 'asignado' && (!dominio || getFamilia(e.familiaId)?.tipo === dominio))
    const firmados = asignados.filter(tieneResponsivaFirmada).length
    crear(
      'responsivas_firmadas',
      'Equipos asignados con responsiva firmada',
      META_RESPONSIVAS,
      firmados,
      asignados.length,
      `${firmados} de ${asignados.length} equipos asignados tienen la responsiva firmada adjunta. Meta ${META_RESPONSIVAS}%.`,
      'No hay equipos asignados.',
    )
  }

  // 3) % de ubicaciones (con inventario) auditadas en 90 días
  {
    const auditorias = listAuditorias().filter((a) => !dominio || a.tipo === dominio)
    const ubicaciones = [...ubicacionesConInventario(dominio)]
    const auditadas = ubicaciones.filter((id) => {
      const ult = ultimaAuditoriaCompletada(id, auditorias)
      return ult !== undefined && ult >= desde
    }).length
    crear(
      'sucursales_auditadas',
      'Sucursales auditadas en 90 días',
      META_SUCURSALES_AUDITADAS,
      auditadas,
      ubicaciones.length,
      `${auditadas} de ${ubicaciones.length} ubicaciones con inventario cuentan con auditoría completada en ${DIAS_AUDITORIA} días. Meta ${META_SUCURSALES_AUDITADAS}%.`,
      'No hay ubicaciones con inventario.',
    )
  }

  // 4) % de materiales dentro de mín/máx (GV-FIN-ADQ-001: disponibilidad y compras dentro de máximos)
  {
    const controlados = listMateriales().filter((m) => (!dominio || getFamilia(m.familiaId)?.tipo === dominio) && (m.minimo > 0 || (m.maximo != null && m.maximo > 0)))
    const enRango = controlados.filter((m) => m.cantidadActual >= m.minimo && (m.maximo == null || m.maximo <= 0 || m.cantidadActual <= m.maximo)).length
    crear(
      'materiales_en_rango',
      'Materiales dentro de mínimo y máximo',
      META_MATERIALES_EN_RANGO,
      enRango,
      controlados.length,
      `${enRango} de ${controlados.length} materiales con mínimo/máximo definido están dentro de rango. Meta ≥ ${META_MATERIALES_EN_RANGO}%.`,
      'No hay materiales con mínimo o máximo definido.',
    )
  }

  return indicadores
}

// ---------------------------------------------------------------------------------------------------------------------
// Seguridad: intentos de borrado (migración 021). Regla solo para Dirección (admin); los imports van aquí para no tocar el encabezado.
// ---------------------------------------------------------------------------------------------------------------------
import { listBitacora, ACCION_INTENTO_BORRADO } from '../bitacora'
import { user } from '../auth'

/** Ventana (días) de la regla "Intentos de borrado". */
export const DIAS_INTENTOS_BORRADO = 30

/**
 * "Intentos de borrado": alguien intentó borrar un registro (la base lo cancela, lo anota en la bitácora y avisa a Dirección por
 * correo). Severidad ALTA; solo la ve Dirección (admin). Cuenta las entradas `intento_borrado` de los últimos 30 días.
 */
export function alertaIntentosBorrado(now = Date.now()) {
  track()
  if (user.value?.role !== 'admin') return null
  const lista = listBitacora({ accion: ACCION_INTENTO_BORRADO, desde: now - DIAS_INTENTOS_BORRADO * DIA_MS })
  if (lista.length === 0) return null
  const tablaCorta = (t) => t.replace(/^(inv|cmp)_/, '').replace(/_/g, ' ')
  const campo = (o, claves) => {
    if (!o || typeof o !== 'object') return undefined
    for (const k of claves) {
      const v = o[k]
      if (typeof v === 'string' && v) return v
    }
    return undefined
  }
  const items = lista.map((e) => {
    const ref = campo(e.antes, ['modelo', 'nombre', 'folio', 'producto', 'descripcion']) ?? e.registroId
    const rol = campo(e.despues, ['rol'])
    const cuando = new Date(e.fecha).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    return { texto: `${e.usuario}${rol ? ` (${rol})` : ''} intentó borrar ${tablaCorta(e.tabla)} · ${ref} · ${cuando}`, ruta: `/bitacora?accion=${ACCION_INTENTO_BORRADO}` }
  })
  const personas = new Set(lista.map((e) => e.usuario)).size
  return {
    id: 'intentos_borrado',
    regla: 'intentos_borrado',
    severidad: 'alta',
    titulo: 'Intentos de borrado',
    detalle: `${lista.length} ${plural(lista.length, 'intento', 'intentos')} de borrar registros en los últimos ${DIAS_INTENTOS_BORRADO} días (${personas} ${plural(personas, 'persona', 'personas')}). Nada se borró: cada registro sigue intacto. Revisa quién y por qué en la Bitácora.`,
    conteo: lista.length,
    origen: 'inventario',
    items: limitar(items),
  }
}
