/**
 * Orquesta la carga inicial de todas las cachés en memoria que respaldan la app
 * (ver lib/inventario/*.js, cada uno expone su propio loadXCache()/isXCacheReady()).
 * RequireAuth espera a que todo esto termine antes de mostrar cualquier página.
 */
import { bump } from './reactive'
import { loadComunesCache, isComunesCacheReady } from './inventario/comunes'
import { loadSistemasCache, isSistemasCacheReady } from './inventario/sistemas'
import { loadMantenimientoCache, isMantenimientoCacheReady } from './inventario/mantenimiento'
import { loadSolicitudesCache, isSolicitudesCacheReady } from './inventario/solicitudes'
import { loadCargosPerdidaCache, isCargosPerdidaCacheReady } from './inventario/cargosPerdida'
import { loadProveedoresCache, isProveedoresCacheReady } from './inventario/proveedores'
import { loadMantenimientoProgramadoCache, isMantenimientoProgramadoCacheReady } from './inventario/mantenimientoProgramado'
import { loadValuacionSnapshotsCache, isValuacionSnapshotsCacheReady } from './inventario/valuacionSnapshots'
import { loadAuditoriasCache, isAuditoriasCacheReady } from './inventario/auditorias'
import { loadResponsivasCache, isResponsivasCacheReady } from './inventario/responsivas'
import { loadBitacoraCache, isBitacoraCacheReady } from './bitacora'
import { loadComprasCaches, areComprasCachesReady } from './compras'

/**
 * Las cachés son de UNA sesión: al cerrar sesión (o cambiar de usuario) quedan «obsoletas» y el guard del router (`areAllCachesReady`) las vuelve a
 * cargar antes de mostrar nada. Cada loader reemplaza por completo su caché (y la deja vacía si el rol no puede leer la tabla), así que nada del usuario
 * anterior sobrevive a la recarga.
 */
let obsoletas = false

export async function loadAllCaches() {
  obsoletas = true // si la carga falla a medias, siguen obsoletas
  await loadComunesCache()
  await Promise.all([
    loadSistemasCache(),
    loadMantenimientoCache(),
    loadSolicitudesCache(),
    loadCargosPerdidaCache(),
    loadProveedoresCache(),
    loadMantenimientoProgramadoCache(),
    loadValuacionSnapshotsCache(),
    loadAuditoriasCache(),
    loadResponsivasCache(),
    loadBitacoraCache(),
    loadComprasCaches(),
  ])
  obsoletas = false
  bump()
}

export function areAllCachesReady() {
  return (
    !obsoletas &&
    isComunesCacheReady() &&
    isSistemasCacheReady() &&
    isMantenimientoCacheReady() &&
    isSolicitudesCacheReady() &&
    isCargosPerdidaCacheReady() &&
    isProveedoresCacheReady() &&
    isMantenimientoProgramadoCacheReady() &&
    isValuacionSnapshotsCacheReady() &&
    isAuditoriasCacheReady() &&
    isResponsivasCacheReady() &&
    isBitacoraCacheReady() &&
    areComprasCachesReady()
  )
}

/** Marca las cachés como obsoletas (logout, login de otro usuario, sesión terminada): la siguiente navegación privada las recarga completas. */
export function resetAllCaches() {
  obsoletas = true
}
