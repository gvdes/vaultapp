<template>
  <q-dialog :model-value="true" @update:model-value="(v: boolean) => !v && emit('close')" @hide="emit('close')">
    <div
      :class="`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-full overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl`"
      style="max-width: min(100vw - 32px, 42rem)"
    >
      <div class="mb-4 flex items-center justify-between gap-2">
        <h2 class="text-[15px] font-extrabold text-text">{{ title }}</h2>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <slot />
    </div>
  </q-dialog>
</template>

<script setup>
/**
 * Equivalente de <Modal title onClose wide> de la versión React. Se monta con v-if en el padre
 * (`<AppModal v-if="open" title="..." @close="open = false">...</AppModal>`) y emite `close`.
 */
defineProps({ title: { type: String, required: true }, wide: Boolean })
const emit = defineEmits(['close'])
</script>
