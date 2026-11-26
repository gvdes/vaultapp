import { track } from './reactive'
import { listMovimientos, getEquipo } from './inventario/sistemas'
import { listEntradas, listSalidas, getMaterial } from './inventario/mantenimiento'
import { listSolicitudes } from './inventario/solicitudes'
import { getFamilia } from './inventario/comunes'

/**
 * @typedef {object} ActividadItem
 * @property {string} id
 * @property {number} fecha
 * @property {string} texto
 */

/** Actividad reciente. Con `dominio` solo cuenta lo de ese dominio (alcance por rol: ver lib/access.js). */
export function getActividadReciente(limite = 10, dominio) {
  track()
  const items = []
  const enDom = (familiaId) => !dominio || getFamilia(familiaId)?.tipo === dominio

  listMovimientos().forEach((m) => {
    const equipo = getEquipo(m.equipoId)
    if (dominio && !(equipo && enDom(equipo.familiaId))) return
    items.push({ id: `mov-${m.id}`, fecha: m.fecha, texto: `${equipo?.modelo || equipo?.numeroSerie || 'Equipo'}: ${m.tipo.replace('_', ' ')}` })
  })
  listEntradas().forEach((e) => {
    const material = getMaterial(e.materialId)
    if (dominio && !(material && enDom(material.familiaId))) return
    items.push({ id: `ent-${e.id}`, fecha: e.createdAt, texto: `Entrada de ${material?.nombre ?? 'material'}: +${e.cantidad}` })
  })
  listSalidas().forEach((s) => {
    const material = getMaterial(s.materialId)
    if (dominio && !(material && enDom(material.familiaId))) return
    items.push({ id: `sal-${s.id}`, fecha: s.createdAt, texto: `Salida de ${material?.nombre ?? 'material'}: -${s.cantidad}` })
  })
  listSolicitudes().forEach((s) => {
    if (dominio && s.tipo !== dominio) return
    items.push({ id: `sol-${s.id}`, fecha: s.createdAt, texto: `Solicitud: ${s.descripcion} (${s.estado.replace('_', ' ')})` })
  })

  return items.sort((a, b) => b.fecha - a.fecha).slice(0, limite)
}
