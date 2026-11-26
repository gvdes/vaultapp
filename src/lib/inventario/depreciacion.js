import { parseLocalDate, toLocalDateString } from '../dateUtils'

/** Meses completos entre dos fechas (ISO yyyy-mm-dd o Date), truncando hacia abajo. */
export function mesesEntre(desde, hasta = new Date()) {
  const a = typeof desde === 'string' ? parseLocalDate(desde) : desde
  const b = typeof hasta === 'string' ? parseLocalDate(hasta) : hasta
  const meses = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0)
  return Math.max(0, meses)
}

/**
 * Valor depreciado hoy: primero una caída inicial al dejar de ser nuevo (depreciacionInicialPct),
 * y sobre lo que queda, una depreciación lineal por mes hasta un piso residual (valorResidualPct).
 */
export function calcularValorDepreciado(equipo, familia, hasta = new Date()) {
  const fechaBase = equipo.fechaCompra ?? equipo.fechaAsignacion ?? toLocalDateString(new Date(equipo.createdAt))
  const meses = mesesEntre(fechaBase, hasta)
  const valorPostInicial = equipo.costoTotal * (1 - familia.depreciacionInicialPct)
  const factorLineal = Math.max(familia.valorResidualPct, 1 - meses / familia.vidaUtilMeses)
  return Math.round(valorPostInicial * factorLineal * 100) / 100
}
