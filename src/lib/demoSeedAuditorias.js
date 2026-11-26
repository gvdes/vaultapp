import { bump } from './reactive'
import { toLocalDateString } from './dateUtils'
import { listUbicaciones } from './inventario/comunes'
import { listEquipos } from './inventario/sistemas'
import { listMateriales } from './inventario/mantenimiento'
import {
  enviarAVerificacion,
  iniciarAuditoria,
  listAuditorias,
  listItems,
  loadAuditoriasCache,
  marcarEquipoItem,
  marcarMaterialItem,
  pedirReconteo,
  registrarResolucion,
  cerrarAuditoria,
} from './inventario/auditorias'

/**
 * Datos de demostración del módulo de Auditorías (solo modo demo local; el orquestador los invoca después de
 * `cargarDatosDeEjemplo()`): cuatro auditorías que muestran todo el flujo.
 *   1) POR VERIFICAR con auditor asignado y varias discrepancias (con una foto de evidencia): lista para verificar y cerrar.
 *   2) EN CONTEO compartida por liga (sorpresa), con avance parcial y un reconteo pedido.
 *   3) CERRADAS: tres auditorías históricas de la misma sucursal con exactitud creciente (tendencia) y resoluciones.
 *   4) PROGRAMADA VENCIDA: en conteo, con fecha programada ya pasada y sin avance.
 * Todo con correos falsos (`@ejemplo.mx`); nunca envía nada. Las sucursales se eligen según el inventario disponible, evitando
 * las que ya tengan una auditoría abierta.
 */

const DIA_MS = 86400000
const soporte = 'Soporte e Infraestructura'

function fotoSvg(leyenda) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220" width="320" height="220"><rect width="320" height="220" fill="#e8eef7"/><rect x="70" y="30" width="180" height="112" rx="8" fill="#1f2937"/><rect x="78" y="38" width="164" height="96" rx="3" fill="#60a5fa"/><path d="M190 52 L214 96" stroke="#fff" stroke-width="1.5" opacity="0.8"/><path d="M40 150 H280 L296 172 Q298 178 290 178 H30 Q22 178 24 172 Z" fill="#9ca3af"/><text x="160" y="205" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#1f2937">${leyenda}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Ubicaciones con inventario, de la que tiene más artículos a la que tiene menos. */
function ubicacionesPorInventario() {
  const activas = new Set(listUbicaciones().filter((u) => u.activo).map((u) => u.id))
  const cuenta = new Map()
  listEquipos().forEach((e) => {
    if (e.estado !== 'baja' && e.ubicacionId) cuenta.set(e.ubicacionId, (cuenta.get(e.ubicacionId) ?? 0) + 1)
  })
  listMateriales().forEach((m) => {
    if (m.cantidadActual > 0 && m.ubicacionId) cuenta.set(m.ubicacionId, (cuenta.get(m.ubicacionId) ?? 0) + 1)
  })
  return [...cuenta.entries()]
    .filter(([id]) => activas.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
}

/** Cuenta un ítem: `ok` = coincide; si no, discrepancia (equipo dañado o no encontrado, material con 1 menos). */
async function contar(it, ok, quien, variante, foto, nota) {
  if (it.tipo === 'equipo') {
    if (ok) await marcarEquipoItem(it.id, { encontrado: true, condicion: 'bien', verificadoPor: quien })
    else if (variante % 2 === 0) await marcarEquipoItem(it.id, { encontrado: true, condicion: 'danado', verificadoPor: quien, notas: nota ?? 'Pantalla estrellada, sigue funcionando', fotoUrl: foto })
    else await marcarEquipoItem(it.id, { encontrado: false, condicion: 'perdido', verificadoPor: quien, notas: nota ?? 'No se localizó en la sucursal; el gerente cree que lo tiene un colaborador' })
  } else {
    const esperada = it.cantidadEsperada ?? 0
    await marcarMaterialItem(it.id, ok ? esperada : Math.max(0, esperada - 1), ok ? undefined : (nota ?? 'Falta una pieza respecto al registro'), quien)
  }
}

/** Reescribe fechas de una auditoría ya creada en localStorage (solo demo) y recarga la caché. */
async function retroceder(auditoriaId, diasInicio, diasCierre) {
  try {
    const ahora = Date.now()
    const auds = JSON.parse(localStorage.getItem('dga_inv_auditorias') ?? '[]')
    const a = auds.find((x) => x.id === auditoriaId)
    if (a) {
      a.fechaInicio = ahora - diasInicio * DIA_MS
      a.createdAt = a.fechaInicio
      if (diasCierre !== undefined) {
        a.fechaEnvio = ahora - (diasCierre + 1) * DIA_MS
        a.fechaCierre = ahora - diasCierre * DIA_MS
      }
      localStorage.setItem('dga_inv_auditorias', JSON.stringify(auds))
    }
    const items = JSON.parse(localStorage.getItem('dga_inv_auditoria_items') ?? '[]')
    items.forEach((i) => {
      if (i.auditoriaId === auditoriaId) {
        i.createdAt = ahora - diasInicio * DIA_MS
        if (i.fechaVerificado) i.fechaVerificado = ahora - (diasCierre !== undefined ? diasCierre + 2 : diasInicio - 1) * DIA_MS
      }
    })
    localStorage.setItem('dga_inv_auditoria_items', JSON.stringify(items))
    await loadAuditoriasCache()
  } catch {
    /* sin almacenamiento: las fechas quedan de hoy */
  }
}

export async function sembrarAuditoriasDemo() {
  await loadAuditoriasCache()
  // Idempotente: si ya hay auditorías con auditor asignado (de esta siembra), no se repite.
  if (listAuditorias().some((a) => a.auditorNombre)) return

  const abiertas = new Set(listAuditorias().filter((a) => a.estado !== 'completada').map((a) => a.ubicacionId))
  const candidatas = ubicacionesPorInventario()
  if (candidatas.length === 0) return
  const libres = candidatas.filter((id) => !abiertas.has(id))
  const tomar = () => libres.shift()

  // 3) CERRADAS con historial en la sucursal de mayor inventario (tendencia de exactitud creciente).
  const historial = tomar() ?? candidatas[0]
  const planes = [
    { dias: 200, discrepancias: [0, 3, 5], quien: 'Marisol Treviño', opciones: { modalidad: 'auditor', auditorNombre: 'Marisol Treviño', auditorCorreo: 'marisol.trevino@ejemplo.mx', alcance: 'Auditoría trimestral: equipos y materiales' } },
    { dias: 120, discrepancias: [1, 4], quien: 'Marisol Treviño', opciones: { modalidad: 'auditor', auditorNombre: 'Marisol Treviño', auditorCorreo: 'marisol.trevino@ejemplo.mx' } },
    { dias: 40, discrepancias: [2], quien: soporte, opciones: { modalidad: 'interna', alcance: 'Seguimiento a faltantes de la auditoría anterior' } },
  ]
  for (const plan of planes) {
    const a = await iniciarAuditoria(historial, 'ambos', soporte, plan.opciones)
    const items = listItems(a.id)
    for (const [idx, it] of items.entries()) await contar(it, !plan.discrepancias.includes(idx), plan.quien, idx)
    await enviarAVerificacion(a.id)
    for (const [idx, it] of listItems(a.id).entries()) {
      if (plan.discrepancias.includes(idx)) {
        await registrarResolucion(it.id, it.tipo === 'equipo' ? 'Revisado: se conserva en inventario' : 'Existencia ajustada al conteo')
      }
    }
    await cerrarAuditoria(a.id, plan.dias === 40 ? 'Sin faltantes nuevos; se dio seguimiento a lo detectado antes.' : 'Se documentaron las diferencias y se ajustó el inventario.', soporte)
    await retroceder(a.id, plan.dias + 2, plan.dias)
  }

  // 1) POR VERIFICAR: auditor asignado, varias discrepancias y una foto de evidencia.
  const porVerificar = tomar()
  if (porVerificar) {
    const a = await iniciarAuditoria(porVerificar, 'ambos', soporte, {
      modalidad: 'auditor',
      auditorNombre: 'Marisol Treviño',
      auditorCorreo: 'marisol.trevino@ejemplo.mx',
      fechaProgramada: toLocalDateString(new Date(Date.now() - 2 * DIA_MS)),
      alcance: 'Incluye bodega y mostrador. No contar equipos en reparación.',
    })
    const items = listItems(a.id)
    for (const [idx, it] of items.entries()) {
      const discrepancia = idx === 1 || idx === 2 || idx === 4
      await contar(it, !discrepancia, 'Marisol Treviño', idx, idx === 1 ? fotoSvg('Pantalla estrellada') : undefined)
    }
    await enviarAVerificacion(a.id)
    await retroceder(a.id, 3)
  }

  // 2) EN CONTEO compartida por liga (sorpresa) con avance parcial y un reconteo pedido.
  const enConteo = tomar()
  if (enConteo) {
    const a = await iniciarAuditoria(enConteo, 'ambos', soporte, {
      modalidad: 'gerente_sucursal',
      auditorNombre: 'Roberto Aguilar',
      auditorCorreo: 'roberto.aguilar@ejemplo.mx',
      sorpresa: true,
      alcance: 'Auditoría sorpresa: contar todo lo que haya en la sucursal.',
    })
    const items = listItems(a.id)
    const mitad = Math.ceil(items.length / 2)
    for (const [idx, it] of items.slice(0, mitad).entries()) await contar(it, idx !== 1, 'Roberto Aguilar', idx)
    const contado = listItems(a.id).find((i) => i.encontrado !== undefined || i.cantidadContada != null)
    if (contado) await pedirReconteo(contado.id, 'Confirma el número de serie en la etiqueta del equipo.')
    await retroceder(a.id, 1)
  }

  // 4) PROGRAMADA VENCIDA: en conteo, con fecha programada pasada y sin avance.
  const vencida = tomar()
  if (vencida) {
    const a = await iniciarAuditoria(vencida, 'ambos', soporte, {
      modalidad: 'auditor',
      auditorNombre: 'Tomás Ibarra',
      auditorCorreo: 'tomas.ibarra@ejemplo.mx',
      fechaProgramada: toLocalDateString(new Date(Date.now() - 12 * DIA_MS)),
      alcance: 'Programada para el trimestre; aún sin contar.',
    })
    await retroceder(a.id, 14)
  }

  bump()
}
