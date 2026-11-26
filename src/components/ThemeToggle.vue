<template>
  <button
    type="button"
    :aria-label="isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'"
    :title="isDark ? 'Tema claro' : 'Tema oscuro'"
    class="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
    @click="toggleTheme"
  >
    <svg v-if="isDark" viewBox="0 0 24 24" fill="none" class="h-4 w-4" stroke-width="1.8" stroke="currentColor">
      <circle cx="12" cy="12" r="4.5" />
      <path
        stroke-linecap="round"
        d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
      />
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
      <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z" />
    </svg>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useTheme } from 'src/composables/useTheme'

const { theme, toggleTheme } = useTheme()
const isDark = computed(() => theme.value === 'dark')
</script>
