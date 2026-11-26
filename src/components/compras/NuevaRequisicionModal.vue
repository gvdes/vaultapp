<template>
  <AppModal title="Nueva requisición" wide @close="emit('close')">
    <div class="flex flex-col gap-4">
      <!-- Solicitante -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AppField label="Solicitante *">
          <input v-if="fijo" :value="solicitanteFijo?.nombre" readonly :class="`${inputClass} cursor-not-allowed opacity-80`" />
          <select v-else v-model="solicitanteId" :class="selectClass">
            <option value="">— Elige del directorio —</option>
            <option v-for="s in solicitantes" :key="s.id" :value="s.id">{{ s.nombre }}{{ s.area ? ` · ${s.area}` : '' }}</option>
          </select>
        </AppField>
        <AppField label="Urgencia">
          <select v-model="urgencia" :class="selectClass">
            <option value="normal">Normal</option>
            <option value="urgente">Urgente</option>
          </select>
        </AppField>
        <AppField label="Para cuándo">
          <input v-model="fechaRequerida" type="date" :min="hoy" :class="inputClass" />
        </AppField>
        <AppField :label="hayTI ? 'Para quién es la compra (inventario tecnológico) *' : 'Para quién es la compra'">
          <input v-model="paraQuien" :class="inputClass" placeholder="p. ej. nuevo ingreso de Ventas Bolivia" />
        </AppField>
      </div>
      <p v-if="fijo" class="-mt-2 text-[11.5px] text-text-soft">La requisición se levanta a tu nombre. El correo que se usa es el registrado en el directorio.</p>
      <p v-else-if="!solicitantes.length" class="-mt-2 rounded-lg border border-vz-warning/30 bg-vz-warning/10 px-3 py-2 text-[12px] font-semibold text-vz-warning">
        No hay solicitantes activos en el directorio de Compras.
      </p>
      <p v-if="noEncontrado" class="-mt-2 rounded-lg border border-vz-warning/30 bg-vz-warning/10 px-3 py-2 text-[12px] font-semibold text-vz-warning">
        No encontramos tu nombre en el directorio de solicitantes; elige uno de la lista.
      </p>

      <!-- Sucursales -->
      <fieldset>
        <legend class="mb-1.5 text-[12.5px] font-semibold text-text">Sucursal(es) *</legend>
        <div class="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-bg p-2">
          <label
            v-for="u in ubicaciones"
            :key="u.id"
            :class="`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${ubicSel.includes(u.id) ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-surface text-text-muted hover:bg-surface-hover'}`"
          >
            <input v-model="ubicSel" type="checkbox" :value="u.id" class="sr-only" />
            {{ u.nombre }}
          </label>
        </div>
      </fieldset>

      <!-- Partidas -->
      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <h3 class="text-[12.5px] font-bold text-text">Partidas *</h3>
          <button type="button" :class="btnMini" @click="agregarPartida">+ Agregar partida</button>
        </div>
        <div class="flex flex-col gap-2">
          <div v-for="(p, i) in partidas" :key="p.key" class="rounded-lg border border-border bg-bg p-2.5">
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.6fr_5rem]">
              <select v-model="p.categoriaId" :class="selectClass" :aria-label="`Categoría de la partida ${i + 1}`">
                <option value="">— Categoría —</option>
                <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
              </select>
              <div>
                <input v-model="p.producto" :list="`cat-${p.key}`" :class="inputClass" placeholder="Producto" :aria-label="`Producto de la partida ${i + 1}`" />
                <datalist :id="`cat-${p.key}`">
                  <option v-for="c in catalogoDe(p.categoriaId)" :key="c.id" :value="c.producto" />
                </datalist>
              </div>
              <input v-model.number="p.cantidad" type="number" min="1" step="1" :class="inputClass" placeholder="Cant." :aria-label="`Cantidad de la partida ${i + 1}`" />
            </div>
            <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input v-model="p.modeloMarca" :class="inputClass" placeholder="Modelo / marca (opcional)" />
              <input v-model="p.descripcion" :class="inputClass" placeholder="Descripción (opcional)" />
              <button v-if="partidas.length > 1" type="button" :class="btnMini" @click="quitarPartida(i)">Quitar</button>
            </div>
            <p v-if="destinoDeCategoria(p.categoriaId) !== 'ninguno' && p.categoriaId" class="mt-1.5 text-[11px] text-text-soft">
              Se registrará en el {{ DESTINO_LABEL[destinoDeCategoria(p.categoriaId)].toLowerCase() }} al comprarse.
            </p>
          </div>
        </div>
      </div>

      <AppField label="Notas">
        <textarea v-model="notas" :class="textareaClass" placeholder="Algo que Adquisiciones deba saber" />
      </AppField>

      <ul v-if="errores.length" role="alert" class="list-disc rounded-lg border border-vz-danger/30 bg-vz-danger/10 py-2 pl-7 pr-3 text-[12.5px] font-semibold text-vz-danger">
        <li v-for="e in errores" :key="e">{{ e }}</li>
      </ul>
    </div>

    <div class="mt-5 flex justify-end gap-2">
      <button type="button" :class="btn" :disabled="guardando" @click="emit('close')">Cancelar</button>
      <button type="button" :class="btnPrimary" :disabled="guardando" @click="guardar">{{ guardando ? 'Creando…' : 'Crear requisición' }}</button>
    </div>
  </AppModal>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { inputClass, selectClass, textareaClass } from 'components/formClasses'
import {
  RUTAS_COMPRAS,
  crearRequisicionInterna,
  destinoDeCategoria,
  listCatalogo,
  listCategorias,
  listParticipantes,
  normalizarNombre,
  validarRequisicion,
} from 'src/lib/compras'
import { listUbicaciones } from 'src/lib/inventario/comunes'
import { todayLocalDateString } from 'src/lib/dateUtils'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'
import { useAcceso } from './useAcceso'
import { DESTINO_LABEL, btn, btnMini, btnPrimary } from './util'

const emit = defineEmits(['close', 'created'])
const router = useRouter()
const toast = useToast()
const { role, nombre } = useAcceso()

const hoy = todayLocalDateString()
const categorias = computed(() => listCategorias())
const ubicaciones = computed(() => listUbicaciones().filter((u) => u.activo))
const solicitantes = computed(() => listParticipantes({ rol: 'solicitante' }))

/** Custodios (Soporte / Mantenimiento) piden a su nombre: se resuelve su ficha del directorio. */
const solicitanteFijo = computed(() => {
  const rolPart = role.value === 'capturista' ? 'infraestructura' : role.value === 'mantenimiento' ? 'mantenimiento' : undefined
  if (!rolPart) return undefined
  const candidatos = solicitantes.value.filter((s) => s.roles.includes(rolPart))
  return candidatos.find((s) => normalizarNombre(s.nombre) === normalizarNombre(nombre.value)) ?? candidatos[0]
})
const esCustodio = computed(() => role.value === 'capturista' || role.value === 'mantenimiento')
const fijo = computed(() => !!solicitanteFijo.value)
const noEncontrado = computed(() => esCustodio.value && !solicitanteFijo.value)

const solicitanteId = ref(solicitanteFijo.value?.id ?? '')
const urgencia = ref('normal')
const fechaRequerida = ref('')
const paraQuien = ref('')
const notas = ref('')
const ubicSel = ref(solicitanteFijo.value?.ubicacionId ? [solicitanteFijo.value.ubicacionId] : [])

/**
 * Extiende Omit<PartidaInput, 'cantidad'>.
 * @typedef {object} PartidaForm
 * @property {number} key
 * @property {number} cantidad
 * @property {string} categoriaId
 * @property {string} producto
 * @property {string} modeloMarca
 * @property {string} descripcion
 */
let seq = 0
const nuevaPartida = () => ({ key: ++seq, categoriaId: '', producto: '', cantidad: 1, modeloMarca: '', descripcion: '' })
const partidas = reactive([nuevaPartida()])
const agregarPartida = () => partidas.push(nuevaPartida())
const quitarPartida = (i) => partidas.splice(i, 1)
const catalogoDe = (categoriaId) => (categoriaId ? listCatalogo({ categoriaId }) : [])

const hayTI = computed(() => partidas.some((p) => destinoDeCategoria(p.categoriaId) === 'ti'))

const errores = ref([])
const guardando = ref(false)

function armar() {
  return {
    solicitanteId: fijo.value ? (solicitanteFijo.value?.id ?? '') : solicitanteId.value,
    ubicaciones: ubicSel.value,
    urgencia: urgencia.value,
    fechaRequerida: fechaRequerida.value || undefined,
    paraQuien: paraQuien.value.trim() || undefined,
    notas: notas.value.trim() || undefined,
    partidas: partidas.map((p) => ({
      categoriaId: p.categoriaId,
      producto: p.producto,
      cantidad: Number(p.cantidad),
      modeloMarca: p.modeloMarca.trim() || undefined,
      descripcion: p.descripcion.trim() || undefined,
    })),
  }
}

async function guardar() {
  const input = armar()
  errores.value = validarRequisicion(input)
  if (errores.value.length) return
  guardando.value = true
  try {
    const r = await crearRequisicionInterna(input)
    bump()
    toast(`Requisición ${r.folio} creada.`)
    emit('created', r.folio)
    emit('close')
    await router.push(RUTAS_COMPRAS.requisicion(r.folio))
  } catch (e) {
    errores.value = [e instanceof Error && e.message ? e.message : 'No se pudo crear la requisición.']
  } finally {
    guardando.value = false
  }
}
</script>
