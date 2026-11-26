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
      <div class="animate-fade-in-scale mb-4 flex justify-center" style="animation-delay: 80ms">
        <Logo size="lg" />
      </div>

      <template v-if="id">
        <div v-if="!material" class="flex flex-col items-center gap-2 py-6 text-center">
          <div class="flex h-14 w-14 items-center justify-center rounded-full bg-vz-danger/10 text-vz-danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-7 w-7">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 class="text-[16px] font-extrabold text-text">Artículo no encontrado</h1>
          <p class="max-w-xs text-[13px] text-text-muted">Este código QR no corresponde a ningún material registrado en el inventario.</p>
        </div>

        <template v-else>
          <h1 class="mb-3 text-[16px] font-extrabold text-text">{{ material.nombre }}</h1>
          <div class="flex flex-col">
            <div v-for="d in datos" :key="d.label" class="flex items-center justify-between gap-3 border-b border-border py-2 text-[13px] last:border-0">
              <span class="text-text-muted">{{ d.label }}</span>
              <span class="text-right font-semibold text-text">{{ d.value }}</span>
            </div>
          </div>
          <p class="mt-4 text-center text-[11.5px] text-text-soft">
            Este material es propiedad de Grupo Vizcarra. Si lo encontraste fuera de su ubicación registrada, repórtalo a Soporte e Infraestructura de Redes.
          </p>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Logo from 'components/Logo.vue'
import ThemeToggle from 'components/ThemeToggle.vue'
import { fetchMaterialPublico } from 'src/lib/inventario/publico'

// Página pública (sin sesión): nunca muestra costos ni valores.
const route = useRoute()
const id = computed(() => String(route.params.id ?? ''))

const ready = ref(false)
const material = ref(null)

onMounted(async () => {
  try {
    material.value = id.value ? await fetchMaterialPublico(id.value) : null
  } catch {
    material.value = null
  } finally {
    ready.value = true
  }
})

const datos = computed(() => {
  const m = material.value
  if (!m) return []
  return [
    { label: 'Clasificación', value: m.familia },
    { label: 'Detalle', value: m.descripcion },
    { label: 'Marca', value: m.marca },
    { label: 'Unidad de medida', value: m.unidadMedida },
    { label: 'Existencia actual', value: `${m.cantidadActual} ${m.unidadMedida}` },
    { label: 'Ubicación', value: m.ubicacion },
  ].filter((d) => Boolean(d.value))
})
</script>
