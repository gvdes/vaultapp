<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
      aria-label="Notificaciones"
      @click="open = !open"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4.5 w-4.5">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
        />
      </svg>
      <span
        v-if="notifs.length > 0"
        class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-vz-danger px-1 text-[9px] font-extrabold text-white"
      >
        {{ notifs.length }}
      </span>
    </button>

    <div v-if="open" class="absolute right-0 top-11 z-[80] w-80 max-w-[90vw] overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
      <div class="border-b border-border px-3 py-2 text-[12px] font-bold text-text">Notificaciones ({{ notifs.length }})</div>
      <div class="max-h-96 overflow-y-auto">
        <p v-if="notifs.length === 0" class="px-3 py-6 text-center text-[12px] text-text-soft">No hay pendientes por ahora.</p>
        <template v-for="g in grupos" :key="g.label">
          <p v-if="grupos.length > 1" class="border-b border-border/60 bg-bg px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-text-soft">{{ g.label }} ({{ g.items.length }})</p>
          <button
            v-for="n in g.items"
            :key="n.id"
            type="button"
            :class="`block w-full border-b border-border/60 px-3 py-2 text-left text-[12px] last:border-0 hover:bg-surface-hover ${toneDe(n)}`"
            @click="go(n.href)"
          >
            <p class="font-bold text-text">{{ n.titulo }}</p>
            <p class="truncate text-text-muted">{{ n.detalle }}</p>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getNotificaciones } from 'src/lib/notificaciones'

const TONE = {
  solicitud_pendiente: 'border-vz-blue/20 bg-vz-blue/5',
  solicitud_pendiente_compra: 'border-vz-danger/20 bg-vz-danger/5',
  stock_bajo: 'border-vz-danger/20 bg-vz-danger/5',
  mantenimiento_proximo: 'border-vz-warning/20 bg-vz-warning/5',
  garantia_por_vencer: 'border-vz-warning/20 bg-vz-warning/5',
  control_alta: 'border-vz-danger/20 bg-vz-danger/5',
  control_media: 'border-vz-warning/20 bg-vz-warning/5',
  mis_pendientes: 'border-vz-blue/20 bg-vz-blue/5',
}
const TONE_PENDIENTE = {
  alta: 'border-vz-danger/20 bg-vz-danger/5',
  media: 'border-vz-warning/20 bg-vz-warning/5',
  baja: 'border-vz-blue/20 bg-vz-blue/5',
}
const toneDe = (n) => (n.tipo === 'mis_pendientes' && n.severidad ? TONE_PENDIENTE[n.severidad] : TONE[n.tipo])

const router = useRouter()
const open = ref(false)
const root = ref(null)
const notifs = computed(() => getNotificaciones())
// Grupos: "Para ti" (lo que le toca al rol) primero, luego "Control" (alertas, enlazan a Inicio) y el resto operativo.
const grupos = computed(() => {
  const esControl = (n) => n.tipo === 'control_alta' || n.tipo === 'control_media'
  return [
    { label: 'Para ti', items: notifs.value.filter((n) => n.tipo === 'mis_pendientes') },
    { label: 'Control', items: notifs.value.filter(esControl) },
    { label: 'Pendientes', items: notifs.value.filter((n) => !esControl(n) && n.tipo !== 'mis_pendientes') },
  ].filter((g) => g.items.length > 0)
})

function go(href) {
  open.value = false
  void router.push(href)
}

function onDocClick(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
</script>
