<template>
  <div>
    <div v-if="mostrarFiltro" class="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por inventario">
      <button
        v-for="o in opcionesFiltro"
        :key="o.id"
        type="button"
        :class="`rounded-full border px-2.5 py-1 text-[11.5px] font-bold ${filtro === o.id ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-surface text-text-muted hover:bg-surface-hover'}`"
        @click="filtro = o.id"
      >
        {{ o.label }} <span class="ml-0.5 text-text-soft">{{ o.n }}</span>
      </button>
    </div>

    <div v-if="pendientes.length === 0" class="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center">
      <p class="text-[13px] font-bold text-text">No hay recepciones pendientes</p>
      <p class="mt-1 text-[12px] text-text-soft">Cuando Adquisiciones registre una compra de {{ textoDominio }}, aparecerá aquí con todo precargado.</p>
    </div>

    <ul v-else class="flex flex-col gap-2.5">
      <li v-for="r in pendientes" :key="r.id" class="rounded-xl border border-border bg-surface p-3.5">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[14px] font-extrabold text-text">{{ r.cantidad }} × {{ r.datos.producto }}</p>
            <p class="text-[11.5px] text-text-muted">
              {{ r.datos.categoria }}
              <span :class="`ml-1.5 rounded-full border px-1.5 py-px text-[10px] font-bold ${TONE_STYLES[r.destino === 'ti' ? 'info' : 'warning']}`">{{ r.destino === 'ti' ? 'TI' : 'Mantenimiento' }}</span>
            </p>
          </div>
          <button v-if="puedeConfirmar(r)" type="button" :class="btnPrimary" @click="confirmando = r.id">Confirmar recepción</button>
          <span v-else class="rounded-md bg-bg px-2 py-1 text-[11px] font-semibold text-text-soft">Solo lectura</span>
        </div>
        <dl class="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-4">
          <div><dt class="text-[10.5px] text-text-soft">Folio</dt><dd><RouterLink :to="RUTAS_COMPRAS.requisicion(r.folio)" class="font-mono font-bold text-vz-blue hover:underline">{{ r.folio }}</RouterLink></dd></div>
          <div><dt class="text-[10.5px] text-text-soft">Proveedor</dt><dd class="truncate font-semibold text-text">{{ r.datos.proveedor || '—' }}</dd></div>
          <div><dt class="text-[10.5px] text-text-soft">Factura / ticket</dt><dd class="font-semibold text-text">{{ r.datos.numeroFactura || (r.datos.ticketUrl ? 'Ticket adjunto' : '—') }}</dd></div>
          <div><dt class="text-[10.5px] text-text-soft">Costo unit. real</dt><dd class="font-semibold text-text">{{ formatoMoneda(r.datos.costoUnitarioReal) }}</dd></div>
          <div><dt class="text-[10.5px] text-text-soft">Fecha de compra</dt><dd class="font-semibold text-text">{{ fechaISOTexto(r.datos.fechaCompra) }}</dd></div>
          <div><dt class="text-[10.5px] text-text-soft">Para quién</dt><dd class="truncate font-semibold text-text">{{ r.datos.paraQuien || '—' }}</dd></div>
          <div class="col-span-2"><dt class="text-[10.5px] text-text-soft">Solicitó</dt><dd class="truncate font-semibold text-text">{{ r.datos.solicitante }}{{ r.datos.area ? ` · ${r.datos.area}` : '' }}</dd></div>
        </dl>
      </li>
    </ul>

    <!-- Confirmadas recientemente -->
    <div v-if="recientes.length > 0" class="mt-5">
      <button type="button" class="flex items-center gap-1.5 text-[12.5px] font-bold text-text-muted hover:text-text" :aria-expanded="verRecientes" @click="verRecientes = !verRecientes">
        <span aria-hidden="true">{{ verRecientes ? '▾' : '▸' }}</span> Confirmadas recientemente ({{ recientes.length }})
      </button>
      <ul v-if="verRecientes" class="mt-2 flex flex-col gap-1.5">
        <li v-for="r in recientes" :key="r.id" class="rounded-lg border border-border bg-bg px-3 py-2 text-[12px]">
          <p class="font-semibold text-text">{{ r.cantidad }} × {{ r.datos.producto }} <span class="font-normal text-text-soft">· {{ r.folio }}</span></p>
          <p class="text-text-muted">Confirmó {{ r.confirmadoPor || '—' }} el {{ fechaCorta(r.fechaConfirmacion) }}</p>
          <p class="mt-0.5 flex flex-wrap gap-x-3">
            <RouterLink v-for="l in enlacesRecepcion(r)" :key="l.to" :to="l.to" class="text-[11.5px] font-semibold text-vz-blue hover:underline">{{ l.label }}</RouterLink>
          </p>
        </li>
      </ul>
    </div>

    <ConfirmarRecepcionModal v-if="confirmando" :recepcion-id="confirmando" @close="confirmando = ''" @confirmed="alConfirmar" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { RUTAS_COMPRAS, formatoMoneda, listRecepciones, recepcionesPendientes } from 'src/lib/compras'
import { canConfirmRecepcion } from 'src/lib/access'
import { useAuth } from 'src/lib/auth'
import { bump } from 'src/lib/reactive'
import { TONE_STYLES } from 'components/statusMaps'
import ConfirmarRecepcionModal from 'components/compras/ConfirmarRecepcionModal.vue'
import { enlacesRecepcion } from 'components/compras/recepcionEnlaces'
import { btnPrimary, fechaCorta, fechaISOTexto } from 'components/compras/util'

/**
 * Recepciones pendientes de compras para el custodio. `destino` fija el dominio (Soporte → 'ti', Mantenimiento → 'mantenimiento');
 * sin `destino` se deriva del rol (Dirección ve ambos y puede filtrar).
 */
const props = defineProps({ destino: String })
const emit = defineEmits(['changed'])

const { user } = useAuth()
const rol = computed(() => user.value?.role)
const destinoEfectivo = computed(() => props.destino ?? (rol.value === 'capturista' ? 'ti' : rol.value === 'mantenimiento' ? 'mantenimiento' : undefined))

const filtro = ref('todos')
const mostrarFiltro = computed(() => !destinoEfectivo.value)
const todasPendientes = computed(() => recepcionesPendientes(destinoEfectivo.value))
const pendientes = computed(() => (mostrarFiltro.value && filtro.value !== 'todos' ? todasPendientes.value.filter((r) => r.destino === filtro.value) : todasPendientes.value))
const opcionesFiltro = computed(() => [
  { id: 'todos', label: 'Todas', n: todasPendientes.value.length },
  { id: 'ti', label: 'TI', n: todasPendientes.value.filter((r) => r.destino === 'ti').length },
  { id: 'mantenimiento', label: 'Mantenimiento', n: todasPendientes.value.filter((r) => r.destino === 'mantenimiento').length },
])
const textoDominio = computed(() => (destinoEfectivo.value === 'ti' ? 'tecnología' : destinoEfectivo.value === 'mantenimiento' ? 'mantenimiento' : 'tecnología o mantenimiento'))

const recientes = computed(() =>
  listRecepciones({ estado: 'confirmada', destino: destinoEfectivo.value })
    .sort((a, b) => (b.fechaConfirmacion ?? 0) - (a.fechaConfirmacion ?? 0))
    .slice(0, 8),
)
const verRecientes = ref(false)
const confirmando = ref('')

const puedeConfirmar = (r) => !!rol.value && canConfirmRecepcion(rol.value, r.destino)

function alConfirmar() {
  bump()
  emit('changed')
}
</script>
