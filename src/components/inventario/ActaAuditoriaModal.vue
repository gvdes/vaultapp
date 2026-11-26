<template>
  <AppModal title="Acta de auditoría" wide @close="emit('close')">
    <div class="mb-3 flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        class="flex h-9 items-center gap-2 rounded-lg bg-vz-blue px-3 text-[13px] font-bold text-white hover:bg-primary-hover"
        @click="printElement(actaEl, `Acta de auditoría`)"
      >
        Imprimir / PDF
      </button>
    </div>
    <div class="max-h-[70vh] overflow-auto rounded-lg border border-border bg-white">
      <div ref="actaEl">
        <ActaAuditoria :auditoria-id="auditoriaId" />
      </div>
    </div>
  </AppModal>
</template>

<script setup>
import { ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import ActaAuditoria from 'components/inventario/ActaAuditoria.vue'
import { printElement } from 'src/lib/print'

defineProps({ auditoriaId: { type: String, required: true } })
const emit = defineEmits(['close'])

const actaEl = ref(null)
</script>
