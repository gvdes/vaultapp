<template>
  <div v-if="req" class="flex flex-col gap-4">
    <!-- Diferencia vs autorizado -->
    <div v-if="rc.excede" :class="`rounded-xl border p-4 ${dif === 'pendiente_finanzas' ? 'border-vz-danger/40 bg-vz-danger/5' : 'border-vz-warning/40 bg-vz-warning/5'}`">
      <h3 class="text-[13px] font-bold text-text">
        {{ dif === 'aprobada' ? 'Diferencia aprobada por Finanzas' : dif === 'pendiente_finanzas' ? 'Lo comprado rebasa lo autorizado: pendiente de re-aprobación de Finanzas' : 'Lo comprado rebasa lo autorizado' }}
      </h3>
      <p class="mt-1 text-[12.5px] text-text-muted">
        Autorizado {{ formatoMoneda(rc.autorizado) }} · comprado {{ formatoMoneda(rc.totalReal) }} · diferencia <strong class="text-text">+{{ formatoMoneda(rc.diferencia) }}</strong>
        (tolerancia {{ rc.toleranciaPct }} %).
      </p>
      <p v-if="req.justificacionDiferencia" class="mt-1 text-[12.5px] text-text"><strong>Justificación:</strong> {{ req.justificacionDiferencia }}</p>
      <div v-if="req.estado === 'comprada' && dif === 'pendiente_finanzas' && puedeAprobar" class="mt-3">
        <button type="button" :class="btnWarn" @click="aprobandoDif = true">Aprobar diferencia</button>
      </div>
      <p v-else-if="req.estado === 'comprada' && dif === 'pendiente_finanzas'" class="mt-2 text-[12px] font-semibold text-vz-danger">Finanzas fue avisada por correo; la requisición sigue marcada hasta su decisión.</p>
    </div>

    <!-- Resumen por partida -->
    <div class="rounded-xl border border-border bg-surface">
      <h3 class="border-b border-border px-4 py-3 text-[13px] font-bold text-text">Lo comprado por partida</h3>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[760px] text-[12.5px]">
          <thead>
            <tr class="border-b border-border bg-bg text-left text-text-muted">
              <th class="px-3 py-2 font-bold">Partida</th>
              <th class="px-3 py-2 text-right font-bold">Pedida</th>
              <th class="px-3 py-2 text-right font-bold">Comprada</th>
              <th class="px-3 py-2 text-right font-bold">Costo cotizado</th>
              <th class="px-3 py-2 text-right font-bold">Costo real</th>
              <th class="px-3 py-2 text-right font-bold">Total real</th>
              <th class="px-3 py-2 text-right font-bold">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in rc.lineas" :key="l.partida.id" class="border-b border-border last:border-0">
              <td class="px-3 py-2 text-text">{{ l.partida.num }}. {{ l.partida.producto }}</td>
              <td class="px-3 py-2 text-right text-text-muted">{{ l.cantidadPedida }}</td>
              <td :class="`px-3 py-2 text-right font-semibold ${l.cantidadComprada === 0 ? 'text-vz-warning' : l.cantidadComprada < l.cantidadPedida ? 'text-vz-warning' : 'text-text'}`">{{ l.cantidadComprada }}</td>
              <td class="px-3 py-2 text-right text-text-muted">{{ l.costoCotizadoUnitario !== undefined ? formatoMoneda(l.costoCotizadoUnitario) : '—' }}</td>
              <td class="px-3 py-2 text-right text-text">{{ l.costoRealUnitario !== undefined ? formatoMoneda(l.costoRealUnitario) : '—' }}</td>
              <td class="px-3 py-2 text-right font-semibold text-text">{{ formatoMoneda(l.totalReal) }}</td>
              <td :class="`px-3 py-2 text-right font-semibold ${(l.diferencia ?? 0) > 0.005 ? 'text-vz-danger' : (l.diferencia ?? 0) < -0.005 ? 'text-vz-success' : 'text-text-muted'}`">
                {{ l.diferencia === undefined ? '—' : l.diferencia > 0.005 ? `+${formatoMoneda(l.diferencia)}` : l.diferencia < -0.005 ? `-${formatoMoneda(Math.abs(l.diferencia))}` : '—' }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="border-t border-border bg-bg font-bold">
              <td class="px-3 py-2 text-text" colspan="5">Total comprado (autorizado: {{ formatoMoneda(rc.autorizado) }})</td>
              <td class="px-3 py-2 text-right text-text">{{ formatoMoneda(rc.totalReal) }}</td>
              <td :class="`px-3 py-2 text-right ${rc.diferencia > 0.005 ? 'text-vz-danger' : 'text-text-muted'}`">{{ rc.totalReal > 0 ? (rc.diferencia > 0 ? '+' : '') + formatoMoneda(rc.diferencia) : '—' }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Registrar compra por partida -->
    <div v-if="puedeRegistrar" class="rounded-xl border border-vz-blue/30 bg-vz-blue/5 p-4">
      <h3 class="text-[13px] font-bold text-text">Registrar compra (costos reales)</h3>
      <p class="mb-3 text-[12px] text-text-muted">Registra por partida lo que realmente se pagó. Cada compra necesita número de factura o foto del ticket. Si compraste en partes, registra cada parte.</p>
      <div class="flex flex-col gap-3">
        <div v-for="l in rc.lineas" :key="l.partida.id" class="rounded-lg border border-border bg-surface p-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="text-[13px] font-bold text-text">{{ l.partida.num }}. {{ l.partida.producto }}</p>
            <p :class="`text-[11.5px] font-semibold ${restante(l) === 0 ? 'text-vz-success' : 'text-text-muted'}`">
              {{ restante(l) === 0 ? 'Completa' : `Faltan ${restante(l)} de ${l.cantidadPedida}` }}
            </p>
          </div>
          <ul v-if="comprasDe(l.partida.id).length" class="mt-1.5 flex flex-col gap-0.5 text-[11.5px] text-text-muted">
            <li v-for="c in comprasDe(l.partida.id)" :key="c.id">
              {{ fechaHora(c.fecha) }} · {{ c.cantidadComprada }} × {{ formatoMoneda(c.costoUnitarioReal) }}<span v-if="c.proveedor"> · {{ c.proveedor }}</span><span v-if="c.numeroFactura"> · factura {{ c.numeroFactura }}</span>
              <button v-if="c.ticketUrl" type="button" class="ml-1 font-bold text-vz-blue hover:underline" @click="archivo = { url: c.ticketUrl, titulo: `Ticket ${l.partida.producto}` }">ticket</button>
              <span v-if="c.registradoPor"> · {{ c.registradoPor }}</span>
            </li>
          </ul>
          <div v-if="restante(l) > 0 && drafts[l.partida.id]" class="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-6">
            <AppField label="Cantidad *"><input v-model="drafts[l.partida.id].cant" type="number" min="0" step="1" :class="inputClass" /></AppField>
            <AppField label="Costo unit. real *"><input v-model="drafts[l.partida.id].costo" type="number" min="0" step="0.01" :class="inputClass" /></AppField>
            <AppField label="Proveedor"><input v-model="drafts[l.partida.id].proveedor" :class="inputClass" /></AppField>
            <AppField label="N.º de factura"><input v-model="drafts[l.partida.id].factura" :class="inputClass" /></AppField>
            <AppField label="Foto del ticket"><input type="file" accept="image/*,application/pdf" :class="inputClass" @change="(e) => onTicket(l.partida.id, e)" /></AppField>
            <div class="flex items-end">
              <button type="button" :class="`${btnPrimary} w-full`" :disabled="drafts[l.partida.id].guardando || drafts[l.partida.id].subiendo" @click="registrar(l.partida.id)">
                {{ drafts[l.partida.id].guardando ? 'Guardando…' : drafts[l.partida.id].subiendo ? 'Subiendo…' : 'Registrar' }}
              </button>
            </div>
            <p v-if="drafts[l.partida.id].ticket" class="col-span-2 text-[11.5px] font-semibold text-vz-success sm:col-span-6">Ticket adjunto.</p>
            <p v-if="drafts[l.partida.id].error" role="alert" class="col-span-2 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-1.5 text-[12px] font-semibold text-vz-danger sm:col-span-6">{{ drafts[l.partida.id].error }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Marcar comprada -->
    <div v-if="puedeRegistrar" class="rounded-xl border border-border bg-surface p-4">
      <h3 class="text-[13px] font-bold text-text">Cerrar la compra</h3>
      <ul class="mt-1 flex flex-col gap-0.5 text-[12.5px]">
        <li :class="rc.partidasSinCompra.length ? 'text-vz-warning' : 'text-vz-success'">{{ rc.partidasSinCompra.length ? `Faltan partidas por registrar: ${rc.partidasSinCompra.map((p) => p.num).join(', ')}` : 'Todas las partidas tienen compra registrada' }}</li>
        <li :class="rc.comprasSinComprobante.length ? 'text-vz-warning' : 'text-vz-success'">{{ rc.comprasSinComprobante.length ? `${rc.comprasSinComprobante.length} compra(s) sin factura ni ticket` : 'Todas las compras tienen comprobante' }}</li>
      </ul>
      <div v-if="rc.excede" class="mt-3">
        <AppField label="Justificación de la diferencia (real > autorizado) *">
          <textarea v-model="justificacion" :class="textareaClass" rows="2" placeholder="p. ej. el proveedor subió el precio entre la cotización y la compra" />
        </AppField>
        <p class="mt-1 text-[11.5px] text-text-soft">Finanzas recibirá un aviso y deberá re-aprobar la diferencia.</p>
      </div>
      <p v-if="errorCerrar" role="alert" class="mt-3 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ errorCerrar }}</p>
      <div class="mt-3 flex justify-end"><button type="button" :class="btnPrimary" :disabled="cerrando" @click="cerrar">{{ cerrando ? 'Guardando…' : 'Marcar comprada' }}</button></div>
    </div>

    <p v-else-if="req.estado === 'recibida' || req.estado === 'en_cotizacion' || req.estado === 'en_autorizacion' || req.estado === 'autorizada'" class="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-[12.5px] text-text-soft">
      La compra se registra cuando se entrega el dinero (Tesorería, en efectivo) o se registra el pago (Cuentas por pagar, transferencia o tarjeta): estado «Fondeada».
    </p>

    <ArchivoModal v-if="archivo" :url="archivo.url" :titulo="archivo.titulo" @close="archivo = null" />
    <MotivoModal
      v-if="aprobandoDif"
      title="Aprobar diferencia"
      label="Justificación"
      :descripcion="`Lo comprado rebasa lo autorizado en ${formatoMoneda(rc.diferencia)}. Tu aprobación queda registrada.`"
      confirm-label="Aprobar diferencia"
      :accion="accionAprobarDif"
      @close="aprobandoDif = false"
    />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import AppField from 'components/AppField.vue'
import { inputClass, textareaClass } from 'components/formClasses'
import {
  aprobarDiferencia,
  estadoDiferencia,
  formatoMoneda,
  getRequisicion,
  listCompras,
  marcarComprada,
  registrarCompra,
  resumenCompra,
} from 'src/lib/compras'
import { uploadFactura } from 'src/lib/inventario/storage'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'
import ArchivoModal from './ArchivoModal.vue'
import MotivoModal from './MotivoModal.vue'
import { useAcceso } from './useAcceso'
import { btnPrimary, btnWarn, fechaHora } from './util'

const props = defineProps({ folio: { type: String, required: true } })
const toast = useToast()
const { puedeCotizar, puedeAprobar } = useAcceso()

const req = computed(() => getRequisicion(props.folio))
const rc = computed(() => resumenCompra(props.folio))
const dif = computed(() => estadoDiferencia(props.folio))
const puedeRegistrar = computed(() => puedeCotizar.value && req.value?.estado === 'fondeada')
const archivo = ref(null)
const comprasDe = (partidaId) => listCompras(props.folio).filter((c) => c.partidaId === partidaId)
const restante = (l) => Math.max(0, l.cantidadPedida - l.cantidadComprada)

/**
 * @typedef {object} Draft
 * @property {string} cant
 * @property {string} costo
 * @property {string} proveedor
 * @property {string} factura
 * @property {string} ticket
 * @property {boolean} subiendo
 * @property {boolean} guardando
 * @property {string} error
 */
const drafts = reactive({})
function inicializar(id, l) {
  drafts[id] = {
    cant: String(restante(l)),
    costo: l.costoCotizadoUnitario !== undefined ? String(l.costoCotizadoUnitario) : '',
    proveedor: req.value?.proveedorElegido ?? '',
    factura: '',
    ticket: '',
    subiendo: false,
    guardando: false,
    error: '',
  }
}
watch(
  () => rc.value.lineas,
  (lineas) => {
    for (const l of lineas) if (!drafts[l.partida.id]) inicializar(l.partida.id, l)
  },
  { immediate: true },
)

async function onTicket(id, e) {
  const f = e.target.files?.[0]
  if (!f) return
  const dr = drafts[id]
  dr.subiendo = true
  try {
    dr.ticket = await uploadFactura(`compras/${props.folio}`, f)
  } catch {
    dr.error = 'No se pudo subir el ticket. Intenta de nuevo.'
  } finally {
    dr.subiendo = false
  }
}

async function registrar(id) {
  const dr = drafts[id]
  dr.error = ''
  const cant = Number(dr.cant)
  const costo = Number(dr.costo)
  if (!(cant > 0)) return void (dr.error = 'La cantidad comprada debe ser mayor a cero.')
  if (dr.costo === '' || Number.isNaN(costo) || costo < 0) return void (dr.error = 'Captura el costo unitario real.')
  if (!dr.factura.trim() && !dr.ticket) return void (dr.error = 'Falta el comprobante: captura el número de factura o sube la foto del ticket.')
  dr.guardando = true
  try {
    await registrarCompra({ folio: props.folio, partidaId: id, cantidadComprada: cant, costoUnitarioReal: costo, proveedor: dr.proveedor, numeroFactura: dr.factura, ticketUrl: dr.ticket || undefined })
    bump()
    toast('Compra registrada.')
    const l = rc.value.lineas.find((x) => x.partida.id === id)
    if (l) inicializar(id, l)
  } catch (e) {
    dr.error = e instanceof Error && e.message ? e.message : 'No se pudo registrar la compra.'
  } finally {
    dr.guardando = false
  }
}

const justificacion = ref('')
const errorCerrar = ref('')
const cerrando = ref(false)
async function cerrar() {
  errorCerrar.value = ''
  if (rc.value.excede && !justificacion.value.trim()) {
    errorCerrar.value = 'Escribe la justificación de la diferencia: lo comprado rebasa lo autorizado.'
    return
  }
  cerrando.value = true
  try {
    await marcarComprada(props.folio, { justificacionDiferencia: justificacion.value })
    bump()
    toast('Requisición marcada como comprada.')
  } catch (e) {
    errorCerrar.value = e instanceof Error && e.message ? e.message : 'No se pudo marcar como comprada.'
  } finally {
    cerrando.value = false
  }
}

const aprobandoDif = ref(false)
async function accionAprobarDif(t) {
  await aprobarDiferencia(props.folio, { comentario: t })
  bump()
  toast('Diferencia aprobada.')
}
</script>
