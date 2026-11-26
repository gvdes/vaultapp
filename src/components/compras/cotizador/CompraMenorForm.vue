<template>
  <section class="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4" aria-labelledby="cm-titulo" data-test="compra-menor">
    <div>
      <h3 id="cm-titulo" class="text-[13px] font-bold text-text">Registro de compra menor (menos de {{ formatoUmbral(umbral) }})</h3>
      <p class="mt-0.5 text-[12px] text-text-muted">
        Sin cotización: solo el proveedor y el precio de cada partida. No lleva criterios, comparativo ni justificación y se elige solo como ganadora.
        <strong class="text-text">Sigue requiriendo la autorización de Finanzas</strong>, que verá la leyenda de compra menor.
      </p>
    </div>

    <p v-if="!editable" class="rounded-lg border border-border bg-bg px-3 py-2 text-[12.5px] text-text-muted">
      {{ puedeCotizar ? 'La requisición ya no admite cambios en el registro (la autorización está en curso o terminó).' : 'Vista de consulta: solo Adquisiciones captura el registro.' }}
    </p>

    <label class="flex flex-col gap-1 text-[12px] font-bold text-text-muted">
      Proveedor *
      <input
        v-model="proveedor"
        :list="listaId"
        :class="campo"
        :disabled="!editable"
        placeholder="Nombre del proveedor (del catálogo o nuevo)"
        autocomplete="off"
        data-test="cm-proveedor"
      />
    </label>
    <datalist :id="listaId">
      <option v-for="n in sugerencias" :key="n" :value="n" />
    </datalist>
    <p v-if="editable && proveedor.trim()" class="-mt-1 text-[11.5px] text-text-soft" data-test="cm-catalogo">
      <template v-if="enCatalogo">Está en el catálogo de proveedores.</template>
      <template v-else>
        No está en el catálogo: antes de enviar a autorización regístralo en la pestaña
        <button type="button" class="font-bold text-vz-blue hover:underline" @click="emit('tab', 'autorizacion')">Autorización</button> (bloque «Proveedor para la compra»; para remisión basta el nombre comercial).
      </template>
    </p>

    <div class="min-w-0 max-w-full overflow-x-auto rounded-lg border border-border" role="region" aria-label="Precios por partida" tabindex="0">
      <table class="w-full border-collapse text-[12.5px]">
        <thead>
          <tr class="bg-bg text-left text-[11px] font-bold uppercase tracking-wide text-text-soft">
            <th scope="col" class="px-2.5 py-1.5">Partida</th>
            <th scope="col" class="w-[84px] px-2 py-1.5 text-right">Cantidad</th>
            <th scope="col" class="w-[130px] px-2 py-1.5 text-right">Precio unitario</th>
            <th scope="col" class="w-[100px] px-2.5 py-1.5 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in partidas" :key="p.id" class="border-t border-border">
            <th scope="row" class="px-2.5 py-1.5 text-left font-semibold text-text">{{ p.num }}. {{ p.producto }}</th>
            <td class="px-2 py-1.5 text-right tabular-nums text-text-muted">{{ p.cantidad }}</td>
            <td class="px-2 py-1.5">
              <input
                v-model="precios[p.id]"
                :class="`${campo} text-right tabular-nums ${invalido(p.id) ? '!border-vz-danger' : ''}`"
                inputmode="decimal"
                placeholder="0.00"
                :disabled="!editable"
                :aria-label="`Precio unitario de ${p.producto}`"
                :data-test="`cm-precio-${i}`"
              />
            </td>
            <td class="px-2.5 py-1.5 text-right tabular-nums text-text-muted">{{ importe(p) === undefined ? '—' : formatoMoneda(importe(p)) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-t border-border bg-bg">
            <th scope="row" colspan="3" class="px-2.5 py-2 text-right text-[12px] font-bold text-text">Total (IVA incluido en los precios)</th>
            <td class="px-2.5 py-2 text-right text-[14px] font-extrabold tabular-nums text-text" data-test="cm-total">{{ formatoMoneda(total) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <p v-if="editable && excedido" role="alert" class="rounded-lg border border-vz-danger/40 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger" data-test="cm-excedido">
      {{ textoRegistroExcedido(umbral) }}
      <button v-if="!registro" type="button" class="ml-1 font-bold underline" data-test="cm-ir-completa" @click="emit('completa')">Usar el cotizador completo</button>
    </p>
    <p v-else-if="editable && completo" class="rounded-lg border border-vz-success/30 bg-vz-success/10 px-3 py-1.5 text-[12px] text-text">
      Cumple: {{ formatoMoneda(total) }} es menor a {{ formatoUmbral(umbral) }}; basta el registro.
    </p>
    <p v-if="error" role="alert" class="rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ error }}</p>

    <div v-if="editable" class="flex flex-wrap items-center justify-end gap-2">
      <p class="mr-auto text-[12px] text-text-muted">
        <span v-if="registro && !sucio" class="font-bold text-vz-success">Registro guardado y elegido.</span>
        <span v-else-if="sucio" class="font-bold text-vz-warning">Cambios sin guardar.</span>
      </p>
      <button v-if="registro" type="button" :class="btn" :disabled="ocupado" data-test="cm-descartar" @click="descartar = true">Descartar registro</button>
      <button type="button" :class="btnPrimary" :disabled="ocupado || !puedeGuardar" data-test="cm-guardar" @click="guardar">
        {{ ocupado ? 'Guardando…' : registro ? 'Guardar cambios' : 'Guardar compra menor' }}
      </button>
    </div>

    <MotivoModal
      v-if="descartar"
      title="Descartar registro de compra menor"
      label="Motivo del descarte"
      :descripcion="`Se descarta el registro de ${registro?.proveedor}. No se borra: queda como descartado y podrás cotizar de forma completa.`"
      confirm-label="Descartar"
      danger
      :accion="accionDescartar"
      @close="descartar = false"
    />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  actualizarCotizacion,
  buscarProveedores,
  descartarCotizacion,
  esCompraMenor,
  formatoMoneda,
  formatoUmbral,
  getConfig,
  getRequisicion,
  listPartidas,
  preciosDe,
  proveedoresPrevios,
  registrarCompraMenor,
  registroActivo,
  textoRegistroExcedido,
} from 'src/lib/compras'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'
import MotivoModal from '../MotivoModal.vue'
import { useAcceso } from '../useAcceso'
import { btn, btnPrimary } from '../util'
import { numTxt } from './hoja'

/**
 * «Compra menor»: registro de una compra por debajo de `umbralSinCotizacion`. Solo proveedor y precio por partida; al guardar crea la cotización
 * con `esRegistro` y la elige sola. Las reglas (exclusión mutua, umbral estricto) viven en `src/lib/compras/cotizaciones.js`.
 */
const props = defineProps({ folio: { type: String, required: true } })
const emit = defineEmits(['tab', 'guardada', 'completa'])
const toast = useToast()
const { puedeCotizar } = useAcceso()

const campo =
  'h-8 w-full min-w-0 rounded-md border border-border bg-bg px-2 text-[12.5px] text-text outline-none placeholder:text-text-soft focus:border-vz-blue focus:ring-2 focus:ring-vz-blue/30 disabled:border-transparent disabled:bg-transparent disabled:opacity-100'

const req = computed(() => getRequisicion(props.folio))
const umbral = computed(() => getConfig().umbralSinCotizacion)
const partidas = computed(() => listPartidas(props.folio))
const editable = computed(() => puedeCotizar.value && (req.value?.estado === 'recibida' || req.value?.estado === 'en_cotizacion'))
const registro = computed(() => registroActivo(props.folio))
const listaId = computed(() => `cm-proveedores-${props.folio}`)

const proveedor = ref('')
const precios = ref({})
const error = ref('')
const ocupado = ref(false)
const descartar = ref(false)

function cargar() {
  const r = registro.value
  proveedor.value = r?.proveedor ?? ''
  const guardados = r ? preciosDe(r.id) : {}
  precios.value = Object.fromEntries(partidas.value.map((p) => [p.id, guardados[p.id] === undefined ? '' : String(guardados[p.id])]))
  error.value = ''
}
cargar()
watch(() => props.folio, cargar)
// Si el registro cambia desde fuera (p. ej. se descartó o Finanzas pidió un ajuste) se recarga la captura.
watch(() => registro.value?.id, cargar)

const sugerencias = computed(() => {
  const nombres = new Set()
  for (const p of buscarProveedores('')) nombres.add(p.nombreComercial)
  for (const p of proveedoresPrevios({ excluirFolio: props.folio })) nombres.add(p.proveedor)
  return [...nombres].slice(0, 60)
})
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const enCatalogo = computed(() => buscarProveedores(proveedor.value).some((p) => norm(p.nombreComercial) === norm(proveedor.value)))

const precioDe = (pid) => {
  const n = numTxt(precios.value[pid])
  return typeof n === 'number' && n >= 0 ? n : undefined
}
const invalido = (pid) => numTxt(precios.value[pid]) === null || (typeof numTxt(precios.value[pid]) === 'number' && numTxt(precios.value[pid]) < 0)
const importe = (p) => {
  const v = precioDe(p.id)
  return v === undefined ? undefined : Math.round(v * p.cantidad * 100) / 100
}
const total = computed(() => Math.round(partidas.value.reduce((s, p) => s + (importe(p) ?? 0), 0) * 100) / 100)
const completo = computed(() => partidas.value.length > 0 && partidas.value.every((p) => precioDe(p.id) !== undefined))
/** El total capturado llegó al umbral (>=): bloqueo desde que se rebasa, aunque falten partidas por capturar. */
const excedido = computed(() => total.value > 0 && !esCompraMenor(total.value, umbral.value))

const firma = () => JSON.stringify([proveedor.value.trim(), partidas.value.map((p) => precioDe(p.id) ?? null)])
const firmaGuardada = computed(() => {
  const r = registro.value
  if (!r) return JSON.stringify(['', partidas.value.map(() => null)])
  const g = preciosDe(r.id)
  return JSON.stringify([r.proveedor, partidas.value.map((p) => g[p.id] ?? null)])
})
const sucio = computed(() => firma() !== firmaGuardada.value)
const puedeGuardar = computed(() => !!proveedor.value.trim() && completo.value && !excedido.value && (!registro.value || sucio.value))

async function guardar() {
  error.value = ''
  if (!proveedor.value.trim()) {
    error.value = 'Escribe el proveedor.'
    return
  }
  if (!completo.value) {
    error.value = 'Captura el precio de todas las partidas.'
    return
  }
  ocupado.value = true
  try {
    const mapa = Object.fromEntries(partidas.value.map((p) => [p.id, precioDe(p.id)]))
    if (registro.value) {
      await actualizarCotizacion(registro.value.id, { proveedor: proveedor.value }, mapa)
      toast('Registro de compra menor actualizado.')
    } else {
      await registrarCompraMenor({ folio: props.folio, proveedor: proveedor.value, precios: mapa })
      toast('Compra menor registrada y elegida. Revisa el proveedor y envía a autorización desde la pestaña Autorización.')
    }
    bump()
    cargar()
    emit('guardada')
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : 'No se pudo guardar el registro.'
  } finally {
    ocupado.value = false
  }
}

async function accionDescartar(motivo) {
  if (!registro.value) return
  await descartarCotizacion(registro.value.id, { motivo })
  bump()
  toast('Registro de compra menor descartado.')
  cargar()
}
</script>
