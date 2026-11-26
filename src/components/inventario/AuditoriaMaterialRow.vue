<template>
  <div v-if="material" class="border-b border-border py-2.5 text-[12.5px] last:border-0">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate font-bold text-text">{{ material.nombre }}</p>
        <p class="text-text-muted">
          <template v-if="mostrarEsperado">Esperado: {{ item.cantidadEsperada }} {{ material.unidadMedida }}</template>
          <template v-else>Unidad: {{ material.unidadMedida }}</template>
        </p>
        <p v-if="item.verificadoPor && item.fechaVerificado" class="text-[11px] text-text-soft">
          Contó {{ item.verificadoPor }} · {{ new Date(item.fechaVerificado).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) }}
        </p>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <StatusPill v-if="item.reconteo" label="Reconteo pedido" tone="warning" />
        <StatusPill
          v-if="item.cantidadContada != null"
          :label="mostrarEsperado ? `Contado: ${item.cantidadContada} (${diferencia > 0 ? '+' : ''}${diferencia})` : `Contado: ${item.cantidadContada}`"
          :tone="item.cantidadContada === item.cantidadEsperada ? 'success' : 'warning'"
        />
        <StatusPill v-else label="Sin contar" tone="neutral" />
        <StatusPill v-if="item.resolucion" :label="item.resolucion" tone="info" />
        <template v-if="editor">
          <input
            v-model="valor"
            type="number"
            min="0"
            class="h-8 w-24 rounded-lg border border-border bg-bg px-2 text-[12px] text-text outline-none focus:ring-2 focus:ring-vz-blue/30"
          />
          <button
            type="button"
            :disabled="saving"
            class="h-8 rounded-lg bg-vz-blue px-3 text-[11.5px] font-bold text-white hover:bg-primary-hover disabled:opacity-60"
            @click="guardar()"
          >
            Guardar
          </button>
        </template>
      </div>
    </div>

    <p v-if="item.reconteo && item.notaReconteo" class="mt-1.5 rounded-lg border border-vz-warning/30 bg-vz-warning/10 px-2.5 py-1.5 text-vz-warning">
      Motivo del reconteo: {{ item.notaReconteo }}
    </p>
    <p v-if="item.notas && !editor" class="mt-1.5 rounded-lg bg-bg px-2.5 py-1.5 text-text-muted"><span class="font-semibold text-text">Nota:</span> {{ item.notas }}</p>
    <img
      v-if="item.fotoUrl"
      :src="item.fotoUrl"
      alt="Evidencia de la auditoría"
      :class="`mt-1.5 cursor-zoom-in rounded-lg border border-border object-cover ${ampliada ? 'max-h-96 w-full object-contain' : 'h-16 w-16'}`"
      @click="ampliada = !ampliada"
    />

    <div v-if="editor && item.cantidadContada != null" class="mt-2 flex flex-col gap-1.5">
      <input v-model="nota" maxlength="1000" placeholder="Nota (opcional)" :class="inputClass" @change="guardar()" />
      <div class="flex items-center gap-2">
        <label class="flex h-8 cursor-pointer items-center rounded-lg border border-border bg-bg px-2.5 text-[11.5px] font-bold text-text-muted hover:bg-surface-hover">
          {{ item.fotoUrl ? 'Cambiar foto' : 'Agregar foto' }}
          <input type="file" accept="image/*" capture="environment" class="hidden" @change="alElegirFoto" />
        </label>
        <button v-if="item.fotoUrl" type="button" class="text-[11.5px] font-semibold text-vz-danger" @click="guardar('')">Quitar foto</button>
      </div>
    </div>

    <div v-if="verificador && item.cantidadContada != null && !item.reconteo" class="mt-2">
      <button v-if="!pidiendo" type="button" class="text-[11.5px] font-bold text-vz-warning hover:underline" @click="pidiendo = true">Pedir reconteo</button>
      <div v-else class="flex flex-wrap items-center gap-2">
        <input v-model="motivo" maxlength="300" placeholder="Motivo (opcional): ¿qué debe revisar?" :class="`${inputClass} flex-1`" />
        <button type="button" :disabled="saving" class="h-9 rounded-lg bg-vz-warning px-3 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-60" @click="pedir">Pedir</button>
        <button type="button" class="h-9 rounded-lg border border-border bg-bg px-3 text-[12px] font-bold text-text-muted" @click="pidiendo = false">Cancelar</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import StatusPill from 'components/StatusPill.vue'
import { inputClass } from 'components/formClasses'
import { useAuth } from 'src/lib/auth'
import { useToast } from 'src/composables/useToast'
import { getMaterial } from 'src/lib/inventario/mantenimiento'
import { comprimirFoto } from 'src/lib/inventario/fotoComprimida'
import { marcarMaterialItem, pedirReconteo } from 'src/lib/inventario/auditorias'

/**
 * `editor`: cuenta dentro de la app (modalidad interna, en conteo): conteo a ciegas, no se muestra lo esperado.
 * `verificador`: puede pedir reconteo (ve lo esperado vs. lo contado).
 */
const props = defineProps({ item: { type: Object, required: true }, editor: Boolean, verificador: Boolean })
const emit = defineEmits(['changed'])

const { user } = useAuth()
const toast = useToast()
const material = computed(() => (props.item.materialId ? getMaterial(props.item.materialId) : undefined))
const mostrarEsperado = computed(() => !props.editor)
const diferencia = computed(() => (props.item.cantidadContada ?? 0) - (props.item.cantidadEsperada ?? 0))
// v-model sobre input type=number entrega number (o '' si está vacío)
const valor = ref(props.item.cantidadContada?.toString() ?? '')
const nota = ref(props.item.notas ?? '')
const saving = ref(false)
const ampliada = ref(false)
const pidiendo = ref(false)
const motivo = ref('')

/** `foto`: undefined = sin cambio, '' = quitar, data URL = reemplazar. */
async function guardar(foto) {
  if (valor.value === '' || valor.value == null) {
    toast('Escribe la cantidad contada.', 'error')
    return
  }
  saving.value = true
  try {
    await marcarMaterialItem(props.item.id, Number(valor.value), nota.value.trim() || undefined, user.value?.displayName, foto)
    emit('changed')
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
  } finally {
    saving.value = false
  }
}

async function alElegirFoto(ev) {
  const input = ev.target
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    await guardar(await comprimirFoto(file))
  } catch {
    toast('No se pudo procesar la foto.', 'error')
  }
}

async function pedir() {
  saving.value = true
  try {
    await pedirReconteo(props.item.id, motivo.value)
    pidiendo.value = false
    motivo.value = ''
    emit('changed')
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo pedir el reconteo.', 'error')
  } finally {
    saving.value = false
  }
}
</script>
