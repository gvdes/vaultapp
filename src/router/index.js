import { defineRouter } from '#q-app/wrappers'
import { createMemoryHistory, createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import routes from './routes'
import { authReady, user } from '../lib/auth'
import { areAllCachesReady, loadAllCaches } from '../lib/dataSync'

export default defineRouter(() => {
  const memoryRouting = process.env.SERVER || import.meta.env.VITE_ROUTER_MODE === 'memory'
  const createHistory = memoryRouting ? createMemoryHistory : process.env.VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory

  const router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(process.env.VUE_ROUTER_BASE),
  })

  // Sin URL real (demo embebida en una página): la navegación vive en memoria y arranca en la raíz.
  if (import.meta.env.VITE_ROUTER_MODE === 'memory') void router.push('/')

  router.beforeEach(async (to) => {
    if (!to.matched.some((r) => r.meta.requiresAuth)) return true
    await authReady()
    if (!user.value) return { path: '/login' }
    if (!areAllCachesReady()) await loadAllCaches()
    return true
  })

  return router
})
