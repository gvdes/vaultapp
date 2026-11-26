<template>
  <RouterLink
    :to="RUTAS_COMPRAS.requisicion(req.folio)"
    class="group block rounded-xl border border-border bg-surface p-3 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-vz-blue/40 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-vz-blue"
  >
    <div class="flex items-start justify-between gap-2">
      <span class="font-mono text-[11px] font-bold tracking-tight text-text-muted">{{ req.folio }}</span>
      <span v-if="req.urgencia === 'urgente'" class="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-vz-danger" title="Urgente">
        <svg viewBox="0 0 24 24" fill="currentColor" class="h-3 w-3"><path d="M5 3v18h2v-7h11l-2.5-4.5L18 5H7V3H5z" /></svg>
        Urgente
      </span>
    </div>
    <p class="mt-1 truncate text-[13px] font-bold text-text">{{ req.solicitanteNombre }}</p>
    <p v-if="req.area" class="truncate text-[11.5px] text-text-muted">{{ req.area }}</p>
    <p class="mt-1.5 line-clamp-2 text-[11.5px] text-text-soft" :title="resumen">{{ resumen }}</p>
    <p class="mt-1 truncate text-[11px] text-text-soft" :title="sucursales">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="mr-0.5 inline h-3 w-3 align-[-2px]">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
      {{ sucursales || 'Sin sucursal' }}
    </p>
    <div class="mt-2 flex items-end justify-between gap-2">
      <div class="min-w-0">
        <p class="text-[11px] text-text-soft">{{ nPartidas }} partida{{ nPartidas === 1 ? '' : 's' }}</p>
        <p v-if="verDinero && monto.monto > 0" class="text-[13px] font-extrabold text-text" :title="MONTO_TIPO_TEXTO[monto.tipo]">{{ formatoMonedaCorta(monto.monto) }}</p>
        <p v-else-if="verDinero" class="text-[12px] font-semibold text-text-soft">Sin monto</p>
      </div>
      <span class="shrink-0 rounded-md bg-bg px-1.5 py-0.5 text-[10.5px] font-bold text-text-muted" :title="`Creada ${fechaHora(req.createdAt)}`">
        {{ abierta ? `${dias} d abierta` : `Cerrada · ${dias} d` }}
      </span>
    </div>
    <AlertaChips v-if="alertas.length" :alertas="alertas" class="mt-2" />
  </RouterLink>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { RUTAS_COMPRAS, esAbierta, listPartidas, resumenPartidas } from 'src/lib/compras'
import AlertaChips from './AlertaChips.vue'
import { useAcceso } from './useAcceso'
import { MONTO_TIPO_TEXTO, alertasDe, diasDesde, fechaHora, formatoMonedaCorta, montoReferencia, ubicacionesTexto } from './util'

const props = defineProps({ req: { type: Object, required: true } })
const { verDinero } = useAcceso()
const nPartidas = computed(() => listPartidas(props.req.folio).length)
const resumen = computed(() => resumenPartidas(props.req.folio, 2))
const sucursales = computed(() => ubicacionesTexto(props.req.ubicaciones))
const monto = computed(() => montoReferencia(props.req))
const alertas = computed(() => alertasDe(props.req, verDinero.value))
const abierta = computed(() => esAbierta(props.req.estado))
const dias = computed(() => diasDesde(props.req.createdAt))
</script>
