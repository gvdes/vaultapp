<template>
  <AppModal :title="resultado ? 'Recepción confirmada' : 'Confirmar recepción a bodega'" wide @close="cerrar">
    <p v-if="!rec" class="text-[13px] text-text-muted">No encontramos esta recepción.</p>

    <!-- Resultado -->
    <div v-else-if="resultado" class="flex flex-col gap-3">
      <div class="rounded-lg border border-vz-success/30 bg-vz-success/10 px-3 py-2.5 text-[13px] text-text">
        <p class="font-bold text-vz-success">Listo: {{ rec.cantidad }} × {{ rec.datos.producto }} ya está en inventario.</p>
        <p class="mt-0.5 text-[12px] text-text-muted">Quedó en la ubicación elegida (por defecto, bodega de Adquisiciones) y disponible para asignar.</p>
      </div>
      <ul class="flex flex-col gap-1">
        <li v-for="l in enlaces" :key="l.to">
          <RouterLink :to="l.to" class="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-[12.5px] font-semibold text-vz-blue hover:bg-surface-hover" @click="cerrar">
            <span class="truncate">{{ l.label }}</span>
            <span class="shrink-0 text-[11px]">Ver en inventario →</span>
          </RouterLink>
        </li>
      </ul>
      <div class="flex justify-end"><button type="button" :class="btnPrimary" @click="cerrar">Cerrar</button></div>
    </div>

    <!-- Formulario -->
    <div v-else class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-bg p-3 text-[12.5px] sm:grid-cols-3">
        <div class="col-span-2 sm:col-span-3">
          <p class="text-[14px] font-extrabold text-text">{{ d.cantidad }} × {{ d.producto }}</p>
          <p class="text-[11.5px] text-text-muted">{{ d.categoria }}<span v-if="d.descripcion"> · {{ d.descripcion }}</span></p>
        </div>
        <p><span class="block text-[11px] text-text-soft">Folio</span><RouterLink :to="RUTAS_COMPRAS.requisicion(rec.folio)" class="font-mono font-bold text-vz-blue hover:underline" @click="cerrar">{{ rec.folio }}</RouterLink></p>
        <p><span class="block text-[11px] text-text-soft">Proveedor</span><span class="font-semibold text-text">{{ d.proveedor || '—' }}</span></p>
        <p><span class="block text-[11px] text-text-soft">Factura / ticket</span>
          <span class="font-semibold text-text">{{ d.numeroFactura || (d.ticketUrl ? 'Ticket adjunto' : '—') }}</span>
          <button v-if="d.ticketUrl" type="button" class="ml-1.5 text-[11px] font-bold text-vz-blue hover:underline" @click="verTicket = true">ver</button>
        </p>
        <p><span class="block text-[11px] text-text-soft">Costo unitario real</span><span class="font-semibold text-text">{{ formatoMoneda(d.costoUnitarioReal) }}</span></p>
        <p><span class="block text-[11px] text-text-soft">Fecha de compra</span><span class="font-semibold text-text">{{ fechaISOTexto(d.fechaCompra) }}</span></p>
        <p><span class="block text-[11px] text-text-soft">Para quién</span><span class="font-semibold text-text">{{ d.paraQuien || '—' }}</span></p>
        <p class="col-span-2 sm:col-span-3"><span class="block text-[11px] text-text-soft">Solicitó</span><span class="font-semibold text-text">{{ d.solicitante }}{{ d.area ? ` · ${d.area}` : '' }}</span></p>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AppField label="Familia de inventario *">
          <select v-model="familiaId" :class="selectClass">
            <option value="">— Elige la familia —</option>
            <option v-for="f in familias" :key="f.id" :value="f.id">{{ f.nombre }} {{ f.modoInventario === 'serializado' ? '(pieza con serie)' : '(por cantidad)' }}</option>
          </select>
        </AppField>
        <AppField label="Ubicación inicial">
          <select v-model="ubicacionId" :class="selectClass">
            <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}{{ u.id === UBICACION_STOCK_MAESTRO ? ' (bodega)' : '' }}</option>
          </select>
        </AppField>
        <AppField label="Marca">
          <input v-model="marca" :class="inputClass" placeholder="p. ej. Motorola" />
        </AppField>
        <AppField v-if="serializada" label="Modelo">
          <input v-model="modelo" :class="inputClass" />
        </AppField>
      </div>
      <p v-if="familiaSugerida && !familiaId" class="-mt-2 text-[11.5px] text-text-soft">No hay una familia sugerida para este producto; elige la que corresponda.</p>
      <p v-else-if="familiaId && familiaId === rec.datos.familiaSugeridaId" class="-mt-2 text-[11.5px] text-text-soft">Familia sugerida por la categoría del producto; puedes cambiarla.</p>

      <!-- Series -->
      <div v-if="serializada" class="rounded-lg border border-border bg-bg p-3">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p class="text-[12.5px] font-bold text-text">Número de serie por unidad ({{ unidades }})</p>
          <button type="button" :class="btnMini" @click="rellenarPendientes">Marcar vacías como PENDIENTE-</button>
        </div>
        <p v-if="!cantidadEntera" class="mb-2 rounded border border-vz-danger/30 bg-vz-danger/10 px-2 py-1.5 text-[12px] font-semibold text-vz-danger">
          La cantidad ({{ rec.cantidad }}) no es un número entero; no se puede crear un equipo por unidad. Corrige la compra con Adquisiciones.
        </p>
        <template v-else>
          <textarea v-model="pegado" :class="textareaClass" rows="2" placeholder="Pega aquí una lista de series (una por línea, o separadas por coma / tabulador) y presiona «Repartir»" />
          <div class="mt-1.5 flex justify-end"><button type="button" :class="btnMini" :disabled="!pegado.trim()" @click="repartir">Repartir en las unidades</button></div>
          <div class="mt-2 flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
            <div v-for="(_, i) in series" :key="i" class="grid grid-cols-[1.75rem_1fr] items-center gap-2">
              <span class="text-center text-[11px] font-bold text-text-soft">{{ i + 1 }}</span>
              <div>
                <input v-model="series[i]" :class="`${inputClass} ${flags[i]?.nivel === 'error' ? '!border-vz-danger' : flags[i]?.nivel === 'warn' ? '!border-vz-warning' : ''}`" placeholder="Número de serie" :aria-label="`Serie de la unidad ${i + 1}`" />
                <p v-if="flags[i]" :class="`mt-0.5 text-[11px] font-semibold ${flags[i].nivel === 'error' ? 'text-vz-danger' : flags[i].nivel === 'warn' ? 'text-vz-warning' : 'text-text-soft'}`">{{ flags[i].texto }}</p>
              </div>
            </div>
          </div>
        </template>
      </div>
      <p v-else-if="familiaId" class="rounded-lg border border-border bg-bg px-3 py-2 text-[12px] text-text-muted">
        Familia por cantidad: se registrará una entrada de {{ rec.cantidad }} en el material «{{ d.producto }}» (se crea si no existe), sin números de serie.
      </p>

      <AppField label="Notas">
        <textarea v-model="notas" :class="textareaClass" rows="2" :placeholder="notasPorDefecto" />
      </AppField>

      <p v-if="error" role="alert" class="rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <button type="button" :class="btn" :disabled="guardando" @click="cerrar">Cancelar</button>
        <button type="button" :class="btnPrimary" :disabled="guardando" @click="confirmar">{{ guardando ? 'Confirmando…' : 'Confirmar recepción' }}</button>
      </div>
    </div>

    <ArchivoModal v-if="verTicket && d?.ticketUrl" :url="d.ticketUrl" titulo="Factura / ticket de la compra" @close="verTicket = false" />
  </AppModal>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { inputClass, selectClass, textareaClass } from 'components/formClasses'
import { RUTAS_COMPRAS, confirmarRecepcion, formatoMoneda, getRecepcion } from 'src/lib/compras'
import { UBICACION_STOCK_MAESTRO, getFamilia, listFamilias, listUbicaciones } from 'src/lib/inventario/comunes'
import { existeSerie, serieControlable } from 'src/lib/inventario/sistemas'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'
import ArchivoModal from './ArchivoModal.vue'
import { enlacesRecepcion } from './recepcionEnlaces'
import { btn, btnMini, btnPrimary, fechaISOTexto } from './util'

const props = defineProps({ recepcionId: { type: String, required: true } })
const emit = defineEmits(['close', 'confirmed'])

const toast = useToast()
const rec = computed(() => getRecepcion(props.recepcionId))
// `d` solo se usa dentro de bloques donde `rec` existe.
const d = computed(() => rec.value?.datos)

const tipoDominio = computed(() => (rec.value?.destino === 'ti' ? 'sistemas' : 'mantenimiento'))
const familias = computed(() => listFamilias(tipoDominio.value))
const ubicaciones = computed(() => listUbicaciones().filter((u) => u.activo))

const familiaSugerida = computed(() => rec.value?.datos.familiaSugeridaId)
const familiaId = ref(rec.value?.datos.familiaSugeridaId ?? '')
const ubicacionId = ref(UBICACION_STOCK_MAESTRO)
const marca = ref('')
const modelo = ref(rec.value?.datos.modeloMarca || rec.value?.datos.producto || '')
const notas = ref('')
const pegado = ref('')
const error = ref('')
const guardando = ref(false)
const verTicket = ref(false)
const resultado = ref(null)

const notasPorDefecto = computed(() => (rec.value ? `Compra ${rec.value.folio}${rec.value.datos.paraQuien ? ` · para: ${rec.value.datos.paraQuien}` : ''} · solicitó ${rec.value.datos.solicitante}` : ''))
const serializada = computed(() => !!familiaId.value && getFamilia(familiaId.value)?.modoInventario === 'serializado')
const cantidadEntera = computed(() => !!rec.value && Number.isInteger(rec.value.cantidad) && rec.value.cantidad > 0)
const unidades = computed(() => (cantidadEntera.value ? (rec.value?.cantidad ?? 0) : 0))

const series = ref([])
watch(
  unidades,
  (n) => {
    const next = [...series.value]
    while (next.length < n) next.push('')
    next.length = n
    series.value = next
  },
  { immediate: true },
)

function repartir() {
  const lista = pegado.value
    .split(/[\n\r,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (lista.length === 0) return
  const next = [...series.value]
  lista.slice(0, next.length).forEach((s, i) => (next[i] = s))
  series.value = next
  pegado.value = ''
  if (lista.length > next.length) toast(`Se pegaron ${lista.length} series pero solo hay ${next.length} unidades; se usaron las primeras ${next.length}.`, 'info')
  else if (lista.length < next.length) toast(`Se repartieron ${lista.length} series; faltan ${next.length - lista.length} unidades.`, 'info')
}

function rellenarPendientes() {
  const ref0 = rec.value?.datos.compraRef ?? 'COMPRA'
  series.value = series.value.map((s, i) => (s.trim() ? s : `PENDIENTE-${ref0.replace('#', '-')}-${i + 1}`))
}

/**
 * @typedef {object} Flag
 * @property {'error' | 'warn' | 'info'} nivel
 * @property {string} texto
 */
const flags = computed(() => {
  const vistas = new Map()
  return series.value.map((s, i) => {
    const t = s.trim()
    if (!t) return { nivel: 'info', texto: 'Sin serie: el equipo se crea sin número y podrás editarlo después.' }
    if (!serieControlable(t)) return { nivel: 'warn', texto: 'Serie provisional (PENDIENTE-): no cuenta para la unicidad; completa la real cuanto antes.' }
    const k = t.toLowerCase()
    const previo = vistas.get(k)
    vistas.set(k, i)
    if (previo !== undefined) return { nivel: 'error', texto: `Repetida: ya la capturaste en la unidad ${previo + 1}.` }
    if (existeSerie(t)) return { nivel: 'error', texto: 'Esta serie ya está registrada en otro equipo.' }
    return undefined
  })
})
const hayErrorSerie = computed(() => serializada.value && flags.value.some((f) => f?.nivel === 'error'))

async function confirmar() {
  error.value = ''
  if (!rec.value) return
  if (!familiaId.value) {
    error.value = 'Elige la familia de inventario.'
    return
  }
  if (serializada.value && !cantidadEntera.value) {
    error.value = 'La cantidad debe ser un número entero para crear un equipo por unidad.'
    return
  }
  if (hayErrorSerie.value) {
    error.value = 'Corrige las series marcadas en rojo (repetidas o ya registradas).'
    return
  }
  guardando.value = true
  try {
    const r = await confirmarRecepcion(rec.value.id, {
      familiaId: familiaId.value,
      ubicacionId: ubicacionId.value,
      series: serializada.value ? series.value.map((s) => s.trim()) : undefined,
      marca: marca.value.trim() || undefined,
      modelo: serializada.value ? modelo.value.trim() || undefined : undefined,
      notas: notas.value.trim() || undefined,
    })
    bump()
    resultado.value = r
    toast('Recepción confirmada: ya está en inventario.')
    emit('confirmed', r)
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : 'No se pudo confirmar la recepción.'
  } finally {
    guardando.value = false
  }
}

const enlaces = computed(() => (resultado.value ? enlacesRecepcion(resultado.value) : []))
const cerrar = () => emit('close')
</script>
