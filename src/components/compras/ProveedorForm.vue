<template>
  <form class="flex flex-col gap-3" novalidate @submit.prevent="guardar">
    <!-- Reutilizar en lugar de duplicar -->
    <div v-if="!esEdicion && dup.porRfc" role="alert" class="rounded-lg border border-vz-warning/40 bg-vz-warning/10 px-3 py-2 text-[12.5px] text-text" data-test="dup-rfc">
      <p class="font-bold">Ya existe un proveedor con ese RFC: {{ dup.porRfc.nombreComercial }}{{ dup.porRfc.activo ? '' : ' (dado de baja)' }}.</p>
      <p class="mt-0.5 text-text-muted">No se duplica: usa el que ya está en el catálogo.</p>
      <button v-if="dup.porRfc.activo" type="button" :class="`${btnMini} mt-1.5`" @click="emit('usar', dup.porRfc)">Usar «{{ dup.porRfc.nombreComercial }}»</button>
    </div>
    <div v-else-if="!esEdicion && dup.porNombre.length" class="rounded-lg border border-vz-warning/40 bg-vz-warning/10 px-3 py-2 text-[12.5px] text-text" data-test="dup-nombre">
      <p class="font-bold">¿Es alguno de estos proveedores del catálogo?</p>
      <ul class="m-0 mt-1 flex list-none flex-col gap-1 p-0">
        <li v-for="p in dup.porNombre" :key="p.id" class="flex flex-wrap items-center gap-2">
          <span class="font-semibold">{{ p.nombreComercial }}</span><span class="text-text-muted">{{ p.rfc || 'sin RFC' }}{{ p.activo ? '' : ' · dado de baja' }}</span>
          <button v-if="p.activo" type="button" :class="btnMini" @click="emit('usar', p)">Usar este</button>
        </li>
      </ul>
    </div>

    <!-- Restricción de separación de funciones -->
    <p v-if="restringido" class="rounded-lg border border-vz-blue/30 bg-vz-blue/8 px-3 py-2 text-[12.5px] text-text-muted" data-test="aviso-restringido">
      <span class="font-bold text-text">Quien compra no cambia datos fiscales ni bancarios de un proveedor que ya existe.</span>
      Tipo, forma de pago, razón social, RFC y CLABE están bloqueados: si hay un error, lo corrige Cuentas por pagar o Finanzas. Aquí puedes editar el nombre comercial, la dirección fiscal, el CP y las notas.
    </p>

    <!-- Tipo y forma de pago -->
    <fieldset class="m-0 border-0 p-0" :disabled="restringido">
      <legend class="mb-1.5 text-[12.5px] font-semibold text-text">Tipo de proveedor *</legend>
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de proveedor">
        <label v-for="t in TIPOS" :key="t.id" :class="opcion(draft.tipo === t.id)">
          <input v-model="draft.tipo" type="radio" name="prv-tipo" :value="t.id" class="sr-only" @change="cambiaTipo" />
          <span class="font-bold">{{ t.label }}</span>
          <span class="text-[11px] text-text-soft">{{ t.ayuda }}</span>
        </label>
      </div>
      <div v-if="draft.tipo === 'factura'" class="mt-2.5">
        <p class="mb-1.5 text-[12.5px] font-semibold text-text">Pago *</p>
        <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Forma de pago">
          <label v-for="f in FORMAS" :key="f.id" :class="opcion(draft.formaPago === f.id)">
            <input v-model="draft.formaPago" type="radio" name="prv-pago" :value="f.id" class="sr-only" />
            <span class="font-bold">{{ f.label }}</span>
            <span class="text-[11px] text-text-soft">{{ f.ayuda }}</span>
          </label>
        </div>
      </div>
      <p v-if="verError('tipo') || verError('formaPago')" role="alert" class="mt-1 text-[12px] font-semibold text-vz-danger">{{ errs.tipo || errs.formaPago }}</p>
    </fieldset>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <AppField label="Nombre comercial *" class="sm:col-span-2">
        <input v-model="draft.nombreComercial" :class="inputClass" maxlength="255" autocomplete="off" data-test="prv-nombre" @blur="tocar('nombreComercial')" />
        <p v-if="verError('nombreComercial')" role="alert" class="text-[12px] font-semibold text-vz-danger">{{ errs.nombreComercial }}</p>
      </AppField>
      <AppField :label="`Razón social${req('razonSocial') ? ' *' : ''}`" class="sm:col-span-2">
        <input v-model="draft.razonSocial" :class="inputClass" maxlength="255" autocomplete="off" :disabled="restringido" data-test="prv-razon" @blur="tocar('razonSocial')" />
        <p v-if="verError('razonSocial')" role="alert" class="text-[12px] font-semibold text-vz-danger">{{ errs.razonSocial }}</p>
      </AppField>
      <AppField :label="`RFC${req('rfc') ? ' *' : ' (opcional)'}`">
        <input v-model="draft.rfc" :class="`${inputClass} font-mono uppercase placeholder:normal-case`" maxlength="13" autocomplete="off" autocapitalize="characters" :disabled="restringido" placeholder="12 o 13 caracteres" data-test="prv-rfc" @blur="tocar('rfc')" />
        <p v-if="verError('rfc')" role="alert" class="text-[12px] font-semibold text-vz-danger" data-test="err-rfc">{{ errs.rfc }}</p>
        <p v-else-if="rfcOk" class="text-[12px] font-semibold text-vz-success">RFC con formato válido.</p>
      </AppField>
      <AppField :label="`Código postal${req('cp') ? ' *' : ' (opcional)'}`">
        <input v-model="draft.cp" :class="inputClass" maxlength="5" inputmode="numeric" autocomplete="off" placeholder="5 dígitos" data-test="prv-cp" @blur="tocar('cp')" />
        <p v-if="verError('cp')" role="alert" class="text-[12px] font-semibold text-vz-danger" data-test="err-cp">{{ errs.cp }}</p>
      </AppField>
      <AppField :label="`Dirección fiscal${req('direccionFiscal') ? ' *' : ' (opcional)'}`" class="sm:col-span-2">
        <input v-model="draft.direccionFiscal" :class="inputClass" maxlength="500" autocomplete="off" data-test="prv-direccion" @blur="tocar('direccionFiscal')" />
        <p v-if="verError('direccionFiscal')" role="alert" class="text-[12px] font-semibold text-vz-danger">{{ errs.direccionFiscal }}</p>
      </AppField>
      <AppField v-if="mostrarClabe" :label="`CLABE interbancaria${req('clabe') ? ' *' : ' (opcional)'}`" class="sm:col-span-2">
        <input v-model="draft.clabe" :class="`${inputClass} font-mono`" maxlength="22" inputmode="numeric" autocomplete="off" :disabled="restringido" :placeholder="restringido && !verClabe ? clabeEnmascarada(proveedor?.clabe) : '18 dígitos'" data-test="prv-clabe" @blur="tocar('clabe')" />
        <p v-if="verError('clabe')" role="alert" class="text-[12px] font-semibold text-vz-danger" data-test="err-clabe">{{ errs.clabe }}</p>
        <p v-else-if="clabeOk" class="text-[12px] font-semibold text-vz-success">CLABE válida (dígito verificador correcto).</p>
      </AppField>
      <AppField label="Notas (opcional)" class="sm:col-span-2">
        <input v-model="draft.notas" :class="inputClass" maxlength="500" autocomplete="off" />
      </AppField>
    </div>

    <p v-if="error" role="alert" class="rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger" data-test="prv-error">{{ error }}</p>
    <div class="flex flex-wrap justify-end gap-2">
      <button type="button" :class="btn" :disabled="guardando" @click="emit('cancelar')">Cancelar</button>
      <button type="submit" :class="btnPrimary" :disabled="guardando || (!esEdicion && !!dup.porRfc)" data-test="prv-guardar">{{ guardando ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Registrar proveedor' }}</button>
    </div>
  </form>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import AppField from 'components/AppField.vue'
import { inputClass } from 'components/formClasses'
import { useAuth } from 'src/lib/auth'
import { canEditDatosFiscalesProveedor, canViewClabe } from 'src/lib/access'
import {
  actualizarProveedor,
  buscarDuplicados,
  clabeEnmascarada,
  clabeValida,
  crearProveedor,
  erroresProveedor,
  normalizarClabe,
  normalizarRfc,
  rfcValido,
} from 'src/lib/compras'
import { bump } from 'src/lib/reactive'
import { btn, btnMini, btnPrimary } from './util'

/**
 * Formulario de alta / edición de un proveedor del catálogo, con validación en vivo (RFC, CLABE con dígito verificador, CP) y obligatoriedad según el
 * tipo (remisión = solo el nombre; factura = razón social, RFC, dirección fiscal, CP y, con transferencia, CLABE). Antes de crear avisa si ya existe
 * un proveedor con ese RFC o nombre para REUTILIZARLO (`usar`). Si el usuario es de Adquisiciones y el proveedor ya existe, los datos fiscales y
 * bancarios quedan bloqueados (separación de funciones).
 */
const props = defineProps({
  /** Proveedor existente (edición); sin él es un alta. */
  proveedor: { type: Object, default: null },
  nombreInicial: { type: String, default: '' },
  /** Forma de pago sugerida para un alta con factura. */
  formaInicial: { type: String, default: 'transferencia' },
})
const emit = defineEmits(['guardado', 'cancelar', 'usar'])

const { user } = useAuth()
const esEdicion = computed(() => !!props.proveedor)
const verClabe = computed(() => !!user.value && canViewClabe(user.value.role))
/** Adquisiciones editando un proveedor existente: sin datos fiscales ni bancarios. */
const restringido = computed(() => esEdicion.value && !!user.value && !canEditDatosFiscalesProveedor(user.value.role))

const TIPOS = [
  { id: 'remision', label: 'Remisión (efectivo)', ayuda: 'Solo el nombre es obligatorio; se paga en efectivo.' },
  { id: 'factura', label: 'Factura', ayuda: 'Pide razón social, RFC, dirección y CP.' },
]
const FORMAS = [
  { id: 'transferencia', label: 'Transferencia', ayuda: 'Pide CLABE.' },
  { id: 'tarjeta', label: 'Tarjeta', ayuda: 'Sin CLABE.' },
]

const p = props.proveedor
const draft = reactive({
  tipo: p?.tipo ?? 'factura',
  formaPago: p?.formaPago ?? (props.formaInicial === 'tarjeta' ? 'tarjeta' : 'transferencia'),
  nombreComercial: p?.nombreComercial ?? props.nombreInicial,
  razonSocial: p?.razonSocial ?? '',
  rfc: p?.rfc ?? '',
  clabe: restringidoInicial() ? '' : (p?.clabe ?? ''),
  direccionFiscal: p?.direccionFiscal ?? '',
  cp: p?.cp ?? '',
  notas: p?.notas ?? '',
})
function restringidoInicial() {
  return !!props.proveedor && !!user.value && !canEditDatosFiscalesProveedor(user.value.role)
}

/** Con remisión la forma de pago es siempre efectivo. */
const forma = computed(() => (draft.tipo === 'remision' ? 'efectivo' : draft.formaPago))
function cambiaTipo() {
  if (draft.tipo === 'factura' && draft.formaPago === 'efectivo') draft.formaPago = 'transferencia'
}

/** Datos con los que se valida: en modo restringido, la razón social, RFC y CLABE son los GUARDADOS (no se editan). */
const datos = computed(() => ({ ...draft, formaPago: forma.value, ...(restringido.value ? { razonSocial: props.proveedor.razonSocial, rfc: props.proveedor.rfc, clabe: props.proveedor.clabe, tipo: props.proveedor.tipo, formaPago: props.proveedor.formaPago } : {}) }))
const errs = computed(() => {
  const e = erroresProveedor(datos.value)
  // Adquisiciones solo edita nombre, dirección y CP de un proveedor existente: no se le reclaman datos que no puede cambiar.
  return restringido.value ? Object.fromEntries(Object.entries(e).filter(([k]) => ['nombreComercial', 'direccionFiscal', 'cp'].includes(k))) : e
})
/** ¿El campo es obligatorio con el tipo y la forma de pago elegidos? (para el asterisco). */
function req(campo) {
  const t = erroresProveedor({ ...datos.value, razonSocial: '', rfc: '', direccionFiscal: '', cp: '', clabe: '' })
  return !!t[campo]
}
const mostrarClabe = computed(() => (draft.tipo === 'factura' && draft.formaPago === 'transferencia') || draft.tipo === 'remision' || !!draft.clabe || (restringido.value && !!props.proveedor?.clabe))
const rfcOk = computed(() => !!draft.rfc.trim() && rfcValido(draft.rfc))
const clabeOk = computed(() => !!normalizarClabe(draft.clabe) && clabeValida(draft.clabe))

// Los errores se muestran al salir del campo, o de inmediato si ya hay un texto con mal formato; al intentar guardar, todos.
const tocado = reactive({})
const intento = ref(false)
function tocar(c) {
  tocado[c] = true
}
const FORMATO = ['rfc', 'cp', 'clabe']
function verError(c) {
  if (!errs.value[c]) return false
  if (intento.value || tocado[c]) return true
  return FORMATO.includes(c) && !!String(draft[c] ?? '').trim() && String(draft[c]).trim().length >= (c === 'rfc' ? 12 : c === 'cp' ? 5 : 18)
}

const dup = computed(() => (esEdicion.value ? { porRfc: undefined, porNombre: [] } : buscarDuplicados({ nombreComercial: draft.nombreComercial, rfc: normalizarRfc(draft.rfc) })))

const opcion = (on) =>
  `flex min-w-[150px] flex-1 cursor-pointer flex-col gap-0.5 rounded-xl border-2 px-3 py-2 text-[13px] text-text focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-vz-blue ${on ? 'border-vz-blue bg-vz-blue/8' : 'border-border bg-bg hover:bg-surface-hover'} ${restringido.value ? 'cursor-not-allowed opacity-60' : ''}`

const error = ref('')
const guardando = ref(false)
async function guardar() {
  intento.value = true
  error.value = ''
  const e = errs.value
  if (Object.keys(e).length) {
    error.value = Object.values(e)[0]
    return
  }
  guardando.value = true
  try {
    let resultado
    if (props.proveedor) {
      const patch = restringido.value
        ? { nombreComercial: draft.nombreComercial, direccionFiscal: draft.direccionFiscal, cp: draft.cp, notas: draft.notas }
        : { ...draft, formaPago: forma.value }
      resultado = await actualizarProveedor(props.proveedor.id, patch)
    } else {
      resultado = await crearProveedor({ ...draft, formaPago: forma.value })
    }
    bump()
    emit('guardado', resultado)
  } catch (err) {
    error.value = err instanceof Error && err.message ? err.message : 'No se pudo guardar el proveedor.'
  } finally {
    guardando.value = false
  }
}
</script>
