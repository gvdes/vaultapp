import { defineBoot } from '#q-app/wrappers'
import { watch } from 'vue'
import { initAuth, user } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'

export default defineBoot(({ router }) => {
  initAuth()
  // Si la sesión termina sola (token vencido o revocado, 401 de la API, cierre en otra pestaña) estando dentro de una pantalla
  // privada, se vuelve al acceso. El cierre manual ya navega por su cuenta.
  watch(user, (actual, previo) => {
    if (previo && !actual && router.currentRoute.value.matched.some((r) => r.meta.requiresAuth)) {
      void router.replace({ path: '/login', query: { sesion: 'terminada' } }).then(() => {
        // Sesión terminada con backend real: se recarga para vaciar la memoria (datos del usuario anterior); el aviso viaja en la URL.
        if (isSupabaseConfigured) window.location.reload()
      })
    }
  })
})
