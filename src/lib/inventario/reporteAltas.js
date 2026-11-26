import * as XLSX from 'xlsx'
import { toLocalDateString } from '../dateUtils'
import { getFamilia, getUbicacion } from './comunes'
import { listEquipos, listMovimientos } from './sistemas'
import { getMaterial, listEntradas } from './mantenimiento'

/**
 * Reporte de altas (conciliación para Finanzas): todo lo que se dio de alta en el inventario en un rango de fechas,
 * con su evidencia de compra (proveedor, factura/OC), costo y quién lo registró. Une los equipos (por su movimiento
 * inicial «Alta de equipo») con las entradas de material. Sirve para cruzar contra lo pagado, ya que Adquisiciones/Finanzas
 * no está conectada a la app.
 */

/** @typedef {'equipo' | 'entrada'} TipoAlta */

/**
 * @typedef {object} FilaAlta
 * @property {string} id
 * @property {string} fecha - YYYY-MM-DD
 * @property {TipoAlta} tipo
 * @property {FamiliaTipo} dominio
 * @property {string} familia
 * @property {string} nombre - Modelo (equipo) o nombre del material (entrada).
 * @property {string} serie
 * @property {string} proveedor
 * @property {string} factura
 * @property {number} cantidad
 * @property {number} costoUnitario
 * @property {number} costoTotal
 * @property {string} ubicacion
 * @property {string} registradoPor
 */

/**
 * @typedef {object} FiltroAltas
 * @property {string} [desde] - YYYY-MM-DD inclusive (vacío = sin límite).
 * @property {string} [hasta] - YYYY-MM-DD inclusive (vacío = sin límite).
 * @property {FamiliaTipo | 'todos'} [dominio]
 */

const MOTIVO_ALTA = 'Alta de equipo'

/** Filas de altas dentro del filtro, la más reciente primero. Llama a getters con track() → úsalo dentro de un computed. */
export function reporteAltas(filtro = {}) {
  const filas = []

  // Movimiento inicial de cada equipo (el más antiguo con motivo de alta).
  const altaDe = new Map()
  for (const m of listMovimientos()) {
    if (m.motivo !== MOTIVO_ALTA) continue
    const previo = altaDe.get(m.equipoId)
    if (!previo || m.fecha < previo.fecha) altaDe.set(m.equipoId, { fecha: m.fecha, registradoPor: m.registradoPor })
  }

  for (const e of listEquipos()) {
    const fam = getFamilia(e.familiaId)
    const alta = altaDe.get(e.id)
    filas.push({
      id: `eq-${e.id}`,
      fecha: toLocalDateString(new Date(alta?.fecha ?? e.createdAt)),
      tipo: 'equipo',
      dominio: fam?.tipo ?? 'sistemas',
      familia: fam?.nombre ?? '',
      nombre: e.modelo || '',
      serie: e.numeroSerie ?? '',
      proveedor: e.proveedor ?? '',
      factura: e.numeroFactura ?? '',
      cantidad: 1,
      costoUnitario: e.costoTotal,
      costoTotal: e.costoTotal,
      ubicacion: getUbicacion(e.ubicacionId)?.nombre ?? '',
      registradoPor: alta?.registradoPor ?? '',
    })
  }

  for (const en of listEntradas()) {
    const mat = getMaterial(en.materialId)
    const fam = getFamilia(mat?.familiaId)
    const unit = en.costoUnitario ?? 0
    filas.push({
      id: `en-${en.id}`,
      fecha: en.fecha,
      tipo: 'entrada',
      dominio: 'mantenimiento',
      familia: fam?.nombre ?? '',
      nombre: mat?.nombre ?? '',
      serie: '',
      proveedor: en.proveedor ?? '',
      factura: en.numeroFactura ?? '',
      cantidad: en.cantidad,
      costoUnitario: unit,
      costoTotal: unit * en.cantidad,
      ubicacion: getUbicacion(mat?.ubicacionId)?.nombre ?? '',
      registradoPor: en.quienRecibio ?? '',
    })
  }

  const dom = filtro.dominio && filtro.dominio !== 'todos' ? filtro.dominio : null
  return filas
    .filter((f) => (!filtro.desde || f.fecha >= filtro.desde) && (!filtro.hasta || f.fecha <= filtro.hasta) && (!dom || f.dominio === dom))
    .sort((a, b) => (a.fecha === b.fecha ? a.nombre.localeCompare(b.nombre) : b.fecha.localeCompare(a.fecha)))
}

/**
 * @typedef {object} TotalesAltas
 * @property {number} registros
 * @property {number} piezas
 * @property {number} costoTotal
 * @property {number} sinEvidencia
 */

/** Totales del reporte. «Sin evidencia» cuenta las altas sin proveedor o sin factura/OC. */
export function totalesAltas(filas) {
  return {
    registros: filas.length,
    piezas: filas.reduce((s, f) => s + f.cantidad, 0),
    costoTotal: filas.reduce((s, f) => s + f.costoTotal, 0),
    sinEvidencia: filas.filter((f) => !f.proveedor || !f.factura).length,
  }
}

/** Exporta el reporte a Excel (una hoja «Altas» con una fila de totales al final). */
export function exportReporteAltasExcel(filas, desde, hasta) {
  const rows = filas.map((f) => ({
    Fecha: f.fecha,
    Tipo: f.tipo === 'equipo' ? 'Equipo' : 'Entrada de material',
    Área: f.dominio === 'sistemas' ? 'Sistemas' : 'Mantenimiento',
    Familia: f.familia,
    'Modelo / Nombre': f.nombre,
    'Número de serie': f.serie,
    Proveedor: f.proveedor,
    'Factura / OC': f.factura,
    Cantidad: f.cantidad,
    'Costo unitario': f.costoUnitario,
    'Costo total': f.costoTotal,
    Ubicación: f.ubicacion,
    'Registrado por': f.registradoPor,
  }))
  const t = totalesAltas(filas)
  rows.push({
    Fecha: 'TOTAL',
    Tipo: '',
    Área: '',
    Familia: '',
    'Modelo / Nombre': `${t.registros} registros`,
    'Número de serie': '',
    Proveedor: '',
    'Factura / OC': '',
    Cantidad: t.piezas,
    'Costo unitario': '',
    'Costo total': t.costoTotal,
    Ubicación: '',
    'Registrado por': '',
  })
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Altas')
  XLSX.writeFile(wb, `reporte_altas_${desde || 'inicio'}_${hasta || 'hoy'}.xlsx`)
}
