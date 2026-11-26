<template>
  <label class="flex flex-col gap-1.5">
    <span class="text-[12.5px] font-semibold text-text">{{ label }}</span>
    <slot />
  </label>
</template>

<script setup>
defineProps({ label: { type: String, required: true } })
</script>
