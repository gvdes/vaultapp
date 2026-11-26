/** Clases compartidas de las pantallas públicas de Compras Indirectas (táctiles: 44 px de alto, 16 px en celular para que iOS no haga zoom). */
export const inp =
  'h-11 w-full rounded-xl border border-border bg-bg px-3 text-[16px] text-text outline-none placeholder:text-text-soft focus:border-vz-blue focus:ring-2 focus:ring-vz-blue/30 sm:text-[14px] disabled:opacity-60'
export const inpError = 'border-vz-danger focus:border-vz-danger focus:ring-vz-danger/25 ring-2 ring-vz-danger/15'
export const area = `${inp} h-auto min-h-[84px] resize-y py-2.5 leading-snug`

export const btnPrimario =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-vz-blue px-5 text-[14px] font-extrabold text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vz-blue disabled:cursor-not-allowed disabled:opacity-55'
export const btnSecundario =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-[14px] font-bold text-text transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vz-blue disabled:cursor-not-allowed disabled:opacity-55'
export const btnPeligro =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-vz-danger px-5 text-[14px] font-extrabold text-white transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vz-danger disabled:cursor-not-allowed disabled:opacity-55'

export const tarjeta = 'rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6'

/** Quita acentos/mayúsculas para buscar. */
export function norm(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS_SEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** "21 oct 2026" */
export function fechaCorta(ms) {
  const d = new Date(ms)
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}
/** "mié 21 oct, 14:05" */
export function fechaHora(ms) {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${DIAS_SEM[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}, ${hh}:${mm}`
}
/** AAAA-MM-DD -> "21 oct 2026" (hora local, sin correr el día). */
export function fechaIso(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES[(m ?? 1) - 1]} ${y}`
}
/** "hace 3 días", "hace 2 h", "hace unos minutos". */
export function hace(ms, ref = Date.now()) {
  const s = Math.max(0, Math.round((ref - ms) / 1000))
  if (s < 90) return 'hace un momento'
  const min = Math.round(s / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const dd = Math.round(h / 24)
  return `hace ${dd} ${dd === 1 ? 'día' : 'días'}`
}
/** Duración legible entre dos instantes. */
export function duracion(desde, hasta) {
  const h = Math.max(0, (hasta - desde) / 3600000)
  if (h < 1) return 'menos de 1 hora'
  if (h < 24) return `${Math.round(h)} ${Math.round(h) === 1 ? 'hora' : 'horas'}`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? 'día' : 'días'}`
}

/** Copia texto al portapapeles (con alternativa para navegadores sin la API). */
export async function copiarTexto(texto) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    /* sigue con la alternativa */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export const urlWhatsApp = (texto) => `https://wa.me/?text=${encodeURIComponent(texto)}`
