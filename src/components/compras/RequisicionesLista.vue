<template>
  <div class="overflow-x-auto rounded-xl border border-border bg-surface">
    <table class="w-full min-w-[980px] border-collapse text-[12.5px]">
      <thead>
        <tr class="border-b border-border bg-bg text-left">
          <th v-for="c in columnasVisibles" :key="c.id" scope="col" :class="`px-3 py-2 font-bold text-text-muted ${c.derecha ? 'text-right' : ''}`" :aria-sort="ariaSort(c.id)">
            <button type="button" class="inline-flex items-center gap-1 hover:text-text" @click="ordenarPor(c.id)">
              {{ c.label }}
              <span v-if="orden.col === c.id" aria-hidden="true">{{ orden.asc ? '▲' : '▼' }}</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="filas.length === 0">
          <td :colspan="columnasVisibles.length" class="px-3 py-10 text-center text-text-soft">No hay requisiciones con estos filtros.</td>
        </tr>
        <tr v-for="f in filas" :key="f.r.folio" class="cursor-pointer border-b border-border last:border-0 hover:bg-surface-hover" @click="abrir(f.r.folio)">
          <td class="px-3 py-2 font-mono text-[11.5px] font-bold text-vz-blue">
            <RouterLink :to="RUTAS_COMPRAS.requisicion(f.r.folio)" class="hover:underline" @click.stop>{{ f.r.folio }}</RouterLink>
          </td>
          <td class="px-3 py-2"><EstadoBadge :estado="f.r.estado" /></td>
          <td class="px-3 py-2">
            <p class="font-semibold text-text">{{ f.r.solicitanteNombre }}</p>
            <p class="text-[11px] text-text-soft">{{ f.r.area || '—' }}</p>
          </td>
          <td class="max-w-[200px] truncate px-3 py-2 text-text-muted" :title="f.sucursales">{{ f.sucursales || '—' }}</td>
          <td class="px-3 py-2 text-right text-text-muted" :title="f.resumen">{{ f.partidas }}</td>
          <td v-if="verDinero" class="px-3 py-2 text-right font-bold text-text">{{ f.monto > 0 ? formatoMoneda(f.monto) : '—' }}</td>
          <td class="px-3 py-2">
            <span v-if="f.r.urgencia === 'urgente'" :class="`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${TONE_STYLES.danger}`">Urgente</span>
            <span v-else class="text-text-soft">Normal</span>
          </td>
          <td class="px-3 py-2 text-right text-text-muted">{{ f.dias }} d</td>
          <td class="px-3 py-2 text-text-muted">{{ fechaCorta(f.r.createdAt) }}</td>
          <td class="px-3 py-2"><AlertaChips :alertas="f.alertas" :max="2" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { RUTAS_COMPRAS, ESTADOS, esAbierta, formatoMoneda, listPartidas, resumenPartidas } from 'src/lib/compras'
import { TONE_STYLES } from 'components/statusMaps'
import EstadoBadge from './EstadoBadge.vue'
import AlertaChips from './AlertaChips.vue'
import { alertasDe, diasDesde, fechaCorta, montoReferencia, ubicacionesTexto } from './util'
import { useAcceso } from './useAcceso'

const props = defineProps({ reqs: { type: Array, required: true } })
const router = useRouter()
const { verDinero } = useAcceso()

/**
 * @typedef {'folio' | 'estado' | 'solicitante' | 'sucursales' | 'partidas' | 'monto' | 'urgencia' | 'dias' |
 *   'fecha' | 'alertas'} ColId
 */
const columnas = [
  { id: 'folio', label: 'Folio' },
  { id: 'estado', label: 'Estado' },
  { id: 'solicitante', label: 'Solicitante / área' },
  { id: 'sucursales', label: 'Sucursales' },
  { id: 'partidas', label: 'Partidas', derecha: true },
  { id: 'monto', label: 'Monto', derecha: true },
  { id: 'urgencia', label: 'Urgencia' },
  { id: 'dias', label: 'Días', derecha: true },
  { id: 'fecha', label: 'Creada' },
  { id: 'alertas', label: 'Alertas' },
]

// El custodio no ve la columna de monto.
const columnasVisibles = computed(() => columnas.filter((c) => verDinero.value || c.id !== 'monto'))
const orden = reactive({ col: 'fecha', asc: false })
function ordenarPor(col) {
  if (orden.col === col) orden.asc = !orden.asc
  else {
    orden.col = col
    orden.asc = col === 'folio' || col === 'solicitante' || col === 'estado'
  }
}
function ariaSort(col) {
  return orden.col === col ? (orden.asc ? 'ascending' : 'descending') : 'none'
}

const ORDEN_ESTADO = Object.keys(ESTADOS)

const filas = computed(() => {
  const base = props.reqs.map((r) => {
    const m = montoReferencia(r)
    return {
      r,
      sucursales: ubicacionesTexto(r.ubicaciones),
      partidas: listPartidas(r.folio).length,
      resumen: resumenPartidas(r.folio, 4),
      monto: m.monto,
      dias: esAbierta(r.estado) ? diasDesde(r.createdAt) : diasDesde(r.createdAt, r.updatedAt),
      alertas: alertasDe(r, verDinero.value),
    }
  })
  const dir = orden.asc ? 1 : -1
  const val = (f) => {
    switch (orden.col) {
      case 'folio': return f.r.folio
      case 'estado': return ORDEN_ESTADO.indexOf(f.r.estado)
      case 'solicitante': return f.r.solicitanteNombre
      case 'sucursales': return f.sucursales
      case 'partidas': return f.partidas
      case 'monto': return f.monto
      case 'urgencia': return f.r.urgencia === 'urgente' ? 1 : 0
      case 'dias': return f.dias
      case 'alertas': return f.alertas.length
      default: return f.r.createdAt
    }
  }
  return [...base].sort((a, b) => {
    const x = val(a)
    const y = val(b)
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
    return String(x).localeCompare(String(y), 'es') * dir
  })
})

function abrir(folio) {
  void router.push(RUTAS_COMPRAS.requisicion(folio))
}
</script>
