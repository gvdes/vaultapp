<template>
  <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
    <RouterLink :to="RUTAS_COMPRAS.lista" class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-vz-blue hover:underline">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
      Compras Indirectas
    </RouterLink>

    <!-- No encontrada -->
    <div v-if="!req" class="rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
      <h1 class="text-[15px] font-extrabold text-text">No encontramos la requisición</h1>
      <p class="mt-1 text-[13px] text-text-muted">El folio <span class="font-mono font-bold">{{ folio }}</span> no existe o no tienes acceso a verlo.</p>
      <RouterLink :to="RUTAS_COMPRAS.lista" :class="`${btnPrimary} mt-4`">Volver al tablero</RouterLink>
    </div>

    <template v-else>
      <!-- Encabezado -->
      <header class="mb-3 rounded-xl border border-border bg-surface p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="font-mono text-[17px] font-extrabold tracking-tight text-text">{{ req.folio }}</h1>
              <EstadoBadge :estado="req.estado" completa grande />
              <span v-if="req.urgencia === 'urgente'" :class="`rounded-full border px-2.5 py-1 text-[12px] font-bold ${TONE_STYLES.danger}`">Urgente</span>
              <span v-if="req.requiereDireccion" title="El monto rebasa el umbral: Dirección recibe un aviso informativo; la autoriza Finanzas" :class="`rounded-full border px-2.5 py-1 text-[12px] font-bold ${TONE_STYLES.info}`">Aviso a Dirección</span>
            </div>
            <p class="mt-1 text-[13px] text-text">
              <strong>{{ req.solicitanteNombre }}</strong><span v-if="req.area" class="text-text-muted"> · {{ req.area }}</span>
            </p>
            <p class="text-[12px] text-text-muted">{{ ubicacionesTexto(req.ubicaciones) || 'Sin sucursal' }}</p>
            <p v-if="req.paraQuien" class="text-[12px] text-text-muted">Para quién: <span class="font-semibold text-text">{{ req.paraQuien }}</span></p>
          </div>
          <dl class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-3">
            <div><dt class="text-[10.5px] text-text-soft">Creada</dt><dd class="font-semibold text-text">{{ fechaHora(req.createdAt) }}</dd></div>
            <div><dt class="text-[10.5px] text-text-soft">Para cuándo</dt><dd :class="`font-semibold ${vencida ? 'text-vz-danger' : 'text-text'}`">{{ fechaISOTexto(req.fechaRequerida) }}{{ vencida ? ' (vencida)' : '' }}</dd></div>
            <div><dt class="text-[10.5px] text-text-soft">{{ abierta ? 'Tiempo transcurrido' : 'Duración del ciclo' }}</dt><dd class="font-semibold text-text">{{ duracionCorta((abierta ? Date.now() : req.updatedAt) - req.createdAt) }}</dd></div>
            <div v-if="verDinero"><dt class="text-[10.5px] text-text-soft">Monto autorizado</dt><dd class="font-extrabold text-text">{{ req.montoAutorizado ? formatoMoneda(req.montoAutorizado) : '—' }}</dd></div>
            <div v-if="verDinero"><dt class="text-[10.5px] text-text-soft">{{ monto.tipo === 'autorizado' ? 'Proveedor' : MONTO_TIPO_TEXTO[monto.tipo] }}</dt><dd class="font-semibold text-text">{{ monto.tipo === 'autorizado' || !monto.monto ? req.proveedorElegido || '—' : formatoMoneda(monto.monto) }}</dd></div>
            <div><dt class="text-[10.5px] text-text-soft">Última actividad</dt><dd class="font-semibold text-text">{{ fechaHora(ultimaActividad(req)) }}</dd></div>
          </dl>
        </div>

        <!-- Progreso -->
        <ol class="mt-4 flex items-center gap-1 overflow-x-auto pb-1" aria-label="Avance de la requisición">
          <template v-for="(e, i) in ESTADOS_FLUJO" :key="e">
            <li class="flex shrink-0 items-center gap-1.5" :aria-current="e === pasoActual ? 'step' : undefined">
              <span
                :class="`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold ${i <= indicePaso ? 'text-white' : 'bg-bg text-text-soft ring-1 ring-border'}`"
                :style="i <= indicePaso ? { background: ESTADOS[e].color } : {}"
              >{{ i + 1 }}</span>
              <span :class="`text-[11px] font-bold ${e === pasoActual ? 'text-text' : 'text-text-soft'}`">{{ ESTADOS[e].corta }}</span>
            </li>
            <span v-if="i < ESTADOS_FLUJO.length - 1" :class="`mx-1 h-px min-w-4 flex-1 ${i < indicePaso ? 'bg-vz-success' : 'bg-border'}`" aria-hidden="true" />
          </template>
        </ol>
        <p v-if="ESTADOS[req.estado].lateral" class="mt-1 text-[11.5px] text-text-muted">
          <span class="font-bold">{{ ESTADOS[req.estado].label }}</span>: {{ ESTADOS[req.estado].descripcion }}
          <template v-if="req.estado === 'en_espera' && previo"> Se reanuda en «{{ ESTADOS[previo].corta }}».</template>
          <template v-if="motivoLateral"> Motivo: {{ motivoLateral }}</template>
        </p>
      </header>

      <ReqAccionesBar :folio="req.folio" class="mb-4" @tab="irTab" />

      <!-- Pestañas -->
      <div class="mb-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Secciones de la requisición">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="tab === t.id"
          :class="`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2 text-[13px] font-bold transition-colors ${tab === t.id ? 'border-vz-blue text-vz-blue' : 'border-transparent text-text-muted hover:text-text'}`"
          @click="irTab(t.id)"
        >
          {{ t.label }}
          <span v-if="t.badge" class="rounded-full bg-bg px-1.5 text-[10.5px] font-extrabold text-text-muted ring-1 ring-border">{{ t.badge }}</span>
        </button>
      </div>

      <section role="tabpanel" :aria-label="tab">
        <ReqResumen v-if="tab === 'resumen'" :folio="req.folio" />
        <ReqCotizaciones v-else-if="tab === 'cotizaciones'" :folio="req.folio" @tab="irTab" />
        <ReqAutorizacion v-else-if="tab === 'autorizacion'" :folio="req.folio" />
        <ReqDinero v-else-if="tab === 'dinero'" :folio="req.folio" />
        <ReqCompra v-else-if="tab === 'compra'" :folio="req.folio" />
        <ReqEntrega v-else-if="tab === 'entrega'" :folio="req.folio" />
        <ReqHistorial v-else-if="tab === 'historial'" :folio="req.folio" />
        <CorreosPanel v-else-if="tab === 'correos' && puedeVerCorreos" :folio="req.folio" />
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  ESTADOS,
  ESTADOS_FLUJO,
  RUTAS_COMPRAS,
  esAbierta,
  estadoPrevioAEspera,
  formatoMoneda,
  getHistorial,
  getRequisicion,
  listCotizaciones,
  listMovimientosDinero,
  listRecepciones,
} from 'src/lib/compras'
import { todayLocalDateString } from 'src/lib/dateUtils'
import { TONE_STYLES } from 'components/statusMaps'
import EstadoBadge from 'components/compras/EstadoBadge.vue'
import ReqAccionesBar from 'components/compras/ReqAccionesBar.vue'
import ReqResumen from 'components/compras/ReqResumen.vue'
import ReqCotizaciones from 'components/compras/ReqCotizaciones.vue'
import ReqAutorizacion from 'components/compras/ReqAutorizacion.vue'
import ReqDinero from 'components/compras/ReqDinero.vue'
import ReqCompra from 'components/compras/ReqCompra.vue'
import ReqEntrega from 'components/compras/ReqEntrega.vue'
import ReqHistorial from 'components/compras/ReqHistorial.vue'
import CorreosPanel from 'components/compras/CorreosPanel.vue'
import { useAcceso } from 'components/compras/useAcceso'
import { requisicionVisible } from 'src/lib/vistaRol'
import { MONTO_TIPO_TEXTO, btnPrimary, duracionCorta, fechaHora, fechaISOTexto, montoReferencia, ubicacionesTexto, ultimaActividad } from 'components/compras/util'

const route = useRoute()
const { puedeVerCorreos, pestanas, verDinero, role, nombre } = useAcceso()

const folio = computed(() => decodeURIComponent(String(route.params.folio ?? '')))
// Un rol que no ve esta requisición (custodio: ajena a su inventario; Tesorería: sin dinero) la recibe como no encontrada.
const req = computed(() => {
  const r = getRequisicion(folio.value)
  return r && role.value && requisicionVisible(role.value, r, nombre.value) ? r : undefined
})
const abierta = computed(() => !!req.value && esAbierta(req.value.estado))
const monto = computed(() => (req.value ? montoReferencia(req.value) : { monto: 0, tipo: 'ninguno' }))
const vencida = computed(() => !!req.value && abierta.value && !!req.value.fechaRequerida && req.value.fechaRequerida < todayLocalDateString())

// ---- Progreso -----------------------------------------------------------------------------------------------------------
const previo = computed(() => (req.value?.estado === 'en_espera' ? estadoPrevioAEspera(folio.value) : undefined))
const pasoActual = computed(() => {
  const e = req.value?.estado
  if (!e) return undefined
  if (e === 'en_espera') return previo.value
  if (e === 'rechazada') return 'en_autorizacion'
  if (e === 'cancelada') return undefined
  return e
})
const indicePaso = computed(() => (pasoActual.value ? ESTADOS_FLUJO.indexOf(pasoActual.value) : -1))
const motivoLateral = computed(() => {
  const e = req.value?.estado
  if (e !== 'en_espera' && e !== 'rechazada' && e !== 'cancelada') return ''
  return getHistorial(folio.value).filter((h) => h.aEstado === e).pop()?.comentario ?? ''
})

// ---- Pestañas -----------------------------------------------------------------------------------------------------------
const tabs = computed(() => {
  const f = folio.value
  const t = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'cotizaciones', label: 'Cotizaciones', badge: listCotizaciones(f).length || undefined },
    { id: 'autorizacion', label: 'Autorización' },
    { id: 'dinero', label: 'Dinero', badge: listMovimientosDinero(f).length || undefined },
    { id: 'compra', label: 'Compra' },
    { id: 'entrega', label: 'Entrega', badge: listRecepciones({ folio: f, estado: 'pendiente' }).length || undefined },
    { id: 'historial', label: 'Historial' },
  ]
  if (puedeVerCorreos.value) t.push({ id: 'correos', label: 'Correos' })
  // Qué pestañas ve cada rol (lib/access.js → pestanasRequisicion): el custodio solo Resumen, Entrega e Historial.
  return t.filter((x) => pestanas.value.includes(x.id))
})
const IDS = ['resumen', 'cotizaciones', 'autorizacion', 'dinero', 'compra', 'entrega', 'historial', 'correos']
const q = typeof route.query.tab === 'string' ? route.query.tab : ''
const tab = ref(IDS.includes(q) ? q : 'resumen')
watch(
  tabs,
  (t) => {
    if (!t.some((x) => x.id === tab.value)) tab.value = 'resumen'
  },
  { immediate: true },
)
function irTab(id) {
  tab.value = id
}
// Al cambiar de folio (misma pantalla) se vuelve al resumen.
watch(folio, () => (tab.value = 'resumen'))
</script>
