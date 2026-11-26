/**
 * Utilidades compartidas de las pantallas internas de Compras Indirectas (tablero, detalle, recepciones).
 * Solo usa la API pública de `src/lib/compras` (nunca toca tablas).
 */
import {
  esAbierta,
  estadoAutorizacion,
  estadoDiferencia,
  destinoDePago,
  formatoMoneda,
  getHistorial,
  listCotizaciones,
  listPartidas,
  montoElegido,
  recepcionesPendientes,
  resumenDinero,
  totalCotizacion,
  destinoDeCategoria,
} from 'src/lib/compras'
import { getUbicacion } from 'src/lib/inventario/comunes'
import { todayLocalDateString } from 'src/lib/dateUtils'

export const DIA = 86400000

/**
 * @typedef {'resumen' | 'cotizaciones' | 'autorizacion' | 'dinero' | 'compra' | 'entrega' | 'historial' |
 *   'correos'} TabRequisicion
 */

// ---- Clases de botones (mismo aspecto que el resto de la app) -----------------------------------------------------------
export const btn = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover disabled:opacity-60'
export const btnPrimary = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-vz-blue px-3.5 text-[13px] font-bold text-white hover:bg-primary-hover disabled:opacity-60'
export const btnOk = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-vz-success px-3.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60'
export const btnDanger = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-vz-danger/40 bg-vz-danger/10 px-3 text-[13px] font-bold text-vz-danger hover:bg-vz-danger/20 disabled:opacity-60'
export const btnWarn = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-vz-warning/40 bg-vz-warning/10 px-3 text-[13px] font-bold text-vz-warning hover:bg-vz-warning/20 disabled:opacity-60'
export const btnMini = 'rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-hover disabled:opacity-60'

// ---- Fechas -----------------------------------------------------------------------------------------------------------
const fmtFecha = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtFechaHora = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function fechaCorta(ms) {
  return ms ? fmtFecha.format(new Date(ms)) : '—'
}
export function fechaHora(ms) {
  return ms ? fmtFechaHora.format(new Date(ms)) : '—'
}
/** AAAA-MM-DD → "21 oct 2026" (en hora local, sin correr el día). */
export function fechaISOTexto(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return fmtFecha.format(new Date(y, m - 1, d))
}
export function diasDesde(ms, ref = Date.now()) {
  return Math.max(0, Math.floor((ref - ms) / DIA))
}
/** 35 min · 5 h · 3 d 4 h */
export function duracionCorta(ms) {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  const rest = h % 24
  return rest ? `${d} d ${rest} h` : `${d} d`
}
export function diasTexto(n) {
  return `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} d`
}

export function ubicacionesTexto(ids) {
  return ids.map((u) => getUbicacion(u)?.nombre ?? u).join(', ')
}

// ---- Destino de inventario ---------------------------------------------------------------------------------------------
export const DESTINO_LABEL = { ti: 'Inventario TI', mantenimiento: 'Inventario Mantenimiento', ninguno: 'Sin inventario' }
export const DESTINO_TONO = { ti: 'info', mantenimiento: 'warning', ninguno: 'neutral' }

/** Destinos que toca una requisición (según las categorías de sus partidas). */
export function destinosDe(folio) {
  return new Set(listPartidas(folio).map((p) => destinoDeCategoria(p.categoriaId)))
}

// ---- Montos y actividad ------------------------------------------------------------------------------------------------
/**
 * @typedef {object} MontoReferencia
 * @property {number} monto
 * @property {'autorizado' | 'elegido' | 'cotizado' | 'ninguno'} tipo
 */
/** Monto a mostrar de una requisición: autorizado > cotización elegida > la cotización completa más barata. */
export function montoReferencia(r) {
  if (r.montoAutorizado && r.montoAutorizado > 0) return { monto: r.montoAutorizado, tipo: 'autorizado' }
  const elegido = montoElegido(r.folio)
  if (elegido > 0) return { monto: elegido, tipo: 'elegido' }
  const partidas = listPartidas(r.folio)
  const totales = listCotizaciones(r.folio)
    .map((c) => totalCotizacion(c.id))
    .filter((t) => t > 0)
  if (totales.length > 0 && partidas.length > 0) return { monto: Math.min(...totales), tipo: 'cotizado' }
  return { monto: 0, tipo: 'ninguno' }
}
export const MONTO_TIPO_TEXTO = {
  autorizado: 'Autorizado',
  elegido: 'Cotización elegida',
  cotizado: 'Mejor cotización',
  ninguno: 'Sin monto',
}

export function ultimaActividad(r) {
  const h = getHistorial(r.folio)
  return Math.max(r.updatedAt, h.length ? h[h.length - 1].fecha : 0)
}

/** Fecha en que la requisición llegó a un estado por última vez. */
export function fechaDeEstado(folio, estado) {
  const h = getHistorial(folio).filter((x) => x.aEstado === estado)
  return h.length ? h[h.length - 1].fecha : undefined
}

/** Tiempo de ciclo (creación → entregada) en ms, si ya se entregó. */
export function cicloMs(r) {
  if (r.estado !== 'entregada') return undefined
  const f = fechaDeEstado(r.folio, 'entregada')
  return f ? Math.max(0, f - r.createdAt) : undefined
}

// ---- Alertas de tarjeta -----------------------------------------------------------------------------------------------
/**
 * @typedef {object} AlertaReq
 * @property {string} id
 * @property {string} label
 * @property {PillTone} tono
 * @property {string} title
 */

/** `conDinero = false` (custodios) omite las alertas que revelan montos o dinero (cotizaciones, autorización, diferencias, comprobación). */
export function alertasDe(r, conDinero = true) {
  const out = []
  const abierta = esAbierta(r.estado)
  if (abierta && r.urgencia === 'urgente') out.push({ id: 'urgente', label: 'Urgente', tono: 'danger', title: 'Marcada como urgente' })
  if (abierta && r.fechaRequerida && r.fechaRequerida < todayLocalDateString()) out.push({ id: 'vencida', label: 'Vencida', tono: 'danger', title: `Pasó la fecha requerida (${fechaISOTexto(r.fechaRequerida)})` })
  if (abierta && r.estado !== 'en_espera') {
    const sin = diasDesde(ultimaActividad(r))
    if (sin > 3) out.push({ id: 'sin_movimiento', label: `${sin} d sin mov.`, tono: 'warning', title: `Sin movimiento hace ${sin} días` })
  }
  if (r.estado === 'en_espera') out.push({ id: 'espera', label: 'En espera', tono: 'neutral', title: 'Detenida con un motivo' })
  if (r.estado === 'en_cotizacion' && listCotizaciones(r.folio).length === 0) out.push({ id: 'sin_cotizaciones', label: 'Sin cotizaciones', tono: 'warning', title: 'Aún no se registra ninguna cotización' })
  if (r.estado === 'en_autorizacion') {
    const est = estadoAutorizacion(r.folio)
    if (est.avisaDireccion) out.push({ id: 'direccion', label: 'Aviso a Dirección', tono: 'info', title: `El monto rebasa ${formatoMoneda(est.umbralDireccion)}: Dirección recibe un aviso informativo (no aprueba; la autoriza Finanzas)` })
    if (est.monto > 0 && est.elegibles.length === 0) out.push({ id: 'sin_aprobador', label: 'Sin aprobador', tono: 'danger', title: 'Ningún aprobador activo de Finanzas tiene un tope que cubra este monto' })
  }
  if (r.estado === 'comprada' && estadoDiferencia(r.folio) === 'pendiente_finanzas') out.push({ id: 'diferencia', label: 'Diferencia', tono: 'danger', title: 'Lo comprado rebasa lo autorizado: pendiente de Finanzas' })
  if (r.estado === 'comprada' || r.estado === 'entregada') {
    const d = resumenDinero(r.folio)
    if (d.pendienteComprobar > 0) out.push({ id: 'sin_comprobar', label: 'Sin comprobar', tono: 'warning', title: `Falta comprobar ${formatoMonedaCorta(d.pendienteComprobar)}` })
    if (d.pendienteDevolver > 0) out.push({ id: 'cambio', label: 'Cambio sin devolver', tono: 'warning', title: `Falta devolver ${formatoMonedaCorta(d.pendienteDevolver)} a Tesorería` })
  }
  return conDinero ? out : out.filter((a) => !['sin_cotizaciones', 'direccion', 'sin_aprobador', 'diferencia', 'sin_comprobar', 'cambio'].includes(a.id))
}

const fmtMoneda0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
export function formatoMonedaCorta(n) {
  return fmtMoneda0.format(n)
}

// ---- "Mis pendientes" por rol ------------------------------------------------------------------------------------------
/** ¿La requisición espera una acción de este rol? */
export function esMiPendiente(r, rol) {
  if (!rol || !esAbierta(r.estado)) return false
  switch (rol) {
    case 'adquisiciones':
      return r.estado === 'recibida' || r.estado === 'en_cotizacion' || r.estado === 'fondeada'
    case 'finanzas':
      return r.estado === 'en_autorizacion' || (r.estado === 'comprada' && estadoDiferencia(r.folio) === 'pendiente_finanzas')
    case 'cuentas_por_pagar':
      // Pagos por hacer: autorizadas por transferencia o tarjeta (el pago aún no se registra).
      return r.estado === 'autorizada' && destinoDePago(r.formaPago) === 'cuentas_por_pagar'
    case 'tesoreria': {
      if (destinoDePago(r.formaPago) !== 'tesoreria') return false
      if (r.estado === 'autorizada') return true
      if (r.estado === 'fondeada' || r.estado === 'comprada') {
        const d = resumenDinero(r.folio)
        return d.pendienteComprobar > 0 || d.pendienteDevolver > 0
      }
      return false
    }
    case 'capturista':
      return recepcionesPendientes('ti').some((x) => x.folio === r.folio)
    case 'mantenimiento':
      return recepcionesPendientes('mantenimiento').some((x) => x.folio === r.folio)
    case 'admin':
      return r.estado === 'en_autorizacion' || r.estado === 'recibida' || (r.estado === 'comprada' && estadoDiferencia(r.folio) === 'pendiente_finanzas')
    default:
      return false
  }
}

export function esArchivoImagen(url) {
  if (!url) return false
  return url.startsWith('data:image') || /\.(png|jpe?g|webp|gif|bmp|heic)(\?|$)/i.test(url)
}
