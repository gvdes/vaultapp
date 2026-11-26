<template>
  <div aria-hidden="true" :class="`animate-pulse rounded-lg bg-border motion-reduce:animate-none ${cls}`" />
</template>

<script setup>
/** Bloque gris pulsante para pantallas de carga (respeta prefers-reduced-motion). Ej.: <SkeletonBlock cls="h-6 w-40" /> */
defineProps({ cls: { type: String, default: 'h-4 w-full' } })
</script>
