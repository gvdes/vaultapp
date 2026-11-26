<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold"
    :class="grande ? '!px-3 !py-1 !text-[12.5px]' : ''"
    :style="estilo"
    :title="info.descripcion"
  >
    <span class="h-1.5 w-1.5 shrink-0 rounded-full" :style="{ background: info.color }" />
    {{ completa ? info.label : info.corta }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { ESTADOS } from 'src/lib/compras'

/** Etiqueta de estado (colores de `ESTADOS`; con `completa` usa los textos numerados de Finanzas). */
const props = defineProps({ estado: { type: String, required: true }, completa: Boolean, grande: Boolean })
const info = computed(() => ESTADOS[props.estado])
const estilo = computed(() => ({
  color: `color-mix(in srgb, ${info.value.color} 78%, var(--color-text))`,
  background: `color-mix(in srgb, ${info.value.color} 12%, transparent)`,
  borderColor: `color-mix(in srgb, ${info.value.color} 38%, transparent)`,
}))
</script>
