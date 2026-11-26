<template>
  <AppModal title="Guardar y enviar a autorización" wide @close="cerrar">
    <div class="rounded-xl border border-vz-blue/30 bg-vz-blue/5 p-3">
      <p class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Proveedor elegido</p>
      <p class="text-[15px] font-extrabold text-text">{{ proveedor }} <span class="font-bold text-text-muted">· {{ formatoMoneda(total) }}</span></p>
      <p class="mt-1 text-[12.5px] text-text-muted">
        La decide <strong class="text-text">Finanzas</strong>: llega a <strong class="text-text">{{ aprobadores.length ? aprobadores.join(' y ') : 'nadie (sin aprobador elegible)' }}</strong> (basta uno).
        <template v-if="avisaDireccion"> Dirección recibe además un aviso informativo (no aprueba).</template>
        Al enviar se guardan las cotizaciones, se elige a este proveedor y se mandan los correos; después ya no podrás cambiar partidas ni cotizaciones.
      </p>
      <p v-if="!aprobadores.length" role="alert" class="mt-2 rounded-lg border border-vz-danger/40 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">
        {{ MSG_SIN_APROBADOR }} Pide a Dirección que active a un aprobador de Finanzas con tope suficiente (o sin tope) en el Directorio.
      </p>
    </div>

    <!-- UN solo aviso de justificación (no es la más barata y/o no es la recomendada) -->
    <div v-if="evaluacion.requiereJustificacion" class="mt-3">
      <p class="mb-2 rounded-lg border border-vz-warning/30 bg-vz-warning/10 px-3 py-2 text-[12.5px] font-semibold text-vz-warning">{{ evaluacion.motivo }}</p>
      <AppField label="Justificación de la elección *">
        <textarea ref="areaJustificacion" v-model="justificacion" :class="textareaClass" rows="3" placeholder="p. ej. entrega en 2 días vs 10 y mejor garantía" />
      </AppField>
      <p v-if="evaluacion.sugerencia" class="mt-1 text-[11.5px] text-text-soft">Ya te dejé lo que dice el comparativo; edítalo si quieres agregar algo.</p>
    </div>

    <div v-if="minimas.requiereExcepcion" class="mt-3 rounded-lg border border-vz-warning/30 bg-vz-warning/10 px-3 py-2 text-[12.5px] text-text" data-test="envio-excepcion">
      <p class="font-semibold text-vz-warning">Se envía con una excepción de cotizaciones ({{ minimas.completas }} de {{ minimas.requeridas }} cotizaciones de proveedores distintos).</p>
      <p class="mt-0.5"><span class="font-bold">Excepción de cotizaciones:</span> {{ excepcionTexto }}</p>
    </div>

    <p v-if="!evaluacion.requiereJustificacion && !minimas.requiereExcepcion" class="mt-3 text-[12.5px] text-text-muted">
      No hace falta justificar: es la más barata y la recomendada, y se cumple el mínimo de cotizaciones (o hay excepción documentada).
    </p>

    <p v-if="error" role="alert" class="mt-3 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ error }}</p>
    <div class="mt-5 flex justify-end gap-2">
      <button type="button" :class="btn" :disabled="enviando" @click="cerrar">Volver a la hoja</button>
      <button type="button" :class="btnPrimary" :disabled="enviando || !aprobadores.length" @click="confirmar">{{ enviando ? 'Enviando…' : 'Guardar y enviar' }}</button>
    </div>
  </AppModal>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { textareaClass } from 'components/formClasses'
import { MSG_SIN_APROBADOR, formatoMoneda } from 'src/lib/compras'
import { btn, btnPrimary } from '../util'

const props = defineProps({
  proveedor: { type: String, required: true },
  total: { type: Number, required: true },
  /** Aprobadores de Finanzas elegibles para el monto (a ellos llega la solicitud; basta uno). */
  aprobadores: { type: Array, required: true },
  /** El monto rebasa el umbral: Dirección recibe un aviso informativo. */
  avisaDireccion: { type: Boolean, required: true },
  evaluacion: { type: Object, required: true },
  minimas: { type: Object, required: true },
  excepcionTexto: { type: String, default: '' },
  accion: { type: Function, required: true },
})
const emit = defineEmits(['close'])

const justificacion = ref(props.evaluacion.sugerencia ?? '')
const error = ref('')
const enviando = ref(false)
const areaJustificacion = ref(null)

onMounted(() => {
  if (props.evaluacion.requiereJustificacion && !justificacion.value) areaJustificacion.value?.focus()
})

function cerrar() {
  if (!enviando.value) emit('close')
}

async function confirmar() {
  error.value = ''
  if (props.evaluacion.requiereJustificacion && !justificacion.value.trim()) {
    error.value = 'Escribe la justificación de la elección.'
    return
  }
  enviando.value = true
  try {
    await props.accion({ justificacion: justificacion.value.trim() })
    emit('close')
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : 'No se pudo enviar a autorización.'
  } finally {
    enviando.value = false
  }
}
</script>
