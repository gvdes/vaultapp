<template>
  <section :id="`p-${p.uid}`" class="rounded-2xl border border-border bg-bg/60 p-3.5 sm:p-4" :aria-label="`Producto ${indice + 1}`">
    <div class="mb-3 flex items-center gap-2">
      <span class="flex h-7 min-w-7 items-center justify-center rounded-full bg-vz-blue px-2 text-[12px] font-extrabold text-white">{{ indice + 1 }}</span>
      <p class="min-w-0 flex-1 truncate text-[14px] font-extrabold text-text">{{ p.producto.trim() || 'Producto nuevo' }}</p>
      <button
        v-if="puedeQuitar"
        type="button"
        class="flex h-9 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-bold text-text-muted transition-colors hover:bg-vz-danger/10 hover:text-vz-danger focus-visible:outline-2 focus-visible:outline-vz-danger"
        :aria-label="`Quitar producto ${indice + 1}`"
        @click="emit('quitar')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
        Quitar
      </button>
    </div>

    <div class="grid gap-3.5 sm:grid-cols-2">
      <CampoForm label="Producto" :for-id="`${p.uid}-prod`" required :error="ver(e.producto)" cls="sm:col-span-2" :hint="p.delCatalogo ? undefined : 'Empieza a escribir: si está en el catálogo te lo sugerimos; si no, escríbelo con tus palabras.'">
        <ComboBox
          :id="`${p.uid}-prod`"
          :model-value="p.producto"
          :items="catalogoItems"
          libre
          :minimo="2"
          placeholder="Ej. Plumones, laptop, trapeador…"
          :invalido="!!ver(e.producto)"
          :describedby="e.producto && mostrarErrores ? `${p.uid}-prod-err` : undefined"
          @pick="alElegirProducto"
          @update:model-value="alEscribirProducto"
        />
      </CampoForm>

      <CampoForm label="Categoría" :for-id="`${p.uid}-cat`" required :error="ver(e.categoria)" :hint="p.delCatalogo ? 'Tomada del catálogo.' : undefined">
        <select :id="`${p.uid}-cat`" v-model="p.categoriaId" :class="`${inp} ${ver(e.categoria) ? inpError : ''}`">
          <option value="">Elige una categoría…</option>
          <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </CampoForm>

      <CampoForm :label="p.unidad ? `Cantidad (${p.unidad})` : 'Cantidad'" :for-id="`${p.uid}-cant`" required :error="ver(e.cantidad)">
        <QtyStepper v-model="p.cantidad" :id="`${p.uid}-cant`" :etiqueta="`Cantidad del producto ${indice + 1}`" />
      </CampoForm>

      <CampoForm
        :label="exigeDescripcion ? '¿Qué es? Describe qué es, presentación y para qué se usa' : 'Descripción'"
        :for-id="`${p.uid}-desc`"
        :required="exigeDescripcion"
        :opcional="!exigeDescripcion"
        :error="ver(e.descripcion)"
        :hint="exigeDescripcion ? `Ej. «Tóner negro HP 85A, caja con 1 pieza, para la impresora de caja».` : undefined"
        cls="sm:col-span-2"
      >
        <textarea
          :id="`${p.uid}-desc`"
          v-model="p.descripcion"
          rows="3"
          maxlength="500"
          :class="`${area} ${ver(e.descripcion) ? inpError : ''}`"
          :placeholder="exigeDescripcion ? 'Qué es, presentación y para qué se usa' : 'Detalles que ayuden a comprarlo bien'"
        />
        <p v-if="exigeDescripcion" :class="`text-right text-[11.5px] ${p.descripcion.trim().length >= MIN_DESCRIPCION ? 'text-vz-success' : 'text-text-soft'}`" aria-live="polite">
          {{ p.descripcion.trim().length }} / {{ MIN_DESCRIPCION }} letras mínimas
        </p>
      </CampoForm>
    </div>

    <!-- Reparto por sucursal -->
    <div v-if="lugares.length > 1" :class="`mt-4 rounded-xl border p-3 ${ver(e.reparto) ? 'border-vz-danger/60 bg-vz-danger/5' : 'border-border bg-surface'}`">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p class="text-[13px] font-extrabold text-text">¿Cuántas piezas para cada lugar?</p>
        <button type="button" class="h-8 rounded-lg border border-border px-2.5 text-[12px] font-bold text-vz-blue hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-vz-blue" @click="repartirParejo">Repartir parejo</button>
      </div>
      <ul class="grid gap-2 sm:grid-cols-2">
        <li v-for="l in lugares" :key="l.id" class="flex items-center justify-between gap-2 rounded-lg bg-bg px-2.5 py-1.5">
          <label :for="`${p.uid}-d-${l.id}`" class="min-w-0 flex-1 truncate text-[13px] text-text">{{ l.nombre }}</label>
          <input
            :id="`${p.uid}-d-${l.id}`"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            :value="p.distribucion[l.id] ?? 0"
            class="h-9 w-16 rounded-lg border border-border bg-surface text-center text-[15px] font-bold text-text outline-none focus:border-vz-blue focus:ring-2 focus:ring-vz-blue/30"
            :aria-label="`Piezas para ${l.nombre}`"
            @input="alEditarReparto(l.id, $event)"
          />
        </li>
      </ul>
      <p :class="`mt-2 text-[12.5px] font-bold ${sumaActual === p.cantidad ? 'text-vz-success' : 'text-vz-danger'}`" aria-live="polite">
        Repartido {{ sumaActual }} de {{ p.cantidad }}
        <span v-if="sumaActual === p.cantidad"> · listo</span>
        <span v-else-if="sumaActual < p.cantidad"> · faltan {{ p.cantidad - sumaActual }}</span>
        <span v-else> · sobran {{ sumaActual - p.cantidad }}</span>
      </p>
      <p v-if="ver(e.reparto)" role="alert" class="mt-1 text-[12.5px] font-semibold text-vz-danger">{{ e.reparto }}</p>
    </div>

    <!-- Detalles opcionales -->
    <button
      type="button"
      class="mt-3 flex h-9 items-center gap-1.5 rounded-lg px-1 text-[13px] font-bold text-vz-blue focus-visible:outline-2 focus-visible:outline-vz-blue"
      :aria-expanded="p.detallesAbiertos"
      :aria-controls="`${p.uid}-det`"
      @click="p.detallesAbiertos = !p.detallesAbiertos"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" :class="`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${p.detallesAbiertos ? 'rotate-90' : ''}`" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      Modelo, marca, comentario y foto
      <span v-if="tieneDetalles && !p.detallesAbiertos" class="rounded-full bg-vz-success/15 px-2 py-0.5 text-[11px] font-bold text-vz-success">con datos</span>
    </button>

    <div v-show="p.detallesAbiertos" :id="`${p.uid}-det`" class="mt-2 grid gap-3.5 sm:grid-cols-2">
      <CampoForm label="Modelo / marca" :for-id="`${p.uid}-mod`" opcional>
        <input :id="`${p.uid}-mod`" v-model="p.modeloMarca" maxlength="120" :class="inp" placeholder="Ej. Sharpie, HP 85A…" />
      </CampoForm>
      <CampoForm label="Comentario" :for-id="`${p.uid}-com`" opcional>
        <input :id="`${p.uid}-com`" v-model="p.comentario" maxlength="200" :class="inp" placeholder="Color, medida, urgencia de esta pieza…" />
      </CampoForm>
      <div class="sm:col-span-2">
        <p class="mb-1.5 text-[13px] font-bold text-text">Foto de referencia <span class="text-[11.5px] font-semibold text-text-soft">(opcional)</span></p>
        <div class="flex flex-wrap items-center gap-3">
          <img v-if="p.imagenUrl" :src="p.imagenUrl" :alt="`Foto del producto ${indice + 1}`" class="h-20 w-20 rounded-xl border border-border object-cover" />
          <div class="flex flex-wrap gap-2">
            <label
              :class="`${btnSecundario} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-vz-blue ${subiendo ? 'pointer-events-none opacity-60' : ''}`"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316zM16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              {{ subiendo ? 'Procesando…' : p.imagenUrl ? 'Cambiar foto' : 'Agregar foto' }}
              <input type="file" accept="image/*" class="sr-only" :disabled="subiendo" @change="alElegirFoto" />
            </label>
            <button v-if="p.imagenUrl" type="button" :class="btnSecundario" @click="p.imagenUrl = ''">Quitar</button>
          </div>
        </div>
        <p v-if="errorFoto" role="alert" class="mt-1.5 text-[12.5px] font-semibold text-vz-danger">{{ errorFoto }}</p>
        <p v-else class="mt-1.5 text-[12px] text-text-muted">La foto se reduce sola para que se envíe rápido, aun con datos móviles.</p>
      </div>
    </div>

    <!-- Avisos amigables -->
    <ul v-if="avisos.length" class="mt-3 flex flex-col gap-2" aria-label="Avisos antes de comprar">
      <li v-for="a in avisos" :key="claveAviso(a)" class="flex items-start gap-2.5 rounded-xl border border-vz-warning/40 bg-vz-warning/10 p-2.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="mt-0.5 h-5 w-5 shrink-0 text-vz-warning" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-extrabold text-text">Antes de pedirlo, ten en cuenta</p>
          <p class="text-[12.5px] leading-snug text-text-muted">{{ a.mensaje }} Puedes continuar si de todos modos lo necesitas.</p>
        </div>
        <button type="button" class="h-8 shrink-0 rounded-lg px-2 text-[12px] font-bold text-vz-blue hover:bg-vz-blue/10 focus-visible:outline-2 focus-visible:outline-vz-blue" @click="emit('descartarAviso', claveAviso(a))">Entendido</button>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { comprimirFoto } from 'src/lib/inventario/fotoComprimida'
import CampoForm from './CampoForm.vue'
import ComboBox from './ComboBox.vue'
import QtyStepper from './QtyStepper.vue'
import { area, btnSecundario, inp, inpError, norm } from './estilos'
import { MIN_DESCRIPCION, repartoParejo, requiereDescripcion, sumaReparto } from './formTipos'

const props = defineProps({
  partida: { type: Object, required: true },
  indice: { type: Number, required: true },
  categorias: { type: Array, required: true },
  catalogoItems: { type: Array, required: true },
  catalogo: { type: Array, required: true },
  lugares: { type: Array, required: true },
  errores: Object,
  mostrarErrores: { type: Boolean, required: true },
  avisos: { type: Array, required: true },
  puedeQuitar: { type: Boolean, required: true },
})
const emit = defineEmits(['quitar', 'descartarAviso'])

// El padre pasa un objeto reactivo del arreglo de partidas: se edita directamente (patrón del formulario).
// eslint-disable-next-line vue/no-mutating-props
const p = props.partida
const e = computed(() => props.errores ?? {})
const ver = (msg) => (props.mostrarErrores ? msg : undefined)

const cat = computed(() => props.categorias.find((c) => c.id === p.categoriaId))
const exigeDescripcion = computed(() => requiereDescripcion(cat.value, p.producto))
const tieneDetalles = computed(() => !!(p.modeloMarca.trim() || p.comentario.trim() || p.imagenUrl))
const ids = computed(() => props.lugares.map((l) => l.id))
const sumaActual = computed(() => sumaReparto(p, ids.value))

function alElegirProducto(it) {
  const prod = props.catalogo.find((c) => c.id === it.value)
  if (!prod) return
  p.categoriaId = prod.categoriaId
  p.unidad = prod.unidad ?? ''
}
function alEscribirProducto(v) {
  p.producto = v
  const c = props.catalogo.find((x) => norm(x.producto) === norm(v) && x.categoriaId === p.categoriaId)
  p.delCatalogo = !!c
  if (!c) p.unidad = ''
  else p.unidad = c.unidad ?? ''
}

watch(
  () => p.categoriaId,
  () => {
    const c = props.catalogo.find((x) => norm(x.producto) === norm(p.producto) && x.categoriaId === p.categoriaId)
    p.delCatalogo = !!c
  },
)

watch(
  () => [ids.value.join(','), p.cantidad],
  () => {
    if (ids.value.length < 2) return
    if (!p.repartoManual) {
      p.distribucion = repartoParejo(p.cantidad, ids.value)
    } else {
      const next = {}
      for (const id of ids.value) next[id] = Number(p.distribucion[id]) || 0
      p.distribucion = next
    }
  },
  { immediate: true },
)

function repartirParejo() {
  p.repartoManual = false
  p.distribucion = repartoParejo(p.cantidad, ids.value)
}
function alEditarReparto(id, ev) {
  const el = ev.target
  const limpio = el.value.replace(/[^0-9]/g, '')
  const n = limpio === '' ? 0 : Math.min(100000, Number(limpio))
  if (el.value !== String(n) && limpio !== '') el.value = String(n)
  p.repartoManual = true
  p.distribucion = { ...p.distribucion, [id]: n }
}

const subiendo = ref(false)
const errorFoto = ref('')
async function alElegirFoto(ev) {
  const input = ev.target
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  errorFoto.value = ''
  if (!file.type.startsWith('image/')) {
    errorFoto.value = 'Elige un archivo de imagen (JPG o PNG).'
    return
  }
  if (file.size > 25 * 1024 * 1024) {
    errorFoto.value = 'La imagen es demasiado grande (máximo 25 MB).'
    return
  }
  subiendo.value = true
  try {
    p.imagenUrl = await comprimirFoto(file, 900, 0.65)
  } catch {
    errorFoto.value = 'No pudimos procesar esa imagen. Prueba con otra.'
  } finally {
    subiendo.value = false
  }
}

function claveAviso(a) {
  return `${a.tipo}|${norm(a.producto)}|${a.referencia ?? ''}`
}
</script>
