<template>
  <AppModal title="Calendario de mantenimiento preventivo" wide @close="emit('close')">
    <div class="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <AppField label="Qué se revisa">
        <input v-model="nombre" placeholder="p. ej. Revisión de aire acondicionado" :class="inputClass" />
      </AppField>
      <AppField label="Sucursal / área">
        <select v-model="ubicacionId" :class="selectClass">
          <option value="">— Selecciona —</option>
          <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
        </select>
      </AppField>
      <AppField label="Frecuencia (meses)">
        <input v-model="frecuenciaMeses" type="number" min="1" :class="inputClass" />
      </AppField>
      <AppField label="Próxima fecha">
        <input v-model="proximaFecha" type="date" :class="inputClass" />
      </AppField>
      <AppField label="Responsable">
        <input v-model="responsable" :class="inputClass" />
      </AppField>
      <div class="flex items-end">
        <button type="button" :disabled="saving" class="h-9 w-full rounded-lg bg-vz-blue text-[12px] font-bold text-white hover:bg-primary-hover disabled:opacity-60" @click="handleAdd">+ Programar</button>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <p v-if="programados.length === 0" class="text-[12px] text-text-soft">Sin mantenimientos programados todavía.</p>
      <div
        v-for="p in programados"
        :key="p.id"
        :class="`rounded-lg border p-3 text-[12.5px] ${diasHasta(p.proximaFecha) <= 7 ? 'border-vz-warning/30 bg-vz-warning/5' : 'border-border bg-bg'}`"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="font-bold text-text">{{ p.nombre }}</p>
            <p class="text-text-muted">
              Próxima: {{ p.proximaFecha }}
              <span v-if="diasHasta(p.proximaFecha) <= 7" class="font-bold text-vz-warning">({{ diasHasta(p.proximaFecha) < 0 ? 'vencido' : `en ${diasHasta(p.proximaFecha)} días` }})</span>
              · cada {{ p.frecuenciaMeses }} meses
            </p>
            <p v-if="p.responsable" class="text-text-muted">Responsable: {{ p.responsable }}</p>
          </div>
          <div class="flex shrink-0 gap-1.5">
            <button type="button" class="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-hover" @click="expandido = expandido === p.id ? null : p.id">Historial</button>
            <button type="button" class="rounded-md border border-vz-success/30 bg-vz-success/10 px-2 py-1 text-[11px] font-semibold text-vz-success hover:bg-vz-success/20" @click="handleRealizado(p.id)">
              Marcar realizado
            </button>
            <button type="button" class="rounded-md border border-vz-danger/30 bg-vz-danger/10 px-2 py-1 text-[11px] font-semibold text-vz-danger hover:bg-vz-danger/20" @click="handleDesactivar(p.id, p.nombre)">
              Desactivar
            </button>
          </div>
        </div>
        <div v-if="expandido === p.id" class="mt-2 border-t border-border pt-2">
          <p v-if="listHistorial(p.id).length === 0" class="text-text-soft">Sin registros previos.</p>
          <p v-for="h in listHistorial(p.id)" :key="h.id" class="text-text-muted">{{ h.fechaRealizado }} {{ h.realizadoPor ? `· ${h.realizadoPor}` : '' }}</p>
        </div>
      </div>

      <details v-if="desactivados.length > 0" class="rounded-lg border border-border bg-bg p-3 text-[12.5px]">
        <summary class="cursor-pointer text-[12px] font-bold text-text-muted">Desactivados ({{ desactivados.length }})</summary>
        <div class="mt-2 flex flex-col gap-2">
          <div v-for="p in desactivados" :key="p.id" class="flex items-start justify-between gap-2 rounded-md border border-border bg-surface p-2.5">
            <div>
              <p class="font-bold text-text-muted">{{ p.nombre }}</p>
              <p class="text-text-soft">Cada {{ p.frecuenciaMeses }} meses · {{ listHistorial(p.id).length }} registro(s) en historial</p>
            </div>
            <button type="button" class="shrink-0 rounded-md border border-vz-success/30 bg-vz-success/10 px-2 py-1 text-[11px] font-semibold text-vz-success hover:bg-vz-success/20" @click="handleReactivar(p.id, p.nombre)">
              Reactivar
            </button>
          </div>
        </div>
      </details>
    </div>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { inputClass, selectClass } from 'components/formClasses'
import { listUbicaciones } from 'src/lib/inventario/comunes'
import {
  listMantenimientosProgramados,
  addMantenimientoProgramado,
  marcarRealizado,
  listHistorial,
  desactivarMantenimientoProgramado,
  reactivarMantenimientoProgramado,
} from 'src/lib/inventario/mantenimientoProgramado'
import { useConfirm } from 'src/composables/useConfirm'
import { parseLocalDate, todayLocalDateString } from 'src/lib/dateUtils'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'

function diasHasta(fechaISO) {
  return Math.round((parseLocalDate(fechaISO).getTime() - parseLocalDate(todayLocalDateString()).getTime()) / (1000 * 60 * 60 * 24))
}

const props = defineProps({ realizadoPor: String })
const emit = defineEmits(['close'])

const toast = useToast()
const confirm = useConfirm()
const refresh = () => bump()

const nombre = ref('')
const ubicacionId = ref('')
const frecuenciaMeses = ref('3')
const proximaFecha = ref(todayLocalDateString())
const responsable = ref('')
const saving = ref(false)
const expandido = ref(null)

const ubicaciones = computed(() => listUbicaciones())
const programados = computed(() => listMantenimientosProgramados())
const desactivados = computed(() => listMantenimientosProgramados(false).filter((p) => !p.activo))

async function handleAdd() {
  if (!nombre.value.trim()) {
    toast('Describe qué se va a mantener/revisar.', 'error')
    return
  }
  saving.value = true
  try {
    await addMantenimientoProgramado({
      nombre: nombre.value.trim(),
      ubicacionId: ubicacionId.value || undefined,
      frecuenciaMeses: Number(frecuenciaMeses.value) || 3,
      proximaFecha: proximaFecha.value,
      responsable: responsable.value || undefined,
      activo: true,
    })
    nombre.value = ''
    responsable.value = ''
    toast('Mantenimiento programado.')
    refresh()
  } finally {
    saving.value = false
  }
}

async function handleDesactivar(id, nombreP) {
  const ok = await confirm({
    title: 'Desactivar mantenimiento',
    message: `¿Desactivar el mantenimiento programado "${nombreP}"? Deja de aparecer en el calendario y alertas; su historial se conserva y puedes reactivarlo.`,
    confirmLabel: 'Desactivar',
    danger: true,
  })
  if (!ok) return
  await desactivarMantenimientoProgramado(id)
  toast('Mantenimiento desactivado.')
  refresh()
}

async function handleReactivar(id, nombreP) {
  const ok = await confirm({ message: `¿Reactivar "${nombreP}"?`, confirmLabel: 'Reactivar' })
  if (!ok) return
  await reactivarMantenimientoProgramado(id)
  toast('Mantenimiento reactivado.')
  refresh()
}

async function handleRealizado(id) {
  await marcarRealizado(id, props.realizadoPor)
  toast('Marcado como realizado; próxima fecha recalculada.')
  refresh()
}
</script>
