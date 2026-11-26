<template>
  <AuditoriaDetalle v-if="auditoriaId && auditoriaExiste" :auditoria-id="auditoriaId" @back="auditoriaId = null" />

  <div v-else class="mx-auto flex h-full max-w-4xl flex-col px-4 py-6 sm:px-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-[15px] font-extrabold text-text">Auditorías físicas</h1>
        <p class="text-[12.5px] text-text-muted">
          Conteo periódico por sucursal (GV-INF-008) para confirmar que el inventario en sistema coincide con lo que realmente hay. Nada se borra: las cerradas son
          inmutables.
        </p>
      </div>
      <button v-if="editorBase" type="button" class="h-9 rounded-lg bg-vz-blue px-3 text-[13px] font-bold text-white hover:bg-primary-hover" @click="abrirNueva()">
        + Nueva auditoría
      </button>
    </div>

    <div class="mb-3 flex gap-1.5 border-b border-border">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        :class="`-mb-px border-b-2 px-3 py-2 text-[13px] font-bold transition-colors ${tab === t.id ? 'border-vz-blue text-vz-blue' : 'border-transparent text-text-muted hover:text-text'}`"
        @click="tab = t.id"
      >
        {{ t.label }}
        <span v-if="t.id === 'programacion' && vencidasN > 0" class="ml-1 rounded-full bg-vz-danger px-1.5 py-0.5 text-[10.5px] text-white">{{ vencidasN }}</span>
        <span v-if="t.id === 'auditorias' && porVerificarN > 0" class="ml-1 rounded-full bg-vz-blue px-1.5 py-0.5 text-[10.5px] text-white">{{ porVerificarN }}</span>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto pb-8">
      <!-- Lista -->
      <template v-if="tab === 'auditorias'">
        <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select v-model="fEstado" :class="selectClass" aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            <option v-for="(label, k) in ESTADO_AUDITORIA_LABEL" :key="k" :value="k">{{ label }}</option>
          </select>
          <select v-model="fSucursal" :class="selectClass" aria-label="Filtrar por sucursal">
            <option value="">Todas las sucursales</option>
            <option v-for="u in sucursalesConAuditoria" :key="u.id" :value="u.id">{{ u.nombre }}</option>
          </select>
          <select v-model="fTipo" :class="selectClass" aria-label="Filtrar por tipo">
            <option value="">Todos los tipos</option>
            <option v-for="k in tiposVisibles" :key="k" :value="k">{{ TIPO_AUDITORIA_LABEL[k] }}</option>
          </select>
          <select v-model="fAuditor" :class="selectClass" aria-label="Filtrar por auditor">
            <option value="">Todos los auditores</option>
            <option value="__interna">Internas (sin auditor)</option>
            <option v-for="n in auditores" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>

        <div v-if="auditorias.length === 0" class="rounded-xl border border-dashed border-border p-8 text-center text-[13px] text-text-soft">
          Todavía no se ha realizado ninguna auditoría. Empieza por la sucursal donde haya más dudas de inventario o revisa la pestaña Programación.
        </div>
        <div v-else-if="filtradas.length === 0" class="rounded-xl border border-dashed border-border p-8 text-center text-[13px] text-text-soft">
          Ninguna auditoría coincide con los filtros.
        </div>
        <div v-else class="flex flex-col gap-2">
          <button
            v-for="a in filtradas"
            :key="a.id"
            type="button"
            class="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-hover"
            @click="auditoriaId = a.id"
          >
            <div class="min-w-0">
              <p class="truncate font-bold text-text">{{ getUbicacion(a.ubicacionId)?.nombre ?? a.ubicacionId }}</p>
              <p class="text-[12px] text-text-muted">
                {{ TIPO_AUDITORIA_LABEL[a.tipo] }} · {{ listItems(a.id).length }} artículo(s) · {{ new Date(a.fechaInicio).toLocaleDateString('es-MX') }}
                <template v-if="a.auditorNombre"> · {{ a.auditorNombre }}</template>
                <template v-else-if="a.realizadaPor"> · {{ a.realizadaPor }}</template>
              </p>
              <p v-if="a.fechaProgramada && a.estado !== 'completada'" :class="`text-[11.5px] ${vencidaProgramada(a) ? 'font-semibold text-vz-danger' : 'text-text-soft'}`">
                Programada {{ new Date(`${a.fechaProgramada}T00:00:00`).toLocaleDateString('es-MX') }}<template v-if="vencidaProgramada(a)"> · vencida</template>
              </p>
            </div>
            <div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <StatusPill v-if="a.sorpresa" label="Sorpresa" tone="neutral" />
              <StatusPill v-if="discrepanciasAuditoria(a.id).length > 0" :label="`${discrepanciasAuditoria(a.id).length} discrepancia(s)`" tone="danger" />
              <StatusPill v-if="a.estado === 'completada' && exactitudAuditoria(a.id).pct !== null" :label="`${exactitudAuditoria(a.id).pct}%`" tone="info" />
              <StatusPill :label="ESTADO_AUDITORIA_LABEL[a.estado]" :tone="ESTADO_AUDITORIA_TONE[a.estado]" />
            </div>
          </button>
        </div>
      </template>

      <AuditoriasProgramacionPanel v-else-if="tab === 'programacion'" :tipos="tiposAlcance" :puede-crear="editorBase" @programar="(u, s) => abrirNueva(u, s)" @abrir="(id) => (auditoriaId = id)" />

      <AuditoriasExactitudPanel v-else :tipos="tiposAlcance" @abrir="(id) => (auditoriaId = id)" />
    </div>

    <NuevaAuditoriaModal
      v-if="showNueva"
      :ubicacion-inicial="nuevaUbicacion"
      :sorpresa-inicial="nuevaSorpresa"
      @close="showNueva = false"
      @created="onCreated"
    />
  </div>

  <CompartirAuditoriaModal v-if="compartir" :auditoria="compartir" @close="compartir = null" />
</template>

<script setup>
import { computed, ref } from 'vue'
import { useAuth } from 'src/lib/auth'
import { auditoriaTiposVisibles, canAssign } from 'src/lib/access'
import { bump } from 'src/lib/reactive'
import { selectClass } from 'components/formClasses'
import StatusPill from 'components/StatusPill.vue'
import NuevaAuditoriaModal from 'components/inventario/NuevaAuditoriaModal.vue'
import CompartirAuditoriaModal from 'components/inventario/CompartirAuditoriaModal.vue'
import AuditoriaDetalle from 'components/inventario/AuditoriaDetalle.vue'
import AuditoriasProgramacionPanel from 'components/inventario/AuditoriasProgramacionPanel.vue'
import AuditoriasExactitudPanel from 'components/inventario/AuditoriasExactitudPanel.vue'
import { getUbicacion, listUbicaciones } from 'src/lib/inventario/comunes'
import {
  discrepanciasAuditoria,
  ESTADO_AUDITORIA_LABEL,
  ESTADO_AUDITORIA_TONE,
  exactitudAuditoria,
  getAuditoria,
  listAuditorias,
  listItems,
  programacionAuditorias,
  TIPO_AUDITORIA_LABEL,
} from 'src/lib/inventario/auditorias'

const TABS = [
  { id: 'auditorias', label: 'Auditorías' },
  { id: 'programacion', label: 'Programación' },
  { id: 'exactitud', label: 'Exactitud' },
]
/** @typedef {(typeof TABS)[number]['id']} TabId */

const { user } = useAuth()
// Crear: cada operador audita su dominio; el detalle valida además `canRunAudit` según el tipo de la auditoría.
const editorBase = computed(() => (user.value ? canAssign(user.value.role) : false))

const tab = ref('auditorias')
const auditoriaId = ref(null)
const showNueva = ref(false)
const nuevaUbicacion = ref(undefined)
const nuevaSorpresa = ref(false)
const compartir = ref(null)

const fEstado = ref('')
const fSucursal = ref('')
const fTipo = ref('')
const fAuditor = ref('')

// Alcance por rol: Soporte ve solo auditorías de Sistemas, Mantenimiento solo las suyas; Dirección todas (lib/access.js).
const tiposVisibles = computed(() => (user.value ? auditoriaTiposVisibles(user.value.role) : []))
const tiposAlcance = computed(() => (user.value?.role === 'admin' ? undefined : tiposVisibles.value))
const auditorias = computed(() => listAuditorias().filter((a) => tiposVisibles.value.includes(a.tipo)))
const auditoriaExiste = computed(() => (auditoriaId.value ? Boolean(getAuditoria(auditoriaId.value)) : false))

const sucursalesConAuditoria = computed(() => {
  const ids = new Set(auditorias.value.map((a) => a.ubicacionId))
  return listUbicaciones().filter((u) => ids.has(u.id))
})
const auditores = computed(() => [...new Set(auditorias.value.map((a) => a.auditorNombre).filter((n) => Boolean(n)))].sort((a, b) => a.localeCompare(b, 'es')))

const filtradas = computed(() =>
  auditorias.value.filter(
    (a) =>
      (!fEstado.value || a.estado === fEstado.value) &&
      (!fSucursal.value || a.ubicacionId === fSucursal.value) &&
      (!fTipo.value || a.tipo === fTipo.value) &&
      (!fAuditor.value || (fAuditor.value === '__interna' ? !a.auditorNombre : a.auditorNombre === fAuditor.value)),
  ),
)

const porVerificarN = computed(() => auditorias.value.filter((a) => a.estado === 'por_verificar').length)
const vencidasN = computed(() => programacionAuditorias(tiposAlcance.value).filter((p) => p.vencida || p.programadaVencida).length)

const vencidaProgramada = (a) => {
  if (!a.fechaProgramada || a.estado !== 'en_conteo') return false
  const hoy = new Date()
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()
  return new Date(`${a.fechaProgramada}T00:00:00`).getTime() < hoy0
}

function abrirNueva(ubicacionId, sorpresa = false) {
  nuevaUbicacion.value = ubicacionId
  nuevaSorpresa.value = sorpresa
  showNueva.value = true
}

const onCreated = (a) => {
  showNueva.value = false
  bump()
  tab.value = 'auditorias'
  auditoriaId.value = a.id
  // Con auditor asignado o Gerente de sucursal se ofrece de inmediato compartir la liga de conteo.
  if (a.modalidad !== 'interna') compartir.value = a
}
</script>
