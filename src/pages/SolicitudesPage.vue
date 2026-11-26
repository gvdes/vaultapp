<template>
  <div class="mx-auto flex h-full max-w-6xl flex-col px-4 py-6 sm:px-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-[15px] font-extrabold text-text">Solicitudes de equipo y reparación</h1>
      <div class="flex items-center gap-2">
        <button
          v-if="editor"
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
          @click="copiarLink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          Copiar link para compartir
        </button>
        <button type="button" class="h-9 rounded-lg bg-vz-blue px-3 text-[13px] font-bold text-white hover:bg-primary-hover" @click="showForm = true">
          + Nueva solicitud
        </button>
      </div>
    </div>

    <div class="mb-4 flex flex-wrap gap-2">
      <div class="flex gap-1.5">
        <button
          v-for="t in tiposFiltro"
          :key="t.value"
          type="button"
          :class="`h-8 rounded-full border px-3 text-[12px] font-bold transition-colors ${
            filtroTipo === t.value ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-surface text-text-muted'
          }`"
          @click="filtroTipo = t.value"
        >
          {{ t.label }}
        </button>
      </div>
      <select v-model="filtroEstado" class="h-8 rounded-full border border-border bg-surface px-3 text-[12px] font-semibold text-text-muted">
        <option v-for="e in ESTADOS" :key="e.value" :value="e.value">{{ e.label }}</option>
      </select>
    </div>

    <div class="flex-1 overflow-y-auto pb-8">
      <div class="overflow-x-auto rounded-xl border border-border">
        <table class="w-full min-w-[820px] border-collapse text-[13px]">
          <thead>
            <tr class="border-b border-border bg-bg">
              <th class="px-3 py-2 text-left font-bold text-text-muted">Fecha</th>
              <th class="px-3 py-2 text-left font-bold text-text-muted">Descripción</th>
              <th class="px-3 py-2 text-left font-bold text-text-muted">Clasificación</th>
              <th class="px-3 py-2 text-left font-bold text-text-muted">Solicitante</th>
              <th class="px-3 py-2 text-left font-bold text-text-muted">Área</th>
              <th class="px-3 py-2 text-left font-bold text-text-muted">Estado</th>
              <th class="px-3 py-2 text-right font-bold text-text-muted">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="solicitudes.length === 0">
              <td colspan="7" class="px-3 py-6 text-center text-text-soft">No hay solicitudes con estos filtros.</td>
            </tr>
            <tr v-for="s in solicitudes" :key="s.id" class="border-b border-border last:border-0 even:bg-bg/40">
              <td class="px-3 py-2 text-text-muted">{{ new Date(s.fechaSolicitud).toLocaleDateString('es-MX') }}</td>
              <td class="px-3 py-2 font-semibold text-text">{{ s.descripcion }}</td>
              <td class="px-3 py-2 text-text-muted">{{ getFamilia(s.familiaId)?.nombre ?? '—' }}</td>
              <td class="px-3 py-2 text-text-muted">{{ s.solicitanteNombre }}</td>
              <td class="px-3 py-2 text-text-muted">{{ getUbicacion(s.ubicacionId)?.nombre ?? '—' }}</td>
              <td class="px-3 py-2">
                <EstadoSolicitudBadge :estado="s.estado" />
                <span v-if="s.estado === 'pendiente_compra' && s.fechaEstimada" class="ml-1.5 text-[11px] text-text-soft">est. {{ s.fechaEstimada }}</span>
              </td>
              <td class="px-3 py-2">
                <div class="flex justify-end gap-1.5">
                  <button
                    v-if="puedeResolver(s) && (s.estado === 'pendiente' || s.estado === 'pendiente_compra')"
                    type="button"
                    class="rounded-md border border-vz-blue/30 bg-vz-blue/10 px-2 py-1 text-[11px] font-semibold text-vz-blue hover:bg-vz-blue/20"
                    @click="resolviendo = s"
                  >
                    Resolver
                  </button>
                  <button
                    v-if="s.estado === 'pendiente' && (puedeResolver(s) || s.creadoPor === user?.id)"
                    type="button"
                    class="rounded-md border border-vz-danger/30 bg-vz-danger/10 px-2 py-1 text-[11px] font-semibold text-vz-danger hover:bg-vz-danger/20"
                    @click="handleCancelar(s)"
                  >
                    Cancelar
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <SolicitudFormModal v-if="showForm && user" :user="user" @close="showForm = false" @saved="refresh" />
    <ResolverSolicitudModal v-if="resolviendo" :solicitud="resolviendo" :atendido-por="user?.displayName" @close="resolviendo = null" @saved="refresh" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useAuth } from 'src/lib/auth'
import { canAssign, isEditor, solicitudesTiposVisibles } from 'src/lib/access'
import { solicitudesVisibles } from 'src/lib/vistaRol'
import { appUrl } from 'src/lib/qr'
import { bump } from 'src/lib/reactive'
import { useConfirm } from 'src/composables/useConfirm'
import { useToast } from 'src/composables/useToast'
import EstadoSolicitudBadge from 'components/EstadoSolicitudBadge.vue'
import SolicitudFormModal from 'components/inventario/SolicitudFormModal.vue'
import ResolverSolicitudModal from 'components/inventario/ResolverSolicitudModal.vue'
import { getFamilia, getUbicacion } from 'src/lib/inventario/comunes'
import { cancelarSolicitud } from 'src/lib/inventario/solicitudes'

const TIPOS = [
  { value: 'todos', label: 'Todos' },
  { value: 'sistemas', label: 'Sistemas' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
]
const ESTADOS = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'pendiente_compra', label: 'Pendiente de compra' },
  { value: 'asignado', label: 'Asignado' },
  { value: 'completada', label: 'Completada' },
  { value: 'cancelada', label: 'Cancelada' },
]

const { user } = useAuth()
const confirm = useConfirm()
const toast = useToast()
const editor = computed(() => (user.value ? isEditor(user.value.role) : false))
// Resuelve (asigna del stock o marca compra pendiente) el operador del dominio de la solicitud (TI: Uriel; Mantenimiento: Gerencia) y Dirección.
// Adquisiciones y los demás roles ven la cola y las compras pendientes.
const puedeResolver = (s) => (user.value ? canAssign(user.value.role, s.tipo) : false)

const refresh = () => bump()

const filtroTipo = ref('todos')
const filtroEstado = ref('todos')
const showForm = ref(false)
const resolviendo = ref(null)

// Alcance por rol: cada operador ve la cola de su dominio, Adquisiciones y Dirección ambos, el solicitante solo lo suyo (lib/access.js).
const tiposFiltro = computed(() => {
  const visibles = user.value ? solicitudesTiposVisibles(user.value.role) : []
  return TIPOS.filter((t) => t.value === 'todos' ? visibles.length > 1 : visibles.includes(t.value))
})
const solicitudes = computed(() =>
  (user.value ? solicitudesVisibles(user.value.role, user.value.id) : []).filter(
    (s) => (filtroTipo.value === 'todos' || s.tipo === filtroTipo.value) && (filtroEstado.value === 'todos' || s.estado === filtroEstado.value),
  ),
)

const copiarLink = () => {
  navigator.clipboard.writeText(appUrl('/solicitar'))
  toast('Link copiado al portapapeles.')
}

const handleCancelar = async (s) => {
  const ok = await confirm({ message: `¿Cancelar la solicitud "${s.descripcion}"?`, danger: true, confirmLabel: 'Cancelar solicitud' })
  if (!ok) return
  await cancelarSolicitud(s.id)
  toast('Solicitud cancelada.')
  refresh()
}
</script>
