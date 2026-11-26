<template>
  <div role="radiogroup" :aria-label="label" class="inline-flex max-w-full overflow-hidden rounded-md border border-border bg-bg text-[11.5px] font-bold">
    <button
      v-for="o in opciones"
      :key="o.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === o.value"
      :title="o.title"
      :disabled="disabled"
      :class="`px-2 py-1 leading-none transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vz-blue disabled:cursor-default ${clase(o)}`"
      @click="elegir(o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<script setup>
/** Selector compacto de 2 o 3 opciones (Sí / No / sin dato, IVA incluido / + IVA, responsable de la garantía…). Un clic en la opción activa la limpia si `limpiable`. */

const props = defineProps({
  modelValue: { type: String, required: true },
  opciones: { type: Array, required: true },
  label: { type: String, required: true },
  disabled: Boolean,
  limpiable: Boolean,
})
const emit = defineEmits(['update:modelValue'])

const TONOS = {
  ok: 'bg-vz-success text-white',
  peligro: 'bg-vz-danger text-white',
  neutro: 'bg-border text-text',
  azul: 'bg-vz-blue text-white',
}

function clase(o) {
  if (props.modelValue === o.value) return TONOS[o.tono ?? 'azul']
  return props.disabled ? 'text-text-soft' : 'text-text-muted hover:bg-surface-hover'
}

function elegir(v) {
  if (props.disabled) return
  emit('update:modelValue', props.limpiable && props.modelValue === v ? '' : v)
}
</script>
