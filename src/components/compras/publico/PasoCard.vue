<template>
  <section :class="`${tarjeta}`" :aria-labelledby="`${idBase}-t`">
    <header class="mb-4 flex items-start gap-3">
      <span v-if="numero" class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vz-blue text-[14px] font-extrabold text-white" aria-hidden="true">{{ numero }}</span>
      <div class="min-w-0 flex-1">
        <h2 :id="`${idBase}-t`" class="text-[16px] font-extrabold leading-tight text-text">{{ titulo }}</h2>
        <p v-if="subtitulo" class="mt-0.5 text-[12.5px] leading-snug text-text-muted">{{ subtitulo }}</p>
      </div>
      <slot name="accion" />
    </header>
    <slot />
  </section>
</template>

<script setup>
import { tarjeta } from './estilos'

defineProps({ numero: Number, titulo: { type: String, required: true }, subtitulo: String })
const idBase = `paso-${Math.random().toString(36).slice(2, 8)}`
</script>
