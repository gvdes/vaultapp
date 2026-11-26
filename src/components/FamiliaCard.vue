<template>
  <button
    type="button"
    class="group relative flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-border bg-surface p-3 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
    @click="emit('click')"
  >
    <span class="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-vz-blue via-vz-teal-2 to-vz-teal" />
    <div
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
      style="background: linear-gradient(135deg, #1f5fae 0%, #0fa391 100%); box-shadow: 0 4px 14px rgba(31, 95, 174, 0.35)"
    >
      <InventarioIcon :id="icono" class="h-6 w-6" />
    </div>
    <div class="min-w-0">
      <h3 class="line-clamp-2 text-[13px] font-bold leading-tight text-text" :title="nombre">
        {{ nombre }}
      </h3>
      <p class="mt-1 text-[11px] text-text-muted">{{ cantidad }} {{ cantidad === 1 ? 'artículo' : 'artículos' }}</p>
    </div>
    <div v-if="valor !== undefined" class="text-[13px] font-extrabold text-vz-blue">{{ currency.format(valor) }}</div>
  </button>
</template>

<script setup>
import InventarioIcon from './InventarioIcon.vue'

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

/** `valor` omitido = no se muestra dinero (inventario sin costos: Adquisiciones, Talento). */
defineProps({
  nombre: { type: String, required: true },
  icono: { type: String, required: true },
  cantidad: { type: Number, required: true },
  valor: Number,
})
const emit = defineEmits(['click'])
</script>
