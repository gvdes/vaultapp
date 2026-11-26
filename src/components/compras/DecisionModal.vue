<template>
  <AppModal :title="titulo" @close="emit('close')">
    <div class="mb-3 rounded-lg border border-border bg-bg p-3 text-[12.5px]">
      <p class="font-mono text-[11.5px] font-bold text-text-muted">{{ folio }}</p>
      <p class="mt-0.5 text-text">Monto de la cotización elegida: <strong>{{ formatoMoneda(monto) }}</strong></p>
      <p v-if="proveedor" class="text-text-muted">Proveedor: {{ proveedor }}</p>
      <p class="text-text-muted">
        Decides como <strong class="text-text">{{ NIVEL_LABEL[nivel] }}</strong><template v-if="yo"> ({{ yo.nombre }}, {{ yo.topeAprobacion === undefined || yo.topeAprobacion === null ? 'sin tope de aprobación' : `tope ${formatoMoneda(yo.topeAprobacion)}` }})</template>.
        Tu decisión queda registrada con tu nombre y fecha, y es el comprobante de autorización.
      </p>
    </div>
    <AppField :label="decision === 'aprobada' ? 'Comentario (opcional)' : 'Motivo *'">
      <textarea v-model="comentario" :class="textareaClass" rows="3" :placeholder="decision === 'aprobada' ? 'Algo que quede asentado junto con tu aprobación' : 'Explica qué debe corregirse o por qué se rechaza'" />
    </AppField>
    <p v-if="error" role="alert" class="mt-3 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ error }}</p>
    <div class="mt-5 flex justify-end gap-2">
      <button type="button" :class="btn" :disabled="guardando" @click="emit('close')">Cancelar</button>
      <button type="button" :class="decision === 'aprobada' ? btnOk : decision === 'rechazada' ? btnDanger : btnWarn" :disabled="guardando" @click="confirmar">
        {{ guardando ? 'Guardando…' : botonTexto }}
      </button>
    </div>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { textareaClass } from 'components/formClasses'
import { ESTADOS, NIVEL_LABEL, formatoMoneda, getRequisicion, montoElegido, participanteDeUsuario, registrarAprobacion } from 'src/lib/compras'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'
import { btn, btnDanger, btnOk, btnWarn } from './util'

/** Aprobar / rechazar / pedir ajuste desde la app (solo Finanzas, dentro de su tope de aprobación) con comentario. */
const props = defineProps({
  folio: { type: String, required: true },
  nivel: { type: String, required: true },
  decision: { type: String, required: true },
})
const emit = defineEmits(['close', 'done'])
const toast = useToast()

const comentario = ref('')
const error = ref('')
const guardando = ref(false)
const monto = computed(() => montoElegido(props.folio))
const yo = computed(() => participanteDeUsuario())
const proveedor = computed(() => getRequisicion(props.folio)?.proveedorElegido)
const titulo = computed(() => (props.decision === 'aprobada' ? 'Aprobar requisición' : props.decision === 'rechazada' ? 'Rechazar requisición' : 'Pedir ajuste'))
const botonTexto = computed(() => (props.decision === 'aprobada' ? 'Aprobar' : props.decision === 'rechazada' ? 'Rechazar' : 'Pedir ajuste'))

async function confirmar() {
  error.value = ''
  if (props.decision !== 'aprobada' && !comentario.value.trim()) {
    error.value = 'Escribe el motivo (es obligatorio al rechazar o pedir ajuste).'
    return
  }
  guardando.value = true
  try {
    const r = await registrarAprobacion({ folio: props.folio, nivel: props.nivel, decision: props.decision, comentario: comentario.value })
    bump()
    toast(`Decisión registrada. Estado: ${ESTADOS[r.estado].label}.`)
    emit('done')
    emit('close')
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : 'No se pudo registrar la decisión.'
  } finally {
    guardando.value = false
  }
}
</script>
