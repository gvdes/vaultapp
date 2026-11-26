<template>
  <div class="inline-flex items-center overflow-hidden rounded-xl border border-border bg-bg" role="group" :aria-label="etiqueta">
    <button
      type="button"
      class="flex h-11 w-11 items-center justify-center text-text-muted transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vz-blue disabled:opacity-40"
      :disabled="modelValue <= min"
      aria-label="Restar uno"
      @click="cambiar(modelValue - 1)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="h-4 w-4" aria-hidden="true"><path stroke-linecap="round" d="M5 12h14" /></svg>
    </button>
    <input
      :id="id"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      :value="modelValue"
      :aria-label="etiqueta"
      class="h-11 w-14 border-x border-border bg-transparent text-center text-[16px] font-extrabold text-text outline-none focus:bg-vz-blue/5 sm:text-[15px]"
      @input="alEscribir"
      @blur="alSalir"
      @keydown.up.prevent="cambiar(modelValue + 1)"
      @keydown.down.prevent="cambiar(modelValue - 1)"
    />
    <button
      type="button"
      class="flex h-11 w-11 items-center justify-center text-text-muted transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vz-blue disabled:opacity-40"
      :disabled="modelValue >= max"
      aria-label="Sumar uno"
      @click="cambiar(modelValue + 1)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="h-4 w-4" aria-hidden="true"><path stroke-linecap="round" d="M12 5v14M5 12h14" /></svg>
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Number, required: true },
  min: { type: Number, default: 1 },
  max: { type: Number, default: 100000 },
  id: String,
  etiqueta: { type: String, default: 'Cantidad' },
})
const emit = defineEmits(['update:modelValue'])

function cambiar(n) {
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, Math.round(n) || props.min)))
}
function alEscribir(e) {
  const el = e.target
  const limpio = el.value.replace(/[^0-9]/g, '')
  if (limpio === '') return
  const n = Math.min(props.max, Number(limpio))
  el.value = String(n)
  emit('update:modelValue', n)
}
function alSalir(e) {
  const el = e.target
  if (el.value === '' || Number(el.value) < props.min) {
    el.value = String(props.min)
    emit('update:modelValue', props.min)
  }
}
</script>
