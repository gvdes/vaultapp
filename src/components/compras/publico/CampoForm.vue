<template>
  <div :class="`flex flex-col gap-1.5 ${cls ?? ''}`">
    <label :for="forId" class="flex items-baseline gap-1 text-[13px] font-bold text-text">
      <span>{{ label }}</span>
      <span v-if="required" class="text-vz-danger" aria-hidden="true">*</span>
      <span v-else-if="opcional" class="text-[11.5px] font-semibold text-text-soft">(opcional)</span>
    </label>
    <slot />
    <p v-if="hint && !error" :id="forId ? `${forId}-hint` : undefined" class="text-[12px] leading-snug text-text-muted">{{ hint }}</p>
    <p v-if="error" :id="forId ? `${forId}-err` : undefined" role="alert" class="flex items-start gap-1.5 text-[12.5px] font-semibold leading-snug text-vz-danger">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mt-px h-4 w-4 shrink-0" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
      </svg>
      <span>{{ error }}</span>
    </p>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  forId: String,
  hint: String,
  error: String,
  required: Boolean,
  opcional: Boolean,
  cls: String,
})
</script>
