/**
 * URL pública de la app (dominio actual + subcarpeta de despliegue, si la hay, p. ej. https://empresa.mx/inventarios).
 * El QR de cada equipo/material solo codifica la URL de verificación, derivada de su id: no hay un código
 * separado que guardar ni sincronizar, y si cambia el dominio basta con volver a imprimir.
 */
export function appUrl(path) {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
  return `${window.location.origin}${base}${path.startsWith('/') ? path : `/${path}`}`
}

export function equipoVerifyUrl(id) {
  return appUrl(`/verificar/equipo/${id}`)
}

export function materialVerifyUrl(id) {
  return appUrl(`/verificar/material/${id}`)
}
