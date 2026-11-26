<template>
  <AppModal :title="title" @close="emit('close')">
    <p v-if="descripcion" class="mb-3 text-[12.5px] text-text-muted">{{ descripcion }}</p>
    <AppField :label="required ? `${label} *` : label">
      <textarea v-model="texto" :class="textareaClass" :placeholder="placeholder" rows="3" />
    </AppField>
    <p v-if="error" role="alert" class="mt-3 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ error }}</p>
    <div class="mt-5 flex justify-end gap-2">
      <button type="button" :class="btn" :disabled="guardando" @click="emit('close')">Cancelar</button>
      <button type="button" :class="danger ? btnDanger : btnPrimary" :disabled="guardando" @click="confirmar">
        {{ guardando ? 'Guardando…' : confirmLabel }}
      </button>
    </div>
  </AppModal>
</template>

<script setup>
import { ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { textareaClass } from 'components/formClasses'
import { btn, btnDanger, btnPrimary } from './util'

/**
 * Modal con un texto (motivo, justificación, comentario). `accion` recibe el texto y lanza un Error con mensaje en español
 * si algo falla (se muestra dentro del modal); si termina bien, el modal se cierra.
 */
const props = defineProps({
  title: { type: String, required: true },
  label: { type: String, default: 'Motivo' },
  descripcion: String,
  placeholder: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirmar' },
  danger: Boolean,
  required: { type: Boolean, default: true },
  accion: { type: Function, required: true },
})
const emit = defineEmits(['close', 'done'])

const texto = ref('')
const error = ref('')
const guardando = ref(false)

async function confirmar() {
  error.value = ''
  const t = texto.value.trim()
  if (props.required && !t) {
    error.value = `Escribe el ${props.label.toLowerCase()} (es obligatorio).`
    return
  }
  guardando.value = true
  try {
    await props.accion(t)
    emit('done')
    emit('close')
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : 'No se pudo completar la acción.'
  } finally {
    guardando.value = false
  }
}
</script>
