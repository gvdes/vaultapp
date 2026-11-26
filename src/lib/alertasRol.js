import { alcanceAlertas, dominioDeVista, indicadoresVisibles, inventarioSinDinero } from './access'
import { getAlertasControl, getIndicadoresControl } from './inventario/alertasControl'

/**
 * Alertas de control e indicadores de proceso con el ALCANCE DEL ROL (la política vive en `lib/access.js`):
 * cada rol solo ve alertas de su dominio o función; las de Compras y las de dinero global, solo Dirección y Finanzas.
 * Inicio, campana y ficha usan estas funciones en vez de llamar a `getAlertasControl` directo.
 */
export function getAlertasRol(role, ubicacionId) {
  const alc = role ? alcanceAlertas(role) : null
  if (!alc) return []
  let alertas = getAlertasControl(ubicacionId, { incluirCompras: alc.compras, dominio: alc.dominio })
  if (!alc.inventario) alertas = alertas.filter((a) => a.origen === 'compras')
  const reglas = alc.reglas
  if (reglas) alertas = alertas.filter((a) => reglas.includes(a.regla))
  // Roles de inventario sin dinero (Talento): se conserva la alerta pero sin montos.
  if (inventarioSinDinero(role)) alertas = alertas.map(sinMontos)
  return alertas
}

/** Quita los importes en pesos del texto (p. ej. "(… $36,900 sin respaldo)"). */
function quitarDinero(texto) {
  return texto
    .replace(/\s*\([^()]*\$[\d.,]+[^()]*\)/g, '')
    .replace(/\s*\$[\d.,]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function sinMontos(a) {
  return { ...a, valor: undefined, detalle: quitarDinero(a.detalle), items: a.items.map((i) => ({ ...i, texto: quitarDinero(i.texto) })) }
}

/** Indicadores de proceso que el rol ve, calculados con su dominio. */
export function getIndicadoresRol(role) {
  if (!role) return []
  const ids = indicadoresVisibles(role)
  if (ids.length === 0) return []
  return getIndicadoresControl(dominioDeVista(role)).filter((i) => ids.includes(i.id))
}
