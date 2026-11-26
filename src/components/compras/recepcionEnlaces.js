import { getFamilia } from 'src/lib/inventario/comunes'
import { getEquipo } from 'src/lib/inventario/sistemas'
import { listMateriales } from 'src/lib/inventario/mantenimiento'

/**
 * @typedef {object} EnlaceInventario
 * @property {string} label
 * @property {string} to
 */

/** Enlaces a lo que creó una recepción confirmada (equipos o material), resaltándolos en la pantalla de inventario. */
export function enlacesRecepcion(rec) {
  const out = []
  const base = rec.destino === 'ti' ? '/sistemas' : '/mantenimiento'
  for (const id of rec.equipoIds) {
    const e = getEquipo(id)
    if (!e) continue
    const nombre = e.modelo || getFamilia(e.familiaId)?.nombre || 'Equipo'
    out.push({ label: `${nombre}${e.numeroSerie ? ` · ${e.numeroSerie}` : ' · sin serie'}`, to: `${base}?familia=${encodeURIComponent(e.familiaId)}&highlight=${encodeURIComponent(e.id)}` })
  }
  const materialId = rec.datos.materialId
  if (materialId) {
    const m = listMateriales().find((x) => x.id === materialId)
    if (m) out.push({ label: `${m.nombre} · entrada de ${rec.cantidad}`, to: `/mantenimiento?familia=${encodeURIComponent(m.familiaId)}&highlight=${encodeURIComponent(m.id)}` })
  }
  return out
}
