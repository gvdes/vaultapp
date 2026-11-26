<template>
  <div>
    <p v-if="modoDemo" class="mb-3 rounded-lg border border-vz-blue/30 bg-vz-blue/10 px-3 py-2 text-[12px] text-text-muted">
      <strong class="text-text">Vista previa de correos.</strong>
      En modo demostración la plataforma nunca envía correos: cada aviso queda en la bandeja como «simulado» y puedes revisar cómo se vería.
    </p>
    <p v-else class="mb-3 rounded-lg border border-border bg-bg px-3 py-2 text-[12px] text-text-muted">
      Bandeja de salida: un emisor externo envía los correos «pendientes» y los marca como «enviado» (o «error»).
    </p>

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <button
        v-for="e in estadosFiltro"
        :key="e.id"
        type="button"
        :class="`rounded-full border px-2.5 py-1 text-[11.5px] font-bold ${filtroEstado === e.id ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-surface text-text-muted hover:bg-surface-hover'}`"
        @click="filtroEstado = e.id"
      >
        {{ e.label }} <span class="ml-0.5 text-text-soft">{{ e.n }}</span>
      </button>
      <input v-if="!folio" v-model="texto" type="search" :class="`${inputClass} ml-auto max-w-[240px]`" placeholder="Buscar asunto, destinatario o folio" aria-label="Buscar correos" />
    </div>

    <div v-if="correos.length === 0" class="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-[13px] text-text-soft">
      No hay correos {{ filtroEstado === 'todos' ? '' : 'con este estado ' }}{{ folio ? 'para esta requisición' : 'todavía' }}.
    </div>

    <div v-else class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ul class="flex max-h-[560px] flex-col gap-1.5 overflow-y-auto pr-1">
        <li v-for="c in correos" :key="c.id">
          <button
            type="button"
            :class="`w-full rounded-lg border p-2.5 text-left ${seleccionado?.id === c.id ? 'border-vz-blue bg-vz-blue/5' : 'border-border bg-surface hover:bg-surface-hover'}`"
            @click="seleccionId = c.id"
          >
            <div class="flex items-start justify-between gap-2">
              <p class="line-clamp-2 text-[12.5px] font-bold text-text">{{ c.asunto }}</p>
              <span :class="`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-bold ${TONE_STYLES[ESTADO_CORREO_TONO[c.estado]]}`">{{ ESTADO_CORREO_LABEL[c.estado] }}</span>
            </div>
            <p class="mt-0.5 truncate text-[11.5px] text-text-muted">Para: {{ c.paraNombre ? `${c.paraNombre} · ` : '' }}{{ c.paraCorreo }}</p>
            <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-text-soft">
              <span>{{ fechaHora(c.createdAt) }}</span>
              <span>{{ TIPO_LABEL[c.tipo] }}</span>
              <span v-if="c.requisicionId && !folio" class="font-mono">{{ c.requisicionId }}</span>
            </p>
            <p v-if="c.estado === 'error' && c.error" class="mt-1 text-[11px] font-semibold text-vz-danger">{{ c.error }}</p>
          </button>
        </li>
      </ul>

      <div v-if="seleccionado" class="min-w-0 rounded-xl border border-border bg-surface">
        <div class="border-b border-border px-3 py-2">
          <p class="text-[13px] font-extrabold text-text">{{ seleccionado.asunto }}</p>
          <p class="text-[11.5px] text-text-muted">Para: {{ seleccionado.paraNombre ? `${seleccionado.paraNombre} · ` : '' }}{{ seleccionado.paraCorreo }}</p>
          <p v-if="seleccionado.requisicionId && folio !== seleccionado.requisicionId" class="text-[11.5px]">
            <RouterLink :to="RUTAS_COMPRAS.requisicion(seleccionado.requisicionId)" class="font-semibold text-vz-blue hover:underline">Abrir {{ seleccionado.requisicionId }}</RouterLink>
          </p>
        </div>
        <!-- Sin scripts; los enlaces se abren en pestaña nueva (sirve para probar las ligas de aprobación en demo). -->
        <iframe
          :srcdoc="srcdoc"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerpolicy="no-referrer"
          title="Vista previa del correo"
          class="block h-[460px] w-full rounded-b-xl bg-white"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { RUTAS_COMPRAS, comprasModoLocal, listNotificaciones } from 'src/lib/compras'
import { inputClass } from 'components/formClasses'
import { TONE_STYLES } from 'components/statusMaps'
import { fechaHora } from './util'

/** Vista previa de la bandeja de correos (`listNotificaciones`): toda o solo la de un folio. */
const props = defineProps({ folio: String })

const ESTADO_CORREO_LABEL = { pendiente: 'Pendiente', enviando: 'Enviando', enviado: 'Enviado', simulado: 'Simulado', error: 'Error' }
const ESTADO_CORREO_TONO = { pendiente: 'warning', enviando: 'info', enviado: 'success', simulado: 'info', error: 'danger' }
const TIPO_LABEL = {
  confirmacion_solicitante: 'Confirmación al solicitante',
  nueva_requisicion: 'Nueva requisición',
  autorizacion_finanzas: 'Autorización · Finanzas',
  aviso_direccion: 'Aviso informativo · Dirección',
  aviso_excepcion_cotizaciones: 'Aviso · Excepción de cotizaciones',
  autorizacion_direccion: 'Autorización · Dirección (histórico)',
  autorizacion_ceo: 'Autorización · CEOs (histórico)',
  tesoreria_fondos: 'Fondos · Tesorería',
  pago_pendiente: 'Pago pendiente · Cuentas por pagar',
  estado_solicitante: 'Aviso de estado',
  estado_comprador: 'Aviso a Adquisiciones',
  alerta_finanzas: 'Alerta a Finanzas',
  recepcion_pendiente: 'Recepción pendiente',
}

const modoDemo = comprasModoLocal()
const filtroEstado = ref('todos')
const texto = ref('')
const seleccionId = ref('')

const base = computed(() => listNotificaciones({ folio: props.folio, texto: texto.value || undefined }))
const estadosFiltro = computed(() => [
  { id: 'todos', label: 'Todos', n: base.value.length },
  ...['pendiente', 'enviando', 'enviado', 'simulado', 'error'].map((id) => ({ id, label: ESTADO_CORREO_LABEL[id], n: base.value.filter((c) => c.estado === id).length })),
])
const correos = computed(() => (filtroEstado.value === 'todos' ? base.value : base.value.filter((c) => c.estado === filtroEstado.value)))
const seleccionado = computed(() => correos.value.find((c) => c.id === seleccionId.value) ?? correos.value[0])
const srcdoc = computed(() => `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body style="margin:0">${seleccionado.value?.cuerpoHtml ?? ''}</body></html>`)
</script>
