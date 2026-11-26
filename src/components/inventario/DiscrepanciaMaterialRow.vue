<template>
  <div v-if="material" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg p-3 text-[12.5px]">
    <div class="min-w-0">
      <p class="truncate font-bold text-text">{{ material.nombre }}</p>
      <p class="text-text-muted">
        Esperado {{ item.cantidadEsperada }} {{ material.unidadMedida }} · Contado {{ item.cantidadContada }} {{ material.unidadMedida }}
      </p>
      <p v-if="item.notas" class="text-text-soft">Nota del conteo: {{ item.notas }}</p>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <StatusPill v-if="item.resolucion" :label="item.resolucion" tone="success" />
      <StatusPill v-else-if="resuelto" label="Ajustado" tone="success" />
      <template v-else-if="!solo">
        <button
          type="button"
          :disabled="ajustando"
          class="h-8 rounded-lg border border-vz-warning/30 bg-vz-warning/10 px-3 text-[11.5px] font-bold text-vz-warning hover:bg-vz-warning/20 disabled:opacity-60"
          @click="handleAjustar"
        >
          {{ ajustando ? 'Ajustando…' : 'Ajustar a cantidad contada' }}
        </button>
        <button
          type="button"
          :disabled="ajustando"
          class="h-8 rounded-lg border border-border bg-surface px-3 text-[11.5px] font-bold text-text-muted hover:bg-surface-hover disabled:opacity-60"
          @click="documentar"
        >
          Dejar sin ajuste
        </button>
      </template>
      <StatusPill v-else label="Sin resolver al cierre" tone="warning" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import StatusPill from 'components/StatusPill.vue'
import { useAuth } from 'src/lib/auth'
import { useToast } from 'src/composables/useToast'
import { todayLocalDateString } from 'src/lib/dateUtils'
import { getMaterial, registrarEntrada, registrarSalida } from 'src/lib/inventario/mantenimiento'
import { registrarResolucion } from 'src/lib/inventario/auditorias'

/** `solo`: solo lectura (auditoría cerrada o el usuario no puede resolver). */
const props = defineProps({ item: { type: Object, required: true }, solo: Boolean })
const emit = defineEmits(['ajustado'])

const { user } = useAuth()
const toast = useToast()
const ajustando = ref(false)
const material = computed(() => (props.item.materialId ? getMaterial(props.item.materialId) : undefined))
const resuelto = computed(() => props.item.cantidadContada != null && material.value?.cantidadActual === props.item.cantidadContada)
const diff = computed(() => (props.item.cantidadContada ?? 0) - (props.item.cantidadEsperada ?? 0))

const handleAjustar = async () => {
  const m = material.value
  if (!m) return
  ajustando.value = true
  try {
    if (diff.value > 0) {
      await registrarEntrada({ materialId: m.id, fecha: todayLocalDateString(), cantidad: diff.value, quienRecibio: user.value?.displayName })
    } else if (diff.value < 0) {
      await registrarSalida({
        materialId: m.id,
        fecha: todayLocalDateString(),
        cantidad: -diff.value,
        motivo: 'Ajuste por auditoría',
        quienEntrego: user.value?.displayName,
      })
    }
    await registrarResolucion(props.item.id, `Existencia ajustada a ${props.item.cantidadContada} ${m.unidadMedida}`)
    toast('Existencia ajustada al conteo de la auditoría.')
    emit('ajustado')
  } catch {
    toast('No se pudo ajustar la existencia.', 'error')
  } finally {
    ajustando.value = false
  }
}

const documentar = async () => {
  try {
    await registrarResolucion(props.item.id, 'Revisado: sin ajuste de existencia')
    emit('ajustado')
  } catch {
    toast('No se pudo registrar la resolución.', 'error')
  }
}
</script>
