/**
 * Borrador de la hoja del cotizador: una columna por proveedor con todo como TEXTO (lo que se teclea) y las conversiones a/desde
 * las funciones de `src/lib/compras` (nada de reglas aquí: el puntaje y la recomendación salen de `analizarCotizaciones`).
 */
import {
  criteriosDe,
} from 'src/lib/compras'

/** @typedef {'' | 'si' | 'no'} Tri */

/**
 * Opción de un selector compacto (Segmentado.vue).
 * @typedef {object} OpcionSegmento
 * @property {string} value
 * @property {string} label
 * @property {string} [title]
 * @property {'ok' | 'peligro' | 'neutro' | 'azul'} [tono] - Color cuando está activa.
 */

export const MAX_COLUMNAS = 5

/**
 * @typedef {object} ColDraft
 * @property {string} key - Llave local estable (no es el id guardado).
 * @property {string} [id] - Id de la cotización guardada (sin id = nueva).
 * @property {string} proveedor
 * @property {string} contacto
 * @property {string} telefono
 * @property {string} direccion - No se muestra en la hoja, pero se conserva al editar una cotización guardada.
 * @property {Record<string, string>} precios - { partidaId: texto }
 * @property {string} descuento
 * @property {string} flete
 * @property {'incluido' | 'mas'} ivaIncluido
 * @property {string} entrega
 * @property {string} garantiaMeses
 * @property {'' | GarantiaResponsable} garantiaResp
 * @property {string} credito
 * @property {string} anticipo
 * @property {Tri} distribuidor
 * @property {Tri} soporte
 * @property {string} vigencia
 * @property {Tri} devoluciones
 * @property {number} calificacion - 0 = sin dato.
 * @property {string} notas
 * @property {string} condiciones
 * @property {string} archivoUrl
 * @property {boolean} subiendo
 * @property {ProveedorPrevio} [previo] - Lo que la plataforma sabe de este proveedor por cotizaciones anteriores (solo orientativo).
 */

let contador = 0
export const nuevaLlave = () => `col-${Date.now().toString(36)}-${++contador}`

/** Columna en blanco con los valores por defecto sensatos: IVA incluido, crédito de contado y sin anticipo. */
export function colVacia(proveedor = '') {
  return {
    key: nuevaLlave(),
    proveedor,
    contacto: '',
    telefono: '',
    direccion: '',
    precios: {},
    descuento: '',
    flete: '',
    ivaIncluido: 'incluido',
    entrega: '',
    garantiaMeses: '',
    garantiaResp: '',
    credito: '0',
    anticipo: '0',
    distribuidor: '',
    soporte: '',
    vigencia: '',
    devoluciones: '',
    calificacion: 0,
    notas: '',
    condiciones: '',
    archivoUrl: '',
    subiendo: false,
  }
}

const triDe = (v) => (v === true ? 'si' : v === false ? 'no' : '')
const triABool = (v) => (v === 'si' ? true : v === 'no' ? false : undefined)
const txt = (v) => (v === undefined || v === null ? '' : String(v))

export function colDesdeCotizacion(c, precios) {
  const k = criteriosDe(c)
  return {
    key: nuevaLlave(),
    id: c.id,
    proveedor: c.proveedor,
    contacto: c.contacto ?? '',
    telefono: c.telefono ?? '',
    direccion: c.direccion ?? '',
    precios: Object.fromEntries(Object.entries(precios).map(([pid, v]) => [pid, String(v)])),
    descuento: k.descuentoMonto ? String(k.descuentoMonto) : '',
    flete: k.flete ? String(k.flete) : '',
    ivaIncluido: k.ivaIncluido === false ? 'mas' : 'incluido',
    entrega: txt(k.tiempoEntregaDias),
    garantiaMeses: txt(k.garantiaMeses),
    garantiaResp: k.garantiaResponsable ?? '',
    credito: txt(k.diasCredito),
    anticipo: txt(k.anticipoPct),
    distribuidor: triDe(k.distribuidorAutorizado),
    soporte: triDe(k.soporteTecnico),
    vigencia: k.vigenciaHasta ?? '',
    devoluciones: triDe(k.aceptaDevoluciones),
    calificacion: k.calificacionProveedor ?? 0,
    notas: c.calidad ?? '',
    condiciones: c.condiciones ?? '',
    archivoUrl: c.archivoUrl ?? '',
    subiendo: false,
  }
}

/** Texto tecleado → número (undefined = vacío, null = no es un número válido). Acepta "$ 1,234.50". */
export function numTxt(s) {
  const t = (s ?? '').replace(/[$\s,]/g, '')
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Limpia un valor pegado desde Excel ("$1,234.50 " → "1234.50"); '' si no es numérico. */
export function limpiarNumPegado(s) {
  const t = s.replace(/[$\s,]/g, '')
  return t !== '' && Number.isFinite(Number(t)) ? t : ''
}

/** ¿La columna está en blanco (sin proveedor ni precios)? Las columnas en blanco se ignoran al guardar. */
export function colEnBlanco(c) {
  return !c.id && !c.proveedor.trim() && Object.values(c.precios).every((v) => v.trim() === '')
}

/** Subtotal (Σ precio × cantidad) y si trae precio en todas las partidas. */
export function subtotalDraft(c, partidas) {
  let subtotal = 0
  let completa = partidas.length > 0
  for (const p of partidas) {
    const n = numTxt(c.precios[p.id])
    if (typeof n === 'number' && n >= 0) subtotal += n * p.cantidad
    else completa = false
  }
  return { subtotal, completa }
}

const numOpt = (s) => {
  const n = numTxt(s)
  return typeof n === 'number' ? n : undefined
}

/** Entrada del análisis con lo que hay en la hoja (el resultado se ve en vivo, antes de guardar). */
export function aEntrada(c, partidas) {
  const { subtotal, completa } = subtotalDraft(c, partidas)
  const e = {
    id: c.key,
    proveedor: c.proveedor.trim() || 'Proveedor sin nombre',
    subtotal,
    completa,
    sinPrecios: !Object.values(c.precios).some((v) => typeof numTxt(v) === 'number'),
    descuentoMonto: numOpt(c.descuento) ?? 0,
    flete: numOpt(c.flete) ?? 0,
    ivaIncluido: c.ivaIncluido !== 'mas',
    tiempoEntregaDias: numOpt(c.entrega),
    garantiaMeses: c.garantiaResp === 'ninguna' ? 0 : numOpt(c.garantiaMeses),
    garantiaResponsable: c.garantiaResp || undefined,
    diasCredito: numOpt(c.credito),
    anticipoPct: numOpt(c.anticipo),
    distribuidorAutorizado: triABool(c.distribuidor),
    soporteTecnico: triABool(c.soporte),
    vigenciaHasta: c.vigencia || undefined,
    aceptaDevoluciones: triABool(c.devoluciones),
    calificacionProveedor: c.calificacion || undefined,
  }
  return e
}

/** Valida el texto de los números de la columna; devuelve el primer problema o ''. */
export function problemaCol(c, partidas) {
  const nombre = c.proveedor.trim() || 'una columna'
  for (const p of partidas) {
    if (numTxt(c.precios[p.id]) === null) return `El precio de «${p.producto}» en ${nombre} no es un número.`
    const n = numTxt(c.precios[p.id])
    if (typeof n === 'number' && n < 0) return `El precio de «${p.producto}» en ${nombre} no puede ser negativo.`
  }
  for (const [txtCampo, nombreCampo] of [
    [c.descuento, 'El descuento'],
    [c.flete, 'El flete'],
    [c.entrega, 'El tiempo de entrega'],
    [c.garantiaMeses, 'Los meses de garantía'],
    [c.credito, 'Los días de crédito'],
    [c.anticipo, 'El anticipo'],
  ]) {
    const n = numTxt(txtCampo)
    if (n === null || (typeof n === 'number' && n < 0)) return `${nombreCampo} de ${nombre} debe ser un número de 0 o más.`
  }
  return ''
}

/** Columna lista para `guardarHoja`. */
export function aColumnaHoja(c, partidas) {
  const precios = {}
  for (const p of partidas) {
    const n = numTxt(c.precios[p.id])
    if (typeof n === 'number') precios[p.id] = n
  }
  const e = aEntrada(c, partidas)
  return {
    id: c.id,
    precios,
    datos: {
      proveedor: c.proveedor.trim(),
      contacto: c.contacto.trim() || undefined,
      telefono: c.telefono.trim() || undefined,
      direccion: c.direccion.trim() || undefined,
      calidad: c.notas.trim() || undefined,
      condiciones: c.condiciones.trim() || undefined,
      archivoUrl: c.archivoUrl || undefined,
      descuentoMonto: e.descuentoMonto,
      flete: e.flete,
      ivaIncluido: e.ivaIncluido,
      tiempoEntregaDias: e.tiempoEntregaDias,
      garantiaMeses: e.garantiaMeses,
      garantiaResponsable: e.garantiaResponsable,
      diasCredito: e.diasCredito,
      anticipoPct: e.anticipoPct,
      distribuidorAutorizado: e.distribuidorAutorizado,
      soporteTecnico: e.soporteTecnico,
      vigenciaHasta: e.vigenciaHasta,
      aceptaDevoluciones: e.aceptaDevoluciones,
      calificacionProveedor: e.calificacionProveedor,
    },
  }
}

/** Huella de lo capturado (para saber si hay cambios sin guardar). */
export function firmaCol(c) {
  const { key: _k, subiendo: _s, previo: _p, ...resto } = c
  void _k
  void _s
  void _p
  const precios = Object.fromEntries(Object.entries(resto.precios).filter(([, v]) => v.trim() !== '').sort(([a], [b]) => a.localeCompare(b)))
  return JSON.stringify({ ...resto, precios })
}
