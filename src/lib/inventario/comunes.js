import { track } from '../reactive'
import { supabase, isSupabaseConfigured } from '../supabase'
import { UBICACIONES_SEED, FAMILIAS_SEED } from './seedData'

/** Ubicación donde Adquisiciones deja el stock recién cargado, antes de que Soporte lo asigne a una sucursal/área. */
export const UBICACION_STOCK_MAESTRO = 'of-adquisiciones'

/**
 * Umbral (MXN) desde el cual un bien se controla por pieza individual con número de serie, proveedor y factura/OC.
 * Por debajo se lleva por cantidad (en Mantenimiento: Material/Consumible).
 */
export const UMBRAL_CONTROL_INDIVIDUAL = 1000

/** @typedef {'sucursal' | 'cedis' | 'oficina'} UbicacionTipo */
/**
 * @typedef {object} Ubicacion
 * @property {string} id
 * @property {string} nombre
 * @property {UbicacionTipo} tipo
 * @property {boolean} activo
 * @property {number} [lat] - Coordenadas aproximadas (mapa de sucursales). Las oficinas no tienen.
 * @property {number} [lng]
 */

/** @typedef {'sistemas' | 'mantenimiento'} FamiliaTipo */
/** @typedef {'serializado' | 'cantidad'} ModoInventario */
/**
 * @typedef {object} Familia
 * @property {string} id
 * @property {FamiliaTipo} tipo
 * @property {string} nombre
 * @property {string} icono
 * @property {number} orden
 * @property {ModoInventario} modoInventario - 'serializado': cada pieza es un registro individual con número de serie (como Sistemas). 'cantidad': se lleva por existencia agregada (como Refacción/Material/Consumible).
 * @property {number} depreciacionInicialPct - % que pierde el equipo el día que deja de ser nuevo (0-1). Solo aplica a familias serializadas.
 * @property {number} vidaUtilMeses - Meses hasta llegar al valor residual mínimo.
 * @property {number} valorResidualPct - Piso de valor aunque ya esté totalmente depreciado (0-1).
 */

let ubicacionesCache = []
let familiasCache = []
let ready = false

const COORDS_KEY = 'dga_inv_ubic_coords'
/** @typedef {Record<string, { lat: number; lng: number }>} CoordsOverride */

function readCoordsOverride() {
  try {
    const raw = localStorage.getItem(COORDS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}
function writeCoordsOverride(map) {
  try {
    localStorage.setItem(COORDS_KEY, JSON.stringify(map))
  } catch {
    /* almacenamiento no disponible: el ajuste solo vive en esta sesión */
  }
}

/** Copia las ubicaciones (sin mutar el seed) y re-aplica las coordenadas ajustadas manualmente. */
function conOverrides(list) {
  const ov = readCoordsOverride()
  return list.map((u) => {
    const o = ov[u.id]
    return o ? { ...u, lat: o.lat, lng: o.lng } : { ...u }
  })
}

function numOrUndef(v) {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export async function loadComunesCache() {
  if (!isSupabaseConfigured || !supabase) {
    ubicacionesCache = conOverrides(UBICACIONES_SEED)
    familiasCache = FAMILIAS_SEED
    ready = true
    return
  }

  const [ubiRes, famRes] = await Promise.all([
    supabase.from('inv_ubicaciones').select('*').order('nombre'),
    supabase.from('inv_familias').select('*').order('orden'),
  ])

  ubicacionesCache = conOverrides(
    ubiRes.data && ubiRes.data.length > 0
      ? ubiRes.data.map((r) => ({ id: r.id, nombre: r.nombre, tipo: r.tipo, activo: r.activo, lat: numOrUndef(r.lat), lng: numOrUndef(r.lng) }))
      : UBICACIONES_SEED,
  )

  familiasCache =
    famRes.data && famRes.data.length > 0
      ? famRes.data.map((r) => ({
          id: r.id,
          tipo: r.tipo,
          nombre: r.nombre,
          icono: r.icono,
          orden: r.orden,
          modoInventario: r.modo_inventario ?? 'cantidad',
          depreciacionInicialPct: Number(r.depreciacion_inicial_pct ?? 0.15),
          vidaUtilMeses: Number(r.vida_util_meses ?? 48),
          valorResidualPct: Number(r.valor_residual_pct ?? 0.1),
        }))
      : FAMILIAS_SEED

  ready = true
}

export function isComunesCacheReady() {
  return ready
}

export function listUbicaciones() {
  track()
  return ubicacionesCache.filter((u) => u.activo)
}

export function getUbicacion(id) {
  track()
  return ubicacionesCache.find((u) => u.id === id)
}

export function listFamilias(tipo) {
  track()
  return familiasCache.filter((f) => f.tipo === tipo).sort((a, b) => a.orden - b.orden)
}

export function getFamilia(id) {
  track()
  return familiasCache.find((f) => f.id === id)
}

/**
 * Fija las coordenadas de una ubicación (ajuste de pines del mapa). Siempre se guarda un override en
 * localStorage (funciona en modo local/demo) y, con Supabase configurado, también en inv_ubicaciones.
 * La pantalla que lo invoque debe llamar a bump().
 */
export async function setUbicacionCoords(id, lat, lng) {
  const ov = readCoordsOverride()
  ov[id] = { lat, lng }
  writeCoordsOverride(ov)
  ubicacionesCache = ubicacionesCache.map((u) => (u.id === id ? { ...u, lat, lng } : u))
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_ubicaciones').update({ lat, lng }).eq('id', id)
    if (error) throw error
  }
}
