<template>
  <div class="rounded-xl border border-border bg-surface p-4">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h3 class="text-[13px] font-bold text-text">{{ title }}</h3>
      <button type="button" class="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-hover" @click="exportPng">PNG</button>
    </div>
    <div ref="container" class="h-64">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

/** Tarjeta con título y botón "PNG". El contenido (slot) es un gráfico de vue-chartjs (<Bar>, <Line>, <Doughnut>…). */
const props = defineProps({ title: { type: String, required: true }, filename: { type: String, required: true } })
const container = ref(null)

function exportPng() {
  const canvas = container.value?.querySelector('canvas')
  if (!canvas) return
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, 0, 0)
  const a = document.createElement('a')
  a.href = out.toDataURL('image/png')
  a.download = props.filename.endsWith('.png') ? props.filename : `${props.filename}.png`
  a.click()
}
</script>
