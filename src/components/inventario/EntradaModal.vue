<template>
  <AppModal :title="`Registrar entrada · ${material.nombre}`" @close="emit('close')">
    <div class="grid grid-cols-2 gap-3">
      <AppField label="Fecha">
        <input v-model="fecha" type="date" :class="inputClass" />
      </AppField>
      <AppField label="Cantidad">
        <input v-model="cantidad" type="number" min="1" :class="inputClass" />
      </AppField>
      <AppField label="Costo unitario (MXN)">
        <input v-model="costoUnitario" type="number" min="0" step="0.01" :class="inputClass" />
      </AppField>
      <AppField label="Proveedor">
        <select v-model="proveedorId" :class="selectClass">
          <option value="">— Selecciona —</option>
          <option v-for="p in proveedores" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          <option :value="NUEVO_PROVEEDOR">+ Nuevo proveedor…</option>
        </select>
      </AppField>
      <AppField v-if="proveedorId === NUEVO_PROVEEDOR" label="Nombre del proveedor nuevo">
        <input v-model="proveedorNuevoNombre" :class="inputClass" />
      </AppField>
      <AppField label="Factura u orden de compra">
        <input v-model="numeroFactura" :class="inputClass" placeholder="Folio de factura u OC" />
      </AppField>
      <AppField label="Factura (PDF, opcional)">
        <input type="file" accept="application/pdf" :class="inputClass" @change="onFactura" />
      </AppField>
    </div>
    <div class="mt-5 flex justify-end gap-2">
      <button type="button" class="h-9 rounded-lg border border-border bg-bg px-3 text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">Cancelar</button>
      <button type="button" :disabled="saving || uploading" class="h-9 rounded-lg bg-vz-success px-4 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60" @click="handleSubmit">
        {{ saving ? 'Guardando…' : 'Registrar entrada' }}
      </button>
    </div>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { inputClass, selectClass } from 'components/formClasses'
import { registrarEntrada } from 'src/lib/inventario/mantenimiento'
import { uploadFactura } from 'src/lib/inventario/storage'
import { listProveedores, addProveedor } from 'src/lib/inventario/proveedores'
import { todayLocalDateString } from 'src/lib/dateUtils'
import { useToast } from 'src/composables/useToast'

const NUEVO_PROVEEDOR = '__nuevo__'

/** `ocultarCostoActual`: roles de inventario sin dinero no ven el costo vigente del material (el campo arranca vacío; vacío = no cambia el costo). */
const props = defineProps({ material: { type: Object, required: true }, quienRecibio: String, ocultarCostoActual: Boolean })
const emit = defineEmits(['close', 'saved'])

const toast = useToast()
const fecha = ref(todayLocalDateString())
const cantidad = ref('1')
const costoUnitario = ref(props.ocultarCostoActual ? '' : props.material.costoUnitario.toString())
const proveedorId = ref('')
const proveedorNuevoNombre = ref('')
const facturaUrl = ref('')
const numeroFactura = ref('')
const saving = ref(false)
const uploading = ref(false)

const proveedores = computed(() => listProveedores())

async function handleFactura(file) {
  uploading.value = true
  try {
    facturaUrl.value = await uploadFactura(props.material.id, file)
  } catch {
    toast('No se pudo subir la factura.', 'error')
  } finally {
    uploading.value = false
  }
}

function onFactura(e) {
  const file = e.target.files?.[0]
  if (file) void handleFactura(file)
}

async function handleSubmit() {
  const cant = Number(cantidad.value)
  if (!cant || cant <= 0) {
    toast('La cantidad debe ser mayor a cero.', 'error')
    return
  }
  saving.value = true
  try {
    let finalProveedorId = proveedorId.value
    let proveedorNombre
    if (proveedorId.value === NUEVO_PROVEEDOR) {
      if (!proveedorNuevoNombre.value.trim()) {
        toast('Escribe el nombre del proveedor nuevo.', 'error')
        saving.value = false
        return
      }
      const nuevo = await addProveedor({ nombre: proveedorNuevoNombre.value.trim() })
      finalProveedorId = nuevo.id
      proveedorNombre = nuevo.nombre
    } else if (proveedorId.value) {
      proveedorNombre = proveedores.value.find((p) => p.id === proveedorId.value)?.nombre
    }

    await registrarEntrada({
      materialId: props.material.id,
      fecha: fecha.value,
      cantidad: cant,
      costoUnitario: Number(costoUnitario.value) || undefined,
      proveedor: proveedorNombre,
      proveedorId: finalProveedorId || undefined,
      numeroFactura: numeroFactura.value.trim() || undefined,
      facturaUrl: facturaUrl.value || undefined,
      quienRecibio: props.quienRecibio,
    })
    toast(`Entrada registrada: +${cant} ${props.material.unidadMedida}.`)
    emit('saved')
    emit('close')
  } catch {
    toast('No se pudo registrar la entrada.', 'error')
  } finally {
    saving.value = false
  }
}
</script>
