import { registrarBitacora } from '../bitacora'
import { getUbicacion } from '../inventario/comunes'
import {
  DESTINO_PAGO_LABEL,
  ESTADOS,
  FORMA_PAGO_LABEL,
  RUTAS_COMPRAS,
  TIPO_PROVEEDOR_LABEL,
  destinoDePago,
  formatoMoneda,
  EXCEPCION_TIPO_LABEL,
  INSTRUIDA_POR_LABEL,
  textoExcepcion,
  textoLeyendaCompraMenor,
} from './tipos'
import { proveedorParaAprobar } from './proveedores'
import { crearTabla, modoLocal, nuevoId, ahora, errorDe, normalizar } from './store'
import { getConfig, urlBase } from './config'
import { participantesPorRol } from './participantes'
import { getRequisicion, listPartidas, registrarHookCreada, registrarHookTransicion } from './requisiciones'
import { textoAnticipo, textoCredito, textoEntrega, textoGarantia, textoSiNo } from './analisisCotizaciones'

/**
 * Bandeja de salida de correos (cmp_notificaciones) y plantillas en español.
 *
 * - Cada transición crea filas `pendiente`; un emisor externo (fase posterior: Apps Script de Google o Edge Function + SMTP
 *   corporativo) las envía y las marca `enviado`/`error`.
 * - En modo local/demo el estado es SIEMPRE `simulado` (la plataforma jamás envía correos desde el demo) y las pantallas
 *   los muestran como "vista previa de correos".
 * - Las ligas de aprobación llevan token de un solo uso; los correos con ligas de aprobación NO se copian a `copiasRespaldo`.
 */
const tNot = crearTabla({
  key: 'dga_cmp_notificaciones',
  tabla: 'cmp_notificaciones',
  pk: 'id',
  ts: ['createdAt', 'enviadoAt'],
  orderBy: 'created_at',
})

export const loadNotificacionesCache = () => tNot.load()
export const isNotificacionesCacheReady = () => tNot.isReady()
export function reiniciarNotificacionesLocal() {
  tNot.reiniciarLocal()
}

/**
 * @typedef {object} FiltroNotificaciones
 * @property {NotificacionCorreo['estado']} [estado]
 * @property {TipoCorreo} [tipo]
 * @property {string} [folio]
 * @property {string} [texto]
 * @property {string} [paraCorreo]
 */

export function listNotificaciones(filtro) {
  let list = [...tNot.list()]
  if (filtro?.estado) list = list.filter((n) => n.estado === filtro.estado)
  if (filtro?.tipo) list = list.filter((n) => n.tipo === filtro.tipo)
  if (filtro?.folio) list = list.filter((n) => n.requisicionId === filtro.folio)
  if (filtro?.paraCorreo) list = list.filter((n) => n.paraCorreo.toLowerCase() === filtro.paraCorreo?.toLowerCase())
  if (filtro?.texto) {
    const q = normalizar(filtro.texto)
    list = list.filter((n) => normalizar(`${n.asunto} ${n.paraCorreo} ${n.paraNombre ?? ''} ${n.requisicionId ?? ''}`).includes(q))
  }
  return list.sort((a, b) => b.createdAt - a.createdAt)
}

export function getNotificacion(id) {
  return tNot.get(id)
}

export function pendientesDeEnvio() {
  return listNotificaciones({ estado: 'pendiente' })
}

/**
 * @typedef {object} CorreoInput
 * @property {string} paraCorreo
 * @property {string} [paraNombre]
 * @property {string} asunto
 * @property {string} cuerpoHtml
 * @property {TipoCorreo} tipo
 * @property {string} [requisicionId]
 */

/** Encola un correo (y sus copias de respaldo, si están configuradas y el correo no lleva ligas de aprobación). */
export async function encolarCorreo(input) {
  if (!input.paraCorreo?.trim()) return undefined
  const simulado = modoLocal()
  const crear = (correo, nombre, asunto) => {
    const ms = ahora()
    return {
      id: `mail-${nuevoId()}`,
      paraCorreo: correo.trim(),
      paraNombre: nombre,
      asunto,
      cuerpoHtml: input.cuerpoHtml,
      tipo: input.tipo,
      requisicionId: input.requisicionId,
      estado: simulado ? 'simulado' : 'pendiente',
      enviadoAt: simulado ? ms : undefined,
      createdAt: ms,
    }
  }
  const principal = crear(input.paraCorreo, input.paraNombre, input.asunto)
  await tNot.insert(principal)
  if (!input.tipo.startsWith('autorizacion')) {
    for (const copia of getConfig().copiasRespaldo) {
      if (copia.toLowerCase() === input.paraCorreo.toLowerCase()) continue
      await tNot.insert(crear(copia, 'Copia de respaldo', `[Copia] ${input.asunto}`))
    }
  }
  return principal
}

/** Como encolarCorreo pero nunca lanza (un correo fallido no debe romper el flujo de compras). */
async function encolarSeguro(input) {
  try {
    await encolarCorreo(input)
  } catch (e) {
    console.warn('[compras] no se pudo encolar el correo:', errorDe(e).message)
  }
}

export async function marcarCorreoEnviado(id) {
  await tNot.update(id, { estado: modoLocal() ? 'simulado' : 'enviado', enviadoAt: ahora(), error: undefined })
  registrarBitacora({ tabla: 'cmp_notificaciones', registroId: id, accion: 'enviado' })
}

export async function marcarCorreoError(id, error) {
  await tNot.update(id, { estado: 'error', error })
  registrarBitacora({ tabla: 'cmp_notificaciones', registroId: id, accion: 'error', detalle: error })
}

/** Marca como simulado (vista previa) un correo pendiente: úsalo en demo. */
export async function marcarCorreoSimulado(id) {
  await tNot.update(id, { estado: 'simulado', enviadoAt: ahora() })
}

// ---------------------------------------------------------------------------------------------------------------------
// Plantillas HTML (misma apariencia que cmp_html() en 013_compras.sql)
// ---------------------------------------------------------------------------------------------------------------------
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @typedef {object} BotonCorreo
 * @property {string} texto
 * @property {string} url
 * @property {boolean} [peligro] - Estilo de botón secundario en rojo (Rechazar).
 */

export function htmlCorreo(o) {
  const botones = (o.botones ?? [])
    .map((b) =>
      b.peligro
        ? `<a href="${esc(b.url)}" style="background:#ffffff;color:#b42318;text-decoration:none;padding:9px 17px;border:1px solid #b42318;border-radius:8px;font-weight:700;display:inline-block;margin-right:8px">${esc(b.texto)}</a>`
        : `<a href="${esc(b.url)}" style="background:#1f5fae;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;display:inline-block;margin-right:8px">${esc(b.texto)}</a>`,
    )
    .join('')
  return (
    `<div style="font-family:Segoe UI,Arial,sans-serif;background:#f4f6fa;padding:24px">` +
    `<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dfe5ee;border-radius:10px;overflow:hidden">` +
    `<tr><td style="background:#1f5fae;color:#ffffff;padding:14px 20px;font-size:13px;font-weight:700;letter-spacing:.04em">GRUPO VIZCARRA · COMPRAS INDIRECTAS</td></tr>` +
    `<tr><td style="padding:22px 20px;color:#1f2937;font-size:14px;line-height:1.55">` +
    `<h2 style="margin:0 0 12px;font-size:17px;color:#111827">${esc(o.titulo)}</h2>${o.cuerpo}` +
    (botones ? `<p style="margin:20px 0 4px">${botones}</p>` : '') +
    `</td></tr><tr><td style="padding:12px 20px;font-size:11px;color:#6b7280;background:#f9fafb">Mensaje automático de la plataforma de inventarios. No respondas a este correo.</td></tr></table></div>`
  )
}

function filasResumen(filas) {
  return (
    `<table role="presentation" style="border-collapse:collapse;font-size:13px;margin:6px 0">` +
    filas.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b7280;vertical-align:top">${esc(k)}</td><td>${v}</td></tr>`).join('') +
    `</table>`
  )
}

function listaPartidasHtml(partidas) {
  return `<ul style="margin:8px 0;padding-left:18px">${partidas.map((p) => `<li>${esc(p.cantidad)} × ${esc(p.producto)}</li>`).join('')}</ul>`
}

function sucursales(req) {
  return req.ubicaciones.map((u) => getUbicacion(u)?.nombre ?? u).join(', ')
}

const linkSeguimiento = (r) => `${urlBase()}${RUTAS_COMPRAS.estatus(r.folio, r.token)}`
const linkRequisicion = (r) => `${urlBase()}${RUTAS_COMPRAS.requisicion(r.folio)}`

/**
 * @typedef {object} Plantilla
 * @property {string} asunto
 * @property {string} html
 */

/** 1) Confirmación al solicitante (folio + liga de seguimiento). */
export function plantillaConfirmacionSolicitante(req, partidas) {
  return {
    asunto: `Recibimos tu requisición ${req.folio}`,
    html: htmlCorreo({
      titulo: 'Recibimos tu requisición',
      cuerpo:
        `<p>Hola ${esc(req.solicitanteNombre)},</p><p>Tu requisición <b>${esc(req.folio)}</b> quedó registrada y será revisada por Adquisiciones. ` +
        `Puedes consultar su avance en cualquier momento con la liga de seguimiento.</p>${listaPartidasHtml(partidas)}`,
      botones: [{ texto: 'Ver seguimiento', url: linkSeguimiento(req) }],
    }),
  }
}

/** 2) Aviso a Adquisiciones de nueva solicitud. */
export function plantillaNuevaRequisicion(req, partidas) {
  const urgente = req.urgencia === 'urgente'
  return {
    asunto: `Nueva requisición ${req.folio}${urgente ? ' (URGENTE)' : ''}`,
    html: htmlCorreo({
      titulo: 'Nueva requisición por atender',
      cuerpo:
        `<p>${esc(req.solicitanteNombre)} (${esc(req.area)}) levantó la requisición <b>${esc(req.folio)}</b>${urgente ? ' marcada como <b>URGENTE</b>' : ''}.</p>` +
        filasResumen([
          ['Sucursal(es)', esc(sucursales(req))],
          ['Para cuándo', esc(req.fechaRequerida ?? 'Sin fecha')],
          ...(req.paraQuien ? [['Para quién', esc(req.paraQuien)]] : []),
        ]) +
        listaPartidasHtml(partidas),
      botones: [{ texto: 'Abrir en la plataforma', url: linkRequisicion(req) }],
    }),
  }
}

/**
 * @typedef {object} ContextoAutorizacion
 * @property {Requisicion} req
 * @property {Partida[]} partidas
 * @property {Comparativo} comparativo
 * @property {number} monto
 * @property {string} [justificacion]
 * @property {ProveedorAprobacion} [proveedor] - Proveedor del catálogo (SIN CLABE ni dirección fiscal: los correos no llevan datos bancarios).
 * @property {number} [umbralSinCotizacion] - Umbral de compra menor para la leyenda (por defecto el de la configuración).
 */

/** Filas del resumen con el proveedor del catálogo (sin CLABE ni dirección) y el destino del pago. */
function filasProveedor(prov) {
  if (!prov) return []
  const detalle = [prov.razonSocial, prov.rfc ? `RFC ${prov.rfc}` : ''].filter(Boolean).join(' · ')
  return [
    ['Proveedor (catálogo)', `<b>${esc(prov.nombreComercial)}</b>${detalle ? `<br>${esc(detalle)}` : ''}`],
    ['Tipo y pago', esc(`${TIPO_PROVEEDOR_LABEL[prov.tipo]} · ${FORMA_PAGO_LABEL[prov.formaPago]} → ${DESTINO_PAGO_LABEL[prov.destino]}`)],
  ]
}

/** Marcadores que el servidor/cliente sustituye por la liga de un solo uso de cada aprobador. */
export const MARCADOR_NOMBRE = '{{NOMBRE}}'
export const MARCADOR_APROBAR = '{{LIGA_APROBAR}}'
export const MARCADOR_RECHAZAR = '{{LIGA_RECHAZAR}}'
export const MARCADOR_AJUSTE = '{{LIGA_AJUSTE}}'

export function sustituirMarcadores(html, v) {
  return html
    .split(MARCADOR_NOMBRE)
    .join(esc(v.nombre))
    .split(MARCADOR_APROBAR)
    .join(v.aprobar)
    .split(MARCADOR_RECHAZAR)
    .join(v.rechazar)
    .split(MARCADOR_AJUSTE)
    .join(v.ajuste)
}

/**
 * Comparativo para quien autoriza: recomendación + un bloque por proveedor (nombre, total y puntaje arriba; entrega, garantía, crédito,
 * anticipo y distribuidor en una línea que se acomoda al ancho) + alertas. Tablas simples sin JS: legible en correo y en el celular (sin
 * columnas que obliguen a desplazarse). Los totales son los MISMOS de la app (costo total comparable).
 */
function tablaComparativo(c) {
  if (c.filas.length === 0) return ''
  const rec = c.filas.find((f) => f.cotizacion.id === c.recomendadaId)
  const varias = c.filas.length > 1
  const chico = (t) => `<span style="font-size:11px;color:#4b5563">${t}</span>`
  const bloques = c.filas
    .map((f) => {
      const k = f.cotizacion
      const etiquetas = [k.esRegistro ? 'Registro de compra menor' : k.elegida ? '✔ Elegida' : '', f.analisis.esRecomendada && varias ? '★ Recomendada' : '', f.esMasBarata && varias ? 'Más barata' : '']
        .filter(Boolean)
        .map(esc)
        .join(' · ')
      const detalle = k.esRegistro ? '' : [
        `Entrega: ${textoEntrega(k)}`,
        `Garantía: ${textoGarantia(k)}`,
        `Crédito: ${textoCredito(k)}`,
        `Anticipo: ${textoAnticipo(k)}`,
        `Distribuidor autorizado: ${textoSiNo(k.distribuidorAutorizado)}`,
      ]
        .map(esc)
        .join(' · ')
      const sub = [f.analisis.desglose.ivaIncluido ? '' : 'IVA sumado al total', varias && f.analisis.elegible ? `puntaje ${f.analisis.puntaje}/100` : ''].filter(Boolean).map(esc).join(' · ')
      return (
        `<table role="presentation" width="100%" style="border-collapse:collapse;margin:6px 0;border:1px solid #dfe5ee;${k.elegida ? 'background:#e3f5e9' : ''}">` +
        `<tr><td style="padding:6px 8px;vertical-align:top"><b>${esc(k.proveedor)}</b>${etiquetas ? `<br>${chico(etiquetas)}` : ''}</td>` +
        `<td align="right" style="padding:6px 8px;vertical-align:top;white-space:nowrap"><b>${f.completa ? esc(formatoMoneda(f.total)) : 'Incompleta'}</b>${sub ? `<br>${chico(sub)}` : ''}</td></tr>` +
        (detalle ? `<tr><td colspan="2" style="padding:0 8px 6px;font-size:12px;color:#374151">${detalle}</td></tr>` : '') +
        '</table>'
      )
    })
    .join('')
  const alertas = c.filas
    .filter((f) => !f.cotizacion.esRegistro && f.analisis.alertas.length > 0)
    .map((f) => `<li style="margin:2px 0"><b>${esc(f.cotizacion.proveedor)}:</b> ${f.analisis.alertas.map((a) => esc(a.label)).join(' · ')}</li>`)
    .join('')
  return (
    (rec && varias
      ? `<p style="margin:10px 0 4px"><b>Recomendada por el comparativo:</b> ${esc(rec.cotizacion.proveedor)} (puntaje ${esc(rec.analisis.puntaje)}/100)${rec.analisis.razones.length ? ` · ${esc(rec.analisis.razones.join('; '))}` : ''}.</p>`
      : '') +
    bloques +
    (alertas ? `<p style="margin:8px 0 2px;color:#b45309"><b>Alertas:</b></p><ul style="margin:0 0 6px;padding-left:18px;font-size:12px;color:#b45309">${alertas}</ul>` : '')
  )
}

/**
 * 3) Solicitud de autorización a Finanzas (resumen + comparativo + Aprobar / Rechazar / Abrir en la plataforma). Va a TODOS los
 * aprobadores elegibles (tope que cubre el monto); basta uno. El HTML trae MARCADORES (`{{LIGA_APROBAR}}`…) que se sustituyen por aprobador
 * (en Supabase los sustituye la RPC `cmp_solicitar_autorizacion`, así los tokens nunca viajan por el navegador).
 */
export function plantillaAutorizacion(ctx) {
  const { req } = ctx
  const filas = [
    ['Folio', `<b>${esc(req.folio)}</b>`],
    ['Solicitante', `${esc(req.solicitanteNombre)} · ${esc(req.area)}`],
    ['Sucursal(es)', esc(sucursales(req))],
    ['Urgencia', req.urgencia === 'urgente' ? '<b>URGENTE</b>' : 'Normal'],
    ['Proveedor elegido', esc(req.proveedorElegido ?? 'Sin definir')],
    ...filasProveedor(ctx.proveedor),
    ['Monto a autorizar', `<b>${esc(formatoMoneda(ctx.monto))} MXN</b>`],
  ]
  if (req.paraQuien) filas.push(['Para quién', esc(req.paraQuien)])
  let extra = ''
  // Compra menor: Finanzas debe ver que NO hay cotización, solo el registro (el comparativo trae una sola línea).
  if (ctx.comparativo.filas.some((f) => f.cotizacion.elegida && f.cotizacion.esRegistro)) {
    extra += `<p style="margin:8px 0;padding:6px 8px;background:#fff4e0;border:1px solid #f1c27d"><b>${esc(textoLeyendaCompraMenor(ctx.umbralSinCotizacion ?? getConfig().umbralSinCotizacion))}</b></p>`
  }
  if (ctx.justificacion) extra += `<p style="margin:8px 0"><b>Justificación de la elección:</b> ${esc(ctx.justificacion)}</p>`
  if (req.excepcionTipo || req.excepcionCotizaciones) extra += `<p style="margin:8px 0"><b>Excepción de cotizaciones:</b> ${esc(textoExcepcion(req))}</p>`
  return {
    asunto: `Autorización requerida · ${req.folio} · ${formatoMoneda(ctx.monto)}`,
    html: htmlCorreo({
      titulo: 'Autorización de compra',
      cuerpo:
        `<p>Hola ${MARCADOR_NOMBRE},</p><p>Se requiere tu decisión sobre esta compra (basta que decida uno de los aprobadores de Finanzas con tope suficiente). ` +
        `El correo con tu decisión queda como comprobante de autorización.</p>${filasResumen(filas)}${listaPartidasHtml(ctx.partidas)}${tablaComparativo(ctx.comparativo)}${extra}` +
        `<p style="font-size:12px;color:#6b7280">La liga es personal y de un solo uso. Al abrirla verás el detalle y confirmarás tu decisión.</p>`,
      botones: [
        { texto: 'Aprobar', url: MARCADOR_APROBAR },
        { texto: 'Rechazar', url: MARCADOR_RECHAZAR, peligro: true },
        { texto: 'Abrir en la plataforma', url: linkRequisicion(req) },
      ],
    }),
  }
}

/**
 * @typedef {object} ContextoAvisoDireccion
 * @property {Requisicion} req
 * @property {Partida[]} partidas
 * @property {Comparativo} comparativo
 * @property {number} monto
 * @property {number} umbral - Umbral de aviso vigente (cmp_config umbral_direccion).
 */

/**
 * 4) AVISO informativo a Dirección: la compra rebasa el umbral de aviso y la autoriza Finanzas. SIN botones, SIN token y SIN liga de
 * aprobación (Dirección no aprueba). Trae el marcador `{{NOMBRE}}`. Lleva resumen y comparativo. En Supabase lo encola la RPC
 * `cmp_solicitar_autorizacion` con el mismo texto.
 */
export function plantillaAvisoDireccion(ctx) {
  const { req } = ctx
  const filas = [
    ['Folio', `<b>${esc(req.folio)}</b>`],
    ['Solicitante', `${esc(req.solicitanteNombre)} · ${esc(req.area)}`],
    ['Sucursal(es)', esc(sucursales(req))],
    ['Urgencia', req.urgencia === 'urgente' ? '<b>URGENTE</b>' : 'Normal'],
    ['Proveedor elegido', esc(req.proveedorElegido ?? 'Sin definir')],
    ['Monto', `<b>${esc(formatoMoneda(ctx.monto))} MXN</b>`],
  ]
  if (req.paraQuien) filas.push(['Para quién', esc(req.paraQuien)])
  return {
    asunto: `Para tu conocimiento: compra de ${formatoMoneda(ctx.monto)} · ${req.folio}`,
    html: htmlCorreo({
      titulo: `Compra mayor a ${esc(formatoMoneda(ctx.umbral))}: aviso informativo`,
      cuerpo:
        `<p>Hola ${MARCADOR_NOMBRE},</p><p><b>Para tu conocimiento:</b> esta compra de <b>${esc(formatoMoneda(ctx.monto))} MXN</b> la autoriza Finanzas; no requiere tu autorización.</p>` +
        `${filasResumen(filas)}${listaPartidasHtml(ctx.partidas)}${tablaComparativo(ctx.comparativo)}`,
    }),
  }
}

/**
 * @typedef {object} ContextoAvisoExcepcion
 * @property {Requisicion} req
 * @property {number} monto
 */

/**
 * 4b) AVISO informativo a Dirección: la compra se envió a autorización CON excepción de cotizaciones (menos de las requeridas). SIN botones, SIN token
 * y SIN liga de aprobación. Trae el marcador `{{NOMBRE}}`. Solo nombres comerciales: nunca CLABE ni dirección fiscal.
 */
export function plantillaAvisoExcepcion(ctx) {
  const { req } = ctx
  const filas = [
    ['Folio', `<b>${esc(req.folio)}</b>`],
    ['Solicitante', `${esc(req.solicitanteNombre)} · ${esc(req.area)}`],
    ['Proveedor elegido', esc(req.proveedorElegido ?? 'Sin definir')],
    ['Monto', `<b>${esc(formatoMoneda(ctx.monto))} MXN</b>`],
    ['Tipo de excepción', esc(EXCEPCION_TIPO_LABEL[req.excepcionTipo] ?? 'Sin tipo')],
  ]
  if (req.excepcionTipo === 'adjudicacion_directa' && req.excepcionInstruidaPor) filas.push(['Instruida por', esc(INSTRUIDA_POR_LABEL[req.excepcionInstruidaPor] ?? req.excepcionInstruidaPor)])
  filas.push(['Justificación', esc(req.excepcionCotizaciones ?? '')])
  return {
    asunto: `Aviso: excepción de cotizaciones · ${req.folio}`,
    html: htmlCorreo({
      titulo: 'Excepción de cotizaciones: aviso informativo',
      cuerpo:
        `<p>Hola ${MARCADOR_NOMBRE},</p><p><b>Para tu conocimiento:</b> la compra ${esc(req.folio)} se envió a autorización con una excepción de cotizaciones (${esc(textoExcepcion(req))}). ` +
        `La autoriza Finanzas; <b>no requiere tu autorización</b>.</p>${filasResumen(filas)}`,
    }),
  }
}

/** 5) Aviso a Tesorería: fondos por entregar. */
export function plantillaTesoreria(req, monto) {
  return {
    asunto: `Fondos por entregar · ${req.folio}`,
    html: htmlCorreo({
      titulo: 'Compra autorizada: fondos por entregar',
      cuerpo:
        `<p>La requisición <b>${esc(req.folio)}</b> fue autorizada.</p>` +
        filasResumen([
          ['Monto aprobado', `<b>${esc(formatoMoneda(monto))} MXN</b>`],
          ['Solicitante', `${esc(req.solicitanteNombre)} · ${esc(req.area)}`],
          ['Forma de pago', esc(FORMA_PAGO_LABEL[req.formaPago] ?? FORMA_PAGO_LABEL.efectivo)],
        ]) +
        `<p>Registra la entrega con tu folio de caja chica y el tipo de gasto.</p>`,
      botones: [{ texto: 'Abrir en la plataforma', url: linkRequisicion(req) }],
    }),
  }
}

/**
 * 5 bis) Aviso a Cuentas por pagar: compra autorizada por TRANSFERENCIA o TARJETA con el pago por hacer. NO lleva la CLABE ni la dirección
 * fiscal (los correos no viajan con datos bancarios): se consultan en la plataforma. Tipo de correo `pago_pendiente`.
 */
export function plantillaPagoPendiente(req, monto) {
  const prov = proveedorParaAprobar(req)
  const forma = FORMA_PAGO_LABEL[req.formaPago] ?? req.formaPago
  const filas = [
    ['Monto aprobado', `<b>${esc(formatoMoneda(monto))} MXN</b>`],
    ['Forma de pago', `<b>${esc(forma)}</b>`],
    ['Proveedor', `<b>${esc(prov?.nombreComercial ?? req.proveedorElegido ?? 'Sin definir')}</b>`],
    ...(prov?.razonSocial ? [['Razón social', esc(prov.razonSocial)]] : []),
    ...(prov?.rfc ? [['RFC', esc(prov.rfc)]] : []),
    ['Solicitante', `${esc(req.solicitanteNombre)} · ${esc(req.area)}`],
  ]
  return {
    asunto: `Pago pendiente · ${req.folio}`,
    html: htmlCorreo({
      titulo: `Compra autorizada: pago por ${forma.toLowerCase()}`,
      cuerpo:
        `<p>La requisición <b>${esc(req.folio)}</b> fue autorizada y su pago es de Cuentas por pagar.</p>` +
        filasResumen(filas) +
        `<p>Entra a la plataforma para ver los datos de pago del proveedor y registrar la ${req.formaPago === 'tarjeta' ? 'tarjeta (solo los últimos 4 dígitos)' : 'transferencia'}, la fecha y el comprobante.</p>`,
      botones: [{ texto: 'Abrir en la plataforma', url: linkRequisicion(req) }],
    }),
  }
}

const TEXTO_ESTADO_SOLICITANTE = {
  en_cotizacion: { titulo: 'Estamos cotizando tu requisición', texto: 'Adquisiciones ya está cotizando con proveedores.' },
  autorizada: { titulo: 'Tu requisición fue autorizada', texto: 'Quedó autorizada. Sigue la entrega del dinero y la compra.' },
  fondeada: { titulo: 'Dinero entregado: ya se puede comprar', texto: 'Ya se entregó el dinero (o se registró el pago); Adquisiciones procede a comprar.' },
  comprada: { titulo: 'Tu compra ya se realizó', texto: 'Adquisiciones ya compró. Cuando la recibas, confirma desde la liga de seguimiento.' },
  entregada: { titulo: 'Compra entregada', texto: 'Quedó registrada la recepción. ¡Gracias!' },
  rechazada: { titulo: 'Tu requisición fue rechazada', texto: 'No fue autorizada.' },
  cancelada: { titulo: 'Tu requisición fue cancelada', texto: 'Se canceló.' },
  en_espera: { titulo: 'Tu requisición está en espera', texto: 'Se detuvo temporalmente.' },
}

/** 6) Avisos de estado al solicitante (cotizando, autorizada, dinero entregado, comprada, entregada, rechazada…). */
export function plantillaEstadoSolicitante(req, a, comentario) {
  const t = TEXTO_ESTADO_SOLICITANTE[a]
  if (!t) return undefined
  const motivo = comentario && (a === 'rechazada' || a === 'cancelada' || a === 'en_espera') ? `<p><b>Motivo:</b> ${esc(comentario)}</p>` : ''
  return {
    asunto: `${t.titulo} · ${req.folio}`,
    html: htmlCorreo({
      titulo: t.titulo,
      cuerpo: `<p>Hola ${esc(req.solicitanteNombre)},</p><p>Requisición <b>${esc(req.folio)}</b>: ${esc(t.texto)}</p>${motivo}<p>Estatus actual: <b>${esc(ESTADOS[a].label)}</b>.</p>`,
      botones: [{ texto: a === 'comprada' ? 'Confirmar que lo recibí' : 'Ver seguimiento', url: linkSeguimiento(req) }],
    }),
  }
}

/** Aviso de estado a Adquisiciones (rechazos, cancelaciones, fondeo, entrega confirmada). */
export function plantillaEstadoComprador(req, titulo, texto) {
  return {
    asunto: `${titulo} · ${req.folio}`,
    html: htmlCorreo({
      titulo,
      cuerpo: `<p>Requisición <b>${esc(req.folio)}</b> (${esc(req.solicitanteNombre)} · ${esc(req.area)}): ${texto}</p>`,
      botones: [{ texto: 'Abrir en la plataforma', url: linkRequisicion(req) }],
    }),
  }
}

/** 7) Alerta a Finanzas por diferencias (real > autorizado). */
export function plantillaAlertaDiferencia(req, autorizado, real) {
  const dif = real - autorizado
  return {
    asunto: `Alerta: lo comprado rebasa lo autorizado · ${req.folio}`,
    html: htmlCorreo({
      titulo: 'Diferencia entre lo comprado y lo autorizado',
      cuerpo:
        `<p>En la requisición <b>${esc(req.folio)}</b> el costo real comprado rebasa el monto autorizado.</p>` +
        filasResumen([
          ['Autorizado', esc(formatoMoneda(autorizado))],
          ['Comprado (real)', esc(formatoMoneda(real))],
          ['Diferencia', `<b style="color:#b42318">${esc(formatoMoneda(dif))}</b>`],
          ['Solicitante', `${esc(req.solicitanteNombre)} · ${esc(req.area)}`],
        ]) +
        `<p>Requiere re-aprobación o justificación de Finanzas.</p>`,
      botones: [{ texto: 'Abrir en la plataforma', url: linkRequisicion(req) }],
    }),
  }
}

/** Recepción pendiente para el custodio (Uriel / Gerente de Mantenimiento). */
export function plantillaRecepcionPendiente(req, d, destino) {
  return {
    asunto: `Recepción pendiente de inventario · ${req.folio}`,
    html: htmlCorreo({
      titulo: `Recepción pendiente (${destino === 'ti' ? 'Soporte e Infraestructura' : 'Mantenimiento'})`,
      cuerpo:
        `<p>Se compró algo que debe entrar a tu inventario. Ya tienes los datos precargados; solo confirma y captura las series.</p>` +
        filasResumen([
          ['Producto', `${esc(d.cantidad)} × ${esc(d.producto)}`],
          ['Proveedor', esc(d.proveedor ?? '—')],
          ['Factura / ticket', esc(d.numeroFactura ?? '—')],
          ['Costo unitario real', esc(formatoMoneda(d.costoUnitarioReal))],
          ['Para quién', esc(d.paraQuien ?? '—')],
          ['Folio', esc(req.folio)],
        ]),
      botones: [{ texto: 'Abrir en la plataforma', url: linkRequisicion(req) }],
    }),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Correos por evento (se enganchan al flujo; cada uno es fire-and-forget)
// ---------------------------------------------------------------------------------------------------------------------
export async function notificarRol(req, rol, p, tipo) {
  for (const d of participantesPorRol(rol)) {
    await encolarSeguro({ paraCorreo: d.correo, paraNombre: d.nombre, asunto: p.asunto, cuerpoHtml: p.html, tipo, requisicionId: req.folio })
  }
}

export async function notificarSolicitante(req, p, tipo = 'estado_solicitante') {
  await encolarSeguro({ paraCorreo: req.solicitanteCorreo, paraNombre: req.solicitanteNombre, asunto: p.asunto, cuerpoHtml: p.html, tipo, requisicionId: req.folio })
}

/** Alerta a Finanzas (diferencias, etc.). */
export async function alertarFinanzas(req, p) {
  await notificarRol(req, 'finanzas', p, 'alerta_finanzas')
}

registrarHookCreada(async (req) => {
  const partidas = listPartidas(req.folio)
  await notificarSolicitante(req, plantillaConfirmacionSolicitante(req, partidas), 'confirmacion_solicitante')
  await notificarRol(req, 'comprador', plantillaNuevaRequisicion(req, partidas), 'nueva_requisicion')
})

registrarHookTransicion(async ({ folio, de, a, comentario }) => {
  const req = getRequisicion(folio)
  if (!req) return
  const sol = plantillaEstadoSolicitante(req, a, comentario)
  // Aviso al solicitante en cada estado relevante (la primera cotización o un regreso a cotización por ajuste no se repiten).
  if (sol && !(a === 'en_cotizacion' && de === 'en_autorizacion')) await notificarSolicitante(req, sol)

  if (a === 'autorizada') {
    // Ruteo del pago: efectivo → Tesorería (tesoreria_fondos); transferencia o tarjeta → Cuentas por pagar (pago_pendiente, sin CLABE).
    const destino = destinoDePago(req.formaPago)
    if (destino === 'tesoreria') await notificarRol(req, 'tesoreria', plantillaTesoreria(req, req.montoAutorizado ?? 0), 'tesoreria_fondos')
    else await notificarRol(req, 'cuentas_por_pagar', plantillaPagoPendiente(req, req.montoAutorizado ?? 0), 'pago_pendiente')
    await notificarRol(
      req,
      'comprador',
      plantillaEstadoComprador(
        req,
        'Requisición autorizada',
        `autorizada por ${esc(formatoMoneda(req.montoAutorizado ?? 0))}. ${destino === 'tesoreria' ? 'Tesorería recibió la solicitud de fondos' : `Cuentas por pagar recibió el aviso de pago (${esc((FORMA_PAGO_LABEL[req.formaPago] ?? '').toLowerCase())})`}; podrás comprar cuando el dinero esté entregado.`,
      ),
      'estado_comprador',
    )
  } else if (a === 'fondeada') {
    await notificarRol(
      req,
      'comprador',
      plantillaEstadoComprador(req, 'Dinero entregado', `${destinoDePago(req.formaPago) === 'tesoreria' ? 'Tesorería entregó el dinero' : 'Cuentas por pagar registró el pago'}. Ya puedes comprar y registrar costos y comprobantes.`),
      'estado_comprador',
    )
  } else if (a === 'rechazada') {
    await notificarRol(req, 'comprador', plantillaEstadoComprador(req, 'Requisición rechazada', `fue rechazada.${comentario ? ` Motivo: ${esc(comentario)}` : ''}`), 'estado_comprador')
  } else if (a === 'en_cotizacion' && de === 'en_autorizacion') {
    // Finanzas pidió un ajuste desde la app: Adquisiciones debe enterarse (la RPC de la liga de correo ya le avisa; aquí faltaba el camino de la app).
    await notificarRol(req, 'comprador', plantillaEstadoComprador(req, 'Ajuste solicitado', `Finanzas pidió ajustar la cotización.${comentario ? ` ${esc(comentario)}` : ''}`), 'estado_comprador')
  } else if (a === 'cancelada') {
    await notificarRol(req, 'comprador', plantillaEstadoComprador(req, 'Requisición cancelada', `se canceló.${comentario ? ` Motivo: ${esc(comentario)}` : ''}`), 'estado_comprador')
    if (de === 'fondeada') {
      // El aviso va a quien entregó el dinero: Tesorería (efectivo) o Cuentas por pagar (transferencia / tarjeta).
      const aTesoreria = destinoDePago(req.formaPago) === 'tesoreria'
      await notificarRol(
        req,
        aTesoreria ? 'tesoreria' : 'cuentas_por_pagar',
        plantillaEstadoComprador(
          req,
          aTesoreria ? 'Requisición cancelada con dinero entregado' : 'Requisición cancelada con pago registrado',
          `se canceló después de ${aTesoreria ? 'entregar el dinero: hay que recuperar el efectivo' : 'registrar el pago: hay que gestionar la devolución con el proveedor'}.${comentario ? ` Motivo: ${esc(comentario)}` : ''}`,
        ),
        'estado_comprador',
      )
    }
  } else if (a === 'entregada') {
    await notificarRol(req, 'comprador', plantillaEstadoComprador(req, 'Entrega confirmada', 'el solicitante confirmó que recibió la compra.'), 'estado_comprador')
  }
})
