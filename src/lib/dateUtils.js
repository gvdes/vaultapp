/**
 * `new Date('YYYY-MM-DD')` y `Date#toISOString().slice(0,10)` interpretan/producen la fecha en UTC,
 * lo que en husos horarios negativos (México, UTC-6) puede correr la fecha un día — un equipo
 * comprado "el 1 de abril" se leía como "31 de marzo" para fines de depreciación, y un formulario
 * lleno después de las ~18:00 hora local mostraba mañana como fecha por defecto. Estas funciones
 * trabajan siempre en hora LOCAL para evitar ese corrimiento.
 */

export function toLocalDateString(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function todayLocalDateString() {
  return toLocalDateString(new Date())
}
