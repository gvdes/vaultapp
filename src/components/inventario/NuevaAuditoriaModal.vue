<template>
  <AppModal title="Nueva auditoría física" @close="emit('close')">
    <p class="mb-4 text-[12.5px] text-text-muted">
      Se genera una lista de conteo con todo lo que el sistema dice que debería estar en esta ubicación hoy: equipos activos y materiales con
      existencia. Después se cuenta en sitio —tú mismo o un auditor asignado, por liga y sin usuario— y tú verificas el resultado aquí.
    </p>
    <div class="flex flex-col gap-3">
      <AppField label="Sucursal / ubicación a auditar">
        <select v-model="ubicacionId" :class="selectClass">
          <option value="">— Selecciona —</option>
          <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
        </select>
      </AppField>
      <AppField label="Qué auditar">
        <select v-model="tipo" :class="selectClass">
          <option v-if="puede('ambos')" value="ambos">Sistemas y Mantenimiento</option>
          <option v-if="puede('sistemas')" value="sistemas">Solo equipo de Sistemas</option>
          <option v-if="puede('mantenimiento')" value="mantenimiento">Solo Mantenimiento (herramienta, equipo y material)</option>
        </select>
      </AppField>
      <AppField label="Quién cuenta (modalidad)">
        <select v-model="modalidad" :class="selectClass">
          <option v-for="m in MODALIDADES" :key="m" :value="m">{{ MODALIDAD_LABEL[m] }}</option>
        </select>
      </AppField>
      <p class="-mt-1 text-[11.5px] text-text-soft">{{ AYUDA_MODALIDAD[modalidad] }}</p>

      <div v-if="modalidad !== 'interna'" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AppField :label="modalidad === 'auditor' ? 'Nombre del auditor' : 'Nombre del Gerente de la sucursal'">
          <input v-model="auditorNombre" :class="inputClass" placeholder="Nombre y apellido" />
        </AppField>
        <AppField label="Correo (para enviarle la liga)">
          <input v-model="auditorCorreo" type="email" :class="inputClass" placeholder="correo@empresa.mx" />
        </AppField>
      </div>

      <AppField label="Fecha programada (opcional)">
        <input v-model="fechaProgramada" type="date" :class="inputClass" />
      </AppField>
      <AppField label="Nota de alcance (opcional)">
        <textarea v-model="alcance" :class="textareaClass" placeholder="Ej. Incluye bodega y mostrador; no contar equipos en reparación." />
      </AppField>
      <label class="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-bg p-2.5 text-[12.5px]">
        <input v-model="sorpresa" type="checkbox" class="mt-0.5" />
        <span>
          <span class="font-bold text-text">Auditoría sorpresa</span>
          <span class="block text-text-muted">Se marca sin aviso previo a la sucursal; comparte la liga solo el día de la visita.</span>
        </span>
      </label>
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
        {{ saving ? 'Generando…' : 'Iniciar auditoría' }}
      </button>
    </div>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { inputClass, selectClass, textareaClass } from 'components/formClasses'
import { useAuth } from 'src/lib/auth'
import { canRunAudit } from 'src/lib/access'
import { useToast } from 'src/composables/useToast'
import { useConfirm } from 'src/composables/useConfirm'
import { listUbicaciones } from 'src/lib/inventario/comunes'
import {
  iniciarAuditoria,
  listAuditorias,
  MODALIDAD_LABEL,
} from 'src/lib/inventario/auditorias'

const props = defineProps({ ubicacionInicial: String, sorpresaInicial: Boolean })
const emit = defineEmits(['close', 'created'])

const MODALIDADES = ['interna', 'auditor', 'gerente_sucursal']
const AYUDA_MODALIDAD = {
  interna: 'Cuentas tú (o tu equipo) desde esta misma pantalla. También puedes compartir la liga si alguien más te ayuda.',
  auditor: 'Un auditor asignado cuenta en sitio desde su celular con una liga (puede no tener cuenta). Tú verificas aquí.',
  gerente_sucursal: 'El Gerente de la sucursal cuenta con apoyo de su equipo, por liga. Tú verificas aquí.',
}

const { user } = useAuth()
const toast = useToast()
const confirm = useConfirm()
const ubicaciones = computed(() => listUbicaciones())
const ubicacionId = ref(props.ubicacionInicial ?? '')
// Solo se ofrecen los tipos que el rol puede correr: capturista → sistemas, mantenimiento → mantenimiento, admin → todos.
const puede = (t) => (user.value ? canRunAudit(user.value.role, t) : false)
const tipoInicial = () => (puede('ambos') ? 'ambos' : puede('sistemas') ? 'sistemas' : 'mantenimiento')
const tipo = ref(tipoInicial())
const modalidad = ref('auditor')
const auditorNombre = ref('')
const auditorCorreo = ref('')
const fechaProgramada = ref('')
const alcance = ref('')
const sorpresa = ref(props.sorpresaInicial ?? false)
const saving = ref(false)

const handleSubmit = async () => {
  if (!ubicacionId.value) {
    toast('Selecciona la sucursal o ubicación a auditar.', 'error')
    return
  }
  if (!puede(tipo.value)) {
    toast('Tu rol no puede iniciar este tipo de auditoría.', 'error')
    return
  }
  if (modalidad.value !== 'interna' && !auditorNombre.value.trim()) {
    toast('Escribe el nombre de quien va a contar.', 'error')
    return
  }
  const correo = auditorCorreo.value.trim()
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    toast('El correo no parece válido.', 'error')
    return
  }
  const abierta = listAuditorias().find((a) => a.ubicacionId === ubicacionId.value && a.estado !== 'completada')
  if (abierta) {
    const ok = await confirm({
      message: 'Esta sucursal ya tiene una auditoría abierta (sin cerrar). ¿Crear otra de todas formas?',
      confirmLabel: 'Crear otra',
    })
    if (!ok) return
  }
  saving.value = true
  try {
    const auditoria = await iniciarAuditoria(ubicacionId.value, tipo.value, user.value?.displayName, {
      modalidad: modalidad.value,
      auditorNombre: modalidad.value === 'interna' ? undefined : auditorNombre.value,
      auditorCorreo: modalidad.value === 'interna' ? undefined : correo,
      fechaProgramada: fechaProgramada.value || undefined,
      alcance: alcance.value,
      sorpresa: sorpresa.value,
    })
    emit('created', auditoria)
  } catch {
    toast('No se pudo iniciar la auditoría.', 'error')
  } finally {
    saving.value = false
  }
}
</script>
