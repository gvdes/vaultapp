import { track } from './reactive'
import {
  dominiosVisibles,
  esCustodioCompras,
  solicitudesSoloPropias,
  solicitudesTiposVisibles,
  canViewSolicitudes,
  dominiosOperados,
} from './access'
import { getFamilia } from './inventario/comunes'
import { listEquipos } from './inventario/sistemas'
import { listMateriales } from './inventario/mantenimiento'
import { listSolicitudes } from './inventario/solicitudes'
import { destinoDeCategoria, destinoDePago, getParticipante, listPartidas, listRequisiciones } from './compras'

/**
 * Filtros de DATOS por rol (la matriz de qué ve cada perfil vive en `lib/access.js`; aquí se aplica a las listas).
 * Todo lo que muestre datos agregados o listas a un rol (Inicio, buscador, campana, menú, Compras) pasa por estas
 * funciones para no exponer un dominio o dinero que el rol no debe ver.
 */

const normalizar = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

export function tipoDeFamilia(familiaId) {
  return getFamilia(familiaId)?.tipo === 'mantenimiento' ? 'mantenimiento' : 'sistemas'
}

/** Equipos (pieza individual) de los dominios que el rol puede ver. */
export function equiposVisibles(role) {
  const doms = dominiosVisibles(role)
  return listEquipos().filter((e) => doms.includes(tipoDeFamilia(e.familiaId)))
}

/** Materiales de los dominios que el rol puede ver (por familia; los materiales son de Mantenimiento). */
export function materialesVisibles(role) {
  const doms = dominiosVisibles(role)
  return listMateriales().filter((m) => doms.includes(tipoDeFamilia(m.familiaId)))
}

/** Solicitudes que el rol puede ver: por dominio, y el solicitante solo las propias. */
export function solicitudesVisibles(role, userId) {
  if (!canViewSolicitudes(role)) return []
  const tipos = solicitudesTiposVisibles(role)
  const propias = solicitudesSoloPropias(role)
  return listSolicitudes().filter((s) => tipos.includes(s.tipo) && (!propias || (!!userId && s.creadoPor === userId)))
}

/**
 * Solicitudes por atender (insignia del menú): los operadores, pendientes y pendientes de compra de su dominio;
 * Adquisiciones, solo las pendientes de compra (lo que le toca comprar). El solicitante no tiene insignia.
 */
export function solicitudesPorAtender(role) {
  track()
  if (role === 'adquisiciones') return listSolicitudes({ estado: 'pendiente_compra' }).length
  const doms = dominiosOperados(role)
  if (doms.length === 0) return 0
  return listSolicitudes().filter((s) => doms.includes(s.tipo) && (s.estado === 'pendiente' || s.estado === 'pendiente_compra')).length
}

/** Estados de una requisición en los que ya hay dinero autorizado por entregar o comprobar (lo que le toca a Tesorería o a Cuentas por pagar). */
const ESTADOS_CON_DINERO = ['autorizada', 'fondeada', 'comprada', 'entregada']

/**
 * ¿El rol ve esta requisición? Custodios (Soporte/Mantenimiento): solo las que tienen partidas con destino a su inventario
 * o las que solicitó él/su área. Tesorería: solo las que ya tienen dinero autorizado Y se pagan en EFECTIVO. Cuentas por pagar: solo las que ya tienen
 * dinero autorizado y se pagan por TRANSFERENCIA o TARJETA. Los demás roles de Compras: todas.
 */
export function requisicionVisible(role, req, nombreUsuario) {
  if (role === 'tesoreria') return ESTADOS_CON_DINERO.includes(req.estado) && destinoDePago(req.formaPago) === 'tesoreria'
  if (role === 'cuentas_por_pagar') return ESTADOS_CON_DINERO.includes(req.estado) && destinoDePago(req.formaPago) === 'cuentas_por_pagar'
  if (!esCustodioCompras(role)) return true
  const destino = role === 'capturista' ? 'ti' : 'mantenimiento'
  if (listPartidas(req.folio).some((p) => destinoDeCategoria(p.categoriaId) === destino)) return true
  if (nombreUsuario && normalizar(req.solicitanteNombre) === normalizar(nombreUsuario)) return true
  const rolParticipante = role === 'capturista' ? 'infraestructura' : 'mantenimiento'
  return !!getParticipante(req.solicitanteId)?.roles.includes(rolParticipante)
}

/** Requisiciones que el rol puede ver (para listas, tablero y KPIs de Compras). */
export function requisicionesVisibles(role, nombreUsuario) {
  const todas = listRequisiciones()
  return role ? todas.filter((r) => requisicionVisible(role, r, nombreUsuario)) : []
}
