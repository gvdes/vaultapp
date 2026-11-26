<template>
  <div class="inline-flex items-center rounded-lg bg-white px-3 py-1.5 shadow-sm">
    <img :src="logoUrl" alt="Grupo Vizcarra" :class="`${size === 'lg' ? 'h-14' : 'h-8'} w-auto object-contain`" />
  </div>
</template>

<script setup>
import logoUrl from 'assets/logo-vizcarra.png'

defineProps({ size: { type: String, default: 'sm' } })
</script>
