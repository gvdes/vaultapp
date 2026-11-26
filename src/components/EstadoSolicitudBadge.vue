<template>
  <StatusPill :label="ESTADO_SOLICITUD_LABEL[estado] ?? estado" :tone="ESTADO_SOLICITUD_TONE[estado] ?? 'neutral'" />
</template>

<script setup>
import StatusPill from './StatusPill.vue'
import { ESTADO_SOLICITUD_LABEL, ESTADO_SOLICITUD_TONE } from './statusMaps'

defineProps({ estado: { type: String, required: true } })
</script>
