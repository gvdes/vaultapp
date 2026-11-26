<template>
  <AppModal :title="soloAsignar ? 'Asignar equipo' : equipo ? 'Editar equipo' : 'Nuevo equipo'" wide @close="emit('close')">
    <div v-if="soloAsignar && equipo" class="mb-3 rounded-lg border border-border bg-bg p-3 text-[12.5px]">
      <p class="font-bold text-text">{{ equipo.modelo || 'Sin modelo' }} · {{ equipo.numeroSerie || 'sin serie' }}</p>
      <p class="text-text-muted">Los datos de compra ya están registrados y no se modifican aquí; solo defines dónde está y quién lo tiene.</p>
      <p class="mt-1 text-text-muted">
        Entrega: <span class="font-bold text-text">{{ entregaAnterior || 'Sin responsable anterior (stock)' }}</span>
        <span v-if="responsivaActual"> · responsiva {{ responsivaActual.folio }}</span>
      </p>
    </div>
    <p v-if="compraBloqueada" class="mb-3 rounded-lg border border-vz-warning/30 bg-vz-warning/10 px-3 py-2 text-[12px] font-semibold text-vz-warning">
      Los datos de compra (modelo, serie, proveedor, factura, costo…) no se pueden modificar con tu rol: solo Dirección o Adquisiciones. Puedes cambiar ubicación, usuario, estado y notas.
    </p>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <AppField v-if="!soloAsignar" label="Familia">
        <select v-model="familia" :class="selectClass" :disabled="compraBloqueada">
          <option v-for="f in familias" :key="f.id" :value="f.id">{{ f.nombre }}</option>
        </select>
      </AppField>
      <AppField label="Estado">
        <select v-model="estado" :class="selectClass">
          <option v-for="s in ESTADOS" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </AppField>
      <AppField v-if="!soloAsignar" label="Modelo">
        <input v-model="modelo" :class="inputClass" :disabled="compraBloqueada" placeholder="p. ej. iPhone 13" />
      </AppField>
      <AppField v-if="!soloAsignar" label="Marca">
        <input v-model="marca" :class="inputClass" :disabled="compraBloqueada" placeholder="p. ej. Apple" />
      </AppField>
      <AppField v-if="!equipo" label="Cantidad de piezas (mismo pedido)">
        <input :value="cantidadPiezas" type="number" min="1" max="200" :class="inputClass" @input="handleCantidadPiezas($event.target.value)" />
      </AppField>
      <template v-if="!esLote">
        <AppField v-if="!soloAsignar" label="Número de serie">
          <input v-model="numeroSerie" :class="inputClass" :disabled="compraBloqueada" />
        </AppField>
        <AppField label="Ubicación">
          <select v-model="ubicacionId" :class="selectClass">
            <option value="">— Selecciona —</option>
            <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
          </select>
        </AppField>
        <AppField :label="soloAsignar ? 'Responsable (colaborador que recibe)' : 'Usuario asignado'">
          <input v-model="usuarioAsignado" :class="inputClass" />
        </AppField>
        <AppField label="Puesto">
          <input v-model="puesto" :class="inputClass" />
        </AppField>
        <AppField v-if="soloAsignar" label="Gerente que firma / autoriza">
          <input v-model="gerente" :class="inputClass" placeholder="p. ej. Gerente de Bolivia" />
        </AppField>
        <AppField v-if="soloAsignar" label="Foto del equipo al entregar">
          <input type="file" accept="image/*" :class="inputClass" @change="(e) => onFile(e, handleFotoEntrega)" />
        </AppField>
      </template>
      <AppField v-if="!soloAsignar" :label="exigeEvidencia ? 'Proveedor *' : 'Proveedor'">
        <input v-model="proveedor" :class="inputClass" :disabled="compraBloqueada" />
      </AppField>
      <AppField v-if="!soloAsignar" label="Fecha de compra">
        <input v-model="fechaCompra" type="date" :class="inputClass" :disabled="compraBloqueada" />
      </AppField>
      <AppField v-if="!soloAsignar" :label="exigeEvidencia ? 'Factura u orden de compra *' : 'Factura u orden de compra'">
        <input v-model="numeroFactura" :class="inputClass" :disabled="compraBloqueada" />
      </AppField>
      <AppField v-if="!soloAsignar" :label="esLote ? 'Costo por pieza (MXN)' : 'Costo total (MXN)'">
        <input v-model="costoTotal" type="number" min="0" step="0.01" :class="inputClass" :disabled="compraBloqueada" />
      </AppField>
      <AppField v-if="!soloAsignar" label="Garantía (meses)">
        <input v-model="garantiaMeses" type="number" min="0" :class="inputClass" :disabled="compraBloqueada" placeholder="p. ej. 12" />
      </AppField>
      <AppField v-if="!soloAsignar" label="Fotografía del equipo">
        <input type="file" accept="image/*" :class="inputClass" :disabled="compraBloqueada" @change="(e) => onFile(e, handleFoto)" />
      </AppField>
      <AppField v-if="!soloAsignar" label="Factura (PDF)">
        <input type="file" accept="application/pdf" :class="inputClass" :disabled="compraBloqueada" @change="(e) => onFile(e, handleFactura)" />
      </AppField>
      <AppField label="Responsiva firmada (PDF/imagen)">
        <input type="file" accept="application/pdf,image/*" :class="inputClass" @change="(e) => onFile(e, handleResponsiva)" />
      </AppField>
    </div>

    <div v-if="esLote" class="mt-4 rounded-lg border border-border bg-bg p-3">
      <p class="mb-3 text-[12.5px] font-bold text-text">{{ piezas.length }} piezas de este pedido — captura el número de serie y la ubicación de cada una</p>
      <div class="flex flex-col gap-2">
        <div v-for="(pieza, i) in piezas" :key="i" class="grid grid-cols-[1.5rem_1fr_1fr] items-center gap-2">
          <span class="text-center text-[11px] font-bold text-text-soft">{{ i + 1 }}</span>
          <input v-model="pieza.numeroSerie" placeholder="Número de serie" :class="inputClass" />
          <select v-model="pieza.ubicacionId" :class="selectClass">
            <option value="">— Ubicación —</option>
            <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
          </select>
        </div>
      </div>
    </div>

    <p v-if="!eq && !soloAsignar && avisoBajoUmbral" class="mt-3 rounded-lg border border-border bg-bg px-3 py-2 text-[12px] text-text-muted">{{ textoBajoUmbral }}</p>
    <p v-if="!eq && !soloAsignar && exigeEvidencia" class="mt-3 rounded-lg border border-vz-blue/30 bg-vz-blue/10 px-3 py-2 text-[12px] text-text-muted">
      Por ser de {{ currency.format(UMBRAL_CONTROL_INDIVIDUAL) }} o más se controla por pieza: proveedor y factura u orden de compra son obligatorios, y la serie debe ser única.
    </p>

    <div v-if="!soloAsignar && valorDepreciado != null" class="mt-3 flex items-center gap-4 rounded-lg border border-border bg-bg px-3 py-2 text-[12px]">
      <span class="text-text-muted">
        Valor original: <span class="font-bold text-text">{{ currency.format(Number(costoTotal) || 0) }}</span>
      </span>
      <span class="text-text-muted">
        Valor actual estimado (depreciado): <span class="font-bold text-vz-warning">{{ currency.format(valorDepreciado) }}</span>
      </span>
    </div>

    <div class="mt-3 flex flex-wrap gap-3">
      <img v-if="!soloAsignar && fotoUrl" :src="fotoUrl" alt="Foto del equipo" class="h-28 w-28 rounded-lg border border-border object-cover" />
      <img v-if="soloAsignar && fotoEntregaUrl" :src="fotoEntregaUrl" alt="Foto del equipo al entregar" class="h-28 w-28 rounded-lg border border-border object-cover" />
      <a
        v-if="responsivaUrl && (!soloAsignar || !cambioResponsable || documentoNuevo)"
        :href="responsivaUrl"
        target="_blank"
        rel="noreferrer"
        class="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-bg text-center text-[11px] font-semibold text-vz-blue hover:bg-surface-hover"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-6 w-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Ver responsiva
      </a>
    </div>

    <div class="mt-3">
      <AppField label="Notas">
        <textarea v-model="notas" :class="textareaClass" />
      </AppField>
    </div>

    <div class="mt-5 flex justify-end gap-2">
      <button type="button" class="h-9 rounded-lg border border-border bg-bg px-3 text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">Cancelar</button>
      <button type="button" :disabled="saving || uploading" class="h-9 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white hover:bg-primary-hover disabled:opacity-60" @click="handleSubmit">
        {{ saving ? 'Guardando…' : uploading ? 'Subiendo archivo…' : esLote ? `Dar de alta ${piezas.length} equipos` : 'Guardar' }}
      </button>
    </div>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { inputClass, selectClass, textareaClass } from 'components/formClasses'
import { listFamilias, listUbicaciones, getFamilia, UBICACION_STOCK_MAESTRO, UMBRAL_CONTROL_INDIVIDUAL } from 'src/lib/inventario/comunes'
import { addEquipo, updateEquipo, existeSerie, serieControlable } from 'src/lib/inventario/sistemas'
import { useAuth } from 'src/lib/auth'
import { canEditCompra } from 'src/lib/access'
import { getResponsivaActual, registrarResponsiva } from 'src/lib/inventario/responsivas'
import { uploadFoto, uploadFactura, uploadResponsiva } from 'src/lib/inventario/storage'
import { calcularValorDepreciado } from 'src/lib/inventario/depreciacion'
import { todayLocalDateString } from 'src/lib/dateUtils'
import { useToast } from 'src/composables/useToast'

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

const ESTADOS = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'asignado', label: 'Asignado' },
  { value: 'danado', label: 'Dañado' },
  { value: 'en_reparacion', label: 'En reparación' },
  { value: 'baja', label: 'Baja' },
]

/**
 * 'asignar': solo ubicación, usuario, estado, responsiva y notas. 'completo': alta de equipo nuevo (operador del dominio,
 * Adquisiciones o Admin) o edición completa de uno existente (solo Dirección/Adquisiciones: canEditCompra; con otro rol
 * los datos de compra se muestran de solo lectura).
 */
const props = defineProps({
  familiaId: { type: String, required: true },
  equipo: Object,
  registradoPor: String,
  modo: String,
})
const emit = defineEmits(['close', 'saved', 'responsiva'])

const toast = useToast()
const { user } = useAuth()
const eq = props.equipo
const soloAsignar = computed(() => props.modo === 'asignar' && !!props.equipo)
const familia = ref(eq?.familiaId ?? props.familiaId)
const modelo = ref(eq?.modelo ?? '')
const marca = ref(eq?.marca ?? '')
const numeroSerie = ref(eq?.numeroSerie ?? '')
const fotoUrl = ref(eq?.fotoUrl ?? '')
const ubicacionId = ref(eq?.ubicacionId ?? (props.modo === 'asignar' ? '' : UBICACION_STOCK_MAESTRO))
const cantidadPiezas = ref('1')
const piezas = ref([])
const esLote = computed(() => !eq && Number(cantidadPiezas.value) > 1)
const usuarioAsignado = ref(eq?.usuarioAsignado ?? '')
const puesto = ref(eq?.puesto ?? '')
const proveedor = ref(eq?.proveedor ?? '')
const fechaCompra = ref(eq?.fechaCompra ?? '')
const numeroFactura = ref(eq?.numeroFactura ?? '')
const costoTotal = ref(eq?.costoTotal?.toString() ?? '0')
const facturaUrl = ref(eq?.facturaUrl ?? '')
const garantiaMeses = ref(eq?.garantiaMeses?.toString() ?? '')
const responsivaUrl = ref(eq?.responsivaUrl ?? '')
const estado = ref(eq?.estado ?? 'disponible')
const notas = ref(eq?.notas ?? '')
// Modo 'asignar': cadena de responsivas (cada entrega queda registrada; el responsable real es el colaborador).
const gerente = ref('')
const fotoEntregaUrl = ref('')
const responsivaActual = computed(() => (eq ? getResponsivaActual(eq.id) : undefined))
const entregaAnterior = computed(() => (eq?.usuarioAsignado ?? '').trim())
const cambioResponsable = computed(() => usuarioAsignado.value.trim() !== entregaAnterior.value)
const documentoNuevo = computed(() => responsivaUrl.value !== (eq?.responsivaUrl ?? ''))
const saving = ref(false)
const uploading = ref(false)

// La familia de contexto (la que se pasó al abrir el modal, o la del equipo si se está editando)
// decide si mostramos las familias serializadas de Sistemas o las de Mantenimiento (Herramienta/Equipo).
const tipoContexto = getFamilia(eq?.familiaId ?? props.familiaId)?.tipo ?? 'sistemas'
const familias = computed(() => listFamilias(tipoContexto).filter((f) => f.modoInventario === 'serializado'))
const ubicaciones = computed(() => listUbicaciones())

// Candado: los datos de compra de un registro ya creado solo los edita Dirección/Adquisiciones.
const compraBloqueada = computed(() => !!eq && !soloAsignar.value && !(user.value && canEditCompra(user.value.role)))
// Alta nueva con costo >= umbral: se exige evidencia de compra (proveedor + factura/OC).
const costoUnitarioNum = computed(() => Number(costoTotal.value) || 0)
const exigeEvidencia = computed(() => !eq && !soloAsignar.value && costoUnitarioNum.value >= UMBRAL_CONTROL_INDIVIDUAL)
const avisoBajoUmbral = computed(() => costoUnitarioNum.value > 0 && costoUnitarioNum.value < UMBRAL_CONTROL_INDIVIDUAL)
const textoBajoUmbral = computed(() =>
  tipoContexto === 'mantenimiento'
    ? 'En Mantenimiento solo se registran individualmente herramientas y equipos de valor; tornillos y consumibles van por cantidad en Material/Consumible.'
    : `Por debajo de ${currency.format(UMBRAL_CONTROL_INDIVIDUAL)} normalmente se controla por cantidad.`,
)

function handleCantidadPiezas(value) {
  cantidadPiezas.value = value
  const n = Math.max(1, Math.min(200, Number(value) || 1))
  const next = [...piezas.value]
  while (next.length < n) next.push({ numeroSerie: '', ubicacionId: ubicacionId.value })
  next.length = n
  piezas.value = next
}

const familiaActual = computed(() => getFamilia(familia.value))
const valorDepreciado = computed(() =>
  eq && familiaActual.value
    ? calcularValorDepreciado({ costoTotal: Number(costoTotal.value) || 0, fechaCompra: fechaCompra.value, fechaAsignacion: eq.fechaAsignacion, createdAt: eq.createdAt }, familiaActual.value)
    : null,
)

function onFile(e, handler) {
  const file = e.target.files?.[0]
  if (file) void handler(file)
}

async function handleFoto(file) {
  uploading.value = true
  try {
    fotoUrl.value = await uploadFoto(eq?.id ?? 'nuevo', file)
  } catch {
    toast('No se pudo subir la foto.', 'error')
  } finally {
    uploading.value = false
  }
}

async function handleFactura(file) {
  uploading.value = true
  try {
    facturaUrl.value = await uploadFactura(eq?.id ?? 'nuevo', file)
  } catch {
    toast('No se pudo subir la factura.', 'error')
  } finally {
    uploading.value = false
  }
}

async function handleFotoEntrega(file) {
  uploading.value = true
  try {
    fotoEntregaUrl.value = await uploadFoto(eq?.id ?? 'nuevo', file)
  } catch {
    toast('No se pudo subir la foto.', 'error')
  } finally {
    uploading.value = false
  }
}

async function handleResponsiva(file) {
  uploading.value = true
  try {
    responsivaUrl.value = await uploadResponsiva(eq?.id ?? 'nuevo', file)
  } catch {
    toast('No se pudo subir la responsiva.', 'error')
  } finally {
    uploading.value = false
  }
}

/** Mensaje de error si alguna serie ya existe o se repite dentro del mismo alta; null si todo está bien. */
function errorDeSeries(series) {
  const vistas = new Set()
  for (const raw of series) {
    if (!serieControlable(raw)) continue
    const k = raw.trim().toLowerCase()
    if (vistas.has(k)) return `La serie "${raw.trim()}" está repetida en este lote. Cada pieza debe tener un número de serie único.`
    vistas.add(k)
    if (existeSerie(raw)) return `La serie "${raw.trim()}" ya está registrada en otro equipo. Cada pieza debe tener un número de serie único.`
  }
  return null
}

async function handleSubmit() {
  if (esLote.value && piezas.value.some((p) => !p.numeroSerie.trim())) {
    toast('Captura el número de serie de cada pieza.', 'error')
    return
  }
  if (!soloAsignar.value && !eq) {
    if (exigeEvidencia.value && (!proveedor.value.trim() || !numeroFactura.value.trim())) {
      toast(`Con costo de ${currency.format(UMBRAL_CONTROL_INDIVIDUAL)} o más son obligatorios el proveedor y la factura u orden de compra.`, 'error')
      return
    }
    const errSerie = errorDeSeries(esLote.value ? piezas.value.map((p) => p.numeroSerie) : [numeroSerie.value])
    if (errSerie) {
      toast(errSerie, 'error')
      return
    }
  }
  saving.value = true
  try {
    const registrador = props.registradoPor ?? user.value?.displayName
    const camposComunes = {
      familiaId: familia.value,
      modelo: modelo.value || undefined,
      marca: marca.value || undefined,
      fotoUrl: fotoUrl.value || undefined,
      proveedor: proveedor.value || undefined,
      fechaCompra: fechaCompra.value || undefined,
      numeroFactura: numeroFactura.value || undefined,
      costoTotal: Number(costoTotal.value) || 0,
      facturaUrl: facturaUrl.value || undefined,
      garantiaMeses: garantiaMeses.value ? Number(garantiaMeses.value) : undefined,
      responsivaUrl: responsivaUrl.value || undefined,
      estado: estado.value,
      notas: notas.value || undefined,
    }

    if (soloAsignar.value && eq) {
      const anterior = entregaAnterior.value
      const nuevo = usuarioAsignado.value.trim()
      const cambio = cambioResponsable.value
      const docNuevo = documentoNuevo.value
      const registrarEntrega = !!nuevo && (cambio || !!fotoEntregaUrl.value || docNuevo)
      const registrarDevolucion = !nuevo && !!anterior
      // La responsiva firmada anterior era de otra persona: si cambió el responsable y no se adjuntó una nueva, se limpia.
      const responsivaEquipo = cambio && !docNuevo ? '' : responsivaUrl.value
      await updateEquipo(
        eq.id,
        {
          estado: estado.value,
          // Cadenas vacías (no undefined) para que vaciar un campo sí lo borre en la base de datos.
          ubicacionId: ubicacionId.value || undefined,
          usuarioAsignado: usuarioAsignado.value,
          puesto: puesto.value,
          fechaAsignacion: usuarioAsignado.value ? (eq.fechaAsignacion ?? todayLocalDateString()) : '',
          responsivaUrl: responsivaEquipo,
          notas: notas.value,
        },
        props.registradoPor,
      )
      let nueva
      if (registrarEntrega || registrarDevolucion) {
        const entrega = registrarEntrega
        const resp = await registrarResponsiva({
          equipoId: eq.id,
          tipo: entrega ? 'entrega' : 'devolucion',
          responsable: entrega ? nuevo : undefined,
          puesto: entrega ? puesto.value.trim() || undefined : undefined,
          ubicacionId: ubicacionId.value || undefined,
          entregadoPor: anterior || props.registradoPor || undefined,
          autorizadoPor: gerente.value.trim() || undefined,
          estadoEquipo: estado.value,
          fotoUrl: fotoEntregaUrl.value || undefined,
          documentoUrl: docNuevo ? responsivaUrl.value || undefined : undefined,
        })
        if (entrega) nueva = resp
      }
      toast('Asignación guardada.')
      emit('saved')
      if (nueva) emit('responsiva', nueva)
      emit('close')
      return
    }

    if (esLote.value) {
      for (const pieza of piezas.value) {
        await addEquipo({ ...camposComunes, numeroSerie: pieza.numeroSerie.trim(), ubicacionId: pieza.ubicacionId || undefined }, registrador)
      }
      toast(`${piezas.value.length} equipos dados de alta.`)
    } else {
      const payload = {
        ...camposComunes,
        numeroSerie: numeroSerie.value || undefined,
        ubicacionId: ubicacionId.value || undefined,
        usuarioAsignado: eq ? usuarioAsignado.value : usuarioAsignado.value || undefined,
        puesto: eq ? puesto.value : puesto.value || undefined,
        fechaAsignacion: usuarioAsignado.value ? (eq?.fechaAsignacion ?? todayLocalDateString()) : eq ? '' : undefined,
      }
      if (eq) {
        // Defensa: sin permiso de compra solo viajan los campos de asignación/estado/notas.
        const patch = compraBloqueada.value
          ? {
              ubicacionId: payload.ubicacionId,
              usuarioAsignado: payload.usuarioAsignado,
              puesto: payload.puesto,
              fechaAsignacion: payload.fechaAsignacion,
              responsivaUrl: payload.responsivaUrl,
              estado: payload.estado,
              notas: payload.notas,
            }
          : payload
        await updateEquipo(eq.id, patch, props.registradoPor)
        toast('Equipo actualizado.')
      } else {
        await addEquipo({ ...payload, numeroSerie: numeroSerie.value.trim() || undefined }, registrador)
        toast('Equipo dado de alta.')
      }
    }
    emit('saved')
    emit('close')
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'No se pudo guardar el equipo.', 'error')
  } finally {
    saving.value = false
  }
}
</script>
