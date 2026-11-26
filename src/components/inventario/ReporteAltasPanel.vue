<template>
  <!-- q-dialog propio (en vez de AppModal): la tabla necesita más ancho que los 42rem de AppModal. -->
  <q-dialog :model-value="true" @update:model-value="(v: boolean) => !v && emit('close')">
    <div class="max-h-full w-full overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl" style="max-width: min(100vw - 32px, 76rem)">
      <div class="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 class="text-[15px] font-extrabold text-text">Reporte de altas</h2>
          <p class="text-[12px] text-text-muted">Todo lo dado de alta en el periodo, con su evidencia de compra y quién lo registró — para conciliar con Finanzas.</p>
        </div>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AppField label="Desde">
          <input v-model="desde" type="date" :class="inputClass" />
        </AppField>
        <AppField label="Hasta">
          <input v-model="hasta" type="date" :class="inputClass" />
        </AppField>
        <AppField label="Área">
          <select v-model="dominioFiltro" :class="selectClass">
            <option value="todos">Sistemas y Mantenimiento</option>
            <option value="sistemas">Solo Sistemas</option>
            <option value="mantenimiento">Solo Mantenimiento</option>
          </select>
        </AppField>
      </div>

      <div class="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Registros" :value="`${totales.registros}`" />
        <KpiCard label="Piezas / unidades" :value="`${totales.piezas}`" />
        <KpiCard label="Costo total" :value="currency.format(totales.costoTotal)" />
        <KpiCard label="Sin proveedor o factura" :value="`${totales.sinEvidencia}`" :tone="totales.sinEvidencia > 0 ? 'warning' : 'success'" />
      </div>

      <div class="max-h-[46vh] overflow-auto rounded-xl border border-border">
        <table class="w-full min-w-[1100px] border-collapse text-[12.5px]">
          <thead class="sticky top-0 z-10">
            <tr class="border-b border-border bg-bg">
              <th class="px-2 py-2 text-left font-bold text-text-muted">Fecha</th>
              <th class="px-2 py-2 text-left font-bold text-text-muted">Tipo</th>
              <th class="px-2 py-2 text-left font-bold text-text-muted">Familia</th>
              <th class="px-2 py-2 text-left font-bold text-text-muted">Modelo / Nombre</th>
              <th class="px-2 py-2 text-left font-bold text-text-muted">N° serie</th>
              <th class="px-2 py-2 text-left font-bold text-text-muted">Proveedor</th>
              <th class="px-2 py-2 text-left font-bold text-text-muted">Factura / OC</th>
              <th class="px-2 py-2 text-right font-bold text-text-muted">Cant.</th>
              <th class="px-2 py-2 text-right font-bold text-text-muted">Costo unit.</th>
              <th class="px-2 py-2 text-right font-bold text-text-muted">Costo total</th>
              <th class="px-2 py-2 text-left font-bold text-text-muted">Ubicación</th>
              <th class="px-2 py-2 text-left font-bold text-text-muted">Registró</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filas.length === 0">
              <td colspan="12" class="px-3 py-6 text-center text-text-soft">Sin altas en este periodo.</td>
            </tr>
            <tr v-for="f in filas" :key="f.id" class="border-b border-border last:border-0 even:bg-bg/40">
              <td class="whitespace-nowrap px-2 py-1.5 text-text-muted">{{ f.fecha }}</td>
              <td class="px-2 py-1.5 text-text-muted">{{ f.tipo === 'equipo' ? 'Equipo' : 'Entrada de material' }}</td>
              <td class="px-2 py-1.5 text-text-muted">{{ f.familia || '—' }}</td>
              <td class="max-w-[220px] truncate px-2 py-1.5 font-semibold text-text" :title="f.nombre">{{ f.nombre || '—' }}</td>
              <td class="px-2 py-1.5 text-text-muted">{{ f.serie || '—' }}</td>
              <td :class="`px-2 py-1.5 ${f.proveedor ? 'text-text-muted' : 'font-semibold text-vz-warning'}`">{{ f.proveedor || 'Falta' }}</td>
              <td :class="`px-2 py-1.5 ${f.factura ? 'text-text-muted' : 'font-semibold text-vz-warning'}`">{{ f.factura || 'Falta' }}</td>
              <td class="px-2 py-1.5 text-right text-text-muted">{{ f.cantidad }}</td>
              <td class="px-2 py-1.5 text-right text-text-muted">{{ currency.format(f.costoUnitario) }}</td>
              <td class="px-2 py-1.5 text-right font-semibold text-text">{{ currency.format(f.costoTotal) }}</td>
              <td class="px-2 py-1.5 text-text-muted">{{ f.ubicacion || '—' }}</td>
              <td class="px-2 py-1.5 text-text-muted">{{ f.registradoPor || '—' }}</td>
            </tr>
          </tbody>
          <tfoot v-if="filas.length > 0">
            <tr class="border-t border-border bg-bg font-bold text-text">
              <td colspan="7" class="px-2 py-2 text-right">Totales</td>
              <td class="px-2 py-2 text-right">{{ totales.piezas }}</td>
              <td class="px-2 py-2"></td>
              <td class="px-2 py-2 text-right">{{ currency.format(totales.costoTotal) }}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button type="button" class="h-9 rounded-lg border border-border bg-bg px-3 text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">Cerrar</button>
        <button
          type="button"
          :disabled="filas.length === 0"
          class="h-9 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white hover:bg-primary-hover disabled:opacity-60"
          @click="exportReporteAltasExcel(filas, desde, hasta)"
        >
          Exportar Excel
        </button>
      </div>
    </div>
  </q-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppField from 'components/AppField.vue'
import KpiCard from 'components/KpiCard.vue'
import { inputClass, selectClass } from 'components/formClasses'
import { reporteAltas, totalesAltas, exportReporteAltasExcel } from 'src/lib/inventario/reporteAltas'
import { toLocalDateString, todayLocalDateString } from 'src/lib/dateUtils'

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })

/** Reporte de altas (conciliación para Finanzas). `dominio` es el filtro inicial; se puede cambiar dentro del modal. */
const props = defineProps({ dominio: String })
const emit = defineEmits(['close'])

const hoy = new Date()
const desde = ref(toLocalDateString(new Date(hoy.getFullYear(), hoy.getMonth(), 1)))
const hasta = ref(todayLocalDateString())
const dominioFiltro = ref(props.dominio ?? 'todos')

const filas = computed(() => reporteAltas({ desde: desde.value, hasta: hasta.value, dominio: dominioFiltro.value }))
const totales = computed(() => totalesAltas(filas.value))
</script>
