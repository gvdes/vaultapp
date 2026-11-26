<template>
  <AppModal :title="titulo" wide @close="emit('close')">
    <div class="flex flex-col gap-3">
      <img v-if="esImagen" :src="url" :alt="titulo" class="mx-auto max-h-[70vh] rounded-lg border border-border object-contain" />
      <iframe v-else :src="url" :title="titulo" class="h-[60vh] w-full rounded-lg border border-border bg-bg" />
      <div class="flex justify-end gap-2">
        <a :href="url" :download="nombreArchivo" :class="btn">Descargar</a>
        <button type="button" :class="btnPrimary" @click="emit('close')">Cerrar</button>
      </div>
    </div>
  </AppModal>
</template>

<script setup>
import { computed } from 'vue'
import AppModal from 'components/AppModal.vue'
import { btn, btnPrimary, esArchivoImagen } from './util'

/** Visor de comprobantes/cotizaciones (data URL en modo demo, URL pública con Supabase). */
const props = defineProps({ url: { type: String, required: true }, titulo: { type: String, required: true } })
const emit = defineEmits(['close'])
const esImagen = computed(() => esArchivoImagen(props.url))
const nombreArchivo = computed(() => props.titulo.replace(/[^a-zA-Z0-9._-]+/g, '_'))
</script>
