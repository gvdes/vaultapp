import { computed } from 'vue'
import { Dark, LocalStorage } from 'quasar'

const STORAGE_KEY = 'dga_inv_theme'

/** Tema claro/oscuro. El plugin Dark de Quasar es la fuente de verdad; boot/theme.js lo refleja en <html class="dark">. */
export function useTheme() {
  const theme = computed(() => (Dark.isActive ? 'dark' : 'light'))
  const toggleTheme = () => {
    Dark.set(!Dark.isActive)
    LocalStorage.set(STORAGE_KEY, Dark.isActive ? 'dark' : 'light')
  }
  return { theme, toggleTheme }
}

export { STORAGE_KEY as THEME_STORAGE_KEY }
