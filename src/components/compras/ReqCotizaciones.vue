<template>
  <div v-if="req" class="flex min-w-0 flex-col gap-4">
    <!-- Modo: cotización completa o compra menor (solo registro). Mutuamente excluyentes. -->
    <div v-if="editable" class="flex flex-col gap-2" data-test="modo-cotizacion">
      <div class="flex flex-wrap gap-2" role="group" aria-label="Modo de captura">
        <button
          type="button"
          :class="`${chipModo} ${modoEfectivo === 'completa' ? chipOn : ''}`"
          :aria-pressed="modoEfectivo === 'completa'"
          :disabled="!!registro"
          data-test="modo-completa"
          @click="modo = 'completa'"
        >Cotización completa (comparativo)</button>
        <button
          type="button"
          :class="`${chipModo} ${modoEfectivo === 'menor' ? chipOn : ''}`"
          :aria-pressed="modoEfectivo === 'menor'"
          :disabled="normales.length > 0"
          data-test="modo-menor"
          @click="modo = 'menor'"
        >Compra menor (menos de {{ formatoUmbral(umbral) }}): solo registro</button>
      </div>
      <p v-if="registro" class="rounded-lg border border-vz-warning/30 bg-vz-warning/10 px-3 py-1.5 text-[12px] text-text" data-test="aviso-excluyente">
        Hay un <strong>registro de compra menor</strong> activo: es excluyente y no se mezcla con cotizaciones normales. Para cotizar de forma completa, descarta el registro (con su motivo).
      </p>
      <p v-else-if="normales.length > 0" class="rounded-lg border border-border bg-bg px-3 py-1.5 text-[12px] text-text-muted" data-test="aviso-excluyente">
        La compra menor (solo registro) no está disponible porque ya hay {{ normales.length }} cotización{{ normales.length === 1 ? '' : 'es' }} normal{{ normales.length === 1 ? '' : 'es' }} activa{{ normales.length === 1 ? '' : 's' }}: es excluyente. Descártalas (con su motivo) si esta compra es menor a {{ formatoUmbral(umbral) }}.
      </p>
      <p v-else class="text-[12px] text-text-muted">
        Basta <strong class="text-text">una</strong> cotización. Si la compra es menor a {{ formatoUmbral(umbral) }} no necesita cotización: solo el registro del proveedor y el precio (sigue requiriendo la autorización de Finanzas).
      </p>
    </div>

    <CompraMenorForm v-if="modoEfectivo === 'menor'" :folio="folio" @tab="(t) => emit('tab', t)" @guardada="emit('tab', 'autorizacion')" @completa="modo = 'completa'" />
    <!-- v-show: al cambiar de modo no se pierde la captura sin guardar de la hoja -->
    <div v-show="modoEfectivo === 'completa'" class="flex min-w-0 flex-col gap-4">
      <p class="text-[12px] text-text-muted">
        Captura a cada proveedor en su columna (precio por partida y los criterios que cambian la decisión). El comparativo calcula el costo total comparable, el puntaje y la
        recomendación al instante; al terminar, un solo botón guarda las cotizaciones, elige al proveedor y envía a autorización.
      </p>
      <CotizadorHoja :folio="folio" @enviada="emit('tab', 'autorizacion')" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { cotizacionesNormales, formatoUmbral, getConfig, getRequisicion, registroActivo } from 'src/lib/compras'
import CotizadorHoja from './cotizador/CotizadorHoja.vue'
import CompraMenorForm from './cotizador/CompraMenorForm.vue'
import { useAcceso } from './useAcceso'

/**
 * Pestaña "Cotizaciones": una sola hoja de comparación (columnas = proveedores, filas = partidas y criterios) o, si la compra es menor al
 * umbral sin cotización, el registro simple de compra menor. Las reglas (mínimo de cotizaciones, exclusión mutua, justificación,
 * inmutabilidad) viven en `src/lib/compras/cotizaciones.js`.
 */
const props = defineProps({ folio: { type: String, required: true } })
const emit = defineEmits(['tab'])
const { puedeCotizar } = useAcceso()
const req = computed(() => getRequisicion(props.folio))
const umbral = computed(() => getConfig().umbralSinCotizacion)
const registro = computed(() => registroActivo(props.folio))
const normales = computed(() => cotizacionesNormales(props.folio))
const editable = computed(() => puedeCotizar.value && (req.value?.estado === 'recibida' || req.value?.estado === 'en_cotizacion'))

const chipModo = 'rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] font-bold text-text-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50'
const chipOn = '!border-vz-blue !bg-vz-blue/10 !text-vz-blue'

const modo = ref('completa')
/** Con un registro activo el modo es siempre «compra menor» (también en consulta); con cotizaciones normales activas, siempre «completa». */
const modoEfectivo = computed(() => (registro.value ? 'menor' : normales.value.length > 0 ? 'completa' : modo.value))
</script>
