import { Notify } from 'quasar'

/** @typedef {'success' | 'error' | 'info'} ToastTone */
/** @typedef {(message: string, tone?: ToastTone) => void} ToastFn */

const COLORS = { success: 'positive', error: 'negative', info: 'primary' }
const ICONS = { success: 'check_circle', error: 'error', info: 'info' }

/** Misma firma que el useToast() de la versión React: `toast('Guardado.')`, `toast('Falló', 'error')`. */
export function useToast() {
  return (message, tone = 'success') => {
    Notify.create({ message, color: COLORS[tone], icon: ICONS[tone], position: 'bottom-right', timeout: 3500 })
  }
}
