<template>
  <!-- q-dialog propio (en vez de AppModal): la tabla de vista previa necesita más ancho que los 42rem de AppModal. -->
  <q-dialog :model-value="true" persistent @update:model-value="(v: boolean) => !v && cerrar()">
    <div class="max-h-full w-full overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl" style="max-width: min(100vw - 32px, 76rem)">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="text-[15px] font-extrabold text-text">Importar compras al stock maestro</h2>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text" @click="cerrar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- 1) Origen -->
      <section class="mb-4 rounded-xl border border-border bg-bg p-3">
        <p class="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-soft">1 · Origen de las compras</p>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <AppField label="Archivo CSV / XLSX / JSON">
            <input ref="archivoRef" type="file" accept=".csv,.xlsx,.xls,.xlsm,.json,.txt,text/csv" :class="inputClass" :disabled="cargando || importando" @change="onArchivo" />
          </AppField>
          <AppField label="…o dirección (CSV publicado o JSON)">
            <div class="flex gap-2">
              <input v-model="url" type="url" placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv" :class="`${inputClass} flex-1`" :disabled="cargando || importando" @keydown.enter.prevent="cargarUrl" />
              <button type="button" :disabled="cargando || importando || !url.trim()" class="h-9 shrink-0 rounded-lg bg-vz-blue px-3 text-[12.5px] font-bold text-white hover:bg-primary-hover disabled:opacity-60" @click="cargarUrl">Cargar</button>
            </div>
          </AppField>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
          <button v-if="ultimaUrl" type="button" :disabled="cargando || importando" class="font-bold text-vz-blue hover:underline disabled:opacity-60" @click="sincronizar">Sincronizar ahora</button>
          <span v-if="ultimaUrl" class="min-w-0 max-w-full truncate text-text-soft" :title="ultimaUrl">Última dirección: {{ ultimaUrl }}</span>
          <span class="ml-auto flex items-center gap-4">
            <button type="button" :disabled="cargando || importando" class="font-semibold text-vz-blue hover:underline disabled:opacity-60" @click="usarEjemplo">Usar datos de ejemplo</button>
            <button type="button" class="font-semibold text-text-muted hover:underline" @click="descargarEjemplo">Descargar CSV de ejemplo</button>
          </span>
        </div>
        <p v-if="cargando" class="mt-2 text-[12.5px] font-semibold text-text-muted">Leyendo…</p>
        <p v-if="error" class="mt-2 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ error }}</p>
      </section>

      <!-- 2) Vista previa -->
      <section v-if="filas.length > 0">
        <div class="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p class="text-[11px] font-bold uppercase tracking-wide text-text-soft">2 · Vista previa</p>
            <p class="text-[12.5px] text-text-muted">
              {{ origen }} · {{ filas.length }} filas ·
              <span class="font-semibold text-vz-success">{{ conteo.nuevo }} nuevas</span> ·
              <span class="font-semibold text-vz-warning">{{ conteo.sin_serie }} sin serie</span> ·
              <span class="font-semibold text-text-soft">{{ conteo.duplicado }} duplicadas</span> ·
              <span class="font-semibold text-vz-danger">{{ conteo.error }} con error</span>
            </p>
          </div>
          <div class="flex gap-2 text-[12px] font-semibold">
            <button type="button" class="rounded-md border border-border px-2 py-1 text-text-muted hover:bg-surface-hover" @click="marcarTodas(true)">Marcar válidas</button>
            <button type="button" class="rounded-md border border-border px-2 py-1 text-text-muted hover:bg-surface-hover" @click="marcarTodas(false)">Quitar todas</button>
          </div>
        </div>

        <details class="mb-2 text-[12px] text-text-muted">
          <summary class="cursor-pointer font-semibold">Columnas detectadas ({{ Object.keys(columnas).length }})</summary>
          <p class="mt-1">
            <span v-for="(nombre, campo) in columnas" :key="campo" class="mr-3 inline-block">
              <b class="text-text">{{ CAMPO_ETIQUETA[campo] }}</b> ← «{{ nombre }}»
            </span>
          </p>
        </details>
        <ul v-if="avisos.length > 0" class="mb-2 list-disc pl-5 text-[12px] text-vz-warning">
          <li v-for="a in avisos" :key="a">{{ a }}</li>
        </ul>

        <div class="max-h-[46vh] overflow-auto rounded-xl border border-border">
          <table class="w-full min-w-[980px] border-collapse text-[12.5px]">
            <thead class="sticky top-0 z-10">
              <tr class="border-b border-border bg-bg">
                <th class="w-8 px-2 py-2"></th>
                <th class="px-2 py-2 text-left font-bold text-text-muted">Producto</th>
                <th class="px-2 py-2 text-left font-bold text-text-muted">Tipo</th>
                <th class="px-2 py-2 text-left font-bold text-text-muted">Familia</th>
                <th class="px-2 py-2 text-right font-bold text-text-muted">Cant.</th>
                <th class="px-2 py-2 text-right font-bold text-text-muted">Costo unit.</th>
                <th class="px-2 py-2 text-left font-bold text-text-muted">Proveedor</th>
                <th class="px-2 py-2 text-left font-bold text-text-muted">Factura</th>
                <th class="px-2 py-2 text-left font-bold text-text-muted">Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in filas" :key="f.id" :class="`border-b border-border align-top last:border-0 ${f.incluir ? '' : 'opacity-60'}`">
                <td class="px-2 py-1.5">
                  <input type="checkbox" :checked="f.incluir" :disabled="f.estado === 'error' || f.estado === 'duplicado'" @change="f.incluir = $event.target.checked" />
                </td>
                <td class="max-w-[260px] px-2 py-1.5">
                  <p class="truncate font-semibold text-text" :title="f.producto">{{ f.producto || '—' }}</p>
                  <p class="truncate text-[11px] text-text-soft">
                    Fila {{ f.fila }}<template v-if="f.categoria"> · {{ f.categoria }}</template><template v-if="f.series.length"> · {{ f.series.length }} serie(s)</template><template v-if="f.fecha"> · {{ f.fecha }}</template>
                  </p>
                </td>
                <td class="px-2 py-1.5">
                  <select :value="f.tipo" class="h-8 rounded-md border border-border bg-bg px-1.5 text-[12px] text-text" @change="onTipo(f, $event.target.value)">
                    <option value="equipo">Equipo (serie)</option>
                    <option value="material">Material (cantidad)</option>
                  </select>
                </td>
                <td class="px-2 py-1.5">
                  <select :value="f.familiaId" class="h-8 max-w-[170px] rounded-md border border-border bg-bg px-1.5 text-[12px] text-text" @change="onFamilia(f, $event.target.value)">
                    <template v-if="f.tipo === 'equipo'">
                      <optgroup label="Sistemas">
                        <option v-for="fam in famSistemas" :key="fam.id" :value="fam.id">{{ fam.nombre }}</option>
                      </optgroup>
                      <optgroup label="Mantenimiento (por pieza)">
                        <option v-for="fam in famMttoSerializadas" :key="fam.id" :value="fam.id">{{ fam.nombre }}</option>
                      </optgroup>
                    </template>
                    <template v-else>
                      <option v-for="fam in famMaterial" :key="fam.id" :value="fam.id">{{ fam.nombre }}</option>
                    </template>
                  </select>
                </td>
                <td class="px-2 py-1.5 text-right">
                  <input type="number" :min="f.tipo === 'equipo' ? 1 : 0" :step="f.tipo === 'equipo' ? 1 : 'any'" :value="f.cantidad" class="h-8 w-16 rounded-md border border-border bg-bg px-1.5 text-right text-[12px] text-text" @change="onCantidad(f, $event)" />
                </td>
                <td class="px-2 py-1.5 text-right">
                  <input type="number" min="0" step="0.01" :value="f.costo ?? ''" placeholder="0" class="h-8 w-24 rounded-md border border-border bg-bg px-1.5 text-right text-[12px] text-text" @change="onCosto(f, $event)" />
                </td>
                <td class="max-w-[160px] truncate px-2 py-1.5 text-text-muted" :title="f.proveedor">{{ f.proveedor || '—' }}</td>
                <td class="px-2 py-1.5 text-text-muted">{{ f.factura || '—' }}</td>
                <td class="px-2 py-1.5">
                  <span :class="`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${ESTADO_CLASE[f.estado]}`">{{ ESTADO_TEXTO[f.estado] }}</span>
                  <p v-if="f.mensaje" class="mt-0.5 max-w-[200px] text-[11px] leading-tight text-text-soft">{{ f.mensaje }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Resumen final -->
      <section v-if="resultado" class="mt-4 rounded-xl border border-vz-success/30 bg-vz-success/5 p-3 text-[12.5px]">
        <p class="mb-1 text-[13px] font-extrabold text-text">Importación terminada</p>
        <p class="text-text-muted">
          <b class="text-text">{{ resultado.equipos + resultado.entradas }}</b> registros creados
          ({{ resultado.equipos }} equipos · {{ resultado.entradas }} entradas de material
          <template v-if="resultado.materialesNuevos"> · {{ resultado.materialesNuevos }} materiales nuevos</template>
          <template v-if="resultado.proveedoresNuevos"> · {{ resultado.proveedoresNuevos }} proveedores nuevos</template>)
          · <b class="text-text">{{ resultado.omitidos }}</b> omitidos por duplicado.
        </p>
        <ul v-if="resultado.errores.length > 0" class="mt-1 list-disc pl-5 text-vz-danger">
          <li v-for="e in resultado.errores" :key="e">{{ e }}</li>
        </ul>
        <p class="mt-1 text-text-soft">Todo quedó en «Adquisiciones (stock maestro)»; el operador del área lo asigna después.</p>
      </section>

      <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
        <span v-if="importando" class="mr-auto text-[12.5px] font-semibold text-text-muted">Importando… {{ progreso }}</span>
        <button type="button" :disabled="importando" class="h-9 rounded-lg border border-border bg-bg px-3 text-[13px] font-bold text-text-muted hover:bg-surface-hover disabled:opacity-60" @click="cerrar">
          {{ resultado ? 'Cerrar' : 'Cancelar' }}
        </button>
        <button v-if="filas.length > 0" type="button" :disabled="importando || seleccionadas.length === 0" class="h-9 rounded-lg bg-vz-success px-4 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60" @click="importar">
          Importar {{ seleccionadas.length }} {{ seleccionadas.length === 1 ? 'fila' : 'filas' }}
        </button>
      </div>
    </div>
  </q-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppField from 'components/AppField.vue'
import { inputClass } from 'components/formClasses'
import { useAuth } from 'src/lib/auth'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'
import { useConfirm } from 'src/composables/useConfirm'
import { listFamilias } from 'src/lib/inventario/comunes'
import { EJEMPLO_COMPRAS_CSV, descargarEjemploCompras } from 'src/lib/inventario/ejemploCompras'
import {
  CAMPO_ETIQUETA,
  ImportError,
  cambiarTipo,
  construirPreview,
  filasImportables,
  getUltimaUrl,
  importarFilas,
  leerArchivo,
  leerUrl,
  parseCsv,
  reevaluarFilas,
  setUltimaUrl,
} from 'src/lib/inventario/importarCompras'

/** Si se indica, solo se pueden importar filas de ese dominio (Uriel → sistemas, Gerencia de Mantenimiento → mantenimiento). */
const props = defineProps({ dominio: String })
const emit = defineEmits(['close', 'imported'])

const toast = useToast()
const confirm = useConfirm()
const { user } = useAuth()

const ESTADO_TEXTO = { nuevo: 'Nuevo', duplicado: 'Duplicado', sin_serie: 'Sin serie', error: 'Error' }
const ESTADO_CLASE = {
  nuevo: 'border-vz-success/30 bg-vz-success/10 text-vz-success',
  duplicado: 'border-border bg-bg text-text-soft',
  sin_serie: 'border-vz-warning/30 bg-vz-warning/10 text-vz-warning',
  error: 'border-vz-danger/30 bg-vz-danger/10 text-vz-danger',
}

const archivoRef = ref(null)
const ultimaUrl = ref(getUltimaUrl())
const url = ref(ultimaUrl.value)
const cargando = ref(false)
const importando = ref(false)
const progreso = ref('')
const error = ref('')
const origen = ref('')
const filas = ref([])
const columnas = ref({})
const avisos = ref([])
const resultado = ref(null)

const famSistemas = computed(() => listFamilias('sistemas'))
const famMttoSerializadas = computed(() => listFamilias('mantenimiento').filter((f) => f.modoInventario === 'serializado'))
const famMaterial = computed(() => listFamilias('mantenimiento').filter((f) => f.modoInventario === 'cantidad'))

const conteo = computed(() => {
  const c = { nuevo: 0, duplicado: 0, sin_serie: 0, error: 0 }
  for (const f of filas.value) c[f.estado]++
  return c
})
const seleccionadas = computed(() => filasImportables(filas.value))

function aplicarTabla(tabla, nombreOrigen) {
  const r = construirPreview(tabla, props.dominio)
  filas.value = r.filas
  columnas.value = r.columnas
  avisos.value = r.avisos
  origen.value = nombreOrigen
}

async function cargar(leer, nombreOrigen) {
  error.value = ''
  resultado.value = null
  cargando.value = true
  try {
    aplicarTabla(await leer(), nombreOrigen)
    return true
  } catch (e) {
    filas.value = []
    error.value = e instanceof ImportError ? e.message : 'No se pudo procesar el origen de datos.'
    return false
  } finally {
    cargando.value = false
  }
}

async function onArchivo(e) {
  const file = e.target.files?.[0]
  if (!file) return
  await cargar(() => leerArchivo(file), file.name)
}

async function cargarUrl() {
  const u = url.value.trim()
  if (!u) return
  const ok = await cargar(() => leerUrl(u), 'Dirección web')
  if (ok) {
    setUltimaUrl(u)
    ultimaUrl.value = u
  }
}

async function sincronizar() {
  const u = getUltimaUrl()
  if (!u) return
  url.value = u
  const ok = await cargar(() => leerUrl(u), 'Sincronización')
  if (ok) toast(`Sincronizado: ${conteo.value.nuevo + conteo.value.sin_serie} filas nuevas por importar.`, 'info')
}

async function usarEjemplo() {
  if (archivoRef.value) archivoRef.value.value = ''
  await cargar(() => Promise.resolve(parseCsv(EJEMPLO_COMPRAS_CSV)), 'Datos de ejemplo')
}

function descargarEjemplo() {
  try {
    descargarEjemploCompras()
  } catch {
    toast('No se pudo descargar aquí. Usa «Usar datos de ejemplo» o prueba en un navegador normal.', 'error')
  }
}

function marcarTodas(valor) {
  for (const f of filas.value) f.incluir = valor && (f.estado === 'nuevo' || f.estado === 'sin_serie')
}

function onTipo(f, tipo) {
  cambiarTipo(f, tipo)
  reevaluarFilas(filas.value, props.dominio)
}

function onFamilia(f, familiaId) {
  f.familiaId = familiaId
  reevaluarFilas(filas.value, props.dominio)
}

function onCantidad(f, e) {
  const n = Number(e.target.value)
  f.cantidad = Number.isFinite(n) ? n : 0
  reevaluarFilas(filas.value, props.dominio)
}

function onCosto(f, e) {
  const raw = e.target.value
  const n = Number(raw)
  f.costo = raw !== '' && Number.isFinite(n) && n >= 0 ? n : undefined
}

async function importar() {
  const sel = seleccionadas.value
  if (sel.length === 0) return
  const equipos = sel.filter((f) => f.tipo === 'equipo').reduce((s, f) => s + f.nuevas, 0)
  const entradas = sel.filter((f) => f.tipo === 'material').length
  const ok = await confirm({
    title: 'Importar compras',
    message: `Se crearán ${equipos} equipo(s) y ${entradas} entrada(s) de material en el stock maestro. Las filas ya importadas se omiten automáticamente. ¿Continuar?`,
    confirmLabel: 'Importar',
  })
  if (!ok) return
  importando.value = true
  progreso.value = `0/${sel.length}`
  try {
    const res = await importarFilas(filas.value, {
      quienRecibio: user.value?.displayName,
      onProgreso: (h, t) => (progreso.value = `${h}/${t}`),
    })
    resultado.value = res
    reevaluarFilas(filas.value, props.dominio) // lo importado pasa a «Duplicado»
    bump()
    emit('imported')
    toast(`Importación lista: ${res.equipos + res.entradas} creados, ${res.omitidos} omitidos.`, res.errores.length ? 'info' : 'success')
  } catch {
    toast('La importación se interrumpió. Revisa el inventario antes de reintentar (lo ya creado no se duplica).', 'error')
    reevaluarFilas(filas.value, props.dominio)
    bump()
  } finally {
    importando.value = false
  }
}

function cerrar() {
  if (importando.value) return
  emit('close')
}
</script>
