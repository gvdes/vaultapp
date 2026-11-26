import * as XLSX from 'xlsx'
import { ESTADOS, getCategoria, listPartidas, resumenCompra, resumenDinero } from 'src/lib/compras'
import { toLocalDateString } from 'src/lib/dateUtils'
import {
  ahorrosPorRequisicion,
  reportePorArea,
  reportePorCategoria,
  reportePorEtapa,
  reportePorProveedor,
  sinMovimiento,
} from './reportes'
import { diasDesde, montoReferencia, ubicacionesTexto } from './util'

/** @typedef {Record<string, string | number>} Fila */

function hoja(wb, nombre, filas) {
  const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ Aviso: 'Sin datos' }])
  XLSX.utils.book_append_sheet(wb, ws, nombre)
}

/** Exporta a Excel las requisiciones visibles y los reportes (por área, categoría, proveedor, etapas, ahorro y sin movimiento). */
export function exportarComprasExcel(reqs) {
  const wb = XLSX.utils.book_new()

  hoja(
    wb,
    'Requisiciones',
    reqs.map((r) => {
      const m = montoReferencia(r)
      const d = resumenDinero(r.folio)
      return {
        Folio: r.folio,
        Estado: ESTADOS[r.estado].label,
        Urgencia: r.urgencia === 'urgente' ? 'Urgente' : 'Normal',
        Solicitante: r.solicitanteNombre,
        Área: r.area ?? '',
        Sucursales: ubicacionesTexto(r.ubicaciones),
        'Para quién': r.paraQuien ?? '',
        Partidas: listPartidas(r.folio).length,
        'Proveedor elegido': r.proveedorElegido ?? '',
        Monto: m.monto,
        'Tipo de monto': m.tipo,
        'Monto autorizado': r.montoAutorizado ?? 0,
        Entregado: d.entregado,
        Gastado: d.gastado,
        Comprobado: d.comprobado,
        'Cambio devuelto': d.cambioDevuelto,
        'Creada': toLocalDateString(new Date(r.createdAt)),
        'Días desde creada': diasDesde(r.createdAt),
        'Folio caja chica': r.folioCajaChica ?? '',
        'Familia de gasto': r.familiaGasto ?? '',
      }
    }),
  )

  const partidas = []
  for (const r of reqs) {
    const lineas = resumenCompra(r.folio).lineas
    for (const l of lineas) {
      partidas.push({
        Folio: r.folio,
        Partida: l.partida.num,
        Producto: l.partida.producto,
        Categoría: getCategoria(l.partida.categoriaId)?.nombre ?? '',
        'Cantidad pedida': l.cantidadPedida,
        'Cantidad comprada': l.cantidadComprada,
        'Costo cotizado unitario': l.costoCotizadoUnitario ?? '',
        'Costo real unitario': l.costoRealUnitario ?? '',
        'Total cotizado': l.totalCotizado ?? '',
        'Total real': l.totalReal,
      })
    }
  }
  hoja(wb, 'Partidas', partidas)

  hoja(wb, 'Por área', reportePorArea(reqs).map((a) => ({ Área: a.area, Requisiciones: a.requisiciones, Abiertas: a.abiertas, Monto: a.monto })))
  hoja(wb, 'Por categoría', reportePorCategoria(reqs).map((c) => ({ Categoría: c.categoria, Partidas: c.partidas, Monto: c.monto })))
  hoja(
    wb,
    'Por proveedor',
    reportePorProveedor(reqs).map((p) => ({
      Proveedor: p.proveedor,
      Cotizaciones: p.cotizaciones,
      'Veces más barato': p.masBarato,
      'Veces elegido': p.elegido,
      'Sobreprecio prom. (%)': p.sobreprecioPct !== undefined ? Math.round(p.sobreprecioPct * 10) / 10 : '',
      'Entrega prom. (días)': p.entregaPromedioDias !== undefined ? Math.round(p.entregaPromedioDias * 10) / 10 : '',
      'Monto elegido': p.montoElegido,
    })),
  )
  hoja(
    wb,
    'Ahorro por cotización',
    ahorrosPorRequisicion(reqs).map((a) => ({
      Folio: a.folio,
      Solicitante: a.solicitante,
      'Proveedor elegido': a.proveedor,
      Elegido: a.elegido,
      'Cotización más alta': a.masAlto,
      Ahorro: a.ahorro,
      'Proveedor sugerido': a.sugerido?.proveedor ?? '',
      'Diferencia vs sugerido': a.sugerido?.diferencia ?? '',
    })),
  )
  hoja(wb, 'Tiempos por etapa', reportePorEtapa(reqs).map((e) => ({ Etapa: e.label, Muestras: e.muestras, 'Promedio (días)': Math.round((e.promedioMs / 86400000) * 100) / 100 })))
  hoja(wb, 'Sin movimiento', sinMovimiento(reqs).map((x) => ({ Folio: x.req.folio, Estado: ESTADOS[x.req.estado].label, Solicitante: x.req.solicitanteNombre, 'Días sin movimiento': x.dias })))

  XLSX.writeFile(wb, `compras_indirectas_${toLocalDateString(new Date())}.xlsx`)
}
