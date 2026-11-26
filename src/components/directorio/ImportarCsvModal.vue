<template>
  <AppModal title="Importar personas desde CSV" wide @close="emit('close')">
    <!-- Paso 1: archivo -->
    <div v-if="!resultado" class="flex flex-col gap-3">
      <div class="rounded-lg border border-border bg-bg p-3 text-[12.5px] text-text-muted">
        <p class="font-bold text-text">Columnas esperadas (primera fila)</p>
        <p class="mt-1"><code class="rounded bg-surface px-1 text-text">nombre</code>, <code class="rounded bg-surface px-1 text-text">correo</code>, <code class="rounded bg-surface px-1 text-text">área</code>, <code class="rounded bg-surface px-1 text-text">sucursal</code>, <code class="rounded bg-surface px-1 text-text">puesto</code>, <code class="rounded bg-surface px-1 text-text">roles</code></p>
        <p class="mt-1.5">
          Nombre y correo son obligatorios. La sucursal debe llamarse igual que en el catálogo de la app. En <b>roles</b> separa con punto y coma (ej.
          <code class="rounded bg-surface px-1 text-text">finanzas; solicitante</code>); si va vacío se asigna Solicitante. Acepta archivos de Excel guardados como CSV (comas o punto y coma).
        </p>
        <button type="button" class="mt-2 font-bold text-vz-blue hover:underline" @click="descargarPlantilla">Descargar plantilla CSV</button>
      </div>

      <label class="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-border p-6 text-center hover:bg-surface-hover">
        <span class="text-[13px] font-bold text-text">{{ archivoNombre || 'Elegir archivo .csv' }}</span>
        <span class="text-[12px] text-text-soft">Máximo {{ MAX_FILAS }} filas. Antes de guardar verás una vista previa con errores y duplicados.</span>
        <input type="file" accept=".csv,.txt,text/csv" class="sr-only" @change="onArchivo" />
      </label>

      <p v-if="errorArchivo" class="rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ errorArchivo }}</p>

      <!-- Paso 2: vista previa -->
      <template v-if="filas.length > 0">
        <div class="flex flex-wrap gap-2 text-[12px] font-bold">
          <span class="rounded-full bg-vz-success/15 px-2.5 py-1 text-vz-success">{{ nNuevos }} nuevo(s)</span>
          <span v-if="actualizar" class="rounded-full bg-vz-blue/10 px-2.5 py-1 text-vz-blue">{{ nActualizar }} por actualizar</span>
          <span class="rounded-full bg-vz-warning/15 px-2.5 py-1 text-vz-warning">{{ nDuplicados }} ya existe(n)</span>
          <span class="rounded-full bg-vz-danger/15 px-2.5 py-1 text-vz-danger">{{ nErrores }} con error</span>
        </div>

        <label class="flex cursor-pointer items-start gap-2 text-[12.5px] text-text">
          <input v-model="actualizar" type="checkbox" class="mt-0.5 h-4 w-4 accent-[var(--color-vz-blue)]" />
          <span>
            <b>Actualizar a las personas que ya existen</b> con los datos del archivo (solo campos con valor; no reactiva desactivados). Si no, se omiten.
          </span>
        </label>

        <div class="max-h-[42vh] overflow-auto rounded-lg border border-border">
          <table class="w-full min-w-[640px] border-collapse text-[12px]">
            <thead class="sticky top-0 bg-bg">
              <tr class="border-b border-border">
                <th class="px-2 py-1.5 text-left font-bold text-text-muted">#</th>
                <th class="px-2 py-1.5 text-left font-bold text-text-muted">Persona</th>
                <th class="px-2 py-1.5 text-left font-bold text-text-muted">Área · Sucursal</th>
                <th class="px-2 py-1.5 text-left font-bold text-text-muted">Roles</th>
                <th class="px-2 py-1.5 text-left font-bold text-text-muted">Resultado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in vista" :key="f.linea" class="border-b border-border align-top last:border-0">
                <td class="px-2 py-1.5 text-text-soft">{{ f.linea }}</td>
                <td class="px-2 py-1.5">
                  <p class="font-semibold text-text">{{ f.nombre || '—' }}</p>
                  <p class="break-all text-text-muted">{{ f.correo || 'sin correo' }}</p>
                </td>
                <td class="px-2 py-1.5 text-text-muted">{{ f.area || '—' }} · {{ f.sucursal || '—' }}</td>
                <td class="px-2 py-1.5 text-text-muted">{{ f.roles.map((r) => ROL_CORTO[r]).join(', ') || '—' }}</td>
                <td class="px-2 py-1.5">
                  <StatusPill :label="ETIQUETA[f.estado]" :tone="TONO[f.estado]" />
                  <p v-for="m in f.errores" :key="m" class="mt-0.5 text-vz-danger">{{ m }}</p>
                  <p v-for="m in f.avisos" :key="m" class="mt-0.5 text-text-soft">{{ m }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="filas.length > vista.length" class="text-[11.5px] text-text-soft">Se muestran las primeras {{ vista.length }} filas; se importan todas las válidas.</p>

        <div class="flex justify-end gap-2">
          <button type="button" class="h-9 rounded-lg border border-border bg-surface px-4 text-[13px] font-bold text-text hover:bg-surface-hover" @click="emit('close')">Cancelar</button>
          <button
            type="button"
            :disabled="importando || nNuevos + nActualizar === 0"
            class="h-9 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white hover:bg-primary-hover disabled:opacity-50"
            @click="importar"
          >
            {{ importando ? 'Importando…' : `Importar ${nNuevos + nActualizar} persona(s)` }}
          </button>
        </div>
      </template>
    </div>

    <!-- Paso 3: resultado -->
    <div v-else class="flex flex-col gap-3">
      <div class="rounded-lg border border-vz-success/30 bg-vz-success/10 p-3 text-[13px] text-text">
        <p class="font-bold text-vz-success">Importación terminada</p>
        <p class="mt-0.5">{{ resultado.creados }} agregada(s), {{ resultado.actualizados }} actualizada(s), {{ resultado.omitidos }} omitida(s).</p>
      </div>
      <div v-if="resultado.fallos.length > 0" class="rounded-lg border border-vz-danger/30 bg-vz-danger/10 p-3 text-[12.5px] text-text">
        <p class="font-bold text-vz-danger">{{ resultado.fallos.length }} fila(s) no se pudieron guardar</p>
        <p v-for="m in resultado.fallos" :key="m" class="mt-0.5">{{ m }}</p>
      </div>
      <div class="flex justify-end">
        <button type="button" class="h-9 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white hover:bg-primary-hover" @click="emit('close')">Listo</button>
      </div>
    </div>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import StatusPill from 'components/StatusPill.vue'
import { useToast } from 'src/composables/useToast'
import { useAuth } from 'src/lib/auth'
import { bump } from 'src/lib/reactive'
import { addParticipante, getParticipantePorCorreo, updateParticipante } from 'src/lib/compras'
import { AVISO_SOLO_DIRECCION, PLANTILLA_CSV, ROL_CORTO, asegurarPersistido, correoValido, leerArchivoTexto, normalizar, parseCsv, pistasCorreo, rolDesdeTexto, tieneRolSoloDireccion, ubicacionPorNombre } from './directorioUtils'

const emit = defineEmits(['close', 'imported'])
const toast = useToast()
const { user } = useAuth()
const esAdmin = computed(() => user.value?.role === 'admin')

const MAX_FILAS = 500

/** @typedef {'nuevo' | 'actualizar' | 'duplicado' | 'error'} EstadoFila */

/**
 * @typedef {object} FilaBase
 * @property {number} linea
 * @property {string} nombre
 * @property {string} correo
 * @property {string} area
 * @property {string} sucursal
 * @property {string} puesto
 * @property {RolParticipante[]} roles
 * @property {boolean} rolesDeclarados
 * @property {string} [ubicacionId]
 * @property {string[]} avisos
 * @property {string[]} errores
 * @property {boolean} duplicadoEnArchivo
 */
/**
 * Extiende FilaBase.
 * @typedef {object} FilaVista
 * @property {EstadoFila} estado
 * @property {Participante} [existente]
 */

const ETIQUETA = { nuevo: 'Nuevo', actualizar: 'Se actualizará', duplicado: 'Ya existe: se omite', error: 'Error' }
const TONO = { nuevo: 'success', actualizar: 'info', duplicado: 'warning', error: 'danger' }

const archivoNombre = ref('')
const errorArchivo = ref('')
const base = ref([])
const actualizar = ref(false)
const importando = ref(false)
const resultado = ref(null)

const COLUMNAS = {
  nombre: ['nombre', 'nombre completo', 'colaborador', 'persona'],
  correo: ['correo', 'correo electronico', 'email', 'e-mail', 'mail'],
  area: ['area', 'departamento'],
  sucursal: ['sucursal', 'ubicacion', 'sucursal ubicacion'],
  puesto: ['puesto', 'cargo'],
  roles: ['roles', 'rol', 'roles de proceso'],
}

function descargarPlantilla() {
  const blob = new Blob(['﻿' + PLANTILLA_CSV], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla_directorio.csv'
  a.click()
  URL.revokeObjectURL(url)
}

async function onArchivo(ev) {
  const input = ev.target
  const file = input.files?.[0]
  input.value = ''
  base.value = []
  errorArchivo.value = ''
  if (!file) return
  archivoNombre.value = file.name
  if (file.size > 2 * 1024 * 1024) {
    errorArchivo.value = 'El archivo es demasiado grande (máximo 2 MB).'
    return
  }
  try {
    const texto = await leerArchivoTexto(file)
    const tabla = parseCsv(texto)
    if (tabla.length < 2) {
      errorArchivo.value = 'El archivo no tiene filas de datos (debe traer encabezados y al menos una persona).'
      return
    }
    const encabezados = (tabla[0] ?? []).map((h) => normalizar(h))
    const idx = {}
    for (const [campo, alias] of Object.entries(COLUMNAS)) idx[campo] = encabezados.findIndex((h) => alias.includes(h))
    if (idx.nombre < 0 || idx.correo < 0) {
      errorArchivo.value = 'Faltan columnas obligatorias: el encabezado debe incluir "nombre" y "correo".'
      return
    }
    const cuerpo = tabla.slice(1)
    if (cuerpo.length > MAX_FILAS) {
      errorArchivo.value = `El archivo trae ${cuerpo.length} filas; el máximo por importación es ${MAX_FILAS}. Divídelo en partes.`
      return
    }
    const celda = (fila, campo) => (idx[campo] >= 0 ? (fila[idx[campo]] ?? '').trim() : '')
    const vistos = new Map()
    base.value = cuerpo.map((fila, i) => {
      const linea = i + 2
      const nombre = celda(fila, 'nombre')
      const correo = celda(fila, 'correo').toLowerCase()
      const sucursal = celda(fila, 'sucursal')
      const rolesTexto = celda(fila, 'roles')
      const avisos = []
      const errores = []
      if (!nombre) errores.push('Falta el nombre.')
      if (!correo) errores.push('Falta el correo.')
      else if (!correoValido(correo)) errores.push('El correo no es válido.')
      else {
        for (const pista of pistasCorreo(correo)) avisos.push(pista.texto)
      }
      const previo = correo ? vistos.get(correo) : undefined
      if (correo && previo === undefined) vistos.set(correo, linea)
      const duplicadoEnArchivo = previo !== undefined
      if (duplicadoEnArchivo) errores.push(`Correo repetido en el archivo (ya aparece en la línea ${previo}).`)

      let ubicacionId
      if (sucursal) {
        ubicacionId = ubicacionPorNombre(sucursal)?.id
        if (!ubicacionId) avisos.push(`Sucursal "${sucursal}" no reconocida: se importa sin sucursal.`)
      }
      const roles = []
      let rolesDeclarados = false
      if (rolesTexto) {
        rolesDeclarados = true
        for (const t of rolesTexto.split(/[;|/,]/)) {
          if (!t.trim()) continue
          const r = rolDesdeTexto(t)
          if (!r) avisos.push(`Rol "${t.trim()}" no reconocido: se ignora.`)
          else if (!roles.includes(r)) roles.push(r)
        }
      }
      return { linea, nombre, correo, area: celda(fila, 'area'), sucursal, puesto: celda(fila, 'puesto'), roles, rolesDeclarados, ubicacionId, avisos, errores, duplicadoEnArchivo }
    })
  } catch (e) {
    errorArchivo.value = `No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`
  }
}

/** Estado de cada fila contra el directorio actual (depende de la casilla "actualizar existentes"). */
const filas = computed(() =>
  base.value.map((f) => {
    if (f.errores.length > 0) return { ...f, estado: 'error' }
    // Roles de aprobación, tesorería, dirección y compras: solo Dirección los asigna (también lo impone la base).
    if (!esAdmin.value && tieneRolSoloDireccion(f.roles)) return { ...f, estado: 'error', errores: [AVISO_SOLO_DIRECCION] }
    const existente = getParticipantePorCorreo(f.correo)
    if (existente) {
      if (!esAdmin.value && tieneRolSoloDireccion(existente.roles)) {
        return { ...f, estado: 'duplicado', existente, avisos: [...f.avisos, 'Ya existe con un rol que solo Dirección modifica: se omite.'] }
      }
      const copia = { ...f, estado: actualizar.value ? 'actualizar' : 'duplicado', existente, avisos: [...f.avisos] }
      copia.avisos.unshift(`Ya está en el directorio como ${existente.nombre}${existente.activo ? '' : ' (desactivado)'}.`)
      return copia
    }
    const copia = { ...f, estado: 'nuevo', avisos: [...f.avisos] }
    if (!f.rolesDeclarados || f.roles.length === 0) {
      copia.roles = ['solicitante']
      copia.avisos.push('Sin roles: se asigna Solicitante.')
    }
    return copia
  }),
)

const vista = computed(() => filas.value.slice(0, 200))
const nNuevos = computed(() => filas.value.filter((f) => f.estado === 'nuevo').length)
const nActualizar = computed(() => filas.value.filter((f) => f.estado === 'actualizar').length)
const nDuplicados = computed(() => filas.value.filter((f) => f.estado === 'duplicado').length)
const nErrores = computed(() => filas.value.filter((f) => f.estado === 'error').length)

async function importar() {
  importando.value = true
  let creados = 0
  let actualizados = 0
  const fallos = []
  let verificado = false
  let bloquearActualizaciones = false
  try {
    for (const f of filas.value) {
      if (f.estado === 'nuevo') {
        try {
          await addParticipante({
            nombre: f.nombre,
            correo: f.correo,
            area: f.area || undefined,
            ubicacionId: f.ubicacionId,
            puesto: f.puesto || undefined,
            roles: f.roles,
          })
          creados++
        } catch (e) {
          fallos.push(`Línea ${f.linea} (${f.nombre}): ${e instanceof Error ? e.message : String(e)}`)
        }
      } else if (f.estado === 'actualizar' && f.existente) {
        if (bloquearActualizaciones) {
          fallos.push(`Línea ${f.linea} (${f.nombre}): no se actualizó (sin permiso de edición en la base).`)
          continue
        }
        const patch = {}
        if (f.nombre && f.nombre !== f.existente.nombre) patch.nombre = f.nombre
        if (f.area && f.area !== (f.existente.area ?? '')) patch.area = f.area
        if (f.ubicacionId && f.ubicacionId !== f.existente.ubicacionId) patch.ubicacionId = f.ubicacionId
        if (f.puesto && f.puesto !== (f.existente.puesto ?? '')) patch.puesto = f.puesto
        if (f.rolesDeclarados && f.roles.length > 0 && JSON.stringify([...f.roles].sort()) !== JSON.stringify([...f.existente.roles].sort())) patch.roles = f.roles
        if (Object.keys(patch).length === 0) continue
        try {
          await updateParticipante(f.existente.id, patch)
          if (!verificado) {
            verificado = true
            await asegurarPersistido(f.existente.id, patch)
          }
          actualizados++
        } catch (e) {
          fallos.push(`Línea ${f.linea} (${f.nombre}): ${e instanceof Error ? e.message : String(e)}`)
          bloquearActualizaciones = true
        }
      }
    }
  } finally {
    importando.value = false
    bump()
  }
  const omitidos = filas.value.length - creados - actualizados - fallos.length
  resultado.value = { creados, actualizados, omitidos: Math.max(0, omitidos), fallos }
  toast(`Importación: ${creados} agregada(s), ${actualizados} actualizada(s).`, fallos.length ? 'info' : 'success')
  emit('imported')
}
</script>
