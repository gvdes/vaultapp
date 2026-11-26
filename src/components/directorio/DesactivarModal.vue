<template>
  <AppModal :title="`Desactivar a ${participante.nombre}`" @close="emit('close')">
    <form class="flex flex-col gap-3" novalidate @submit.prevent="confirmar">
      <p class="text-[13px] text-text-muted">
        La persona deja de aparecer en la liga pública y de recibir avisos. <b class="text-text">No se borra nada</b>: su historial se conserva y puedes reactivarla cuando
        quieras.
      </p>

      <div v-if="criticos.length > 0" class="rounded-lg border border-vz-warning/40 bg-vz-warning/10 p-3 text-[12px] text-text">
        <p class="font-bold text-vz-warning">Atención: es el único titular activo de un rol crítico</p>
        <p v-for="c in criticos" :key="c.id" class="mt-0.5">
          <b>{{ c.label }}</b>: {{ c.consecuencia }}. Conviene asignar el rol a otra persona antes (o justo después).
        </p>
      </div>

      <AppField label="Motivo de la desactivación *">
        <input v-model="motivo" :class="inputClass" placeholder="Ej. Cambió de sucursal, dejó la empresa, suplente temporal…" maxlength="200" autofocus />
        <span v-if="intento && !motivo.trim()" class="text-[11.5px] font-semibold text-vz-danger">El motivo es obligatorio: quedará visible en la lista.</span>
      </AppField>

      <p v-if="error" class="rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <button type="button" class="h-9 rounded-lg border border-border bg-surface px-4 text-[13px] font-bold text-text hover:bg-surface-hover" @click="emit('close')">Cancelar</button>
        <button type="submit" :disabled="guardando" class="h-9 rounded-lg bg-vz-danger px-4 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60">
          {{ guardando ? 'Desactivando…' : 'Desactivar' }}
        </button>
      </div>
    </form>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { inputClass } from 'components/formClasses'
import { useToast } from 'src/composables/useToast'
import { bump } from 'src/lib/reactive'
import { setParticipanteActivo } from 'src/lib/compras'
import { asegurarPersistido, criticosUnicos } from './directorioUtils'

const props = defineProps({ participante: { type: Object, required: true } })
const emit = defineEmits(['close', 'done'])

const toast = useToast()
const motivo = ref('')
const intento = ref(false)
const guardando = ref(false)
const error = ref('')
const criticos = computed(() => criticosUnicos(props.participante))

async function confirmar() {
  intento.value = true
  error.value = ''
  if (!motivo.value.trim()) return
  guardando.value = true
  try {
    await setParticipanteActivo(props.participante.id, false, motivo.value.trim())
    await asegurarPersistido(props.participante.id, { activo: false })
    toast(`Se desactivó a ${props.participante.nombre}. Puedes reactivarla cuando quieras.`)
    bump()
    emit('done')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    toast(error.value, 'error')
    bump()
  } finally {
    guardando.value = false
  }
}
</script>
