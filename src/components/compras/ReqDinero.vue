<template>
  <div v-if="req" class="flex flex-col gap-4">
    <!-- Resumen visual -->
    <div class="rounded-xl border border-border bg-surface p-4">
      <h3 class="mb-3 text-[13px] font-bold text-text">Dinero de la compra</h3>
      <div class="flex flex-col gap-2.5">
        <div v-for="b in barras" :key="b.id">
          <div class="mb-0.5 flex items-baseline justify-between gap-2 text-[12.5px]">
            <span class="font-semibold text-text">{{ b.label }}</span>
            <span class="font-extrabold text-text">{{ formatoMoneda(b.valor) }}</span>
          </div>
          <div class="h-2.5 overflow-hidden rounded-full bg-bg" role="img" :aria-label="`${b.label}: ${formatoMoneda(b.valor)}`">
            <div class="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" :style="{ width: `${b.pct}%`, background: b.color }" />
          </div>
          <p v-if="b.nota" class="mt-0.5 text-[11px] text-text-soft">{{ b.nota }}</p>
        </div>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
        <div class="rounded-lg bg-bg px-2.5 py-1.5"><p class="text-[10.5px] text-text-soft">{{ esEfectivo ? 'Solicitado a Tesorería' : 'Solicitado a Cuentas por pagar' }}</p><p class="font-bold text-text">{{ formatoMoneda(d.solicitado) }}</p></div>
        <div v-if="esEfectivo" class="rounded-lg bg-bg px-2.5 py-1.5"><p class="text-[10.5px] text-text-soft">Cambio esperado</p><p class="font-bold text-text">{{ formatoMoneda(d.cambioEsperado) }}</p></div>
        <div :class="`rounded-lg px-2.5 py-1.5 ${d.pendienteComprobar > 0 ? 'bg-vz-warning/10' : 'bg-bg'}`"><p class="text-[10.5px] text-text-soft">Falta comprobar</p><p :class="`font-bold ${d.pendienteComprobar > 0 ? 'text-vz-warning' : 'text-text'}`">{{ formatoMoneda(d.pendienteComprobar) }}</p></div>
        <div v-if="esEfectivo" :class="`rounded-lg px-2.5 py-1.5 ${d.pendienteDevolver > 0 ? 'bg-vz-warning/10' : 'bg-bg'}`"><p class="text-[10.5px] text-text-soft">Falta devolver</p><p :class="`font-bold ${d.pendienteDevolver > 0 ? 'text-vz-warning' : 'text-text'}`">{{ formatoMoneda(d.pendienteDevolver) }}</p></div>
      </div>
      <ul v-if="d.alertas.length" class="mt-3 flex flex-col gap-1">
        <li v-for="a in d.alertas" :key="a" class="rounded-md border border-vz-warning/30 bg-vz-warning/10 px-2.5 py-1 text-[12px] font-semibold text-vz-warning">{{ a }}</li>
      </ul>
      <p v-else-if="d.entregado > 0 && d.gastado > 0" class="mt-3 rounded-md border border-vz-success/30 bg-vz-success/10 px-2.5 py-1 text-[12px] font-semibold text-vz-success">Las cifras cuadran: sin diferencias pendientes.</p>
    </div>

    <!-- A dónde va el pago (ruteo por forma de pago) + datos del proveedor -->
    <div v-if="req.proveedorId || estado === 'autorizada'" class="rounded-xl border border-border bg-surface p-4">
      <h3 class="text-[13px] font-bold text-text">Proveedor y forma de pago</h3>
      <p class="mt-1 text-[12.5px] text-text">
        <span :class="`rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE_STYLES[esEfectivo ? 'warning' : 'info']}`">{{ FORMA_PAGO_LABEL[forma] }}</span>
        <span class="ml-1.5 font-semibold">Va a {{ DESTINO_PAGO_LABEL[destino] }}.</span>
      </p>
      <dl v-if="proveedor" class="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2">
        <div><dt class="text-[11px] text-text-soft">Proveedor</dt><dd class="font-semibold text-text">{{ proveedor.nombreComercial }}</dd></div>
        <div><dt class="text-[11px] text-text-soft">Razón social</dt><dd class="font-semibold text-text">{{ proveedor.razonSocial || '—' }}</dd></div>
        <div><dt class="text-[11px] text-text-soft">RFC</dt><dd class="font-mono font-semibold text-text">{{ proveedor.rfc || '—' }}</dd></div>
        <div><dt class="text-[11px] text-text-soft">Tipo</dt><dd class="font-semibold text-text">{{ TIPO_PROVEEDOR_LABEL[proveedor.tipo] }}</dd></div>
        <div v-if="forma === 'transferencia'" class="sm:col-span-2">
          <dt class="text-[11px] text-text-soft">CLABE para la transferencia</dt>
          <dd class="flex flex-wrap items-center gap-2 font-mono font-bold text-text">
            <span data-test="clabe">{{ verClabe ? clabeConEspacios(proveedor.clabe) : clabeEnmascarada(proveedor.clabe) }}</span>
            <button v-if="verClabe && proveedor.clabe" type="button" :class="btnMini" @click="copiarClabe">Copiar CLABE</button>
          </dd>
        </div>
      </dl>
      <p v-else-if="req.proveedorId" class="mt-2 text-[12px] text-text-soft">El proveedor ya no aparece en el catálogo que puedes ver.</p>
      <p v-if="estado === 'autorizada' && !esEfectivo && !puedePagar" class="mt-2 rounded-md border border-vz-blue/30 bg-vz-blue/10 px-2.5 py-1.5 text-[12px] font-semibold text-text">
        El pago por {{ FORMA_PAGO_LABEL[forma].toLowerCase() }} lo registra Cuentas por pagar. Tesorería solo entrega efectivo.
      </p>
      <p v-else-if="estado === 'autorizada' && esEfectivo && !puedeFondear" class="mt-2 rounded-md border border-vz-blue/30 bg-vz-blue/10 px-2.5 py-1.5 text-[12px] font-semibold text-text">
        El efectivo lo entrega Tesorería; Cuentas por pagar no entrega efectivo.
      </p>
    </div>

    <!-- Pago por transferencia o tarjeta (Cuentas por pagar) -->
    <div v-if="puedePagarAhora" class="rounded-xl border border-vz-blue/30 bg-vz-blue/5 p-4">
      <h3 class="text-[13px] font-bold text-text">Registrar pago por {{ FORMA_PAGO_LABEL[forma].toLowerCase() }} (Cuentas por pagar)</h3>
      <p class="mb-3 text-[12px] text-text-muted">Autorizado: {{ formatoMoneda(req.montoAutorizado) }}. Al registrarlo, la requisición pasa a «Fondeada».</p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AppField label="Monto pagado *"><input v-model="pago.monto" type="number" min="0" step="0.01" :class="inputClass" /></AppField>
        <AppField :label="forma === 'tarjeta' ? 'Últimos 4 dígitos de la tarjeta *' : 'Folio o clave de rastreo de la transferencia *'">
          <input v-model="pago.referencia" :maxlength="forma === 'tarjeta' ? 4 : 60" :inputmode="forma === 'tarjeta' ? 'numeric' : 'text'" :autocomplete="forma === 'tarjeta' ? 'off' : undefined" :class="inputClass" :placeholder="forma === 'tarjeta' ? '1234' : ''" data-test="referencia-pago" />
          <p v-if="forma === 'tarjeta'" class="mt-1 text-[11px] text-text-soft">Solo los últimos 4 dígitos. Nunca captures el número completo de la tarjeta.</p>
        </AppField>
        <AppField label="Fecha de pago *"><input v-model="pago.fecha" type="date" :max="hoyISO" :class="inputClass" /></AppField>
        <AppField label="Comprobante del pago (imagen / PDF) *"><input type="file" accept="image/*,application/pdf" :class="inputClass" data-test="comprobante-pago" @change="onComprobantePago" /></AppField>
        <AppField label="Notas" class="sm:col-span-2"><input v-model="pago.notas" :class="inputClass" /></AppField>
      </div>
      <p v-if="pago.archivo" class="mt-1 text-[12px] font-semibold text-vz-success">Comprobante adjunto.</p>
      <p v-if="errorPago" role="alert" class="mt-3 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ errorPago }}</p>
      <div class="mt-3 flex justify-end"><button type="button" :class="btnPrimary" :disabled="guardandoPago || subiendoPago" data-test="registrar-pago" @click="pagar">{{ guardandoPago ? 'Registrando…' : subiendoPago ? 'Subiendo archivo…' : 'Registrar pago' }}</button></div>
    </div>

    <!-- Entrega de efectivo -->
    <div v-if="puedeEntregar" class="rounded-xl border border-vz-blue/30 bg-vz-blue/5 p-4">
      <h3 class="text-[13px] font-bold text-text">Registrar entrega de efectivo (Tesorería)</h3>
      <p class="mb-3 text-[12px] text-text-muted">Autorizado: {{ formatoMoneda(req.montoAutorizado) }}. Compra en efectivo (caja chica); las transferencias y la tarjeta las paga Cuentas por pagar.</p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AppField label="Monto entregado *">
          <input v-model="ent.monto" type="number" min="0" step="0.01" :class="inputClass" />
        </AppField>
        <AppField label="Folio de caja chica *">
          <input v-model="ent.folioCaja" :class="inputClass" />
        </AppField>
        <AppField label="Quién recibe el efectivo *">
          <input v-model="ent.receptor" list="cmp-receptores" :class="inputClass" />
          <datalist id="cmp-receptores"><option v-for="n in receptores" :key="n" :value="n" /></datalist>
        </AppField>
        <AppField label="Familia / tipo de gasto *">
          <input v-model="ent.familia" list="cmp-familias-gasto" :class="inputClass" placeholder="p. ej. Papelería" />
          <datalist id="cmp-familias-gasto"><option v-for="n in familiasGasto" :key="n" :value="n" /></datalist>
        </AppField>
        <AppField label="Notas">
          <input v-model="ent.notas" :class="inputClass" />
        </AppField>
      </div>
      <p v-if="errorEnt" role="alert" class="mt-3 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ errorEnt }}</p>
      <div class="mt-3 flex justify-end"><button type="button" :class="btnPrimary" :disabled="guardandoEnt" @click="entregar">{{ guardandoEnt ? 'Registrando…' : 'Registrar entrega' }}</button></div>
    </div>

    <!-- Comprobación -->
    <div v-if="puedeComprobar" class="rounded-xl border border-border bg-surface p-4">
      <h3 class="text-[13px] font-bold text-text">Comprobación del gasto</h3>
      <p class="mb-3 text-[12px] text-text-muted">Sube la foto o PDF del ticket / factura y el monto que ampara. Tesorería valida que cuadre con lo gastado ({{ formatoMoneda(d.gastado) }}).</p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AppField label="Monto comprobado *"><input v-model="comp.monto" type="number" min="0" step="0.01" :class="inputClass" /></AppField>
        <AppField label="Ticket o factura (imagen / PDF) *"><input type="file" accept="image/*,application/pdf" :class="inputClass" @change="onComprobante" /></AppField>
        <AppField label="Notas"><input v-model="comp.notas" :class="inputClass" /></AppField>
      </div>
      <p v-if="comp.archivo" class="mt-1 text-[12px] font-semibold text-vz-success">Archivo adjunto.</p>
      <p v-if="errorComp" role="alert" class="mt-3 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ errorComp }}</p>
      <div class="mt-3 flex justify-end"><button type="button" :class="btnPrimary" :disabled="guardandoComp || subiendo" @click="comprobar">{{ guardandoComp ? 'Guardando…' : subiendo ? 'Subiendo archivo…' : 'Registrar comprobación' }}</button></div>
    </div>

    <!-- Cambio devuelto -->
    <div v-if="puedeDevolver" class="rounded-xl border border-border bg-surface p-4">
      <h3 class="text-[13px] font-bold text-text">Cambio devuelto a Tesorería</h3>
      <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AppField label="Monto devuelto *"><input v-model="dev.monto" type="number" min="0" step="0.01" :class="inputClass" /></AppField>
        <AppField label="Notas"><input v-model="dev.notas" :class="inputClass" /></AppField>
        <div class="flex items-end"><button type="button" :class="btn" :disabled="guardandoDev" @click="devolver">{{ guardandoDev ? 'Guardando…' : 'Registrar devolución' }}</button></div>
      </div>
      <p v-if="errorDev" role="alert" class="mt-3 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ errorDev }}</p>
    </div>

    <!-- Movimientos -->
    <div class="rounded-xl border border-border bg-surface">
      <h3 class="border-b border-border px-4 py-3 text-[13px] font-bold text-text">Movimientos de dinero (no se editan ni se borran; una corrección es un movimiento nuevo)</h3>
      <p v-if="movimientos.length === 0" class="px-4 py-6 text-center text-[12.5px] text-text-soft">Todavía no hay movimientos.</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[640px] text-[12.5px]">
          <thead>
            <tr class="border-b border-border bg-bg text-left text-text-muted">
              <th class="px-3 py-2 font-bold">Fecha</th>
              <th class="px-3 py-2 font-bold">Movimiento</th>
              <th class="px-3 py-2 text-right font-bold">Monto</th>
              <th class="px-3 py-2 font-bold">Detalle</th>
              <th class="px-3 py-2 font-bold">Registró</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in movimientos" :key="m.id" class="border-b border-border align-top last:border-0">
              <td class="whitespace-nowrap px-3 py-2 text-text-muted">{{ fechaHora(m.fecha) }}</td>
              <td class="px-3 py-2 font-semibold text-text">{{ TIPO_MOV[m.tipo] }}</td>
              <td class="px-3 py-2 text-right font-bold text-text">{{ formatoMoneda(m.monto) }}</td>
              <td class="px-3 py-2 text-text-muted">
                <span v-if="m.referencia || m.folioCajaChica">{{ etiquetaReferencia(m) }} · </span>
                <span v-if="m.familiaGasto">{{ m.familiaGasto }} · </span>
                <span v-if="m.receptor">Recibe: {{ m.receptor }} · </span>
                <span v-if="m.notas">{{ m.notas }}</span>
                <button v-if="m.archivoUrl" type="button" class="ml-1 font-bold text-vz-blue hover:underline" @click="archivo = { url: m.archivoUrl, titulo: `Comprobante ${m.id}` }">ver comprobante</button>
              </td>
              <td class="px-3 py-2 text-text-muted">{{ m.registradoPor || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ArchivoModal v-if="archivo" :url="archivo.url" :titulo="archivo.titulo" @close="archivo = null" />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import AppField from 'components/AppField.vue'
import { inputClass } from 'components/formClasses'
import {
  DESTINO_PAGO_LABEL,
  FORMA_PAGO_LABEL,
  TIPO_PROVEEDOR_LABEL,
  clabeConEspacios,
  clabeEnmascarada,
  destinoDePago,
  formatoMoneda,
  getCategoria,
  getProveedor,
  getRequisicion,
  listMovimientosDinero,
  listParticipantes,
  listPartidas,
  registrarComprobacion,
  registrarDevolucionCambio,
  registrarEntregaEfectivo,
  registrarPagoTarjeta,
  registrarTransferencia,
  resumenDinero,
} from 'src/lib/compras'
import { TONE_STYLES } from 'components/statusMaps'
import { todayLocalDateString } from 'src/lib/dateUtils'
import { uploadFactura } from 'src/lib/inventario/storage'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'
import ArchivoModal from './ArchivoModal.vue'
import { useAcceso } from './useAcceso'
import { btn, btnMini, btnPrimary, fechaHora } from './util'

const props = defineProps({ folio: { type: String, required: true } })
const toast = useToast()
const { puedeFondear, puedeCotizar, puedePagar, verClabe } = useAcceso()

const TIPO_MOV = {
  solicitud: 'Solicitud de fondos',
  entrega_efectivo: 'Entrega de efectivo',
  transferencia: 'Transferencia',
  pago_tarjeta: 'Pago con tarjeta',
  comprobacion: 'Comprobación',
  devolucion_cambio: 'Cambio devuelto',
}

const req = computed(() => getRequisicion(props.folio))
const forma = computed(() => req.value?.formaPago ?? 'efectivo')
const esEfectivo = computed(() => forma.value === 'efectivo')
const destino = computed(() => destinoDePago(forma.value))
const proveedor = computed(() => getProveedor(req.value?.proveedorId))
const hoyISO = todayLocalDateString()
const d = computed(() => resumenDinero(props.folio))

/** Referencia de un movimiento según su tipo: folio de caja chica, folio de transferencia o tarjeta (solo los últimos 4 dígitos). */
function etiquetaReferencia(m) {
  // Pagos de Cuentas por pagar: columna `referencia` (movimientos viejos de transferencia traían la referencia en folioCajaChica).
  if (m.tipo === 'pago_tarjeta') return `Tarjeta ···· ${m.referencia ?? m.folioCajaChica}`
  if (m.tipo === 'transferencia') return `Ref.: ${m.referencia ?? m.folioCajaChica}`
  return `Folio: ${m.folioCajaChica}`
}

async function copiarClabe() {
  const clabe = proveedor.value?.clabe ?? ''

  if (!clabe) {
    toast('No hay CLABE para copiar.', 'warning')
    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(clabe)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = clabe
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()

      const copiado = document.execCommand('copy')
      textarea.remove()

      if (!copiado) throw new Error('No se pudo copiar')
    }

    toast('CLABE copiada.')
  } catch (error) {
    console.error('Error al copiar CLABE:', error)
    toast('No se pudo copiar; selecciónala manualmente.', 'error')
  }
}
const movimientos = computed(() => listMovimientosDinero(props.folio))
const archivo = ref(null)

const barras = computed(() => {
  const x = d.value
  const max = Math.max(x.autorizado, x.entregado, x.gastado, x.comprobado, x.cambioDevuelto, 1)
  const pct = (v) => Math.min(100, Math.round((v / max) * 100))
  return [
    { id: 'aut', label: 'Autorizado', valor: x.autorizado, pct: pct(x.autorizado), color: '#1F5FAE', nota: '' },
    { id: 'ent', label: esEfectivo.value ? 'Entregado por Tesorería' : 'Pagado por Cuentas por pagar', valor: x.entregado, pct: pct(x.entregado), color: '#0FA391', nota: x.entregado > x.autorizado + 0.005 && x.autorizado > 0 ? 'Más de lo autorizado.' : '' },
    { id: 'gas', label: 'Gastado (costos reales)', valor: x.gastado, pct: pct(x.gastado), color: x.gastado > x.autorizado + 0.005 && x.autorizado > 0 ? '#B0413F' : '#C8A24B', nota: x.gastado > x.autorizado + 0.005 && x.autorizado > 0 ? `Rebasa lo autorizado por ${formatoMoneda(x.gastado - x.autorizado)}.` : '' },
    { id: 'com', label: 'Comprobado (tickets / facturas)', valor: x.comprobado, pct: pct(x.comprobado), color: '#6D28D9', nota: x.pendienteComprobar > 0 ? `Faltan ${formatoMoneda(x.pendienteComprobar)} por comprobar.` : '' },
    { id: 'cam', label: 'Cambio devuelto', valor: x.cambioDevuelto, pct: pct(x.cambioDevuelto), color: '#5B7284', nota: x.pendienteDevolver > 0 ? `Faltan ${formatoMoneda(x.pendienteDevolver)} por devolver.` : '' },
  ].filter((b) => esEfectivo.value || b.id !== 'cam')
})

const estado = computed(() => req.value?.estado)
// Ruteo por forma de pago: el efectivo lo entrega Tesorería; la transferencia y la tarjeta las paga Cuentas por pagar.
const puedeEntregar = computed(() => puedeFondear.value && esEfectivo.value && estado.value === 'autorizada')
const puedePagarAhora = computed(() => puedePagar.value && !esEfectivo.value && estado.value === 'autorizada')
const conGasto = computed(() => estado.value === 'fondeada' || estado.value === 'comprada' || estado.value === 'entregada')
const puedeComprobar = computed(() => (puedeFondear.value || puedeCotizar.value) && conGasto.value)
const puedeDevolver = computed(() => puedeFondear.value && esEfectivo.value && conGasto.value)

const receptores = computed(() => listParticipantes().map((p) => p.nombre))
const familiasGasto = computed(() => [...new Set(listPartidas(props.folio).map((p) => getCategoria(p.categoriaId)?.nombre).filter((n) => !!n))])

// ---- Entrega --------------------------------------------------------------------------------------------------------------
const ent = reactive({ monto: '', folioCaja: '', receptor: '', familia: '', notas: '' })
watch(
  () => req.value?.montoAutorizado,
  (m) => {
    if (!ent.monto && m) ent.monto = String(m)
  },
  { immediate: true },
)
watch(familiasGasto, (f) => {
  if (!ent.familia && f.length === 1) ent.familia = f[0]
}, { immediate: true })
const errorEnt = ref('')
const guardandoEnt = ref(false)
async function entregar() {
  errorEnt.value = ''
  const monto = Number(ent.monto)
  if (!(monto > 0)) {
    errorEnt.value = 'Captura un monto mayor a cero.'
    return
  }
  if (monto > (req.value?.montoAutorizado ?? 0) + 0.005) {
    errorEnt.value = `El monto rebasa lo autorizado (${formatoMoneda(req.value?.montoAutorizado)}). Pide la re-aprobación.`
    return
  }
  if (!ent.folioCaja.trim()) return void (errorEnt.value = 'Captura el folio de caja chica.')
  if (!ent.familia.trim()) return void (errorEnt.value = 'Captura la familia / tipo de gasto.')
  if (!ent.receptor.trim()) return void (errorEnt.value = 'Indica quién recibe el efectivo.')
  guardandoEnt.value = true
  try {
    await registrarEntregaEfectivo({ folio: props.folio, monto, folioCajaChica: ent.folioCaja, familiaGasto: ent.familia, receptor: ent.receptor, notas: ent.notas })
    bump()
    toast('Entrega registrada: la requisición quedó fondeada.')
  } catch (e) {
    errorEnt.value = e instanceof Error && e.message ? e.message : 'No se pudo registrar la entrega.'
  } finally {
    guardandoEnt.value = false
  }
}

// ---- Pago por transferencia / tarjeta (Cuentas por pagar) ------------------------------------------------------------------
const pago = reactive({ monto: '', referencia: '', fecha: hoyISO, notas: '', archivo: '' })
watch(
  () => req.value?.montoAutorizado,
  (m) => {
    if (!pago.monto && m) pago.monto = String(m)
  },
  { immediate: true },
)
const subiendoPago = ref(false)
const errorPago = ref('')
const guardandoPago = ref(false)
async function onComprobantePago(e) {
  const f = e.target.files?.[0]
  if (!f) return
  subiendoPago.value = true
  errorPago.value = ''
  try {
    pago.archivo = await uploadFactura(`compras/${props.folio}`, f)
  } catch {
    errorPago.value = 'No se pudo subir el archivo. Intenta de nuevo.'
  } finally {
    subiendoPago.value = false
  }
}
async function pagar() {
  errorPago.value = ''
  const monto = Number(pago.monto)
  if (!(monto > 0)) return void (errorPago.value = 'Captura un monto mayor a cero.')
  if (monto > (req.value?.montoAutorizado ?? 0) + 0.005) return void (errorPago.value = `El monto rebasa lo autorizado (${formatoMoneda(req.value?.montoAutorizado)}). Pide la re-aprobación.`)
  if (!pago.referencia.trim()) return void (errorPago.value = forma.value === 'tarjeta' ? 'Captura los últimos 4 dígitos de la tarjeta.' : 'Captura el folio o la clave de rastreo de la transferencia.')
  if (forma.value === 'tarjeta' && !/^\d{4}$/.test(pago.referencia.trim())) return void (errorPago.value = 'Captura solo los ÚLTIMOS 4 dígitos de la tarjeta (nunca el número completo).')
  if (!pago.fecha) return void (errorPago.value = 'Indica la fecha de pago.')
  if (!pago.archivo) return void (errorPago.value = 'Adjunta el comprobante del pago.')
  guardandoPago.value = true
  try {
    const datos = { folio: props.folio, monto, referencia: pago.referencia, fechaPago: pago.fecha, archivoUrl: pago.archivo, notas: pago.notas }
    if (forma.value === 'tarjeta') await registrarPagoTarjeta(datos)
    else await registrarTransferencia(datos)
    bump()
    toast('Pago registrado: la requisición quedó fondeada.')
  } catch (e) {
    errorPago.value = e instanceof Error && e.message ? e.message : 'No se pudo registrar el pago.'
  } finally {
    guardandoPago.value = false
  }
}

// ---- Comprobación -----------------------------------------------------------------------------------------------------------
const comp = reactive({ monto: '', notas: '', archivo: '' })
watch(
  () => d.value.pendienteComprobar,
  (p) => {
    if (!comp.monto && p > 0) comp.monto = String(p)
  },
  { immediate: true },
)
const subiendo = ref(false)
const errorComp = ref('')
const guardandoComp = ref(false)
async function onComprobante(e) {
  const f = e.target.files?.[0]
  if (!f) return
  subiendo.value = true
  try {
    comp.archivo = await uploadFactura(`compras/${props.folio}`, f)
  } catch {
    errorComp.value = 'No se pudo subir el archivo. Intenta de nuevo.'
  } finally {
    subiendo.value = false
  }
}
async function comprobar() {
  errorComp.value = ''
  const monto = Number(comp.monto)
  if (!(monto > 0)) return void (errorComp.value = 'El monto comprobado debe ser mayor a cero.')
  if (!comp.archivo) return void (errorComp.value = 'Adjunta la foto o PDF del ticket o factura.')
  guardandoComp.value = true
  try {
    await registrarComprobacion({ folio: props.folio, monto, archivoUrl: comp.archivo, notas: comp.notas })
    bump()
    toast('Comprobación registrada.')
    Object.assign(comp, { monto: '', notas: '', archivo: '' })
  } catch (e) {
    errorComp.value = e instanceof Error && e.message ? e.message : 'No se pudo registrar la comprobación.'
  } finally {
    guardandoComp.value = false
  }
}

// ---- Cambio -----------------------------------------------------------------------------------------------------------------
const dev = reactive({ monto: '', notas: '' })
watch(
  () => d.value.pendienteDevolver,
  (p) => {
    if (!dev.monto && p > 0) dev.monto = String(p)
  },
  { immediate: true },
)
const errorDev = ref('')
const guardandoDev = ref(false)
async function devolver() {
  errorDev.value = ''
  const monto = Number(dev.monto)
  if (dev.monto === '' || Number.isNaN(monto) || monto < 0) return void (errorDev.value = 'Captura el monto devuelto (0 si no hubo cambio).')
  guardandoDev.value = true
  try {
    await registrarDevolucionCambio({ folio: props.folio, monto, notas: dev.notas })
    bump()
    toast('Devolución de cambio registrada.')
    Object.assign(dev, { monto: '', notas: '' })
  } catch (e) {
    errorDev.value = e instanceof Error && e.message ? e.message : 'No se pudo registrar la devolución.'
  } finally {
    guardandoDev.value = false
  }
}
</script>
