<template>
  <span :class="`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE_STYLES[tone]}`">
    {{ label }}
  </span>
</template>

<script setup>
import { TONE_STYLES } from './statusMaps'

defineProps({ label: { type: String, required: true }, tone: { type: String, required: true } })
</script>
