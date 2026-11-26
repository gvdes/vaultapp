<template>
  <Teleport to="body">
    <div class="fixed inset-0 flex items-center justify-center bg-black/40 px-4 py-8" style="z-index: 5500" @click="emit('close')">
      <div class="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl" @click.stop>
        <h2 class="mb-3 text-[15px] font-extrabold text-text">Cargos por pérdida / robo</h2>
        <div class="flex flex-col gap-2">
          <p v-if="cargos.length === 0" class="text-[12px] text-text-soft">Sin cargos registrados todavía.</p>
          <div v-for="c in cargos" :key="c.id" class="rounded-lg border border-vz-warning/20 bg-vz-warning/5 p-3 text-[12px]">
            <p class="font-bold text-text">
              {{ new Date(c.fecha).toLocaleDateString('es-MX') }} · {{ nombreEquipo(c.equipoId) }} · {{ c.motivo }}
            </p>
            <p class="text-text-muted">Colaborador: {{ c.usuarioAfectado || '—' }}</p>
            <p class="text-text-muted">
              Valor calculado: {{ currency.format(c.valorCalculado) }} · Cobrado: <span class="font-bold text-vz-warning">{{ currency.format(c.valorCobrado) }}</span>
            </p>
            <p v-if="c.notas" class="text-text-muted">{{ c.notas }}</p>
          </div>
        </div>
        <button type="button" class="mt-4 h-9 w-full rounded-lg border border-border bg-bg text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">Cerrar</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { listCargosPerdida } from 'src/lib/inventario/cargosPerdida'
import { listEquipos } from 'src/lib/inventario/sistemas'
import { getFamilia } from 'src/lib/inventario/comunes'

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

/** Lista de bajas por pérdida/robo, filtrada al tipo de inventario (Sistemas o Mantenimiento). */
const props = defineProps({ tipo: { type: String, required: true } })
const emit = defineEmits(['close'])

const equipos = computed(() => listEquipos())
const cargos = computed(() =>
  listCargosPerdida().filter((c) => {
    const equipo = equipos.value.find((e) => e.id === c.equipoId)
    return equipo && getFamilia(equipo.familiaId)?.tipo === props.tipo
  }),
)

function nombreEquipo(equipoId) {
  const equipo = equipos.value.find((e) => e.id === equipoId)
  return equipo?.modelo || equipo?.numeroSerie || equipoId
}
</script>
