import { supabase } from '../supabase'
import { user } from '../auth'
import { bump } from '../reactive'
import { registrarBitacora, cambios } from '../bitacora'
import { getFamilia, getUbicacion, listUbicaciones, loadComunesCache, isComunesCacheReady } from '../inventario/comunes'
import { listEquipos } from '../inventario/sistemas'
import { listMateriales } from '../inventario/mantenimiento'
import {
  ESTADOS,
  ESTADOS_CON_COMENTARIO,
  puedeTransicionar,
  esAbierta,
} from './tipos'
import { crearTabla, modoLocal, nuevoId, nuevoToken, ahora, errorDe, normalizar, usuarioActual, paraBitacora } from './store'
import { getParticipante, directorioPublico, loadParticipantesCache, isParticipantesCacheReady } from './participantes'
import { formaPagoCoherente, getProveedor, isProveedoresCatalogoCacheReady, loadProveedoresCatalogoCache } from './proveedores'
import { destinoDeCategoria, getCategoria, listCatalogo, listCategorias, loadCatalogoCache, isCatalogoCacheReady, hidratarCatalogoPublico } from './catalogo'

// ---------------------------------------------------------------------------------------------------------------------
// Cachés
// ---------------------------------------------------------------------------------------------------------------------
const tReq = crearTabla({
  key: 'dga_cmp_requisiciones',
  tabla: 'cmp_requisiciones',
  pk: 'folio',
  ts: ['createdAt', 'updatedAt'],
  num: ['montoAutorizado'],
  orderBy: 'created_at',
})
/** Columnas de cmp_partidas SIN `imagen_url`: cada foto en línea pesa ~200 KB y se bajaba completa (de TODAS las requisiciones) en cada inicio de sesión. */
export const COLUMNAS_PARTIDAS_LIGERAS = 'id,folio,num,categoria_id,producto,cantidad,descripcion,modelo_marca,comentario,distribucion'
const tPartidas = crearTabla({
  key: 'dga_cmp_partidas',
  tabla: 'cmp_partidas',
  pk: 'id',
  num: ['num', 'cantidad'],
  orderBy: 'folio',
  columnas: COLUMNAS_PARTIDAS_LIGERAS,
})

/**
 * Con la API, la caché de partidas llega sin fotos (ver COLUMNAS_PARTIDAS_LIGERAS). Al abrir una requisición se piden SOLO las fotos de esa requisición.
 * En modo demo local no hace nada (las fotos ya viven en la caché).
 */
export async function cargarImagenesPartidas(folio) {
  if (modoLocal() || !supabase) return
  const { data, error } = await supabase.from('cmp_partidas').select('id,imagen_url').eq('folio', folio)
  if (error || !Array.isArray(data)) return
  let cambio = false
  for (const f of data) {
    if (!f.imagen_url) continue
    const p = tPartidas.raw().find((x) => x.id === f.id)
    if (p && p.imagenUrl !== f.imagen_url) {
      tPartidas.setLocal({ ...p, imagenUrl: f.imagen_url })
      cambio = true
    }
  }
  if (cambio) bump()
}
const tHistorial = crearTabla({
  key: 'dga_cmp_historial',
  tabla: 'cmp_historial',
  pk: 'id',
  ts: ['fecha'],
  orderBy: 'fecha',
})

export const loadRequisicionesCache = async () => {
  await Promise.all([tReq.load(), tPartidas.load(), tHistorial.load()])
}
export const isRequisicionesCacheReady = () => tReq.isReady() && tPartidas.isReady() && tHistorial.isReady()

export function reiniciarRequisicionesLocal() {
  tReq.reiniciarLocal()
  tPartidas.reiniciarLocal()
  tHistorial.reiniciarLocal()
}

// ---------------------------------------------------------------------------------------------------------------------
// Ganchos (otros módulos se registran aquí; evita dependencias circulares)
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} ContextoTransicion
 * @property {string} folio
 * @property {EstadoReq} de
 * @property {EstadoReq} a
 * @property {string} usuario
 * @property {string} [comentario]
 */
/** @typedef {(ctx: ContextoTransicion) => void | Promise<void>} HookTransicion */
/** @typedef {(req: Requisicion) => void | Promise<void>} HookCreada */
/**
 * Devuelve un mensaje si falta algo para entrar al estado `a`, o null.
 * @typedef {(req: Requisicion, a: EstadoReq) => string | null} ValidadorTransicion
 */

const hooksTransicion = []
const hooksCreada = []
const validadores = []

/** Se ejecuta DESPUÉS de cada cambio de estado hecho desde este cliente (correos, recepciones, solicitud de dinero…). */
export function registrarHookTransicion(fn) {
  hooksTransicion.push(fn)
}
export function registrarHookCreada(fn) {
  hooksCreada.push(fn)
}
/** Requisitos de datos para entrar a un estado (espejo de `cmp_requisitos_estado` en la base). */
export function registrarValidadorTransicion(fn) {
  validadores.push(fn)
}

// ---------------------------------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} FiltroRequisiciones
 * @property {EstadoReq | EstadoReq[]} [estado]
 * @property {boolean} [abiertas] - true = solo no terminales; false = solo terminales.
 * @property {string} [solicitanteId]
 * @property {string} [texto]
 * @property {boolean} [urgentes]
 * @property {string} [ubicacionId]
 * @property {string} [categoriaId]
 * @property {number} [desde] - ms, inclusive.
 * @property {number} [hasta]
 */

export function listRequisiciones(filtro) {
  let list = [...tReq.list()]
  if (filtro) {
    if (filtro.estado) {
      const e = Array.isArray(filtro.estado) ? filtro.estado : [filtro.estado]
      list = list.filter((r) => e.includes(r.estado))
    }
    if (filtro.abiertas !== undefined) list = list.filter((r) => esAbierta(r.estado) === filtro.abiertas)
    if (filtro.solicitanteId) list = list.filter((r) => r.solicitanteId === filtro.solicitanteId)
    if (filtro.urgentes) list = list.filter((r) => r.urgencia === 'urgente')
    if (filtro.ubicacionId) list = list.filter((r) => r.ubicaciones.includes(filtro.ubicacionId))
    if (filtro.desde !== undefined) list = list.filter((r) => r.createdAt >= filtro.desde)
    if (filtro.hasta !== undefined) list = list.filter((r) => r.createdAt <= filtro.hasta)
    if (filtro.categoriaId) {
      const folios = new Set(tPartidas.raw().filter((p) => p.categoriaId === filtro.categoriaId).map((p) => p.folio))
      list = list.filter((r) => folios.has(r.folio))
    }
    if (filtro.texto) {
      const q = normalizar(filtro.texto)
      list = list.filter((r) => {
        const prods = tPartidas.raw().filter((p) => p.folio === r.folio).map((p) => p.producto).join(' ')
        return normalizar(`${r.folio} ${r.solicitanteNombre} ${r.area ?? ''} ${r.proveedorElegido ?? ''} ${r.paraQuien ?? ''} ${prods}`).includes(q)
      })
    }
  }
  return list.sort((a, b) => b.createdAt - a.createdAt)
}

export function getRequisicion(folio) {
  return folio ? tReq.get(folio) : undefined
}

export function listPartidas(folio) {
  const list = tPartidas.list()
  return (folio ? list.filter((p) => p.folio === folio) : [...list]).sort((a, b) => (a.folio === b.folio ? a.num - b.num : a.folio.localeCompare(b.folio)))
}

export function getPartida(id) {
  return id ? tPartidas.get(id) : undefined
}

export function getHistorial(folio) {
  return tHistorial.list().filter((h) => h.folio === folio).sort((a, b) => a.fecha - b.fecha)
}

/** "4 × Trapeador, 2 × Plumones" */
export function resumenPartidas(folio, max = 3) {
  const ps = listPartidas(folio)
  const txt = ps.slice(0, max).map((p) => `${p.cantidad} × ${p.producto}`).join(', ')
  return ps.length > max ? `${txt} y ${ps.length - max} más` : txt
}

export function esUrgente(r) {
  return r.urgencia === 'urgente'
}

/** Último estado previo a 'en_espera' (para reanudar donde se quedó). */
export function estadoPrevioAEspera(folio) {
  const h = getHistorial(folio)
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i].aEstado === 'en_espera') return h[i].deEstado
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------------------------------
// Creación (pública o interna)
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} PartidaInput
 * @property {string} categoriaId
 * @property {string} producto
 * @property {number} cantidad
 * @property {string} [descripcion]
 * @property {string} [modeloMarca]
 * @property {string} [comentario]
 * @property {string} [imagenUrl]
 * @property {Record<string, number>} [distribucion] - { ubicacionId: cantidad }; si se llena debe sumar `cantidad`.
 */

/**
 * @typedef {object} RequisicionInput
 * @property {string} solicitanteId
 * @property {string[]} ubicaciones
 * @property {string} [paraQuien]
 * @property {Urgencia} [urgencia]
 * @property {string} [fechaRequerida]
 * @property {ProveedorSugerido[]} [proveedoresSugeridos]
 * @property {string} [notas]
 * @property {PartidaInput[]} partidas
 */

/** Valida el payload; devuelve la lista de problemas en español (vacía si todo bien). */
export function validarRequisicion(input) {
  const errs = []
  if (!input.solicitanteId) errs.push('Elige tu nombre del directorio.')
  if (!input.ubicaciones || input.ubicaciones.length === 0) errs.push('Elige al menos una sucursal.')
  else if (input.ubicaciones.length > 12) errs.push('Elige máximo 12 sucursales.')
  if ((input.urgencia ?? 'normal') !== 'normal' && input.urgencia !== 'urgente') errs.push('Urgencia no válida.')
  if (!input.partidas || input.partidas.length === 0) errs.push('Agrega al menos una partida.')
  else if (input.partidas.length > 50) errs.push('Máximo 50 partidas por requisición.')
  let hayTI = false
  ;(input.partidas ?? []).forEach((p, i) => {
    const n = i + 1
    if (!p.producto?.trim()) errs.push(`La partida ${n} no tiene producto.`)
    if (!(p.cantidad > 0) || p.cantidad > 100000) errs.push(`La cantidad de la partida ${n} no es válida.`)
    if (!p.categoriaId) errs.push(`La partida ${n} necesita una categoría.`)
    else if (getCategoria(p.categoriaId) && !getCategoria(p.categoriaId)?.activo) errs.push(`La categoría de la partida ${n} está desactivada.`)
    if (destinoDeCategoria(p.categoriaId) === 'ti') hayTI = true
    const dist = Object.entries(p.distribucion ?? {}).filter(([, c]) => c > 0)
    if (dist.length > 0) {
      const suma = dist.reduce((s, [, c]) => s + c, 0)
      if (Math.abs(suma - p.cantidad) > 1e-9) errs.push(`El reparto por sucursal de la partida ${n} no suma la cantidad (${suma} de ${p.cantidad}).`)
      if (dist.some(([u]) => !(input.ubicaciones ?? []).includes(u))) errs.push(`El reparto de la partida ${n} usa una sucursal que no elegiste.`)
    }
  })
  if (hayTI && !input.paraQuien?.trim()) errs.push('En compras de tecnología indica para quién es la compra.')
  if (modoLocal()) {
    const s = getParticipante(input.solicitanteId)
    if (input.solicitanteId && (!s || !s.activo || !s.roles.includes('solicitante'))) errs.push('El solicitante no está en el directorio de solicitantes.')
    for (const u of input.ubicaciones ?? []) if (!getUbicacion(u)) errs.push('Alguna sucursal no es válida.')
  }
  return [...new Set(errs)]
}

function pad(n, w = 2) {
  return String(n).padStart(w, '0')
}
/** REQ-AAAAMMDD-HHMMSS en hora local; si ya existe, avanza segundos hasta ser único. */
export function generarFolio(ms, existe) {
  for (let s = 0; s < 3600; s++) {
    const d = new Date(ms + s * 1000)
    const f = `REQ-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    if (!existe(f)) return f
  }
  throw new Error('No se pudo generar un folio único.')
}

/**
 * @typedef {object} ResultadoCreacion
 * @property {string} folio
 * @property {string} token
 */

async function crearRequisicion(input, usuario) {
  const errs = validarRequisicion(input)
  if (errs.length) throw new Error(errs[0])

  if (!modoLocal()) {
    const payload = {
      solicitanteId: input.solicitanteId,
      ubicaciones: input.ubicaciones,
      urgencia: input.urgencia ?? 'normal',
      paraQuien: input.paraQuien?.trim() || null,
      fechaRequerida: input.fechaRequerida || null,
      proveedoresSugeridos: input.proveedoresSugeridos ?? [],
      notas: input.notas?.trim() || null,
      partidas: input.partidas.map((p) => ({
        categoriaId: p.categoriaId,
        producto: p.producto.trim(),
        cantidad: p.cantidad,
        descripcion: p.descripcion?.trim() || null,
        modeloMarca: p.modeloMarca?.trim() || null,
        comentario: p.comentario?.trim() || null,
        imagenUrl: p.imagenUrl || null,
        distribucion: Object.fromEntries(Object.entries(p.distribucion ?? {}).filter(([, c]) => c > 0)),
      })),
    }
    const { data, error } = await supabase.rpc('cmp_crear_requisicion', { payload })
    if (error) throw errorDe(error)
    const r = data
    // Con sesión se refrescan las cachés; el anónimo no puede leer tablas (y no las necesita).
    if (user.value) await loadRequisicionesCache()
    return { folio: r.folio, token: r.token }
  }

  const sol = getParticipante(input.solicitanteId)
  const ms = ahora()
  const folio = generarFolio(ms, (f) => tReq.raw().some((r) => r.folio === f))
  const token = nuevoToken()
  const req = {
    folio,
    solicitanteId: sol.id,
    solicitanteNombre: sol.nombre,
    solicitanteCorreo: sol.correo,
    area: sol.area,
    ubicaciones: [...new Set(input.ubicaciones)],
    paraQuien: input.paraQuien?.trim() || undefined,
    urgencia: input.urgencia ?? 'normal',
    fechaRequerida: input.fechaRequerida || undefined,
    estado: 'recibida',
    token,
    proveedoresSugeridos: input.proveedoresSugeridos ?? [],
    notas: input.notas?.trim() || undefined,
    formaPago: 'efectivo',
    requiereDireccion: false,
    requiereCeo: false,
    createdAt: ms,
    updatedAt: ms,
  }
  await tReq.insert(req)
  let num = 0
  for (const p of input.partidas) {
    num++
    await tPartidas.insert({
      id: `${folio}-P${num}`,
      folio,
      num,
      categoriaId: p.categoriaId,
      producto: p.producto.trim(),
      cantidad: p.cantidad,
      descripcion: p.descripcion?.trim() || undefined,
      modeloMarca: p.modeloMarca?.trim() || undefined,
      comentario: p.comentario?.trim() || undefined,
      imagenUrl: p.imagenUrl || undefined,
      distribucion: Object.fromEntries(Object.entries(p.distribucion ?? {}).filter(([, c]) => c > 0)),
    })
  }
  await tHistorial.insert({ id: nuevoId(), folio, aEstado: 'recibida', usuario: sol.nombre, comentario: 'Requisición creada', fecha: ms })
  registrarBitacora({
    tabla: 'cmp_requisiciones',
    registroId: folio,
    accion: 'alta',
    despues: { ...paraBitacora(req), partidas: input.partidas.length },
    detalle: `${usuario} registró la requisición ${folio} (${sol.nombre})`,
  })
  for (const h of hooksCreada) {
    try {
      await h(req)
    } catch (e) {
      console.error('[compras] hook de creación falló:', e)
    }
  }
  return { folio, token }
}

/** Liga pública (sin login): el solicitante se elige del directorio y se usa su correo REGISTRADO. */
export function crearRequisicionPublica(input) {
  return crearRequisicion(input, 'Solicitante (liga pública)')
}

/** Desde la app (Adquisiciones, Soporte o Mantenimiento capturan a nombre de un solicitante del directorio). */
export function crearRequisicionInterna(input, opts) {
  return crearRequisicion(input, opts?.usuario ?? usuarioActual())
}

// ---------------------------------------------------------------------------------------------------------------------
// Formulario público (listas cerradas, sin costos ni proveedores)
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} FormularioPublico
 * @property {SolicitantePublico[]} directorio
 * @property {CategoriaCompra[]} categorias
 * @property {Pick<ProductoCatalogo, 'id' | 'categoriaId' | 'producto' | 'unidad' | 'activo'>[]} catalogo
 * @property {{ id: string; nombre: string; tipo: string }[]} ubicaciones
 */

/** Todo lo que necesita la pantalla pública "Nueva requisición". */
export async function cargarFormularioPublico() {
  if (!modoLocal()) {
    const directorio = await directorioPublico()
    const { data, error } = await supabase.rpc('cmp_formulario_publico')
    if (error) throw errorDe(error)
    const f = data
    const categorias = f.categorias.map((c, i) => ({ ...c, orden: i + 1, activo: true }))
    const catalogo = f.catalogo.map((p) => ({ ...p, activo: true }))
    // El catálogo/categorías quedan en caché para que `validarRequisicion` reconozca el destino 'ti' (para quién).
    hidratarCatalogoPublico(categorias, catalogo.map((p) => ({ ...p })))
    return { directorio, categorias, catalogo, ubicaciones: f.ubicaciones }
  }
  await asegurarCachesLocales()
  return {
    directorio: await directorioPublico(),
    categorias: listCategorias(),
    catalogo: listCatalogo().map((p) => ({ id: p.id, categoriaId: p.categoriaId, producto: p.producto, unidad: p.unidad, activo: p.activo })),
    ubicaciones: listUbicaciones().map((u) => ({ id: u.id, nombre: u.nombre, tipo: u.tipo })),
  }
}

/** En modo local las pantallas públicas no pasan por RequireAuth: se cargan las cachés necesarias. */
export async function asegurarCachesLocales() {
  if (!isComunesCacheReady()) await loadComunesCache()
  if (!isParticipantesCacheReady()) await loadParticipantesCache()
  if (!isCatalogoCacheReady()) await loadCatalogoCache()
  if (!isRequisicionesCacheReady()) await loadRequisicionesCache()
  if (!isProveedoresCatalogoCacheReady()) await loadProveedoresCatalogoCache()
}

// ---------------------------------------------------------------------------------------------------------------------
// Seguimiento público (folio + token): NUNCA proveedor, precios ni montos
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} EstatusPublico
 * @property {string} folio
 * @property {string} solicitante
 * @property {string} [area]
 * @property {string[]} sucursales
 * @property {Urgencia} urgencia
 * @property {EstadoReq} estado
 * @property {number} creada
 * @property {{ num: number; producto: string; cantidad: number }[]} partidas
 * @property {{ estado: EstadoReq; fecha: number }[]} historial
 * @property {boolean} puedeConfirmar - true cuando está 'comprada' y el solicitante puede confirmar que recibió.
 */

export async function consultarRequisicionPublica(folio, token) {
  if (!modoLocal()) {
    const { data, error } = await supabase.rpc('cmp_consultar_requisicion', { p_folio: folio, p_token: token })
    if (error) throw errorDe(error)
    if (!data) return null
    const d = data
    return {
      folio: d.folio,
      solicitante: d.solicitante,
      area: d.area ?? undefined,
      sucursales: d.sucursales,
      urgencia: d.urgencia,
      estado: d.estado,
      creada: new Date(d.creada).getTime(),
      partidas: d.partidas.map((p) => ({ num: Number(p.num), producto: p.producto, cantidad: Number(p.cantidad) })),
      historial: d.historial.map((h) => ({ estado: h.estado, fecha: new Date(h.fecha).getTime() })),
      puedeConfirmar: d.estado === 'comprada',
    }
  }
  await asegurarCachesLocales()
  const r = tReq.raw().find((x) => x.folio === folio && x.token === token)
  if (!r) return null
  return {
    folio: r.folio,
    solicitante: r.solicitanteNombre,
    area: r.area,
    sucursales: r.ubicaciones.map((u) => getUbicacion(u)?.nombre ?? u),
    urgencia: r.urgencia,
    estado: r.estado,
    creada: r.createdAt,
    partidas: tPartidas.raw().filter((p) => p.folio === r.folio).sort((a, b) => a.num - b.num).map((p) => ({ num: p.num, producto: p.producto, cantidad: p.cantidad })),
    historial: tHistorial.raw().filter((h) => h.folio === r.folio).sort((a, b) => a.fecha - b.fecha).map((h) => ({ estado: h.aEstado, fecha: h.fecha })),
    puedeConfirmar: r.estado === 'comprada',
  }
}

/** El solicitante confirma que recibió su compra (liga de seguimiento): comprada → entregada. */
export async function confirmarRecibido(folio, token) {
  if (!modoLocal()) {
    const { data, error } = await supabase.rpc('cmp_confirmar_recibido', { p_folio: folio, p_token: token })
    if (error) throw errorDe(error)
    const d = data
    if (user.value) await loadRequisicionesCache()
    return { estado: d.estado, mensaje: d.mensaje }
  }
  await asegurarCachesLocales()
  const r = tReq.raw().find((x) => x.folio === folio && x.token === token)
  if (!r) throw new Error('La liga no es válida.')
  if (r.estado === 'entregada') return { estado: 'entregada', mensaje: 'Ya habías confirmado la recepción.' }
  if (r.estado !== 'comprada') throw new Error(`Todavía no se registra la compra de esta requisición (estado: ${ESTADOS[r.estado].label}).`)
  await cambiarEstado(folio, 'entregada', { usuario: r.solicitanteNombre, comentario: 'Recibido confirmado por el solicitante' })
  return { estado: 'entregada', mensaje: 'Gracias, quedó registrada la recepción.' }
}

// ---------------------------------------------------------------------------------------------------------------------
// Cambio de estado
// ---------------------------------------------------------------------------------------------------------------------
/** Qué falta para entrar al estado `a` (cotización elegida, aprobaciones, dinero entregado, compras…); null si nada. */
export function requisitoFaltante(folio, a) {
  const req = tReq.raw().find((r) => r.folio === folio)
  if (!req) return 'Requisición no encontrada.'
  for (const v of validadores) {
    const msg = v(req, a)
    if (msg) return msg
  }
  return null
}

/** ¿Se puede mover ahora a `a`? (transición legal + requisitos de datos). Devuelve el motivo si no. */
export function motivoNoPuedePasarA(folio, a) {
  const req = tReq.list().find((r) => r.folio === folio)
  if (!req) return 'Requisición no encontrada.'
  if (!puedeTransicionar(req.estado, a)) return `No se puede pasar de "${ESTADOS[req.estado].label}" a "${ESTADOS[a].label}".`
  return requisitoFaltante(folio, a)
}

/** Estados a los que se puede mover hoy la requisición (solo por la tabla de transiciones; los requisitos se validan al intentar). */
export function transicionesPosibles(folio) {
  const req = tReq.list().find((r) => r.folio === folio)
  if (!req) return []
  return ESTADOS[req.estado].terminal ? [] : Object.keys(ESTADOS).filter((e) => puedeTransicionar(req.estado, e))
}

export async function cambiarEstado(
  folio,
  a,
  opts = {},
) {
  const req = tReq.raw().find((r) => r.folio === folio)
  if (!req) throw new Error('Requisición no encontrada.')
  const de = req.estado
  if (de === a) throw new Error(`La requisición ya está en "${ESTADOS[a].label}".`)
  if (!puedeTransicionar(de, a)) throw new Error(`No se puede pasar de "${ESTADOS[de].label}" a "${ESTADOS[a].label}".`)
  const comentario = opts.comentario?.trim() || undefined
  if (ESTADOS_CON_COMENTARIO.includes(a) && !comentario) throw new Error('Escribe el motivo (obligatorio para rechazar, cancelar o poner en espera).')
  const falta = requisitoFaltante(folio, a)
  if (falta) throw new Error(falta)

  const usuario = opts.usuario ?? usuarioActual()
  const ms = ahora()
  if (!modoLocal()) {
    const { error } = await supabase.rpc('cmp_cambiar_estado', { p_folio: folio, p_a: a, p_comentario: comentario ?? null })
    if (error) throw errorDe(error)
  }
  const next = { ...req, estado: a, updatedAt: ms }
  tReq.setLocal(next)
  const entrada = { id: modoLocal() ? nuevoId() : `tmp-${nuevoId()}`, folio, deEstado: de, aEstado: a, usuario, comentario, fecha: ms }
  if (modoLocal()) await tHistorial.insert(entrada)
  else tHistorial.setLocal(entrada)
  registrarBitacora({
    tabla: 'cmp_requisiciones',
    registroId: folio,
    accion: 'cambio_estado',
    antes: { estado: de },
    despues: { estado: a },
    detalle: `${usuario}: ${ESTADOS[de].label} → ${ESTADOS[a].label}${comentario ? ` (${comentario})` : ''}`,
  })
  const ctx = { folio, de, a, usuario, comentario }
  for (const h of hooksTransicion) {
    try {
      await h(ctx)
    } catch (e) {
      console.error('[compras] hook de transición falló:', e)
    }
  }
  return next
}

/** Reanuda una requisición en espera, regresándola al estado donde estaba. */
export async function reanudarRequisicion(folio, opts = {}) {
  const req = getRequisicion(folio)
  if (!req || req.estado !== 'en_espera') throw new Error('La requisición no está en espera.')
  const previo = estadoPrevioAEspera(folio) ?? 'recibida'
  return cambiarEstado(folio, previo, { ...opts, comentario: opts.comentario ?? 'Reanudada' })
}

// ---------------------------------------------------------------------------------------------------------------------
// Edición de datos (sin cambiar estado) y partidas
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Partial< Pick< Requisicion, | 'montoAutorizado' | 'proveedorElegido' | 'proveedorId' | 'formaPago' |
 *   'requiereDireccion' | 'requiereCeo' | 'familiaGasto' | 'folioCajaChica' | 'receptorEfectivo' |
 *   'excepcionTipo' | 'excepcionInstruidaPor' | 'excepcionCotizaciones' | 'justificacionDiferencia' | 'notas' | 'paraQuien' | 'fechaRequerida' |
 *   'urgencia' | 'proveedoresSugeridos' > >} CamposEditablesRequisicion
 */

/** Únicos estados en los que se pueden cambiar el proveedor y la forma de pago (el servidor los bloquea desde «en autorización», también en espera). */
const ESTADOS_PROVEEDOR_EDITABLE = ['recibida', 'en_cotizacion']

/** ¿Ya no se pueden cambiar el proveedor ni la forma de pago? (desde «en autorización», en espera incluida; para corregir, la requisición vuelve a cotización). */
export function proveedorCongelado(folio) {
  const req = tReq.list().find((r) => r.folio === folio)
  if (!req) return false
  return !ESTADOS_PROVEEDOR_EDITABLE.includes(req.estado)
}

export const MSG_PROVEEDOR_CONGELADO = 'El proveedor y la forma de pago solo se cambian mientras la requisición está recibida o en cotización: desde «en autorización» quedan bloqueados. Si hay un error, pide un ajuste para regresarla a cotización.'

export const MSG_EXCEPCION_CONGELADA = 'La excepción de cotizaciones solo se cambia mientras la requisición está recibida o en cotización: desde «en autorización» queda bloqueada. Si hay un error, pide un ajuste para regresarla a cotización.'

export async function actualizarRequisicion(folio, patch, opts = {}) {
  const prev = tReq.raw().find((r) => r.folio === folio)
  if (!prev) throw new Error('Requisición no encontrada.')
  // Inmutabilidad: desde «en autorización» no cambian ni el proveedor ni la forma de pago (si regresa a cotización se vuelve a permitir).
  const tocaProveedor = ['proveedorId', 'formaPago', 'proveedorElegido'].some((k) => patch[k] !== undefined && (patch[k] ?? '') !== (prev[k] ?? ''))
  if (tocaProveedor && proveedorCongelado(folio)) throw new Error(MSG_PROVEEDOR_CONGELADO)
  const tocaExcepcion = ['excepcionTipo', 'excepcionInstruidaPor', 'excepcionCotizaciones'].some((k) => patch[k] !== undefined && (patch[k] ?? '') !== (prev[k] ?? ''))
  if (tocaExcepcion && proveedorCongelado(folio)) throw new Error(MSG_EXCEPCION_CONGELADA)
  const next = await tReq.update(folio, { ...patch, updatedAt: ahora() })
  const { antes, despues } = cambios(prev, patch)
  if (Object.keys(despues).length > 0) {
    registrarBitacora({ tabla: 'cmp_requisiciones', registroId: folio, accion: 'cambio', antes, despues, detalle: `${opts.usuario ?? usuarioActual()} actualizó ${Object.keys(despues).join(', ')}` })
  }
  return next
}

/** Edita una partida mientras la requisición está recibida o en cotización (después queda congelada para la autorización). */
export async function actualizarPartida(
  id,
  patch,
  opts = {},
) {
  const prev = tPartidas.raw().find((p) => p.id === id)
  if (!prev) throw new Error('Partida no encontrada.')
  const req = tReq.raw().find((r) => r.folio === prev.folio)
  if (!req || !(req.estado === 'recibida' || req.estado === 'en_cotizacion')) throw new Error('La requisición ya no admite cambios en sus partidas.')
  if (patch.cantidad !== undefined && !(patch.cantidad > 0)) throw new Error('La cantidad debe ser mayor a cero.')
  const next = await tPartidas.update(id, patch)
  const { antes, despues } = cambios(prev, patch)
  registrarBitacora({ tabla: 'cmp_partidas', registroId: id, accion: 'cambio', antes, despues, detalle: `${opts.usuario ?? usuarioActual()} editó la partida ${prev.num} de ${prev.folio}` })
  return next
}

// ---------------------------------------------------------------------------------------------------------------------
// Avisos antes de comprar: duplicados y stock disponible
// ---------------------------------------------------------------------------------------------------------------------
/** @typedef {'duplicado_abierta' | 'compra_reciente' | 'stock_ti' | 'stock_mantenimiento'} TipoAviso */

/**
 * @typedef {object} AvisoCompra
 * @property {TipoAviso} tipo
 * @property {number} partida - Número de partida (1-based, según el arreglo recibido).
 * @property {string} producto
 * @property {string} mensaje
 * @property {string} [referencia] - Folio relacionado (duplicados) o id de equipo/material (stock).
 */

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'y', 'en', 'un', 'una', 'por', 'a'])
function tokens(texto) {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !PALABRAS_VACIAS.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t))
}
/** Qué fracción de los tokens de `a` aparece en `b`. */
function cobertura(a, b) {
  if (a.length === 0 || b.length === 0) return 0
  const sb = new Set(b)
  return a.filter((t) => sb.has(t)).length / a.length
}
export function productosSimilares(a, b) {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.length === 0 || tb.length === 0) return false
  return Math.min(cobertura(ta, tb), cobertura(tb, ta)) >= 0.75 || normalizar(a) === normalizar(b)
}

const DIA = 86400000

/**
 * Revisa ANTES de comprar/cotizar si lo que se pide ya está pedido en otra requisición abierta, se compró hace poco
 * o hay existencia disponible en el inventario (TI: equipos disponibles; Mantenimiento: material/herramienta).
 * No bloquea: avisa para evitar compras innecesarias.
 */
export function avisosAntesDeComprar(
  partidas,
  opts,
) {
  const avisos = []
  const hoy = ahora()
  const otras = tReq.list().filter((r) => r.folio !== opts?.excluirFolio)
  const partidasOtras = tPartidas.raw()
  const equipos = listEquipos().filter((e) => e.estado === 'disponible')
  const materiales = listMateriales().filter((m) => m.cantidadActual > 0)

  partidas.forEach((p, idx) => {
    const n = idx + 1
    if (!p.producto?.trim()) return
    // 1) Duplicados en otras requisiciones
    for (const r of otras) {
      if (r.estado === 'rechazada' || r.estado === 'cancelada') continue
      const reciente = r.estado === 'entregada'
      if (reciente && hoy - r.updatedAt > 30 * DIA) continue
      const similar = partidasOtras.find((x) => x.folio === r.folio && productosSimilares(p.producto, x.producto))
      if (!similar) continue
      avisos.push({
        tipo: reciente ? 'compra_reciente' : 'duplicado_abierta',
        partida: n,
        producto: p.producto,
        referencia: r.folio,
        mensaje: reciente
          ? `«${p.producto}» ya se compró recientemente en ${r.folio} (${similar.cantidad} × ${similar.producto}, ${r.solicitanteNombre}).`
          : `«${p.producto}» ya está pedido en la requisición abierta ${r.folio} (${similar.cantidad} × ${similar.producto}, ${r.solicitanteNombre}, ${ESTADOS[r.estado].corta}).`,
      })
    }
    // 2) Stock disponible
    const destino = p.categoriaId ? destinoDeCategoria(p.categoriaId) : undefined
    if (destino === undefined || destino === 'ti' || destino === 'mantenimiento') {
      const tp = tokens(p.producto)
      const coinciden = equipos.filter((e) => {
        const fam = getFamilia(e.familiaId)
        if (destino === 'ti' && fam?.tipo !== 'sistemas') return false
        if (destino === 'mantenimiento' && fam?.tipo !== 'mantenimiento') return false
        return cobertura(tp, tokens(`${fam?.nombre ?? ''} ${e.marca ?? ''} ${e.modelo ?? ''}`)) >= 0.75
      })
      if (coinciden.length > 0) {
        const donde = [...new Set(coinciden.map((e) => getUbicacion(e.ubicacionId)?.nombre ?? 'sin ubicación'))].slice(0, 3).join(', ')
        avisos.push({
          tipo: destino === 'mantenimiento' ? 'stock_mantenimiento' : 'stock_ti',
          partida: n,
          producto: p.producto,
          referencia: coinciden[0].id,
          mensaje: `Hay ${coinciden.length} equipo(s) DISPONIBLE(S) en inventario parecidos a «${p.producto}» (${donde}). Valida si se pueden reasignar antes de comprar.`,
        })
      }
      if (destino !== 'ti') {
        const mat = materiales.filter((m) => cobertura(tp, tokens(m.nombre)) >= 0.75)
        if (mat.length > 0) {
          const total = mat.reduce((s, m) => s + m.cantidadActual, 0)
          avisos.push({
            tipo: 'stock_mantenimiento',
            partida: n,
            producto: p.producto,
            referencia: mat[0].id,
            mensaje: `Hay existencia de «${mat[0].nombre}» en inventario de Mantenimiento (${total} ${mat[0].unidadMedida}). Revisa antes de comprar.`,
          })
        }
      }
    }
  })
  return avisos
}

/** Compara nombres sin acentos/mayúsculas (separación de funciones: solicita ≠ cotiza ≠ aprueba ≠ entrega el dinero). */
export function normalizarNombre(s) {
  return normalizar(s)
}

// ---------------------------------------------------------------------------------------------------------------------
// Proveedor y forma de pago de la compra (catálogo de proveedores)
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Liga a la requisición el proveedor elegido del catálogo y la forma de pago de la compra (de ahí sale el destino: efectivo → Tesorería;
 * transferencia o tarjeta → Cuentas por pagar). Solo mientras la requisición esté recibida o en cotización; el proveedor debe estar activo.
 * `proveedorElegido` (texto) se sincroniza con el nombre comercial del catálogo.
 * @param {string} folio
 * @param {string} proveedorId
 * @param {FormaPago} [formaPago] - Por omisión, la forma habitual del proveedor.
 */
export async function vincularProveedor(folio, proveedorId, formaPago, opts = {}) {
  const req = tReq.raw().find((r) => r.folio === folio)
  if (!req) throw new Error('Requisición no encontrada.')
  if (proveedorCongelado(folio)) throw new Error(MSG_PROVEEDOR_CONGELADO)
  const p = getProveedor(proveedorId)
  if (!p) throw new Error('El proveedor no está en el catálogo.')
  if (!p.activo) throw new Error(`El proveedor «${p.nombreComercial}» está dado de baja: no se puede elegir para una compra nueva.`)
  const forma = formaPago ?? p.formaPago
  if (!formaPagoCoherente(p.tipo, forma)) throw new Error(p.tipo === 'remision' ? 'Un proveedor por remisión se paga en efectivo.' : 'Con factura la forma de pago es transferencia o tarjeta.')
  return actualizarRequisicion(folio, { proveedorId: p.id, formaPago: forma, proveedorElegido: p.nombreComercial }, opts)
}
