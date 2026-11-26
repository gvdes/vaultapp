<template>
  <div class="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0" role="region" aria-label="Tablero de requisiciones por estado" tabindex="0">
    <div class="flex min-w-max items-start gap-3">
      <section v-for="col in columnas" :key="col.estado" class="flex w-[272px] shrink-0 flex-col rounded-xl border border-border bg-bg/60" :aria-label="col.info.label">
        <header class="flex items-center justify-between gap-2 border-b border-border px-3 py-2" :style="{ boxShadow: `inset 0 3px 0 0 ${col.info.color}` }">
          <div class="min-w-0">
            <h3 class="truncate text-[12.5px] font-extrabold text-text" :title="col.info.descripcion">{{ col.info.label }}</h3>
            <p v-if="verDinero && col.monto > 0" class="text-[10.5px] text-text-soft">{{ formatoMonedaCorta(col.monto) }}</p>
          </div>
          <span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1.5 text-[11px] font-extrabold text-text-muted ring-1 ring-border">{{ col.items.length }}</span>
        </header>
        <div class="flex max-h-[62vh] flex-col gap-2 overflow-y-auto p-2">
          <p v-if="col.items.length === 0" class="px-2 py-6 text-center text-[11.5px] text-text-soft">Sin requisiciones</p>
          <RequisicionCard v-for="r in col.visibles" :key="r.folio" :req="r" />
          <p v-if="col.items.length > col.visibles.length" class="px-2 py-1 text-center text-[11px] text-text-soft">
            y {{ col.items.length - col.visibles.length }} más: verlas en la vista Lista
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ESTADOS, ESTADOS_TODOS } from 'src/lib/compras'
import RequisicionCard from './RequisicionCard.vue'
import { formatoMonedaCorta, montoReferencia } from './util'
import { useAcceso } from './useAcceso'

const props = defineProps({ reqs: { type: Array, required: true } })
const { verDinero } = useAcceso()

/** Las columnas de cierre muestran solo las más recientes para que el tablero siga siendo ágil. */
const LIMITE_CIERRE = 8

const columnas = computed(() =>
  ESTADOS_TODOS.map((estado) => {
    const info = ESTADOS[estado]
    const items = props.reqs.filter((r) => r.estado === estado).sort((a, b) => b.updatedAt - a.updatedAt)
    return {
      estado,
      info,
      items,
      visibles: info.terminal ? items.slice(0, LIMITE_CIERRE) : items,
      monto: items.reduce((s, r) => s + montoReferencia(r).monto, 0),
    }
  }),
)
</script>
