<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-[12px] text-text-muted">
        Reportes sobre {{ reqs.length }} {{ reqs.length === 1 ? 'requisición' : 'requisiciones' }} (respetan los filtros de la pestaña Requisiciones). Los montos usan lo comprado cuando ya hay compra; si no, lo autorizado o cotizado.
      </p>
      <button type="button" :class="btn" @click="exportar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
        Exportar Excel
      </button>
    </div>

    <div v-if="reqs.length === 0" class="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-[13px] text-text-soft">No hay datos para reportar con estos filtros.</div>

    <template v-else>
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Monto por área" filename="compras-por-area">
          <Bar v-if="areas.length" :data="areaData" :options="barHorizontal" />
          <p v-else class="py-10 text-center text-[12.5px] text-text-soft">Sin datos.</p>
        </ChartCard>
        <ChartCard title="Monto por categoría" filename="compras-por-categoria">
          <Doughnut v-if="categorias.some((c) => c.monto > 0)" :data="categoriaData" :options="doughnutOpts" />
          <p v-else class="py-10 text-center text-[12.5px] text-text-soft">Aún no hay montos por categoría.</p>
        </ChartCard>
        <ChartCard title="Tiempo promedio en cada etapa (días)" filename="compras-tiempos-etapa">
          <Bar v-if="etapas.length" :data="etapaData" :options="barDias" />
          <p v-else class="py-10 text-center text-[12.5px] text-text-soft">Todavía no hay etapas terminadas para promediar.</p>
        </ChartCard>
        <div class="rounded-xl border border-border bg-surface p-4">
          <h3 class="mb-2 text-[13px] font-bold text-text">Por área</h3>
          <div class="max-h-64 overflow-auto">
            <table class="w-full text-[12.5px]">
              <thead>
                <tr class="border-b border-border text-left text-text-muted">
                  <th class="py-1.5 pr-2 font-bold">Área</th>
                  <th class="px-2 py-1.5 text-right font-bold">Req.</th>
                  <th class="px-2 py-1.5 text-right font-bold">Abiertas</th>
                  <th class="py-1.5 pl-2 text-right font-bold">Monto</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in areas" :key="a.area" class="border-b border-border last:border-0">
                  <td class="py-1.5 pr-2 text-text">{{ a.area }}</td>
                  <td class="px-2 py-1.5 text-right text-text-muted">{{ a.requisiciones }}</td>
                  <td class="px-2 py-1.5 text-right text-text-muted">{{ a.abiertas }}</td>
                  <td class="py-1.5 pl-2 text-right font-semibold text-text">{{ formatoMoneda(a.monto) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Proveedores -->
      <div class="rounded-xl border border-border bg-surface p-4">
        <h3 class="text-[13px] font-bold text-text">Por proveedor · comparativo de precios</h3>
        <p class="mb-2 text-[11.5px] text-text-soft">El sobreprecio promedio compara cada cotización completa contra la más barata de su requisición.</p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-[12.5px]">
            <thead>
              <tr class="border-b border-border text-left text-text-muted">
                <th class="py-1.5 pr-2 font-bold">Proveedor</th>
                <th class="px-2 py-1.5 text-right font-bold">Cotizaciones</th>
                <th class="px-2 py-1.5 text-right font-bold">Más barato</th>
                <th class="px-2 py-1.5 text-right font-bold">Elegido</th>
                <th class="px-2 py-1.5 text-right font-bold">Sobreprecio prom.</th>
                <th class="px-2 py-1.5 text-right font-bold">Entrega prom.</th>
                <th class="py-1.5 pl-2 text-right font-bold">Monto elegido</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="proveedores.length === 0"><td colspan="7" class="py-6 text-center text-text-soft">Aún no hay cotizaciones.</td></tr>
              <tr v-for="p in proveedores" :key="p.proveedor" class="border-b border-border last:border-0">
                <td class="py-1.5 pr-2 font-semibold text-text">{{ p.proveedor }}</td>
                <td class="px-2 py-1.5 text-right text-text-muted">{{ p.cotizaciones }}</td>
                <td class="px-2 py-1.5 text-right text-text-muted">{{ p.masBarato }}</td>
                <td class="px-2 py-1.5 text-right text-text-muted">{{ p.elegido }}</td>
                <td :class="`px-2 py-1.5 text-right font-semibold ${p.sobreprecioPct !== undefined && p.sobreprecioPct > 0.5 ? 'text-vz-warning' : 'text-vz-success'}`">
                  {{ p.sobreprecioPct !== undefined ? `${p.sobreprecioPct.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %` : '—' }}
                </td>
                <td class="px-2 py-1.5 text-right text-text-muted">{{ p.entregaPromedioDias !== undefined ? diasTexto(p.entregaPromedioDias) : '—' }}</td>
                <td class="py-1.5 pl-2 text-right font-semibold text-text">{{ formatoMoneda(p.montoElegido) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Ahorro -->
      <div class="rounded-xl border border-border bg-surface p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="text-[13px] font-bold text-text">Ahorro por cotización</h3>
          <p class="text-[12.5px] font-extrabold text-vz-success">{{ formatoMoneda(ahorroTotal) }} en total</p>
        </div>
        <p class="mb-2 text-[11.5px] text-text-soft">Diferencia entre la cotización más cara y la elegida, en requisiciones con dos o más cotizaciones completas.</p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[620px] text-[12.5px]">
            <thead>
              <tr class="border-b border-border text-left text-text-muted">
                <th class="py-1.5 pr-2 font-bold">Folio</th>
                <th class="px-2 py-1.5 font-bold">Proveedor elegido</th>
                <th class="px-2 py-1.5 text-right font-bold">Elegido</th>
                <th class="px-2 py-1.5 text-right font-bold">Más alta</th>
                <th class="px-2 py-1.5 text-right font-bold">Ahorro</th>
                <th class="py-1.5 pl-2 font-bold">Vs. proveedor sugerido</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="ahorros.length === 0"><td colspan="6" class="py-6 text-center text-text-soft">Aún no hay requisiciones con cotización elegida y comparativo.</td></tr>
              <tr v-for="a in ahorros" :key="a.folio" class="border-b border-border last:border-0">
                <td class="py-1.5 pr-2 font-mono text-[11.5px] font-bold"><RouterLink :to="RUTAS_COMPRAS.requisicion(a.folio)" class="text-vz-blue hover:underline">{{ a.folio }}</RouterLink></td>
                <td class="px-2 py-1.5 text-text">{{ a.proveedor }}</td>
                <td class="px-2 py-1.5 text-right text-text-muted">{{ formatoMoneda(a.elegido) }}</td>
                <td class="px-2 py-1.5 text-right text-text-muted">{{ formatoMoneda(a.masAlto) }}</td>
                <td class="px-2 py-1.5 text-right font-bold text-vz-success">{{ formatoMoneda(a.ahorro) }}</td>
                <td class="py-1.5 pl-2 text-text-muted">
                  <template v-if="a.sugerido">{{ a.sugerido.proveedor }}: {{ a.sugerido.diferencia >= 0 ? 'se ahorró' : 'costó' }} {{ formatoMoneda(Math.abs(a.sugerido.diferencia)) }}</template>
                  <template v-else>—</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sin movimiento -->
      <div :class="`rounded-xl border p-4 ${estancadas.length ? 'border-vz-warning/30 bg-vz-warning/5' : 'border-border bg-surface'}`">
        <h3 class="mb-2 text-[13px] font-bold text-text">Requisiciones sin movimiento por más de 3 días</h3>
        <p v-if="estancadas.length === 0" class="text-[12.5px] text-text-soft">Nada estancado: todas las requisiciones abiertas tuvieron movimiento en los últimos 3 días.</p>
        <ul v-else class="flex flex-col gap-1.5">
          <li v-for="x in estancadas" :key="x.req.folio">
            <RouterLink :to="RUTAS_COMPRAS.requisicion(x.req.folio)" class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] hover:bg-surface-hover">
              <span class="font-mono text-[11.5px] font-bold text-vz-blue">{{ x.req.folio }}</span>
              <EstadoBadge :estado="x.req.estado" />
              <span class="text-text-muted">{{ x.req.solicitanteNombre }}</span>
              <span class="ml-auto font-bold text-vz-warning">{{ x.dias }} días</span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Bar, Doughnut } from 'vue-chartjs'
import { RUTAS_COMPRAS, formatoMoneda } from 'src/lib/compras'
import ChartCard from 'components/ChartCard.vue'
import EstadoBadge from './EstadoBadge.vue'
import { ahorrosPorRequisicion, reportePorArea, reportePorCategoria, reportePorEtapa, reportePorProveedor, sinMovimiento } from './reportes'
import { exportarComprasExcel } from './exportarCompras'
import { useChartTheme } from './useChartTheme'
import { btn, diasTexto, formatoMonedaCorta } from './util'

const props = defineProps({ reqs: { type: Array, required: true } })

const PALETA = ['#1F5FAE', '#0FA391', '#C8A24B', '#6D28D9', '#B0413F', '#0E7490', '#E3A517', '#5B7284']

const areas = computed(() => reportePorArea(props.reqs))
const categorias = computed(() => reportePorCategoria(props.reqs))
const proveedores = computed(() => reportePorProveedor(props.reqs))
const etapas = computed(() => reportePorEtapa(props.reqs))
const ahorros = computed(() => ahorrosPorRequisicion(props.reqs))
const ahorroTotal = computed(() => ahorros.value.reduce((s, a) => s + a.ahorro, 0))
const estancadas = computed(() => sinMovimiento(props.reqs))

const { barOptions, doughnutOptions } = useChartTheme()
const barHorizontal = computed(() => barOptions({ horizontal: true, fmt: formatoMonedaCorta }))
const barDias = computed(() => barOptions({ fmt: (n) => `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} d` }))
const doughnutOpts = computed(() => doughnutOptions(formatoMonedaCorta))

const areaData = computed(() => {
  const top = areas.value.slice(0, 10)
  return { labels: top.map((a) => a.area), datasets: [{ label: 'Monto', data: top.map((a) => a.monto), backgroundColor: '#1F5FAE', borderRadius: 4 }] }
})
const categoriaData = computed(() => {
  const cs = categorias.value.filter((c) => c.monto > 0)
  return { labels: cs.map((c) => c.categoria), datasets: [{ data: cs.map((c) => c.monto), backgroundColor: cs.map((_, i) => PALETA[i % PALETA.length]), borderWidth: 0 }] }
})
const etapaData = computed(() => ({
  labels: etapas.value.map((e) => e.label),
  datasets: [{ label: 'Promedio', data: etapas.value.map((e) => Math.round((e.promedioMs / 86400000) * 100) / 100), backgroundColor: '#0FA391', borderRadius: 4 }],
}))

function exportar() {
  exportarComprasExcel(props.reqs)
}
</script>
