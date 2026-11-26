/**
 * Compras Indirectas · punto de entrada. Importar siempre desde aquí (`import { ... } from '@/lib/compras'` o ruta relativa):
 * así se registran todos los ganchos del flujo (correos, solicitud de dinero, recepciones, validaciones de transición).
 */
export * from './tipos'
export * from './config'
export * from './participantes'
export * from './catalogo'
export * from './proveedores'
export * from './requisiciones'
export * from './cotizaciones'
export * from './aprobaciones'
export * from './dinero'
export * from './compras'
export * from './recepciones'
export * from './outbox'
export { setRelojCompras, modoLocal as comprasModoLocal } from './store'

import { loadConfigCache, isConfigCacheReady, reiniciarConfigLocal } from './config'
import { loadParticipantesCache, isParticipantesCacheReady, reiniciarParticipantesLocal } from './participantes'
import { loadCatalogoCache, isCatalogoCacheReady, reiniciarCatalogoLocal } from './catalogo'
import { loadProveedoresCatalogoCache, isProveedoresCatalogoCacheReady, reiniciarProveedoresCatalogoLocal } from './proveedores'
import { loadRequisicionesCache, isRequisicionesCacheReady, reiniciarRequisicionesLocal } from './requisiciones'
import { loadCotizacionesCache, isCotizacionesCacheReady, reiniciarCotizacionesLocal } from './cotizaciones'
import { loadAprobacionesCache, isAprobacionesCacheReady, reiniciarAprobacionesLocal } from './aprobaciones'
import { loadDineroCache, isDineroCacheReady, reiniciarDineroLocal } from './dinero'
import { loadComprasRealesCache, isComprasRealesCacheReady, reiniciarComprasRealesLocal } from './compras'
import { loadRecepcionesCache, isRecepcionesCacheReady, reiniciarRecepcionesLocal } from './recepciones'
import { loadNotificacionesCache, isNotificacionesCacheReady, reiniciarNotificacionesLocal } from './outbox'

/** Carga todas las cachés de Compras Indirectas (la registra dataSync.loadAllCaches). */
export async function loadComprasCaches() {
  await Promise.all([
    loadConfigCache(),
    loadParticipantesCache(),
    loadCatalogoCache(),
    loadProveedoresCatalogoCache(),
    loadRequisicionesCache(),
    loadCotizacionesCache(),
    loadAprobacionesCache(),
    loadDineroCache(),
    loadComprasRealesCache(),
    loadRecepcionesCache(),
    loadNotificacionesCache(),
  ])
}

export function areComprasCachesReady() {
  return (
    isConfigCacheReady() &&
    isParticipantesCacheReady() &&
    isCatalogoCacheReady() &&
    isProveedoresCatalogoCacheReady() &&
    isRequisicionesCacheReady() &&
    isCotizacionesCacheReady() &&
    isAprobacionesCacheReady() &&
    isDineroCacheReady() &&
    isComprasRealesCacheReady() &&
    isRecepcionesCacheReady() &&
    isNotificacionesCacheReady()
  )
}

/** Borra las llaves locales `dga_cmp_*` (solo modo demo; sirve para volver a sembrar). */
export function reiniciarComprasLocal() {
  reiniciarConfigLocal()
  reiniciarParticipantesLocal()
  reiniciarCatalogoLocal()
  reiniciarProveedoresCatalogoLocal()
  reiniciarRequisicionesLocal()
  reiniciarCotizacionesLocal()
  reiniciarAprobacionesLocal()
  reiniciarDineroLocal()
  reiniciarComprasRealesLocal()
  reiniciarRecepcionesLocal()
  reiniciarNotificacionesLocal()
}

/** Recarga las cachés (p. ej. tras una RPC o aprobación por token en Supabase). */
export const recargarCompras = loadComprasCaches
