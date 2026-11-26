<template>
  <AppModal title="Dar de baja por pérdida / robo" @close="emit('close')">
    <div class="mb-4 rounded-lg border border-border bg-bg p-3 text-[12.5px]">
      <p class="font-bold text-text">{{ equipo.modelo || 'Sin modelo' }} · {{ equipo.numeroSerie || 'sin serie' }}</p>
      <p class="mt-1 text-text-muted">
        Valor original: <span class="font-bold text-text">{{ currency.format(equipo.costoTotal) }}</span>
      </p>
      <p class="text-text-muted">
        Valor depreciado calculado hoy: <span class="font-bold text-vz-warning">{{ currency.format(valorCalculado) }}</span>
      </p>
      <p class="mt-1 text-[11px] text-text-soft">
        No se cobra el precio de nuevo — este es el valor proporcional ya depreciado según la vida útil de la familia "{{ familia?.nombre }}".
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <AppField label="Motivo">
        <select v-model="motivo" :class="inputClass">
          <option value="perdida">Pérdida</option>
          <option value="robo">Robo</option>
          <option value="dano_irreparable">Daño irreparable</option>
        </select>
      </AppField>
      <AppField label="Colaborador afectado (a quien se cobra)">
        <input v-model="usuarioAfectado" :class="inputClass" />
      </AppField>
      <div class="col-span-2">
        <AppField label="Valor a cobrar (MXN) — editable si Dirección ajusta el monto">
          <input v-model="valorCobrado" type="number" min="0" step="0.01" :class="inputClass" />
        </AppField>
      </div>
      <div class="col-span-2">
        <AppField label="Notas">
          <textarea v-model="notas" :class="textareaClass" placeholder="Circunstancias, folio de acta administrativa, etc." />
        </AppField>
      </div>
    </div>

    <div class="mt-5 flex justify-end gap-2">
      <button type="button" class="h-9 rounded-lg border border-border bg-bg px-3 text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">Cancelar</button>
      <button type="button" :disabled="saving" class="h-9 rounded-lg bg-vz-danger px-4 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60" @click="handleSubmit">
        {{ saving ? 'Guardando…' : 'Registrar baja y cargo' }}
      </button>
    </div>
  </AppModal>
</template>

<script setup>
import { ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { inputClass, textareaClass } from 'components/formClasses'
import { getFamilia } from 'src/lib/inventario/comunes'
import { updateEquipo } from 'src/lib/inventario/sistemas'
import { calcularValorDepreciado } from 'src/lib/inventario/depreciacion'
import { registrarCargoPerdida } from 'src/lib/inventario/cargosPerdida'
import { useToast } from 'src/composables/useToast'

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

const props = defineProps({ equipo: { type: Object, required: true }, autorizadoPor: String })
const emit = defineEmits(['close', 'saved'])

const toast = useToast()
const familia = getFamilia(props.equipo.familiaId)
const valorCalculado = familia ? calcularValorDepreciado(props.equipo, familia) : props.equipo.costoTotal

const usuarioAfectado = ref(props.equipo.usuarioAsignado ?? '')
const valorCobrado = ref(valorCalculado.toString())
const motivo = ref('perdida')
const notas = ref('')
const saving = ref(false)

async function handleSubmit() {
  saving.value = true
  try {
    await registrarCargoPerdida({
      equipoId: props.equipo.id,
      usuarioAfectado: usuarioAfectado.value || undefined,
      valorCalculado,
      valorCobrado: Number(valorCobrado.value) || 0,
      motivo: motivo.value,
      autorizadoPor: props.autorizadoPor,
      notas: notas.value || undefined,
    })
    await updateEquipo(props.equipo.id, { estado: 'baja' }, props.autorizadoPor)
    toast('Baja registrada con cargo al colaborador.')
    emit('saved')
    emit('close')
  } catch {
    toast('No se pudo registrar la baja.', 'error')
  } finally {
    saving.value = false
  }
}
</script>
