<template>
  <div class="mx-auto min-h-full w-full min-w-0 max-w-[1100px] px-4 py-6 sm:px-6">
    <!-- Encabezado -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="truncate text-[17px] font-extrabold text-text">Proveedores</h1>
        <p class="text-[12px] text-text-muted">
          Catálogo de proveedores de Compras Indirectas: a quién se le paga, con qué datos y por qué canal. Solo se registra el proveedor <strong class="text-text">elegido</strong> para una compra.
        </p>
      </div>
      <button v-if="puedeCrear" type="button" :class="btnPrimary" data-test="nuevo-proveedor-catalogo" @click="alta = true">+ Nuevo proveedor</button>
    </div>

    <!-- Filtros -->
    <div class="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_170px_170px]">
      <input v-model="filtros.texto" type="search" :class="inputClass" placeholder="Buscar por nombre, razón social o RFC…" aria-label="Buscar proveedores" autocomplete="off" data-test="buscar-catalogo" />
      <select v-model="filtros.tipo" :class="selectClass" aria-label="Tipo de proveedor">
        <option value="">Todos los tipos</option>
        <option value="remision">Remisión (efectivo)</option>
        <option value="factura">Factura</option>
      </select>
      <select v-model="filtros.estado" :class="selectClass" aria-label="Estado">
        <option value="activos">Solo activos</option>
        <option value="baja">Dados de baja</option>
        <option value="todos">Todos</option>
      </select>
    </div>
    <p class="mb-3 text-right text-[12px] font-semibold text-text-muted">{{ lista.length }} de {{ total }} {{ total === 1 ? 'proveedor' : 'proveedores' }}</p>

    <!-- Vacío -->
    <div v-if="total === 0" class="rounded-xl border border-dashed border-border bg-surface px-4 py-12 text-center">
      <p class="text-[14px] font-extrabold text-text">Todavía no hay proveedores en el catálogo</p>
      <p class="mx-auto mt-1 max-w-md text-[12.5px] text-text-muted">Se registran desde la pestaña Autorización de una requisición, al elegir al proveedor ganador y antes de pedir la autorización.</p>
    </div>
    <div v-else-if="lista.length === 0" class="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-[13px] text-text-soft">
      Ningún proveedor coincide con los filtros. <button type="button" class="font-bold text-vz-blue hover:underline" @click="limpiar">Limpiar filtros</button>
    </div>

    <!-- Lista -->
    <ul v-else class="m-0 flex list-none flex-col gap-2 p-0" aria-label="Proveedores del catálogo">
      <li v-for="p in lista" :key="p.id">
        <button type="button" class="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-hover" data-test="fila-proveedor" @click="abrir(p)">
          <div class="min-w-0 flex-1 basis-[220px]">
            <p class="truncate text-[14px] font-extrabold text-text">{{ p.nombreComercial }}</p>
            <p class="truncate text-[12px] text-text-muted">{{ p.razonSocial || 'Sin razón social' }}</p>
          </div>
          <p class="w-[140px] shrink-0 font-mono text-[12.5px] font-semibold text-text">{{ p.rfc || 'sin RFC' }}</p>
          <div class="flex shrink-0 flex-wrap items-center gap-1.5">
            <span :class="`rounded-full border px-2 py-0.5 text-[11px] font-bold ${p.tipo === 'factura' ? TONE_STYLES.info : TONE_STYLES.warning}`">{{ p.tipo === 'factura' ? 'Factura' : 'Remisión' }}</span>
            <span :class="`rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE_STYLES.neutral}`">{{ FORMA_PAGO_LABEL[p.formaPago] }}</span>
            <span v-if="!p.activo" :class="`rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE_STYLES.danger}`">Dado de baja</span>
          </div>
        </button>
      </li>
    </ul>

    <!-- Alta -->
    <AppModal v-if="alta" title="Nuevo proveedor" wide @close="alta = false">
      <p class="mb-3 text-[12.5px] text-text-muted">Antes de crear uno nuevo se busca por RFC y nombre: si ya existe, se reutiliza.</p>
      <ProveedorForm @guardado="alGuardarAlta" @usar="(p) => { alta = false; abrir(p) }" @cancelar="alta = false" />
    </AppModal>

    <!-- Detalle / edición -->
    <AppModal v-if="seleccion" :title="editando ? `Editar · ${seleccion.nombreComercial}` : seleccion.nombreComercial" wide @close="cerrar">
      <ProveedorForm v-if="editando" :proveedor="seleccion" @guardado="alGuardarEdicion" @cancelar="editando = false" />
      <template v-else>
        <div class="mb-3 flex flex-wrap items-center gap-1.5">
          <span :class="`rounded-full border px-2 py-0.5 text-[11px] font-bold ${seleccion.tipo === 'factura' ? TONE_STYLES.info : TONE_STYLES.warning}`">{{ TIPO_PROVEEDOR_LABEL[seleccion.tipo] }}</span>
          <span :class="`rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE_STYLES.neutral}`">Pago habitual: {{ FORMA_PAGO_LABEL[seleccion.formaPago] }}</span>
          <span :class="`rounded-full border px-2 py-0.5 text-[11px] font-bold ${seleccion.activo ? TONE_STYLES.success : TONE_STYLES.danger}`">{{ seleccion.activo ? 'Activo' : 'Dado de baja' }}</span>
          <span class="text-[11.5px] text-text-muted">El pago va a {{ DESTINO_PAGO_LABEL[destinoDePago(seleccion.formaPago)] }}.</span>
        </div>
        <p v-if="!seleccion.activo && seleccion.motivoBaja" class="mb-3 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] text-text"><strong>Motivo de la baja:</strong> {{ seleccion.motivoBaja }}</p>
        <dl class="grid grid-cols-1 gap-x-6 gap-y-2.5 text-[12.5px] sm:grid-cols-2">
          <div><dt class="text-[11px] text-text-soft">Razón social</dt><dd class="font-semibold text-text">{{ seleccion.razonSocial || '—' }}</dd></div>
          <div><dt class="text-[11px] text-text-soft">RFC</dt><dd class="font-mono font-semibold text-text" data-test="detalle-rfc">{{ seleccion.rfc || '—' }}</dd></div>
          <div class="sm:col-span-2"><dt class="text-[11px] text-text-soft">Dirección fiscal</dt><dd class="font-semibold text-text">{{ seleccion.direccionFiscal || '—' }}</dd></div>
          <div><dt class="text-[11px] text-text-soft">Código postal</dt><dd class="font-semibold text-text">{{ seleccion.cp || '—' }}</dd></div>
          <div v-if="seleccion.clabe || seleccion.formaPago === 'transferencia'" class="sm:col-span-2">
            <dt class="text-[11px] text-text-soft">CLABE interbancaria</dt>
            <dd class="flex flex-wrap items-center gap-2 font-mono font-bold text-text">
              <span data-test="detalle-clabe">{{ verClabe ? (seleccion.clabe ? clabeConEspacios(seleccion.clabe) : '—') : clabeEnmascarada(seleccion.clabe) }}</span>
              <button v-if="verClabe && seleccion.clabe" type="button" :class="btnMini" data-test="copiar-clabe" @click="copiarClabe">Copiar CLABE</button>
              <span v-if="!verClabe" class="font-sans text-[11px] font-normal text-text-soft">La CLABE completa la ven Cuentas por pagar, Finanzas y Dirección.</span>
            </dd>
          </div>
          <div v-if="seleccion.notas" class="sm:col-span-2"><dt class="text-[11px] text-text-soft">Notas</dt><dd class="whitespace-pre-line text-text">{{ seleccion.notas }}</dd></div>
          <div><dt class="text-[11px] text-text-soft">Registrado</dt><dd class="text-text">{{ fechaHora(seleccion.createdAt) }}<span v-if="seleccion.creadoPor" class="text-text-muted"> · {{ seleccion.creadoPor }}</span></dd></div>
          <div><dt class="text-[11px] text-text-soft">Última modificación</dt><dd class="text-text">{{ fechaHora(seleccion.updatedAt) }}<span v-if="seleccion.actualizadoPor" class="text-text-muted"> · {{ seleccion.actualizadoPor }}</span></dd></div>
        </dl>

        <div v-if="ligadas.length" class="mt-4">
          <p class="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-soft">Compras con este proveedor ({{ ligadas.length }})</p>
          <ul class="m-0 flex list-none flex-wrap gap-1.5 p-0">
            <li v-for="r in ligadas.slice(0, 12)" :key="r.folio"><RouterLink :to="RUTAS_COMPRAS.requisicion(r.folio)" class="rounded-md border border-border bg-bg px-2 py-1 font-mono text-[11.5px] font-semibold text-vz-blue hover:underline">{{ r.folio }}</RouterLink></li>
          </ul>
        </div>

        <p v-if="errorAccion" role="alert" class="mt-3 text-[12.5px] font-semibold text-vz-danger">{{ errorAccion }}</p>
        <div class="mt-5 flex flex-wrap justify-end gap-2">
          <button v-if="puedeDarBaja && seleccion.activo" type="button" :class="btnDanger" data-test="dar-baja" @click="baja = true">Dar de baja</button>
          <button v-if="puedeDarBaja && !seleccion.activo" type="button" :class="btnOk" :disabled="ocupado" @click="reactivar">Reactivar</button>
          <button v-if="puedeEditar" type="button" :class="btnPrimary" data-test="editar-proveedor" @click="editando = true">Editar</button>
          <button type="button" :class="btn" @click="cerrar">Cerrar</button>
        </div>
      </template>
    </AppModal>

    <MotivoModal
      v-if="baja && seleccion"
      title="Dar de baja al proveedor"
      label="Motivo de la baja"
      descripcion="No se borra nada: el proveedor queda inactivo con tu motivo y ya no se puede elegir para compras nuevas. Se puede reactivar."
      confirm-label="Dar de baja"
      danger
      :accion="confirmarBaja"
      @close="baja = false"
    />
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppModal from 'components/AppModal.vue'
import { inputClass, selectClass } from 'components/formClasses'
import { TONE_STYLES } from 'components/statusMaps'
import MotivoModal from 'components/compras/MotivoModal.vue'
import ProveedorForm from 'components/compras/ProveedorForm.vue'
import { btn, btnDanger, btnMini, btnOk, btnPrimary, fechaHora } from 'components/compras/util'
import { useAuth } from 'src/lib/auth'
import { canCreateProveedor, canDisableProveedor, canEditProveedor, canViewClabe } from 'src/lib/access'
import { requisicionVisible } from 'src/lib/vistaRol'
import {
  DESTINO_PAGO_LABEL,
  FORMA_PAGO_LABEL,
  RUTAS_COMPRAS,
  TIPO_PROVEEDOR_LABEL,
  clabeConEspacios,
  clabeEnmascarada,
  darDeBajaProveedor,
  destinoDePago,
  listProveedores,
  listRequisiciones,
  reactivarProveedor,
} from 'src/lib/compras'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'

const toast = useToast()
const { user } = useAuth()
const role = computed(() => user.value?.role)
const puedeCrear = computed(() => !!role.value && canCreateProveedor(role.value))
const puedeEditar = computed(() => !!role.value && canEditProveedor(role.value))
const puedeDarBaja = computed(() => !!role.value && canDisableProveedor(role.value))
const verClabe = computed(() => !!role.value && canViewClabe(role.value))

const filtros = reactive({ texto: '', tipo: '', estado: 'activos' })
const total = computed(() => listProveedores().length)
const lista = computed(() =>
  listProveedores({
    texto: filtros.texto,
    tipo: filtros.tipo || undefined,
    activo: filtros.estado === 'activos' ? true : filtros.estado === 'baja' ? false : undefined,
  }),
)
function limpiar() {
  Object.assign(filtros, { texto: '', tipo: '', estado: 'activos' })
}

// ---- Detalle / edición ---------------------------------------------------------------------------------------------------
const alta = ref(false)
const seleccionId = ref('')
const seleccion = computed(() => listProveedores().find((p) => p.id === seleccionId.value))
const editando = ref(false)
const baja = ref(false)
const ocupado = ref(false)
const errorAccion = ref('')

function abrir(p) {
  errorAccion.value = ''
  editando.value = false
  seleccionId.value = p.id
}
function cerrar() {
  seleccionId.value = ''
  editando.value = false
}
const ligadas = computed(() => {
  const id = seleccionId.value
  if (!id || !role.value) return []
  return listRequisiciones().filter((r) => r.proveedorId === id && requisicionVisible(role.value, r, user.value?.displayName))
})

function alGuardarAlta(p) {
  alta.value = false
  toast(`Proveedor «${p.nombreComercial}» registrado en el catálogo.`)
  abrir(p)
}
function alGuardarEdicion() {
  editando.value = false
  toast('Cambios guardados.')
}

async function confirmarBaja(motivo) {
  await darDeBajaProveedor(seleccionId.value, motivo)
  bump()
  toast('Proveedor dado de baja.')
}
async function reactivar() {
  errorAccion.value = ''
  ocupado.value = true
  try {
    await reactivarProveedor(seleccionId.value)
    bump()
    toast('Proveedor reactivado.')
  } catch (e) {
    errorAccion.value = e instanceof Error && e.message ? e.message : 'No se pudo reactivar.'
  } finally {
    ocupado.value = false
  }
}
async function copiarClabe() {
  try {
    await navigator.clipboard.writeText(seleccion.value?.clabe ?? '')
    toast('CLABE copiada.')
  } catch {
    toast('No se pudo copiar; selecciónala manualmente.', 'error')
  }
}
</script>
