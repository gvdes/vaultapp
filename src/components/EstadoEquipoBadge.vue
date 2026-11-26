<template>
  <StatusPill :label="ESTADO_EQUIPO_LABEL[estado] ?? estado" :tone="ESTADO_EQUIPO_TONE[estado] ?? 'neutral'" />
</template>

<script setup>
import StatusPill from './StatusPill.vue'
import { ESTADO_EQUIPO_LABEL, ESTADO_EQUIPO_TONE } from './statusMaps'

defineProps({ estado: { type: String, required: true } })
</script>
