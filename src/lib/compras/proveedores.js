import { user } from '../auth'
import { registrarBitacora, cambios } from '../bitacora'
import { canCreateProveedor, canDisableProveedor, canEditDatosFiscalesProveedor, canEditProveedor, canViewProveedores } from '../access'
import { FORMA_PAGO_LABEL, TIPO_PROVEEDOR_LABEL, destinoDePago } from './tipos'
import { crearTabla, modoLocal, nuevoId, ahora, normalizar, usuarioActual } from './store'

/**
 * Catálogo de proveedores de Compras Indirectas (tabla `cmp_proveedores`).
 *
 * Reglas (SPEC del catálogo de proveedores y ruteo de pagos):
 *  - Solo se registra el proveedor ELEGIDO para la compra (no todo el que cotizó); antes de crear se busca por RFC y por nombre para REUTILIZAR.
 *  - `tipo`: `remision` (se paga en efectivo) o `factura`. Remisión ⇒ forma de pago efectivo; factura ⇒ transferencia o tarjeta.
 *  - Obligatorios · factura: razón social, RFC, dirección fiscal, CP y CLABE (esta solo si el pago es transferencia). Remisión: solo el nombre
 *    comercial; lo demás es opcional pero, si se captura, se valida.
 *  - Formato: RFC `^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$` (mayúsculas, sin espacios), CLABE de 18 dígitos con dígito verificador (pesos 3, 7, 1), CP de 5 dígitos.
 *  - RFC único entre proveedores. Nada se borra: la baja es `activo = false` con motivo; un proveedor inactivo no se puede elegir para una compra.
 *  - Separación de funciones: Adquisiciones (quien compra) NO cambia razón social, RFC, CLABE, tipo ni forma de pago de un proveedor que ya existe.
 *
 * Este módulo NO importa requisiciones.js (lo importa él): así no hay ciclos.
 */
const tabla = crearTabla({
  key: 'dga_cmp_proveedores',
  tabla: 'cmp_proveedores',
  pk: 'id',
  ts: ['createdAt', 'updatedAt'],
  orderBy: 'nombre_comercial',
  // MySQL devuelve TINYINT(1) como 0/1: en la app `activo` siempre es booleano.
  alCargar: (p) => ({ ...p, activo: !!p.activo }),
})

/**
 * Con la API, los roles que no ven el catálogo (403) no lo piden. Sin sesión (modo demo o pantallas públicas) se carga como las demás tablas.
 */
export async function loadProveedoresCatalogoCache() {
  const rol = user.value?.role
  if (!modoLocal() && rol && !canViewProveedores(rol)) {
    tabla.cache = []
    tabla.ready = true
    return
  }
  await tabla.load()
}
export const isProveedoresCatalogoCacheReady = () => tabla.isReady()
export function reiniciarProveedoresCatalogoLocal() {
  tabla.reiniciarLocal()
}

// ---------------------------------------------------------------------------------------------------------------------
// Validadores de formato (idénticos en el servidor)
// ---------------------------------------------------------------------------------------------------------------------
export const RFC_REGEX = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/
export const CP_REGEX = /^[0-9]{5}$/
const PESOS_CLABE = [3, 7, 1]

/** RFC en mayúsculas, sin espacios ni guiones (el servidor solo lo pasa a mayúsculas y valida la longitud ANTES de normalizar: se limpia aquí). */
export function normalizarRfc(s) {
  return String(s ?? '').replace(/[\s-]+/g, '').toUpperCase()
}
/** CLABE solo con dígitos (se quitan espacios y guiones al capturar). */
export function normalizarClabe(s) {
  return String(s ?? '').replace(/[\s-]+/g, '')
}
export function normalizarCp(s) {
  return String(s ?? '').replace(/\s+/g, '')
}

/** Dígito verificador de una CLABE: Σ((dígito × peso) mod 10) con pesos 3, 7, 1 repetidos sobre los primeros 17; control = (10 − suma mod 10) mod 10. */
export function digitoVerificadorClabe(primeros17) {
  let suma = 0
  for (let i = 0; i < 17; i++) suma += (Number(primeros17[i]) * PESOS_CLABE[i % 3]) % 10
  return (10 - (suma % 10)) % 10
}

export function rfcValido(s) {
  return RFC_REGEX.test(normalizarRfc(s))
}
/** 18 dígitos y el dígito verificador coincide con el 18.º. */
export function clabeValida(s) {
  const c = normalizarClabe(s)
  return /^[0-9]{18}$/.test(c) && digitoVerificadorClabe(c) === Number(c[17])
}
export function cpValido(s) {
  return CP_REGEX.test(normalizarCp(s))
}

/** Mensaje de error del formato ('' si es válido o si está vacío: la obligatoriedad la decide el tipo de proveedor). */
export function errorRfc(s) {
  const v = normalizarRfc(s)
  if (!v) return ''
  return RFC_REGEX.test(v) ? '' : 'El RFC no es válido: 12 o 13 caracteres (3–4 letras, 6 dígitos de fecha y 3 de homoclave), sin espacios.'
}
export function errorClabe(s) {
  const v = normalizarClabe(s)
  if (!v) return ''
  if (!/^[0-9]+$/.test(v)) return 'La CLABE solo lleva dígitos.'
  if (v.length !== 18) return `La CLABE debe tener 18 dígitos (llevas ${v.length}).`
  return digitoVerificadorClabe(v) === Number(v[17]) ? '' : 'La CLABE no es válida: el dígito verificador no coincide. Revisa que no falte o sobre algún dígito.'
}
export function errorCp(s) {
  const v = normalizarCp(s)
  if (!v) return ''
  return CP_REGEX.test(v) ? '' : 'El código postal debe tener 5 dígitos.'
}

/** Enmascara la CLABE: «•••• •••• •••• 1234». */
export function clabeEnmascarada(clabe) {
  const c = normalizarClabe(clabe)
  return c ? `•••• •••• •••• ${c.slice(-4)}` : '—'
}
/** CLABE en grupos de 3-3-11-1 para leerla cómoda. */
export function clabeConEspacios(clabe) {
  const c = normalizarClabe(clabe)
  return c.length === 18 ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6, 17)} ${c.slice(17)}` : c
}

// ---------------------------------------------------------------------------------------------------------------------
// Coherencia tipo ↔ forma de pago y obligatoriedad
// ---------------------------------------------------------------------------------------------------------------------
/** Remisión ⇒ efectivo; factura ⇒ transferencia o tarjeta. */
export function formaPagoCoherente(tipo, formaPago) {
  if (tipo === 'remision') return formaPago === 'efectivo'
  if (tipo === 'factura') return formaPago === 'transferencia' || formaPago === 'tarjeta'
  return false
}
/** Formas de pago que admite un tipo de proveedor. */
export function formasPagoDeTipo(tipo) {
  return tipo === 'factura' ? ['transferencia', 'tarjeta'] : ['efectivo']
}

/**
 * Errores de un proveedor (objeto campo → mensaje; vacío = completo y válido) según su tipo y forma de pago.
 * `formaPago` es la de la COMPRA cuando se evalúa una requisición (puede diferir de la habitual del proveedor).
 * @param {Partial<Proveedor>} p
 * @param {FormaPago} [formaPago]
 */
export function erroresProveedor(p, formaPago = p.formaPago) {
  const e = {}
  if (!String(p.nombreComercial ?? '').trim()) e.nombreComercial = 'Escribe el nombre comercial.'
  if (p.tipo !== 'remision' && p.tipo !== 'factura') e.tipo = 'Elige el tipo de proveedor.'
  else if (!formaPagoCoherente(p.tipo, formaPago)) e.formaPago = p.tipo === 'remision' ? 'Una remisión se paga en efectivo.' : 'Con factura elige transferencia o tarjeta.'
  const factura = p.tipo === 'factura'
  const razon = String(p.razonSocial ?? '').trim()
  const rfc = normalizarRfc(p.rfc)
  const dir = String(p.direccionFiscal ?? '').trim()
  const cp = normalizarCp(p.cp)
  const clabe = normalizarClabe(p.clabe)
  if (factura && !razon) e.razonSocial = 'La razón social es obligatoria con factura.'
  if (factura && !rfc) e.rfc = 'El RFC es obligatorio con factura.'
  else if (rfc && errorRfc(rfc)) e.rfc = errorRfc(rfc)
  if (factura && !dir) e.direccionFiscal = 'La dirección fiscal es obligatoria con factura.'
  if (factura && !cp) e.cp = 'El código postal es obligatorio con factura.'
  else if (cp && errorCp(cp)) e.cp = errorCp(cp)
  if (factura && formaPago === 'transferencia' && !clabe) e.clabe = 'La CLABE es obligatoria para pagar por transferencia.'
  else if (clabe && errorClabe(clabe)) e.clabe = errorClabe(clabe)
  if (razon.length > 255) e.razonSocial = 'La razón social es demasiado larga (máximo 255).'
  if (dir.length > 500) e.direccionFiscal = 'La dirección fiscal es demasiado larga (máximo 500).'
  return e
}

/** Nombre corto de cada campo (para el mensaje de la compuerta). */
const CAMPO_TEXTO = { nombreComercial: 'nombre comercial', tipo: 'tipo', formaPago: 'forma de pago', razonSocial: 'razón social', rfc: 'RFC', direccionFiscal: 'dirección fiscal', cp: 'CP', clabe: 'CLABE' }

// ---------------------------------------------------------------------------------------------------------------------
// Lectura y búsqueda
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} FiltroProveedores
 * @property {string} [texto] - Nombre comercial, razón social o RFC (sin acentos ni mayúsculas).
 * @property {TipoProveedor} [tipo]
 * @property {boolean} [activo] - true = solo activos; false = solo dados de baja; sin definir = todos.
 */

export function listProveedores(filtro) {
  let list = tabla.list()
  if (filtro?.activo !== undefined) list = list.filter((p) => !!p.activo === filtro.activo)
  if (filtro?.tipo) list = list.filter((p) => p.tipo === filtro.tipo)
  if (filtro?.texto?.trim()) {
    const q = normalizar(filtro.texto)
    const qr = normalizarRfc(filtro.texto)
    list = list.filter((p) => normalizar(`${p.nombreComercial} ${p.razonSocial ?? ''}`).includes(q) || (!!qr && (p.rfc ?? '').includes(qr)))
  }
  return [...list].sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial, 'es'))
}

export function getProveedor(id) {
  return id ? tabla.get(id) : undefined
}

/** Búsqueda para ELEGIR proveedor de una compra: solo activos, por nombre comercial, razón social o RFC. */
export function buscarProveedores(texto) {
  return listProveedores({ texto, activo: true })
}

/** Proveedores que se parecen a los datos capturados (para reutilizar en lugar de duplicar): por RFC exacto y por nombre. */
export function buscarDuplicados(datos, idActual) {
  tabla.list()
  const raw = tabla.raw().filter((p) => p.id !== idActual)
  const rfc = normalizarRfc(datos.rfc)
  const nombre = normalizar(datos.nombreComercial)
  const porRfc = rfc ? raw.find((p) => normalizarRfc(p.rfc) === rfc) : undefined
  const porNombre = nombre ? raw.filter((p) => normalizar(p.nombreComercial) === nombre || (nombre.length >= 4 && (normalizar(p.nombreComercial).includes(nombre) || nombre.includes(normalizar(p.nombreComercial))))) : []
  return { porRfc, porNombre: porNombre.filter((p) => p.id !== porRfc?.id) }
}

// ---------------------------------------------------------------------------------------------------------------------
// Alta, edición, baja
// ---------------------------------------------------------------------------------------------------------------------
const limpiar = (s) => {
  const v = String(s ?? '').trim()
  return v || undefined
}

/** Datos del formulario → campos normalizados del proveedor (sin id ni marcas de tiempo). */
function normalizarDatos(d) {
  const tipo = d.tipo
  return {
    nombreComercial: String(d.nombreComercial ?? '').trim(),
    razonSocial: limpiar(d.razonSocial),
    tipo,
    formaPago: tipo === 'remision' ? 'efectivo' : d.formaPago,
    rfc: limpiar(normalizarRfc(d.rfc)),
    clabe: limpiar(normalizarClabe(d.clabe)),
    direccionFiscal: limpiar(d.direccionFiscal),
    cp: limpiar(normalizarCp(d.cp)),
    notas: limpiar(d.notas),
  }
}

function primerError(errs) {
  return Object.values(errs)[0]
}

function rfcDuplicado(rfc, idActual) {
  if (!rfc) return undefined
  return tabla.raw().find((p) => p.id !== idActual && normalizarRfc(p.rfc) === rfc)
}

/**
 * Crea un proveedor. Valida formato y obligatoriedad según tipo/forma de pago, y NO permite duplicar el RFC ni el nombre comercial
 * (hay que reutilizar el existente). Solo Adquisiciones, Dirección y Cuentas por pagar (si hay sesión).
 * @param {object} input - nombreComercial, tipo, formaPago y, según el tipo, razonSocial, rfc, direccionFiscal, cp, clabe, notas.
 * @param {{ usuario?: string }} [opts]
 * @returns {Promise<Proveedor>}
 */
export async function crearProveedor(input, opts = {}) {
  const rol = user.value?.role
  if (rol && !canCreateProveedor(rol)) throw new Error('Tu perfil no da de alta proveedores: lo hacen Adquisiciones, Cuentas por pagar o Dirección.')
  const d = normalizarDatos(input)
  const errs = erroresProveedor(d)
  if (Object.keys(errs).length) throw new Error(primerError(errs))
  const dupRfc = rfcDuplicado(d.rfc)
  if (dupRfc) throw new Error(`Ya existe un proveedor con el RFC ${d.rfc} (${dupRfc.nombreComercial}). Úsalo en lugar de crear uno nuevo.`)
  const dupNombre = tabla.raw().find((p) => normalizar(p.nombreComercial) === normalizar(d.nombreComercial))
  if (dupNombre) throw new Error(`Ya existe un proveedor con el nombre «${dupNombre.nombreComercial}». Úsalo en lugar de crear uno nuevo.`)
  const usuario = opts.usuario ?? usuarioActual()
  const ms = ahora()
  const p = { id: `prv-${nuevoId()}`, ...d, activo: true, creadoPor: usuario, actualizadoPor: usuario, createdAt: ms, updatedAt: ms }
  // Los campos vacíos no viajan (la fila se arma sin `undefined`).
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k]
  await tabla.insert(p)
  registrarBitacora({ tabla: 'cmp_proveedores', registroId: p.id, accion: 'alta', despues: p, detalle: `${usuario} registró al proveedor ${p.nombreComercial} (${TIPO_PROVEEDOR_LABEL[p.tipo]}${p.tipo === 'factura' ? ` · ${FORMA_PAGO_LABEL[p.formaPago]}` : ''})`, usuario })
  return p
}

/** Campos que Adquisiciones NO puede cambiar en un proveedor que ya existe. */
export const CAMPOS_FISCALES = ['razonSocial', 'rfc', 'clabe', 'tipo', 'formaPago']

/** ¿Cambiar estos campos exige perfil fiscal? (compara contra el proveedor actual). */
export function camposFiscalesCambiados(prev, patch) {
  const d = normalizarDatos({ ...prev, ...patch })
  return CAMPOS_FISCALES.filter((k) => (patch[k] !== undefined) && String(d[k] ?? '') !== String(prev[k] ?? ''))
}

/**
 * Edita un proveedor existente. Quien compra (Adquisiciones) solo cambia nombre comercial, dirección fiscal, CP y notas: razón social, RFC,
 * CLABE, tipo y forma de pago los corrige Cuentas por pagar, Finanzas o Dirección. Cada cambio queda en la bitácora con antes y después
 * (en especial el RFC y la CLABE).
 */
export async function actualizarProveedor(id, patch, opts = {}) {
  const prev = tabla.raw().find((p) => p.id === id)
  if (!prev) throw new Error('Proveedor no encontrado.')
  const rol = user.value?.role
  if (rol && !canEditProveedor(rol)) throw new Error('Tu perfil no modifica proveedores.')
  const fiscales = camposFiscalesCambiados(prev, patch)
  if (rol && fiscales.length > 0 && !canEditDatosFiscalesProveedor(rol)) {
    throw new Error('Quien compra no cambia datos fiscales ni bancarios de un proveedor que ya existe (razón social, RFC, CLABE, tipo o forma de pago): pide a Cuentas por pagar o a Finanzas que lo corrijan.')
  }
  const d = normalizarDatos({ ...prev, ...patch })
  // Se validan los campos que se tocan; si cambia el tipo o la forma de pago (otra modalidad), se valida el proveedor completo.
  const todos = erroresProveedor(d)
  const cambiaModalidad = d.tipo !== prev.tipo || d.formaPago !== prev.formaPago
  const errs = cambiaModalidad ? todos : Object.fromEntries(Object.entries(todos).filter(([k]) => patch[k] !== undefined))
  if (Object.keys(errs).length) throw new Error(primerError(errs))
  const dupRfc = rfcDuplicado(d.rfc, id)
  if (dupRfc) throw new Error(`Ya existe otro proveedor con el RFC ${d.rfc} (${dupRfc.nombreComercial}).`)
  const dupNombre = tabla.raw().find((p) => p.id !== id && normalizar(p.nombreComercial) === normalizar(d.nombreComercial))
  if (dupNombre) throw new Error(`Ya existe otro proveedor con el nombre «${dupNombre.nombreComercial}».`)
  const usuario = opts.usuario ?? usuarioActual()
  // Solo viajan los campos que cambian de verdad; lo que se vacía se manda como cadena vacía (la tabla lo guarda como NULL).
  const cambia = {}
  for (const k of ['nombreComercial', 'razonSocial', 'tipo', 'formaPago', 'rfc', 'clabe', 'direccionFiscal', 'cp', 'notas']) {
    if ((d[k] ?? '') !== (prev[k] ?? '')) cambia[k] = d[k] ?? ''
  }
  if (Object.keys(cambia).length === 0) return prev
  const next = await tabla.update(id, { ...cambia, actualizadoPor: usuario, updatedAt: ahora() })
  // Los campos vaciados salen del objeto en la caché.
  for (const k of Object.keys(cambia)) if (cambia[k] === '') delete next[k]
  tabla.setLocal(next)
  const { antes, despues } = cambios(prev, cambia)
  registrarBitacora({
    tabla: 'cmp_proveedores',
    registroId: id,
    accion: 'cambio',
    antes,
    despues,
    detalle: `${usuario} modificó al proveedor ${prev.nombreComercial}: ${Object.keys(despues).map((k) => CAMPO_TEXTO[k] ?? k).join(', ')}${fiscales.length ? ' (datos fiscales/bancarios)' : ''}`,
    usuario,
  })
  return next
}

/** Baja del proveedor (NO se borra): `activo = false` con motivo obligatorio. Deja de poder elegirse para compras nuevas. */
export async function darDeBajaProveedor(id, motivo, opts = {}) {
  const prev = tabla.raw().find((p) => p.id === id)
  if (!prev) throw new Error('Proveedor no encontrado.')
  const rol = user.value?.role
  if (rol && !canDisableProveedor(rol)) throw new Error('Solo Dirección, Finanzas y Cuentas por pagar dan de baja proveedores (Adquisiciones no).')
  if (!prev.activo) throw new Error('El proveedor ya está dado de baja.')
  if (!motivo?.trim()) throw new Error('Escribe el motivo de la baja (obligatorio).')
  const usuario = opts.usuario ?? usuarioActual()
  await tabla.update(id, { activo: false, motivoBaja: motivo.trim(), actualizadoPor: usuario, updatedAt: ahora() })
  registrarBitacora({ tabla: 'cmp_proveedores', registroId: id, accion: 'desactivación', antes: { activo: true }, despues: { activo: false, motivoBaja: motivo.trim() }, detalle: `${usuario} dio de baja a ${prev.nombreComercial}: ${motivo.trim()}`, usuario })
}

/** Reactiva un proveedor dado de baja. */
export async function reactivarProveedor(id, opts = {}) {
  const prev = tabla.raw().find((p) => p.id === id)
  if (!prev) throw new Error('Proveedor no encontrado.')
  const rol = user.value?.role
  if (rol && !canDisableProveedor(rol)) throw new Error('Solo Dirección, Finanzas y Cuentas por pagar reactivan proveedores (Adquisiciones no).')
  if (prev.activo) throw new Error('El proveedor ya está activo.')
  const usuario = opts.usuario ?? usuarioActual()
  const next = await tabla.update(id, { activo: true, motivoBaja: '', actualizadoPor: usuario, updatedAt: ahora() })
  delete next.motivoBaja
  tabla.setLocal(next)
  registrarBitacora({ tabla: 'cmp_proveedores', registroId: id, accion: 'reactivación', antes: { activo: false, motivoBaja: prev.motivoBaja }, despues: { activo: true }, detalle: `${usuario} reactivó a ${prev.nombreComercial}`, usuario })
}

// ---------------------------------------------------------------------------------------------------------------------
// Compuerta de la requisición: proveedor activo y completo
// ---------------------------------------------------------------------------------------------------------------------
/** Mensaje de la compuerta (el MISMO texto que el servidor). */
export const MSG_PROVEEDOR_INCOMPLETO = 'Registra al proveedor elegido en el catálogo (razón social, RFC, dirección fiscal, CP y CLABE si es transferencia) antes de pedir la autorización.'

/**
 * Qué impide pedir la autorización por el lado del proveedor (null = todo bien): la requisición debe tener `proveedorId` de un proveedor ACTIVO
 * con los datos completos según su tipo y la forma de pago de la compra.
 * @param {Pick<Requisicion, 'proveedorId' | 'formaPago'>} req
 */
export function motivoProveedorIncompleto(req) {
  if (!req.proveedorId) return MSG_PROVEEDOR_INCOMPLETO
  const p = tabla.get(req.proveedorId)
  if (!p) return MSG_PROVEEDOR_INCOMPLETO
  if (!p.activo) return `El proveedor «${p.nombreComercial}» está dado de baja: elige otro del catálogo o regístralo de nuevo antes de pedir la autorización.`
  const errs = erroresProveedor(p, req.formaPago)
  const campos = Object.keys(errs)
  if (campos.length === 0) return null
  if (errs.formaPago) return `La forma de pago de la compra (${FORMA_PAGO_LABEL[req.formaPago] ?? 'sin definir'}) no corresponde al proveedor (${TIPO_PROVEEDOR_LABEL[p.tipo] ?? 'sin tipo'}): remisión se paga en efectivo y factura por transferencia o tarjeta.`
  return `${MSG_PROVEEDOR_INCOMPLETO} Falta o está mal: ${campos.map((c) => CAMPO_TEXTO[c] ?? c).join(', ')}.`
}

/** Ruteo del pago de una requisición según su forma de pago. */
export function destinoPagoDe(req) {
  return destinoDePago(req.formaPago)
}

/**
 * Lo que ve la liga pública de aprobación del proveedor elegido: SIN CLABE ni dirección fiscal.
 * @returns {{ nombreComercial: string, razonSocial?: string, rfc?: string, tipo: TipoProveedor, formaPago: FormaPago, destino: DestinoPago } | undefined}
 */
export function proveedorParaAprobar(req) {
  const p = req.proveedorId ? tabla.raw().find((x) => x.id === req.proveedorId) : undefined
  if (!p) return undefined
  return { nombreComercial: p.nombreComercial, razonSocial: p.razonSocial, rfc: p.rfc, tipo: p.tipo, formaPago: req.formaPago, destino: destinoDePago(req.formaPago) }
}
