<template>
  <div v-if="alertas.length > 0" class="flex flex-wrap gap-1">
    <span
      v-for="a in visibles"
      :key="a.id"
      :title="a.title"
      :class="`inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-bold ${TONE_STYLES[a.tono]}`"
    >
      {{ a.label }}
    </span>
    <span v-if="extra > 0" class="inline-flex items-center rounded-full border border-border bg-bg px-1.5 py-px text-[10px] font-bold text-text-soft" :title="resto">+{{ extra }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { TONE_STYLES } from 'components/statusMaps'

const props = defineProps({ alertas: { type: Array, required: true }, max: { type: Number, default: 3 } })
const visibles = computed(() => props.alertas.slice(0, props.max))
const extra = computed(() => Math.max(0, props.alertas.length - props.max))
const resto = computed(() => props.alertas.slice(props.max).map((a) => a.label).join(', '))
</script>
