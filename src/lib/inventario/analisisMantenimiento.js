import { track } from '../reactive'
import { listEntradas, listSalidas, listConsumos, listMateriales, getMaterial, valorInventarioMantenimiento } from './mantenimiento'
import { listMantenimientosProgramados } from './mantenimientoProgramado'
import { getUbicacion, getFamilia } from './comunes'
import { listEquipos } from './sistemas'
import { calcularValorDepreciado } from './depreciacion'
import { parseLocalDate, todayLocalDateString } from '../dateUtils'

function equiposDeMantenimiento() {
  return listEquipos().filter((e) => getFamilia(e.familiaId)?.tipo === 'mantenimiento')
}

/** Cuántas piezas de herramienta/equipo de Mantenimiento siguen activas (no dadas de baja). */
export function totalEquiposMantenimiento() {
  track()
  return equiposDeMantenimiento().filter((e) => e.estado !== 'baja').length
}

/** Valor actual (depreciado) de las herramientas/equipo de Mantenimiento que se llevan por pieza. */
export function valorEquiposMantenimiento() {
  track()
  return equiposDeMantenimiento()
    .filter((e) => e.estado !== 'baja')
    .reduce((s, e) => {
      const familia = getFamilia(e.familiaId)
      return s + (familia ? calcularValorDepreciado(e, familia) : e.costoTotal)
    }, 0)
}

/** Total histórico invertido en herramientas/equipo de Mantenimiento (incluye ya dados de baja). */
export function valorOriginalEquiposMantenimiento() {
  track()
  return equiposDeMantenimiento().reduce((s, e) => s + (e.costoTotal || 0), 0)
}

/** Valor actual combinado de Mantenimiento: materiales por cantidad + herramienta/equipo por pieza. */
export function valorTotalMantenimiento() {
  track()
  return valorInventarioMantenimiento() + valorEquiposMantenimiento()
}

/** Gasto mensual en entradas (compras) de los últimos `meses` meses, para ver la tendencia de gasto. */
export function gastoMensual(meses = 6) {
  track()
  const ahora = new Date()
  const buckets = []
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }), gasto: 0 })
  }
  const porClave = new Map(buckets.map((b) => [b.key, b]))
  listEntradas().forEach((e) => {
    const d = parseLocalDate(e.fecha)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const bucket = porClave.get(key)
    if (bucket) bucket.gasto += e.cantidad * (e.costoUnitario ?? 0)
  })
  return buckets.map((b) => ({ mes: b.label, gasto: Math.round(b.gasto * 100) / 100 }))
}

/** Top N materiales por cantidad consumida (salidas), útil para negociar compras al mayoreo o revisar mínimos. */
export function topMaterialesConsumidos(top = 5) {
  track()
  const porMaterial = new Map()
  listConsumos().forEach((s) => {
    porMaterial.set(s.materialId, (porMaterial.get(s.materialId) ?? 0) + s.cantidad)
  })
  return Array.from(porMaterial.entries())
    .map(([materialId, cantidad]) => ({ nombre: getMaterial(materialId)?.nombre ?? materialId, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, top)
}

/** Valor de salidas (consumo) por sucursal/área destino, para ver dónde se concentra el gasto de mantenimiento. */
export function gastoPorUbicacion(top = 5) {
  track()
  const porUbicacion = new Map()
  listConsumos().forEach((s) => {
    if (!s.ubicacionDestinoId) return
    const material = getMaterial(s.materialId)
    const valor = s.cantidad * (material?.costoUnitario ?? 0)
    porUbicacion.set(s.ubicacionDestinoId, (porUbicacion.get(s.ubicacionDestinoId) ?? 0) + valor)
  })
  return Array.from(porUbicacion.entries())
    .map(([ubicacionId, valor]) => ({ nombre: getUbicacion(ubicacionId)?.nombre ?? ubicacionId, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, top)
}

/** % de mantenimientos programados que están al día (no vencidos), como indicador rápido de cumplimiento. */
export function cumplimientoPreventivo() {
  track()
  const programados = listMantenimientosProgramados()
  if (programados.length === 0) return { pct: 100, total: 0, alDia: 0 }
  const hoy = todayLocalDateString()
  const alDia = programados.filter((p) => p.proximaFecha >= hoy).length
  return { pct: Math.round((alDia / programados.length) * 100), total: programados.length, alDia }
}

/**
 * Total histórico invertido en materiales: lo que sigue en existencia hoy + todo lo que ya se
 * consumió por salidas, valorado al costo unitario vigente de cada material.
 */
export function valorOriginalMantenimiento() {
  track()
  const consumido = listConsumos().reduce((s, sal) => s + sal.cantidad * (getMaterial(sal.materialId)?.costoUnitario ?? 0), 0)
  return valorInventarioMantenimiento() + consumido + valorOriginalEquiposMantenimiento()
}

/** Materiales sin ningún movimiento de salida — posible stock muerto que inmoviliza capital. */
export function materialesSinMovimiento(diasSinUso = 90) {
  track()
  const salidasPorMaterial = new Set(listSalidas().map((s) => s.materialId))
  const limite = Date.now() - diasSinUso * 24 * 60 * 60 * 1000
  return listMateriales()
    .filter((m) => m.cantidadActual > 0 && !salidasPorMaterial.has(m.id) && m.createdAt < limite)
    .map((m) => ({ nombre: m.nombre, valor: m.cantidadActual * m.costoUnitario }))
    .sort((a, b) => b.valor - a.valor)
}
