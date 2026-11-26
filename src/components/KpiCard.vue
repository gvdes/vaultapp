<template>
  <div class="relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-xl border border-border bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
    <span v-if="accent" class="absolute inset-x-0 top-0 h-[3px]" :style="{ background: accent }" />
    <span class="truncate text-[12px] font-semibold text-text-muted" :title="label">
      {{ label }}
    </span>
    <span :class="`text-2xl font-extrabold ${toneClass}`">
      <AnimatedNumber v-if="amount !== undefined" :value="amount" :format="format" />
      <template v-else>{{ value }}</template>
    </span>
    <span v-if="hint" class="truncate text-[11px] text-text-soft" :title="hint">
      {{ hint }}
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AnimatedNumber from './AnimatedNumber.vue'

const props = defineProps({
  label: { type: String, required: true },
  /** Texto ya formateado (se usa si no se pasa `amount`). */
  value: { type: String, default: '' },
  /** Valor numérico con conteo animado; requiere `format` para mostrar moneda, etc. */
  amount: Number,
  format: Function,
  hint: String,
  tone: { type: String, default: 'default' },
  accent: String,
})

const toneClass = computed(() =>
  props.tone === 'success' ? 'text-vz-success' : props.tone === 'warning' ? 'text-vz-warning' : props.tone === 'danger' ? 'text-vz-danger' : 'text-text',
)
</script>
