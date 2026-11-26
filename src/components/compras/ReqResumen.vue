<template>
  <div v-if="req" class="flex flex-col gap-4">
    <!-- Avisos -->
    <div v-if="avisos.length || separacion.length" class="flex flex-col gap-2">
      <div v-for="(a, i) in avisos" :key="`a${i}`" class="flex items-start gap-2 rounded-lg border border-vz-warning/30 bg-vz-warning/10 px-3 py-2 text-[12.5px] text-text">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="mt-0.5 h-4 w-4 shrink-0 text-vz-warning"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
        <p>
          {{ a.mensaje }}
          <RouterLink v-if="a.referencia && a.referencia.startsWith('REQ-')" :to="RUTAS_COMPRAS.requisicion(a.referencia)" class="ml-1 font-bold text-vz-blue hover:underline">Abrir {{ a.referencia }}</RouterLink>
        </p>
      </div>
      <div v-for="(s, i) in separacion" :key="`s${i}`" class="flex items-start gap-2 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] text-text">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="mt-0.5 h-4 w-4 shrink-0 text-vz-danger"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
        <p>{{ s }}</p>
      </div>
    </div>

    <!-- Datos generales -->
    <div class="rounded-xl border border-border bg-surface p-4">
      <h3 class="mb-3 text-[13px] font-bold text-text">Datos de la solicitud</h3>
      <dl class="grid grid-cols-1 gap-x-6 gap-y-2.5 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
        <div><dt class="text-[11px] text-text-soft">Solicitante</dt><dd class="font-semibold text-text">{{ req.solicitanteNombre }}</dd></div>
        <div><dt class="text-[11px] text-text-soft">Área</dt><dd class="font-semibold text-text">{{ req.area || '—' }}</dd></div>
        <div><dt class="text-[11px] text-text-soft">Para quién (inventario TI)</dt><dd class="font-semibold text-text">{{ req.paraQuien || '—' }}</dd></div>
        <div class="sm:col-span-2 lg:col-span-3"><dt class="text-[11px] text-text-soft">Sucursales</dt><dd class="font-semibold text-text">{{ ubicacionesTexto(req.ubicaciones) || '—' }}</dd></div>
        <div><dt class="text-[11px] text-text-soft">Urgencia</dt><dd :class="`font-semibold ${req.urgencia === 'urgente' ? 'text-vz-danger' : 'text-text'}`">{{ req.urgencia === 'urgente' ? 'Urgente' : 'Normal' }}</dd></div>
        <div><dt class="text-[11px] text-text-soft">Para cuándo</dt><dd class="font-semibold text-text">{{ fechaISOTexto(req.fechaRequerida) }}</dd></div>
        <div v-if="verDinero"><dt class="text-[11px] text-text-soft">Forma de pago</dt><dd class="font-semibold text-text">{{ FORMA_PAGO_LABEL[req.formaPago] ?? 'Efectivo (caja chica)' }}</dd></div>
        <div v-if="verDinero && proveedor"><dt class="text-[11px] text-text-soft">Proveedor (catálogo)</dt><dd class="font-semibold text-text">{{ proveedor.nombreComercial }}</dd></div>
        <div v-if="verDinero && proveedor"><dt class="text-[11px] text-text-soft">Razón social · RFC</dt><dd class="font-semibold text-text">{{ proveedor.razonSocial || '—' }} · <span class="font-mono">{{ proveedor.rfc || 'sin RFC' }}</span></dd></div>
        <div v-if="verDinero && proveedor"><dt class="text-[11px] text-text-soft">Tipo</dt><dd class="font-semibold text-text">{{ TIPO_PROVEEDOR_LABEL[proveedor.tipo] }}</dd></div>
        <div v-if="verDinero && req.proveedorId"><dt class="text-[11px] text-text-soft">El pago va a</dt><dd class="font-semibold text-text" data-test="destino-pago">{{ DESTINO_PAGO_LABEL[destinoDePago(req.formaPago)] }}</dd></div>
        <div v-if="req.notas" class="sm:col-span-2 lg:col-span-3"><dt class="text-[11px] text-text-soft">Notas</dt><dd class="whitespace-pre-line text-text">{{ req.notas }}</dd></div>
        <div v-if="verDinero && (req.excepcionCotizaciones || req.excepcionTipo)" class="sm:col-span-2 lg:col-span-3"><dt class="text-[11px] text-text-soft">Excepción de cotizaciones</dt><dd class="text-text">{{ textoExcepcion(req) }}</dd></div>
        <div v-if="verDinero && req.justificacionDiferencia" class="sm:col-span-2 lg:col-span-3"><dt class="text-[11px] text-text-soft">Justificación de la diferencia</dt><dd class="text-text">{{ req.justificacionDiferencia }}</dd></div>
      </dl>
    </div>

    <!-- Partidas -->
    <div class="rounded-xl border border-border bg-surface">
      <h3 class="border-b border-border px-4 py-3 text-[13px] font-bold text-text">Partidas ({{ partidas.length }})</h3>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[720px] text-[12.5px]">
          <thead>
            <tr class="border-b border-border bg-bg text-left text-text-muted">
              <th class="px-3 py-2 font-bold">#</th>
              <th class="px-3 py-2 font-bold">Producto</th>
              <th class="px-3 py-2 font-bold">Categoría</th>
              <th class="px-3 py-2 text-right font-bold">Cantidad</th>
              <th class="px-3 py-2 font-bold">Reparto por sucursal</th>
              <th class="px-3 py-2 font-bold">Imagen</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in partidas" :key="p.id" class="border-b border-border align-top last:border-0">
              <td class="px-3 py-2 text-text-soft">{{ p.num }}</td>
              <td class="px-3 py-2">
                <p class="font-semibold text-text">{{ p.producto }}</p>
                <p v-if="p.modeloMarca" class="text-[11.5px] text-text-muted">{{ p.modeloMarca }}</p>
                <p v-if="p.descripcion" class="text-[11.5px] text-text-muted">{{ p.descripcion }}</p>
                <p v-if="p.comentario" class="text-[11.5px] italic text-text-soft">{{ p.comentario }}</p>
              </td>
              <td class="px-3 py-2">
                <p class="text-text-muted">{{ getCategoria(p.categoriaId)?.nombre ?? '—' }}</p>
                <span :class="`mt-1 inline-block rounded-full border px-1.5 py-px text-[10px] font-bold ${TONE_STYLES[DESTINO_TONO[destinoDeCategoria(p.categoriaId)]]}`">{{ DESTINO_LABEL[destinoDeCategoria(p.categoriaId)] }}</span>
              </td>
              <td class="px-3 py-2 text-right font-bold text-text">{{ p.cantidad }}</td>
              <td class="px-3 py-2 text-[11.5px] text-text-muted">{{ distribucion(p.distribucion) }}</td>
              <td class="px-3 py-2">
                <button v-if="p.imagenUrl" type="button" class="block" :title="`Ver imagen de ${p.producto}`" @click="imagen = { url: p.imagenUrl, titulo: p.producto }">
                  <img :src="p.imagenUrl" :alt="`Imagen de ${p.producto}`" class="h-12 w-12 rounded-md border border-border object-cover" loading="lazy" />
                </button>
                <span v-else class="text-text-soft">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Proveedores sugeridos -->
    <div class="rounded-xl border border-border bg-surface p-4">
      <h3 class="mb-2 text-[13px] font-bold text-text">Proveedores sugeridos por el solicitante</h3>
      <p v-if="req.proveedoresSugeridos.length === 0" class="text-[12.5px] text-text-soft">No sugirió proveedores.</p>
      <ul v-else class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <li v-for="(p, i) in req.proveedoresSugeridos" :key="i" class="rounded-lg border border-border bg-bg px-3 py-2 text-[12.5px]">
          <p class="font-bold text-text">{{ p.empresa }}</p>
          <p v-if="p.contacto" class="text-text-muted">Contacto: {{ p.contacto }}</p>
          <p v-if="p.telefono" class="text-text-muted">Tel.: {{ p.telefono }}</p>
          <p v-if="p.direccion" class="text-text-muted">{{ p.direccion }}</p>
        </li>
      </ul>
    </div>

    <ArchivoModal v-if="imagen" :url="imagen.url" :titulo="imagen.titulo" @close="imagen = null" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  DESTINO_PAGO_LABEL,
  FORMA_PAGO_LABEL,
  RUTAS_COMPRAS,
  TIPO_PROVEEDOR_LABEL,
  avisosAntesDeComprar,
  avisosSeparacionFunciones,
  cargarImagenesPartidas,
  destinoDeCategoria,
  destinoDePago,
  getCategoria,
  getProveedor,
  getRequisicion,
  listPartidas,
  textoExcepcion,
} from 'src/lib/compras'
import { getUbicacion } from 'src/lib/inventario/comunes'
import { TONE_STYLES } from 'components/statusMaps'
import ArchivoModal from './ArchivoModal.vue'
import { DESTINO_LABEL, DESTINO_TONO, fechaISOTexto, ubicacionesTexto } from './util'
import { useAcceso } from './useAcceso'

const props = defineProps({ folio: { type: String, required: true } })
// El custodio no ve avisos de compra/control, forma de pago ni justificaciones de dinero.
const { verDinero } = useAcceso()

const req = computed(() => getRequisicion(props.folio))
const proveedor = computed(() => getProveedor(req.value?.proveedorId))
const partidas = computed(() => listPartidas(props.folio))
const imagen = ref(null)
// Con la API las fotos de las partidas no vienen en la carga inicial (pesan ~200 KB c/u): se piden al abrir la requisición.
onMounted(() => void cargarImagenesPartidas(props.folio))
watch(() => props.folio, (f) => void cargarImagenesPartidas(f))

const avisos = computed(() => !verDinero.value ? [] : avisosAntesDeComprar(partidas.value.map((p) => ({ producto: p.producto, cantidad: p.cantidad, categoriaId: p.categoriaId })), { excluirFolio: props.folio }))
const separacion = computed(() => (verDinero.value ? avisosSeparacionFunciones(props.folio) : []))

function distribucion(d) {
  const e = Object.entries(d).filter(([, c]) => c > 0)
  if (e.length === 0) return '—'
  return e.map(([u, c]) => `${getUbicacion(u)?.nombre ?? u}: ${c}`).join(' · ')
}
</script>
