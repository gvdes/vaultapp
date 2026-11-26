<template>
  <div v-if="req" class="flex flex-col gap-4">
    <!-- Estado de la entrega -->
    <div :class="`rounded-xl border p-4 ${req.estado === 'entregada' ? 'border-vz-success/40 bg-vz-success/5' : 'border-border bg-surface'}`">
      <h3 class="text-[13px] font-bold text-text">Confirmación del solicitante</h3>
      <template v-if="req.estado === 'entregada'">
        <p class="mt-1 text-[13px] font-semibold text-vz-success">{{ req.solicitanteNombre }} confirmó que recibió su compra{{ fechaEntrega ? ` el ${fechaHora(fechaEntrega)}` : '' }}.</p>
        <p v-if="comentarioEntrega" class="text-[12px] text-text-muted">{{ comentarioEntrega }}</p>
      </template>
      <template v-else-if="req.estado === 'comprada'">
        <p class="mt-1 text-[12.5px] text-text-muted">
          La compra ya se registró. Falta que <strong class="text-text">{{ req.solicitanteNombre }}</strong> confirme que la recibió con su liga de seguimiento
          (también le llegó por correo). Comprada hace {{ diasDesde(fechaComprada ?? req.updatedAt) }} día(s).
        </p>
      </template>
      <p v-else-if="req.estado === 'cancelada' || req.estado === 'rechazada'" class="mt-1 text-[12.5px] text-text-muted">La requisición está {{ ESTADOS[req.estado].corta.toLowerCase() }}: no habrá entrega.</p>
      <p v-else class="mt-1 text-[12.5px] text-text-muted">Todavía no se compra. La entrega se confirma después de registrar la compra.</p>

      <div class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2">
        <span class="text-[11.5px] font-semibold text-text-soft">Liga de seguimiento del solicitante</span>
        <code class="min-w-0 flex-1 truncate text-[11.5px] text-text-muted">{{ ligaSeguimiento }}</code>
        <button type="button" :class="btnMini" @click="copiar">Copiar</button>
        <a :href="ligaSeguimiento" target="_blank" rel="noopener" :class="btnMini">Abrir</a>
      </div>
    </div>

    <!-- Recepciones a bodega -->
    <div class="rounded-xl border border-border bg-surface">
      <h3 class="border-b border-border px-4 py-3 text-[13px] font-bold text-text">Recepciones a inventario</h3>
      <p v-if="recepciones.length === 0" class="px-4 py-6 text-center text-[12.5px] text-text-soft">
        {{ sinInventario ? 'Ninguna partida de esta requisición va a inventario (categorías sin destino de inventario).' : 'Se generarán al marcar la compra como comprada, para las partidas de tecnología y mantenimiento.' }}
      </p>
      <ul v-else class="divide-y divide-border">
        <li v-for="r in recepciones" :key="r.id" class="flex flex-wrap items-start gap-3 px-4 py-3 text-[12.5px]">
          <div class="min-w-0 flex-1">
            <p class="font-bold text-text">{{ r.cantidad }} × {{ r.datos.producto }}</p>
            <p class="text-[11.5px] text-text-muted">
              {{ r.destino === 'ti' ? 'Inventario TI (Soporte e Infraestructura)' : 'Inventario Mantenimiento' }} · {{ formatoMoneda(r.datos.costoUnitarioReal) }} c/u
            </p>
            <p v-if="r.estado === 'confirmada'" class="mt-1 text-[11.5px] text-text-muted">
              Confirmó {{ r.confirmadoPor || '—' }} el {{ fechaHora(r.fechaConfirmacion) }}
            </p>
            <p v-if="r.estado === 'confirmada'" class="mt-0.5 flex flex-wrap gap-x-3">
              <RouterLink v-for="l in enlacesRecepcion(r)" :key="l.to" :to="l.to" class="text-[11.5px] font-semibold text-vz-blue hover:underline">{{ l.label }}</RouterLink>
            </p>
          </div>
          <span :class="`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${TONE_STYLES[r.estado === 'confirmada' ? 'success' : 'warning']}`">{{ r.estado === 'confirmada' ? 'Confirmada' : 'Pendiente' }}</span>
          <button v-if="r.estado === 'pendiente' && puedeConfirmar(r.destino)" type="button" :class="btnPrimary" @click="confirmando = r.id">Confirmar recepción</button>
        </li>
      </ul>
    </div>

    <ConfirmarRecepcionModal v-if="confirmando" :recepcion-id="confirmando" @close="confirmando = ''" @confirmed="bump" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ESTADOS,
  RUTAS_COMPRAS,
  destinoDeCategoria,
  formatoMoneda,
  getHistorial,
  getRequisicion,
  listPartidas,
  listRecepciones,
  urlBase,
} from 'src/lib/compras'
import { canConfirmRecepcion } from 'src/lib/access'
import { bump } from 'src/lib/reactive'
import { TONE_STYLES } from 'components/statusMaps'
import { useToast } from 'src/composables/useToast'
import ConfirmarRecepcionModal from './ConfirmarRecepcionModal.vue'
import { enlacesRecepcion } from './recepcionEnlaces'
import { useAcceso } from './useAcceso'
import { btnMini, btnPrimary, diasDesde, fechaDeEstado, fechaHora } from './util'

const props = defineProps({ folio: { type: String, required: true } })
const toast = useToast()
const { role } = useAcceso()

const req = computed(() => getRequisicion(props.folio))
const recepciones = computed(() => listRecepciones({ folio: props.folio }).sort((a, b) => a.createdAt - b.createdAt))
const sinInventario = computed(() => listPartidas(props.folio).every((p) => destinoDeCategoria(p.categoriaId) === 'ninguno'))
const fechaEntrega = computed(() => fechaDeEstado(props.folio, 'entregada'))
const fechaComprada = computed(() => fechaDeEstado(props.folio, 'comprada'))
const comentarioEntrega = computed(() => getHistorial(props.folio).filter((h) => h.aEstado === 'entregada').pop()?.comentario)
const ligaSeguimiento = computed(() => (req.value ? `${urlBase()}${RUTAS_COMPRAS.estatus(req.value.folio, req.value.token)}` : ''))
const puedeConfirmar = (destino) => !!role.value && canConfirmRecepcion(role.value, destino)
const confirmando = ref('')

async function copiar() {
  const url = ligaSeguimiento.value

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()

      const copiado = document.execCommand('copy')
      textarea.remove()

      if (!copiado) throw new Error('No se pudo copiar')
    }

    toast('Liga copiada.')
  } catch (error) {
    console.error('Error al copiar liga:', error)
    toast('No se pudo copiar; usa «Abrir».', 'error')
  }
}
</script>
