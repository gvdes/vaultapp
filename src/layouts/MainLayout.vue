<template>
  <q-layout view="hHh lpR fFf" class="bg-bg">
    <q-page-container class="!p-0">
      <div v-if="user" class="flex h-screen bg-bg">
        <div class="hidden md:flex">
          <Sidebar />
        </div>

        <div v-if="mobileOpen" class="fixed inset-0 z-50 flex md:hidden">
          <div class="absolute inset-0 bg-black/50" @click="mobileOpen = false" />
          <div class="relative z-10 h-full shadow-xl">
            <Sidebar @navigate="mobileOpen = false" />
          </div>
        </div>

        <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <header class="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-6">
            <button
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-surface-hover md:hidden"
              aria-label="Abrir menú"
              @click="mobileOpen = true"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            </button>
            <div class="hidden min-w-0 flex-1 sm:flex">
              <GlobalSearch v-if="verBuscador" />
            </div>
            <div class="flex shrink-0 items-center gap-3">
              <NotificationBell />
              <ThemeToggle />
              <div class="hidden flex-col items-end leading-tight sm:flex">
                <span class="text-[13px] font-bold text-text">{{ user.displayName }}</span>
                <span class="text-[11px] text-text-muted">{{ ROLE_LABELS[user.role] }}</span>
              </div>
              <button
                type="button"
                title="Cerrar sesión"
                class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold text-text-muted transition-colors hover:bg-surface-hover hover:text-vz-danger"
                @click="onLogout"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 12H9m9 0l-3-3m3 3l-3 3"
                  />
                </svg>
                <span class="hidden md:inline">Salir</span>
              </button>
            </div>
          </header>

          <main class="relative min-h-0 w-full min-w-0 flex-1 overflow-auto">
            <router-view />
          </main>
        </div>
      </div>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Sidebar from 'components/Sidebar.vue'
import ThemeToggle from 'components/ThemeToggle.vue'
import NotificationBell from 'components/NotificationBell.vue'
import GlobalSearch from 'components/GlobalSearch.vue'
import { ROLE_LABELS, useAuth, logout } from 'src/lib/auth'
import { isSupabaseConfigured } from 'src/lib/supabase'
import { dominiosVisibles } from 'src/lib/access'

const router = useRouter()
const { user } = useAuth()
const mobileOpen = ref(false)
// El buscador solo tiene sentido para roles que consultan inventario (Tesorería y solicitantes no).
const verBuscador = computed(() => (user.value ? dominiosVisibles(user.value.role).length > 0 : false))

async function onLogout() {
  await logout()
  await router.push('/login')
  // Con backend real se recarga la página: la memoria del navegador (cachés con datos y CLABE del usuario que sale) queda limpia de verdad.
  if (isSupabaseConfigured) window.location.reload()
}
</script>
