<template>
  <AppModal title="Resolver solicitud" @close="emit('close')">
    <div class="mb-4 rounded-lg border border-border bg-bg p-3 text-[12.5px]">
      <p class="font-bold text-text">{{ solicitud.descripcion }}</p>
      <p class="mt-1 text-text-muted">
        {{ familia?.nombre ?? 'Sin clasificar' }} · Solicita: {{ solicitud.solicitanteNombre }} · Cantidad: {{ solicitud.cantidad }}
      </p>
    </div>

    <div v-if="solicitud.subtipo === 'material'" class="flex flex-col gap-3">
      <AppField label="Material en stock">
        <select v-model="materialId" :class="selectClass">
          <option value="">— Selecciona —</option>
          <option v-for="m in candidatosMaterial" :key="m.id" :value="m.id">{{ m.nombre }} ({{ m.cantidadActual }} {{ m.unidadMedida }})</option>
        </select>
      </AppField>
      <p v-if="materialSeleccionado && !hayStockMaterial" class="text-[12px] font-semibold text-vz-danger">
        No hay suficiente existencia ({{ materialSeleccionado.cantidadActual }} disponibles, se necesitan {{ solicitud.cantidad }}).
      </p>
      <button
        type="button"
        :disabled="!materialId || !hayStockMaterial || saving"
        class="h-9 rounded-lg bg-vz-success px-4 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
        @click="run(() => resolverConMaterial(solicitud.id, materialId, atendidoPor), 'Solicitud resuelta con stock existente.')"
      >
        Entregar de stock
      </button>
    </div>
    <div v-else class="flex flex-col gap-3">
      <AppField :label="solicitud.subtipo === 'reparacion' ? 'Equipo a reparar' : 'Equipo disponible'">
        <select v-model="equipoId" :class="selectClass">
          <option value="">— Selecciona —</option>
          <option v-for="e in candidatosEquipo" :key="e.id" :value="e.id">
            {{ e.modelo || 'Sin modelo' }} · {{ e.numeroSerie || 'sin serie' }} {{ e.usuarioAsignado ? `· ${e.usuarioAsignado}` : '' }}
          </option>
        </select>
      </AppField>
      <p v-if="candidatosEquipo.length === 0 && solicitud.subtipo === 'equipo_nuevo'" class="text-[12px] text-text-soft">
        No hay equipo disponible de esta familia — considera marcar como pendiente de compra.
      </p>
      <button
        type="button"
        :disabled="!equipoId || saving"
        class="h-9 rounded-lg bg-vz-success px-4 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
        @click="
          run(
            () => resolverConEquipo(solicitud.id, equipoId, atendidoPor),
            solicitud.subtipo === 'reparacion' ? 'Equipo enviado a reparación.' : 'Equipo asignado.',
          )
        "
      >
        {{ solicitud.subtipo === 'reparacion' ? 'Enviar a reparación' : 'Asignar equipo' }}
      </button>
    </div>

    <div class="mt-5 border-t border-border pt-4">
      <p class="mb-2 text-[12px] font-semibold text-text">¿No hay existencia? Márcala pendiente de compra:</p>
      <div class="flex gap-2">
        <input v-model="fechaEstimada" type="date" :class="`${inputClass} flex-1`" />
        <button
          type="button"
          :disabled="!fechaEstimada || saving"
          class="h-9 shrink-0 rounded-lg bg-vz-warning px-3 text-[12px] font-bold text-vz-ink hover:opacity-90 disabled:opacity-40"
          @click="run(() => marcarPendienteCompra(solicitud.id, fechaEstimada, atendidoPor), 'Solicitud marcada pendiente de compra.')"
        >
          Pendiente de compra
        </button>
      </div>
    </div>

    <div class="mt-5 flex justify-between gap-2 border-t border-border pt-4">
      <button
        type="button"
        :disabled="saving"
        class="h-9 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 text-[12px] font-bold text-vz-danger hover:bg-vz-danger/20"
        @click="run(() => cancelarSolicitud(solicitud.id), 'Solicitud cancelada.')"
      >
        Cancelar solicitud
      </button>
      <button type="button" class="h-9 rounded-lg border border-border bg-bg px-3 text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">
        Cerrar
      </button>
    </div>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { inputClass, selectClass } from 'components/formClasses'
import { getFamilia } from 'src/lib/inventario/comunes'
import { listEquiposPorFamilia, listEquipos } from 'src/lib/inventario/sistemas'
import { listMaterialesPorFamilia, listMateriales } from 'src/lib/inventario/mantenimiento'
import {
  cancelarSolicitud,
  marcarPendienteCompra,
  resolverConEquipo,
  resolverConMaterial,
} from 'src/lib/inventario/solicitudes'
import { useToast } from 'src/composables/useToast'

const props = defineProps({ solicitud: { type: Object, required: true }, atendidoPor: String })
const emit = defineEmits(['close', 'saved'])

const toast = useToast()
const equipoId = ref('')
const materialId = ref('')
const fechaEstimada = ref('')
const saving = ref(false)

const familia = computed(() => getFamilia(props.solicitud.familiaId))

const candidatosEquipo = computed(() => {
  const s = props.solicitud
  return s.subtipo === 'reparacion'
    ? listEquipos().filter((e) => e.estado !== 'baja' && (!s.familiaId || e.familiaId === s.familiaId))
    : (s.familiaId ? listEquiposPorFamilia(s.familiaId) : listEquipos()).filter((e) => e.estado === 'disponible')
})

const candidatosMaterial = computed(() => (props.solicitud.familiaId ? listMaterialesPorFamilia(props.solicitud.familiaId) : listMateriales()))
const materialSeleccionado = computed(() => candidatosMaterial.value.find((m) => m.id === materialId.value))
const hayStockMaterial = computed(() => (materialSeleccionado.value ? materialSeleccionado.value.cantidadActual >= props.solicitud.cantidad : false))

const run = async (fn, mensaje) => {
  saving.value = true
  try {
    await fn()
    toast(mensaje)
    emit('saved')
    emit('close')
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo actualizar la solicitud.', 'error')
  } finally {
    saving.value = false
  }
}
</script>
