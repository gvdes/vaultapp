import { registrarBitacora } from '../bitacora'
import { user } from '../auth'
import { canFundCaja, canRegistrarPago } from '../access'
import { FORMA_PAGO_LABEL, destinoDePago, formatoMoneda, r2 } from './tipos'
import { crearTabla, nuevoId, ahora, usuarioActual } from './store'
import { actualizarRequisicion, cambiarEstado, getRequisicion, registrarHookTransicion, registrarValidadorTransicion } from './requisiciones'
import { totalComprado } from './compras'

/**
 * Dinero de la compra (APPEND-ONLY): solicitud automática al autorizarse, entrega de efectivo (folio de caja chica + familia/tipo de gasto +
 * quién recibe), pago por transferencia o con tarjeta, comprobación (foto del ticket/factura) y devolución del cambio.
 *
 * RUTEO por forma de pago de la requisición (catálogo de proveedores): efectivo → Tesorería (entrega de efectivo, flujo de caja chica);
 * transferencia → Cuentas por pagar (movimiento `transferencia`: referencia, fecha y comprobante); tarjeta → Cuentas por pagar (movimiento
 * `pago_tarjeta`: SOLO los últimos 4 dígitos como referencia, nunca el número completo). Tesorería no registra transferencias ni tarjeta, y
 * Cuentas por pagar no entrega efectivo. Los movimientos nunca se editan ni se borran; una corrección es un movimiento nuevo.
 */
const tDinero = crearTabla({
  key: 'dga_cmp_dinero',
  tabla: 'cmp_dinero',
  pk: 'id',
  ts: ['fecha'],
  num: ['monto'],
  orderBy: 'fecha',
})

export const loadDineroCache = () => tDinero.load()
export const isDineroCacheReady = () => tDinero.isReady()
export function reiniciarDineroLocal() {
  tDinero.reiniciarLocal()
}

export function listMovimientosDinero(folio, tipo) {
  let list = tDinero.list()
  if (folio) list = list.filter((m) => m.folio === folio)
  if (tipo) list = list.filter((m) => m.tipo === tipo)
  return [...list].sort((a, b) => a.fecha - b.fecha)
}

async function insertar(m, detalle) {
  const mov = { id: `din-${nuevoId()}`, fecha: ahora(), ...m }
  await tDinero.insert(mov)
  registrarBitacora({ tabla: 'cmp_dinero', registroId: mov.id, accion: 'alta', despues: { ...mov, archivoUrl: mov.archivoUrl ? '[comprobante]' : undefined }, detalle })
  return mov
}

/** Solicitud de fondos / de pago por el monto aprobado a quien corresponde según la forma de pago (se crea sola al autorizarse; es idempotente). */
export async function solicitarFondos(folio, opts = {}) {
  const req = getRequisicion(folio)
  if (!req) throw new Error('Requisición no encontrada.')
  if (listMovimientosDinero(folio, 'solicitud').length > 0) return undefined
  const monto = req.montoAutorizado ?? 0
  const usuario = opts.usuario ?? usuarioActual()
  const aCxp = destinoDePago(req.formaPago) === 'cuentas_por_pagar'
  return insertar(
    {
      folio,
      tipo: 'solicitud',
      monto,
      notas: aCxp ? `Solicitud automática de pago a Cuentas por pagar al autorizarse la compra (${FORMA_PAGO_LABEL[req.formaPago]})` : 'Solicitud automática de fondos al autorizarse la compra',
      registradoPor: usuario,
    },
    `${usuario} solicitó ${formatoMoneda(monto)} a ${aCxp ? 'Cuentas por pagar' : 'Tesorería'} para ${folio}`,
  )
}

/**
 * @typedef {object} EntregaInput
 * @property {string} folio
 * @property {number} monto
 * @property {string} folioCajaChica
 * @property {string} familiaGasto - Familia / tipo de gasto (caja chica).
 * @property {string} receptor - Colaborador que recibe el efectivo.
 * @property {string} [notas]
 * @property {string} [usuario]
 */

/** Tesorería registra la entrega del efectivo (solo compras con forma de pago efectivo) y la requisición pasa a "Fondeada". */
export async function registrarEntregaEfectivo(input) {
  const rol = user.value?.role
  if (rol && !canFundCaja(rol)) throw new Error('Solo Tesorería registra la entrega de efectivo (Cuentas por pagar paga las transferencias y la tarjeta).')
  const req = exigirParaEntrega(input.folio, input.monto, 'efectivo')
  if (!input.folioCajaChica.trim()) throw new Error('Captura el folio de caja chica.')
  if (!input.familiaGasto.trim()) throw new Error('Captura la familia / tipo de gasto.')
  if (!input.receptor.trim()) throw new Error('Indica quién recibe el efectivo.')
  const usuario = input.usuario ?? usuarioActual()
  const mov = await insertar(
    {
      folio: input.folio,
      tipo: 'entrega_efectivo',
      monto: r2(input.monto),
      folioCajaChica: input.folioCajaChica.trim(),
      familiaGasto: input.familiaGasto.trim(),
      receptor: input.receptor.trim(),
      notas: input.notas?.trim() || undefined,
      registradoPor: usuario,
    },
    `${usuario} entregó ${formatoMoneda(input.monto)} en efectivo a ${input.receptor.trim()} (${input.folio}, caja chica ${input.folioCajaChica.trim()})`,
  )
  await actualizarRequisicion(req.folio, { folioCajaChica: mov.folioCajaChica, familiaGasto: mov.familiaGasto, receptorEfectivo: mov.receptor }, { usuario })
  await cambiarEstado(req.folio, 'fondeada', { usuario, comentario: `Efectivo entregado a ${mov.receptor} · caja chica ${mov.folioCajaChica}` })
  return mov
}

/**
 * @typedef {object} PagoInput
 * @property {string} folio
 * @property {number} monto
 * @property {string} referencia - Transferencia: folio / clave de rastreo. Tarjeta: los ÚLTIMOS 4 dígitos de la tarjeta.
 * @property {string} archivoUrl - Comprobante del pago (imagen o PDF).
 * @property {string} [fechaPago] - AAAA-MM-DD (por omisión, hoy).
 * @property {string} [receptor] - Beneficiario (por omisión, el proveedor de la requisición).
 * @property {string} [notas]
 * @property {string} [usuario]
 */

/** Fecha de pago AAAA-MM-DD → ms (mediodía local, sin pasarse de «ahora»); undefined = ahora. */
function fechaDePago(iso) {
  if (!iso) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error('La fecha de pago no es válida.')
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime()
  const hoy = new Date(ahora())
  const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59).getTime()
  if (ms > finHoy) throw new Error('La fecha de pago no puede ser futura.')
  return Math.min(ms, ahora())
}

async function registrarPago(tipo, input, referencia, notaExtra) {
  const rol = user.value?.role
  if (rol && !canRegistrarPago(rol)) throw new Error('Solo Cuentas por pagar registra los pagos por transferencia o tarjeta (Tesorería solo entrega efectivo).')
  const req = exigirParaEntrega(input.folio, input.monto, tipo === 'transferencia' ? 'transferencia' : 'tarjeta')
  if (!input.archivoUrl) throw new Error('Adjunta el comprobante del pago (imagen o PDF).')
  const fecha = fechaDePago(input.fechaPago)
  const usuario = input.usuario ?? usuarioActual()
  const receptor = input.receptor?.trim() || req.proveedorElegido || undefined
  if (referencia.length > 100) throw new Error('La referencia es demasiado larga (máximo 100 caracteres).')
  const notas = [notaExtra, input.notas?.trim()].filter(Boolean).join(' · ') || undefined
  const mov = await insertar(
    {
      folio: input.folio,
      tipo,
      monto: r2(input.monto),
      referencia, // columna propia de cmp_dinero (folio_caja_chica queda solo para efectivo)
      receptor,
      archivoUrl: input.archivoUrl,
      notas,
      registradoPor: usuario,
      ...(fecha !== undefined ? { fecha } : {}),
    },
    `${usuario} registró ${tipo === 'transferencia' ? 'una transferencia' : 'un pago con tarjeta'} de ${formatoMoneda(input.monto)} (${input.folio})`,
  )
  await cambiarEstado(req.folio, 'fondeada', {
    usuario,
    comentario: tipo === 'transferencia' ? `Transferencia registrada por Cuentas por pagar · ref. ${referencia}` : `Pago con tarjeta registrado por Cuentas por pagar · terminación ${referencia}`,
  })
  return mov
}

/** Cuentas por pagar registra la transferencia (referencia, fecha y comprobante) y la requisición pasa a "Fondeada". */
export async function registrarTransferencia(input) {
  const ref = input.referencia?.trim()
  if (!ref) throw new Error('Captura el folio o la clave de rastreo de la transferencia.')
  return registrarPago('transferencia', input, ref, undefined)
}

/** Cuentas por pagar registra el pago con tarjeta: SOLO los últimos 4 dígitos como referencia (nunca el número completo); la requisición pasa a "Fondeada". */
export async function registrarPagoTarjeta(input) {
  const ult = (input.referencia ?? '').trim()
  if (!/^[0-9]{4}$/.test(ult)) throw new Error('Captura solo los ÚLTIMOS 4 dígitos de la tarjeta (nunca el número completo).')
  return registrarPago('pago_tarjeta', input, ult, `Tarjeta terminación ${ult}`)
}

/** Exige que la requisición esté autorizada, que el monto sea válido y que la forma de pago sea la del movimiento (ruteo por forma de pago). */
function exigirParaEntrega(folio, monto, forma) {
  const req = getRequisicion(folio)
  if (!req) throw new Error('Requisición no encontrada.')
  if (req.estado !== 'autorizada') throw new Error('Solo se entrega dinero de requisiciones autorizadas (por fondear).')
  const formaReq = req.formaPago ?? 'efectivo'
  if (forma === 'efectivo' && formaReq !== 'efectivo') throw new Error(`Esta compra se paga por ${FORMA_PAGO_LABEL[formaReq].toLowerCase()}: la registra Cuentas por pagar, no Tesorería.`)
  if (forma !== 'efectivo' && formaReq !== forma) {
    throw new Error(formaReq === 'efectivo' ? 'Esta compra se paga en efectivo: la entrega Tesorería, no Cuentas por pagar.' : `Esta compra se paga por ${FORMA_PAGO_LABEL[formaReq].toLowerCase()}: registra ese tipo de pago.`)
  }
  if (!(monto > 0)) throw new Error('El monto debe ser mayor a cero.')
  if (monto > (req.montoAutorizado ?? 0) + 0.005) {
    throw new Error(`El monto (${formatoMoneda(monto)}) rebasa lo autorizado (${formatoMoneda(req.montoAutorizado)}). Pide la re-aprobación.`)
  }
  return req
}

/** Comprobación del gasto: foto del ticket/factura y monto comprobado. */
export async function registrarComprobacion(input) {
  const req = getRequisicion(input.folio)
  if (!req) throw new Error('Requisición no encontrada.')
  if (!(req.estado === 'fondeada' || req.estado === 'comprada' || req.estado === 'entregada')) throw new Error('Solo se comprueba el gasto de requisiciones fondeadas o compradas.')
  if (!(input.monto > 0)) throw new Error('El monto comprobado debe ser mayor a cero.')
  if (!input.archivoUrl) throw new Error('Adjunta la foto del ticket o factura.')
  const usuario = input.usuario ?? usuarioActual()
  return insertar(
    { folio: input.folio, tipo: 'comprobacion', monto: r2(input.monto), archivoUrl: input.archivoUrl, notas: input.notas?.trim() || undefined, registradoPor: usuario },
    `${usuario} comprobó ${formatoMoneda(input.monto)} de ${input.folio}`,
  )
}

/** Devolución del cambio a Tesorería (efectivo no gastado). */
export async function registrarDevolucionCambio(input) {
  const req = getRequisicion(input.folio)
  if (!req) throw new Error('Requisición no encontrada.')
  if (!(input.monto >= 0)) throw new Error('El monto devuelto no es válido.')
  const usuario = input.usuario ?? usuarioActual()
  return insertar(
    { folio: input.folio, tipo: 'devolucion_cambio', monto: r2(input.monto), notas: input.notas?.trim() || undefined, registradoPor: usuario },
    `${usuario} registró la devolución de cambio de ${formatoMoneda(input.monto)} (${input.folio})`,
  )
}

/**
 * @typedef {object} ResumenDinero
 * @property {string} folio
 * @property {number} autorizado
 * @property {number} solicitado
 * @property {number} entregado - Efectivo entregado por Tesorería o pago hecho por Cuentas por pagar (transferencia / tarjeta).
 * @property {number} gastado - Lo realmente comprado (costos reales de cmp_compras).
 * @property {number} comprobado
 * @property {number} cambioDevuelto
 * @property {number} cambioEsperado - Cambio que debería regresar a Tesorería: entregado - gastado (si es positivo); solo en efectivo.
 * @property {number} pendienteComprobar - Gasto sin comprobar: gastado - comprobado (si es positivo).
 * @property {number} pendienteDevolver - Cambio que aún no regresa: cambioEsperado - cambioDevuelto (si es positivo).
 * @property {number} gastoExcedeEntregado - Se gastó más de lo entregado (faltó dinero / se puso de bolsa propia).
 * @property {string[]} alertas
 */

/** Diferencia autorizado vs entregado vs gastado vs comprobado (y cambio devuelto). */
export function resumenDinero(folio) {
  const req = getRequisicion(folio)
  const movs = listMovimientosDinero(folio)
  const suma = (t) => r2(movs.filter((m) => t.includes(m.tipo)).reduce((s, m) => s + m.monto, 0))
  const autorizado = req?.montoAutorizado ?? 0
  const entregado = suma(['entrega_efectivo', 'transferencia', 'pago_tarjeta'])
  const gastado = totalComprado(folio)
  const comprobado = suma(['comprobacion'])
  const cambioDevuelto = suma(['devolucion_cambio'])
  // Solo el EFECTIVO deja cambio por devolver a caja; lo pagado por transferencia o tarjeta va directo al proveedor.
  const cambioEsperado = (req?.formaPago ?? 'efectivo') === 'efectivo' ? Math.max(0, r2(entregado - gastado)) : 0
  const pendienteComprobar = Math.max(0, r2(gastado - comprobado))
  const pendienteDevolver = Math.max(0, r2(cambioEsperado - cambioDevuelto))
  const gastoExcedeEntregado = Math.max(0, r2(gastado - entregado))
  const alertas = []
  if (entregado > autorizado + 0.005 && autorizado > 0) alertas.push('Se entregó más de lo autorizado.')
  if (gastoExcedeEntregado > 0 && entregado > 0) alertas.push(`Se gastó ${formatoMoneda(gastoExcedeEntregado)} más de lo entregado.`)
  if (pendienteComprobar > 0 && gastado > 0) alertas.push(`Falta comprobar ${formatoMoneda(pendienteComprobar)} de gasto.`)
  if (pendienteDevolver > 0 && gastado > 0) alertas.push(`Falta devolver ${formatoMoneda(pendienteDevolver)} de cambio a Tesorería.`)
  if (cambioDevuelto > cambioEsperado + 0.005 && gastado > 0) alertas.push('Se devolvió más cambio del esperado: revisa los costos registrados.')
  return {
    folio,
    autorizado,
    solicitado: suma(['solicitud']),
    entregado,
    gastado,
    comprobado,
    cambioDevuelto,
    cambioEsperado,
    pendienteComprobar,
    pendienteDevolver,
    gastoExcedeEntregado,
    alertas,
  }
}

// Requisito para entrar a "Fondeada" (espejo de cmp_requisitos_estado): se registró la entrega de efectivo (Tesorería) o el pago (Cuentas por pagar)
// que corresponde a la forma de pago de la compra.
registrarValidadorTransicion((req, a) => {
  if (a !== 'fondeada') return null
  const forma = req.formaPago ?? 'efectivo'
  const tipo = forma === 'efectivo' ? 'entrega_efectivo' : forma === 'transferencia' ? 'transferencia' : 'pago_tarjeta'
  if (listMovimientosDinero(req.folio).some((m) => m.tipo === tipo)) return null
  return forma === 'efectivo' ? 'Tesorería aún no registra la entrega del dinero.' : `Cuentas por pagar aún no registra el pago (${FORMA_PAGO_LABEL[forma].toLowerCase()}).`
})

// Al autorizarse (desde este cliente) se solicita automáticamente el dinero (a Tesorería, o a Cuentas por pagar si es transferencia / tarjeta).
registrarHookTransicion(async ({ folio, a, usuario }) => {
  if (a === 'autorizada') await solicitarFondos(folio, { usuario })
})
