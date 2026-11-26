<template>
  <div class="mx-auto flex h-full max-w-6xl flex-col px-4 py-6 sm:px-6">
    <div v-if="!permitido" class="m-auto max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-lg">
      <h1 class="text-[16px] font-extrabold text-text">Sin acceso</h1>
      <p class="mt-2 text-[13px] text-text-muted">La bitácora solo la consultan Dirección y Finanzas.</p>
    </div>

    <template v-else>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-[15px] font-extrabold text-text">Bitácora de cambios</h1>
          <p class="text-[12px] text-text-muted">Registro inmutable de altas y modificaciones: nada se borra ni se edita aquí; solo se consulta.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <!-- SOLO modo demo local (sin Supabase) y solo Dirección: nunca aparece en producción. -->
          <button
            v-if="mostrarSimulador"
            type="button"
            class="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-vz-danger/50 bg-vz-danger/5 px-3 text-[13px] font-bold text-vz-danger hover:bg-vz-danger/10"
            title="Solo para la demostración: registra un intento de borrado de ejemplo para ver la alerta funcionar"
            @click="simularIntento"
          >
            Simular intento de borrado
          </button>
          <button
            type="button"
            :disabled="filtradas.length === 0"
            class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover disabled:opacity-50"
            @click="exportarExcel"
          >
            Exportar Excel
          </button>
        </div>
      </div>

      <div v-if="intentosTotal > 0 || fAccion === LABEL_INTENTO" class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-vz-danger/30 bg-vz-danger/5 px-3 py-2 text-[12.5px]">
        <span class="font-bold text-vz-danger">{{ intentosTotal }} {{ intentosTotal === 1 ? 'intento de borrado' : 'intentos de borrado' }}</span>
        <span class="text-text-muted">Nada se borró: la base cancela el DELETE, lo anota aquí y avisa a Dirección.</span>
        <button
          type="button"
          :class="`ml-auto h-7 rounded-full px-3 text-[12px] font-bold ${fAccion === LABEL_INTENTO ? 'bg-vz-danger text-white' : 'border border-vz-danger/40 text-vz-danger hover:bg-vz-danger/10'}`"
          @click="fAccion = fAccion === LABEL_INTENTO ? '' : LABEL_INTENTO"
        >
          {{ fAccion === LABEL_INTENTO ? 'Ver todos los movimientos' : 'Ver solo los intentos' }}
        </button>
      </div>

      <div class="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <label class="flex flex-col gap-1">
          <span class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Módulo / tabla</span>
          <select v-model="fTabla" :class="selectClass">
            <option value="">Todos</option>
            <option v-for="t in tablasDisponibles" :key="t" :value="t">{{ tablaLabel(t) }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Usuario</span>
          <input v-model="fUsuario" placeholder="Nombre…" :class="inputClass" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Acción</span>
          <select v-model="fAccion" :class="selectClass">
            <option value="">Todas</option>
            <option v-for="a in accionesDisponibles" :key="a" :value="a">{{ a }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Desde</span>
          <input v-model="fDesde" type="date" :class="inputClass" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Hasta</span>
          <input v-model="fHasta" type="date" :class="inputClass" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Texto</span>
          <input v-model="fTexto" placeholder="Folio, serie, nombre…" :class="inputClass" />
        </label>
      </div>

      <div class="mb-2 flex items-center justify-between text-[12px] text-text-muted">
        <span>{{ filtradas.length }} movimiento(s)<template v-if="hayFiltros"> con estos filtros</template></span>
        <button v-if="hayFiltros" type="button" class="font-semibold text-vz-blue hover:underline" @click="limpiarFiltros">Limpiar filtros</button>
      </div>

      <div class="flex-1 overflow-y-auto pb-8">
        <div v-if="!cargada" class="rounded-xl border border-border bg-surface p-8 text-center text-[13px] text-text-soft">Cargando bitácora…</div>

        <div v-else-if="filtradas.length === 0" class="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
          <p class="text-[14px] font-bold text-text">{{ todas.length === 0 ? 'Todavía no hay movimientos registrados' : 'Sin resultados con estos filtros' }}</p>
          <p class="mt-1 text-[12px] text-text-muted">
            {{ todas.length === 0 ? 'Cada alta, cambio, baja o desactivación quedará aquí con quién, cuándo y qué cambió.' : 'Prueba ampliando el rango de fechas o limpiando los filtros.' }}
          </p>
        </div>

        <div v-else class="overflow-x-auto rounded-xl border border-border">
          <table class="w-full min-w-[860px] border-collapse text-[13px]">
            <thead>
              <tr class="border-b border-border bg-bg">
                <th class="w-8 px-2 py-2" />
                <th class="px-3 py-2 text-left font-bold text-text-muted">Fecha</th>
                <th class="px-3 py-2 text-left font-bold text-text-muted">Usuario</th>
                <th class="px-3 py-2 text-left font-bold text-text-muted">Acción</th>
                <th class="px-3 py-2 text-left font-bold text-text-muted">Módulo</th>
                <th class="px-3 py-2 text-left font-bold text-text-muted">Registro</th>
                <th class="px-3 py-2 text-left font-bold text-text-muted">Resumen</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="e in visibles" :key="e.id">
                <tr :class="`cursor-pointer border-b border-border hover:bg-surface-hover ${esIntento(e) ? 'bg-vz-danger/5' : 'even:bg-bg/40'}`" @click="toggle(e.id)">
                  <td class="px-2 py-2 text-text-soft">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="`h-3.5 w-3.5 transition-transform ${abierta === e.id ? 'rotate-90' : ''}`">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                  <td class="whitespace-nowrap px-3 py-2 text-text-muted">{{ fechaHora(e.fecha) }}</td>
                  <td class="px-3 py-2 font-semibold text-text">{{ e.usuario }}</td>
                  <td class="px-3 py-2">
                    <span :class="`rounded-full px-2 py-0.5 text-[11px] font-bold ${accionClase(e)}`">{{ accionLabel(e) }}</span>
                  </td>
                  <td class="px-3 py-2 text-text-muted">{{ tablaLabel(e.tabla) }}</td>
                  <td class="max-w-[160px] truncate px-3 py-2 font-mono text-[11.5px] text-text-muted" :title="e.registroId">{{ e.registroId }}</td>
                  <td class="px-3 py-2 text-text-muted">{{ resumen(e) }}</td>
                </tr>
                <tr v-if="abierta === e.id" class="border-b border-border bg-bg/60">
                  <td />
                  <td colspan="6" class="px-3 py-3">
                    <p v-if="esIntento(e)" class="mb-2 rounded-lg border border-vz-danger/30 bg-vz-danger/5 px-3 py-2 text-[12px] font-semibold text-vz-danger">
                      Alguien intentó borrar este registro. No se borró: sigue intacto. Debajo, los datos del registro en ese momento.
                    </p>
                    <p v-if="e.detalle" class="mb-2 text-[12px] font-semibold text-text">{{ e.detalle }}</p>
                    <p v-if="diff(e).length === 0" class="text-[12px] text-text-soft">Sin diferencias de campos registradas.</p>
                    <div v-else class="overflow-x-auto rounded-lg border border-border bg-surface">
                      <table class="w-full min-w-[520px] border-collapse text-[12px]">
                        <thead>
                          <tr class="border-b border-border bg-bg">
                            <th class="px-2.5 py-1.5 text-left font-bold text-text-muted">Campo</th>
                            <th class="px-2.5 py-1.5 text-left font-bold text-text-muted">Antes</th>
                            <th class="px-2.5 py-1.5 text-left font-bold text-text-muted">Después</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="d in diff(e)" :key="d.campo" class="border-b border-border last:border-0">
                            <td class="px-2.5 py-1.5 font-semibold text-text">{{ d.campo }}</td>
                            <td class="max-w-[280px] break-words px-2.5 py-1.5 text-vz-danger">{{ d.antes }}</td>
                            <td class="max-w-[280px] break-words px-2.5 py-1.5 text-vz-success">{{ d.despues }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <div v-if="filtradas.length > limite" class="mt-3 flex justify-center">
          <button type="button" class="h-9 rounded-lg border border-border bg-surface px-4 text-[13px] font-bold text-text hover:bg-surface-hover" @click="limite += 200">
            Mostrar más ({{ filtradas.length - limite }} restantes)
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import * as XLSX from 'xlsx'
import { useAuth } from 'src/lib/auth'
import { canViewBitacora } from 'src/lib/access'
import { bump } from 'src/lib/reactive'
import { inputClass, selectClass } from 'components/formClasses'
import { ACCION_INTENTO_BORRADO, isBitacoraCacheReady, listBitacora, loadBitacoraCache, registrarIntentoBorrado } from 'src/lib/bitacora'
import { isSupabaseConfigured, supabase } from 'src/lib/supabase'
import { listEquipos } from 'src/lib/inventario/sistemas'
import { parseLocalDate } from 'src/lib/dateUtils'

const { user } = useAuth()
const permitido = computed(() => (user.value ? canViewBitacora(user.value.role) : false))

const TABLAS = {
  inv_equipos: 'Equipos',
  inv_equipos_movimientos: 'Movimientos de equipo',
  inv_materiales: 'Materiales',
  inv_materiales_entradas: 'Entradas de material',
  inv_materiales_salidas: 'Salidas de material',
  inv_solicitudes: 'Solicitudes de inventario',
  inv_proveedores: 'Proveedores',
  inv_cargos_perdida: 'Cargos por pérdida',
  inv_responsivas: 'Responsivas',
  inv_mantenimientos_programados: 'Mantenimiento programado',
  inv_mantenimientos_historial: 'Mantenimiento realizado',
  inv_auditorias: 'Auditorías',
  inv_auditoria_items: 'Partidas de auditoría',
  inv_ubicaciones: 'Ubicaciones',
  inv_familias: 'Familias',
  inv_valuacion_snapshots: 'Valuación (snapshots)',
}

function tablaLabel(t) {
  if (TABLAS[t]) return TABLAS[t]
  if (t.startsWith('cmp_')) return `Compras · ${t.slice(4).replace(/_/g, ' ')}`
  return t.replace(/^inv_/, '').replace(/_/g, ' ')
}

const LABEL_INTENTO = 'Intento de borrado'
const esIntento = (e) => e.accion === ACCION_INTENTO_BORRADO

function accionLabel(e) {
  if (esIntento(e)) return LABEL_INTENTO
  if (e.accion === 'INSERT') return 'Alta'
  if (e.accion === 'UPDATE') return 'Modificación'
  return e.accion.charAt(0).toUpperCase() + e.accion.slice(1)
}

function accionClase(e) {
  if (esIntento(e)) return 'bg-vz-danger text-white'
  const a = accionLabel(e).toLowerCase()
  if (a === 'alta' || a.startsWith('reactiv') || a === 'entrada') return 'bg-vz-success/15 text-vz-success'
  if (a.startsWith('baja') || a.startsWith('desactiv') || a.startsWith('cancel') || a.startsWith('pérdida')) return 'bg-vz-danger/15 text-vz-danger'
  return 'bg-vz-blue/10 text-vz-blue'
}

const cargada = ref(isBitacoraCacheReady())
const fTabla = ref('')
const fUsuario = ref('')
const fAccion = ref('')
const fDesde = ref('')
const fHasta = ref('')
const fTexto = ref('')
const abierta = ref(null)
const limite = ref(200)
const route = useRoute()
// Enlace de la campana / alertas: /bitacora?accion=intento_borrado abre la bitácora ya filtrada.
if (route.query.accion === ACCION_INTENTO_BORRADO) fAccion.value = LABEL_INTENTO

onMounted(async () => {
  if (!permitido.value) return
  try {
    await loadBitacoraCache()
  } finally {
    cargada.value = true
    bump()
  }
})

const hayFiltros = computed(() => Boolean(fTabla.value || fUsuario.value || fAccion.value || fDesde.value || fHasta.value || fTexto.value))
function limpiarFiltros() {
  fTabla.value = fUsuario.value = fAccion.value = fDesde.value = fHasta.value = fTexto.value = ''
  limite.value = 200
}

const todas = computed(() => listBitacora())
const intentosTotal = computed(() => listBitacora({ accion: ACCION_INTENTO_BORRADO }).length)

// Botón de prueba: solo con la demo local (sin Supabase) y solo Dirección.
const mostrarSimulador = computed(() => !(isSupabaseConfigured && supabase) && user.value?.role === 'admin')
function simularIntento() {
  const equipo = listEquipos()[0]
  registrarIntentoBorrado('inv_equipos', equipo?.id ?? 'eq-demo', 'Mauricio (demo) intentó borrar un equipo dado de alta (simulación): no se borró.', {
    usuario: 'Mauricio (demo)',
    rol: 'adquisiciones',
    antes: equipo ? { modelo: equipo.modelo, numero_serie: equipo.numeroSerie, estado: equipo.estado } : undefined,
  })
  bump()
}
const tablasDisponibles = computed(() => [...new Set(todas.value.map((e) => e.tabla))].sort((a, b) => tablaLabel(a).localeCompare(tablaLabel(b))))
const accionesDisponibles = computed(() => [...new Set(todas.value.map(accionLabel))].sort((a, b) => a.localeCompare(b)))

const filtradas = computed(() => {
  const desde = fDesde.value ? parseLocalDate(fDesde.value).getTime() : undefined
  const hasta = fHasta.value ? parseLocalDate(fHasta.value).getTime() + 24 * 60 * 60 * 1000 - 1 : undefined
  const lista = listBitacora({
    tabla: fTabla.value || undefined,
    usuario: fUsuario.value.trim() || undefined,
    desde,
    hasta,
    texto: fTexto.value.trim() || undefined,
  })
  return fAccion.value ? lista.filter((e) => accionLabel(e) === fAccion.value) : lista
})
const visibles = computed(() => filtradas.value.slice(0, limite.value))

function toggle(id) {
  abierta.value = abierta.value === id ? null : id
}

function fechaHora(ts) {
  return new Date(ts).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ---- Diff antes/después ----
const IGNORAR = new Set(['updated_at', 'updatedAt'])

function valorTexto(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'string') return v.length > 300 ? `${v.slice(0, 300)}…` : v.startsWith('data:') ? '[archivo adjunto]' : v
  if (typeof v === 'object') {
    const s = JSON.stringify(v)
    return s.length > 300 ? `${s.slice(0, 300)}…` : s
  }
  return String(v)
}

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

/**
 * @typedef {object} DiffRow
 * @property {string} campo
 * @property {string} antes
 * @property {string} despues
 */

function diff(e) {
  if (esIntento(e)) {
    // El "antes" es el registro tal como estaba; sigue existiendo, así que no hay "después".
    return Object.entries(asObj(e.antes))
      .filter(([k, v]) => !IGNORAR.has(k) && v !== null && v !== undefined && v !== '')
      .map(([campo, v]) => ({ campo, antes: valorTexto(v), despues: 'sigue igual' }))
  }
  const antes = asObj(e.antes)
  const despues = asObj(e.despues)
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((k) => !IGNORAR.has(k))
  const filas = []
  for (const campo of campos) {
    const a = antes[campo]
    const d = despues[campo]
    if (JSON.stringify(a ?? null) === JSON.stringify(d ?? null)) continue
    // En una alta no hay "antes": se omiten los campos vacíos para no llenar la tabla de guiones.
    if (e.antes === undefined && (d === null || d === undefined || d === '')) continue
    filas.push({ campo, antes: valorTexto(a), despues: valorTexto(d) })
  }
  return filas
}

const CAMPOS_NOMBRE = ['nombre', 'folio', 'descripcion', 'modelo', 'numero_serie', 'numeroSerie', 'titulo', 'producto']

function resumen(e) {
  if (e.detalle) return e.detalle
  if (esIntento(e)) return `Intentó borrar un registro de ${tablaLabel(e.tabla)}: no se borró.`
  const filas = diff(e)
  if (e.antes === undefined) {
    const d = asObj(e.despues)
    const clave = CAMPOS_NOMBRE.find((k) => typeof d[k] === 'string' && d[k])
    return clave ? String(d[clave]) : `${filas.length} campo(s) registrados`
  }
  if (filas.length === 0) return 'Sin cambios de campos'
  const partes = filas.slice(0, 3).map((f) => `${f.campo}: ${f.antes} → ${f.despues}`)
  return partes.join(' · ') + (filas.length > 3 ? ` (+${filas.length - 3})` : '')
}

// ---- Exportar ----
function exportarExcel() {
  const rows = filtradas.value.map((e) => ({
    Fecha: new Date(e.fecha).toLocaleString('es-MX'),
    Usuario: e.usuario,
    Acción: accionLabel(e),
    Módulo: tablaLabel(e.tabla),
    Tabla: e.tabla,
    Registro: e.registroId,
    Resumen: resumen(e),
    Antes: e.antes === undefined ? '' : JSON.stringify(e.antes),
    Después: e.despues === undefined ? '' : JSON.stringify(e.despues),
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Bitácora')
  XLSX.writeFile(wb, 'bitacora_cambios.xlsx')
}
</script>
