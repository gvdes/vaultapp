<template>
  <aside class="flex h-full w-[248px] shrink-0 flex-col border-r" style="background: var(--color-sidebar-bg); border-color: var(--color-sidebar-border)">
    <div class="flex h-16 shrink-0 items-center gap-2 border-b px-4" style="border-color: var(--color-sidebar-border)">
      <router-link to="/" class="flex items-center gap-2" @click="emit('navigate')">
        <Logo />
      </router-link>
    </div>

    <nav class="flex-1 overflow-y-auto px-2 py-4">
      <div class="mb-2 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-vz-teal-2">Inventarios DGA</div>
      <div class="flex flex-col gap-0.5">
        <router-link
          v-for="item in navVisible"
          :key="item.to"
          :to="item.to"
          class="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors"
          :style="{
            color: isActive(item.to) ? 'var(--color-sidebar-text-active)' : 'var(--color-sidebar-text)',
            background: isActive(item.to) ? 'rgba(255,255,255,0.08)' : 'transparent',
            borderLeft: isActive(item.to) ? '2.5px solid #0FA391' : '2.5px solid transparent',
            textDecoration: 'none',
          }"
          @click="emit('navigate')"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4.5 w-4.5 shrink-0"
            :style="{ opacity: isActive(item.to) ? 1 : 0.75 }"
          >
            <path v-for="(seg, i) in item.icon.split(/(?=M)/)" :key="i" :d="seg" />
          </svg>
          <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
          <span
            v-if="item.to === '/solicitudes' && pendientes > 0"
            class="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-vz-warning px-1 text-[10px] font-extrabold text-vz-ink"
          >
            {{ pendientes }}
          </span>
        </router-link>
      </div>
    </nav>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Logo from './Logo.vue'
import { solicitudesPorAtender } from 'src/lib/vistaRol'
import { useAuth } from 'src/lib/auth'
import { canViewSeccion } from 'src/lib/access'

/**
 * @typedef {object} NavItem
 * @property {string} to
 * @property {string} label
 * @property {string} icon
 * @property {SeccionId} id - Sección del menú: la visibilidad sale de canViewSeccion (lib/access.js), la misma que usan las guardias de ruta.
 */

const NAV = [
  {
    id: 'inicio',
    to: '/',
    label: 'Inicio',
    icon: 'M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0L22.28 12M4.5 9.75V21a.75.75 0 00.75.75H9.75v-6a1.5 1.5 0 011.5-1.5h1.5a1.5 1.5 0 011.5 1.5v6h4.5a.75.75 0 00.75-.75V9.75',
  },
  {
    id: 'sistemas',
    to: '/sistemas',
    label: 'Inventario de Sistemas',
    icon: 'M9.75 3.75h4.5a1 1 0 011 1v1.5h2a1.5 1.5 0 011.5 1.5v11a1.5 1.5 0 01-1.5 1.5h-11a1.5 1.5 0 01-1.5-1.5v-11a1.5 1.5 0 011.5-1.5h2v-1.5a1 1 0 011-1z M8.75 12h6.5M8.75 15.5h6.5',
  },
  {
    id: 'mantenimiento',
    to: '/mantenimiento',
    label: 'Inventario de Mantenimiento',
    icon: 'M14.5 3.5l6 6-2.5 2.5-1-1-6.5 6.5a2 2 0 01-2.83 0l-.17-.17a2 2 0 010-2.83l6.5-6.5-1-1 2.5-2.5z M4 20l3-3',
  },
  {
    id: 'solicitudes',
    to: '/solicitudes',
    label: 'Solicitudes',
    icon: 'M9 3.75h6a1 1 0 011 1V6h1.5a1.5 1.5 0 011.5 1.5v13a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 20.5v-13A1.5 1.5 0 016.5 6H8V4.75a1 1 0 011-1z M9 12h6M9 15.5h6M9 8.75h6',
  },
  {
    id: 'compras',
    to: '/compras',
    label: 'Compras',
    icon: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437 M7.5 14.25a3 3 0 00-3 3h15.75 M7.5 14.25h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84 M7.5 14.25L5.106 5.272 M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0z M18.75 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
  },
  {
    id: 'proveedores',
    to: '/proveedores',
    label: 'Proveedores',
    icon: 'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21 M2.36 21H21.64 M20.25 21V9.349 M3.75 21V9.35 M3.75 9.35a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614 M3.75 9.35a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72 M6.75 18h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z',
  },
  {
    id: 'auditorias',
    to: '/auditorias',
    label: 'Auditorías',
    icon: 'M9 12.75l1.85 1.85L15.75 9.6 M4.5 5.25h9.75a2.25 2.25 0 012.25 2.25v11.25a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25V5.25z',
  },
  {
    id: 'directorio',
    to: '/directorio',
    label: 'Directorio',
    icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493 M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07 M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07 M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z M20.25 8.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  },
  {
    id: 'bitacora',
    to: '/bitacora',
    label: 'Bitácora',
    icon: 'M12 6v6l3.75 2.25 M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
]

const emit = defineEmits(['navigate'])

const route = useRoute()
const { user } = useAuth()
const navVisible = computed(() => NAV.filter((item) => (user.value ? canViewSeccion(user.value.role, item.id) : false)))
const pendientes = computed(() => (user.value ? solicitudesPorAtender(user.value.role) : 0))

function isActive(to) {
  return route.path === to || (to !== '/' && route.path.startsWith(to))
}
</script>
