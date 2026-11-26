<template>
  <div v-if="!user" class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg px-4 py-8">
    <div class="bg-grid-subtle pointer-events-none absolute inset-0" />
    <div class="intro-blob -left-24 -top-24 h-72 w-72 bg-vz-blue/30" />
    <div class="intro-blob -bottom-24 -right-16 h-80 w-80 bg-vz-gold/25" style="animation-delay: 3s" />

    <div class="relative flex w-full max-w-sm justify-end pb-3">
      <ThemeToggle />
    </div>

    <div class="animate-fade-in-up relative w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-lg">
      <div class="animate-fade-in-scale flex justify-center" style="animation-delay: 80ms">
        <Logo size="lg" />
      </div>
      <h1 class="animate-fade-in-up mt-6 text-center text-lg font-extrabold text-text" style="animation-delay: 160ms">Inventarios DGA</h1>
      <p class="animate-fade-in-up mt-1 text-center text-[13px] text-text-muted" style="animation-delay: 200ms">
        Sistemas y Mantenimiento — inicia sesión para continuar
      </p>

      <form class="animate-fade-in-up mt-6 flex flex-col gap-3.5" style="animation-delay: 260ms" @submit.prevent="handleSubmit">
        <label class="flex flex-col gap-1.5">
          <span class="text-[13px] font-semibold text-text">Usuario</span>
          <input
            v-model="username"
            autofocus
            autocomplete="username"
            class="h-10 rounded-lg border border-border bg-bg px-3 text-[14px] text-text outline-none ring-vz-blue/30 placeholder:text-text-soft focus:ring-2"
            placeholder="p. ej. admin"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-[13px] font-semibold text-text">Contraseña</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="h-10 rounded-lg border border-border bg-bg px-3 text-[14px] text-text outline-none ring-vz-blue/30 placeholder:text-text-soft focus:ring-2"
            placeholder="••••••••"
          />
        </label>

        <p v-if="error" class="rounded-lg bg-vz-danger/10 px-3 py-2 text-[13px] font-medium text-vz-danger">{{ error }}</p>

        <button
          type="submit"
          :disabled="submitting"
          class="mt-1 h-10 rounded-lg bg-vz-blue text-[14px] font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {{ submitting ? 'Entrando…' : 'Entrar' }}
        </button>
      </form>

      <p v-if="appMisconfigured" class="mt-6 rounded-lg border border-vz-danger/30 bg-vz-danger/10 p-3 text-[12px] font-semibold text-vz-danger">La aplicación no está configurada (falta la dirección del servidor, VITE_API_URL). Avisa a Desarrollo.</p>
      <div v-if="!isSupabaseConfigured && demoAllowed" class="animate-fade-in-up mt-6 rounded-lg border border-dashed border-border bg-bg p-3" style="animation-delay: 320ms">
        <p class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Modo demostración local</p>
        <p class="mt-1 text-[12px] text-text-muted">
          Contraseña para todos: <code class="rounded bg-surface px-1 py-0.5 font-mono text-text">{{ DEMO_PASSWORD }}</code>
        </p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <button
            v-for="u in DEMO_USERS_PUBLIC"
            :key="u.username"
            type="button"
            :title="u.nota ?? ROLE_LABELS[u.role]"
            class="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-muted transition-colors hover:border-vz-blue/40 hover:text-vz-blue"
            @click="username = u.username"
          >
            {{ u.username }}
          </button>
        </div>
        <button
          type="button"
          :disabled="seeding"
          class="mt-3 w-full rounded-lg border border-vz-blue/30 bg-vz-blue/10 px-3 py-1.5 text-[12px] font-bold text-vz-blue hover:bg-vz-blue/20 disabled:opacity-60"
          @click="handleSeed"
        >
          {{ seeding ? 'Cargando datos…' : 'Cargar datos de ejemplo (capacitación)' }}
        </button>
      </div>
    </div>

    <div class="animate-fade-in-up relative mt-5 flex w-full max-w-sm items-center justify-center gap-4 text-[11px] font-semibold text-text-soft" style="animation-delay: 380ms">
      <span class="flex items-center gap-1.5"><span class="h-1.5 w-1.5 rounded-full bg-vz-blue" /> Sistemas</span>
      <span class="flex items-center gap-1.5"><span class="h-1.5 w-1.5 rounded-full bg-vz-gold" /> Mantenimiento</span>
      <span class="flex items-center gap-1.5"><span class="h-1.5 w-1.5 rounded-full bg-vz-teal-2" /> Solicitudes</span>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Logo from 'components/Logo.vue'
import ThemeToggle from 'components/ThemeToggle.vue'
import { isSupabaseConfigured } from 'src/lib/supabase'
import { useToast } from 'src/composables/useToast'
import { DEMO_PASSWORD, DEMO_USERS_PUBLIC, ROLE_LABELS, appMisconfigured, demoAllowed, useAuth } from 'src/lib/auth'

const router = useRouter()
const route = useRoute()
const { user, login } = useAuth()
const username = ref('')
const password = ref('')
const error = ref(null)
const submitting = ref(false)
const seeding = ref(false)
const toast = useToast()

// Demo publicada: carga los datos de ejemplo la primera vez que se abre (VITE_AUTO_SEED=true).
onMounted(() => {
  if (route.query.sesion === 'terminada') error.value = 'Tu sesión terminó (venció o se cerró en otro lugar). Inicia sesión de nuevo.'
  if (import.meta.env.VITE_AUTO_SEED === 'true' && !localStorage.getItem('dga_inv_equipos')) void handleSeed()
})

async function handleSeed() {
  seeding.value = true
  try {
    // Import dinámico dentro de la condición del modo demo: en producción el cargador y sus datos no se incluyen en el build.
    if (import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEMO === 'true') {
      const { cargarDatosDeEjemplo } = await import('src/lib/demoSeed')
      await cargarDatosDeEjemplo()
    }
    toast('Datos de ejemplo cargados. Entra con cualquier usuario demo.')
  } catch {
    toast('No se pudieron cargar los datos de ejemplo.', 'error')
  } finally {
    seeding.value = false
  }
}

// Si ya hay sesión (o se inicia una), ir al inicio.
watch(
  user,
  (u) => {
    if (u) void router.replace('/')
  },
  { immediate: true },
)

async function handleSubmit() {
  submitting.value = true
  error.value = null
  const result = await login(username.value, password.value)
  submitting.value = false
  if (!result.ok) error.value = result.error ?? 'No se pudo iniciar sesión.'
  else void router.push('/')
}
</script>
