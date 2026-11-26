<template>
  <Teleport to="body">
    <div class="fixed inset-0 flex items-center justify-center bg-black/40 px-4 py-8" style="z-index: 5500" @click="emit('close')">
      <div class="w-full max-w-xs rounded-2xl border border-border bg-surface p-5 text-center shadow-xl" @click.stop>
        <h2 class="mb-1 text-[15px] font-extrabold text-text">{{ titulo }}</h2>
        <p v-if="subtitulo" class="mb-3 text-[12px] text-text-muted">{{ subtitulo }}</p>
        <div class="mx-auto flex h-56 w-56 items-center justify-center rounded-xl border border-border bg-white p-2">
          <img v-if="dataUrl" :src="dataUrl" alt="Código QR" class="h-full w-full" />
          <div v-else class="h-8 w-8 animate-spin rounded-full border-2 border-vz-blue border-t-transparent" />
        </div>
        <p class="mt-3 break-all text-[10.5px] text-text-soft">{{ url }}</p>
        <div class="mt-4 flex gap-2">
          <button type="button" class="h-9 flex-1 rounded-lg border border-border bg-bg text-[12.5px] font-bold text-text-muted hover:bg-surface-hover" @click="handleDescargar">Descargar PNG</button>
          <button type="button" class="h-9 flex-1 rounded-lg bg-vz-blue text-[12.5px] font-bold text-white hover:bg-primary-hover" @click="handleImprimir">Imprimir etiqueta</button>
        </div>
        <button type="button" class="mt-3 h-8 w-full rounded-lg text-[12px] font-semibold text-text-soft hover:text-text" @click="emit('close')">Cerrar</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import QRCode from 'qrcode'

const props = defineProps({
  url: { type: String, required: true },
  titulo: { type: String, required: true },
  subtitulo: String,
})
const emit = defineEmits(['close'])

const dataUrl = ref(null)

watch(
  () => props.url,
  (url, _old, onCleanup) => {
    let cancel = false
    onCleanup(() => {
      cancel = true
    })
    dataUrl.value = null
    QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: '#101828', light: '#FFFFFF' } }).then((d) => {
      if (!cancel) dataUrl.value = d
    })
  },
  { immediate: true },
)

function handleDescargar() {
  if (!dataUrl.value) return
  const a = document.createElement('a')
  a.href = dataUrl.value
  a.download = `qr-${props.titulo.replace(/\s+/g, '-').toLowerCase()}.png`
  a.click()
}

function handleImprimir() {
  if (!dataUrl.value) return
  const win = window.open('', '_blank', 'width=420,height=560')
  if (!win) return
  win.document.write(`<!doctype html><html><head><title>Etiqueta · ${props.titulo}</title>
      <style>
        body { font-family: 'Nunito', system-ui, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; text-align:center; }
        img { width:220px; height:220px; }
        h1 { font-size:14px; margin:12px 0 2px; }
        p { font-size:11px; color:#555; margin:0; }
      </style>
      </head><body>
        <img src="${dataUrl.value}" />
        <h1>${props.titulo}</h1>
        ${props.subtitulo ? `<p>${props.subtitulo}</p>` : ''}
        <script>window.onload = () => { window.print(); }<\/script>
      </body></html>`)
  win.document.close()
}
</script>
