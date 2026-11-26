
<template>
  <div v-if="equipo" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg p-3 text-[12.5px]">
    <div class="min-w-0">
      <p class="truncate font-bold text-text">{{ equipo.modelo || equipo.numeroSerie || 'Equipo' }}</p>
      <p class="text-text-muted">
        {{ item.encontrado === false ? 'No encontrado' : item.condicion === 'danado' ? 'Encontrado dañado' : '—' }}<template v-if="equipo.numeroSerie">
          · N° serie {{ equipo.numeroSerie }}</template
        >
      </p>
      <p v-if="item.notas" class="text-text-soft">Nota del conteo: {{ item.notas }}</p>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <StatusPill v-if="item.resolucion" :label="item.resolucion" tone="success" />
      <StatusPill v-else-if="equipo.estado === 'baja'" label="Dado de baja" tone="neutral" />
      <template v-else-if="!solo">
        <button
          type="button"
          class="h-8 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 text-[11.5px] font-bold text-vz-danger hover:bg-vz-danger/20"
          @click="emit('resolve', equipo, item)"
        >
          Dar de baja por pérdida
        </button>
        <button
          type="button"
          class="h-8 rounded-lg border border-border bg-surface px-3 text-[11.5px] font-bold text-text-muted hover:bg-surface-hover"
          @click="emit('documentar', item, 'Revisado: se conserva en inventario')"
        >
          Conservar en inventario
        </button>
      </template>
      <StatusPill v-else label="Sin resolver al cierre" tone="warning" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import StatusPill from 'components/StatusPill.vue'
import { getEquipo } from 'src/lib/inventario/sistemas'

/** `solo`: solo lectura (auditoría cerrada o el usuario no puede resolver). */
const props = defineProps({ item: { type: Object, required: true }, solo: Boolean })
const emit = defineEmits(['resolve', 'documentar'])

const equipo = computed(() => (props.item.equipoId ? getEquipo(props.item.equipoId) : undefined))
</script>
