<template>
  <div v-if="auditoria" class="mx-auto flex h-full max-w-4xl flex-col px-4 py-6 sm:px-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <button type="button" class="flex items-center gap-1.5 text-[13px] font-semibold text-vz-blue hover:underline" @click="emit('back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Auditorías
      </button>
      <div class="flex flex-wrap items-center gap-2">
        <StatusPill :label="ESTADO_AUDITORIA_LABEL[auditoria.estado]" :tone="ESTADO_AUDITORIA_TONE[auditoria.estado]" />
        <button
          v-if="auditoria.estado === 'en_conteo' && puedeEditar"
          type="button"
          class="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover"
          @click="showCompartir = true"
        >
          Compartir liga
        </button>
        <button type="button" class="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover" @click="showActa = true">
          {{ auditoria.estado === 'completada' ? 'Ver acta' : 'Vista previa del acta' }}
        </button>
        <button
          v-if="contarAqui"
          type="button"
          :disabled="pendientes > 0"
          class="h-9 rounded-lg bg-vz-blue px-3 text-[13px] font-bold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          :title="pendientes > 0 ? `Faltan ${pendientes} artículo(s) por contar` : ''"
          @click="handleEnviar"
        >
          Enviar a verificación
        </button>
      </div>
    </div>

    <!-- Ficha -->
    <div class="mb-3 rounded-xl border border-border bg-surface p-4 text-[12.5px]">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-[14px] font-extrabold text-text">{{ getUbicacion(auditoria.ubicacionId)?.nombre ?? auditoria.ubicacionId }}</p>
          <p class="text-text-muted">
            {{ TIPO_AUDITORIA_LABEL[auditoria.tipo] }} · {{ MODALIDAD_LABEL[auditoria.modalidad] }}
            <template v-if="auditoria.auditorNombre"> · {{ auditoria.auditorNombre }}<template v-if="auditoria.auditorCorreo"> ({{ auditoria.auditorCorreo }})</template></template>
          </p>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <StatusPill v-if="auditoria.sorpresa" label="Sorpresa" tone="neutral" />
          <StatusPill v-if="exactitud.pct !== null" :label="`Exactitud ${exactitud.pct}%`" :tone="exactitud.pct >= META_EXACTITUD_AUDITORIA ? 'success' : 'danger'" />
        </div>
      </div>
      <p class="mt-1 text-text-soft">
        Iniciada {{ new Date(auditoria.fechaInicio).toLocaleString('es-MX') }}<template v-if="auditoria.realizadaPor"> por {{ auditoria.realizadaPor }}</template>
        <template v-if="auditoria.fechaProgramada"> · Programada {{ fechaCorta(auditoria.fechaProgramada) }}</template>
        <template v-if="auditoria.fechaEnvio"> · Enviada {{ new Date(auditoria.fechaEnvio).toLocaleString('es-MX') }}</template>
        <template v-if="auditoria.fechaCierre"> · Cerrada {{ new Date(auditoria.fechaCierre).toLocaleString('es-MX') }}<template v-if="auditoria.verificadaPor"> por {{ auditoria.verificadaPor }}</template></template>
      </p>
      <p v-if="auditoria.alcance" class="mt-1.5 rounded-lg bg-bg px-2.5 py-1.5 text-text-muted"><span class="font-semibold text-text">Alcance:</span> {{ auditoria.alcance }}</p>

      <div class="mt-2.5">
        <div class="mb-1 flex justify-between text-[11.5px] text-text-muted">
          <span>{{ items.length - pendientes }} de {{ items.length }} artículos contados</span>
          <span>{{ discrepancias.length }} discrepancia(s)</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-border">
          <div class="h-full rounded-full bg-vz-success" :style="{ width: `${items.length === 0 ? 100 : Math.round(((items.length - pendientes) / items.length) * 100)}%` }" />
        </div>
      </div>
    </div>

    <!-- Aviso según estado -->
    <div v-if="auditoria.estado === 'en_conteo'" class="mb-3 rounded-xl border border-vz-warning/30 bg-vz-warning/10 p-3 text-[12.5px] text-text">
      <template v-if="contarAqui">
        Cuenta cada artículo desde esta pantalla (los materiales se cuentan a ciegas). Cuando no quede nada pendiente, usa <b>Enviar a verificación</b>.
      </template>
      <template v-else>
        Esperando el conteo<template v-if="auditoria.auditorNombre"> de <b>{{ auditoria.auditorNombre }}</b></template
        >: {{ pendientes }} artículo(s) pendiente(s).
        <template v-if="puedeEditar">Comparte la liga con <b>Compartir liga</b>; cuando el contador envíe, aquí podrás verificar.</template>
      </template>
    </div>
    <div v-else-if="auditoria.estado === 'por_verificar'" class="mb-3 rounded-xl border border-vz-blue/30 bg-vz-blue/10 p-3 text-[12.5px] text-text">
      El conteo fue enviado a verificación. Revisa lo contado contra lo esperado, pide <b>reconteo</b> de lo dudoso, resuelve las discrepancias y cierra la auditoría.
    </div>
    <div v-else class="mb-3 rounded-xl border border-vz-success/30 bg-vz-success/10 p-3 text-[12.5px] text-text">
      Auditoría <b>cerrada</b>: es de solo lectura, no puede reabrirse ni editarse. Su acta queda como constancia.
    </div>

    <div class="flex-1 overflow-y-auto pb-8">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label class="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-text">
          <input v-model="soloDiscrepancias" type="checkbox" />
          Solo discrepancias
        </label>
        <p class="text-[12px] text-text-muted">{{ visibles }} artículo(s) a la vista</p>
      </div>

      <details v-for="g in gruposVisibles" :key="g.id" :open="g.abierto" class="mb-3 rounded-xl border border-border bg-surface">
        <summary class="flex cursor-pointer items-center justify-between gap-2 p-3 text-[13px] font-bold text-text">
          <span>{{ g.titulo }}</span>
          <StatusPill :label="String(g.items.length)" :tone="g.tono" />
        </summary>
        <div class="px-4 pb-3">
          <template v-for="item in g.items" :key="item.id">
            <AuditoriaEquipoRow v-if="item.tipo === 'equipo'" :item="item" :editor="contarAqui" :verificador="verificadorRow" @changed="refresh" />
            <AuditoriaMaterialRow v-else :item="item" :editor="contarAqui" :verificador="verificadorRow" @changed="refresh" />
          </template>
        </div>
      </details>
      <p v-if="items.length === 0" class="text-center text-[13px] text-text-soft">Esta ubicación no tenía artículos registrados al iniciar la auditoría.</p>
      <p v-else-if="gruposVisibles.length === 0" class="text-center text-[13px] text-text-soft">
        {{ soloDiscrepancias ? 'Sin discrepancias a la vista.' : 'Nada que mostrar.' }}
      </p>

      <!-- Resolución de discrepancias -->
      <div v-if="mostrarResolucion" class="mt-4 rounded-xl border border-border bg-surface p-4">
        <h3 class="mb-1 text-[13px] font-bold text-text">Discrepancias y resoluciones</h3>
        <p class="mb-3 text-[12px] text-text-muted">
          {{ puedeResolver ? 'Resuelve cada una para dejar el inventario consistente con lo que realmente hay en sitio; la resolución queda en el acta.' : 'Estas son las discrepancias y cómo quedaron resueltas.' }}
        </p>
        <p v-if="discrepancias.length === 0" class="py-4 text-center text-[13px] text-text-soft">Sin discrepancias — todo coincidió con lo esperado.</p>
        <div v-else class="flex flex-col gap-2">
          <template v-for="item in discrepancias" :key="item.id">
            <DiscrepanciaEquipoRow v-if="item.tipo === 'equipo'" :item="item" :solo="!puedeResolver" @resolve="(e, it) => (bajaPerdida = { equipo: e, itemId: it.id })" @documentar="documentar" />
            <DiscrepanciaMaterialRow v-else :item="item" :solo="!puedeResolver" @ajustado="refresh" />
          </template>
        </div>
      </div>

      <!-- Cierre -->
      <div v-if="auditoria.estado === 'por_verificar' && puedeEditar" class="mt-4 rounded-xl border border-border bg-surface p-4">
        <h3 class="mb-1 text-[13px] font-bold text-text">Cerrar auditoría</h3>
        <p class="mb-2 text-[12px] text-text-muted">El cierre es definitivo: la auditoría ya no podrá reabrirse ni modificarse, y se genera su acta.</p>
        <textarea v-model="observaciones" :class="textareaClass" placeholder="Observaciones del cierre (aparecen en el acta)" />
        <button
          type="button"
          :disabled="cerrando"
          class="mt-3 h-9 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white hover:bg-primary-hover disabled:opacity-60"
          @click="handleCerrar"
        >
          {{ cerrando ? 'Cerrando…' : 'Cerrar auditoría' }}
        </button>
      </div>
      <p v-else-if="auditoria.estado === 'por_verificar'" class="mt-4 text-center text-[12px] text-text-soft">Tu rol no puede cerrar esta auditoría (solo ver).</p>
    </div>

    <BajaPerdidaModal
      v-if="bajaPerdida"
      :equipo="bajaPerdida.equipo"
      :autorizado-por="user?.displayName"
      @close="bajaPerdida = null"
      @saved="alBajaRegistrada"
    />
    <CompartirAuditoriaModal v-if="showCompartir" :auditoria="auditoria" @close="showCompartir = false" />
    <ActaAuditoriaModal v-if="showActa" :auditoria-id="auditoria.id" @close="showActa = false" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAuth } from 'src/lib/auth'
import { canRunAudit } from 'src/lib/access'
import { bump } from 'src/lib/reactive'
import { useConfirm } from 'src/composables/useConfirm'
import { useToast } from 'src/composables/useToast'
import { textareaClass } from 'components/formClasses'
import StatusPill from 'components/StatusPill.vue'
import BajaPerdidaModal from 'components/inventario/BajaPerdidaModal.vue'
import CompartirAuditoriaModal from 'components/inventario/CompartirAuditoriaModal.vue'
import ActaAuditoriaModal from 'components/inventario/ActaAuditoriaModal.vue'
import AuditoriaEquipoRow from 'components/inventario/AuditoriaEquipoRow.vue'
import AuditoriaMaterialRow from 'components/inventario/AuditoriaMaterialRow.vue'
import DiscrepanciaEquipoRow from 'components/inventario/DiscrepanciaEquipoRow.vue'
import DiscrepanciaMaterialRow from 'components/inventario/DiscrepanciaMaterialRow.vue'
import { getUbicacion } from 'src/lib/inventario/comunes'
import {
  cerrarAuditoria,
  discrepanciasAuditoria,
  enviarAVerificacion,
  ESTADO_AUDITORIA_LABEL,
  ESTADO_AUDITORIA_TONE,
  exactitudAuditoria,
  getAuditoria,
  itemCoincide,
  listItems,
  META_EXACTITUD_AUDITORIA,
  MODALIDAD_LABEL,
  pendientesAuditoria,
  registrarResolucion,
  TIPO_AUDITORIA_LABEL,
} from 'src/lib/inventario/auditorias'

const props = defineProps({ auditoriaId: { type: String, required: true } })
const emit = defineEmits(['back'])

const { user } = useAuth()
const confirm = useConfirm()
const toast = useToast()
const refresh = () => bump()

const auditoria = computed(() => getAuditoria(props.auditoriaId))
const items = computed(() => listItems(props.auditoriaId))
const discrepancias = computed(() => discrepanciasAuditoria(props.auditoriaId))
const pendientes = computed(() => pendientesAuditoria(props.auditoriaId))
const exactitud = computed(() => exactitudAuditoria(props.auditoriaId))

// Cada operador audita solo su dominio (Uriel: Sistemas; Gerencia de Mantenimiento: Mantenimiento); 'ambos' lo corre Dirección.
const puedeEditar = computed(() => (user.value && auditoria.value ? canRunAudit(user.value.role, auditoria.value.tipo) : false))
/** Cuenta dentro de la app: solo la modalidad interna, en conteo. */
const contarAqui = computed(() => puedeEditar.value && auditoria.value?.estado === 'en_conteo' && auditoria.value.modalidad === 'interna')
/** Puede pedir reconteo: verificador sobre una auditoría abierta que no se está contando aquí. */
const verificadorRow = computed(() => puedeEditar.value && !contarAqui.value && auditoria.value?.estado !== 'completada')
const mostrarResolucion = computed(() => auditoria.value?.estado === 'por_verificar' || auditoria.value?.estado === 'completada')
const puedeResolver = computed(() => puedeEditar.value && auditoria.value?.estado === 'por_verificar')

const soloDiscrepancias = ref(false)
const showCompartir = ref(false)
const showActa = ref(false)
const bajaPerdida = ref(null)
const observaciones = ref('')
const cerrando = ref(false)

watch(
  () => auditoria.value?.id,
  () => {
    observaciones.value = auditoria.value?.notas ?? ''
  },
  { immediate: true },
)

const fechaCorta = (f) => new Date(`${f}T00:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

/** @typedef {'success' | 'info' | 'warning' | 'danger' | 'neutral'} Tono */
/**
 * @typedef {object} Grupo
 * @property {string} id
 * @property {string} titulo
 * @property {Tono} tono
 * @property {AuditoriaItem[]} items
 * @property {boolean} discrepancia - Si se muestra cuando "solo discrepancias" está activo.
 * @property {boolean} abierto
 */

const grupos = computed(() => {
  const its = items.value
  const sinReconteo = its.filter((i) => !i.reconteo)
  const contados = sinReconteo.filter((i) => itemCoincide(i) !== null)
  const lista = [
    { id: 'reconteo', titulo: 'En reconteo (pedido al contador)', tono: 'warning', items: its.filter((i) => i.reconteo), discrepancia: true, abierto: true },
    { id: 'perdido', titulo: 'Equipos no encontrados', tono: 'danger', items: contados.filter((i) => i.tipo === 'equipo' && i.encontrado === false), discrepancia: true, abierto: true },
    { id: 'danado', titulo: 'Equipos dañados', tono: 'warning', items: contados.filter((i) => i.tipo === 'equipo' && i.encontrado && i.condicion === 'danado'), discrepancia: true, abierto: true },
    { id: 'diferencia', titulo: 'Materiales con diferencia', tono: 'warning', items: contados.filter((i) => i.tipo === 'material' && itemCoincide(i) === false), discrepancia: true, abierto: true },
    { id: 'pendiente', titulo: 'Sin contar', tono: 'neutral', items: sinReconteo.filter((i) => itemCoincide(i) === null), discrepancia: false, abierto: true },
    { id: 'bien', titulo: 'Equipos encontrados en buen estado', tono: 'success', items: contados.filter((i) => i.tipo === 'equipo' && itemCoincide(i) === true), discrepancia: false, abierto: false },
    { id: 'coincide', titulo: 'Materiales que coinciden con lo esperado', tono: 'success', items: contados.filter((i) => i.tipo === 'material' && itemCoincide(i) === true), discrepancia: false, abierto: false },
  ]
  return lista.filter((g) => g.items.length > 0)
})
const gruposVisibles = computed(() => grupos.value.filter((g) => !soloDiscrepancias.value || g.discrepancia))
const visibles = computed(() => gruposVisibles.value.reduce((n, g) => n + g.items.length, 0))

const handleEnviar = async () => {
  const a = auditoria.value
  if (!a) return
  const ok = await confirm({
    message: 'Se enviará el conteo a verificación. Después podrás revisarlo, pedir reconteos y cerrar la auditoría.',
    confirmLabel: 'Enviar a verificación',
  })
  if (!ok) return
  try {
    await enviarAVerificacion(a.id)
    toast('Conteo enviado a verificación.')
    refresh()
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo enviar.', 'error')
  }
}

const documentar = async (item, resolucion) => {
  try {
    await registrarResolucion(item.id, resolucion)
    refresh()
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo registrar la resolución.', 'error')
  }
}

const alBajaRegistrada = async () => {
  const b = bajaPerdida.value
  if (b) {
    try {
      await registrarResolucion(b.itemId, 'Baja por pérdida con cargo registrado')
    } catch {
      /* la baja ya quedó registrada; la resolución se puede documentar después */
    }
  }
  refresh()
}

const handleCerrar = async () => {
  const a = auditoria.value
  if (!a) return
  const sinResolver = discrepancias.value.filter((i) => !i.resolucion).length
  const ok = await confirm({
    title: 'Cerrar auditoría',
    message:
      `¿Cerrar esta auditoría? Es definitivo: no podrá reabrirse ni modificarse.` +
      (sinResolver > 0 ? ` Quedan ${sinResolver} discrepancia(s) sin resolución documentada; constarán como "sin resolver" en el acta.` : ''),
    confirmLabel: 'Cerrar auditoría',
  })
  if (!ok) return
  cerrando.value = true
  try {
    await cerrarAuditoria(a.id, observaciones.value.trim() || undefined, user.value?.displayName)
    toast('Auditoría cerrada.')
    refresh()
    showActa.value = true
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo cerrar la auditoría.', 'error')
  } finally {
    cerrando.value = false
  }
}
</script>
