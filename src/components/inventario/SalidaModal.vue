<template>
  <AppModal :title="`${traslado ? 'Trasladar a sucursal' : 'Registrar salida'} · ${material.nombre}`" @close="emit('close')">
    <p class="mb-3 text-[12px] text-text-muted">
      Existencia actual: {{ material.cantidadActual }} {{ material.unidadMedida }} · en {{ getUbicacion(material.ubicacionId)?.nombre ?? 'sin ubicación' }}
    </p>
    <div class="mb-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        :class="`rounded-lg border px-3 py-2 text-left text-[12px] transition-colors ${traslado ? 'border-vz-blue bg-vz-blue/10' : 'border-border bg-bg hover:bg-surface-hover'}`"
        @click="traslado = true"
      >
        <span class="block font-bold text-text">Trasladar a sucursal</span>
        <span class="text-text-muted">Pasa a ser inventario de esa sucursal (cuenta en su valor y en su auditoría).</span>
      </button>
      <button
        type="button"
        :class="`rounded-lg border px-3 py-2 text-left text-[12px] transition-colors ${!traslado ? 'border-vz-danger bg-vz-danger/10' : 'border-border bg-bg hover:bg-surface-hover'}`"
        @click="traslado = false"
      >
        <span class="block font-bold text-text">Consumo / uso</span>
        <span class="text-text-muted">Se gasta o se usa: sale del inventario.</span>
      </button>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <AppField label="Fecha">
        <input v-model="fecha" type="date" :class="inputClass" />
      </AppField>
      <AppField label="Cantidad">
        <input v-model="cantidad" type="number" min="1" :max="material.cantidadActual" :class="inputClass" />
      </AppField>
      <div class="col-span-2">
        <AppField :label="traslado ? 'Sucursal / área que lo recibe' : 'Sucursal / área destino (opcional)'">
          <select v-model="ubicacionDestinoId" :class="selectClass">
            <option value="">— Selecciona —</option>
            <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
          </select>
        </AppField>
      </div>
      <AppField label="Quién solicitó">
        <input v-model="quienSolicito" :class="inputClass" />
      </AppField>
      <AppField label="Responsable">
        <input v-model="responsable" :class="inputClass" />
      </AppField>
      <div class="col-span-2">
        <AppField label="Motivo">
          <textarea v-model="motivo" :class="textareaClass" />
        </AppField>
      </div>
    </div>
    <div class="mt-5 flex justify-end gap-2">
      <button type="button" class="h-9 rounded-lg border border-border bg-bg px-3 text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">Cancelar</button>
      <button type="button" :disabled="saving" class="h-9 rounded-lg px-4 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60" :style="{ background: traslado ? 'var(--color-vz-blue)' : 'var(--color-vz-danger)' }" @click="handleSubmit">
        {{ saving ? 'Guardando…' : traslado ? 'Trasladar' : 'Registrar salida' }}
      </button>
    </div>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { inputClass, selectClass, textareaClass } from 'components/formClasses'
import { getUbicacion, listUbicaciones, UBICACION_STOCK_MAESTRO } from 'src/lib/inventario/comunes'
import { registrarSalida, trasladarMaterial } from 'src/lib/inventario/mantenimiento'
import { todayLocalDateString } from 'src/lib/dateUtils'
import { useToast } from 'src/composables/useToast'

const props = defineProps({ material: { type: Object, required: true }, quienEntrego: String })
const emit = defineEmits(['close', 'saved'])

const toast = useToast()
// Lo que sale del stock maestro normalmente se TRASLADA a una sucursal; lo que ya está en una sucursal normalmente se consume.
const traslado = ref(props.material.ubicacionId === UBICACION_STOCK_MAESTRO)
const ubicaciones = computed(() => listUbicaciones().filter((u) => !traslado.value || u.id !== props.material.ubicacionId))
const fecha = ref(todayLocalDateString())
const cantidad = ref('1')
const motivo = ref('')
const ubicacionDestinoId = ref('')
const quienSolicito = ref('')
const responsable = ref('')
const saving = ref(false)

async function handleSubmit() {
  const cant = Number(cantidad.value)
  if (!cant || cant <= 0) {
    toast('La cantidad debe ser mayor a cero.', 'error')
    return
  }
  if (cant > props.material.cantidadActual) {
    toast(`Solo hay ${props.material.cantidadActual} ${props.material.unidadMedida} en existencia.`, 'error')
    return
  }
  if (traslado.value && !ubicacionDestinoId.value) {
    toast('Selecciona la sucursal o área que recibe el material.', 'error')
    return
  }
  saving.value = true
  try {
    if (traslado.value) {
      await trasladarMaterial({
        materialId: props.material.id,
        destinoId: ubicacionDestinoId.value,
        cantidad: cant,
        fecha: fecha.value,
        quienSolicito: quienSolicito.value || undefined,
        responsable: responsable.value || undefined,
        quienEntrego: props.quienEntrego,
        motivo: motivo.value || undefined,
      })
      toast(`Trasladado: ${cant} ${props.material.unidadMedida} a ${getUbicacion(ubicacionDestinoId.value)?.nombre ?? 'destino'}.`)
      emit('saved')
      emit('close')
      return
    }
    await registrarSalida({
      materialId: props.material.id,
      fecha: fecha.value,
      cantidad: cant,
      motivo: motivo.value || undefined,
      ubicacionDestinoId: ubicacionDestinoId.value || undefined,
      quienSolicito: quienSolicito.value || undefined,
      quienEntrego: props.quienEntrego,
      responsable: responsable.value || undefined,
    })
    toast(`Salida registrada: -${cant} ${props.material.unidadMedida}.`)
    emit('saved')
    emit('close')
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo registrar la salida.', 'error')
  } finally {
    saving.value = false
  }
}
</script>
