<template>
  <AppModal :title="material ? 'Editar material' : 'Nuevo material'" wide @close="emit('close')">
    <p v-if="catalogoBloqueado" class="mb-3 rounded-lg border border-vz-warning/30 bg-vz-warning/10 px-3 py-2 text-[12px] font-semibold text-vz-warning">
      El catálogo y los costos de un material ya registrado solo cambian por Dirección o Adquisiciones. Aquí puedes ajustar ubicación y notas; las existencias se mueven con Entradas y Salidas.
    </p>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <AppField label="Familia / Clasificación">
        <select v-model="familia" :class="selectClass" :disabled="catalogoBloqueado">
          <option v-for="f in familias" :key="f.id" :value="f.id">{{ f.nombre }}</option>
        </select>
      </AppField>
      <AppField label="Nombre">
        <input v-model="nombre" :class="inputClass" :disabled="catalogoBloqueado" placeholder="p. ej. Taladro Bosch 1/2" />
      </AppField>
      <AppField label="Marca">
        <input v-model="marca" :class="inputClass" :disabled="catalogoBloqueado" placeholder="p. ej. Bosch" />
      </AppField>
      <div class="sm:col-span-2">
        <AppField :label="descripcionObligatoria ? '¿Qué es? Detalle del consumible (obligatorio)' : '¿Qué es? Detalle (qué es y para qué se usa)'">
          <textarea v-model="descripcion" :class="textareaClass" :placeholder="ejemploDescripcion" />
        </AppField>
        <p class="mt-1 text-[11px] text-text-soft">Escribe qué es, su presentación o especificación y para qué se usa, para que cualquiera lo identifique sin preguntar.</p>
      </div>
      <AppField label="Unidad de medida">
        <input v-model="unidadMedida" :class="inputClass" :disabled="catalogoBloqueado" placeholder="pieza, caja, litro…" />
      </AppField>
      <AppField :label="material ? 'Cantidad actual' : 'Cantidad inicial'">
        <input v-model="cantidadActual" type="number" min="0" :class="inputClass" :disabled="!!material" />
      </AppField>
      <AppField label="Mínimo (alerta de reposición)">
        <input v-model="minimo" type="number" min="0" :class="inputClass" :disabled="catalogoBloqueado" />
      </AppField>
      <AppField label="Máximo (opcional)">
        <input v-model="maximo" type="number" min="0" :class="inputClass" :disabled="catalogoBloqueado" />
      </AppField>
      <AppField label="Costo unitario (MXN)">
        <input v-model="costoUnitario" type="number" min="0" step="0.01" :class="inputClass" :disabled="catalogoBloqueado" />
      </AppField>
      <AppField label="Garantía (meses)">
        <input v-model="garantiaMeses" type="number" min="0" :class="inputClass" :disabled="catalogoBloqueado" />
      </AppField>
      <AppField label="Ubicación">
        <select v-model="ubicacionId" :class="selectClass">
          <option value="">— Selecciona —</option>
          <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
        </select>
      </AppField>
      <template v-if="!material && Number(cantidadActual) > 0">
        <AppField label="Proveedor">
          <input v-model="proveedorInicial" :class="inputClass" />
        </AppField>
        <AppField label="Factura u orden de compra">
          <input v-model="facturaInicial" :class="inputClass" />
        </AppField>
      </template>
    </div>

    <p v-if="!material" class="mt-2 text-[11px] text-text-soft">La cantidad inicial se registra como una entrada (queda en el Reporte de altas con quién la dio de alta). Tornillos, consumibles y refacciones van por cantidad aquí; solo la herramienta y el equipo de valor se registran pieza por pieza.</p>
    <p v-if="material" class="mt-2 text-[11px] text-text-soft">La cantidad actual solo se ajusta con Entradas/Salidas, para conservar el historial.</p>

    <div class="mt-3">
      <AppField label="Notas">
        <textarea v-model="notas" :class="textareaClass" />
      </AppField>
    </div>

    <div class="mt-5 flex justify-end gap-2">
      <button type="button" class="h-9 rounded-lg border border-border bg-bg px-3 text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">Cancelar</button>
      <button type="button" :disabled="saving" class="h-9 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white hover:bg-primary-hover disabled:opacity-60" @click="handleSubmit">
        {{ saving ? 'Guardando…' : 'Guardar' }}
      </button>
    </div>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { inputClass, selectClass, textareaClass } from 'components/formClasses'
import { listFamilias, listUbicaciones } from 'src/lib/inventario/comunes'
import { addMaterial, updateMaterial, registrarEntrada } from 'src/lib/inventario/mantenimiento'
import { useAuth } from 'src/lib/auth'
import { canEditCompra } from 'src/lib/access'
import { todayLocalDateString } from 'src/lib/dateUtils'
import { useToast } from 'src/composables/useToast'

const props = defineProps({ familiaId: { type: String, required: true }, material: Object })
const emit = defineEmits(['close', 'saved'])

const toast = useToast()
const { user } = useAuth()
const m = props.material
// Candado: el catálogo/costos de un material existente solo los edita Dirección/Adquisiciones.
const catalogoBloqueado = computed(() => !!m && !(user.value && canEditCompra(user.value.role)))
const proveedorInicial = ref('')
const facturaInicial = ref('')
const familia = ref(m?.familiaId ?? props.familiaId)
const nombre = ref(m?.nombre ?? '')
const marca = ref(m?.marca ?? '')
const unidadMedida = ref(m?.unidadMedida ?? 'pieza')
const cantidadActual = ref(m?.cantidadActual?.toString() ?? '0')
const minimo = ref(m?.minimo?.toString() ?? '0')
const maximo = ref(m?.maximo?.toString() ?? '')
const costoUnitario = ref(m?.costoUnitario?.toString() ?? '0')
const garantiaMeses = ref(m?.garantiaMeses?.toString() ?? '')
const ubicacionId = ref(m?.ubicacionId ?? '')
const notas = ref(m?.notas ?? '')
const descripcion = ref(m?.descripcion ?? '')
// En consumibles el detalle es obligatorio: sin él no se sabe qué se compra ni se puede detectar un uso anormal.
const descripcionObligatoria = computed(() => familia.value === 'fam-consumible')
const ejemploDescripcion = computed(() =>
  familia.value === 'fam-consumible'
    ? 'p. ej. Desengrasante industrial para cocina, garrafa de 20 L; se diluye 1:10 para pisos'
    : familia.value === 'fam-refaccion'
      ? 'p. ej. Chapa de seguridad de sobreponer para puerta de bodega, 3 llaves'
      : 'p. ej. Cinta aislante negra 19 mm x 18 m, uso eléctrico',
)
const saving = ref(false)

const familias = computed(() => listFamilias('mantenimiento'))
const ubicaciones = computed(() => listUbicaciones())

async function handleSubmit() {
  if (!nombre.value.trim()) {
    toast('El nombre es obligatorio.', 'error')
    return
  }
  if (descripcionObligatoria.value && !descripcion.value.trim()) {
    toast('Describe qué es el consumible (qué es, presentación y para qué se usa).', 'error')
    return
  }
  saving.value = true
  try {
    if (props.material && catalogoBloqueado.value) {
      await updateMaterial(props.material.id, { ubicacionId: ubicacionId.value || undefined, notas: notas.value || undefined, descripcion: descripcion.value.trim() })
      toast('Material actualizado.')
      emit('saved')
      emit('close')
      return
    }
    const payload = {
      familiaId: familia.value,
      nombre: nombre.value.trim(),
      marca: marca.value || undefined,
      descripcion: descripcion.value.trim() || undefined,
      unidadMedida: unidadMedida.value.trim() || 'pieza',
      cantidadActual: Number(cantidadActual.value) || 0,
      minimo: Number(minimo.value) || 0,
      maximo: maximo.value ? Number(maximo.value) : undefined,
      costoUnitario: Number(costoUnitario.value) || 0,
      garantiaMeses: garantiaMeses.value ? Number(garantiaMeses.value) : undefined,
      ubicacionId: ubicacionId.value || undefined,
      notas: notas.value || undefined,
    }
    if (props.material) {
      await updateMaterial(props.material.id, payload)
      toast('Material actualizado.')
    } else {
      const inicial = payload.cantidadActual
      const creado = await addMaterial({ ...payload, cantidadActual: 0 })
      // La existencia inicial entra como una ENTRADA: deja evidencia (quién, cuándo, proveedor, factura) para conciliar con Finanzas.
      if (inicial > 0) {
        await registrarEntrada({
          materialId: creado.id,
          fecha: todayLocalDateString(),
          cantidad: inicial,
          costoUnitario: payload.costoUnitario || undefined,
          proveedor: proveedorInicial.value.trim() || undefined,
          numeroFactura: facturaInicial.value.trim() || undefined,
          quienRecibio: user.value?.displayName,
        })
      }
      toast('Material dado de alta.')
    }
    emit('saved')
    emit('close')
  } catch {
    toast('No se pudo guardar el material.', 'error')
  } finally {
    saving.value = false
  }
}
</script>
