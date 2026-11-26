<template>
  <div>
    <div class="mb-3 flex justify-end gap-2">
      <button
        v-if="editor && equipos.length > 0"
        type="button"
        class="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
        @click="verEtiquetas = true"
      >
        Imprimir etiquetas
      </button>
      <button v-if="puedeCargar" type="button" class="h-9 rounded-lg bg-vz-blue px-3 text-[13px] font-bold text-white hover:bg-primary-hover" @click="abrirModal('new', 'completo')">
        + {{ articuloNuevo }} {{ nombreSingular }}
      </button>
    </div>

    <div class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full min-w-[760px] border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-border bg-bg">
            <th class="px-3 py-2 text-left font-bold text-text-muted">Modelo</th>
            <th class="px-3 py-2 text-left font-bold text-text-muted">N° serie</th>
            <th class="px-3 py-2 text-left font-bold text-text-muted">Ubicación</th>
            <th class="px-3 py-2 text-left font-bold text-text-muted">Usuario asignado</th>
            <th class="px-3 py-2 text-left font-bold text-text-muted">Estado</th>
            <th v-if="!sinDinero" class="px-3 py-2 text-right font-bold text-text-muted">Costo original</th>
            <th v-if="!sinDinero" class="px-3 py-2 text-right font-bold text-text-muted">Valor actual</th>
            <th v-if="editor || verResponsivas" class="px-3 py-2 text-right font-bold text-text-muted">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="equipos.length === 0">
            <td :colspan="sinDinero ? 6 : 8" class="px-3 py-6 text-center text-text-soft">Sin {{ nombreSingular }}s registrad{{ sufijoPlural }} en esta familia todavía.</td>
          </tr>
          <tr
            v-for="e in equipos"
            :key="e.id"
            :class="`border-b border-border last:border-0 even:bg-bg/40 ${e.id === highlightId ? 'bg-vz-blue/10 ring-1 ring-inset ring-vz-blue/40' : ''}`"
          >
            <td class="px-3 py-2 font-semibold text-text">{{ e.modelo || '—' }}</td>
            <td class="px-3 py-2 text-text-muted">{{ e.numeroSerie || '—' }}</td>
            <td class="px-3 py-2 text-text-muted">{{ getUbicacion(e.ubicacionId)?.nombre ?? '—' }}</td>
            <td class="px-3 py-2 text-text-muted">{{ e.usuarioAsignado || '—' }}</td>
            <td class="px-3 py-2">
              <EstadoEquipoBadge :estado="e.estado" />
            </td>
            <td v-if="!sinDinero" class="px-3 py-2 text-right text-text-muted">{{ currency.format(e.costoTotal) }}</td>
            <td v-if="!sinDinero" class="px-3 py-2 text-right font-semibold text-vz-warning">{{ valorActual(e) }}</td>
            <td v-if="editor || verResponsivas" class="px-3 py-2">
              <div class="flex flex-wrap justify-end gap-1.5">
                <button v-if="editor" type="button" class="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-hover" @click="historialEquipo = e">Historial</button>
                <button type="button" class="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-hover" @click="responsivasEquipo = e">Responsivas</button>
                <button v-if="puedeEditarCompra" type="button" class="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-hover" @click="abrirModal(e, 'completo')">Editar</button>
                <button v-else-if="puedeAsignar" type="button" class="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-hover" @click="abrirModal(e, 'asignar')">Asignar</button>
                <button v-if="editor" type="button" class="rounded-md border border-vz-blue/30 bg-vz-blue/10 px-2 py-1 text-[11px] font-semibold text-vz-blue hover:bg-vz-blue/20" @click="qrEquipo = e">Ver QR</button>
                <template v-if="puedeAsignar && e.estado !== 'baja'">
                  <button type="button" class="rounded-md border border-vz-danger/30 bg-vz-danger/10 px-2 py-1 text-[11px] font-semibold text-vz-danger hover:bg-vz-danger/20" @click="handleBaja(e)">Baja</button>
                  <button type="button" class="rounded-md border border-vz-warning/30 bg-vz-warning/10 px-2 py-1 text-[11px] font-semibold text-vz-warning hover:bg-vz-warning/20" @click="bajaPerdidaEquipo = e">
                    Baja por pérdida
                  </button>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <EquipoFormModal
      v-if="modalEquipo"
      :familia-id="familiaId"
      :equipo="modalEquipo === 'new' ? undefined : modalEquipo"
      :registrado-por="user?.displayName"
      :modo="modoModal"
      @close="modalEquipo = null"
      @saved="refresh"
      @responsiva="(r) => (responsivaImprimir = r)"
    />

    <ResponsivasPanel v-if="responsivasEquipo" :equipo="responsivasEquipo" @close="responsivasEquipo = null" />
    <ResponsivaModal v-if="responsivaImprimir" :responsiva="responsivaImprimir" @close="responsivaImprimir = null" />

    <BajaPerdidaModal v-if="bajaPerdidaEquipo" :equipo="bajaPerdidaEquipo" :autorizado-por="user?.displayName" @close="bajaPerdidaEquipo = null" @saved="refresh" />

    <QRCodeModal
      v-if="qrEquipo"
      :url="equipoVerifyUrl(qrEquipo.id)"
      :titulo="qrEquipo.modelo || qrEquipo.numeroSerie || nombreSingular"
      :subtitulo="qrEquipo.numeroSerie ? `N° serie ${qrEquipo.numeroSerie}` : undefined"
      @close="qrEquipo = null"
    />

    <EtiquetasModal v-if="verEtiquetas" :items="etiquetaItems" :document-title="getFamilia(familiaId)?.nombre ?? nombreSingular" @close="verEtiquetas = false" />

    <Teleport to="body">
      <div v-if="historialEquipo" class="fixed inset-0 flex items-center justify-center bg-black/40 px-4 py-8" style="z-index: 5500" @click="historialEquipo = null">
        <div class="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl" @click.stop>
          <h2 class="mb-3 text-[15px] font-extrabold text-text">Historial · {{ historialEquipo.modelo || historialEquipo.numeroSerie }}</h2>
          <div class="flex flex-col gap-2">
            <p v-if="movimientos.length === 0" class="text-[12px] text-text-soft">Sin movimientos registrados.</p>
            <div v-for="m in movimientos" :key="m.id" class="rounded-lg border border-border bg-bg p-2.5 text-[12px]">
              <p class="font-bold text-text">{{ new Date(m.fecha).toLocaleString('es-MX') }} · {{ m.tipo }}</p>
              <p v-if="m.estadoAnterior !== m.estadoNuevo" class="text-text-muted">Estado: {{ m.estadoAnterior ?? '—' }} → {{ m.estadoNuevo ?? '—' }}</p>
              <p v-if="m.usuarioAnterior !== m.usuarioNuevo" class="text-text-muted">Usuario: {{ m.usuarioAnterior ?? '—' }} → {{ m.usuarioNuevo ?? '—' }}</p>
              <p v-if="m.motivo" class="text-text-muted">{{ m.motivo }}</p>
              <p v-if="m.registradoPor" class="text-text-soft">Por: {{ m.registradoPor }}</p>
            </div>
          </div>
          <button type="button" class="mt-4 h-9 w-full rounded-lg border border-border bg-bg text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="historialEquipo = null">Cerrar</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useAuth } from 'src/lib/auth'
import { canAssign, canEditCompra, canLoadStock, canViewResponsivas } from 'src/lib/access'
import { bump } from 'src/lib/reactive'
import { useConfirm } from 'src/composables/useConfirm'
import { useToast } from 'src/composables/useToast'
import EstadoEquipoBadge from 'components/EstadoEquipoBadge.vue'
import EquipoFormModal from './EquipoFormModal.vue'
import BajaPerdidaModal from './BajaPerdidaModal.vue'
import QRCodeModal from './QRCodeModal.vue'
import EtiquetasModal from './EtiquetasModal.vue'
import ResponsivasPanel from './ResponsivasPanel.vue'
import ResponsivaModal from './ResponsivaModal.vue'
import { getFamilia, getUbicacion } from 'src/lib/inventario/comunes'
import { listEquiposPorFamilia, listMovimientos, updateEquipo } from 'src/lib/inventario/sistemas'
import { calcularValorDepreciado } from 'src/lib/inventario/depreciacion'
import { equipoVerifyUrl } from 'src/lib/qr'

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

/**
 * Tabla de equipos por pieza individual (número de serie, ubicación, historial, baja/baja por
 * pérdida) — usada tanto por Inventario de Sistemas como por las familias "serializadas" de
 * Mantenimiento (Herramienta, Equipo), que se dan de alta y de baja exactamente igual.
 */
const props = defineProps({
  familiaId: { type: String, required: true },
  editor: { type: Boolean, required: true },
  highlightId: { type: [String, null], default: null },
  nombreSingular: { type: String, default: 'equipo' },
  /** true para sustantivos femeninos ("herramienta"), ajusta artículos y concordancia. */
  femenino: { type: Boolean, default: false },
  /** Sin costos ni valores (Adquisiciones, Talento): oculta esas columnas y la edición de datos de compra. */
  sinDinero: { type: Boolean, default: false },
})
const emit = defineEmits(['changed'])

const { user } = useAuth()
// Cada operador actúa solo en su dominio (Sistemas: Uriel; Mantenimiento: Gerencia). Dirección en ambos.
// Los datos de compra de un registro existente solo los edita Dirección/Adquisiciones.
const tipoFamilia = computed(() => getFamilia(props.familiaId)?.tipo)
const puedeCargar = computed(() => (user.value ? canLoadStock(user.value.role, tipoFamilia.value) : false))
const puedeAsignar = computed(() => (user.value ? canAssign(user.value.role, tipoFamilia.value) : false))
const puedeEditarCompra = computed(() => (user.value ? canEditCompra(user.value.role) && !props.sinDinero : false))
// Talento (solo lectura) abre el panel de responsivas y ve quién tiene cada equipo, sin ningún botón de escritura.
const verResponsivas = computed(() => (user.value ? canViewResponsivas(user.value.role) : false))
const confirm = useConfirm()
const toast = useToast()
function refresh() {
  bump()
  emit('changed')
}

const modalEquipo = ref(null)
const modoModal = ref('completo')
function abrirModal(equipo, modo) {
  modoModal.value = modo
  modalEquipo.value = equipo
}
const historialEquipo = ref(null)
const responsivasEquipo = ref(null)
const responsivaImprimir = ref(null)
const bajaPerdidaEquipo = ref(null)
const qrEquipo = ref(null)
const verEtiquetas = ref(false)

const equipos = computed(() => listEquiposPorFamilia(props.familiaId))
const movimientos = computed(() => (historialEquipo.value ? listMovimientos(historialEquipo.value.id) : []))
const articulo = computed(() => (props.femenino ? 'la' : 'el'))
const articuloNuevo = computed(() => (props.femenino ? 'Nueva' : 'Nuevo'))
const sufijoPlural = computed(() => (props.femenino ? 'as' : 'os'))
const sufijoDado = computed(() => (props.femenino ? 'a' : 'o'))

const etiquetaItems = computed(() =>
  equipos.value.map((e) => ({
    id: e.id,
    titulo: e.modelo || props.nombreSingular,
    subtitulo: e.numeroSerie,
    url: equipoVerifyUrl(e.id),
  })),
)

function valorActual(e) {
  const fam = getFamilia(e.familiaId)
  return fam ? currency.format(calcularValorDepreciado(e, fam)) : '—'
}

async function handleBaja(equipo) {
  const ok = await confirm({
    message: `¿Dar de baja ${articulo.value} ${props.nombreSingular} "${equipo.modelo || equipo.numeroSerie || equipo.id}"?`,
    danger: true,
    confirmLabel: 'Dar de baja',
  })
  if (!ok) return
  await updateEquipo(equipo.id, { estado: 'baja' }, user.value?.displayName)
  toast(`${props.nombreSingular[0].toUpperCase()}${props.nombreSingular.slice(1)} dad${sufijoDado.value} de baja.`)
  refresh()
}
</script>
