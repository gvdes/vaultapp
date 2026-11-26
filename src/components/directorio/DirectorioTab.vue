<template>
  <div class="flex flex-col gap-3">
    <!-- Aviso permanente -->
    <div class="flex gap-2.5 rounded-xl border border-vz-blue/25 bg-vz-blue/5 p-3 text-[12.5px] text-text-muted">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="mt-0.5 h-4 w-4 shrink-0 text-vz-blue">
        <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
      <p>
        <b class="text-text">Este directorio es la única fuente de personas.</b> De aquí salen los solicitantes de la liga pública, los aprobadores y los responsables de equipo. El
        <b class="text-text">correo registrado es donde llegan los avisos</b> de cada requisición. Los cambios conservan su historial en la bitácora; nada se borra: las personas se
        <b class="text-text">desactivan</b> y pueden reactivarse.
        <template v-if="!puedeEditar"> Tu rol consulta el directorio en solo lectura.</template>
      </p>
    </div>

    <!-- Cobertura de roles críticos -->
    <div class="rounded-xl border border-border bg-surface p-3">
      <p class="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-soft">Quién cubre cada proceso (personas activas)</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="c in cobertura"
          :key="c.id"
          type="button"
          :title="`Ver personas con el rol ${c.label}`"
          :class="`rounded-full border px-2.5 py-1 text-[12px] font-bold transition-colors ${coberturaClase(c.n)}`"
          @click="aplicarRol(c.id)"
        >
          {{ c.label }}: {{ c.n === 0 ? 'sin titular' : c.n === 1 ? '1 (único)' : c.n }}
        </button>
      </div>
    </div>

    <!-- Contadores + acciones -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-[12.5px] text-text-muted">
        <b class="text-text">{{ nActivos }}</b> activos · <b class="text-text">{{ nInactivos }}</b> desactivados · <b class="text-text">{{ nAlertas }}</b> con aviso de datos
      </p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover" :disabled="refrescando" @click="refrescar">
          {{ refrescando ? 'Actualizando…' : 'Actualizar' }}
        </button>
        <button type="button" class="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover disabled:opacity-50" :disabled="filtradas.length === 0" @click="exportarExcel">
          Exportar Excel
        </button>
        <template v-if="puedeEditar">
          <button type="button" class="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover" @click="showImportar = true">Importar CSV</button>
          <button type="button" class="h-9 rounded-lg bg-vz-blue px-3 text-[13px] font-bold text-white hover:bg-primary-hover" @click="abrirNueva">+ Agregar persona</button>
        </template>
      </div>
    </div>

    <!-- Filtros -->
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <input v-model="q" type="search" placeholder="Buscar nombre, correo, puesto…" :class="`${inputClass} lg:col-span-2`" aria-label="Buscar" />
      <select v-model="fEstado" :class="selectClass" aria-label="Estado">
        <option value="activos">Activos</option>
        <option value="inactivos">Desactivados</option>
        <option value="todos">Todos</option>
      </select>
      <select v-model="fRol" :class="selectClass" aria-label="Rol de proceso">
        <option value="">Todos los roles</option>
        <option v-for="r in ROLES_PARTICIPANTE" :key="r.id" :value="r.id">{{ ROL_CORTO[r.id] }}</option>
      </select>
      <select v-model="fArea" :class="selectClass" aria-label="Área">
        <option value="">Todas las áreas</option>
        <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
      </select>
      <select v-model="fSucursal" :class="`${selectClass} sm:col-span-2 lg:col-span-1`" aria-label="Sucursal">
        <option value="">Todas las sucursales</option>
        <option value="__sin">Sin sucursal</option>
        <option v-for="u in sucursales" :key="u.id" :value="u.id">{{ u.nombre }}</option>
      </select>
    </div>
    <div class="-mt-1 flex items-center justify-between text-[12px] text-text-muted">
      <span>{{ filtradas.length }} persona(s)<template v-if="hayFiltros"> con estos filtros</template></span>
      <button v-if="hayFiltros" type="button" class="font-semibold text-vz-blue hover:underline" @click="limpiar">Limpiar filtros</button>
    </div>

    <!-- Vacíos -->
    <div v-if="!cargada" class="rounded-xl border border-border bg-surface p-8 text-center text-[13px] text-text-soft">Cargando directorio…</div>
    <div v-else-if="total === 0" class="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
      <p class="text-[14px] font-bold text-text">El directorio está vacío</p>
      <p class="mx-auto mt-1 max-w-md text-[12.5px] text-text-muted">
        Sin personas nadie puede levantar una requisición ni recibir avisos.
        <template v-if="puedeEditar">Agrega a los líderes uno por uno o impórtalos desde un CSV.</template>
      </p>
      <div v-if="puedeEditar" class="mt-3 flex justify-center gap-2">
        <button type="button" class="h-9 rounded-lg bg-vz-blue px-3 text-[13px] font-bold text-white hover:bg-primary-hover" @click="abrirNueva">+ Agregar persona</button>
        <button type="button" class="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover" @click="showImportar = true">Importar CSV</button>
      </div>
    </div>
    <div v-else-if="filtradas.length === 0" class="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
      <p class="text-[14px] font-bold text-text">Ninguna persona coincide</p>
      <p class="mt-1 text-[12.5px] text-text-muted">
        {{ fEstado === 'activos' && nInactivos > 0 ? 'Prueba con "Desactivados" o "Todos" en el filtro de estado, o limpia los filtros.' : 'Prueba con otra búsqueda o limpia los filtros.' }}
      </p>
    </div>

    <template v-else>
      <!-- Tabla (escritorio) -->
      <div class="hidden overflow-hidden rounded-xl border border-border bg-surface lg:block">
        <table class="w-full table-fixed border-collapse text-[13px]">
          <thead>
            <tr class="border-b border-border bg-bg">
              <th class="w-[24%] px-3 py-2 text-left font-bold text-text-muted">Persona</th>
              <th class="w-[24%] px-3 py-2 text-left font-bold text-text-muted">Correo</th>
              <th class="w-[17%] px-3 py-2 text-left font-bold text-text-muted">Área · Sucursal</th>
              <th class="w-[17%] px-3 py-2 text-left font-bold text-text-muted">Roles</th>
              <th class="w-[18%] px-3 py-2 text-left font-bold text-text-muted">{{ puedeEditar ? 'Estado / acciones' : 'Estado' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in visibles" :key="p.id" :class="`border-b border-border align-top last:border-0 hover:bg-surface-hover ${p.activo ? '' : 'bg-bg/60'}`">
              <td class="px-3 py-2.5">
                <p :class="`break-words font-bold ${p.activo ? 'text-text' : 'text-text-muted'}`">{{ p.nombre }}</p>
                <p v-if="p.puesto" class="break-words text-[12px] text-text-muted">{{ p.puesto }}</p>
              </td>
              <td class="px-3 py-2.5">
                <p class="break-all text-text-muted">{{ p.correo || '—' }}</p>
                <p v-for="h in pistasCorreo(p.correo)" :key="h.texto" :class="`text-[11.5px] font-semibold ${claseTono(h.tono)}`">{{ h.texto }}</p>
              </td>
              <td class="px-3 py-2.5 text-text-muted">
                <p class="break-words">{{ p.area || '—' }}</p>
                <p class="break-words text-[12px] text-text-soft">{{ nombreUbicacionParticipante(p) || 'Sin sucursal' }}</p>
              </td>
              <td class="px-3 py-2.5">
                <div class="flex flex-wrap gap-1">
                  <span v-for="r in rolesVisibles(p.roles)" :key="r" :class="`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${esRolCritico(r) ? 'bg-vz-teal/12 text-vz-teal' : 'bg-vz-blue/10 text-vz-blue'}`">{{ ROL_CORTO[r] }}</span>
                  <span v-if="textoTope(p)" class="rounded-full bg-vz-gold/25 px-2 py-0.5 text-[10.5px] font-bold text-text" title="Tope de aprobación: monto máximo que este aprobador de Finanzas puede autorizar">{{ textoTope(p) }}</span>
                </div>
              </td>
              <td class="px-3 py-2.5">
                <StatusPill :label="p.activo ? 'Activo' : 'Desactivado'" :tone="p.activo ? 'success' : 'neutral'" />
                <p v-if="!p.activo" class="mt-1 break-words text-[11.5px] text-text-muted">{{ textoMotivo(p) }}</p>
                <p v-if="puedeEditar && soloDireccion(p)" class="mt-1.5 text-[11.5px] text-text-soft">Solo Dirección lo edita. <button type="button" class="font-bold text-vz-blue hover:underline" @click="editar(p)">Ver</button></p>
                <div v-else-if="puedeEditar" class="mt-1.5 flex gap-3 text-[12px] font-bold">
                  <button type="button" class="text-vz-blue hover:underline" @click="editar(p)">Editar</button>
                  <button v-if="p.activo" type="button" class="text-vz-danger hover:underline" @click="desactivar(p)">Desactivar</button>
                  <button v-else type="button" class="text-vz-success hover:underline" @click="reactivar(p)">Reactivar</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Tarjetas (teléfono / tableta) -->
      <div class="flex flex-col gap-2 lg:hidden">
        <div v-for="p in visibles" :key="p.id" :class="`rounded-xl border border-border p-3.5 ${p.activo ? 'bg-surface' : 'bg-bg/60'}`">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p :class="`break-words text-[14px] font-bold ${p.activo ? 'text-text' : 'text-text-muted'}`">{{ p.nombre }}</p>
              <p v-if="p.puesto" class="break-words text-[12px] text-text-muted">{{ p.puesto }}</p>
            </div>
            <StatusPill :label="p.activo ? 'Activo' : 'Desactivado'" :tone="p.activo ? 'success' : 'neutral'" />
          </div>
          <p class="mt-1.5 break-all text-[12.5px] text-text-muted">{{ p.correo || 'Sin correo' }}</p>
          <p v-for="h in pistasCorreo(p.correo)" :key="h.texto" :class="`text-[11.5px] font-semibold ${claseTono(h.tono)}`">{{ h.texto }}</p>
          <p class="mt-1 text-[12px] text-text-soft">{{ p.area || 'Sin área' }} · {{ nombreUbicacionParticipante(p) || 'Sin sucursal' }}</p>
          <div class="mt-2 flex flex-wrap gap-1">
            <span v-for="r in rolesVisibles(p.roles)" :key="r" :class="`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${esRolCritico(r) ? 'bg-vz-teal/12 text-vz-teal' : 'bg-vz-blue/10 text-vz-blue'}`">{{ ROL_CORTO[r] }}</span>
                  <span v-if="textoTope(p)" class="rounded-full bg-vz-gold/25 px-2 py-0.5 text-[10.5px] font-bold text-text" title="Tope de aprobación: monto máximo que este aprobador de Finanzas puede autorizar">{{ textoTope(p) }}</span>
          </div>
          <p v-if="!p.activo" class="mt-2 break-words text-[12px] text-text-muted">{{ textoMotivo(p) }}</p>
          <div v-if="puedeEditar && soloDireccion(p)" class="mt-2.5">
            <p class="mb-1 text-[11.5px] text-text-soft">Solo Dirección lo edita o desactiva.</p>
            <button type="button" class="h-8 w-full rounded-lg border border-border bg-surface text-[12.5px] font-bold text-vz-blue hover:bg-surface-hover" @click="editar(p)">Ver</button>
          </div>
          <div v-else-if="puedeEditar" class="mt-2.5 flex gap-2">
            <button type="button" class="h-8 flex-1 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-vz-blue hover:bg-surface-hover" @click="editar(p)">Editar</button>
            <button v-if="p.activo" type="button" class="h-8 flex-1 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-vz-danger hover:bg-surface-hover" @click="desactivar(p)">Desactivar</button>
            <button v-else type="button" class="h-8 flex-1 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-vz-success hover:bg-surface-hover" @click="reactivar(p)">Reactivar</button>
          </div>
        </div>
      </div>

      <div v-if="filtradas.length > limite" class="flex justify-center">
        <button type="button" class="h-9 rounded-lg border border-border bg-surface px-4 text-[13px] font-bold text-text hover:bg-surface-hover" @click="limite += 100">
          Mostrar más ({{ filtradas.length - limite }} restantes)
        </button>
      </div>
    </template>

    <ParticipanteModal v-if="showForm" :participante="editando" @close="cerrarForm" @saved="cerrarForm" />
    <DesactivarModal v-if="aDesactivar" :participante="aDesactivar" @close="aDesactivar = undefined" @done="aDesactivar = undefined" />
    <ImportarCsvModal v-if="showImportar" @close="showImportar = false" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import * as XLSX from 'xlsx'
import StatusPill from 'components/StatusPill.vue'
import { inputClass, selectClass } from 'components/formClasses'
import { useConfirm } from 'src/composables/useConfirm'
import { useToast } from 'src/composables/useToast'
import { bump } from 'src/lib/reactive'
import {
  ROLES_PARTICIPANTE,
  isParticipantesCacheReady,
  listParticipantes,
  loadParticipantesCache,
  nombreUbicacionParticipante,
  setParticipanteActivo,
} from 'src/lib/compras'
import { listUbicaciones } from 'src/lib/inventario/comunes'
import { useAuth } from 'src/lib/auth'
import ParticipanteModal from './ParticipanteModal.vue'
import DesactivarModal from './DesactivarModal.vue'
import ImportarCsvModal from './ImportarCsvModal.vue'
import { ROL_CORTO, asegurarPersistido, coberturaCritica, esRolCritico, fechaCorta, normalizar, pistasCorreo, rolesVisibles, seguroExcel, textoTope, tieneRolSoloDireccion } from './directorioUtils'

defineProps({ puedeEditar: { type: Boolean, required: true } })

const { user } = useAuth()
const esAdmin = computed(() => user.value?.role === 'admin')
/** Personas con roles de aprobación/tesorería/dirección/compras: solo Dirección las edita o desactiva. */
const soloDireccion = (p) => !esAdmin.value && tieneRolSoloDireccion(p.roles)

const confirmar = useConfirm()
const toast = useToast()

const cargada = ref(isParticipantesCacheReady())
const refrescando = ref(false)

onMounted(async () => {
  if (cargada.value) return
  try {
    await loadParticipantesCache()
  } finally {
    cargada.value = true
    bump()
  }
})

const q = ref('')
const fEstado = ref('activos')
const fRol = ref('')
const fArea = ref('')
const fSucursal = ref('')
const limite = ref(100)

const showForm = ref(false)
const editando = ref()
const aDesactivar = ref()
const showImportar = ref(false)

const todas = computed(() => listParticipantes({ incluirInactivos: true }))
const total = computed(() => todas.value.length)
const nActivos = computed(() => todas.value.filter((p) => p.activo).length)
const nInactivos = computed(() => total.value - nActivos.value)
const nAlertas = computed(() => todas.value.filter((p) => p.activo && pistasCorreo(p.correo).some((h) => h.tono !== 'neutral')).length)
const cobertura = computed(() => coberturaCritica())

const areas = computed(() => [...new Set(todas.value.map((p) => p.area).filter((a) => Boolean(a)))].sort((a, b) => a.localeCompare(b, 'es')))
const sucursales = computed(() => {
  const usadas = new Set(todas.value.map((p) => p.ubicacionId).filter(Boolean))
  return listUbicaciones()
    .filter((u) => usadas.has(u.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
})

const filtradas = computed(() => {
  const txt = normalizar(q.value)
  const lista = todas.value.filter((p) => {
    if (fEstado.value === 'activos' && !p.activo) return false
    if (fEstado.value === 'inactivos' && p.activo) return false
    if (fRol.value && !p.roles.includes(fRol.value)) return false
    if (fArea.value && p.area !== fArea.value) return false
    if (fSucursal.value === '__sin' && p.ubicacionId) return false
    if (fSucursal.value && fSucursal.value !== '__sin' && p.ubicacionId !== fSucursal.value) return false
    if (txt && !normalizar(`${p.nombre} ${p.correo} ${p.puesto ?? ''} ${p.area ?? ''}`).includes(txt)) return false
    return true
  })
  // Con "Todos", los activos primero.
  return fEstado.value === 'todos' ? [...lista].sort((a, b) => Number(b.activo) - Number(a.activo)) : lista
})
const visibles = computed(() => filtradas.value.slice(0, limite.value))
const hayFiltros = computed(() => Boolean(q.value || fRol.value || fArea.value || fSucursal.value || fEstado.value !== 'activos'))

function limpiar() {
  q.value = ''
  fRol.value = ''
  fArea.value = ''
  fSucursal.value = ''
  fEstado.value = 'activos'
  limite.value = 100
}

function aplicarRol(r) {
  fRol.value = fRol.value === r ? '' : r
  fEstado.value = 'activos'
}

function coberturaClase(n) {
  if (n === 0) return 'border-vz-danger/40 bg-vz-danger/10 text-vz-danger'
  if (n === 1) return 'border-vz-warning/40 bg-vz-warning/10 text-vz-warning'
  return 'border-vz-success/30 bg-vz-success/10 text-vz-success'
}

function claseTono(t) {
  return t === 'danger' ? 'text-vz-danger' : t === 'warning' ? 'text-vz-warning' : 'text-text-soft'
}

function textoMotivo(p) {
  if (!p.motivoBaja) return 'Sin motivo registrado.'
  const quien = [p.bajaPor, fechaCorta(p.bajaAt)].filter(Boolean).join(', ')
  return `Motivo: ${p.motivoBaja}${quien ? ` (${quien})` : ''}`
}

function abrirNueva() {
  editando.value = undefined
  showForm.value = true
}
function editar(p) {
  editando.value = p
  showForm.value = true
}
function cerrarForm() {
  showForm.value = false
  editando.value = undefined
}
function desactivar(p) {
  aDesactivar.value = p
}

async function reactivar(p) {
  if (!(await confirmar({ title: 'Reactivar', message: `¿Reactivar a ${p.nombre}? Volverá a aparecer en el directorio y a recibir avisos en ${p.correo}.`, confirmLabel: 'Reactivar' }))) return
  try {
    await setParticipanteActivo(p.id, true)
    await asegurarPersistido(p.id, { activo: true })
    toast(`${p.nombre} se reactivó.`)
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error')
  } finally {
    bump()
  }
}

async function refrescar() {
  refrescando.value = true
  try {
    await loadParticipantesCache()
    toast('Directorio actualizado.', 'info')
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error')
  } finally {
    refrescando.value = false
    bump()
  }
}

function exportarExcel() {
  const filas = filtradas.value.map((p) => ({
    Nombre: seguroExcel(p.nombre),
    Correo: seguroExcel(p.correo),
    Área: seguroExcel(p.area),
    Sucursal: seguroExcel(nombreUbicacionParticipante(p)),
    Puesto: seguroExcel(p.puesto),
    Roles: rolesVisibles(p.roles).map((r) => ROL_CORTO[r]).join('; '),
    'Tope de aprobación': textoTope(p),
    Estado: p.activo ? 'Activo' : 'Desactivado',
    'Motivo de baja': p.activo ? '' : seguroExcel(p.motivoBaja),
  }))
  const ws = XLSX.utils.json_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Directorio')
  XLSX.writeFile(wb, 'directorio.xlsx')
}
</script>
