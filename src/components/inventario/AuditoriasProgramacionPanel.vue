<template>
  <div>
    <p class="mb-3 text-[12.5px] text-text-muted">
      GV-INF-008 pide auditar cada sucursal con apoyo de sus Gerentes, trimestralmente (cada {{ FRECUENCIA_AUDITORIA_DIAS }} días). La próxima fecha se calcula desde el
      último cierre; las vencidas aparecen en rojo.
    </p>

    <div class="mb-3 grid grid-cols-3 gap-2 text-center">
      <div class="rounded-xl border border-border bg-surface p-2.5">
        <p :class="`text-[20px] font-extrabold ${vencidas > 0 ? 'text-vz-danger' : 'text-text'}`">{{ vencidas }}</p>
        <p class="text-[11px] text-text-muted">Vencidas</p>
      </div>
      <div class="rounded-xl border border-border bg-surface p-2.5">
        <p class="text-[20px] font-extrabold text-vz-warning">{{ proximas }}</p>
        <p class="text-[11px] text-text-muted">Vencen en 30 días</p>
      </div>
      <div class="rounded-xl border border-border bg-surface p-2.5">
        <p class="text-[20px] font-extrabold text-vz-success">{{ alDia }}</p>
        <p class="text-[11px] text-text-muted">Al corriente</p>
      </div>
    </div>

    <p v-if="filas.length === 0" class="rounded-xl border border-dashed border-border p-8 text-center text-[13px] text-text-soft">
      Todavía no hay sucursales con inventario por programar.
    </p>

    <div class="flex flex-col gap-2">
      <div
        v-for="p in filas"
        :key="p.ubicacionId"
        :class="`rounded-xl border bg-surface p-3.5 ${p.vencida ? 'border-vz-danger/50' : 'border-border'}`"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate font-bold text-text">{{ getUbicacion(p.ubicacionId)?.nombre ?? p.ubicacionId }}</p>
            <p class="text-[12px] text-text-muted">
              <template v-if="p.nunca">Nunca auditada</template>
              <template v-else>Última auditoría: {{ fecha(p.ultimoCierre) }}<template v-if="p.exactitudUltima !== null"> · exactitud {{ p.exactitudUltima }}%</template></template>
            </p>
            <p :class="`text-[12px] font-semibold ${p.vencida ? 'text-vz-danger' : 'text-text-muted'}`">
              <template v-if="p.nunca">Próxima: ya toca (sin auditoría registrada)</template>
              <template v-else-if="p.vencida">Próxima: {{ fecha(p.proxima) }} · vencida hace {{ Math.abs(p.dias) }} día(s)</template>
              <template v-else>Próxima: {{ fecha(p.proxima) }} · en {{ p.dias }} día(s)</template>
            </p>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-1.5">
            <StatusPill v-if="p.vencida" :label="p.nunca ? 'Sin auditar' : 'Vencida'" tone="danger" />
            <StatusPill v-else-if="p.dias <= 30" label="Próxima a vencer" tone="warning" />
            <StatusPill v-else label="Al corriente" tone="success" />
            <StatusPill v-if="p.abiertaEstado" :label="`Abierta: ${ESTADO_AUDITORIA_LABEL[p.abiertaEstado]}`" tone="info" />
            <StatusPill v-if="p.sorpresa" label="Sorpresa" tone="neutral" />
            <StatusPill v-if="p.programadaVencida" label="Fecha programada vencida" tone="danger" />
          </div>
        </div>
        <p v-if="p.fechaProgramada" class="mt-1 text-[12px] text-text-muted">Programada para {{ fecha(new Date(`${p.fechaProgramada}T00:00:00`).getTime()) }}</p>
        <div class="mt-2.5 flex flex-wrap gap-2">
          <button
            v-if="p.abiertaId"
            type="button"
            class="h-8 rounded-lg border border-border bg-bg px-3 text-[12px] font-bold text-text-muted hover:bg-surface-hover"
            @click="emit('abrir', p.abiertaId)"
          >
            Abrir auditoría en curso
          </button>
          <template v-else-if="puedeCrear">
            <button type="button" class="h-8 rounded-lg bg-vz-blue px-3 text-[12px] font-bold text-white hover:bg-primary-hover" @click="emit('programar', p.ubicacionId, false)">
              Programar auditoría
            </button>
            <button
              type="button"
              class="h-8 rounded-lg border border-border bg-bg px-3 text-[12px] font-bold text-text-muted hover:bg-surface-hover"
              @click="emit('programar', p.ubicacionId, true)"
            >
              Auditoría sorpresa
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import StatusPill from 'components/StatusPill.vue'
import { getUbicacion } from 'src/lib/inventario/comunes'
import { ESTADO_AUDITORIA_LABEL, FRECUENCIA_AUDITORIA_DIAS, programacionAuditorias } from 'src/lib/inventario/auditorias'

/** `tipos`: alcance por rol (Soporte = solo sistemas, Mantenimiento = solo mantenimiento); sin valor = todas. */
const props = defineProps({ puedeCrear: { type: Boolean, required: true }, tipos: Array })
const emit = defineEmits(['programar', 'abrir'])

const filas = computed(() => programacionAuditorias(props.tipos))
const vencidas = computed(() => filas.value.filter((p) => p.vencida).length)
const proximas = computed(() => filas.value.filter((p) => !p.vencida && p.dias <= 30).length)
const alDia = computed(() => filas.value.filter((p) => !p.vencida && p.dias > 30).length)

const fecha = (t) => (t === null ? '—' : new Date(t).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }))
</script>
