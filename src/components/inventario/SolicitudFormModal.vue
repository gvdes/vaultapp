<template>
  <AppModal title="Nueva solicitud" @close="emit('close')">
    <div class="mb-3 flex gap-2">
      <button
        type="button"
        :class="`h-9 flex-1 rounded-lg border text-[13px] font-bold transition-colors ${tipo === 'sistemas' ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-bg text-text-muted'}`"
        @click="handleTipo('sistemas')"
      >
        Equipo de Sistemas
      </button>
      <button
        type="button"
        :class="`h-9 flex-1 rounded-lg border text-[13px] font-bold transition-colors ${tipo === 'mantenimiento' ? 'border-vz-gold bg-vz-gold/10 text-vz-gold' : 'border-border bg-bg text-text-muted'}`"
        @click="handleTipo('mantenimiento')"
      >
        Material de Mantenimiento
      </button>
    </div>

    <div v-if="tipo === 'sistemas'" class="mb-3 flex gap-2">
      <button
        type="button"
        :class="`h-8 flex-1 rounded-lg border text-[12px] font-bold ${subtipo === 'equipo_nuevo' ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-bg text-text-muted'}`"
        @click="subtipo = 'equipo_nuevo'"
      >
        Equipo nuevo
      </button>
      <button
        type="button"
        :class="`h-8 flex-1 rounded-lg border text-[12px] font-bold ${subtipo === 'reparacion' ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-bg text-text-muted'}`"
        @click="subtipo = 'reparacion'"
      >
        Reparación
      </button>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <AppField :label="tipo === 'sistemas' ? 'Tipo de equipo' : 'Clasificación'">
        <select v-model="familiaId" :class="selectClass">
          <option value="">— Selecciona —</option>
          <option v-for="f in familias" :key="f.id" :value="f.id">{{ f.nombre }}</option>
        </select>
      </AppField>
      <AppField label="Sucursal / área">
        <select v-model="ubicacionId" :class="selectClass">
          <option value="">— Selecciona —</option>
          <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
        </select>
      </AppField>
      <AppField label="Solicita">
        <input v-model="solicitanteNombre" :class="inputClass" />
      </AppField>
      <AppField v-if="subtipo === 'material'" label="Cantidad">
        <input v-model="cantidad" type="number" min="1" :class="inputClass" />
      </AppField>
    </div>

    <div class="mt-3">
      <AppField label="Describe qué necesitas">
        <textarea v-model="descripcion" :class="textareaClass" placeholder="p. ej. Celular para nuevo ejecutivo de ventas" />
      </AppField>
    </div>

    <div class="mt-5 flex justify-end gap-2">
      <button type="button" class="h-9 rounded-lg border border-border bg-bg px-3 text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">
        Cancelar
      </button>
      <button
        type="button"
        :disabled="saving"
        class="h-9 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white hover:bg-primary-hover disabled:opacity-60"
        @click="handleSubmit"
      >
        {{ saving ? 'Enviando…' : 'Enviar solicitud' }}
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
import { crearSolicitud } from 'src/lib/inventario/solicitudes'
import { useToast } from 'src/composables/useToast'

const props = defineProps({ user: { type: Object, required: true } })
const emit = defineEmits(['close', 'saved'])

const toast = useToast()
const tipo = ref('sistemas')
const subtipo = ref('equipo_nuevo')
const familiaId = ref('')
const ubicacionId = ref('')
const solicitanteNombre = ref(props.user.displayName)
const descripcion = ref('')
const cantidad = ref('1')
const saving = ref(false)

const ubicaciones = computed(() => listUbicaciones())
const familias = computed(() => listFamilias(tipo.value))

const handleTipo = (t) => {
  tipo.value = t
  subtipo.value = t === 'mantenimiento' ? 'material' : 'equipo_nuevo'
  familiaId.value = ''
}

const handleSubmit = async () => {
  if (!descripcion.value.trim()) {
    toast('Describe qué necesitas.', 'error')
    return
  }
  saving.value = true
  try {
    await crearSolicitud({
      tipo: tipo.value,
      subtipo: subtipo.value,
      familiaId: familiaId.value || undefined,
      ubicacionId: ubicacionId.value || undefined,
      solicitanteNombre: solicitanteNombre.value.trim() || props.user.displayName,
      creadoPor: props.user.id,
      descripcion: descripcion.value.trim(),
      cantidad: Number(cantidad.value) || 1,
      notas: undefined,
    })
    toast('Solicitud creada.')
    emit('saved')
    emit('close')
  } catch {
    toast('No se pudo crear la solicitud.', 'error')
  } finally {
    saving.value = false
  }
}
</script>
