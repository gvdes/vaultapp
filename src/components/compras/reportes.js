/**
 * Cálculos de los reportes y KPIs de Compras Indirectas (solo lectura, sobre la API pública de `src/lib/compras`).
 */
import {
  ESTADOS,
  ESTADOS_FLUJO,
  comparativo,
  esAbierta,
  getCategoria,
  getHistorial,
  listCotizaciones,
  resumenCompra,
  resumenDinero,
  totalComprado,
} from 'src/lib/compras'
import { cicloMs, diasDesde, montoReferencia, ultimaActividad } from './util'

const EXCLUIDAS = ['rechazada', 'cancelada']
const COMPRADAS = ['comprada', 'entregada']

/** Cantidad de dinero que pesa una requisición: lo real si ya se compró; si no, lo autorizado / cotizado. */
function montoComprometido(r) {
  if (EXCLUIDAS.includes(r.estado)) return 0
  if (COMPRADAS.includes(r.estado)) {
    const real = totalComprado(r.folio)
    if (real > 0) return real
  }
  return montoReferencia(r).monto
}

// ---- KPIs ---------------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} Kpis
 * @property {number} abiertas
 * @property {number} porValidar
 * @property {number} enCotizacion
 * @property {number} enAutorizacion
 * @property {number} porFondear
 * @property {number} compradasSinComprobar
 * @property {number} [cicloPromedioMs] - ms; undefined si aún no hay requisiciones entregadas.
 * @property {number} ahorroCotizacion
 * @property {number} montoAutorizado
 * @property {number} montoGastado
 */

export function calcularKpis(reqs) {
  const por = (e) => reqs.filter((r) => r.estado === e).length
  const ciclos = reqs.map(cicloMs).filter((x) => x !== undefined)
  const autorizadas = reqs.filter((r) => ['autorizada', 'fondeada', 'comprada', 'entregada'].includes(r.estado))
  return {
    abiertas: reqs.filter((r) => esAbierta(r.estado)).length,
    porValidar: por('recibida'),
    enCotizacion: por('en_cotizacion'),
    enAutorizacion: por('en_autorizacion'),
    porFondear: por('autorizada'),
    compradasSinComprobar: reqs.filter((r) => COMPRADAS.includes(r.estado) && resumenDinero(r.folio).pendienteComprobar > 0).length,
    cicloPromedioMs: ciclos.length ? ciclos.reduce((s, x) => s + x, 0) / ciclos.length : undefined,
    ahorroCotizacion: ahorrosPorRequisicion(reqs).reduce((s, a) => s + a.ahorro, 0),
    montoAutorizado: autorizadas.reduce((s, r) => s + (r.montoAutorizado ?? 0), 0),
    montoGastado: reqs.filter((r) => COMPRADAS.includes(r.estado)).reduce((s, r) => s + totalComprado(r.folio), 0),
  }
}

// ---- Ahorro por cotización ---------------------------------------------------------------------------------------------
/**
 * @typedef {object} AhorroReq
 * @property {string} folio
 * @property {string} solicitante
 * @property {string} proveedor
 * @property {number} elegido
 * @property {number} masAlto
 * @property {number} ahorro - Diferencia entre la cotización más cara y la elegida (>= 0).
 * @property {{ proveedor: string; total: number; diferencia: number }} [sugerido] - Comparación contra el proveedor sugerido por el solicitante, si cotizó.
 */

function normaliza(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function ahorrosPorRequisicion(reqs) {
  const out = []
  for (const r of reqs) {
    if (EXCLUIDAS.includes(r.estado)) continue
    const comp = comparativo(r.folio)
    const completas = comp.filas.filter((f) => f.completa)
    const elegida = completas.find((f) => f.cotizacion.id === comp.elegidaId)
    if (!elegida || completas.length < 2) continue
    const masAlto = Math.max(...completas.map((f) => f.total))
    const sug = r.proveedoresSugeridos.map((p) => normaliza(p.empresa)).filter(Boolean)
    const cotSug = completas.find((f) => f.cotizacion.id !== elegida.cotizacion.id && sug.some((s) => normaliza(f.cotizacion.proveedor).includes(s) || s.includes(normaliza(f.cotizacion.proveedor))))
    out.push({
      folio: r.folio,
      solicitante: r.solicitanteNombre,
      proveedor: elegida.cotizacion.proveedor,
      elegido: elegida.total,
      masAlto,
      ahorro: Math.max(0, masAlto - elegida.total),
      sugerido: cotSug ? { proveedor: cotSug.cotizacion.proveedor, total: cotSug.total, diferencia: cotSug.total - elegida.total } : undefined,
    })
  }
  return out.sort((a, b) => b.ahorro - a.ahorro)
}

// ---- Por área ----------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} ReporteArea
 * @property {string} area
 * @property {number} requisiciones
 * @property {number} abiertas
 * @property {number} monto
 */
export function reportePorArea(reqs) {
  const m = new Map()
  for (const r of reqs) {
    const area = r.area?.trim() || 'Sin área'
    const a = m.get(area) ?? { area, requisiciones: 0, abiertas: 0, monto: 0 }
    a.requisiciones++
    if (esAbierta(r.estado)) a.abiertas++
    a.monto += montoComprometido(r)
    m.set(area, a)
  }
  return [...m.values()].sort((a, b) => b.monto - a.monto || b.requisiciones - a.requisiciones)
}

// ---- Por categoría -----------------------------------------------------------------------------------------------------
/**
 * @typedef {object} ReporteCategoria
 * @property {string} categoria
 * @property {number} partidas
 * @property {number} monto
 */
export function reportePorCategoria(reqs) {
  const m = new Map()
  for (const r of reqs) {
    if (EXCLUIDAS.includes(r.estado)) continue
    for (const l of resumenCompra(r.folio).lineas) {
      const nombre = getCategoria(l.partida.categoriaId)?.nombre ?? 'Sin categoría'
      const c = m.get(nombre) ?? { categoria: nombre, partidas: 0, monto: 0 }
      c.partidas++
      c.monto += l.totalReal > 0 ? l.totalReal : (l.totalCotizado ?? 0)
      m.set(nombre, c)
    }
  }
  return [...m.values()].sort((a, b) => b.monto - a.monto)
}

// ---- Por proveedor (comparativo de precios) ----------------------------------------------------------------------------
/**
 * @typedef {object} ReporteProveedor
 * @property {string} proveedor
 * @property {number} cotizaciones
 * @property {number} masBarato - Veces que fue la cotización completa más barata.
 * @property {number} elegido - Veces que fue elegido.
 * @property {number} [sobreprecioPct] - Sobreprecio promedio (%) contra la cotización más barata de cada requisición (solo completas).
 * @property {number} [entregaPromedioDias]
 * @property {number} montoElegido
 */
export function reportePorProveedor(reqs) {
  /**
   * Extiende ReporteProveedor.
   * @typedef {object} Acc
   * @property {number[]} sobre
   * @property {number[]} entregas
   */
  const m = new Map()
  for (const r of reqs) {
    const comp = comparativo(r.folio)
    const completas = comp.filas.filter((f) => f.completa)
    const min = completas.length ? Math.min(...completas.map((f) => f.total)) : 0
    for (const f of comp.filas) {
      const nombre = f.cotizacion.proveedor.trim()
      const a = m.get(nombre) ?? { proveedor: nombre, cotizaciones: 0, masBarato: 0, elegido: 0, montoElegido: 0, sobre: [], entregas: [] }
      a.cotizaciones++
      if (f.completa && f.esMasBarata) a.masBarato++
      if (f.completa && min > 0) a.sobre.push(((f.total - min) / min) * 100)
      if (f.cotizacion.tiempoEntregaDias !== undefined) a.entregas.push(f.cotizacion.tiempoEntregaDias)
      if (f.cotizacion.elegida && !EXCLUIDAS.includes(r.estado)) {
        a.elegido++
        a.montoElegido += COMPRADAS.includes(r.estado) && totalComprado(r.folio) > 0 ? totalComprado(r.folio) : f.total
      }
      m.set(nombre, a)
    }
  }
  return [...m.values()]
    .map(({ sobre, entregas, ...rest }) => ({
      ...rest,
      sobreprecioPct: sobre.length ? sobre.reduce((s, x) => s + x, 0) / sobre.length : undefined,
      entregaPromedioDias: entregas.length ? entregas.reduce((s, x) => s + x, 0) / entregas.length : undefined,
    }))
    .sort((a, b) => b.montoElegido - a.montoElegido || b.cotizaciones - a.cotizaciones)
}

// ---- Tiempos por etapa ------------------------------------------------------------------------------------------------
/**
 * @typedef {object} ReporteEtapa
 * @property {EstadoReq} estado
 * @property {string} label
 * @property {number} muestras
 * @property {number} promedioMs
 */
/** Tiempo promedio que pasa una requisición en cada estado (solo tramos ya terminados, tomados del historial). */
export function reportePorEtapa(reqs) {
  const acc = new Map()
  for (const r of reqs) {
    const h = getHistorial(r.folio)
    for (let i = 0; i < h.length - 1; i++) {
      const lista = acc.get(h[i].aEstado) ?? []
      lista.push(Math.max(0, h[i + 1].fecha - h[i].fecha))
      acc.set(h[i].aEstado, lista)
    }
  }
  const orden = [...ESTADOS_FLUJO, 'en_espera']
  return orden
    .filter((e) => (acc.get(e)?.length ?? 0) > 0)
    .map((e) => {
      const xs = acc.get(e)
      return { estado: e, label: ESTADOS[e].corta, muestras: xs.length, promedioMs: xs.reduce((s, x) => s + x, 0) / xs.length }
    })
}

// ---- Sin movimiento -----------------------------------------------------------------------------------------------------
/**
 * @typedef {object} SinMovimiento
 * @property {Requisicion} req
 * @property {number} dias
 */
export function sinMovimiento(reqs, umbralDias = 3) {
  return reqs
    .filter((r) => esAbierta(r.estado))
    .map((r) => ({ req: r, dias: diasDesde(ultimaActividad(r)) }))
    .filter((x) => x.dias > umbralDias)
    .sort((a, b) => b.dias - a.dias)
}

export function proveedoresDeRequisicion(folio) {
  return listCotizaciones(folio).map((c) => c.proveedor)
}
