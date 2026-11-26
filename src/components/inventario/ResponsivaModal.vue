<template>
  <AppModal :title="`Responsiva ${responsiva.folio}`" wide @close="emit('close')">
    <div class="max-h-[65vh] overflow-auto rounded-lg border border-border bg-white">
      <div ref="docRef">
        <ResponsivaDocumento :responsiva="responsiva" />
      </div>
    </div>
    <div class="mt-4 flex justify-end gap-2">
      <button type="button" class="h-9 rounded-lg border border-border bg-bg px-3 text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">Cerrar</button>
      <button type="button" class="h-9 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white hover:bg-primary-hover" @click="printElement(docRef, `Responsiva ${responsiva.folio}`)">Imprimir</button>
    </div>
  </AppModal>
</template>

<script setup>
import { ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import ResponsivaDocumento from './ResponsivaDocumento.vue'
import { printElement } from 'src/lib/print'

defineProps({ responsiva: { type: Object, required: true } })
const emit = defineEmits(['close'])
const docRef = ref(null)
</script>
