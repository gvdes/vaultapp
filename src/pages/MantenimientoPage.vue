<template>
  <div class="mx-auto flex h-full max-w-6xl flex-col px-4 py-6 sm:px-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="truncate text-[15px] font-extrabold text-text">Inventario de Mantenimiento</h1>
      <div class="flex items-center gap-2">
        <template v-if="!familiaId">
          <button
            v-if="puedeCargar"
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
            @click="verImportar = true"
          >
            Importar compras
          </button>
          <button
            v-if="editor && !sinDinero"
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
            @click="verReporteAltas = true"
          >
            Reporte de altas
          </button>
          <button
            v-if="verCargosPerdida"
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
            @click="verCargos = true"
          >
            Cargos por pérdida
          </button>
          <button
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
            @click="verProveedores = true"
          >
            Proveedores
          </button>
          <button
            v-if="puedeAsignar"
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
            @click="verCalendario = true"
          >
            Calendario preventivo
          </button>
        </template>
        <button
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
          @click="exportar"
        >
          Exportar Excel
        </button>
        <PrintButton :target="printRef" document-title="Inventario de Mantenimiento" />
      </div>
    </div>

    <div ref="printRef" class="flex-1 overflow-y-auto pb-8">
      <template v-if="!familiaId">
        <RecepcionesPendientesBanner destino="mantenimiento" @changed="refresh" />
        <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard v-if="!sinDinero" label="Valor total" :value="currency.format(valorTotalMantenimiento())" accent="linear-gradient(90deg,#C8A24B,#E3A517)" />
          <KpiCard v-else label="Unidades en existencia" :value="`${unidadesTotales}`" hint="Materiales y consumibles" />
          <KpiCard label="Artículos" :value="`${totalArticulos}`" />
          <KpiCard label="Bajo el mínimo" :value="`${bajoMinimo.length}`" :tone="bajoMinimo.length > 0 ? 'danger' : 'success'" />
          <KpiCard v-if="sinDinero" label="Sobre el máximo" :value="`${sobreMaximo.length}`" :tone="sobreMaximo.length > 0 ? 'warning' : 'success'" hint="Excedente: no comprar más" />
          <KpiCard
            v-else
            label="Cumplimiento preventivo"
            :value="cumplimiento.total > 0 ? `${cumplimiento.pct}%` : '—'"
            :tone="cumplimientoTone"
            :hint="cumplimiento.total > 0 ? `${cumplimiento.alDia} de ${cumplimiento.total} al día` : 'Sin mantenimientos programados'"
          />
        </div>

        <p v-if="!sinDinero && valorEquiposMantenimiento() > 0" class="mb-4 text-[12px] text-text-soft">
          Incluye {{ currency.format(valorEquiposMantenimiento()) }} en herramienta y equipo dado de alta por pieza individual.
        </p>

        <div v-if="!sinDinero" class="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ChartCard v-if="familiasConDatos.some((f) => f.cantidad > 0)" title="Valor actual por clasificación" filename="mantenimiento-por-familia">
            <Bar :data="barData" :options="chartOptions" />
          </ChartCard>

          <ChartCard v-if="gasto.some((g) => g.gasto > 0)" title="Gasto mensual en compras (últimos 6 meses)" filename="mantenimiento-gasto-mensual">
            <Line :data="areaData" :options="chartOptions" />
          </ChartCard>
        </div>

        <div v-if="!sinDinero && (topConsumidos.length > 0 || gastoUbicacion.length > 0)" class="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div v-if="topConsumidos.length > 0" class="rounded-xl border border-border bg-surface p-4">
            <h3 class="mb-3 text-[13px] font-bold text-text">Top 5 materiales más consumidos</h3>
            <div class="flex flex-col gap-2">
              <div v-for="(m, i) in topConsumidos" :key="m.nombre" class="flex items-center justify-between gap-2 text-[12.5px]">
                <span class="flex min-w-0 items-center gap-2 text-text-muted">
                  <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg text-[10px] font-bold text-text-soft">{{ i + 1 }}</span>
                  <span class="truncate">{{ m.nombre }}</span>
                </span>
                <span class="shrink-0 font-bold text-text">{{ m.cantidad }}</span>
              </div>
            </div>
          </div>
          <div v-if="gastoUbicacion.length > 0" class="rounded-xl border border-border bg-surface p-4">
            <h3 class="mb-3 text-[13px] font-bold text-text">Top 5 sucursales por consumo</h3>
            <div class="flex flex-col gap-2">
              <div v-for="(u, i) in gastoUbicacion" :key="u.nombre" class="flex items-center justify-between gap-2 text-[12.5px]">
                <span class="flex min-w-0 items-center gap-2 text-text-muted">
                  <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg text-[10px] font-bold text-text-soft">{{ i + 1 }}</span>
                  <span class="truncate">{{ u.nombre }}</span>
                </span>
                <span class="shrink-0 font-bold text-text">{{ currency.format(u.valor) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!sinDinero && sinMovimiento.length > 0" class="mb-4 rounded-xl border border-vz-warning/30 bg-vz-warning/5 p-4">
          <h3 class="mb-2 text-[13px] font-bold text-text">Posible stock muerto (sin salidas en 90+ días)</h3>
          <div class="flex flex-wrap gap-2">
            <span v-for="m in sinMovimiento.slice(0, 8)" :key="m.nombre" class="rounded-full border border-vz-warning/30 bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-muted">
              {{ m.nombre }} · {{ currency.format(m.valor) }}
            </span>
          </div>
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
          <div v-if="!esSerializada && editor" class="flex gap-2">
            <button
              v-if="materialesDeFamilia.length > 0"
              type="button"
              class="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
              @click="verEtiquetas = true"
            >
              Imprimir etiquetas
            </button>
            <button v-if="puedeCargar" type="button" class="h-9 rounded-lg bg-vz-blue px-3 text-[13px] font-bold text-white hover:bg-primary-hover" @click="modalMaterial = 'new'">+ Nuevo material</button>
          </div>
        </div>

        <EquiposTable v-if="esSerializada" :familia-id="familiaId" :editor="editor" :sin-dinero="sinDinero" :highlight-id="highlightId" nombre-singular="artículo" @changed="refresh" />
        <div v-else class="overflow-x-auto rounded-xl border border-border">
          <table class="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr class="border-b border-border bg-bg">
                <th class="px-3 py-2 text-left font-bold text-text-muted">Nombre</th>
                <th class="px-3 py-2 text-left font-bold text-text-muted">Ubicación</th>
                <th class="px-3 py-2 text-right font-bold text-text-muted">Existencia</th>
                <th class="px-3 py-2 text-right font-bold text-text-muted">Mínimo</th>
                <th class="px-3 py-2 text-right font-bold text-text-muted">Máximo</th>
                <th v-if="!sinDinero" class="px-3 py-2 text-right font-bold text-text-muted">Costo unit.</th>
                <th v-if="!sinDinero" class="px-3 py-2 text-right font-bold text-text-muted">Valor</th>
                <th v-if="editor" class="px-3 py-2 text-right font-bold text-text-muted">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="materialesDeFamilia.length === 0">
                <td :colspan="sinDinero ? 6 : 8" class="px-3 py-6 text-center text-text-soft">Sin materiales registrados en esta clasificación todavía.</td>
              </tr>
              <tr
                v-for="m in materialesDeFamilia"
                :key="m.id"
                :class="`border-b border-border last:border-0 even:bg-bg/40 ${m.id === highlightId ? 'bg-vz-blue/10 ring-1 ring-inset ring-vz-blue/40' : ''}`"
              >
                <td class="px-3 py-2 text-text">
                  <div class="font-semibold">{{ m.nombre }}<span v-if="m.marca" class="ml-1.5 text-[11px] font-normal text-text-soft">· {{ m.marca }}</span></div>
                  <div v-if="m.descripcion" class="mt-0.5 line-clamp-2 max-w-md text-[11.5px] font-normal text-text-muted">{{ m.descripcion }}</div>
                  <div v-else-if="familiaId === 'fam-consumible'" class="mt-0.5 text-[11px] font-semibold text-vz-warning">Falta el detalle: ¿qué es este consumible?</div>
                </td>
                <td class="px-3 py-2 text-text-muted">{{ getUbicacion(m.ubicacionId)?.nombre ?? '—' }}</td>
                <td :class="`px-3 py-2 text-right font-bold ${m.cantidadActual < m.minimo ? 'text-vz-danger' : 'text-text'}`">
                  {{ m.cantidadActual }} {{ m.unidadMedida }}{{ m.cantidadActual < m.minimo ? ' ⚠ bajo mínimo' : m.maximo && m.cantidadActual > m.maximo ? ' ▲ sobre máximo' : '' }}
                </td>
                <td class="px-3 py-2 text-right text-text-muted">{{ m.minimo }}</td>
                <td :class="`px-3 py-2 text-right ${m.maximo && m.cantidadActual > m.maximo ? 'font-bold text-vz-warning' : 'text-text-muted'}`">{{ m.maximo ? m.maximo : '—' }}</td>
                <td v-if="!sinDinero" class="px-3 py-2 text-right text-text-muted">{{ currency.format(m.costoUnitario) }}</td>
                <td v-if="!sinDinero" class="px-3 py-2 text-right font-semibold text-text">{{ currency.format(m.cantidadActual * m.costoUnitario) }}</td>
                <td v-if="editor" class="px-3 py-2">
                  <div class="flex justify-end gap-1.5">
                    <button v-if="puedeCargar" type="button" class="rounded-md border border-vz-success/30 bg-vz-success/10 px-2 py-1 text-[11px] font-semibold text-vz-success hover:bg-vz-success/20" @click="entradaMaterial = m">
                      + Entrada
                    </button>
                    <button v-if="puedeAsignar" type="button" class="rounded-md border border-vz-danger/30 bg-vz-danger/10 px-2 py-1 text-[11px] font-semibold text-vz-danger hover:bg-vz-danger/20" @click="salidaMaterial = m">
                      − Asignar / salida
                    </button>
                    <button type="button" class="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-hover" @click="movimientosMaterial = m">Historial</button>
                    <button v-if="puedeCargar && !sinDinero" type="button" class="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-hover" @click="modalMaterial = m">Editar</button>
                    <button type="button" class="rounded-md border border-vz-blue/30 bg-vz-blue/10 px-2 py-1 text-[11px] font-semibold text-vz-blue hover:bg-vz-blue/20" @click="qrMaterial = m">Ver QR</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <MaterialFormModal
      v-if="modalMaterial"
      :familia-id="familiaId ?? familias.find((f) => f.modoInventario === 'cantidad')?.id ?? ''"
      :material="modalMaterial === 'new' ? undefined : modalMaterial"
      @close="modalMaterial = null"
      @saved="refresh"
    />
    <EntradaModal v-if="entradaMaterial" :material="entradaMaterial" :ocultar-costo-actual="sinDinero" :quien-recibio="user?.displayName" @close="entradaMaterial = null" @saved="refresh" />
    <SalidaModal v-if="salidaMaterial" :material="salidaMaterial" :quien-entrego="user?.displayName" @close="salidaMaterial = null" @saved="refresh" />
    <ProveedoresPanel v-if="verProveedores" :puede-editar="puedeCargar" @close="verProveedores = false" />
    <CalendarioMantenimientoPanel v-if="verCalendario" :realizado-por="user?.displayName" @close="verCalendario = false" />
    <CargosPerdidaPanel v-if="verCargos" tipo="mantenimiento" @close="verCargos = false" />
    <ImportarComprasPanel v-if="verImportar" :dominio="dominioImportar" @close="verImportar = false" @imported="refresh" />
    <ReporteAltasPanel v-if="verReporteAltas" dominio="mantenimiento" @close="verReporteAltas = false" />

    <QRCodeModal v-if="qrMaterial" :url="materialVerifyUrl(qrMaterial.id)" :titulo="qrMaterial.nombre" :subtitulo="getFamilia(qrMaterial.familiaId)?.nombre" @close="qrMaterial = null" />

    <EtiquetasModal v-if="verEtiquetas" :items="etiquetaItems" :document-title="familiaActual?.nombre ?? 'Materiales'" @close="verEtiquetas = false" />

    <Teleport to="body">
      <div v-if="movimientosMaterial" class="fixed inset-0 flex items-center justify-center bg-black/40 px-4 py-8" style="z-index: 5500" @click="movimientosMaterial = null">
        <div class="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl" @click.stop>
          <h2 class="mb-3 text-[15px] font-extrabold text-text">Historial · {{ movimientosMaterial.nombre }}</h2>
          <div class="flex flex-col gap-2">
            <p class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Entradas</p>
            <p v-if="entradasMaterial.length === 0" class="text-[12px] text-text-soft">Sin entradas registradas.</p>
            <div v-for="e in entradasMaterial" :key="e.id" class="rounded-lg border border-vz-success/20 bg-vz-success/5 p-2.5 text-[12px]">
              <p class="font-bold text-text">{{ e.fecha }} · +{{ e.cantidad }}</p>
              <p v-if="e.proveedor" class="text-text-muted">Proveedor: {{ e.proveedor }}</p>
              <p v-if="e.quienRecibio" class="text-text-muted">Recibió: {{ e.quienRecibio }}</p>
              <p v-if="e.numeroFactura" class="text-text-muted">Factura / OC: {{ e.numeroFactura }}</p>
            </div>
            <p class="mt-2 text-[11px] font-bold uppercase tracking-wide text-text-soft">Salidas</p>
            <p v-if="salidasMaterial.length === 0" class="text-[12px] text-text-soft">Sin salidas registradas.</p>
            <div v-for="s in salidasMaterial" :key="s.id" class="rounded-lg border border-vz-danger/20 bg-vz-danger/5 p-2.5 text-[12px]">
              <p class="font-bold text-text">{{ s.fecha }} · −{{ s.cantidad }}</p>
              <p v-if="s.motivo" class="text-text-muted">{{ s.motivo }}</p>
              <p v-if="s.quienSolicito" class="text-text-muted">Solicitó: {{ s.quienSolicito }}</p>
            </div>
          </div>
          <button type="button" class="mt-4 h-9 w-full rounded-lg border border-border bg-bg text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="movimientosMaterial = null">Cerrar</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { Bar, Line } from 'vue-chartjs'
import { useAuth } from 'src/lib/auth'
import { canAssign, canLoadStock, canViewCargosPerdida, dominioPropio, inventarioSinDinero, isEditor } from 'src/lib/access'
import { bump } from 'src/lib/reactive'
import KpiCard from 'components/KpiCard.vue'
import ChartCard from 'components/ChartCard.vue'
import FamiliaCard from 'components/FamiliaCard.vue'
import PrintButton from 'components/PrintButton.vue'
import MaterialFormModal from 'components/inventario/MaterialFormModal.vue'
import EntradaModal from 'components/inventario/EntradaModal.vue'
import SalidaModal from 'components/inventario/SalidaModal.vue'
import ProveedoresPanel from 'components/inventario/ProveedoresPanel.vue'
import CalendarioMantenimientoPanel from 'components/inventario/CalendarioMantenimientoPanel.vue'
import EquiposTable from 'components/inventario/EquiposTable.vue'
import CargosPerdidaPanel from 'components/inventario/CargosPerdidaPanel.vue'
import ImportarComprasPanel from 'components/inventario/ImportarComprasPanel.vue'
import ReporteAltasPanel from 'components/inventario/ReporteAltasPanel.vue'
import RecepcionesPendientesBanner from 'components/inventario/RecepcionesPendientesBanner.vue'
import QRCodeModal from 'components/inventario/QRCodeModal.vue'
import EtiquetasModal from 'components/inventario/EtiquetasModal.vue'
import { materialVerifyUrl } from 'src/lib/qr'
import { listFamilias, getFamilia, getUbicacion } from 'src/lib/inventario/comunes'
import {
  listMateriales,
  listMaterialesPorFamilia,
  materialesBajoMinimo,
  listEntradas,
  listSalidas,
} from 'src/lib/inventario/mantenimiento'
import { listEquiposPorFamilia } from 'src/lib/inventario/sistemas'
import { calcularValorDepreciado } from 'src/lib/inventario/depreciacion'
import {
  gastoMensual,
  topMaterialesConsumidos,
  gastoPorUbicacion,
  cumplimientoPreventivo,
  materialesSinMovimiento,
  valorTotalMantenimiento,
  valorEquiposMantenimiento,
  totalEquiposMantenimiento,
} from 'src/lib/inventario/analisisMantenimiento'
import { exportMaterialesExcel, exportEquiposExcel } from 'src/lib/exportExcel'

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

const { user } = useAuth()
const editor = computed(() => (user.value ? isEditor(user.value.role) : false))
// Adquisiciones ve existencias, mínimos y máximos pero no costos ni valores (lib/access.js → inventarioSinDinero).
const sinDinero = computed(() => (user.value ? inventarioSinDinero(user.value.role) : false))
const verCargosPerdida = computed(() => (user.value ? canViewCargosPerdida(user.value.role) : false))
// En Mantenimiento opera la Gerencia (y Dirección); Adquisiciones puede cargar stock pero no asignar. Soporte (TI) solo consulta.
const puedeCargar = computed(() => (user.value ? canLoadStock(user.value.role, 'mantenimiento') : false))
const puedeAsignar = computed(() => (user.value ? canAssign(user.value.role, 'mantenimiento') : false))
const dominioImportar = computed(() => (user.value ? dominioPropio(user.value.role) : undefined))
const printRef = ref(null)
const refresh = () => bump()

const route = useRoute()
const queryStr = (v) => (typeof v === 'string' && v ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null)
const highlightId = computed(() => queryStr(route.query.highlight))
const familiaId = ref(queryStr(route.query.familia))
const modalMaterial = ref(null)
const entradaMaterial = ref(null)
const salidaMaterial = ref(null)
const movimientosMaterial = ref(null)
const verProveedores = ref(false)
const verCalendario = ref(false)
const verCargos = ref(false)
const verImportar = ref(false)
const verReporteAltas = ref(false)
const qrMaterial = ref(null)
const verEtiquetas = ref(false)

const familias = computed(() => listFamilias('mantenimiento'))
const familiasConDatos = computed(() =>
  familias.value.map((f) => {
    if (f.modoInventario === 'serializado') {
      const equipos = listEquiposPorFamilia(f.id).filter((e) => e.estado !== 'baja')
      return { familia: f, cantidad: equipos.length, valor: equipos.reduce((s, e) => s + calcularValorDepreciado(e, f), 0) }
    }
    const materiales = listMaterialesPorFamilia(f.id)
    return { familia: f, cantidad: materiales.length, valor: materiales.reduce((s, m) => s + m.cantidadActual * m.costoUnitario, 0) }
  }),
)

const familiaActual = computed(() => (familiaId.value ? getFamilia(familiaId.value) : null))
const esSerializada = computed(() => familiaActual.value?.modoInventario === 'serializado')
const materialesDeFamilia = computed(() => (familiaId.value && !esSerializada.value ? listMaterialesPorFamilia(familiaId.value) : []))
const bajoMinimo = computed(() => materialesBajoMinimo())
const sobreMaximo = computed(() => listMateriales().filter((m) => m.maximo != null && m.maximo > 0 && m.cantidadActual > m.maximo))
const unidadesTotales = computed(() => listMateriales().reduce((s, m) => s + m.cantidadActual, 0))
const gasto = computed(() => gastoMensual(6))
const topConsumidos = computed(() => topMaterialesConsumidos(5))
const gastoUbicacion = computed(() => gastoPorUbicacion(5))
const cumplimiento = computed(() => cumplimientoPreventivo())
const sinMovimiento = computed(() => materialesSinMovimiento(90))
const totalArticulos = computed(() => listMateriales().length + totalEquiposMantenimiento())
const cumplimientoTone = computed(() =>
  cumplimiento.value.total === 0 ? 'default' : cumplimiento.value.pct >= 80 ? 'success' : cumplimiento.value.pct >= 50 ? 'warning' : 'danger',
)

const entradasMaterial = computed(() => (movimientosMaterial.value ? listEntradas(movimientosMaterial.value.id) : []))
const salidasMaterial = computed(() => (movimientosMaterial.value ? listSalidas(movimientosMaterial.value.id) : []))

const etiquetaItems = computed(() =>
  materialesDeFamilia.value.map((m) => ({ id: m.id, titulo: m.nombre, subtitulo: familiaActual.value?.nombre, url: materialVerifyUrl(m.id) })),
)

function exportar() {
  if (esSerializada.value) exportEquiposExcel(listEquiposPorFamilia(familiaId.value), 'inventario_mantenimiento_herramientas.xlsx', !sinDinero.value)
  else exportMaterialesExcel(familiaId.value ? materialesDeFamilia.value : listMateriales(), undefined, !sinDinero.value)
}

// --- Gráficas (Chart.js no resuelve variables CSS: se leen del tema activo) ---
const $q = useQuasar()
const themeRev = ref(0)
watch(
  () => $q.dark.isActive,
  () => void nextTick(() => themeRev.value++),
)
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const barData = computed(() => {
  const datos = familiasConDatos.value.filter((f) => f.cantidad > 0)
  return {
    labels: datos.map((f) => f.familia.nombre),
    datasets: [{ label: 'Valor', data: datos.map((f) => f.valor), backgroundColor: '#C8A24B', borderRadius: { topLeft: 4, topRight: 4 } }],
  }
})

const areaData = computed(() => ({
  labels: gasto.value.map((g) => g.mes),
  datasets: [
    {
      label: 'Gasto',
      data: gasto.value.map((g) => g.gasto),
      borderColor: '#E3A517',
      backgroundColor: 'rgba(227, 165, 23, 0.2)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
    },
  ],
}))

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
      x: { grid: { color: border }, ticks: { color: muted, font: { size: 11 } } },
      y: { grid: { color: border }, ticks: { color: muted, font: { size: 11 } } },
    },
  }
})
</script>
