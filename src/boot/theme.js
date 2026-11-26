import { defineBoot } from '#q-app/wrappers'
import { Dark, LocalStorage } from 'quasar'
import { watch } from 'vue'
import { THEME_STORAGE_KEY } from '../composables/useTheme'

export default defineBoot(() => {
  const saved = LocalStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') Dark.set(saved === 'dark')
  else Dark.set(window.matchMedia('(prefers-color-scheme: dark)').matches)

  watch(() => Dark.isActive, (active) => document.documentElement.classList.toggle('dark', active), { immediate: true })
})
