<template>
  <section class="animate-fade-in-up mt-4" aria-labelledby="stock-resumen-titulo">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 id="stock-resumen-titulo" class="text-[14px] font-extrabold text-text">Stock</h2>
        <p class="text-[11.5px] text-text-muted">Existencias, mínimos y máximos de Sistemas y Mantenimiento. Solo cantidades.</p>
      </div>
      <div class="flex gap-2">
        <router-link to="/sistemas" class="flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-[12px] font-bold text-text no-underline hover:bg-surface-hover">Ver Sistemas</router-link>
        <router-link to="/mantenimiento" class="flex h-8 items-center rounded-lg bg-vz-blue px-3 text-[12px] font-bold text-white no-underline transition-opacity hover:opacity-90">Ver Mantenimiento</router-link>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard label="Unidades en existencia" :amount="unidades" :format="entero" hint="Materiales y consumibles" accent="linear-gradient(90deg, #C8A24B, #E3A517)" />
      <KpiCard label="Equipos de Sistemas" :amount="equiposSistemas" :format="entero" :hint="`${disponibles} disponibles · ${asignados} asignados`" accent="linear-gradient(90deg, #1F5FAE, #0FA391)" />
      <KpiCard label="Herramienta y equipo" :amount="equiposMtto" :format="entero" hint="Mantenimiento, por pieza" />
      <KpiCard label="Bajo el mínimo" :amount="bajo.length" :format="entero" :tone="bajo.length > 0 ? 'danger' : 'success'" hint="Por reponer" />
      <KpiCard label="Sobre el máximo" :amount="sobre.length" :format="entero" :tone="sobre.length > 0 ? 'warning' : 'success'" hint="No comprar más" />
    </div>

    <div class="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div class="rounded-xl border border-border bg-surface p-4">
        <h3 class="mb-2 text-[13px] font-bold text-text">Bajo el mínimo · {{ bajo.length }}</h3>
        <p v-if="bajo.length === 0" class="text-[12px] text-text-soft">Nada por debajo de su mínimo.</p>
        <ul v-else class="flex max-h-64 flex-col gap-1 overflow-y-auto">
          <li v-for="m in bajo.slice(0, 40)" :key="m.id" class="flex items-center justify-between gap-2 border-b border-border/60 pb-1 text-[12px] last:border-0">
            <router-link :to="ruta(m)" class="min-w-0 truncate text-text no-underline hover:text-vz-blue" :title="m.nombre">{{ m.nombre }}</router-link>
            <span class="shrink-0 font-bold text-vz-danger">{{ m.cantidadActual }} / mín. {{ m.minimo }} {{ m.unidadMedida }}</span>
          </li>
        </ul>
      </div>
      <div class="rounded-xl border border-border bg-surface p-4">
        <h3 class="mb-2 text-[13px] font-bold text-text">Sobre el máximo · {{ sobre.length }}</h3>
        <p v-if="sobre.length === 0" class="text-[12px] text-text-soft">Nada por encima de su máximo.</p>
        <ul v-else class="flex max-h-64 flex-col gap-1 overflow-y-auto">
          <li v-for="m in sobre.slice(0, 40)" :key="m.id" class="flex items-center justify-between gap-2 border-b border-border/60 pb-1 text-[12px] last:border-0">
            <router-link :to="ruta(m)" class="min-w-0 truncate text-text no-underline hover:text-vz-blue" :title="m.nombre">{{ m.nombre }}</router-link>
            <span class="shrink-0 font-bold text-vz-warning">{{ m.cantidadActual }} / máx. {{ m.maximo }} {{ m.unidadMedida }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useAuth } from 'src/lib/auth'
import { equiposVisibles, materialesVisibles, tipoDeFamilia } from 'src/lib/vistaRol'
import KpiCard from 'components/KpiCard.vue'

/**
 * Resumen de existencias SIN dinero para Adquisiciones: totales, materiales bajo el mínimo y sobre el máximo (cantidades).
 * No muestra costos, valores ni gasto (lib/access.js → inventarioSinDinero).
 */
const { user } = useAuth()
const entero = (n) => String(Math.round(n))

const materiales = computed(() => (user.value ? materialesVisibles(user.value.role) : []))
const equipos = computed(() => (user.value ? equiposVisibles(user.value.role).filter((e) => e.estado !== 'baja') : []))

const unidades = computed(() => materiales.value.reduce((s, m) => s + m.cantidadActual, 0))
const equiposSistemas = computed(() => equipos.value.filter((e) => tipoDeFamilia(e.familiaId) === 'sistemas').length)
const equiposMtto = computed(() => equipos.value.filter((e) => tipoDeFamilia(e.familiaId) === 'mantenimiento').length)
const disponibles = computed(() => equipos.value.filter((e) => tipoDeFamilia(e.familiaId) === 'sistemas' && e.estado === 'disponible').length)
const asignados = computed(() => equipos.value.filter((e) => tipoDeFamilia(e.familiaId) === 'sistemas' && e.estado === 'asignado').length)

const bajo = computed(() => materiales.value.filter((m) => m.cantidadActual < m.minimo).sort((a, b) => a.cantidadActual / (a.minimo || 1) - b.cantidadActual / (b.minimo || 1)))
const sobre = computed(() => materiales.value.filter((m) => m.maximo != null && m.maximo > 0 && m.cantidadActual > m.maximo))

const ruta = (m) => `/mantenimiento?familia=${m.familiaId}&highlight=${m.id}`
</script>
