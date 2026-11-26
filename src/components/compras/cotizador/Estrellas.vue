<template>
  <div role="radiogroup" :aria-label="label" class="inline-flex items-center gap-0.5">
    <button
      v-for="n in 5"
      :key="n"
      type="button"
      role="radio"
      :aria-checked="modelValue === n"
      :aria-label="`${n} de 5`"
      :disabled="disabled"
      :class="`rounded px-0.5 text-[17px] leading-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vz-blue disabled:cursor-default ${n <= modelValue ? 'text-vz-gold' : 'text-border'} ${disabled ? '' : 'hover:text-vz-gold'}`"
      @click="elegir(n)"
    >
      {{ n <= modelValue ? '★' : '☆' }}
    </button>
    <span v-if="modelValue" class="ml-1 text-[11px] font-semibold text-text-muted">{{ modelValue }}/5</span>
    <span v-else class="ml-1 text-[11px] text-text-soft">sin dato</span>
  </div>
</template>

<script setup>
/** Calificación de 1 a 5 estrellas (0 = sin dato). Un clic en la estrella activa la quita. */
const props = defineProps({
  modelValue: { type: Number, required: true },
  label: { type: String, required: true },
  disabled: Boolean,
})
const emit = defineEmits(['update:modelValue'])

function elegir(n) {
  if (props.disabled) return
  emit('update:modelValue', props.modelValue === n ? 0 : n)
}
</script>
