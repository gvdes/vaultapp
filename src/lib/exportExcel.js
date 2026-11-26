import * as XLSX from 'xlsx'
import { getFamilia, getUbicacion } from './inventario/comunes'

function download(rows, sheetName, filename) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

/** `conCostos = false` (roles de inventario sin dinero) omite costos y valores. */
export function exportEquiposExcel(equipos, filename = 'inventario_sistemas.xlsx', conCostos = true) {
  const rows = equipos.map((e) => ({
    Familia: getFamilia(e.familiaId)?.nombre ?? '',
    Modelo: e.modelo ?? '',
    'Número de serie': e.numeroSerie ?? '',
    Ubicación: getUbicacion(e.ubicacionId)?.nombre ?? '',
    'Usuario asignado': e.usuarioAsignado ?? '',
    Estado: e.estado,
    Proveedor: e.proveedor ?? '',
    'Fecha de compra': e.fechaCompra ?? '',
    ...(conCostos ? { 'Costo total': e.costoTotal } : {}),
  }))
  download(rows, 'Equipos', filename)
}

export function exportMaterialesExcel(materiales, filename = 'inventario_mantenimiento.xlsx', conCostos = true) {
  const rows = materiales.map((m) => ({
    Familia: getFamilia(m.familiaId)?.nombre ?? '',
    Nombre: m.nombre,
    Marca: m.marca ?? '',
    'Detalle (qué es y para qué se usa)': m.descripcion ?? '',
    Unidad: m.unidadMedida,
    'Cantidad actual': m.cantidadActual,
    Mínimo: m.minimo,
    Máximo: m.maximo ?? '',
    ...(conCostos ? { 'Costo unitario': m.costoUnitario, 'Valor total': m.cantidadActual * m.costoUnitario } : {}),
    Ubicación: getUbicacion(m.ubicacionId)?.nombre ?? '',
  }))
  download(rows, 'Materiales', filename)
}
