<template>
  <AppModal :title="`Responsivas · ${equipo.modelo || equipo.numeroSerie || 'Equipo'}`" wide @close="emit('close')">
    <div class="mb-3 rounded-lg border border-border bg-bg p-3 text-[12px]">
      <p class="mb-1.5 text-[12.5px] font-bold text-text">Datos de compra (no cambian)</p>
      <div class="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <p class="text-text-muted">Proveedor: <span class="font-semibold text-text">{{ actual.proveedor || '—' }}</span></p>
        <p class="text-text-muted">Fecha de compra: <span class="font-semibold text-text">{{ actual.fechaCompra ? fechaCorta(actual.fechaCompra) : '—' }}</span></p>
        <p class="text-text-muted">Factura: <span class="font-semibold text-text">{{ actual.numeroFactura || '—' }}</span></p>
        <p class="text-text-muted">Costo: <span class="font-semibold text-text">{{ currency.format(actual.costoTotal) }}</span></p>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-3">
        <button
          v-if="actual.facturaUrl"
          type="button"
          class="font-semibold text-vz-blue hover:underline"
          @click="verDocumento(actual.facturaUrl)"
        >
          Ver factura (PDF)
        </button>
        <span v-else class="text-text-soft">Sin PDF de factura</span>
        <button v-if="actual.fotoUrl" type="button" class="flex items-center gap-2 font-semibold text-vz-blue hover:underline" @click="ampliada = actual.fotoUrl ?? null">
          <img :src="actual.fotoUrl" alt="Foto de alta" class="h-10 w-10 rounded-md border border-border object-cover" />
          Foto de alta
        </button>
      </div>
    </div>

    <div :class="`mb-3 rounded-lg border p-3 ${vigente ? 'border-vz-blue/40 bg-vz-blue/10' : 'border-border bg-bg'}`">
      <p class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Responsable actual</p>
      <p class="text-[14px] font-extrabold text-text">{{ vigente?.responsable || actual.usuarioAsignado || 'Sin responsable asignado' }}</p>
      <p v-if="vigente" class="text-[12px] text-text-muted">
        {{ vigente.puesto || 'Sin puesto' }} · desde {{ fechaCorta(vigente.fecha) }} · {{ vigente.folio }}
      </p>
      <p v-else-if="actual.usuarioAsignado" class="text-[12px] text-text-muted">Asignación sin responsiva registrada.</p>
    </div>

    <p class="mb-2 text-[12.5px] font-bold text-text">Cadena de responsivas</p>
    <p v-if="responsivas.length === 0" class="rounded-lg border border-border bg-bg p-3 text-[12px] text-text-soft">Este equipo todavía no tiene responsivas registradas.</p>
    <div class="flex flex-col gap-2">
      <div
        v-for="r in responsivas"
        :key="r.id"
        :class="`flex gap-3 rounded-lg border p-3 text-[12px] ${vigente && r.id === vigente.id ? 'border-vz-blue/40 bg-vz-blue/5' : 'border-border bg-bg'}`"
      >
        <button v-if="r.fotoUrl" type="button" class="shrink-0" title="Ampliar foto" @click="ampliada = r.fotoUrl ?? null">
          <img :src="r.fotoUrl" alt="Foto del equipo al entregar" class="h-20 w-20 rounded-lg border border-border object-cover" />
        </button>
        <div v-else class="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-center text-[10px] text-text-soft">Sin foto</div>
        <div class="min-w-0 flex-1">
          <p class="font-bold text-text">
            {{ r.folio }} · {{ fechaCorta(r.fecha) }}
            <span v-if="r.tipo === 'devolucion'" class="ml-1 rounded bg-vz-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-vz-warning">Devolución</span>
            <span v-else-if="vigente && r.id === vigente.id" class="ml-1 rounded bg-vz-blue/15 px-1.5 py-0.5 text-[10px] font-bold text-vz-blue">Vigente</span>
          </p>
          <p class="text-text-muted">
            <template v-if="r.tipo === 'devolucion'">{{ r.entregadoPor || '—' }} devolvió el equipo</template>
            <template v-else>{{ r.entregadoPor || '—' }} → <span class="font-semibold text-text">{{ r.responsable || '—' }}</span></template>
          </p>
          <p v-if="r.autorizadoPor" class="text-text-muted">Autorizó: {{ r.autorizadoPor }}</p>
          <p class="text-text-muted">
            {{ getUbicacion(r.ubicacionId)?.nombre ?? 'Sin ubicación' }}<template v-if="r.estadoEquipo"> · Estado: {{ ESTADO_LABEL[r.estadoEquipo] ?? r.estadoEquipo }}</template>
          </p>
          <div class="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              v-if="r.documentoUrl"
              type="button"
              class="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-vz-blue hover:bg-surface-hover"
              @click="verDocumento(r.documentoUrl)"
            >
              Ver firmada
            </button>
            <label v-else-if="puedeAdjuntar" class="cursor-pointer rounded-md border border-vz-warning/30 bg-vz-warning/10 px-2 py-1 text-[11px] font-semibold text-vz-warning hover:bg-vz-warning/20">
              {{ subiendoId === r.id ? 'Subiendo…' : 'Adjuntar firmada' }}
              <input type="file" accept="application/pdf,image/*" class="hidden" :disabled="subiendoId !== null" @change="(e) => adjuntar(r, e)" />
            </label>
            <span v-else class="text-[11px] text-text-soft">Sin firmada</span>
            <button type="button" class="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-hover" @click="reimprimir = r">Reimprimir</button>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 flex justify-end">
      <button type="button" class="h-9 rounded-lg border border-border bg-bg px-3 text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">Cerrar</button>
    </div>

    <ResponsivaModal v-if="reimprimir" :responsiva="reimprimir" @close="reimprimir = null" />

    <Teleport to="body">
      <div v-if="ampliada" class="fixed inset-0 flex items-center justify-center bg-black/70 p-4" style="z-index: 9000" @click="ampliada = null">
        <img :src="ampliada" alt="Foto ampliada" class="max-h-full max-w-full rounded-xl border border-border object-contain shadow-xl" />
      </div>
    </Teleport>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import ResponsivaModal from './ResponsivaModal.vue'
import { getEquipo, updateEquipo } from 'src/lib/inventario/sistemas'
import { getFamilia, getUbicacion } from 'src/lib/inventario/comunes'
import { actualizarResponsiva, getResponsivaActual, listResponsivas } from 'src/lib/inventario/responsivas'
// import { uploadResponsiva } from 'src/lib/inventario/storage'
import { uploadResponsiva, abrirDocumentoPrivado } from 'src/lib/inventario/storage'
import { parseLocalDate } from 'src/lib/dateUtils'
import { bump } from 'src/lib/reactive'
import { useAuth } from 'src/lib/auth'
import { canAssign } from 'src/lib/access'
import { useToast } from 'src/composables/useToast'

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const ESTADO_LABEL = { disponible: 'Disponible', asignado: 'Asignado', danado: 'Dañado', en_reparacion: 'En reparación', baja: 'Baja' }

/** Línea de tiempo de custodia de un equipo: responsable actual, cadena de responsivas y datos de compra (fijos). */
const props = defineProps({ equipo: { type: Object, required: true } })
const emit = defineEmits(['close'])
const toast = useToast()

// Se relee el equipo del caché para reflejar cambios hechos mientras el panel está abierto.
const actual = computed(() => getEquipo(props.equipo.id) ?? props.equipo)
const responsivas = computed(() => listResponsivas(props.equipo.id))
const vigente = computed(() => getResponsivaActual(props.equipo.id))
const { user } = useAuth()
// Adjunta/actualiza responsivas el operador del dominio del equipo (y Dirección).
const puedeAdjuntar = computed(() => (user.value ? canAssign(user.value.role, getFamilia(props.equipo.familiaId)?.tipo) : false))

const ampliada = ref(null)
const reimprimir = ref(null)
const subiendoId = ref(null)

function fechaCorta(d) {
  return parseLocalDate(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function verDocumento(url) {
  if (!url) return

  try {
    const blobUrl = await abrirDocumentoPrivado(url)
    window.open(blobUrl, '_blank', 'noopener,noreferrer')

    // Liberar la URL temporal después de un tiempo.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
  } catch (error) {
    toast(error.message || 'No se pudo abrir el documento.', 'error')
  }
}


async function adjuntar(r, e) {
  const input = e.target
  const file = input.files?.[0]
  if (!file) return
  subiendoId.value = r.id
  try {
    const url = await uploadResponsiva(r.equipoId, file)
    await actualizarResponsiva(r.id, { documentoUrl: url })
    // Si es la responsiva vigente, el equipo conserva el enlace a la última firmada.
    if (vigente.value?.id === r.id) await updateEquipo(r.equipoId, { responsivaUrl: url })
    bump()
    toast('Responsiva firmada adjuntada.')
  } catch {
    toast('No se pudo adjuntar la responsiva firmada.', 'error')
  } finally {
    subiendoId.value = null
    input.value = ''
  }
}
</script>
