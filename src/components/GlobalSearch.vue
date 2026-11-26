<template>
  <div ref="root" class="relative w-full max-w-xs">
    <div class="flex h-9 items-center gap-2 rounded-lg border border-border bg-bg px-3 text-[13px] text-text-soft focus-within:ring-2 focus-within:ring-vz-blue/30">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4 shrink-0">
        <circle cx="11" cy="11" r="7" />
        <path stroke-linecap="round" d="M21 21l-4.3-4.3" />
      </svg>
      <input
        v-model="q"
        placeholder="Buscar por serie, usuario, material…"
        class="min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-text-soft"
        @input="open = true"
        @focus="open = true"
      />
    </div>

    <div v-if="open && q.trim().length >= 2" class="absolute left-0 top-11 z-[80] w-full min-w-[280px] overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
      <p v-if="resultados.length === 0" class="px-3 py-4 text-center text-[12px] text-text-soft">Sin resultados.</p>
      <template v-else>
        <button
          v-for="r in resultados"
          :key="`${r.tipo}-${r.id}`"
          type="button"
          class="block w-full border-b border-border/60 px-3 py-2 text-left text-[12px] last:border-0 hover:bg-surface-hover"
          @click="handleSelect(r)"
        >
          <p class="font-bold text-text">{{ r.titulo }}</p>
          <p class="text-text-muted">{{ getFamilia(r.familiaId)?.nombre }} · {{ r.subtitulo }}</p>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from 'src/lib/auth'
import { equiposVisibles, materialesVisibles, tipoDeFamilia } from 'src/lib/vistaRol'
import { getFamilia } from 'src/lib/inventario/comunes'

/**
 * @typedef {object} Resultado
 * @property {string} id
 * @property {string} familiaId
 * @property {'equipo' | 'material'} tipo
 * @property {string} titulo
 * @property {string} subtitulo
 */

const router = useRouter()
const { user } = useAuth()
const q = ref('')
const open = ref(false)
const root = ref(null)

function onDocClick(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))

const resultados = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (term.length < 2) return []
  // Solo equipos/materiales de los dominios que el rol puede ver (lib/access.js → dominiosVisibles).
  const role = user.value?.role
  if (!role) return []
  const eq = equiposVisibles(role)
    .filter(
      (e) =>
        (e.numeroSerie ?? '').toLowerCase().includes(term) ||
        (e.modelo ?? '').toLowerCase().includes(term) ||
        (e.usuarioAsignado ?? '').toLowerCase().includes(term),
    )
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      familiaId: e.familiaId,
      tipo: 'equipo',
      titulo: e.modelo || e.numeroSerie || e.id,
      subtitulo: `${e.numeroSerie ?? ''} · ${e.usuarioAsignado ?? 'sin asignar'}`,
    }))
  const mat = materialesVisibles(role)
    .filter((m) => m.nombre.toLowerCase().includes(term))
    .slice(0, 6)
    .map((m) => ({
      id: m.id,
      familiaId: m.familiaId,
      tipo: 'material',
      titulo: m.nombre,
      subtitulo: `${m.cantidadActual} ${m.unidadMedida}`,
    }))
  return [...eq, ...mat]
})

function handleSelect(r) {
  open.value = false
  q.value = ''
  const base = tipoDeFamilia(r.familiaId) === 'mantenimiento' ? '/mantenimiento' : '/sistemas'
  void router.push(`${base}?familia=${r.familiaId}&highlight=${r.id}`)
}
</script>
