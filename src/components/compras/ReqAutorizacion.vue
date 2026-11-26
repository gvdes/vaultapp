<template>
  <div v-if="req" class="flex flex-col gap-4">
    <!-- Quién autoriza -->
    <div class="rounded-xl border border-border bg-surface p-4">
      <h3 class="text-[13px] font-bold text-text">Quién debe autorizar</h3>
      <p class="mt-1 text-[12.5px] text-text-muted">
        Un solo nivel de decisión: <strong class="text-text">Finanzas</strong>. La solicitud le llega a <strong class="text-text">todos los aprobadores cuyo tope de aprobación cubre el monto</strong> y basta
        <strong class="text-text">uno</strong>. <strong class="text-text">Dirección no aprueba</strong>: si la compra pasa de {{ formatoMoneda(umbral) }} solo recibe un aviso informativo.
      </p>
      <p class="mt-2 text-[12.5px] text-text">
        <template v-if="monto > 0">
          Monto de la cotización elegida: <strong>{{ formatoMoneda(monto) }}</strong>.
          <span :class="est.avisaDireccion ? 'font-bold text-vz-warning' : 'font-bold text-vz-success'">{{ resumenAviso }}</span>
        </template>
        <template v-else>Aún no hay una cotización elegida.</template>
      </p>
      <p v-if="excepcion" class="mt-2 rounded-lg border border-vz-gold/60 bg-vz-gold/12 px-3 py-2 text-[12.5px] text-text" data-test="excepcion-cotizaciones"><span class="font-bold">Excepción de cotizaciones:</span> {{ excepcion }}</p>
      <p v-else-if="cotizacionesTexto" class="mt-2 text-[12px] text-text-muted" data-test="cotizaciones-requeridas">{{ cotizacionesTexto }}</p>
      <p v-if="leyendaMenor" class="mt-2 rounded-lg border border-vz-warning/40 bg-vz-warning/10 px-3 py-2 text-[12.5px] font-bold text-text" data-test="leyenda-compra-menor">{{ leyendaMenor }}</p>
      <div v-if="monto > 0" class="mt-2.5">
        <p class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Le llega a (aprobadores elegibles)</p>
        <ul v-if="est.elegibles.length" class="m-0 mt-1 flex list-none flex-wrap gap-1.5 p-0">
          <li v-for="p in est.elegibles" :key="p.id" class="rounded-full border border-vz-blue/30 bg-vz-blue/8 px-2.5 py-1 text-[12px] font-semibold text-text">
            {{ p.nombre }} <span class="font-normal text-text-muted">· {{ p.topeAprobacion === undefined || p.topeAprobacion === null ? 'sin tope' : `tope ${formatoMoneda(p.topeAprobacion)}` }}</span>
          </li>
        </ul>
        <p v-else role="alert" class="mt-1 rounded-lg border border-vz-danger/40 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">
          {{ MSG_SIN_APROBADOR }} Agrega o activa a un aprobador en Directorio (rol «Finanzas») con un tope que cubra {{ formatoMoneda(monto) }}, o déjalo sin tope.
        </p>
      </div>
      <p v-if="est.avisaDireccion" class="mt-2 text-[12px] text-text-muted">
        <strong class="text-text">Aviso a Dirección:</strong>
        <template v-if="avisados.length">{{ avisados.map((p) => p.nombre).join(', ') }} {{ yaEnviada ? 'recibió' : 'recibirá' }} un correo informativo (sin botones); no requiere su autorización.</template>
        <template v-else>no hay nadie con rol «Dirección» y correo en el directorio, así que no saldrá ningún aviso.</template>
      </p>
    </div>

    <!-- Paso de Finanzas -->
    <div :class="`rounded-xl border p-3.5 ${paso.clase}`">
      <p class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Decisión de Finanzas</p>
      <p class="mt-0.5 text-[14px] font-extrabold text-text">{{ paso.titulo }}</p>
      <p v-if="paso.detalle" class="text-[12px] text-text-muted">{{ paso.detalle }}</p>
      <p v-if="paso.comentario" class="mt-1 text-[12px] italic text-text-muted">«{{ paso.comentario }}»</p>
    </div>

    <!-- Proveedor elegido (catálogo): se registra ANTES de pedir la autorización -->
    <ReqProveedor :folio="folio" />

    <!-- Solicitar autorización -->
    <div v-if="puedeCotizar && req.estado === 'en_cotizacion'" class="rounded-xl border border-border bg-surface p-4">
      <h3 class="text-[13px] font-bold text-text">Enviar a autorización</h3>
      <p v-if="falta" class="mt-1 text-[12.5px] font-semibold text-vz-warning">{{ falta }}</p>
      <p v-else class="mt-1 text-[12.5px] text-text-muted">
        Se enviará el resumen con el comparativo y los botones para aprobar o rechazar a {{ est.elegibles.map((p) => p.nombre).join(' y ') || 'los aprobadores de Finanzas' }} (basta uno).
      </p>
      <p v-if="errorSolicitud" role="alert" class="mt-2 text-[12.5px] font-semibold text-vz-danger">{{ errorSolicitud }}</p>
      <div class="mt-3 flex justify-end"><button type="button" :class="btnPrimary" :disabled="enviando || !!falta" @click="solicitar">{{ enviando ? 'Enviando…' : 'Enviar a autorización' }}</button></div>
    </div>

    <!-- Decisión en la app -->
    <div v-if="decide.ok && req.estado === 'en_autorizacion' && est.pendiente" class="rounded-xl border border-vz-blue/30 bg-vz-blue/5 p-4">
      <h3 class="text-[13px] font-bold text-text">Tu decisión (Finanzas)</h3>
      <p class="mt-1 text-[12.5px] text-text-muted">Equivale a aprobar o rechazar desde el correo; queda registrada con tu nombre, fecha y comentario.</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" :class="btnOk" @click="decision = 'aprobada'">Aprobar</button>
        <button type="button" :class="btnWarn" @click="decision = 'ajuste'">Pedir ajuste</button>
        <button type="button" :class="btnDanger" @click="decision = 'rechazada'">Rechazar</button>
      </div>
    </div>

    <!-- Por qué esta persona no decide aquí -->
    <div v-else-if="req.estado === 'en_autorizacion' && est.pendiente && sinDecision" class="rounded-xl border border-border bg-surface p-4 text-[12.5px] text-text-muted">
      <h3 class="text-[13px] font-bold text-text">{{ sinDecision.titulo }}</h3>
      <p class="mt-1">{{ sinDecision.texto }}</p>
    </div>

    <!-- Compra ya aprobada que sigue en autorización (cambio de regla) -->
    <div v-if="req.estado === 'en_autorizacion' && est.completa && esFinanzas" class="rounded-xl border border-vz-success/40 bg-vz-success/5 p-4">
      <h3 class="text-[13px] font-bold text-text">Ya cuenta con la aprobación de Finanzas</h3>
      <p class="mt-1 text-[12.5px] text-text-muted">Con la regla de un solo nivel esta compra ya está autorizada; falta pasarla a «Autorizada» (el pago se avisa a Tesorería o a Cuentas por pagar según la forma de pago).</p>
      <p v-if="errorYa" role="alert" class="mt-2 text-[12.5px] font-semibold text-vz-danger">{{ errorYa }}</p>
      <div class="mt-3 flex justify-end"><button type="button" :class="btnOk" :disabled="autorizandoYa" @click="autorizarYa">{{ autorizandoYa ? 'Autorizando…' : 'Pasar a Autorizada' }}</button></div>
    </div>

    <!-- Historial de decisiones -->
    <div class="rounded-xl border border-border bg-surface">
      <h3 class="border-b border-border px-4 py-3 text-[13px] font-bold text-text">Decisiones registradas</h3>
      <p v-if="aprobaciones.length === 0" class="px-4 py-6 text-center text-[12.5px] text-text-soft">Todavía no hay decisiones.</p>
      <ul v-else class="divide-y divide-border">
        <li v-for="a in aprobaciones" :key="a.id" class="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-[12.5px]">
          <span :class="`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${TONE_STYLES[DECISION_TONO[a.decision]]}`">{{ DECISION_LABEL[a.decision] }}</span>
          <div class="min-w-0 flex-1">
            <p class="text-text"><strong>{{ a.aprobadorNombre }}</strong> · {{ NIVEL_LABEL[a.nivel] }} · {{ a.via === 'correo' ? 'desde la liga del correo' : 'desde la app' }}</p>
            <p v-if="a.comentario" class="text-text-muted">{{ a.comentario }}</p>
          </div>
          <div class="text-right text-[11.5px] text-text-soft">
            <p>{{ fechaHora(a.fecha) }}</p>
            <p v-if="a.monto">{{ formatoMoneda(a.monto) }}</p>
          </div>
        </li>
      </ul>
    </div>

    <!-- Ligas de aprobación: solo en la demostración local (con Supabase las ligas viven en el correo y nadie las lee desde la app) -->
    <div v-if="esAdmin && modoDemo" class="rounded-xl border border-border bg-surface">
      <h3 class="border-b border-border px-4 py-3 text-[13px] font-bold text-text">Ligas de aprobación emitidas (demostración)</h3>
      <p class="px-4 pt-2 text-[11.5px] text-text-soft">
        Solo en modo demostración: con Supabase las ligas viajan únicamente por correo y nadie las lee desde la plataforma. Cada liga es de un solo uso y expira; abrirla no ejecuta nada, solo permite decidir.
      </p>
      <p v-if="enlaces.length === 0" class="px-4 py-5 text-center text-[12.5px] text-text-soft">No hay ligas emitidas para esta requisición.</p>
      <ul v-else class="divide-y divide-border">
        <li v-for="l in enlaces" :key="l.token" class="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[12.5px]">
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-text">{{ l.nivel ? NIVEL_LABEL[l.nivel] : 'Aprobador' }} · {{ l.aprobadorNombre || 'aprobador' }}</p>
            <p class="truncate text-[11px] text-text-soft">{{ l.aprobadorCorreo }}</p>
          </div>
          <span :class="`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${TONE_STYLES[l.usado ? 'neutral' : l.expirado ? 'danger' : 'success']}`">{{ l.usado ? 'Usada' : l.expirado ? 'Expirada' : 'Vigente' }}</span>
          <div v-if="!l.usado && !l.expirado" class="flex gap-1">
            <button type="button" :class="btnMini" @click="copiar(l.url)">Copiar</button>
            <a :href="l.url" target="_blank" rel="noopener" :class="btnMini">Abrir</a>
          </div>
        </li>
      </ul>
    </div>

    <DecisionModal v-if="decision && decide.ok" :folio="folio" nivel="finanzas" :decision="decision" @close="decision = null" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  MSG_SIN_APROBADOR,
  autorizarYaAprobada,
  comprasModoLocal,
  cotizacionElegida,
  estadoAutorizacion,
  formatoMoneda,
  getConfig,
  completasDistintas,
  cotizacionesRequeridas,
  getRequisicion,
  leyendaCompraMenor,
  textoExcepcion,
  listAprobaciones,
  listEnlacesAprobacion,
  motivoNoPuedePasarA,
  NIVEL_LABEL,
  participantesPorRol,
  puedeDecidirFolio,
  solicitarAutorizacion,
} from 'src/lib/compras'
import { TONE_STYLES } from 'components/statusMaps'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'
import DecisionModal from './DecisionModal.vue'
import ReqProveedor from './ReqProveedor.vue'
import { useAcceso } from './useAcceso'
import { btnDanger, btnMini, btnOk, btnPrimary, btnWarn, fechaHora } from './util'

const props = defineProps({ folio: { type: String, required: true } })
const toast = useToast()
const { puedeCotizar, esAdmin, esFinanzas } = useAcceso()
const modoDemo = comprasModoLocal()

const DECISION_LABEL = { aprobada: 'Aprobó', rechazada: 'Rechazó', ajuste: 'Pidió ajuste' }
const DECISION_TONO = { aprobada: 'success', rechazada: 'danger', ajuste: 'warning' }

const req = computed(() => getRequisicion(props.folio))
const est = computed(() => estadoAutorizacion(props.folio))
const monto = computed(() => est.value.monto)
const umbral = computed(() => est.value.umbralDireccion)
const avisados = computed(() => participantesPorRol('direccion').filter((p) => p.correo?.trim()))
/** La requisición ya salió de cotización: el aviso a Dirección ya se mandó. */
const yaEnviada = computed(() => !!req.value && req.value.estado !== 'recibida' && req.value.estado !== 'en_cotizacion')
const resumenAviso = computed(() =>
  est.value.avisaDireccion
    ? `Rebasa ${formatoMoneda(umbral.value)} por ${formatoMoneda(monto.value - umbral.value)}: la autoriza Finanzas y Dirección solo recibe aviso.`
    : `No rebasa ${formatoMoneda(umbral.value)}: la autoriza Finanzas y Dirección no recibe aviso.`,
)
/** Compra menor: la cotización elegida es un registro (sin cotización); Finanzas debe verlo claramente. */
const leyendaMenor = computed(() => (cotizacionElegida(props.folio)?.esRegistro ? leyendaCompraMenor(getConfig().umbralSinCotizacion) : ''))
/** Excepción de cotizaciones documentada: Finanzas la ve junto al monto. */
const excepcion = computed(() => (req.value?.excepcionTipo || req.value?.excepcionCotizaciones?.trim() ? textoExcepcion(req.value) : ''))
/** Cotizaciones de proveedores distintos frente a las requeridas (solo desde el umbral simple). */
const cotizacionesTexto = computed(() => {
  const req_ = cotizacionesRequeridas(monto.value, !!cotizacionElegida(props.folio)?.esRegistro)
  return req_ > 1 ? `Cotizaciones de proveedores distintos: ${completasDistintas(props.folio)} de ${req_} requeridas.` : ''
})
const aprobaciones = computed(() => listAprobaciones(props.folio))
const enlaces = computed(() => listEnlacesAprobacion(props.folio))

const BASE = 'border-border bg-surface'
const paso = computed(() => {
  const a = est.value.finanzas
  const enAut = req.value?.estado === 'en_autorizacion'
  if (a) {
    const ok = a.decision === 'aprobada'
    return {
      titulo: ok ? `Aprobada por ${a.aprobadorNombre}` : a.decision === 'rechazada' ? `Rechazada por ${a.aprobadorNombre}` : `Ajuste pedido por ${a.aprobadorNombre}`,
      detalle: `${fechaHora(a.fecha)} · ${a.via === 'correo' ? 'por liga de correo' : 'desde la app'}`,
      comentario: a.comentario,
      clase: ok ? 'border-vz-success/40 bg-vz-success/5' : a.decision === 'rechazada' ? 'border-vz-danger/40 bg-vz-danger/5' : 'border-vz-warning/40 bg-vz-warning/5',
    }
  }
  if (enAut && est.value.pendiente) return { titulo: 'Pendiente de decisión', detalle: 'Esperando respuesta de un aprobador elegible (correo o app).', comentario: undefined, clase: 'border-vz-warning/40 bg-vz-warning/5' }
  return { titulo: 'Sin decisión en esta ronda', detalle: undefined, comentario: undefined, clase: BASE }
})

/** ¿Puede ESTE usuario decidir ahora? Solo el rol finanzas, ligado a un aprobador cuyo tope cubra el monto. */
const decide = computed(() => puedeDecidirFolio(props.folio))
/** Explicación para quien ve la requisición pero no puede decidir (Dirección, o un aprobador sin liga / sin tope suficiente). */
const sinDecision = computed(() => {
  if (esAdmin.value) return { titulo: 'Dirección no aprueba', texto: 'La decide Finanzas. Dirección consulta la requisición y recibe el aviso informativo de las compras grandes.' }
  if (esFinanzas.value && !decide.value.ok) return { titulo: 'No puedes decidir esta compra', texto: decide.value.motivo ?? '' }
  return null
})
const decision = ref(null)

const falta = computed(() => motivoNoPuedePasarA(props.folio, 'en_autorizacion'))
const errorSolicitud = ref('')
const enviando = ref(false)
async function solicitar() {
  errorSolicitud.value = ''
  enviando.value = true
  try {
    const r = await solicitarAutorizacion(props.folio)
    bump()
    toast(
      `Enviada a autorización: ${r.correosEnviados} correo${r.correosEnviados === 1 ? '' : 's'} a Finanzas (${r.aprobadores.join(', ')}; basta uno)${r.avisoDireccion ? `; Dirección recibe un aviso informativo (${r.avisosDireccion})` : ''}${r.avisosExcepcion ? '; Dirección recibe un aviso por la excepción de cotizaciones' : ''}.`,
    )
  } catch (e) {
    errorSolicitud.value = e instanceof Error && e.message ? e.message : 'No se pudo enviar a autorización.'
  } finally {
    enviando.value = false
  }
}

const errorYa = ref('')
const autorizandoYa = ref(false)
async function autorizarYa() {
  errorYa.value = ''
  autorizandoYa.value = true
  try {
    await autorizarYaAprobada(props.folio)
    bump()
    toast('Requisición autorizada.')
  } catch (e) {
    errorYa.value = e instanceof Error && e.message ? e.message : 'No se pudo autorizar.'
  } finally {
    autorizandoYa.value = false
  }
}

async function copiar(url) {
  try {
    await navigator.clipboard.writeText(url)
    toast('Liga copiada.')
  } catch {
    toast('No se pudo copiar; usa «Abrir».', 'error')
  }
}
</script>
