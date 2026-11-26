<template>
  <div class="mx-auto flex h-full max-w-6xl flex-col px-4 py-6 sm:px-6">
    <div v-if="!permitido" class="m-auto max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-lg">
      <h1 class="text-[16px] font-extrabold text-text">Sin acceso</h1>
      <p class="mt-2 text-[13px] text-text-muted">El directorio solo lo consultan los roles que operan compras e inventario.</p>
    </div>

    <template v-else>
      <div class="mb-3">
        <h1 class="text-[15px] font-extrabold text-text">Directorio y configuración</h1>
        <p class="text-[12.5px] text-text-muted">
          Personas del proceso (solicitantes, aprobadores, custodios), accesos a la plataforma y reglas de Compras Indirectas. Nada se borra: todo se desactiva y queda en la bitácora.
        </p>
      </div>

      <div class="mb-3 flex gap-1.5 overflow-x-auto border-b border-border" role="tablist">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="tab === t.id"
          :class="`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-bold transition-colors ${tab === t.id ? 'border-vz-blue text-vz-blue' : 'border-transparent text-text-muted hover:text-text'}`"
          @click="seleccionar(t.id)"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="min-w-0 flex-1 overflow-y-auto overflow-x-hidden pb-8">
        <DirectorioTab v-if="visitadas.has('directorio')" v-show="tab === 'directorio'" :puede-editar="puedeGestionar" />
        <AccesosTab v-if="esAdmin && visitadas.has('accesos')" v-show="tab === 'accesos'" />
        <ReglasTab v-if="puedeVerReglas && visitadas.has('reglas')" v-show="tab === 'reglas'" :puede-editar="esAdmin" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useAuth } from 'src/lib/auth'
import { canManageDirectorio, canViewDirectorio } from 'src/lib/access'
import DirectorioTab from 'components/directorio/DirectorioTab.vue'
import AccesosTab from 'components/directorio/AccesosTab.vue'
import ReglasTab from 'components/directorio/ReglasTab.vue'

/** @typedef {'directorio' | 'accesos' | 'reglas'} TabId */

const { user } = useAuth()
const rol = computed(() => user.value?.role)

const permitido = computed(() => (rol.value ? canViewDirectorio(rol.value) : false))
const puedeGestionar = computed(() => (rol.value ? canManageDirectorio(rol.value) : false))
/** Accesos y edición de reglas: solo Dirección General. */
const esAdmin = computed(() => rol.value === 'admin')
/** Las reglas de compras las consulta quien interviene en el proceso (Finanzas y Adquisiciones en solo lectura). */
const puedeVerReglas = computed(() => rol.value === 'admin' || rol.value === 'finanzas' || rol.value === 'adquisiciones')

const tabs = computed(() => {
  const t = [{ id: 'directorio', label: 'Directorio' }]
  if (esAdmin.value) t.push({ id: 'accesos', label: 'Accesos' })
  if (puedeVerReglas.value) t.push({ id: 'reglas', label: 'Reglas de compras' })
  return t
})

const tab = ref('directorio')
// Cada pestaña se monta la primera vez que se abre y luego se conserva (así no se pierde lo que se estaba editando).
const visitadas = reactive(new Set(['directorio']))

function seleccionar(id) {
  tab.value = id
  visitadas.add(id)
}
</script>
