import { registrarBitacora, cambios } from '../bitacora'
import { formatoMoneda, r2 } from './tipos'
import { crearTabla, nuevoId, ahora, usuarioActual } from './store'
import { getConfig } from './config'
import { actualizarRequisicion, cambiarEstado, getRequisicion, listPartidas, registrarValidadorTransicion } from './requisiciones'
import { cotizacionElegida, preciosDe } from './cotizaciones'
import { alertarFinanzas, plantillaAlertaDiferencia } from './outbox'

/**
 * Lo que REALMENTE se compró por partida (costo real, proveedor, factura/ticket) — lo registra Adquisiciones.
 * Marca cuando lo comprado rebasa lo autorizado (tolerancia configurable, 0% por defecto de ejemplo): exige justificación
 * al cerrar la compra, avisa a Finanzas y queda pendiente su re-aprobación (ver `aprobarDiferencia` en aprobaciones.js).
 */
const tCompras = crearTabla({
  key: 'dga_cmp_compras',
  tabla: 'cmp_compras',
  pk: 'id',
  ts: ['fecha'],
  num: ['cantidadComprada', 'costoUnitarioReal'],
  orderBy: 'fecha',
})

export const loadComprasRealesCache = () => tCompras.load()
export const isComprasRealesCacheReady = () => tCompras.isReady()
export function reiniciarComprasRealesLocal() {
  tCompras.reiniciarLocal()
}

export function listCompras(folio) {
  const list = tCompras.list()
  return [...(folio ? list.filter((c) => c.folio === folio) : list)].sort((a, b) => a.fecha - b.fecha)
}

export function getCompra(id) {
  return id ? tCompras.get(id) : undefined
}

export function totalComprado(folio) {
  return r2(listCompras(folio).reduce((s, c) => s + c.cantidadComprada * c.costoUnitarioReal, 0))
}

/**
 * @typedef {object} CompraInput
 * @property {string} folio
 * @property {string} partidaId
 * @property {number} cantidadComprada
 * @property {number} costoUnitarioReal
 * @property {string} [proveedor]
 * @property {string} [numeroFactura]
 * @property {string} [ticketUrl]
 * @property {number} [fecha]
 * @property {string} [registradoPor]
 */

/** Registra lo comprado de una partida (la requisición debe estar fondeada: el dinero ya se entregó). */
export async function registrarCompra(input) {
  const req = getRequisicion(input.folio)
  if (!req) throw new Error('Requisición no encontrada.')
  if (req.estado !== 'fondeada') throw new Error('Solo se registran compras cuando la requisición está fondeada (ya se entregó el dinero o se registró el pago).')
  const partida = listPartidas(input.folio).find((p) => p.id === input.partidaId)
  if (!partida) throw new Error('La partida no pertenece a esta requisición.')
  if (!(input.cantidadComprada > 0)) throw new Error('La cantidad comprada debe ser mayor a cero.')
  if (!(input.costoUnitarioReal >= 0)) throw new Error('El costo unitario real no es válido.')
  const usuario = input.registradoPor ?? usuarioActual()
  const antesExcede = excedeAutorizado(input.folio)
  const c = {
    id: `compra-${nuevoId()}`,
    folio: input.folio,
    partidaId: input.partidaId,
    cantidadComprada: input.cantidadComprada,
    costoUnitarioReal: input.costoUnitarioReal,
    proveedor: input.proveedor?.trim() || req.proveedorElegido || undefined,
    numeroFactura: input.numeroFactura?.trim() || undefined,
    ticketUrl: input.ticketUrl || undefined,
    fecha: input.fecha ?? ahora(),
    registradoPor: usuario,
  }
  await tCompras.insert(c)
  registrarBitacora({
    tabla: 'cmp_compras',
    registroId: c.id,
    accion: 'alta',
    despues: { ...c, ticketUrl: c.ticketUrl ? '[comprobante]' : undefined },
    detalle: `${usuario} registró la compra de ${c.cantidadComprada} × ${partida.producto} (${req.folio})`,
  })
  const r = resumenCompra(input.folio)
  if (r.excede && !antesExcede) {
    await alertarFinanzas(req, plantillaAlertaDiferencia(req, r.autorizado, r.totalReal))
  }
  return c
}

/** Corrige una compra ya registrada (no se borra: el cambio queda en bitácora con antes/después). */
export async function corregirCompra(
  id,
  patch,
  opts = {},
) {
  const prev = getCompra(id)
  if (!prev) throw new Error('Compra no encontrada.')
  if (patch.cantidadComprada !== undefined && !(patch.cantidadComprada > 0)) throw new Error('La cantidad comprada debe ser mayor a cero.')
  if (patch.costoUnitarioReal !== undefined && !(patch.costoUnitarioReal >= 0)) throw new Error('El costo unitario real no es válido.')
  const next = await tCompras.update(id, patch)
  const { antes, despues } = cambios(prev, patch)
  registrarBitacora({ tabla: 'cmp_compras', registroId: id, accion: 'cambio', antes, despues, detalle: `${opts.usuario ?? usuarioActual()} corrigió una compra de ${prev.folio}` })
  return next
}

/**
 * @typedef {object} LineaCompra
 * @property {Partida} partida
 * @property {number} cantidadPedida
 * @property {number} cantidadComprada
 * @property {number} [costoRealUnitario] - Costo unitario real promedio ponderado.
 * @property {number} [costoCotizadoUnitario] - Precio unitario cotizado por el proveedor elegido.
 * @property {number} totalReal
 * @property {number} [totalCotizado]
 * @property {number} [diferencia] - Real - cotizado (positivo = se pagó más de lo cotizado).
 */

/**
 * @typedef {object} ResumenCompra
 * @property {string} folio
 * @property {number} autorizado
 * @property {number} totalReal
 * @property {number} diferencia - Real - autorizado.
 * @property {number} toleranciaPct - Tolerancia (%) vigente.
 * @property {boolean} excede - true si lo comprado rebasa lo autorizado más la tolerancia.
 * @property {LineaCompra[]} lineas
 * @property {Partida[]} partidasSinCompra
 * @property {CompraReal[]} comprasSinComprobante
 * @property {boolean} completa - Todas las partidas tienen compra registrada.
 */

export function resumenCompra(folio) {
  const req = getRequisicion(folio)
  const partidas = listPartidas(folio)
  const compras = listCompras(folio)
  const cot = cotizacionElegida(folio)
  const precios = cot ? preciosDe(cot.id) : {}
  const autorizado = req?.montoAutorizado ?? 0
  const tol = getConfig().toleranciaDiferenciaPct
  const lineas = partidas.map((p) => {
    const cs = compras.filter((c) => c.partidaId === p.id)
    const cant = cs.reduce((s, c) => s + c.cantidadComprada, 0)
    const total = r2(cs.reduce((s, c) => s + c.cantidadComprada * c.costoUnitarioReal, 0))
    const cotUnit = precios[p.id]
    const totalCot = cotUnit !== undefined ? r2(cotUnit * p.cantidad) : undefined
    return {
      partida: p,
      cantidadPedida: p.cantidad,
      cantidadComprada: cant,
      costoRealUnitario: cant > 0 ? r2(total / cant) : undefined,
      costoCotizadoUnitario: cotUnit,
      totalReal: total,
      totalCotizado: totalCot,
      diferencia: totalCot !== undefined && cant > 0 ? r2(total - totalCot) : undefined,
    }
  })
  const totalReal = r2(lineas.reduce((s, l) => s + l.totalReal, 0))
  return {
    folio,
    autorizado,
    totalReal,
    diferencia: r2(totalReal - autorizado),
    toleranciaPct: tol,
    excede: autorizado > 0 && totalReal > autorizado * (1 + tol / 100) + 0.005,
    lineas,
    partidasSinCompra: lineas.filter((l) => l.cantidadComprada === 0).map((l) => l.partida),
    comprasSinComprobante: compras.filter((c) => !c.ticketUrl && !c.numeroFactura),
    completa: partidas.length > 0 && lineas.every((l) => l.cantidadComprada > 0),
  }
}

/** ¿Lo comprado rebasa lo autorizado (más tolerancia)? */
export function excedeAutorizado(folio) {
  return resumenCompra(folio).excede
}

/**
 * Cierra el registro de compras: todas las partidas con compra y comprobante (ticket o factura). Si lo comprado rebasa lo
 * autorizado exige `justificacionDiferencia` (queda en la requisición y Finanzas debe re-aprobar). Pasa a "Comprada", lo que
 * genera las recepciones pendientes de inventario.
 */
export async function marcarComprada(folio, opts = {}) {
  const req = getRequisicion(folio)
  if (!req) throw new Error('Requisición no encontrada.')
  const r = resumenCompra(folio)
  if (r.partidasSinCompra.length > 0) {
    throw new Error(`Faltan partidas por registrar: ${r.partidasSinCompra.map((p) => `${p.num}. ${p.producto}`).join(', ')}.`)
  }
  if (r.comprasSinComprobante.length > 0) throw new Error('Cada compra necesita su comprobante: número de factura o foto del ticket.')
  const just = opts.justificacionDiferencia?.trim()
  if (r.excede) {
    if (!just) throw new Error(`Lo comprado (${formatoMoneda(r.totalReal)}) rebasa lo autorizado (${formatoMoneda(r.autorizado)}): escribe la justificación de la diferencia. Finanzas deberá re-aprobar.`)
    await actualizarRequisicion(folio, { justificacionDiferencia: just }, { usuario: opts.usuario })
  }
  return cambiarEstado(folio, 'comprada', { usuario: opts.usuario, comentario: opts.comentario ?? (r.excede ? `Comprada con diferencia: ${just}` : undefined) })
}

// Requisito para entrar a "Comprada" (espejo de cmp_requisitos_estado en la base): al menos una compra registrada.
registrarValidadorTransicion((req, a) => {
  if (a !== 'comprada') return null
  if (listCompras(req.folio).length === 0) return 'Registra primero lo que se compró (partidas, costo real y comprobante).'
  return null
})
