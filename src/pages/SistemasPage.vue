<template>
  <div class="mx-auto flex h-full max-w-6xl flex-col px-4 py-6 sm:px-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <h1 class="truncate text-[15px] font-extrabold text-text">Inventario de Sistemas</h1>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="!familiaId && puedeImportar"
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
          @click="verImportar = true"
        >
          Importar compras
        </button>
        <button
          v-if="!familiaId && verCargosPerdida"
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
          @click="verCargos = true"
        >
          Cargos por pérdida
        </button>
        <button
          v-if="!familiaId && editor && !sinDinero"
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
          @click="verReporteAltas = true"
        >
          Reporte de altas
        </button>
        <button
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
          @click="exportEquiposExcel(familiaId ? equiposDeFamilia : equiposSistemas, undefined, !sinDinero)"
        >
          Exportar Excel
        </button>
        <PrintButton :target="printRef" document-title="Inventario de Sistemas" />
      </div>
    </div>

    <div ref="printRef" class="flex-1 overflow-y-auto pb-8">
      <template v-if="!familiaId">
        <RecepcionesPendientesBanner destino="ti" @changed="refresh" />
        <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <template v-if="!sinDinero">
            <KpiCard label="Invertido originalmente" :value="currency.format(valorOriginalSistemas())" />
            <KpiCard label="Valor actual (depreciado)" :value="currency.format(valorActualSistemas())" accent="linear-gradient(90deg,#1F5FAE,#0FA391)" />
          </template>
          <template v-else>
            <KpiCard label="Disponibles" :value="`${conteoEstado('disponible')}`" hint="Equipos listos para asignar" />
            <KpiCard label="Asignados" :value="`${conteoEstado('asignado')}`" hint="Con responsable" />
          </template>
          <KpiCard label="Equipos activos" :value="`${totalEquipos()}`" />
          <KpiCard label="Familias" :value="`${familias.length}`" />
        </div>

        <div v-if="!sinDinero && familiasConDatos.some((f) => f.cantidad > 0)" class="mb-4">
          <ChartCard title="Valor actual por familia (depreciado)" filename="sistemas-por-familia">
            <Bar :data="chartData" :options="chartOptions" />
          </ChartCard>
        </div>

        <div class="flex flex-wrap justify-center gap-3">
          <div
            v-for="({ familia, cantidad, valor }, i) in familiasConDatos"
            :key="familia.id"
            class="animate-fade-in-up w-[calc(50%-0.375rem)] shrink-0 grow-0 sm:w-[calc(33.333%-0.5rem)] md:w-[calc(25%-0.5625rem)]"
            :style="{ animationDelay: `${i * 40}ms` }"
          >
            <FamiliaCard :nombre="familia.nombre" :icono="familia.icono" :cantidad="cantidad" :valor="sinDinero ? undefined : valor" @click="familiaId = familia.id" />
          </div>
        </div>
      </template>
      <template v-else>
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" class="flex items-center gap-1.5 text-[13px] font-semibold text-vz-blue hover:underline" @click="familiaId = null">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {{ familiaActual?.nombre }}
          </button>
        </div>
        <EquiposTable :familia-id="familiaId" :editor="editor" :sin-dinero="sinDinero" :highlight-id="highlightId" @changed="refresh" />
      </template>
    </div>

    <CargosPerdidaPanel v-if="verCargos" tipo="sistemas" @close="verCargos = false" />
    <ImportarComprasPanel v-if="verImportar" :dominio="dominioImportar" @close="verImportar = false" @imported="refresh" />
    <ReporteAltasPanel v-if="verReporteAltas" dominio="sistemas" @close="verReporteAltas = false" />
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { Bar } from 'vue-chartjs'
import { useAuth } from 'src/lib/auth'
import { canLoadStock, canViewCargosPerdida, dominioPropio, inventarioSinDinero, isEditor } from 'src/lib/access'
import { bump } from 'src/lib/reactive'
import KpiCard from 'components/KpiCard.vue'
import ChartCard from 'components/ChartCard.vue'
import FamiliaCard from 'components/FamiliaCard.vue'
import PrintButton from 'components/PrintButton.vue'
import EquiposTable from 'components/inventario/EquiposTable.vue'
import CargosPerdidaPanel from 'components/inventario/CargosPerdidaPanel.vue'
import ImportarComprasPanel from 'components/inventario/ImportarComprasPanel.vue'
import ReporteAltasPanel from 'components/inventario/ReporteAltasPanel.vue'
import RecepcionesPendientesBanner from 'components/inventario/RecepcionesPendientesBanner.vue'
import { listFamilias, getFamilia } from 'src/lib/inventario/comunes'
import { listEquipos, listEquiposPorFamilia, totalEquipos } from 'src/lib/inventario/sistemas'
import { calcularValorDepreciado } from 'src/lib/inventario/depreciacion'
import { valorOriginalSistemas, valorActualSistemas } from 'src/lib/inventario/analisisSistemas'
import { exportEquiposExcel } from 'src/lib/exportExcel'

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

const { user } = useAuth()
const editor = computed(() => (user.value ? isEditor(user.value.role) : false))
// Adquisiciones y Talento ven existencias y responsables, no costos ni valores (lib/access.js → inventarioSinDinero).
const sinDinero = computed(() => (user.value ? inventarioSinDinero(user.value.role) : false))
const verCargosPerdida = computed(() => (user.value ? canViewCargosPerdida(user.value.role) : false))
const equiposSistemas = computed(() => listEquipos().filter((e) => getFamilia(e.familiaId)?.tipo === 'sistemas'))
const conteoEstado = (estado) => equiposSistemas.value.filter((e) => e.estado === estado).length
// Uriel (capturista) solo da de alta en Sistemas; Dirección/Adquisiciones pueden importar en ambos dominios.
const puedeImportar = computed(() => (user.value ? canLoadStock(user.value.role, 'sistemas') : false))
const dominioImportar = computed(() => (user.value ? dominioPropio(user.value.role) : undefined))
const printRef = ref(null)
const refresh = () => bump()

const route = useRoute()
const queryStr = (v) => (typeof v === 'string' && v ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null)
const highlightId = computed(() => queryStr(route.query.highlight))
const familiaId = ref(queryStr(route.query.familia))
const verCargos = ref(false)
const verImportar = ref(false)
const verReporteAltas = ref(false)

const familias = computed(() => listFamilias('sistemas'))
const familiasConDatos = computed(() =>
  familias.value.map((f) => {
    const equipos = listEquiposPorFamilia(f.id).filter((e) => e.estado !== 'baja')
    return { familia: f, cantidad: equipos.length, valor: equipos.reduce((s, e) => s + calcularValorDepreciado(e, f), 0) }
  }),
)

const familiaActual = computed(() => (familiaId.value ? getFamilia(familiaId.value) : null))
const equiposDeFamilia = computed(() => (familiaId.value ? listEquiposPorFamilia(familiaId.value) : []))

// --- Gráfica (Chart.js no resuelve variables CSS: se leen del tema activo) ---
const $q = useQuasar()
const themeRev = ref(0)
watch(
  () => $q.dark.isActive,
  () => void nextTick(() => themeRev.value++),
)
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const chartData = computed(() => {
  const datos = familiasConDatos.value.filter((f) => f.cantidad > 0)
  return {
    labels: datos.map((f) => f.familia.nombre),
    datasets: [{ label: 'Valor', data: datos.map((f) => f.valor), backgroundColor: '#1F5FAE', borderRadius: { topLeft: 4, topRight: 4 } }],
  }
})

const chartOptions = computed(() => {
  void themeRev.value
  const muted = cssVar('--color-text-muted')
  const border = cssVar('--color-border')
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { left: 8, right: 16, top: 8 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: cssVar('--color-surface'),
        borderColor: border,
        borderWidth: 1,
        titleColor: cssVar('--color-text'),
        bodyColor: cssVar('--color-text'),
        titleFont: { size: 12 },
        bodyFont: { size: 12 },
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${currency.format(Number(ctx.parsed.y))}` },
      },
    },
    scales: {
      x: { grid: { color: border }, ticks: { color: muted, font: { size: 10 }, autoSkip: false, maxRotation: 20, minRotation: 20 } },
      y: { grid: { color: border }, ticks: { color: muted, font: { size: 11 } } },
    },
  }
})
</script>
