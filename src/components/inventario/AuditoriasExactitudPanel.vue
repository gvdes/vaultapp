<template>
  <div>
    <div class="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div class="rounded-xl border border-border bg-surface p-3">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-text-soft">Exactitud trimestral (todas las sucursales)</p>
        <p :class="`text-[24px] font-extrabold ${trimestral.pct === null ? 'text-text-soft' : trimestral.pct >= META_EXACTITUD_AUDITORIA ? 'text-vz-success' : 'text-vz-danger'}`">
          {{ trimestral.pct === null ? '—' : `${trimestral.pct}%` }}
        </p>
        <p class="text-[11.5px] text-text-muted">
          Meta ≥ {{ META_EXACTITUD_AUDITORIA }}% · {{ trimestral.coinciden }} de {{ trimestral.total }} partidas en {{ trimestral.auditorias }} auditoría(s) cerrada(s) en {{ FRECUENCIA_AUDITORIA_DIAS }} días.
        </p>
      </div>
    </div>

    <p v-if="sucursales.length === 0" class="rounded-xl border border-dashed border-border p-8 text-center text-[13px] text-text-soft">
      Aún no hay auditorías cerradas. La exactitud se calcula al cerrar cada auditoría.
    </p>

    <div class="flex flex-col gap-2">
      <div v-for="s in sucursales" :key="s.ubicacionId" class="rounded-xl border border-border bg-surface p-3.5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate font-bold text-text">{{ getUbicacion(s.ubicacionId)?.nombre ?? s.ubicacionId }}</p>
            <p class="text-[12px] text-text-muted">{{ s.puntos.length }} auditoría(s) cerrada(s)</p>
          </div>
          <div class="flex items-center gap-3">
            <svg v-if="s.puntos.length > 0" viewBox="0 0 120 36" class="h-9 w-28" role="img" :aria-label="`Tendencia de exactitud de ${getUbicacion(s.ubicacionId)?.nombre}`">
              <line x1="0" :y1="s.yMeta" x2="120" :y2="s.yMeta" stroke="currentColor" stroke-dasharray="3 3" class="text-border" stroke-width="1" />
              <polyline :points="s.linea" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" :class="s.cumple ? 'text-vz-success' : 'text-vz-danger'" />
              <circle v-for="(pt, i) in s.coords" :key="i" :cx="pt[0]" :cy="pt[1]" r="2.5" fill="currentColor" :class="s.cumple ? 'text-vz-success' : 'text-vz-danger'" />
            </svg>
            <div class="text-right">
              <p :class="`text-[20px] font-extrabold leading-tight ${s.cumple ? 'text-vz-success' : 'text-vz-danger'}`">{{ s.ultima === null ? '—' : `${s.ultima}%` }}</p>
              <p class="text-[11.5px] font-semibold" :class="s.tendencia.direccion === 'baja' ? 'text-vz-danger' : s.tendencia.direccion === 'sube' ? 'text-vz-success' : 'text-text-muted'">
                <template v-if="s.tendencia.delta === null">Primera medición</template>
                <template v-else-if="s.tendencia.direccion === 'sube'">▲ +{{ s.tendencia.delta }} pts</template>
                <template v-else-if="s.tendencia.direccion === 'baja'">▼ {{ s.tendencia.delta }} pts</template>
                <template v-else>= sin cambio</template>
              </p>
            </div>
          </div>
        </div>
        <details class="mt-2 text-[12px]">
          <summary class="cursor-pointer font-semibold text-text-muted">Ver historial</summary>
          <ul class="mt-1.5 flex flex-col gap-1">
            <li v-for="p in [...s.puntos].reverse()" :key="p.auditoriaId" class="flex items-center justify-between gap-2">
              <button type="button" class="text-vz-blue hover:underline" @click="emit('abrir', p.auditoriaId)">{{ new Date(p.fecha).toLocaleDateString('es-MX') }}</button>
              <span class="text-text-muted">{{ p.coinciden }} de {{ p.total }} partidas</span>
              <span :class="`font-bold ${p.pct !== null && p.pct >= META_EXACTITUD_AUDITORIA ? 'text-vz-success' : 'text-vz-danger'}`">{{ p.pct === null ? '—' : `${p.pct}%` }}</span>
            </li>
          </ul>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { getUbicacion } from 'src/lib/inventario/comunes'
import {
  exactitudPeriodo,
  FRECUENCIA_AUDITORIA_DIAS,
  historialExactitud,
  META_EXACTITUD_AUDITORIA,
  tendenciaExactitud,
} from 'src/lib/inventario/auditorias'

/** `tipos`: alcance por rol; sin valor = todas. */
const props = defineProps({ tipos: Array })
const emit = defineEmits(['abrir'])

const trimestral = computed(() => exactitudPeriodo(undefined, props.tipos))

// Eje Y del sparkline: de `piso` a 100 (la meta queda como línea punteada).
const W = 120
const H = 36
const PAD = 4

const sucursales = computed(() => {
  const todas = historialExactitud(undefined, props.tipos)
  const ids = [...new Set(todas.map((p) => p.ubicacionId))]
  return ids
    .map((ubicacionId) => {
      const puntos = todas.filter((p) => p.ubicacionId === ubicacionId)
      const validos = puntos.filter((p) => p.pct !== null)
      const piso = Math.min(90, ...validos.map((p) => p.pct))
      const y = (v) => PAD + (1 - (v - piso) / Math.max(1, 100 - piso)) * (H - PAD * 2)
      const coords = validos.map((p, i) => [validos.length === 1 ? W / 2 : PAD + (i / (validos.length - 1)) * (W - PAD * 2), y(p.pct)])
      const ultima = validos.length > 0 ? validos[validos.length - 1].pct : null
      return {
        ubicacionId,
        puntos,
        coords,
        linea: coords.map((c) => `${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' '),
        yMeta: y(META_EXACTITUD_AUDITORIA),
        ultima,
        cumple: ultima !== null && ultima >= META_EXACTITUD_AUDITORIA,
        tendencia: tendenciaExactitud(ubicacionId, props.tipos),
      }
    })
    .sort((a, b) => (a.ultima ?? 101) - (b.ultima ?? 101))
})
</script>
