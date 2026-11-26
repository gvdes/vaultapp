import { supabase } from '../supabase'
import { user } from '../auth'
import { registrarBitacora } from '../bitacora'
import {
  ESTADOS,
  MSG_SIN_APROBADOR,
  RUTAS_COMPRAS,
  esAprobadorElegible,
  DESTINO_PAGO_LABEL,
  destinoDePago,
  formatoMoneda,
} from './tipos'
import { crearTabla, modoLocal, nuevoId, nuevoToken, ahora, errorDe, normalizar, usuarioActual } from './store'
import { getConfig, urlBase } from './config'
import { getParticipante, getParticipantePorCorreo, participantesPorRol } from './participantes'
import {
  actualizarRequisicion,
  asegurarCachesLocales,
  cambiarEstado,
  getHistorial,
  getRequisicion,
  listPartidas,
  registrarHookTransicion,
  registrarValidadorTransicion,
} from './requisiciones'
import { completasDistintas, cotizacionesRequeridas, excepcionDe, excepcionValida } from './cotizaciones'
import { errorExcepcion } from './tipos'
import { analizarCotizaciones, comparativo, cotizacionElegida, criteriosDe, desgloseCotizacion, evaluarCotizaciones, listCotizaciones, listItemsCotizacion, montoElegido, normalizarPesos, totalCotizacion } from './cotizaciones'
import { listCompras, resumenCompra } from './compras'
import { listMovimientosDinero } from './dinero'
import { motivoProveedorIncompleto, proveedorParaAprobar } from './proveedores'
import { encolarCorreo, plantillaAutorizacion, plantillaAvisoDireccion, plantillaAvisoExcepcion, sustituirMarcadores } from './outbox'

/**
 * Autorización de compras en UN SOLO NIVEL, Finanzas, con TOPE de aprobación por persona (regla de Ángel, Gerente de Finanzas,
 * confirmada por el usuario; migración 022 — reemplaza la cadena de tres niveles de 019):
 *   - Aprueban los participantes ACTIVOS del directorio con rol `finanzas`. Cada uno tiene un `topeAprobacion` (vacío = sin tope =
 *     cualquier monto). Un aprobador es ELEGIBLE para una compra de monto M si no tiene tope o M <= tope (`esAprobadorElegible`).
 *     No hay nombres en el código: Ángel (sin tope) y Janeth (tope $10,000) son datos del directorio.
 *   - Al enviar a autorización, la solicitud (con botones) llega a TODOS los aprobadores elegibles; basta UNO (liga de un solo uso
 *     por aprobador). Si no hay ninguno elegible NO se puede enviar (`MSG_SIN_APROBADOR`).
 *   - Dirección YA NO aprueba: si el monto es mayor a `umbralDireccion` recibe un AVISO informativo (sin botones ni liga), una vez por
 *     envío. Los CEOs salieron del flujo (no reciben nada).
 *   - En la app solo decide el rol `finanzas` ligado a su participante (`AuthUser.participanteId` ↔ `profiles.participante_id`);
 *     sin liga no puede aprobar. Dirección (admin) consulta pero no decide.
 * El correo/registro de aprobación es el comprobante de autorización. Las aprobaciones son APPEND-ONLY. Misma lógica que
 * `cmp_aprobar_por_token` / `cmp_aprobaciones_antes_insert` en 022_aprobacion_finanzas.sql.
 *
 * Con Supabase los tokens de aprobación se emiten dentro de la RPC `cmp_solicitar_autorizacion` (nunca llegan al navegador);
 * en modo local se guardan en localStorage para que el demo pueda probar los enlaces.
 */
const tAprob = crearTabla({
  key: 'dga_cmp_aprobaciones',
  tabla: 'cmp_aprobaciones',
  pk: 'id',
  ts: ['fecha'],
  num: ['monto'],
  orderBy: 'fecha',
})
const tTokens = crearTabla({
  key: 'dga_cmp_tokens',
  tabla: 'cmp_tokens',
  pk: 'token',
  ts: ['usadoAt', 'expiraAt', 'createdAt'],
  orderBy: 'created_at',
  soloLocal: true,   // las ligas de aprobación solo las lee el servidor (RPC): la API responde 403 a todos los roles
})

export const loadAprobacionesCache = async () => {
  await Promise.all([tAprob.load(), tTokens.load()])
}
export const isAprobacionesCacheReady = () => tAprob.isReady() && tTokens.isReady()
export function reiniciarAprobacionesLocal() {
  tAprob.reiniciarLocal()
  tTokens.reiniciarLocal()
}

export function listAprobaciones(folio) {
  const list = tAprob.list()
  return [...(folio ? list.filter((a) => a.folio === folio) : list)].sort((a, b) => a.fecha - b.fecha)
}

/** Momento en que la requisición entró a autorización por última vez (las aprobaciones anteriores ya no cuentan). */
function desdeAutorizacion(folio) {
  const h = getHistorial(folio).filter((x) => x.aEstado === 'en_autorizacion')
  return h.length ? h[h.length - 1].fecha : 0
}

// ---------------------------------------------------------------------------------------------------------------------
// Aprobadores elegibles y aviso a Dirección
// ---------------------------------------------------------------------------------------------------------------------
/** Aprobadores de Finanzas (activos, rol finanzas) cuyo tope cubre el monto: a ellos llega la solicitud; basta uno. */
export function aprobadoresElegibles(monto) {
  return participantesPorRol('finanzas').filter((p) => esAprobadorElegible(p, monto))
}

/** ¿El monto rebasa el umbral de aviso? Dirección NO aprueba: solo recibe un correo informativo (estrictamente mayor). */
export function avisoDireccion(monto) {
  const { umbralDireccion } = getConfig()
  return { avisa: monto > umbralDireccion, umbral: umbralDireccion }
}

/** Participante del directorio ligado al usuario con sesión (`AuthUser.participanteId`); undefined = sin liga (no puede aprobar). */
export function participanteDeUsuario() {
  const id = user.value?.participanteId
  return id ? getParticipante(id) : undefined
}

/** Motivo por el que un aprobador NO puede decidir una compra de ese monto (null = puede). Mismos textos que la base de datos. */
export function motivoNoPuedeDecidir(p, monto) {
  if (!p) return 'Tu usuario no está ligado a un aprobador de Finanzas del directorio: no puedes decidir. Pide a Dirección que lo ligue.'
  if (!p.activo || !p.roles.includes('finanzas')) return 'Tu aprobador del directorio está inactivo o ya no tiene el rol Finanzas: no puedes decidir.'
  if (!esAprobadorElegible(p, monto)) {
    return `Tu tope de aprobación (${formatoMoneda(p.topeAprobacion ?? 0)}) no cubre esta compra de ${formatoMoneda(monto)}: la decide un aprobador con tope suficiente.`
  }
  return null
}

/** ¿El usuario con sesión puede decidir (aprobar, rechazar o pedir ajuste) esta requisición ahora? Solo el rol finanzas ligado a un aprobador elegible. */
export function puedeDecidirFolio(folio) {
  const rol = user.value?.role
  if (rol !== 'finanzas') return { ok: false, motivo: 'Solo el rol Finanzas decide la autorización (Dirección consulta y recibe avisos).' }
  const motivo = motivoNoPuedeDecidir(participanteDeUsuario(), montoElegido(folio))
  return motivo ? { ok: false, motivo } : { ok: true }
}

/** ¿Esta aprobación cuenta? Su aprobador (por correo) debe seguir siendo elegible para el monto vigente (espejo de `cmp_aprobacion_valida`). */
function aprobacionVale(a, monto) {
  if (!a.aprobadorCorreo?.trim()) return a.via === 'app' // compatibilidad: decisiones en la app anteriores a la migración 022
  return esAprobadorElegible(getParticipantePorCorreo(a.aprobadorCorreo), monto)
}

/**
 * @typedef {object} EstadoAutorizacion
 * @property {string} folio
 * @property {number} monto
 * @property {NivelAprobacion[]} niveles - Niveles que deciden (siempre ['finanzas']).
 * @property {Aprobacion} [finanzas] - La aprobación que cuenta (o, si no hay, la última decisión de Finanzas de la ronda vigente).
 * @property {'finanzas'} [pendiente] - Siguiente decisión pendiente (undefined si ya está aprobada o hubo rechazo/ajuste).
 * @property {boolean} completa
 * @property {boolean} avisaDireccion - El monto rebasa el umbral: Dirección recibe el aviso informativo (no aprueba).
 * @property {number} umbralDireccion
 * @property {Participante[]} elegibles - Aprobadores de Finanzas elegibles para el monto (a ellos llega la solicitud).
 */

/** Estado de las aprobaciones de la ronda vigente (desde el último envío a autorización). */
export function estadoAutorizacion(folio) {
  const req = getRequisicion(folio)
  const desde = desdeAutorizacion(folio)
  const ronda = listAprobaciones(folio).filter((a) => a.fecha >= desde && a.nivel === 'finanzas')
  // Monto de la cotización elegida (si no hay, el último autorizado): un monto autorizado en una ronda anterior no debe pesar.
  const elegido = montoElegido(folio)
  const monto = elegido > 0 ? elegido : (req?.montoAutorizado ?? 0)
  const buena = [...ronda].reverse().find((a) => a.decision === 'aprobada' && aprobacionVale(a, monto))
  const finanzas = buena ?? ronda[ronda.length - 1]
  const hayNegativa = !buena && !!finanzas && finanzas.decision !== 'aprobada'
  const av = avisoDireccion(monto)
  return {
    folio,
    monto,
    niveles: ['finanzas'],
    finanzas,
    pendiente: buena || hayNegativa ? undefined : 'finanzas',
    completa: !!buena,
    avisaDireccion: av.avisa,
    umbralDireccion: av.umbral,
    elegibles: aprobadoresElegibles(monto),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Tokens / enlaces
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} EnlaceAprobacion
 * @property {string} token
 * @property {string} folio
 * @property {NivelAprobacion} [nivel]
 * @property {string} [aprobadorNombre]
 * @property {string} [aprobadorCorreo]
 * @property {boolean} usado
 * @property {boolean} expirado
 * @property {string} url
 * @property {string} urlAprobar
 * @property {string} urlRechazar
 */

/** Enlaces de aprobación emitidos (solo modo local: con Supabase las ligas viven en el correo y nadie las lee desde la app). */
export function listEnlacesAprobacion(folio) {
  const t = ahora()
  return tTokens
    .list()
    .filter((x) => x.tipo === 'aprobacion' && (!folio || x.folio === folio))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((x) => ({
      token: x.token,
      folio: x.folio,
      nivel: x.nivel,
      aprobadorNombre: x.aprobadorNombre,
      aprobadorCorreo: x.aprobadorCorreo,
      usado: !!x.usadoAt,
      expirado: x.expiraAt < t,
      url: `${urlBase()}${RUTAS_COMPRAS.aprobar(x.token)}`,
      urlAprobar: `${urlBase()}${RUTAS_COMPRAS.aprobar(x.token, 'aprobada')}`,
      urlRechazar: `${urlBase()}${RUTAS_COMPRAS.aprobar(x.token, 'rechazada')}`,
    }))
}

async function invalidarTokensLocal(folio, nivel) {
  if (!modoLocal()) return // con Supabase lo hacen los triggers de la base
  for (const t of tTokens.raw().filter((x) => x.folio === folio && !x.usadoAt && (!nivel || x.nivel === nivel))) {
    await tTokens.update(t.token, { usadoAt: ahora() })
  }
}

/** Emite las ligas y encola el correo a CADA aprobador de Finanzas elegible para el monto. Devuelve cuántos correos salieron. */
async function emitirAprobacion(req) {
  const monto = montoElegido(req.folio)
  const cot = cotizacionElegida(req.folio)
  const plantilla = plantillaAutorizacion({
    req: getRequisicion(req.folio) ?? req,
    partidas: listPartidas(req.folio),
    comparativo: comparativo(req.folio),
    monto,
    justificacion: cot?.justificacion,
    proveedor: proveedorParaAprobar(getRequisicion(req.folio) ?? req),
  })
  if (!modoLocal()) {
    const { data, error } = await supabase.rpc('cmp_solicitar_autorizacion', { p_folio: req.folio, p_nivel: 'finanzas', p_asunto: plantilla.asunto, p_html: plantilla.html })
    if (error) throw errorDe(error)
    return Number(data ?? 0)
  }
  const dias = getConfig().diasExpiraToken
  let n = 0
  for (const ap of aprobadoresElegibles(monto)) {
    if (!ap.correo?.trim()) continue
    const token = nuevoToken()
    const t = ahora()
    await tTokens.insert({ token, folio: req.folio, tipo: 'aprobacion', nivel: 'finanzas', aprobadorCorreo: ap.correo, aprobadorNombre: ap.nombre, expiraAt: t + dias * 86400000, createdAt: t })
    const html = sustituirMarcadores(plantilla.html, {
      nombre: ap.nombre,
      aprobar: `${urlBase()}${RUTAS_COMPRAS.aprobar(token, 'aprobada')}`,
      rechazar: `${urlBase()}${RUTAS_COMPRAS.aprobar(token, 'rechazada')}`,
      ajuste: `${urlBase()}${RUTAS_COMPRAS.aprobar(token, 'ajuste')}`,
    })
    await encolarCorreo({
      paraCorreo: ap.correo,
      paraNombre: ap.nombre,
      asunto: plantilla.asunto,
      cuerpoHtml: html,
      tipo: 'autorizacion_finanzas',
      requisicionId: req.folio,
    })
    n++
  }
  return n
}

/**
 * Aviso INFORMATIVO a Dirección (modo local; con Supabase lo encola `cmp_solicitar_autorizacion`): un correo por participante activo
 * con rol `direccion`, sin botones, sin token ni liga de aprobación. Devuelve cuántos correos salieron.
 */
async function avisarDireccion(req) {
  const monto = montoElegido(req.folio)
  const plantilla = plantillaAvisoDireccion({
    req: getRequisicion(req.folio) ?? req,
    partidas: listPartidas(req.folio),
    comparativo: comparativo(req.folio),
    monto,
    umbral: getConfig().umbralDireccion,
  })
  let n = 0
  for (const d of participantesPorRol('direccion')) {
    if (!d.correo?.trim()) continue
    await encolarCorreo({
      paraCorreo: d.correo,
      paraNombre: d.nombre,
      asunto: plantilla.asunto,
      cuerpoHtml: sustituirMarcadores(plantilla.html, { nombre: d.nombre, aprobar: '', rechazar: '', ajuste: '' }),
      tipo: 'aviso_direccion',
      requisicionId: req.folio,
    })
    n++
  }
  return n
}

/**
 * Aviso INFORMATIVO a Dirección por excepción de cotizaciones (modo local; con Supabase lo encola el servidor en `cmp_solicitar_autorizacion`):
 * un correo por participante activo con rol `direccion`, sin botones ni token. Se llama UNA vez por envío a autorización. Devuelve cuántos salieron.
 */
async function avisarExcepcion(req) {
  const plantilla = plantillaAvisoExcepcion({ req, monto: montoElegido(req.folio) })
  let n = 0
  for (const d of participantesPorRol('direccion')) {
    if (!d.correo?.trim()) continue
    await encolarCorreo({
      paraCorreo: d.correo,
      paraNombre: d.nombre,
      asunto: plantilla.asunto,
      cuerpoHtml: sustituirMarcadores(plantilla.html, { nombre: d.nombre, aprobar: '', rechazar: '', ajuste: '' }),
      tipo: 'aviso_excepcion_cotizaciones',
      requisicionId: req.folio,
    })
    n++
  }
  return n
}

/**
 * @typedef {object} ResultadoSolicitud
 * @property {number} monto
 * @property {boolean} avisoDireccion - El monto rebasa el umbral: Dirección recibe un aviso informativo (no aprueba).
 * @property {number} avisosDireccion - Correos de aviso a Dirección que salieron (0 si no aplica o no hay nadie con rol Dirección).
 * @property {number} avisosExcepcion - Correos de aviso a Dirección por excepción de cotizaciones (0 si no hay excepción o nadie con rol Dirección).
 * @property {number} correosEnviados - Aprobadores de Finanzas que recibieron la solicitud (los elegibles por tope; basta uno).
 * @property {string[]} aprobadores - Nombres de los aprobadores a quienes llegó.
 */

/**
 * Adquisiciones envía la requisición a autorización: valida cotización elegida y reglas de cotizaciones, exige que haya al menos un
 * aprobador elegible (tope que cubra el monto), pasa a "En autorización" y manda el correo con resumen + comparativo + botones a TODOS
 * los aprobadores elegibles de Finanzas. Si el monto rebasa el umbral, Dirección recibe además un aviso informativo (una vez por envío).
 */
export async function solicitarAutorizacion(folio, opts = {}) {
  const req = getRequisicion(folio)
  if (!req) throw new Error('Requisición no encontrada.')
  const cot = cotizacionElegida(folio)
  if (!cot) throw new Error('Elige una cotización ganadora antes de enviar a autorización.')
  const monto = totalCotizacion(cot.id)
  if (!(monto > 0)) throw new Error('El monto de la cotización elegida debe ser mayor a cero.')
  const ev = evaluarCotizaciones(folio)
  if (ev.requiereExcepcion && !excepcionValida(req)) throw new Error(req.excepcionTipo || req.excepcionCotizaciones?.trim() ? errorExcepcion(excepcionDe(req)) : (ev.mensajes[0] ?? 'Faltan cotizaciones o documentar la excepción.'))
  // Compuerta del catálogo de proveedores: proveedor activo y completo (según tipo y forma de pago) antes de pedir la autorización.
  const faltaProveedor = motivoProveedorIncompleto(req)
  if (faltaProveedor) throw new Error(faltaProveedor)
  const elegibles = aprobadoresElegibles(monto)
  if (elegibles.length === 0) throw new Error(MSG_SIN_APROBADOR)
  const usuario = opts.usuario ?? usuarioActual()
  const av = avisoDireccion(monto)
  await actualizarRequisicion(folio, { requiereDireccion: av.avisa }, { usuario })
  await cambiarEstado(folio, 'en_autorizacion', {
    usuario,
    comentario: `Enviada a autorización por ${formatoMoneda(monto)} (la decide Finanzas${av.avisa ? '; se avisa a Dirección por rebasar el umbral' : ''})`,
  })
  const correosEnviados = await emitirAprobacion(getRequisicion(folio) ?? req)
  // Con Supabase el aviso lo encola la RPC en la misma llamada; en modo local se encola aquí.
  const avisosDireccion = av.avisa ? (modoLocal() ? await avisarDireccion(getRequisicion(folio) ?? req) : participantesPorRol('direccion').filter((d) => d.correo?.trim()).length) : 0
  // Excepción de cotizaciones usada: Dirección recibe UN aviso informativo por envío (con Supabase lo encola el servidor, igual que el de > umbral).
  const rFinal = getRequisicion(folio) ?? req
  const conExcepcion = !!rFinal.excepcionTipo && excepcionValida(rFinal)
  const avisosExcepcion = conExcepcion ? (modoLocal() ? await avisarExcepcion(rFinal) : participantesPorRol('direccion').filter((d) => d.correo?.trim()).length) : 0
  return { monto, avisoDireccion: av.avisa, avisosDireccion, avisosExcepcion, correosEnviados, aprobadores: elegibles.map((p) => p.nombre) }
}

// ---------------------------------------------------------------------------------------------------------------------
// Decisión (desde la app o por token)
// ---------------------------------------------------------------------------------------------------------------------
async function aplicarDecision(
  folio,
  nivel,
  decision,
  comentario,
  nombre,
) {
  if (decision === 'rechazada') {
    await cambiarEstado(folio, 'rechazada', { usuario: nombre, comentario: `Rechazada por ${nombre} (${nivel}): ${comentario}` })
    return 'rechazada'
  }
  if (decision === 'ajuste') {
    await cambiarEstado(folio, 'en_cotizacion', { usuario: nombre, comentario: `Ajuste solicitado por ${nombre} (${nivel}): ${comentario}` })
    return 'en_cotizacion'
  }
  // Un solo aprobador basta: no hay más niveles, queda autorizada.
  const monto = montoElegido(folio)
  await actualizarRequisicion(folio, { montoAutorizado: monto, requiereDireccion: avisoDireccion(monto).avisa }, { usuario: nombre })
  await cambiarEstado(folio, 'autorizada', { usuario: nombre, comentario: `Autorizada por ${nombre} (${nivel})${comentario ? `: ${comentario}` : ''}` })
  return 'autorizada'
}

/**
 * @typedef {object} RegistroAprobacionInput
 * @property {string} folio
 * @property {NivelAprobacion} nivel
 * @property {DecisionAprobacion} decision
 * @property {string} [comentario]
 * @property {{ nombre: string; correo?: string; participanteId?: string }} [aprobador] - Aprobador explícito (la siembra de demostración). Por defecto, el usuario con sesión: debe tener rol finanzas y estar ligado a un participante activo con rol finanzas cuyo tope cubra el monto. Se identifica por `participanteId` o por `correo`.
 */

/** Quién decide y con qué correo: valida rol (sesión), liga y tope. Lanza el mismo mensaje que la base de datos. */
function resolverAprobador(aprobador, monto) {
  if (!aprobador && user.value?.role !== 'finanzas') throw new Error('Solo el rol Finanzas puede registrar decisiones de autorización (Dirección solo consulta y recibe avisos).')
  const p = aprobador ? (aprobador.participanteId ? getParticipante(aprobador.participanteId) : getParticipantePorCorreo(aprobador.correo)) : participanteDeUsuario()
  const motivo = motivoNoPuedeDecidir(p, monto)
  if (motivo || !p) throw new Error(motivo ?? 'No se pudo identificar al aprobador.')
  return { nombre: aprobador?.nombre ?? usuarioActual(), correo: p.correo }
}

/** Decisión desde la app. Solo el nivel Finanzas existe; solo el rol finanzas, ligado a un aprobador cuyo tope cubra el monto. */
export async function registrarAprobacion(input) {
  const req = getRequisicion(input.folio)
  if (!req) throw new Error('Requisición no encontrada.')
  if (input.nivel !== 'finanzas') throw new Error('Solo Finanzas decide: Dirección recibe un aviso informativo y los CEOs ya no participan en la autorización.')
  if (req.estado !== 'en_autorizacion') throw new Error(`La requisición no está en autorización (estado: ${ESTADOS[req.estado].label}).`)
  const comentario = input.comentario?.trim() || undefined
  if (input.decision !== 'aprobada' && !comentario) throw new Error('Escribe el motivo (obligatorio al rechazar o pedir ajuste).')
  const est = estadoAutorizacion(input.folio)
  if (est.completa) throw new Error('Finanzas ya aprobó esta requisición.')
  const monto = montoElegido(input.folio)
  const quien = resolverAprobador(input.aprobador, monto)
  const nombre = quien.nombre
  const ap = {
    id: `apr-${nuevoId()}`,
    folio: input.folio,
    nivel: 'finanzas',
    decision: input.decision,
    aprobadorNombre: nombre,
    aprobadorCorreo: quien.correo,
    via: 'app',
    comentario,
    monto,
    fecha: ahora(),
  }
  await tAprob.insert(ap)
  registrarBitacora({ tabla: 'cmp_aprobaciones', registroId: ap.id, accion: 'alta', despues: ap, detalle: `${nombre} (finanzas) ${input.decision} ${input.folio} por ${formatoMoneda(monto)}` })
  await invalidarTokensLocal(input.folio, 'finanzas')
  const estado = await aplicarDecision(input.folio, 'finanzas', input.decision, comentario, nombre)
  return { estado, aprobacion: ap }
}

/**
 * Finanzas autoriza una requisición que YA cuenta con una aprobación válida pero sigue «En autorización» (compras que esperaban a Dirección o a
 * los CEOs al cambiar la regla, migración 022). No registra otra aprobación: solo mueve el estado (la base vuelve a verificar el requisito).
 */
export async function autorizarYaAprobada(folio) {
  const req = getRequisicion(folio)
  if (!req || req.estado !== 'en_autorizacion') throw new Error('La requisición no está en autorización.')
  const est = estadoAutorizacion(folio)
  if (!est.completa) throw new Error('Todavía falta la aprobación de Finanzas.')
  const nombre = usuarioActual()
  const monto = montoElegido(folio)
  await actualizarRequisicion(folio, { montoAutorizado: monto, requiereDireccion: avisoDireccion(monto).avisa }, { usuario: nombre })
  await cambiarEstado(folio, 'autorizada', { usuario: nombre, comentario: `Autorizada por ${nombre}: Finanzas ya había aprobado (cambio de regla: un solo nivel)` })
  return 'autorizada'
}

// ---------------------------------------------------------------------------------------------------------------------
// Por token (sin login)
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Extiende CriteriosCotizacion.
 * @typedef {object} VistaCotizacion
 * @property {string} id
 * @property {string} proveedor
 * @property {number} total - Costo total comparable (con descuento, flete e IVA normalizado).
 * @property {number} subtotal - Σ precio × cantidad.
 * @property {boolean} completa - Trae precio en todas las partidas.
 * @property {boolean} [sinPrecios] - No trae ningún precio (total 0).
 * @property {boolean} elegida
 * @property {boolean} [esRegistro] - Registro de compra menor (sin cotización, solo registro): Finanzas ve la leyenda.
 * @property {string} [justificacion]
 */

/** Análisis (puntaje, recomendación, alertas) de lo que ve el aprobador: misma función pura que usa el cotizador. */
export function analisisDeVista(v, hoy) {
  const entradas = v.cotizaciones.map((c) => ({ ...criteriosDe(c), id: c.id, proveedor: c.proveedor, subtotal: c.subtotal, completa: c.completa, sinPrecios: c.sinPrecios }))
  return analizarCotizaciones(entradas, { pesos: v.pesos, ivaPct: v.ivaPct, hoy })
}

/**
 * @typedef {object} ProveedorAprobacion
 * @property {string} nombreComercial
 * @property {string} [razonSocial]
 * @property {string} [rfc]
 * @property {TipoProveedor} tipo
 * @property {FormaPago} formaPago
 * @property {DestinoPago} destino
 */

/**
 * @typedef {object} VistaAprobacion
 * @property {string} folio
 * @property {NivelAprobacion} nivel
 * @property {string} aprobador
 * @property {boolean} usado
 * @property {boolean} expirado
 * @property {boolean} valida - false = la liga ya no sirve para decidir (liga vieja de Dirección o CEOs, o el tope del dueño ya no cubre el monto vigente). `motivoNoValida` dice por qué.
 * @property {string} [motivoNoValida]
 * @property {EstadoReq} estado
 * @property {string} solicitante
 * @property {string} [area]
 * @property {string} urgencia
 * @property {string} [paraQuien]
 * @property {boolean} avisaDireccion - El monto rebasa el umbral: Dirección recibió el aviso informativo (no aprueba).
 * @property {string} [proveedorElegido]
 * @property {ProveedorAprobacion} [proveedor] - Proveedor del catálogo elegido para la compra (SIN CLABE ni dirección fiscal: la liga es un token portable).
 * @property {number} monto
 * @property {{ tipo?: ExcepcionTipo, instruidaPor?: InstruidaPor, justificacion: string }} [excepcionCotizaciones] - Excepción de cotizaciones documentada (Finanzas la ve en la liga).
 * @property {number} cotizacionesCompletas - Cotizaciones completas de proveedores distintos.
 * @property {number} cotizacionesRequeridas - Cotizaciones requeridas para el monto (0 en un registro de compra menor).
 * @property {number} umbralCotizacionSimple - Umbral vigente: a partir de él (>=) se exigen varias cotizaciones.
 * @property {{ num: number; producto: string; cantidad: number }[]} partidas
 * @property {VistaCotizacion[]} cotizaciones - Cotizaciones activas con sus criterios (el total es el costo total comparable: el mismo de la app).
 * @property {number} umbralSinCotizacion - Umbral vigente de compra menor (para la leyenda «Compra menor (menos de $X)…»).
 * @property {number} ivaPct - Tasa de IVA vigente (para reproducir el análisis).
 * @property {PesosCotizador} pesos - Pesos del puntaje vigentes (para reproducir el análisis).
 * @property {{ nivel: NivelAprobacion; decision: DecisionAprobacion; aprobador: string; fecha: number; comentario?: string }[]} aprobaciones
 */

/** Excepción del RPC público: { tipo, instruidaPor, justificacion } (o texto suelto de un servidor anterior) → forma de la app, o undefined. */
function excepcionDeRpc(x) {
  if (x === null || x === undefined || x === '') return undefined
  if (typeof x === 'string') return { justificacion: x }
  return { tipo: x.tipo ?? undefined, instruidaPor: x.instruidaPor ?? undefined, justificacion: x.justificacion ?? '' }
}

const MOTIVO_NIVEL_VIEJO = 'Esta liga ya no es válida: la autorización la resuelve Finanzas.'
const motivoTopeLiga = (monto) =>
  `Esta liga ya no es válida: el monto de la compra (${formatoMoneda(monto)}) rebasa tu tope de aprobación, o tu usuario ya no es aprobador de Finanzas. La decide otro aprobador de Finanzas.`

/** Lo que ve quien abre su liga de aprobación (aquí SÍ se ven proveedor y montos). */
export async function verParaAprobar(token) {
  if (!modoLocal()) {
    const { data, error } = await supabase.rpc('cmp_ver_para_aprobar', { p_token: token })
    if (error) throw errorDe(error)
    if (!data) return null
    const d = data // eslint-disable-line @typescript-eslint/no-explicit-any
    return {
      folio: d.folio,
      nivel: d.nivel,
      aprobador: d.aprobador,
      usado: !!d.usado,
      expirado: !!d.expirado,
      valida: d.valida !== false,
      motivoNoValida: d.motivoNoValida ?? undefined,
      estado: d.estado,
      solicitante: d.solicitante,
      area: d.area ?? undefined,
      urgencia: d.urgencia,
      paraQuien: d.paraQuien ?? undefined,
      avisaDireccion: !!d.avisaDireccion,
      proveedorElegido: d.proveedorElegido ?? undefined,
      proveedor: d.proveedor
        ? {
            nombreComercial: d.proveedor.nombreComercial,
            razonSocial: d.proveedor.razonSocial ?? undefined,
            rfc: d.proveedor.rfc ?? undefined,
            tipo: d.proveedor.tipo,
            formaPago: d.proveedor.formaPago,
            destino: d.proveedor.destino ?? destinoDePago(d.proveedor.formaPago),
          }
        : undefined,
      monto: Number(d.monto ?? 0),
      excepcionCotizaciones: excepcionDeRpc(d.excepcionCotizaciones),
      cotizacionesCompletas: Number(d.cotizacionesCompletas ?? 0),
      cotizacionesRequeridas: Number(d.cotizacionesRequeridas ?? 0),
      umbralCotizacionSimple: Number.isFinite(Number(d.umbralCotizacionSimple)) && d.umbralCotizacionSimple !== null && d.umbralCotizacionSimple !== undefined ? Number(d.umbralCotizacionSimple) : getConfig().umbralCotizacionSimple,
      partidas: (d.partidas ?? []).map((p) => ({ num: Number(p.num), producto: p.producto, cantidad: Number(p.cantidad) })), // eslint-disable-line @typescript-eslint/no-explicit-any
      ivaPct: Number(d.ivaPct ?? 16),
      umbralSinCotizacion: Number.isFinite(Number(d.umbralSinCotizacion)) && d.umbralSinCotizacion !== null && d.umbralSinCotizacion !== undefined ? Number(d.umbralSinCotizacion) : getConfig().umbralSinCotizacion,
      pesos: normalizarPesos(d.pesos),
      cotizaciones: (d.cotizaciones ?? []).map(
        (c, i) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
          ...criteriosDe({
            tiempoEntregaDias: c.tiempoEntregaDias ?? undefined,
            descuentoMonto: c.descuentoMonto === null || c.descuentoMonto === undefined ? undefined : Number(c.descuentoMonto),
            flete: c.flete === null || c.flete === undefined ? undefined : Number(c.flete),
            ivaIncluido: c.ivaIncluido === false ? false : undefined,
            garantiaMeses: c.garantiaMeses ?? undefined,
            garantiaResponsable: c.garantiaResponsable ?? undefined,
            diasCredito: c.diasCredito ?? undefined,
            anticipoPct: c.anticipoPct === null || c.anticipoPct === undefined ? undefined : Number(c.anticipoPct),
            distribuidorAutorizado: c.distribuidorAutorizado ?? undefined,
            soporteTecnico: c.soporteTecnico ?? undefined,
            vigenciaHasta: c.vigenciaHasta ?? undefined,
            aceptaDevoluciones: c.aceptaDevoluciones ?? undefined,
            calificacionProveedor: c.calificacionProveedor ?? undefined,
          }),
          id: `c${i + 1}`,
          proveedor: c.proveedor,
          total: Number(c.total),
          subtotal: Number(c.subtotal ?? 0),
          completa: !!c.completa,
          sinPrecios: !!c.sinPrecios,
          elegida: !!c.elegida,
          esRegistro: !!c.esRegistro,
          justificacion: c.justificacion ?? undefined,
        }),
      ),
      aprobaciones: (d.aprobaciones ?? []).map((a) => ({ nivel: a.nivel, decision: a.decision, aprobador: a.aprobador, fecha: new Date(a.fecha).getTime(), comentario: a.comentario ?? undefined })), // eslint-disable-line @typescript-eslint/no-explicit-any
    }
  }
  await asegurarCachesLocales()
  const t = tTokens.raw().find((x) => x.token === token && x.tipo === 'aprobacion')
  if (!t || !t.nivel) return null
  const r = getRequisicion(t.folio)
  if (!r) return null
  const monto = montoElegido(r.folio)
  const motivoNoValida = t.nivel !== 'finanzas' ? MOTIVO_NIVEL_VIEJO : !esAprobadorElegible(getParticipantePorCorreo(t.aprobadorCorreo), monto) ? motivoTopeLiga(monto) : undefined
  return {
    folio: r.folio,
    nivel: t.nivel,
    aprobador: t.aprobadorNombre ?? '',
    usado: !!t.usadoAt,
    expirado: t.expiraAt < ahora(),
    valida: !motivoNoValida,
    motivoNoValida,
    estado: r.estado,
    solicitante: r.solicitanteNombre,
    area: r.area,
    urgencia: r.urgencia,
    paraQuien: r.paraQuien,
    avisaDireccion: avisoDireccion(monto).avisa,
    proveedorElegido: r.proveedorElegido,
    proveedor: proveedorParaAprobar(r),
    monto,
    excepcionCotizaciones: r.excepcionCotizaciones?.trim() || r.excepcionTipo ? { tipo: r.excepcionTipo || undefined, instruidaPor: r.excepcionInstruidaPor || undefined, justificacion: r.excepcionCotizaciones ?? '' } : undefined,
    cotizacionesCompletas: completasDistintas(r.folio),
    cotizacionesRequeridas: cotizacionesRequeridas(monto, !!cotizacionElegida(r.folio)?.esRegistro),
    umbralCotizacionSimple: getConfig().umbralCotizacionSimple,
    partidas: listPartidas(r.folio).map((p) => ({ num: p.num, producto: p.producto, cantidad: p.cantidad })),
    ivaPct: getConfig().ivaPct,
    umbralSinCotizacion: getConfig().umbralSinCotizacion,
    pesos: getConfig().cotizadorPesos,
    cotizaciones: listCotizaciones(r.folio).map((c) => {
      const d = desgloseCotizacion(c.id)
      return { ...criteriosDe(c), id: c.id, proveedor: c.proveedor, total: d?.total ?? 0, subtotal: d?.subtotal ?? 0, completa: !!d?.completa, sinPrecios: listItemsCotizacion(c.id).length === 0, elegida: c.elegida, esRegistro: !!c.esRegistro, justificacion: c.justificacion }
    }),
    aprobaciones: listAprobaciones(r.folio).map((a) => ({ nivel: a.nivel, decision: a.decision, aprobador: a.aprobadorNombre, fecha: a.fecha, comentario: a.comentario })),
  }
}

/** Aprobar/rechazar/pedir ajuste con la liga de un solo uso (sin login). Misma lógica que `cmp_aprobar_por_token` en la base. */
export async function aprobarPorToken(token, decision, comentario) {
  const com = comentario?.trim() || undefined
  if (decision !== 'aprobada' && !com) throw new Error('Escribe el motivo (el comentario es obligatorio al rechazar o pedir ajuste).')
  if (!modoLocal()) {
    const { data, error } = await supabase.rpc('cmp_aprobar_por_token', { p_token: token, p_decision: decision, p_comentario: com ?? null })
    if (error) throw errorDe(error)
    return data
  }
  await asegurarCachesLocales()
  const t = tTokens.raw().find((x) => x.token === token && x.tipo === 'aprobacion')
  if (!t || !t.nivel) throw new Error('La liga no es válida.')
  // Ligas viejas de Dirección o de los CEOs (cadena de tres niveles): ya no deciden nada.
  if (t.nivel !== 'finanzas') throw new Error(MOTIVO_NIVEL_VIEJO)
  if (t.usadoAt) throw new Error('Esta liga ya fue utilizada.')
  if (t.expiraAt < ahora()) throw new Error('La liga expiró; pide que te la reenvíen.')
  const req = getRequisicion(t.folio)
  if (!req) throw new Error('La liga no es válida.')
  if (req.estado !== 'en_autorizacion') throw new Error(`La requisición ya no está en autorización (estado: ${ESTADOS[req.estado].label}).`)
  // El dueño de la liga debe seguir siendo un aprobador elegible para el monto VIGENTE (la cotización pudo cambiar).
  const monto = montoElegido(t.folio)
  if (!esAprobadorElegible(getParticipantePorCorreo(t.aprobadorCorreo), monto)) throw new Error(motivoTopeLiga(monto))
  const nombre = t.aprobadorNombre ?? 'Aprobador'
  const ap = {
    id: `apr-${nuevoId()}`,
    folio: t.folio,
    nivel: 'finanzas',
    decision,
    aprobadorNombre: nombre,
    aprobadorCorreo: t.aprobadorCorreo,
    via: 'correo',
    comentario: com,
    monto,
    tokenUsado: token,
    fecha: ahora(),
  }
  await tAprob.insert(ap)
  registrarBitacora({ tabla: 'cmp_aprobaciones', registroId: ap.id, accion: 'alta', despues: { ...ap, tokenUsado: undefined }, detalle: `${nombre} (finanzas) ${decision} ${t.folio} vía liga de correo` })
  await invalidarTokensLocal(t.folio, 'finanzas')
  const estado = await aplicarDecision(t.folio, 'finanzas', decision, com, nombre)
  const mensaje =
    estado === 'rechazada'
      ? 'Rechazada. Se avisó al solicitante y a Adquisiciones.'
      : estado === 'en_cotizacion'
        ? 'Ajuste solicitado. Adquisiciones volverá a cotizar.'
        : `Autorizada. Se solicitó el pago a ${DESTINO_PAGO_LABEL[destinoDePago(getRequisicion(t.folio)?.formaPago)]}.`
  return { ok: true, folio: t.folio, estado, mensaje }
}

// Requisitos de datos (espejo de cmp_requisitos_estado en la base):
//  - para enviar a autorización debe haber al menos un aprobador elegible para el monto;
//  - para autorizar basta UNA aprobación de Finanzas de la ronda vigente, de un aprobador cuyo tope cubra el monto.
registrarValidadorTransicion((req, a) => {
  if (a === 'en_autorizacion') {
    const cot = cotizacionElegida(req.folio)
    if (!cot) return null // el requisito de la cotización elegida lo valida cotizaciones.js
    // Compuerta del catálogo de proveedores (espejo de cmp_requisitos_estado): proveedor activo y completo según tipo y forma de pago.
    const faltaProveedor = motivoProveedorIncompleto(req)
    if (faltaProveedor) return faltaProveedor
    return aprobadoresElegibles(totalCotizacion(cot.id)).length === 0 ? MSG_SIN_APROBADOR : null
  }
  if (a !== 'autorizada') return null
  return estadoAutorizacion(req.folio).completa ? null : 'Falta la aprobación de Finanzas (de un aprobador cuyo tope cubra el monto).'
})

// Al salir de autorización se consumen las ligas abiertas (con Supabase lo hace el trigger de la base).
registrarHookTransicion(async ({ folio, de }) => {
  if (de === 'en_autorizacion') await invalidarTokensLocal(folio)
})

// ---------------------------------------------------------------------------------------------------------------------
// Re-aprobación de diferencias (real > autorizado) y separación de funciones
// ---------------------------------------------------------------------------------------------------------------------
/** @typedef {'sin_diferencia' | 'pendiente_finanzas' | 'aprobada'} EstadoDiferencia */

/** Diferencia entre lo comprado y lo autorizado: pendiente de Finanzas o ya aprobada (aprobación posterior a la compra). */
export function estadoDiferencia(folio) {
  const r = resumenCompra(folio)
  if (!r.excede) return 'sin_diferencia'
  const primera = listCompras(folio)[0]?.fecha ?? 0
  const ok = listAprobaciones(folio).some((a) => a.nivel === 'finanzas' && a.decision === 'aprobada' && a.fecha >= primera && (a.monto ?? 0) + 0.005 >= r.totalReal)
  return ok ? 'aprobada' : 'pendiente_finanzas'
}

/** ¿El usuario con sesión puede aprobar la diferencia? Solo el rol finanzas ligado a un aprobador cuyo tope cubra lo REALMENTE comprado. */
export function puedeAprobarDiferencia(folio) {
  if (user.value?.role !== 'finanzas') return { ok: false, motivo: 'Solo el rol Finanzas aprueba diferencias.' }
  const motivo = motivoNoPuedeDecidir(participanteDeUsuario(), Math.max(resumenCompra(folio).totalReal, montoElegido(folio)))
  return motivo ? { ok: false, motivo } : { ok: true }
}

/** Finanzas re-aprueba (o justifica) lo comprado por encima de lo autorizado; la requisición debe estar "Comprada". */
export async function aprobarDiferencia(folio, opts) {
  const req = getRequisicion(folio)
  if (!req) throw new Error('Requisición no encontrada.')
  if (req.estado !== 'comprada') throw new Error('La diferencia se aprueba cuando la requisición ya está comprada.')
  const r = resumenCompra(folio)
  if (!r.excede) throw new Error('Lo comprado no rebasa lo autorizado.')
  if (!opts.comentario?.trim()) throw new Error('Escribe la justificación de la diferencia.')
  // El tope se mide contra lo REALMENTE comprado (igual que en la base de datos).
  const quien = resolverAprobador(opts.aprobador, Math.max(r.totalReal, montoElegido(folio)))
  const nombre = quien.nombre
  const ap = {
    id: `apr-${nuevoId()}`,
    folio,
    nivel: 'finanzas',
    decision: 'aprobada',
    aprobadorNombre: nombre,
    aprobadorCorreo: quien.correo,
    via: 'app',
    comentario: `Diferencia aprobada (${formatoMoneda(r.diferencia)} sobre lo autorizado): ${opts.comentario.trim()}`,
    monto: r.totalReal,
    fecha: ahora(),
  }
  await tAprob.insert(ap)
  registrarBitacora({ tabla: 'cmp_aprobaciones', registroId: ap.id, accion: 'alta', despues: ap, detalle: `${nombre} aprobó la diferencia de ${formatoMoneda(r.diferencia)} en ${folio}` })
  return ap
}

/** Avisos cuando una misma persona cumple dos funciones incompatibles: solicita ≠ cotiza ≠ aprueba ≠ entrega el dinero. */
export function avisosSeparacionFunciones(folio) {
  const req = getRequisicion(folio)
  if (!req) return []
  const roles = [
    { rol: 'solicita', nombres: new Set([normalizar(req.solicitanteNombre)]) },
    { rol: 'cotiza', nombres: new Set(listCotizaciones(folio, { incluirDescartadas: true }).map((c) => normalizar(c.registradoPor)).filter(Boolean)) },
    { rol: 'aprueba', nombres: new Set(listAprobaciones(folio).map((a) => normalizar(a.aprobadorNombre))) },
    { rol: 'entrega el dinero', nombres: new Set(listMovimientosDinero(folio).filter((m) => m.tipo === 'entrega_efectivo' || m.tipo === 'transferencia' || m.tipo === 'pago_tarjeta').map((m) => normalizar(m.registradoPor)).filter(Boolean)) },
  ]
  const avisos = []
  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      const comun = [...roles[i].nombres].filter((n) => roles[j].nombres.has(n))
      if (comun.length) avisos.push(`La misma persona ${roles[i].rol} y ${roles[j].rol} en ${folio}. Debe haber separación de funciones.`)
    }
  }
  return avisos
}
