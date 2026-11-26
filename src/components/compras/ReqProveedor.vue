<template>
  <section v-if="mostrar" class="rounded-xl border border-border bg-surface p-4" aria-labelledby="prv-bloque-t" data-test="bloque-proveedor">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <h3 id="prv-bloque-t" class="text-[13px] font-bold text-text">Proveedor para la compra</h3>
        <p class="mt-0.5 text-[12px] text-text-muted">
          Se registra en el catálogo solo el proveedor <strong class="text-text">elegido</strong>. De su tipo y forma de pago sale a dónde va el pago: efectivo a
          <strong class="text-text">Tesorería</strong>; transferencia o tarjeta a <strong class="text-text">Cuentas por pagar</strong>.
        </p>
      </div>
      <span v-if="prov" :class="`rounded-full border px-2.5 py-1 text-[11.5px] font-bold ${motivo ? TONE_STYLES.warning : TONE_STYLES.success}`" data-test="estado-proveedor">{{ motivo ? 'Faltan datos' : 'Proveedor completo' }}</span>
    </div>

    <!-- Proveedor ligado -->
    <div v-if="prov && modo === 'ver'" class="mt-3 rounded-xl border border-border bg-bg p-3.5" data-test="proveedor-ligado">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-[14px] font-extrabold text-text">{{ prov.nombreComercial }}</p>
          <p class="text-[12px] text-text-muted">{{ prov.razonSocial || 'Sin razón social' }} · <span class="font-mono">{{ prov.rfc || 'sin RFC' }}</span></p>
        </div>
        <span :class="`rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE_STYLES.neutral}`">{{ TIPO_PROVEEDOR_LABEL[prov.tipo] }}</span>
      </div>
      <p class="mt-2 text-[12.5px] font-semibold text-text" data-test="destino-proveedor">
        <template v-if="destino === 'tesoreria'">Irá a Tesorería (efectivo).</template>
        <template v-else>Irá a Cuentas por pagar ({{ FORMA_PAGO_LABEL[forma].toLowerCase() }}).</template>
      </p>
      <!-- Forma de pago de la compra (puede diferir de la habitual del proveedor mientras no esté autorizada) -->
      <div v-if="editable && prov.tipo === 'factura'" class="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span class="font-semibold text-text">Pago de esta compra:</span>
        <button v-for="f in ['transferencia', 'tarjeta']" :key="f" type="button" :class="`rounded-full border px-3 py-1 font-bold ${forma === f ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-surface text-text-muted hover:bg-surface-hover'}`" :aria-pressed="forma === f" :disabled="guardando" @click="cambiarForma(f)">{{ FORMA_PAGO_LABEL[f] }}</button>
      </div>
      <p v-if="motivo" role="alert" class="mt-2.5 rounded-lg border border-vz-warning/40 bg-vz-warning/10 px-3 py-2 text-[12.5px] font-semibold text-vz-warning" data-test="motivo-proveedor">{{ motivo }}</p>
      <p v-if="errorAccion" role="alert" class="mt-2 text-[12.5px] font-semibold text-vz-danger">{{ errorAccion }}</p>
      <div v-if="editable" class="mt-3 flex flex-wrap gap-2">
        <button type="button" :class="btn" @click="modo = 'buscar'">Cambiar proveedor</button>
        <button v-if="motivo" type="button" :class="btn" data-test="corregir-proveedor" @click="modo = 'editar'">Completar datos del proveedor</button>
      </div>
      <p v-if="editable && motivo && !puedeFiscal" class="mt-2 text-[11.5px] text-text-soft">Quien compra no cambia razón social, RFC ni CLABE de un proveedor que ya existe: si faltan, pídelos a Cuentas por pagar o a Finanzas, o elige otro proveedor.</p>
    </div>

    <!-- Buscar en el catálogo -->
    <div v-else-if="editable && modo === 'buscar'" class="mt-3 flex flex-col gap-3">
      <AppField label="Buscar en el catálogo (nombre, razón social o RFC)">
        <input v-model="texto" type="search" :class="inputClass" placeholder="p. ej. nombre del proveedor ganador" autocomplete="off" data-test="buscar-proveedor" />
      </AppField>
      <p v-if="sugerido" class="text-[12px] text-text-muted">Precargado con el proveedor de la cotización ganadora: «{{ sugerido }}».</p>
      <ul v-if="resultados.length" class="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Proveedores del catálogo">
        <li v-for="r in resultados" :key="r.id" class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-[12.5px]">
          <div class="min-w-0 flex-1">
            <p class="truncate font-bold text-text">{{ r.nombreComercial }}</p>
            <p class="truncate text-[11.5px] text-text-muted">{{ r.razonSocial || 'Sin razón social' }} · {{ r.rfc || 'sin RFC' }} · {{ TIPO_PROVEEDOR_LABEL[r.tipo] }}</p>
          </div>
          <button type="button" :class="btnMini" :disabled="guardando" data-test="usar-proveedor" @click="usar(r)">Usar este</button>
        </li>
      </ul>
      <p v-else class="rounded-lg border border-dashed border-border px-3 py-3 text-center text-[12.5px] text-text-soft">
        {{ texto.trim() ? 'Ningún proveedor activo coincide.' : 'Escribe para buscar o registra el proveedor elegido.' }}
      </p>
      <p v-if="errorAccion" role="alert" class="text-[12.5px] font-semibold text-vz-danger">{{ errorAccion }}</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" :class="btnPrimary" data-test="nuevo-proveedor" @click="modo = 'nuevo'">+ Registrar proveedor nuevo</button>
        <button v-if="prov" type="button" :class="btn" @click="modo = 'ver'">Cancelar</button>
      </div>
    </div>

    <!-- Alta -->
    <div v-else-if="editable && modo === 'nuevo'" class="mt-3">
      <p class="mb-2 text-[12.5px] font-bold text-text">Registrar al proveedor elegido en el catálogo</p>
      <ProveedorForm :nombre-inicial="texto || sugerido" :forma-inicial="forma === 'tarjeta' ? 'tarjeta' : 'transferencia'" @guardado="usar" @usar="usar" @cancelar="modo = prov ? 'ver' : 'buscar'" />
    </div>

    <!-- Edición de un proveedor ya ligado (completar datos) -->
    <div v-else-if="editable && modo === 'editar' && prov" class="mt-3">
      <p class="mb-2 text-[12.5px] font-bold text-text">Completar datos de {{ prov.nombreComercial }}</p>
      <ProveedorForm :proveedor="prov" @guardado="alEditar" @cancelar="modo = 'ver'" />
    </div>

    <!-- Solo lectura sin proveedor (no debería pasar con las reglas actuales) -->
    <p v-else-if="!prov" class="mt-3 text-[12.5px] text-text-soft">Todavía no se registra el proveedor de esta compra.</p>
      <!-- Bloqueado: desde «en autorización» el proveedor y la forma de pago ya no cambian -->
    <p v-if="prov && puedeCotizar && !editable" class="mt-3 text-[11.5px] text-text-soft" data-test="proveedor-bloqueado">
      El proveedor y la forma de pago están bloqueados desde que la requisición entra a autorización (solo se cambian en «Recibida» o «En cotización»). Si hay un error, pide un ajuste a Finanzas para regresarla a cotización.
    </p>

</section>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppField from 'components/AppField.vue'
import { inputClass } from 'components/formClasses'
import { TONE_STYLES } from 'components/statusMaps'
import { canEditDatosFiscalesProveedor } from 'src/lib/access'
import {
  FORMA_PAGO_LABEL,
  TIPO_PROVEEDOR_LABEL,
  buscarProveedores,
  cotizacionElegida,
  destinoDePago,
  formaPagoCoherente,
  getProveedor,
  getRequisicion,
  motivoProveedorIncompleto,
  vincularProveedor,
} from 'src/lib/compras'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'
import ProveedorForm from './ProveedorForm.vue'
import { useAcceso } from './useAcceso'
import { btn, btnMini, btnPrimary } from './util'

/**
 * Bloque «Proveedor para la compra» de la pestaña Autorización. Adquisiciones elige o registra al proveedor ELEGIDO en el catálogo (precargado con el
 * de la cotización ganadora) antes de pedir la autorización; al guardar se ligan `proveedorId` y `formaPago` a la requisición y se muestra el destino del
 * pago. Los demás roles lo ven en solo lectura. Desde «autorizada» ya no cambia.
 */
const props = defineProps({ folio: { type: String, required: true } })
const toast = useToast()
const { puedeCotizar, role } = useAcceso()

const req = computed(() => getRequisicion(props.folio))
const prov = computed(() => getProveedor(req.value?.proveedorId))
const forma = computed(() => req.value?.formaPago ?? 'efectivo')
const destino = computed(() => destinoDePago(forma.value))
const editable = computed(() => puedeCotizar.value && (req.value?.estado === 'recibida' || req.value?.estado === 'en_cotizacion'))
const mostrar = computed(() => !!req.value && (editable.value || !!req.value.proveedorId))
const motivo = computed(() => (req.value ? motivoProveedorIncompleto(req.value) : null))
const puedeFiscal = computed(() => !!role.value && canEditDatosFiscalesProveedor(role.value))

/** Proveedor de la cotización ganadora (o el último elegido): precarga del buscador y del alta. */
const sugerido = computed(() => cotizacionElegida(props.folio)?.proveedor ?? req.value?.proveedorElegido ?? '')

const modo = ref(prov.value ? 'ver' : 'buscar')
const texto = ref(prov.value ? '' : sugerido.value)
const resultados = computed(() => buscarProveedores(texto.value).slice(0, 6))

const guardando = ref(false)
const errorAccion = ref('')

/** Liga el proveedor a la requisición (con su forma de pago habitual) y vuelve a la vista. */
async function usar(p) {
  errorAccion.value = ''
  guardando.value = true
  try {
    await vincularProveedor(props.folio, p.id)
    bump()
    modo.value = 'ver'
    toast(`Proveedor «${p.nombreComercial}» ligado a la compra: irá a ${destinoDePago(p.formaPago) === 'tesoreria' ? 'Tesorería' : 'Cuentas por pagar'}.`)
  } catch (e) {
    errorAccion.value = e instanceof Error && e.message ? e.message : 'No se pudo ligar el proveedor.'
  } finally {
    guardando.value = false
  }
}

async function cambiarForma(f) {
  if (!prov.value || f === forma.value) return
  errorAccion.value = ''
  guardando.value = true
  try {
    await vincularProveedor(props.folio, prov.value.id, f)
    bump()
  } catch (e) {
    errorAccion.value = e instanceof Error && e.message ? e.message : 'No se pudo cambiar la forma de pago.'
  } finally {
    guardando.value = false
  }
}

/** Tras completar los datos: si cambió el tipo y la forma de pago de la compra ya no corresponde, se alinea con la habitual del proveedor. */
async function alEditar(p) {
  try {
    if (!formaPagoCoherente(p.tipo, forma.value)) await vincularProveedor(props.folio, p.id)
  } catch (e) {
    errorAccion.value = e instanceof Error && e.message ? e.message : 'No se pudo actualizar la forma de pago de la compra.'
  }
  bump()
  modo.value = 'ver'
  toast('Datos del proveedor guardados.')
}
</script>
