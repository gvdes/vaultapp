<template>
  <div ref="raiz" class="relative">
    <div class="relative">
      <input
        :id="id"
        ref="entrada"
        type="text"
        role="combobox"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        aria-autocomplete="list"
        :aria-expanded="abierto && visibles.length > 0"
        :aria-controls="listaId"
        :aria-activedescendant="abierto && resaltado >= 0 ? `${listaId}-${resaltado}` : undefined"
        :aria-invalid="invalido ? 'true' : undefined"
        :aria-describedby="describedby"
        :placeholder="placeholder"
        :disabled="disabled"
        :value="texto"
        :class="`${inp} ${libre ? '' : 'pr-9'} ${invalido ? inpError : ''}`"
        @input="alEscribir"
        @focus="alEnfocar"
        @blur="alSalir"
        @keydown="alTeclear"
      />
      <svg v-if="!libre" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-soft" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>

    <ul
      v-show="abierto && (visibles.length > 0 || mostrarVacio)"
      :id="listaId"
      role="listbox"
      class="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-surface py-1 shadow-xl"
    >
      <li
        v-for="(it, i) in visibles"
        :id="`${listaId}-${i}`"
        :key="it.value"
        role="option"
        :aria-selected="!libre && it.value === modelValue"
        :class="`cursor-pointer px-3 py-2 ${i === resaltado ? 'bg-vz-blue/10' : ''} ${!libre && it.value === modelValue ? 'font-extrabold' : ''}`"
        @mousedown.prevent="elegir(it)"
        @mousemove="resaltado = i"
      >
        <span class="block text-[14px] leading-snug text-text">{{ it.label }}</span>
        <span v-if="it.sub" class="block text-[12px] leading-snug text-text-muted">{{ it.sub }}</span>
      </li>
      <li v-if="visibles.length === 0 && mostrarVacio" class="px-3 py-3 text-[13px] text-text-muted" role="presentation">{{ textoVacio }}</li>
    </ul>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { inp, inpError, norm } from './estilos'

/**
 * @typedef {object} ItemCombo
 * @property {string} value
 * @property {string} label
 * @property {string} [sub] - Texto secundario (área, categoría…). También se usa al buscar.
 */

const props = defineProps({
  /** Modo selección: id del ítem elegido. Modo libre (`libre`): el texto escrito. */
  modelValue: { type: String, required: true },
  items: { type: Array, required: true },
  id: String,
  placeholder: { type: String, default: '' },
  invalido: Boolean,
  disabled: Boolean,
  /** Texto libre con sugerencias (autocompletar de producto). */
  libre: Boolean,
  textoVacio: { type: String, default: 'Sin coincidencias' },
  describedby: String,
  /** Máximo de opciones visibles a la vez. */
  maximo: { type: Number, default: 40 },
  /** En modo libre, caracteres mínimos para sugerir. */
  minimo: { type: Number, default: 1 },
})
const emit = defineEmits(['update:modelValue', 'pick'])

const raiz = ref(null)
const entrada = ref(null)
const abierto = ref(false)
const resaltado = ref(-1)
const escrito = ref('')
const sucio = ref(false)
const listaId = `cb-${Math.random().toString(36).slice(2, 9)}`

const elegido = computed(() => (props.libre ? undefined : props.items.find((i) => i.value === props.modelValue)))
const texto = computed(() => {
  if (props.libre) return props.modelValue
  if (abierto.value && sucio.value) return escrito.value
  return elegido.value?.label ?? ''
})

const consulta = computed(() => (props.libre ? props.modelValue : sucio.value ? escrito.value : ''))
const visibles = computed(() => {
  const q = norm(consulta.value)
  if (props.libre && q.length < props.minimo) return []
  const palabras = q.split(/\s+/).filter(Boolean)
  let lista = props.items
  if (palabras.length) {
    lista = props.items
      .map((it) => ({ it, h: norm(`${it.label} ${it.sub ?? ''}`), l: norm(it.label) }))
      .filter((x) => palabras.every((p) => x.h.includes(p)))
      .sort((a, b) => Number(b.l.startsWith(q)) - Number(a.l.startsWith(q)))
      .map((x) => x.it)
  }
  // En modo libre, si lo escrito ya es exactamente un ítem, no estorba con una lista de un solo elemento.
  if (props.libre && lista.length === 1 && norm(lista[0].label) === q) return []
  return lista.slice(0, props.maximo)
})
const mostrarVacio = computed(() => !props.libre && sucio.value && escrito.value.trim().length > 0)

watch(visibles, () => {
  resaltado.value = props.libre ? -1 : visibles.value.length ? 0 : -1
})

function alEnfocar() {
  if (props.disabled) return
  abierto.value = true
  sucio.value = false
  escrito.value = ''
  resaltado.value = props.libre ? -1 : Math.max(0, visibles.value.findIndex((i) => i.value === props.modelValue))
  void nextTick(() => entrada.value?.select())
}
function alSalir() {
  abierto.value = false
  sucio.value = false
}
function alEscribir(e) {
  const v = e.target.value
  abierto.value = true
  if (props.libre) {
    emit('update:modelValue', v)
  } else {
    sucio.value = true
    escrito.value = v
    // Si borra todo, se limpia la selección.
    if (!v && props.modelValue) emit('update:modelValue', '')
  }
}
function elegir(it) {
  emit('pick', it)
  emit('update:modelValue', props.libre ? it.label : it.value)
  abierto.value = false
  sucio.value = false
  entrada.value?.blur()
}
function alTeclear(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    abierto.value = true
    if (visibles.value.length) resaltado.value = (resaltado.value + 1) % visibles.value.length
    void nextTick(centrar)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (visibles.value.length) resaltado.value = (resaltado.value - 1 + visibles.value.length) % visibles.value.length
    void nextTick(centrar)
  } else if (e.key === 'Enter') {
    if (abierto.value && resaltado.value >= 0 && visibles.value[resaltado.value]) {
      e.preventDefault()
      elegir(visibles.value[resaltado.value])
    }
  } else if (e.key === 'Escape') {
    if (abierto.value) {
      e.stopPropagation()
      abierto.value = false
    }
  }
}
function centrar() {
  raiz.value?.querySelector(`#${listaId}-${resaltado.value}`)?.scrollIntoView({ block: 'nearest' })
}
</script>
