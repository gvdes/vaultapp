import { track } from './reactive'
import { getFamilia } from './inventario/comunes'
import { listEquipos } from './inventario/sistemas'
import { materialesBajoMinimo } from './inventario/mantenimiento'
import { listAuditorias, programacionAuditorias } from './inventario/auditorias'
import {
  HORAS_AUTORIZACION_LENTA,
  DIAS_REQ_ESTANCADA,
  DIAS_SERIE_PENDIENTE,
  DIAS_SIN_COMPROBAR,
  diasHabilesEntre,
  dineroSinComprobar,
  getAlertasControl,
  horasHabilesEntre,
  infoRequisicion,
  motivoSinResponsiva,
  textoDiasHabiles,
  textoHorasHabiles,
} from './inventario/alertasControl'
import {
  ESTADOS,
  ESTADOS_TODOS,
  RUTAS_COMPRAS,
  comparativo,
  destinoDePago,
  esAbierta,
  esAprobadorElegible,
  estadoAutorizacion,
  estadoDiferencia,
  formatoMoneda,
  getConfig,
  getHistorial,
  listCompras,
  listCotizaciones,
  listRequisiciones,
  participanteDeUsuario,
  r2,
  recepcionesPendientes,
  resumenCompra,
  resumenDinero,
} from './compras'

/**
 * "Mis pendientes": lo que cada rol puede (y debe) hacer ahora, con severidad, conteo y la pantalla donde se resuelve.
 * Es la fuente de las tarjetas "Tus pendientes" del Inicio y del grupo "Tus pendientes" de la campana de notificaciones.
 * Los umbrales (días hábiles, etc.) viven en lib/inventario/alertasControl.js. Los getters llaman a `track()`.
 */

/**
 * @typedef {object} MiPendiente
 * @property {string} id
 * @property {string} titulo
 * @property {string} corto - Etiqueta corta para la campana: "3 por autorizar".
 * @property {string} detalle
 * @property {number} conteo
 * @property {SeveridadAlerta} severidad
 * @property {string} ruta - Ruta de la pantalla donde se atiende; una ruta que empieza con `#` es un ancla dentro del Inicio.
 * @property {number} [monto] - Dinero involucrado (MXN), cuando aplica.
 * @property {boolean} [soloInicio] - Ya lo cubren otras notificaciones de la campana: solo se muestra en el Inicio.
 */

const ROLES_CON_PENDIENTES = ['adquisiciones', 'finanzas', 'tesoreria', 'cuentas_por_pagar', 'capturista', 'mantenimiento', 'talento', 'admin']

/** Los solicitantes no tienen pendientes accionables (consultan; usan su liga pública). Talento: responsivas por firmar. */
export function rolTienePendientes(role) {
  return ROLES_CON_PENDIENTES.includes(role)
}

const ORDEN = { alta: 0, media: 1, baja: 2 }
const plural = (n, uno, varios) => (n === 1 ? uno : varios)
const money = (n) => formatoMoneda(n)
/** Monto redondo sin centavos para títulos ($50,000). */
const moneyCorto = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

function rutaLista(reqs, query) {
  return reqs.length === 1 ? RUTAS_COMPRAS.requisicion(reqs[0].folio) : `${RUTAS_COMPRAS.lista}?${query}`
}

/** Antigüedad en días hábiles de la más vieja: `fecha(info)`. */
function masVieja(infos, fecha, now) {
  let mejor
  infos.forEach((i) => {
    const habiles = diasHabilesEntre(fecha(i), now)
    if (!mejor || habiles > mejor.habiles) mejor = { folio: i.req.folio, habiles }
  })
  return mejor
}

const hayUrgente = (infos) => infos.some((i) => i.req.urgencia === 'urgente')

/** La requisición que más lleva esperando, en HORAS hábiles (política v1.1: la autorización se mide en horas, no en días). */
function masViejaHoras(infos, now) {
  let mejor
  infos.forEach((i) => {
    const horas = horasHabilesEntre(i.enEstadoDesde, now)
    if (!mejor || horas > mejor.horas) mejor = { folio: i.req.folio, horas }
  })
  return mejor
}
const masViejaHorasTexto = (v) => (v ? ` La más antigua (${v.folio}) lleva ${textoHorasHabiles(v.horas)}.` : '')

function masViejaTexto(v) {
  return v ? ` La más antigua (${v.folio}) lleva ${textoDiasHabiles(v.habiles)}.` : ''
}

/** Pendientes del rol, de lo más grave a lo menos. */
export function getMisPendientes(role) {
  track()
  if (!rolTienePendientes(role)) return []
  const now = Date.now()
  const out = []
  const push = (p) => {
    if (p && p.conteo > 0) out.push(p)
  }

  // Requisiciones (se calculan una vez por llamada; solo los roles de Compras las necesitan).
  const todas = ['admin', 'adquisiciones', 'finanzas', 'tesoreria', 'cuentas_por_pagar'].includes(role)
    ? listRequisiciones().filter((r) => r.estado !== 'rechazada' && r.estado !== 'cancelada').map(infoRequisicion)
    : []
  const en = (estado) => todas.filter((i) => i.req.estado === estado)
  const reqsDe = (infos) => infos.map((i) => i.req)

  /** Pendiente de requisiciones: alta si hay urgentes o la más vieja pasa el umbral (días hábiles); si no, `base`. */
  const deRequisiciones = (
    id,
    titulo,
    corto,
    detalle,
    infos,
    query,
    opts = {},
  ) => {
    if (infos.length === 0) return null
    const fecha = opts.fecha ?? ((i) => i.enEstadoDesde)
    const v = masVieja(infos, fecha, now)
    const vencida = (v?.habiles ?? 0) > (opts.umbralHabiles ?? DIAS_REQ_ESTANCADA)
    const monto = opts.monto ? r2(infos.reduce((s, i) => s + opts.monto(i), 0)) : undefined
    return {
      id,
      titulo,
      corto,
      detalle: detalle(v),
      conteo: infos.length,
      severidad: hayUrgente(infos) || vencida ? 'alta' : (opts.base ?? 'media'),
      ruta: rutaLista(reqsDe(infos), query),
      ...(monto ? { monto } : {}),
    }
  }

  /** Comprobaciones pendientes (comprada/entregada con gasto sin comprobar; con `incluirFondeadas` también el dinero entregado hace más de N días). */
  const sinComprobacion = (incluirFondeadas) =>
    todas.filter((i) => {
      if (i.req.estado === 'comprada' || i.req.estado === 'entregada') return resumenDinero(i.req.folio).pendienteComprobar > 0
      if (incluirFondeadas && i.req.estado === 'fondeada') {
        const d = dineroSinComprobar(i)
        return !!d && (now - d.desde) / 86400000 > DIAS_SIN_COMPROBAR
      }
      return false
    })

  const diferenciasPendientes = () => todas.filter((i) => ['fondeada', 'comprada', 'entregada'].includes(i.req.estado) && estadoDiferencia(i.req.folio) === 'pendiente_finanzas')

  const auditoriasPorVerificar = (tipo) => {
    const lista = listAuditorias().filter((a) => a.estado === 'por_verificar' && (tipo === 'todas' || a.tipo === tipo))
    if (lista.length === 0) return null
    return {
      id: 'auditorias-por-verificar',
      titulo: 'Auditorías por verificar',
      corto: plural(lista.length, 'auditoría por verificar', 'auditorías por verificar'),
      detalle: `${lista.length} ${plural(lista.length, 'conteo enviado espera', 'conteos enviados esperan')} tu verificación para cerrarse.`,
      conteo: lista.length,
      severidad: 'media',
      ruta: '/auditorias',
    }
  }

  const recepciones = (destino) => {
    const lista = recepcionesPendientes(destino)
    if (lista.length === 0) return null
    const masVieja = Math.min(...lista.map((r) => r.createdAt))
    const habiles = diasHabilesEntre(masVieja, now)
    const productos = lista.slice(0, 2).map((r) => `${r.cantidad} × ${r.datos.producto}`).join(', ')
    return {
      id: 'recepciones-pendientes',
      titulo: `Recepciones pendientes de ${destino === 'ti' ? 'Sistemas' : 'Mantenimiento'}`,
      corto: plural(lista.length, 'recepción por confirmar', 'recepciones por confirmar'),
      detalle: `Compras ya hechas que esperan tu confirmación de recibido (${productos}${lista.length > 2 ? ` y ${lista.length - 2} más` : ''}). La más antigua lleva ${textoDiasHabiles(habiles)}.`,
      conteo: lista.length,
      severidad: habiles > DIAS_REQ_ESTANCADA ? 'alta' : 'media',
      ruta: destino === 'ti' ? '/sistemas' : '/mantenimiento',
    }
  }

  // -------------------------------------------------------------------------------------------------------------------
  if (role === 'adquisiciones') {
    push(deRequisiciones('recibidas-por-validar', 'Requisiciones recibidas por validar', 'por validar', (v) => `Valídalas y empieza a cotizar.${masViejaTexto(v)}`, en('recibida'), 'estado=recibida', { fecha: (i) => i.req.createdAt }))
    push(
      deRequisiciones(
        'cotizacion-sin-cotizaciones',
        'En cotización sin ninguna cotización',
        'sin cotizar',
        (v) => `Ya están en cotización pero no hay un solo precio registrado.${masViejaTexto(v)}`,
        en('en_cotizacion').filter((i) => listCotizaciones(i.req.folio).length === 0),
        'estado=en_cotizacion',
      ),
    )
    push(deRequisiciones('fondeadas-sin-comprar', 'Fondeadas: ya puedes comprar', 'por comprar', (v) => `Tesorería ya entregó el dinero; registra la compra con costos reales y comprobante.${masViejaTexto(v)}`, en('fondeada'), 'estado=fondeada'))
    push(
      deRequisiciones(
        'compradas-sin-comprobacion',
        'Compras sin comprobación',
        'sin comprobar',
        () => 'Falta subir el ticket o factura del gasto y devolver el cambio.',
        sinComprobacion(false),
        'estado=comprada',
        { umbralHabiles: DIAS_SIN_COMPROBAR },
      ),
    )
    push(deRequisiciones('diferencias-pendientes', 'Diferencias esperando a Finanzas', 'diferencias', () => 'Lo comprado rebasó lo autorizado; Finanzas debe re-aprobar la diferencia.', diferenciasPendientes(), 'estado=comprada', { fecha: (i) => i.enEstadoDesde }))
    push(deRequisiciones('autorizadas-espera-fondeo', 'Autorizadas, en espera de fondeo', 'autorizadas', () => 'Finanzas ya autorizó; Tesorería debe entregar el dinero. Ve preparando la compra.', en('autorizada'), 'estado=autorizada', { base: 'baja', umbralHabiles: 99 }))
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Finanzas: solo lo que ESTE usuario puede decidir según su tope de aprobación (cada aprobador está ligado a un participante del directorio).
  if (role === 'finanzas') {
    const yo = participanteDeUsuario()
    if (!yo || !yo.activo || !yo.roles.includes('finanzas')) {
      push({
        id: 'finanzas-sin-liga',
        titulo: 'Tu usuario no está ligado a un aprobador',
        corto: 'sin liga a un aprobador',
        detalle: 'Sin esa liga no puedes aprobar ni rechazar compras en la plataforma. Pide a Dirección que ligue tu usuario con tu participante del directorio.',
        conteo: 1,
        severidad: 'alta',
        ruta: '/directorio',
      })
    }
    const porAutorizar = en('en_autorizacion').filter((i) => {
      const e = estadoAutorizacion(i.req.folio)
      return e.pendiente === 'finanzas' && esAprobadorElegible(yo, e.monto)
    })
    if (porAutorizar.length > 0) {
      const v = masViejaHoras(porAutorizar, now)
      const monto = r2(porAutorizar.reduce((s, i) => s + estadoAutorizacion(i.req.folio).monto, 0))
      push({
        id: 'requisiciones-por-autorizar',
        titulo: 'Requisiciones por autorizar',
        corto: 'por autorizar',
        detalle: `Esperan tu decisión (aprobar, rechazar o pedir ajuste); solo las que tu tope de aprobación cubre.${masViejaHorasTexto(v)}`,
        conteo: porAutorizar.length,
        severidad: hayUrgente(porAutorizar) || (v?.horas ?? 0) > HORAS_AUTORIZACION_LENTA ? 'alta' : 'media',
        ruta: rutaLista(reqsDe(porAutorizar), 'estado=en_autorizacion'),
        ...(monto ? { monto } : {}),
      })
    }
    push(deRequisiciones('diferencias-por-aprobar', 'Diferencias por aprobar', 'diferencias por aprobar', () => 'Compras que rebasaron lo autorizado y necesitan tu re-aprobación o justificación (solo las que tu tope cubre).', diferenciasPendientes().filter((i) => esAprobadorElegible(yo, Math.max(resumenCompra(i.req.folio).totalReal, estadoAutorizacion(i.req.folio).monto))), 'estado=comprada', { monto: (i) => Math.max(0, resumenDinero(i.req.folio).gastado - (i.req.montoAutorizado ?? 0)) }))
    // El monto de las "por autorizar" se muestra en el detalle.
    const p = out.find((x) => x.id === 'requisiciones-por-autorizar')
    if (p?.monto) p.detalle += ` Monto total: ${money(p.monto)}.`
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Ruteo del pago: Tesorería solo ve y atiende lo que se paga en EFECTIVO; Cuentas por pagar, lo que se paga por transferencia o tarjeta.
  const esEfectivo = (i) => destinoDePago(i.req.formaPago) === 'tesoreria'
  if (role === 'tesoreria') {
    push(
      deRequisiciones('autorizadas-por-fondear', 'Autorizadas por fondear', 'por fondear', () => 'Registra la entrega del efectivo (folio de caja chica, familia de gasto y quién recibe).', en('autorizada').filter(esEfectivo), 'estado=autorizada', {
        monto: (i) => i.req.montoAutorizado ?? 0,
      }),
    )
    const p = out.find((x) => x.id === 'autorizadas-por-fondear')
    if (p?.monto) p.detalle += ` Monto total por entregar: ${money(p.monto)}.`
    push(deRequisiciones('comprobaciones-pendientes', 'Comprobaciones pendientes', 'por comprobar', () => 'Gasto o efectivo entregado sin ticket/factura todavía.', sinComprobacion(true).filter(esEfectivo), 'estado=comprada', { umbralHabiles: DIAS_SIN_COMPROBAR }))
    push(
      deRequisiciones(
        'cambio-por-devolver',
        'Cambio por devolver a caja',
        'cambio por devolver',
        () => 'Efectivo entregado y no gastado que aún no regresa a Tesorería.',
        todas.filter((i) => esEfectivo(i) && (i.req.estado === 'comprada' || i.req.estado === 'entregada') && resumenDinero(i.req.folio).pendienteDevolver > 0),
        'estado=comprada',
        { base: 'baja', monto: (i) => resumenDinero(i.req.folio).pendienteDevolver },
      ),
    )
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Cuentas por pagar: pagos por hacer (autorizadas de transferencia o tarjeta sin pago registrado; la más antigua).
  if (role === 'cuentas_por_pagar') {
    const porPagar = en('autorizada').filter((i) => !esEfectivo(i))
    push(
      deRequisiciones(
        'pagos-por-hacer',
        'Pagos por hacer',
        'por pagar',
        (v) => `Autorizadas por transferencia o tarjeta: registra la referencia, la fecha y el comprobante del pago.${masViejaTexto(v)}`,
        porPagar,
        'estado=autorizada',
        { monto: (i) => i.req.montoAutorizado ?? 0 },
      ),
    )
    const p = out.find((x) => x.id === 'pagos-por-hacer')
    if (p?.monto) p.detalle += ` Monto total por pagar: ${money(p.monto)}.`
  }

  // -------------------------------------------------------------------------------------------------------------------
  if (role === 'capturista') {
    push(recepciones('ti'))
    const equipos = listEquipos().filter((e) => e.estado !== 'baja' && getFamilia(e.familiaId)?.tipo === 'sistemas')
    const pendientes = equipos.filter((e) => e.numeroSerie?.trim().toUpperCase().startsWith('PENDIENTE-'))
    if (pendientes.length > 0) {
      const viejas = pendientes.filter((e) => (now - e.createdAt) / 86400000 > DIAS_SERIE_PENDIENTE).length
      push({
        id: 'series-pendientes',
        titulo: 'Equipos con serie PENDIENTE',
        corto: plural(pendientes.length, 'serie por capturar', 'series por capturar'),
        detalle: `Captura el número de serie real${viejas > 0 ? `; ${viejas} ${plural(viejas, 'lleva', 'llevan')} más de ${DIAS_SERIE_PENDIENTE} días` : ''}. Sin serie no hay trazabilidad ni garantía.`,
        conteo: pendientes.length,
        severidad: viejas > 0 ? 'media' : 'baja',
        ruta: '/sistemas',
      })
    }
    push(auditoriasPorVerificar('sistemas'))
    const sinResp = equipos.filter((e) => e.estado === 'asignado' && motivoSinResponsiva(e, now))
    if (sinResp.length > 0) {
      push({
        id: 'equipos-sin-responsiva',
        titulo: 'Equipos asignados sin responsiva firmada',
        corto: plural(sinResp.length, 'equipo sin responsiva', 'equipos sin responsiva'),
        detalle: 'Genera la responsiva y adjunta el documento firmado (GV-INF-008 exige 100%).',
        conteo: sinResp.length,
        severidad: 'alta',
        ruta: '/sistemas',
      })
    }
  }

  // -------------------------------------------------------------------------------------------------------------------
  if (role === 'mantenimiento') {
    push(recepciones('mantenimiento'))
    const bajo = materialesBajoMinimo()
    if (bajo.length > 0) {
      push({
        id: 'bajo-minimo',
        titulo: 'Materiales bajo el mínimo',
        corto: plural(bajo.length, 'material bajo el mínimo', 'materiales bajo el mínimo'),
        detalle: `Riesgo de desabasto: ${bajo.slice(0, 3).map((m) => m.nombre).join(', ')}${bajo.length > 3 ? ` y ${bajo.length - 3} más` : ''}.`,
        conteo: bajo.length,
        severidad: 'media',
        ruta: '/mantenimiento',
        soloInicio: true,
      })
    }
    push(auditoriasPorVerificar('mantenimiento'))
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Talento: responsivas (solo equipos de Sistemas, el único inventario que consulta).
  if (role === 'talento') {
    const sinResp = listEquipos().filter((e) => e.estado === 'asignado' && getFamilia(e.familiaId)?.tipo === 'sistemas' && motivoSinResponsiva(e, now))
    push(
      sinResp.length > 0
        ? {
            id: 'talento-sin-responsiva',
            titulo: 'Equipos asignados sin responsiva firmada',
            corto: plural(sinResp.length, 'equipo sin responsiva', 'equipos sin responsiva'),
            detalle: 'Da seguimiento con cada responsable para que firme y se adjunte el documento (GV-INF-008 exige 100%).',
            conteo: sinResp.length,
            severidad: 'alta',
            ruta: '/sistemas',
          }
        : null,
    )
  }

  // -------------------------------------------------------------------------------------------------------------------
  if (role === 'admin') {
    const abiertas = todas.filter((i) => esAbierta(i.req.estado))
    push(
      deRequisiciones(
        'requisiciones-sin-movimiento',
        'Requisiciones sin movimiento',
        'estancadas',
        (v) => `Más de ${DIAS_REQ_ESTANCADA} días hábiles sin ningún cambio en su historial.${masViejaTexto(v)}`,
        abiertas.filter((i) => i.req.estado !== 'en_espera' && diasHabilesEntre(i.ultimoMovimiento, now) > DIAS_REQ_ESTANCADA),
        'abiertas=1',
        { fecha: (i) => i.ultimoMovimiento },
      ),
    )
    const enAut = en('en_autorizacion')
    // Autorización lenta (horas hábiles, política v1.1): Dirección da seguimiento; la decisión es de Finanzas.
    const lentas = enAut.filter((i) => horasHabilesEntre(i.enEstadoDesde, now) > HORAS_AUTORIZACION_LENTA)
    if (lentas.length > 0) {
      const v = masViejaHoras(lentas, now)
      push({
        id: 'autorizaciones-lentas',
        titulo: `En autorización por más de ${HORAS_AUTORIZACION_LENTA} horas hábiles`,
        corto: 'autorizaciones lentas',
        detalle: `Finanzas no ha decidido (lunes a viernes 9:00–18:00, sábado 9:00–16:00).${masViejaHorasTexto(v)}`,
        conteo: lentas.length,
        severidad: 'alta',
        ruta: rutaLista(reqsDe(lentas), 'estado=en_autorizacion'),
      })
    }
    // Informativo: Dirección NO aprueba; recibe un aviso de cada compra mayor al umbral y aquí la ve (la autoriza Finanzas).
    const avisadas = [...enAut, ...en('autorizada')].filter((i) => estadoAutorizacion(i.req.folio).avisaDireccion)
    if (avisadas.length > 0) {
      const monto = r2(avisadas.reduce((s, i) => s + estadoAutorizacion(i.req.folio).monto, 0))
      push({
        id: 'avisos-direccion',
        titulo: `Avisos de compras > ${moneyCorto(getConfig().umbralDireccion)}`,
        corto: `aviso${avisadas.length === 1 ? '' : 's'} de compras > ${moneyCorto(getConfig().umbralDireccion)}`,
        detalle: `Para tu conocimiento: las autoriza Finanzas, no requieren tu autorización. Monto total: ${money(monto)}.`,
        conteo: avisadas.length,
        severidad: 'baja',
        ruta: rutaLista(reqsDe(avisadas), 'estado=en_autorizacion'),
        monto,
      })
    }
    push(
      deRequisiciones(
        'urgentes-abiertas',
        'Requisiciones urgentes abiertas',
        'urgentes abiertas',
        (v) => `Lo urgente sin cerrar suele terminar en compras apresuradas.${masViejaTexto(v)}`,
        abiertas.filter((i) => i.req.urgencia === 'urgente'),
        'urgentes=1',
        { fecha: (i) => i.req.createdAt, umbralHabiles: 2 },
      ),
    )
    // Las altas de compras ya salen arriba como pendientes propios; aquí quedan las demás (inventario, dinero, funciones).
    const REGLAS_YA_CUBIERTAS = ['requisicion_estancada', 'autorizacion_lenta', 'urgente_abierta']
    const altas = getAlertasControl(undefined, { incluirCompras: true }).filter((a) => a.severidad === 'alta' && !REGLAS_YA_CUBIERTAS.includes(a.regla))
    if (altas.length > 0) {
      push({
        id: 'alertas-altas',
        titulo: 'Alertas de control de severidad alta',
        corto: plural(altas.length, 'alerta alta', 'alertas altas'),
        detalle: altas.slice(0, 3).map((a) => a.titulo).join(' · ') + (altas.length > 3 ? ` y ${altas.length - 3} más` : ''),
        conteo: altas.length,
        severidad: 'alta',
        ruta: '#alertas-control-titulo',
        soloInicio: true,
      })
    }
    const vencidas = programacionAuditorias().filter((p) => p.vencida || p.programadaVencida)
    if (vencidas.length > 0) {
      push({
        id: 'auditorias-vencidas',
        titulo: 'Auditorías vencidas',
        corto: plural(vencidas.length, 'auditoría vencida', 'auditorías vencidas'),
        detalle: `${vencidas.length} ${plural(vencidas.length, 'ubicación rebasó', 'ubicaciones rebasaron')} su fecha trimestral o su fecha programada (GV-INF-008).`,
        conteo: vencidas.length,
        severidad: 'media',
        ruta: '/auditorias',
        soloInicio: true,
      })
    }
    push(auditoriasPorVerificar('todas'))
  }

  return out.sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad] || b.conteo - a.conteo)
}

// ---------------------------------------------------------------------------------------------------------------------
// Resumen de Compras Indirectas para el Inicio
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} ResumenComprasInicio
 * @property {number} abiertas
 * @property {number} porAutorizar
 * @property {number} porFondear
 * @property {number} compradasSemana
 * @property {number} autorizadoMes
 * @property {number} gastadoMes
 * @property {number} ahorroMes - Ahorro por cotización del mes: promedio de las cotizaciones completas menos la elegida (solo requisiciones con 2 o más).
 * @property {boolean} hayDatos - Hay al menos una requisición registrada.
 */

function inicioSemana(now) {
  const d = new Date(now)
  const atras = (d.getDay() + 6) % 7 // lunes = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - atras).getTime()
}

export function getResumenCompras() {
  track()
  const now = Date.now()
  const semana = inicioSemana(now)
  const d0 = new Date(now)
  const mes = new Date(d0.getFullYear(), d0.getMonth(), 1).getTime()
  const todas = listRequisiciones()
  let compradasSemana = 0
  let autorizadoMes = 0
  let ahorroMes = 0
  const ultimaEntrada = (folio, estado) => [...getHistorial(folio)].reverse().find((h) => h.aEstado === estado)?.fecha

  todas.forEach((r) => {
    if (r.estado === 'comprada' || r.estado === 'entregada') {
      const f = ultimaEntrada(r.folio, 'comprada')
      if (f !== undefined && f >= semana) compradasSemana++
    }
    if (['autorizada', 'fondeada', 'comprada', 'entregada'].includes(r.estado)) {
      const f = ultimaEntrada(r.folio, 'autorizada')
      if (f !== undefined && f >= mes) {
        autorizadoMes += r.montoAutorizado ?? 0
        const comp = comparativo(r.folio)
        const completas = comp.filas.filter((x) => x.completa)
        const elegida = completas.find((x) => x.cotizacion.id === comp.elegidaId)
        if (elegida && completas.length >= 2) {
          const prom = completas.reduce((s, x) => s + x.total, 0) / completas.length
          ahorroMes += Math.max(0, prom - elegida.total)
        }
      }
    }
  })
  const gastadoMes = r2(listCompras().filter((c) => c.fecha >= mes).reduce((s, c) => s + c.cantidadComprada * c.costoUnitarioReal, 0))
  return {
    abiertas: todas.filter((r) => esAbierta(r.estado)).length,
    porAutorizar: todas.filter((r) => r.estado === 'en_autorizacion').length,
    porFondear: todas.filter((r) => r.estado === 'autorizada').length,
    compradasSemana,
    autorizadoMes: r2(autorizadoMes),
    gastadoMes,
    ahorroMes: r2(ahorroMes),
    hayDatos: todas.length > 0,
  }
}

/**
 * @typedef {object} RequisicionesPorEstado
 * @property {EstadoReq} estado
 * @property {string} label
 * @property {string} color
 * @property {number} cantidad
 */

/** Requisiciones por estado (solo los estados con al menos una), en el orden del flujo. */
export function requisicionesPorEstado() {
  track()
  const todas = listRequisiciones()
  return ESTADOS_TODOS.map((estado) => ({ estado, label: ESTADOS[estado].corta, color: ESTADOS[estado].color, cantidad: todas.filter((r) => r.estado === estado).length })).filter((x) => x.cantidad > 0)
}

/** Requisiciones por área solicitante (las 8 con más), sin contar canceladas ni rechazadas. */
export function requisicionesPorArea() {
  track()
  const mapa = new Map()
  listRequisiciones()
    .filter((r) => r.estado !== 'cancelada' && r.estado !== 'rechazada')
    .forEach((r) => {
      const area = r.area?.trim() || 'Sin área'
      mapa.set(area, (mapa.get(area) ?? 0) + 1)
    })
  return [...mapa.entries()]
    .map(([area, cantidad]) => ({ area, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 8)
}

