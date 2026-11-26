import { track } from './reactive'
import { listSolicitudes } from './inventario/solicitudes'
import { materialesBajoMinimo } from './inventario/mantenimiento'
import { proximosMantenimientos } from './inventario/mantenimientoProgramado'
import { getFamilia } from './inventario/comunes'
import { getAlertasRol } from './alertasRol'
import { getMisPendientes } from './misPendientes'
import { user } from './auth'
import { dominiosOperados } from './access'
import { equiposVisibles } from './vistaRol'
import { parseLocalDate, toLocalDateString } from './dateUtils'

/**
 * @typedef {'solicitud_pendiente' | 'solicitud_pendiente_compra' | 'stock_bajo' | 'mantenimiento_proximo' |
 *   'garantia_por_vencer' | 'control_alta' | 'control_media' | 'mis_pendientes'} NotificacionTipo
 */

/**
 * @typedef {object} Notificacion
 * @property {string} id
 * @property {NotificacionTipo} tipo
 * @property {string} titulo
 * @property {string} detalle
 * @property {string} href
 * @property {'alta' | 'media' | 'baja'} [severidad] - Solo en `mis_pendientes`: define el color de la fila.
 */

function diasHasta(fechaISO) {
  const hoy = parseLocalDate(toLocalDateString(new Date()))
  const fecha = parseLocalDate(fechaISO)
  return Math.round((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Notificaciones del usuario, con el MISMO alcance que el resto de la app (ver lib/access.js):
 * - Solicitudes pendientes y garantías: solo del dominio que el rol opera (Dirección, ambos). Pendientes de compra: además Adquisiciones.
 * - Stock bajo mínimo: quien opera Mantenimiento y Adquisiciones (cantidades). Mantenimiento programado: Mantenimiento y Dirección.
 * - Alertas de control: `getAlertasRol` (cada rol solo su dominio/función; Compras y dinero global solo Dirección y Finanzas).
 * Sin rol (sin sesión) no hay notificaciones.
 */
export function getNotificaciones(role = user.value?.role) {
  track()
  const notifs = []
  if (!role) return notifs

  // Grupo "Tus pendientes": por rol, con conteos (p. ej. Finanzas: "3 por autorizar"). Enlaza a donde se resuelve.
  getMisPendientes(role)
    .filter((p) => !p.soloInicio)
    .forEach((p) =>
      notifs.push({ id: `pend-${p.id}`, tipo: 'mis_pendientes', titulo: `${p.conteo} ${p.corto}`, detalle: p.detalle, href: p.ruta.startsWith('#') ? '/' : p.ruta, severidad: p.severidad }),
    )

  const operados = dominiosOperados(role)
  const operaMantenimiento = operados.includes('mantenimiento')

  if (operados.length > 0) {
    listSolicitudes({ estado: 'pendiente' })
      .filter((s) => operados.includes(s.tipo))
      .forEach((s) => notifs.push({ id: `sol-${s.id}`, tipo: 'solicitud_pendiente', titulo: 'Solicitud pendiente', detalle: s.descripcion, href: '/solicitudes' }))
  }
  // Pendientes de compra: lo que el custodio espera y lo que Adquisiciones debe comprar.
  listSolicitudes({ estado: 'pendiente_compra' })
    .filter((s) => role === 'adquisiciones' || operados.includes(s.tipo))
    .forEach((s) =>
      notifs.push({
        id: `solc-${s.id}`,
        tipo: 'solicitud_pendiente_compra',
        titulo: 'Pendiente de compra',
        detalle: `${s.descripcion}${s.fechaEstimada ? ` · est. ${s.fechaEstimada}` : ''}`,
        href: '/solicitudes',
      }),
    )

  if (operaMantenimiento || role === 'adquisiciones') {
    materialesBajoMinimo().forEach((m) =>
      notifs.push({
        id: `mat-${m.id}`,
        tipo: 'stock_bajo',
        titulo: 'Bajo el mínimo',
        detalle: `${m.nombre}: ${m.cantidadActual}/${m.minimo} ${m.unidadMedida}`,
        href: '/mantenimiento',
      }),
    )
  }
  if (operaMantenimiento) {
    proximosMantenimientos(7).forEach((p) => {
      const dias = diasHasta(p.proximaFecha)
      notifs.push({
        id: `mp-${p.id}`,
        tipo: 'mantenimiento_proximo',
        titulo: dias < 0 ? 'Mantenimiento vencido' : 'Mantenimiento próximo',
        detalle: `${p.nombre} · ${p.proximaFecha}`,
        href: '/mantenimiento',
      })
    })
  }
  if (operados.length > 0) {
    equiposVisibles(role)
      .filter((e) => e.garantiaMeses && e.fechaCompra && e.estado !== 'baja')
      .forEach((e) => {
        const venc = parseLocalDate(e.fechaCompra)
        venc.setMonth(venc.getMonth() + e.garantiaMeses)
        const vencStr = toLocalDateString(venc)
        const dias = diasHasta(vencStr)
        if (dias <= 30) {
          notifs.push({
            id: `gar-${e.id}`,
            tipo: 'garantia_por_vencer',
            titulo: dias < 0 ? 'Garantía vencida' : 'Garantía por vencer',
            detalle: `${e.modelo || e.numeroSerie || e.id} · ${vencStr}`,
            href: getFamilia(e.familiaId)?.tipo === 'mantenimiento' ? '/mantenimiento' : '/sistemas',
          })
        }
      })
  }

  // Grupo "Control": alertas altas una por una y un resumen de las medias (detalle en Inicio). Solo las que el rol puede ver.
  const alertas = getAlertasRol(role)
  alertas
    .filter((a) => a.severidad === 'alta')
    .forEach((a) => notifs.push({ id: `ctl-${a.id}`, tipo: 'control_alta', titulo: a.titulo, detalle: a.detalle, href: a.regla === 'intentos_borrado' ? '/bitacora?accion=intento_borrado' : '/' }))
  const medias = alertas.filter((a) => a.severidad === 'media')
  if (medias.length > 0) {
    notifs.push({
      id: 'ctl-medias',
      tipo: 'control_media',
      titulo: `${medias.length} ${medias.length === 1 ? 'alerta' : 'alertas'} de control (severidad media)`,
      detalle: medias.map((a) => a.titulo).join(' · '),
      href: '/',
    })
  }

  return notifs
}
