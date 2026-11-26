<template>
  <ol class="m-0 flex list-none flex-col p-0 sm:flex-row" aria-label="Etapas de tu requisición">
    <li
      v-for="(s, i) in pasos"
      :key="s.id"
      :class="`relative flex gap-3.5 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:text-center ${i < pasos.length - 1 ? 'pb-6 sm:pb-0' : ''}`"
      :aria-current="s.estado === 'actual' ? 'step' : undefined"
    >
      <!-- Conector: vertical en celular, horizontal desde sm -->
      <span
        v-if="i < pasos.length - 1"
        :class="`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 sm:left-1/2 sm:top-[15px] sm:h-0.5 sm:w-full ${pasos[i + 1].estado === 'pendiente' || (s.estado !== 'hecho') ? 'bg-border' : 'bg-vz-success'}`"
        aria-hidden="true"
      />

      <span :class="`${circulo(s.estado)} relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold`" aria-hidden="true">
        <svg v-if="s.estado === 'hecho'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        <svg v-else-if="s.estado === 'detenido'" viewBox="0 0 24 24" fill="currentColor" class="h-3.5 w-3.5"><path d="M7 5h3.5v14H7zM13.500 5H17v14h-3.500z" /></svg>
        <svg v-else-if="s.estado === 'cortado'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="h-3.5 w-3.5"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
        <template v-else>{{ i + 1 }}</template>
      </span>

      <div class="min-w-0 pt-0.5 sm:pt-0">
        <p :class="`text-[13.5px] leading-tight ${s.estado === 'pendiente' ? 'font-semibold text-text-soft' : 'font-extrabold text-text'}`">
          {{ s.label }}
          <span class="sr-only"> — {{ textoSr(s.estado) }}</span>
        </p>
        <p v-if="s.fecha" class="mt-0.5 text-[12px] leading-tight text-text-muted">{{ fechaHora(s.fecha) }}</p>
        <p v-else-if="s.estado === 'actual'" class="mt-0.5 text-[12px] font-semibold leading-tight text-vz-blue">En curso</p>
        <p v-else-if="s.estado === 'detenido' || s.estado === 'cortado'" class="mt-0.5 text-[12px] font-semibold leading-tight text-vz-warning">Se detuvo aquí</p>
      </div>
    </li>
  </ol>
</template>

<script setup>
import { computed } from 'vue'
import { ESTADOS, ESTADOS_FLUJO } from 'src/lib/compras'
import { fechaHora } from './estilos'

const props = defineProps({ estado: { type: String, required: true }, historial: { type: Array, required: true } })

const ETIQUETAS = {
  recibida: 'Recibida',
  en_cotizacion: 'En cotización',
  en_autorizacion: 'En autorización',
  autorizada: 'Autorizada',
  fondeada: 'Dinero entregado',
  comprada: 'Comprada',
  entregada: 'Entregada',
}

/** @typedef {'hecho' | 'actual' | 'pendiente' | 'detenido' | 'cortado'} EstadoPaso */

/** Índice del último paso del flujo principal alcanzado (si está en un estado lateral, donde se quedó). */
const indice = computed(() => {
  const info = ESTADOS[props.estado]
  if (!info.lateral) return ESTADOS_FLUJO.indexOf(props.estado)
  let max = 0
  for (const h of props.historial) {
    const k = ESTADOS_FLUJO.indexOf(h.estado)
    if (k > max) max = k
  }
  return max
})

const pasos = computed(() =>
  ESTADOS_FLUJO.map((id, i) => {
    const entradas = props.historial.filter((h) => h.estado === id)
    const fecha = entradas.length ? entradas[entradas.length - 1].fecha : undefined
    const lateral = ESTADOS[props.estado].lateral
    let estado
    if (props.estado === 'entregada') estado = 'hecho'
    else if (i < indice.value) estado = 'hecho'
    else if (i === indice.value) estado = lateral ? (props.estado === 'en_espera' ? 'detenido' : 'cortado') : 'actual'
    else estado = 'pendiente'
    return { id, label: ETIQUETAS[id] ?? ESTADOS[id].corta, fecha, estado }
  }),
)

function circulo(e) {
  switch (e) {
    case 'hecho':
      return 'bg-vz-success text-white'
    case 'actual':
      return 'bg-vz-blue text-white ring-4 ring-vz-blue/25'
    case 'detenido':
      return 'bg-vz-warning text-white ring-4 ring-vz-warning/25'
    case 'cortado':
      return 'bg-vz-danger text-white ring-4 ring-vz-danger/25'
    default:
      return 'border-2 border-border bg-surface text-text-soft'
  }
}
function textoSr(e) {
  return e === 'hecho' ? 'completado' : e === 'actual' ? 'en curso' : e === 'pendiente' ? 'pendiente' : 'detenido'
}
</script>
