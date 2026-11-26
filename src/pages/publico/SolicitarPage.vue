<template>
  <div v-if="!ready" class="flex h-screen items-center justify-center bg-bg">
    <div class="h-8 w-8 animate-spin rounded-full border-2 border-vz-blue border-t-transparent" />
  </div>

  <div v-else class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg px-4 py-8">
    <div class="bg-grid-subtle pointer-events-none absolute inset-0" />
    <div class="intro-blob -left-24 -top-24 h-72 w-72 bg-vz-blue/30" />
    <div class="intro-blob -bottom-24 -right-16 h-80 w-80 bg-vz-gold/25" style="animation-delay: 3s" />
    <div class="relative flex w-full max-w-md justify-end pb-3">
      <ThemeToggle />
    </div>
    <div class="animate-fade-in-up relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg sm:p-8">
      <div class="animate-fade-in-scale flex justify-center" style="animation-delay: 80ms">
        <Logo size="lg" />
      </div>
      <h1 class="animate-fade-in-up mt-4 text-center text-[16px] font-extrabold text-text" style="animation-delay: 160ms">Solicitar equipo o reparación</h1>
      <p class="animate-fade-in-up mt-1 text-center text-[13px] text-text-muted" style="animation-delay: 200ms">Sin necesidad de usuario ni contraseña.</p>

      <div class="animate-fade-in-up mt-5" style="animation-delay: 260ms">
        <div v-if="enviada" class="flex flex-col items-center gap-3 py-8 text-center">
          <div class="flex h-14 w-14 items-center justify-center rounded-full bg-vz-success/10 text-vz-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-7 w-7">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 class="text-[16px] font-extrabold text-text">Solicitud enviada</h2>
          <p class="max-w-xs text-[13px] text-text-muted">Soporte e Infraestructura la recibió y te dará seguimiento pronto.</p>
          <button
            type="button"
            class="mt-2 h-9 rounded-lg border border-border bg-bg px-4 text-[13px] font-bold text-text-muted hover:bg-surface-hover"
            @click="enviarOtra"
          >
            Enviar otra solicitud
          </button>
        </div>

        <template v-else>
          <div class="mb-3 flex gap-2">
            <button
              type="button"
              :class="`h-9 flex-1 rounded-lg border text-[13px] font-bold transition-colors ${tipo === 'sistemas' ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-bg text-text-muted'}`"
              @click="handleTipo('sistemas')"
            >
              Equipo de Sistemas
            </button>
            <button
              type="button"
              :class="`h-9 flex-1 rounded-lg border text-[13px] font-bold transition-colors ${tipo === 'mantenimiento' ? 'border-vz-gold bg-vz-gold/10 text-vz-gold' : 'border-border bg-bg text-text-muted'}`"
              @click="handleTipo('mantenimiento')"
            >
              Material de Mantenimiento
            </button>
          </div>

          <div v-if="tipo === 'sistemas'" class="mb-3 flex gap-2">
            <button
              type="button"
              :class="`h-8 flex-1 rounded-lg border text-[12px] font-bold ${subtipo === 'equipo_nuevo' ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-bg text-text-muted'}`"
              @click="subtipo = 'equipo_nuevo'"
            >
              Equipo nuevo
            </button>
            <button
              type="button"
              :class="`h-8 flex-1 rounded-lg border text-[12px] font-bold ${subtipo === 'reparacion' ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-bg text-text-muted'}`"
              @click="subtipo = 'reparacion'"
            >
              Reparación
            </button>
          </div>

          <div class="flex flex-col gap-3">
            <AppField label="Tu nombre">
              <input v-model="solicitanteNombre" :class="inputClass" placeholder="Nombre completo" />
            </AppField>
            <AppField label="Tu sucursal / área">
              <select v-model="ubicacionId" :class="selectClass">
                <option value="">— Selecciona —</option>
                <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
              </select>
            </AppField>
            <AppField :label="tipo === 'sistemas' ? 'Tipo de equipo' : 'Clasificación'">
              <select v-model="familiaId" :class="selectClass">
                <option value="">— Selecciona —</option>
                <option v-for="f in familias" :key="f.id" :value="f.id">{{ f.nombre }}</option>
              </select>
            </AppField>
            <AppField v-if="subtipo === 'material'" label="Cantidad">
              <input v-model="cantidad" type="number" min="1" :class="inputClass" />
            </AppField>
            <AppField label="Describe qué necesitas">
              <textarea v-model="descripcion" :class="textareaClass" placeholder="p. ej. Celular para nuevo ejecutivo de ventas" />
            </AppField>
          </div>

          <button
            type="button"
            :disabled="saving"
            class="mt-5 h-10 w-full rounded-lg bg-vz-blue text-[14px] font-bold text-white hover:bg-primary-hover disabled:opacity-60"
            @click="handleSubmit"
          >
            {{ saving ? 'Enviando…' : 'Enviar solicitud' }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import Logo from 'components/Logo.vue'
import ThemeToggle from 'components/ThemeToggle.vue'
import AppField from 'components/AppField.vue'
import { inputClass, selectClass, textareaClass } from 'components/formClasses'
import { useToast } from 'src/composables/useToast'
import { loadComunesCache, isComunesCacheReady, listFamilias, listUbicaciones } from 'src/lib/inventario/comunes'
import { crearSolicitud } from 'src/lib/inventario/solicitudes'

const toast = useToast()

// Página pública: solo necesita los catálogos comunes (ubicaciones y familias).
const ready = ref(isComunesCacheReady())
if (!ready.value) {
  void loadComunesCache().then(() => {
    ready.value = true
  })
}

const tipo = ref('sistemas')
const subtipo = ref('equipo_nuevo')
const familiaId = ref('')
const ubicacionId = ref('')
const solicitanteNombre = ref('')
const descripcion = ref('')
const cantidad = ref('1')
const saving = ref(false)
const enviada = ref(false)

const ubicaciones = computed(() => listUbicaciones())
const familias = computed(() => listFamilias(tipo.value))

function handleTipo(t) {
  tipo.value = t
  subtipo.value = t === 'mantenimiento' ? 'material' : 'equipo_nuevo'
  familiaId.value = ''
}

function enviarOtra() {
  enviada.value = false
  descripcion.value = ''
}

async function handleSubmit() {
  if (!solicitanteNombre.value.trim()) {
    toast('Escribe tu nombre.', 'error')
    return
  }
  if (!ubicacionId.value) {
    toast('Selecciona tu sucursal o área.', 'error')
    return
  }
  if (!descripcion.value.trim()) {
    toast('Describe qué necesitas.', 'error')
    return
  }
  saving.value = true
  try {
    await crearSolicitud({
      tipo: tipo.value,
      subtipo: subtipo.value,
      familiaId: familiaId.value || undefined,
      ubicacionId: ubicacionId.value,
      solicitanteNombre: solicitanteNombre.value.trim(),
      descripcion: descripcion.value.trim(),
      cantidad: Number(cantidad.value) || 1,
      notas: undefined,
    })
    enviada.value = true
  } catch {
    toast('No se pudo enviar la solicitud. Intenta de nuevo.', 'error')
  } finally {
    saving.value = false
  }
}
</script>
