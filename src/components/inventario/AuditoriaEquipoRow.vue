<template>
  <div v-if="equipo" class="border-b border-border py-2.5 text-[12.5px] last:border-0">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate font-bold text-text">{{ equipo.modelo || equipo.numeroSerie || 'Equipo' }}</p>
        <p class="text-text-muted">
          {{ equipo.numeroSerie ?? '—' }}<template v-if="equipo.usuarioAsignado"> · {{ equipo.usuarioAsignado }}</template>
        </p>
        <p v-if="item.verificadoPor && item.fechaVerificado" class="text-[11px] text-text-soft">
          Contó {{ item.verificadoPor }} · {{ new Date(item.fechaVerificado).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) }}
        </p>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <StatusPill v-if="item.reconteo" label="Reconteo pedido" tone="warning" />
        <StatusPill
          v-if="item.encontrado !== undefined"
          :label="item.encontrado === false ? 'No encontrado' : item.condicion === 'danado' ? 'Dañado' : 'Encontrado'"
          :tone="item.encontrado === false ? 'danger' : item.condicion === 'danado' ? 'warning' : 'success'"
        />
        <StatusPill v-else label="Sin contar" tone="neutral" />
        <StatusPill v-if="item.resolucion" :label="item.resolucion" tone="info" />
        <div v-if="editor" class="flex gap-1.5">
          <button type="button" :disabled="saving" class="rounded-md border border-vz-success/30 bg-vz-success/10 px-2 py-1 text-[11px] font-semibold text-vz-success hover:bg-vz-success/20" @click="marcar(true, 'bien')">
            Bien
          </button>
          <button type="button" :disabled="saving" class="rounded-md border border-vz-warning/30 bg-vz-warning/10 px-2 py-1 text-[11px] font-semibold text-vz-warning hover:bg-vz-warning/20" @click="marcar(true, 'danado')">
            Dañado
          </button>
          <button type="button" :disabled="saving" class="rounded-md border border-vz-danger/30 bg-vz-danger/10 px-2 py-1 text-[11px] font-semibold text-vz-danger hover:bg-vz-danger/20" @click="marcar(false, 'perdido')">
            No encontrado
          </button>
        </div>
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

    <!-- Nota y foto al contar dentro de la app -->
    <div v-if="editor && item.encontrado !== undefined" class="mt-2 flex flex-col gap-1.5">
      <input v-model="nota" maxlength="1000" placeholder="Nota (opcional)" :class="inputClass" @change="guardarNota" />
      <div class="flex items-center gap-2">
        <label class="flex h-8 cursor-pointer items-center rounded-lg border border-border bg-bg px-2.5 text-[11.5px] font-bold text-text-muted hover:bg-surface-hover">
          {{ item.fotoUrl ? 'Cambiar foto' : 'Agregar foto' }}
          <input type="file" accept="image/*" capture="environment" class="hidden" @change="alElegirFoto" />
        </label>
        <button v-if="item.fotoUrl" type="button" class="text-[11.5px] font-semibold text-vz-danger" @click="quitarFoto">Quitar foto</button>
      </div>
    </div>

    <!-- Verificador: pedir reconteo -->
    <div v-if="verificador && contado && !item.reconteo" class="mt-2">
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
import { getEquipo } from 'src/lib/inventario/sistemas'
import { comprimirFoto } from 'src/lib/inventario/fotoComprimida'
import { marcarEquipoItem, pedirReconteo } from 'src/lib/inventario/auditorias'

/** `editor`: cuenta dentro de la app (modalidad interna, en conteo). `verificador`: puede pedir reconteo. */
const props = defineProps({ item: { type: Object, required: true }, editor: Boolean, verificador: Boolean })
const emit = defineEmits(['changed'])

const { user } = useAuth()
const toast = useToast()
const equipo = computed(() => (props.item.equipoId ? getEquipo(props.item.equipoId) : undefined))
const contado = computed(() => props.item.encontrado !== undefined)
const saving = ref(false)
const nota = ref(props.item.notas ?? '')
const ampliada = ref(false)
const pidiendo = ref(false)
const motivo = ref('')

const estadoActual = () => ({
  encontrado: props.item.encontrado ?? true,
  condicion: props.item.condicion ?? 'bien',
})

async function guardar(patch) {
  saving.value = true
  try {
    await marcarEquipoItem(props.item.id, patch)
    emit('changed')
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
  } finally {
    saving.value = false
  }
}

const marcar = (encontrado, condicion) =>
  guardar({ encontrado, condicion, notas: nota.value.trim() || undefined, verificadoPor: user.value?.displayName })

const guardarNota = () => {
  if (!contado.value) return
  const e = estadoActual()
  return guardar({ ...e, notas: nota.value.trim() || undefined, verificadoPor: props.item.verificadoPor ?? user.value?.displayName })
}

async function alElegirFoto(ev) {
  const input = ev.target
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const data = await comprimirFoto(file)
    await guardar({ ...estadoActual(), notas: nota.value.trim() || undefined, verificadoPor: props.item.verificadoPor ?? user.value?.displayName, fotoUrl: data })
  } catch {
    toast('No se pudo procesar la foto.', 'error')
  }
}

const quitarFoto = () => guardar({ ...estadoActual(), notas: props.item.notas, verificadoPor: props.item.verificadoPor, fotoUrl: '' })

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
