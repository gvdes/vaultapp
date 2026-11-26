<template>
  <Teleport to="body">
    <div class="fixed inset-0 flex items-center justify-center bg-black/40 px-4 py-8" style="z-index: 5500" @click="emit('close')">
      <div class="flex max-h-full w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface p-5 shadow-xl" @click.stop>
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-[15px] font-extrabold text-text">Etiquetas QR · {{ documentTitle }}</h2>
          <div class="flex gap-2">
            <button type="button" class="h-9 rounded-lg bg-vz-blue px-3 text-[13px] font-bold text-white hover:bg-primary-hover" @click="printElement(printRef, documentTitle)">Imprimir</button>
            <button type="button" class="h-9 rounded-lg border border-border bg-bg px-3 text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">Cerrar</button>
          </div>
        </div>
        <div class="overflow-y-auto rounded-xl border border-border bg-bg p-3">
          <div ref="printRef" class="grid grid-cols-3 gap-3 bg-white p-3 sm:grid-cols-4">
            <div v-for="it in items" :key="it.id" class="flex flex-col items-center break-inside-avoid rounded-lg border border-black/10 p-2 text-center">
              <img v-if="codigos[it.id]" :src="codigos[it.id]" alt="QR" class="h-24 w-24" />
              <div v-else class="flex h-24 w-24 items-center justify-center text-[10px] text-black/40">Generando…</div>
              <p class="mt-1 line-clamp-2 text-[10px] font-bold text-black">{{ it.titulo }}</p>
              <p v-if="it.subtitulo" class="text-[9px] text-black/60">{{ it.subtitulo }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import QRCode from 'qrcode'
import { printElement } from 'src/lib/print'

/**
 * @typedef {object} EtiquetaItem
 * @property {string} id
 * @property {string} titulo
 * @property {string} [subtitulo]
 * @property {string} url
 */

const props = defineProps({ items: { type: Array, required: true }, documentTitle: { type: String, required: true } })
const emit = defineEmits(['close'])

const printRef = ref(null)
const codigos = ref({})

watch(
  () => props.items,
  (items, _old, onCleanup) => {
    let cancel = false
    onCleanup(() => {
      cancel = true
    })
    Promise.all(items.map(async (it) => [it.id, await QRCode.toDataURL(it.url, { width: 220, margin: 1 })])).then((pairs) => {
      if (!cancel) codigos.value = Object.fromEntries(pairs)
    })
  },
  { immediate: true },
)
</script>
