<template>
  <section v-if="visible" class="animate-fade-in-up mt-4" aria-labelledby="mis-pendientes-titulo">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 id="mis-pendientes-titulo" class="text-[14px] font-extrabold text-text">Tus pendientes</h2>
        <p class="text-[11.5px] text-text-muted">Lo que te toca resolver ahora, de lo más urgente a lo menos. Toca una tarjeta para ir directo.</p>
      </div>
      <div v-if="items.length > 0" class="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
        <span v-for="r in resumenSeveridad" :key="r.severidad" :class="`rounded-full border px-2 py-0.5 ${ESTILO[r.severidad].chip}`">{{ r.label }} · {{ r.n }}</span>
      </div>
    </div>

    <div
      v-if="items.length === 0"
      class="animate-fade-in-scale flex items-center gap-3 rounded-xl border border-vz-success/30 bg-vz-success/5 px-4 py-3.5 text-vz-success"
      role="status"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-6 w-6 shrink-0" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>
        <p class="text-[14px] font-extrabold">Todo al día</p>
        <p class="text-[12px] font-medium text-text-muted">No tienes nada pendiente por resolver. Buen trabajo.</p>
      </div>
    </div>

    <ul v-else class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="(p, i) in items" :key="p.id" class="animate-fade-in-up" :style="{ animationDelay: `${80 + i * 60}ms` }">
        <button
          type="button"
          :class="`group relative flex h-full w-full items-start gap-3 overflow-hidden rounded-xl border p-3.5 pl-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vz-blue ${ESTILO[p.severidad].card}`"
          :aria-label="`${p.conteo} ${p.corto}. ${p.titulo}. Severidad ${ESTILO[p.severidad].nombre}. Abrir.`"
          @click="ir(p.ruta)"
        >
          <span :class="`absolute inset-y-0 left-0 w-1 ${ESTILO[p.severidad].barra}`" aria-hidden="true" />
          <span :class="`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-2 text-[15px] font-extrabold ${ESTILO[p.severidad].badge}`">
            <AnimatedNumber :value="p.conteo" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[13px] font-bold leading-snug text-text">{{ p.titulo }}</span>
            <span class="mt-0.5 block text-[12px] leading-snug text-text-muted">{{ p.detalle }}</span>
            <span v-if="p.monto" class="mt-1 block text-[11px] font-semibold text-text-soft">{{ fmtMoney(p.monto) }}</span>
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="mt-1.5 h-4 w-4 shrink-0 text-text-soft transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from 'src/lib/auth'
import { getMisPendientes, rolTienePendientes } from 'src/lib/misPendientes'
import AnimatedNumber from 'components/AnimatedNumber.vue'

/** Tarjetas "Tus pendientes" del Inicio: lo que le toca al rol con sesión (Compras, inventario, auditorías). */
const router = useRouter()
const { user } = useAuth()

const ESTILO = {
  alta: { card: 'border-vz-danger/30 bg-vz-danger/5', badge: 'bg-vz-danger text-white', chip: 'border-vz-danger/30 bg-vz-danger/10 text-vz-danger', barra: 'bg-vz-danger', nombre: 'alta' },
  media: { card: 'border-vz-warning/40 bg-vz-warning/5', badge: 'bg-vz-warning text-[#1a1300]', chip: 'border-vz-warning/40 bg-vz-warning/10 text-vz-warning', barra: 'bg-vz-warning', nombre: 'media' },
  baja: { card: 'border-vz-blue/25 bg-vz-blue/5', badge: 'bg-vz-blue text-white', chip: 'border-vz-blue/30 bg-vz-blue/10 text-vz-blue', barra: 'bg-vz-blue', nombre: 'baja' },
}
const LABEL = { alta: 'Urgente', media: 'Atención', baja: 'Informativo' }

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const fmtMoney = (n) => currency.format(Math.round(n))

const visible = computed(() => (user.value ? rolTienePendientes(user.value.role) : false))
const items = computed(() => (user.value ? getMisPendientes(user.value.role) : []))
const resumenSeveridad = computed(() =>
  ['alta', 'media', 'baja']
    .map((severidad) => ({ severidad, label: LABEL[severidad], n: items.value.filter((p) => p.severidad === severidad).length }))
    .filter((r) => r.n > 0),
)

function ir(ruta) {
  // Las rutas que empiezan con # son anclas dentro del propio Inicio (p. ej. "Alertas de control").
  if (ruta.startsWith('#')) {
    const el = document.getElementById(ruta.slice(1))
    if (el) {
      let reducido = false
      try {
        reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      } catch {
        /* sin matchMedia */
      }
      el.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'start' })
    }
    return
  }
  void router.push(ruta)
}
</script>
