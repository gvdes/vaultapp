import { track } from '../reactive'
import { supabase } from '../supabase'
import { registrarBitacora } from '../bitacora'
import { IVA_DEFAULT, PESOS_DEFAULT, normalizarPesos } from './analisisCotizaciones'
import { modoLocal, errorDe, usuarioActual } from './store'

/**
 * Reglas configurables de Compras Indirectas (tabla cmp_config: clave → valor jsonb).
 * `umbralDireccion` (50,000) = AVISO a Dirección (ya no aprueba; migración 022). `umbralCeo` (100,000) está EN DESUSO (los CEOs
 * salieron del flujo; se conserva el valor por compatibilidad).
 * Cotizaciones (SPEC 3): `umbralSinCotizacion` (100): una compra MENOR a ese monto no requiere cotización, solo el registro (sigue requiriendo
 * autorización de Finanzas). Menor a `umbralCotizacionSimple` (1,000) basta 1 cotización; a partir de él (>=) se exigen
 * `cotizacionesMinimas` (3) de proveedores DISTINTOS, salvo excepción documentada (especializado, adjudicación directa de CEO/DGA o urgencia): con ella basta 1.
 */
export const CONFIG_DEFAULT = {
  umbralCotizacionSimple: 1000,
  umbralSinCotizacion: 100,
  umbralDireccion: 50000,
  umbralCeo: 100000,
  cotizacionesMinimas: 3,
  copiasRespaldo: [],
  toleranciaDiferenciaPct: 0,
  diasExpiraToken: 15,
  urlBase: '',
  ivaPct: IVA_DEFAULT,
  cotizadorPesos: { ...PESOS_DEFAULT },
}

/** Clave de cmp_config por campo de ConfigCompras. */
const CLAVES = {
  umbralCotizacionSimple: 'umbral_cotizacion_simple',
  umbralSinCotizacion: 'umbral_sin_cotizacion',
  umbralDireccion: 'umbral_direccion',
  umbralCeo: 'umbral_ceo',
  cotizacionesMinimas: 'cotizaciones_minimas',
  copiasRespaldo: 'copias_respaldo',
  toleranciaDiferenciaPct: 'tolerancia_diferencia_pct',
  diasExpiraToken: 'dias_expira_token',
  urlBase: 'url_base',
  ivaPct: 'iva_pct',
  cotizadorPesos: 'cotizador_pesos',
}

export const CONFIG_DESCRIPCIONES = {
  umbralCotizacionSimple: 'Compras menores a este monto: basta 1 cotización. A partir de este monto (inclusive) se requieren las cotizaciones mínimas de proveedores distintos, salvo excepción documentada.',
  umbralSinCotizacion: 'Compras con monto MENOR a este valor no requieren cotización: solo el registro del proveedor y el monto; siguen requiriendo autorización de Finanzas.',
  umbralDireccion: 'Aviso a Dirección: por encima de este monto (MXN) Dirección recibe un correo informativo (sin botones) cuando la compra se envía a autorización. Dirección NO aprueba: la autoriza Finanzas.',
  umbralCeo: 'EN DESUSO desde 022 (los CEOs ya no participan en la autorización). Se conserva por compatibilidad con el historial; ningún flujo lo usa.',
  cotizacionesMinimas: 'Cotizaciones de proveedores distintos que se requieren a partir del umbral de cotización simple, salvo excepción documentada (producto o servicio especializado, adjudicación directa de CEO/DGA o urgencia): con excepción basta 1.',
  copiasRespaldo: 'Correos que reciben copia de respaldo de los correos (sin ligas de aprobación).',
  toleranciaDiferenciaPct: 'Tolerancia (%) entre lo comprado y lo autorizado antes de exigir re-aprobación o justificación.',
  diasExpiraToken: 'Vigencia (días) de las ligas de aprobación por correo.',
  urlBase: 'URL pública de la app, sin diagonal final, para las ligas de los correos.',
  ivaPct: 'Tasa de IVA (%) para normalizar cotizaciones sin IVA incluido y poder compararlas con las que sí lo traen.',
  cotizadorPesos: 'Pesos (suman 100) del puntaje del cotizador: precio, garantía, entrega, crédito, respaldo de marca, condiciones y calificación del proveedor.',
}

const KEY = 'dga_cmp_config'

let cache = { ...CONFIG_DEFAULT }
let ready = false

/**
 * Confirmación de las reglas con Finanzas: quién y cuándo (null = siguen siendo valores de ejemplo).
 * @typedef {object} ReglasConfirmadas
 * @property {string} por
 * @property {number} fecha
 */
const KEY_CONFIRMADAS = 'dga_cmp_reglas_confirmadas'
let confirmadas = null

function leerConfirmadas(v) {
  if (v && typeof v === 'object' && typeof v.por === 'string' && typeof v.fecha === 'number') return v
  return null
}

function desdeMapa(mapa) {
  const out = { ...CONFIG_DEFAULT }
  const num = (k, def) => {
    const v = Number(mapa[k])
    return mapa[k] !== undefined && Number.isFinite(v) ? v : def
  }
  out.umbralCotizacionSimple = num(CLAVES.umbralCotizacionSimple, out.umbralCotizacionSimple)
  out.umbralSinCotizacion = Math.max(0, num(CLAVES.umbralSinCotizacion, out.umbralSinCotizacion))
  out.umbralDireccion = num(CLAVES.umbralDireccion, out.umbralDireccion)
  out.umbralCeo = num(CLAVES.umbralCeo, out.umbralCeo)
  out.cotizacionesMinimas = Math.max(1, Math.round(num(CLAVES.cotizacionesMinimas, out.cotizacionesMinimas)))
  out.toleranciaDiferenciaPct = Math.max(0, num(CLAVES.toleranciaDiferenciaPct, out.toleranciaDiferenciaPct))
  out.diasExpiraToken = Math.max(1, Math.round(num(CLAVES.diasExpiraToken, out.diasExpiraToken)))
  const copias = mapa[CLAVES.copiasRespaldo]
  out.copiasRespaldo = Array.isArray(copias) ? copias.filter((x) => typeof x === 'string') : []
  const url = mapa[CLAVES.urlBase]
  out.urlBase = typeof url === 'string' ? url.replace(/\/+$/, '') : ''
  out.ivaPct = Math.min(100, Math.max(0, num(CLAVES.ivaPct, out.ivaPct)))
  out.cotizadorPesos = normalizarPesos(mapa[CLAVES.cotizadorPesos])
  return out
}

export async function loadConfigCache() {
  if (modoLocal()) {
    try {
      const raw = localStorage.getItem(KEY)
      cache = raw ? desdeMapa(JSON.parse(raw)) : { ...CONFIG_DEFAULT }
      confirmadas = leerConfirmadas(JSON.parse(localStorage.getItem(KEY_CONFIRMADAS) ?? 'null'))
    } catch {
      cache = { ...CONFIG_DEFAULT }
      confirmadas = null
    }
    ready = true
    return
  }
  const { data, error } = await supabase.from('cmp_config').select('clave, valor')
  if (error) console.warn('[compras] no se pudo leer cmp_config:', error.message)
  const mapa = {}
  for (const r of data ?? []) mapa[r.clave] = r.valor
  cache = desdeMapa(mapa)
  confirmadas = leerConfirmadas(mapa['reglas_confirmadas'])
  ready = true
}

export function isConfigCacheReady() {
  return ready
}

/** Reglas vigentes (umbrales de ejemplo hasta que Finanzas confirme). */
export function getConfig() {
  track()
  return cache
}

/** Actualiza una regla (solo Dirección con Supabase; en demo, cualquiera). Queda en bitácora. */
export async function setConfig(campo, valor) {
  const antes = cache[campo]
  const next = { ...cache, [campo]: valor }
  if (!modoLocal()) {
    const { error } = await supabase
      .from('cmp_config')
      .upsert({ clave: CLAVES[campo], valor, descripcion: CONFIG_DESCRIPCIONES[campo] }, { onConflict: 'clave' })
    if (error) throw errorDe(error)
  } else {
    const mapa = {}
    for (const k of Object.keys(CLAVES)) mapa[CLAVES[k]] = next[k]
    try {
      localStorage.setItem(KEY, JSON.stringify(mapa))
    } catch {
      /* sin almacenamiento */
    }
  }
  cache = next
  // Cambiar una regla invalida la confirmación anterior: Finanzas debe volver a validar los valores nuevos.
  if (confirmadas) await guardarConfirmadas(null)
  registrarBitacora({
    tabla: 'cmp_config',
    registroId: CLAVES[campo],
    accion: 'cambio',
    antes: { valor: antes },
    despues: { valor },
    detalle: `${usuarioActual()} cambió ${CLAVES[campo]}`,
  })
}

/** ¿Ya confirmó Finanzas estas reglas? (null = valores de ejemplo por confirmar). */
export function getReglasConfirmadas() {
  track()
  return confirmadas
}

async function guardarConfirmadas(valor) {
  if (!modoLocal()) {
    const { error } = await supabase
      .from('cmp_config')
      .upsert({ clave: 'reglas_confirmadas', valor, descripcion: 'Confirmación de las reglas de compras con Finanzas (quién y cuándo).' }, { onConflict: 'clave' })
    if (error) throw errorDe(error)
  } else {
    try {
      localStorage.setItem(KEY_CONFIRMADAS, JSON.stringify(valor))
    } catch {
      /* sin almacenamiento */
    }
  }
  confirmadas = valor
}

/** Marca las reglas vigentes como confirmadas con Finanzas (queda en bitácora). */
export async function confirmarReglas() {
  const valor = { por: usuarioActual(), fecha: Date.now() }
  await guardarConfirmadas(valor)
  registrarBitacora({ tabla: 'cmp_config', registroId: 'reglas_confirmadas', accion: 'confirmación', despues: { ...valor, reglas: cache }, detalle: `${valor.por} confirmó las reglas con Finanzas` })
}

/** Base de las ligas de los correos: la configurada o el origen actual del navegador. */
export function urlBase() {
  if (cache.urlBase) return cache.urlBase
  return typeof window !== 'undefined' ? window.location.origin : ''
}

export function reiniciarConfigLocal() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nada */
  }
}
