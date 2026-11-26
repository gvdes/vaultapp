<template>
  <AppModal :title="soloLectura ? 'Datos de la persona' : participante ? 'Editar persona' : 'Agregar persona'" wide @close="emit('close')">
    <form class="flex flex-col gap-3" novalidate @submit.prevent="guardar">
      <p v-if="soloLectura" class="rounded-lg border border-vz-warning/40 bg-vz-warning/10 px-3 py-2 text-[12.5px] text-text">
        <b>Solo lectura.</b> {{ AVISO_SOLO_DIRECCION }} Esta persona tiene uno de esos roles, así que solo Dirección puede editarla o desactivarla.
      </p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AppField label="Nombre completo *">
          <input v-model="nombre" :disabled="soloLectura" :class="inputClass" placeholder="Nombre y apellidos" maxlength="120" autocomplete="off" />
          <span v-if="intento && !nombre.trim()" class="text-[11.5px] font-semibold text-vz-danger">El nombre es obligatorio.</span>
        </AppField>

        <AppField label="Correo donde recibirá los avisos *">
          <input v-model="correo" :disabled="soloLectura" type="email" :class="inputClass" placeholder="nombre@empresa.mx" maxlength="160" autocomplete="off" inputmode="email" />
          <span v-if="errorCorreo" class="text-[11.5px] font-semibold text-vz-danger">{{ errorCorreo }}</span>
          <span v-else-if="pistaCorreo" :class="`text-[11.5px] font-semibold ${pistaCorreo.tono === 'warning' ? 'text-vz-warning' : 'text-text-soft'}`">{{ pistaCorreo.texto }}</span>
        </AppField>

        <AppField label="Área">
          <input v-model="area" :disabled="soloLectura" list="dir-areas" :class="inputClass" placeholder="Ej. Ventas, Operaciones…" maxlength="80" autocomplete="off" />
          <datalist id="dir-areas">
            <option v-for="a in areasConocidas" :key="a" :value="a" />
          </datalist>
        </AppField>

        <AppField label="Sucursal / ubicación">
          <select v-model="ubicacionId" :disabled="soloLectura" :class="selectClass">
            <option value="">Sin sucursal (corporativo)</option>
            <optgroup v-for="g in gruposUbicacion" :key="g.titulo" :label="g.titulo">
              <option v-for="u in g.items" :key="u.id" :value="u.id">{{ u.nombre }}</option>
            </optgroup>
          </select>
        </AppField>

        <AppField label="Puesto">
          <input v-model="puesto" :disabled="soloLectura" :class="inputClass" placeholder="Ej. Líder de Sucursal" maxlength="100" autocomplete="off" />
        </AppField>
      </div>

      <div>
        <p class="mb-1.5 text-[12.5px] font-semibold text-text">Roles de proceso *</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="r in ROLES_PARTICIPANTE"
            :key="r.id"
            type="button"
            :aria-pressed="roles.includes(r.id)"
            :disabled="rolBloqueado(r.id)"
            :title="r.label"
            :class="`rounded-full border px-3 py-1 text-[12px] font-bold transition-colors ${
              roles.includes(r.id) ? 'border-vz-blue bg-vz-blue text-white' : 'border-border bg-bg text-text-muted hover:border-vz-blue/50 hover:text-text'
            } ${rolBloqueado(r.id) ? 'cursor-not-allowed opacity-60' : ''}`"
            @click="alternarRol(r.id)"
          >
            {{ ROL_CORTO[r.id] }}
          </button>
        </div>
        <p v-if="intento && roles.length === 0" class="mt-1 text-[11.5px] font-semibold text-vz-danger">Asigna al menos un rol (Solicitante si solo levanta requisiciones).</p>
        <!-- Tope de aprobación: solo para aprobadores de Finanzas; solo Dirección lo asigna -->
        <div v-if="roles.includes('finanzas')" class="mt-2.5 rounded-lg border border-border bg-bg p-3">
          <label class="text-[12.5px] font-semibold text-text" for="part-tope">Tope de aprobación (MXN)</label>
          <div class="mt-1 flex items-center gap-2">
            <span class="text-[13px] font-bold text-text-muted">$</span>
            <input id="part-tope" v-model="tope" type="number" min="0" step="100" inputmode="decimal" placeholder="Sin tope (aprueba cualquier monto)" :disabled="soloLectura || !esAdmin" :class="inputClass" />
          </div>
          <p v-if="errorTope" class="mt-1 text-[11.5px] font-semibold text-vz-danger">{{ errorTope }}</p>
          <p v-else class="mt-1 text-[11.5px] text-text-soft">
            Vacío = <b>sin tope</b>: puede aprobar cualquier monto. Con tope, solo recibe y decide las compras hasta ese monto (inclusive).
            <template v-if="!esAdmin"> Solo Dirección asigna el tope.</template>
          </p>
        </div>
        <p v-if="!esAdmin && !soloLectura" class="mt-1.5 text-[11.5px] font-semibold text-vz-warning">{{ AVISO_SOLO_DIRECCION }}</p>
        <p class="mt-1.5 text-[11.5px] text-text-soft">{{ ayudaRoles }}</p>
      </div>

      <div v-if="rolesQueSeQuitan.length > 0" class="rounded-lg border border-vz-warning/40 bg-vz-warning/10 p-3 text-[12px] text-text">
        <p class="font-bold text-vz-warning">Atención: proceso sin responsable</p>
        <p v-for="c in rolesQueSeQuitan" :key="c.id" class="mt-0.5">
          Es la única persona activa con el rol <b>{{ c.label }}</b>; sin ella {{ c.consecuencia }}. Asigna el rol a otra persona antes de quitarlo.
        </p>
      </div>

      <div v-if="participante && !soloLectura" class="rounded-lg border border-border bg-bg p-3">
        <label class="flex cursor-pointer items-center gap-2.5">
          <input v-model="activo" type="checkbox" class="h-4 w-4 accent-[var(--color-vz-blue)]" />
          <span class="text-[13px] font-bold text-text">Activo</span>
          <span class="text-[12px] text-text-muted">{{ activo ? 'Aparece en el directorio y recibe avisos.' : 'No aparece en la liga pública ni recibe avisos. Su historial se conserva.' }}</span>
        </label>
        <template v-if="desactivando">
          <AppField label="Motivo de la desactivación *">
            <input v-model="motivo" :class="`${inputClass} mt-2`" placeholder="Ej. Cambió de sucursal, dejó la empresa, suplente temporal…" maxlength="200" />
            <span v-if="intento && !motivo.trim()" class="text-[11.5px] font-semibold text-vz-danger">Indica el motivo: queda visible en la lista.</span>
          </AppField>
          <div v-if="criticosAlDesactivar.length > 0" class="mt-2 rounded-lg border border-vz-warning/40 bg-vz-warning/10 p-3 text-[12px] text-text">
            <p class="font-bold text-vz-warning">Atención: es el único titular activo</p>
            <p v-for="c in criticosAlDesactivar" :key="c.id" class="mt-0.5">Rol <b>{{ c.label }}</b>: {{ c.consecuencia }}.</p>
          </div>
        </template>
      </div>

      <p v-if="errorGeneral" class="rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ errorGeneral }}</p>

      <div class="mt-1 flex justify-end gap-2">
        <button type="button" class="h-9 rounded-lg border border-border bg-surface px-4 text-[13px] font-bold text-text hover:bg-surface-hover" @click="emit('close')">{{ soloLectura ? 'Cerrar' : 'Cancelar' }}</button>
        <button v-if="!soloLectura" type="submit" :disabled="guardando" class="h-9 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white hover:bg-primary-hover disabled:opacity-60">
          {{ guardando ? 'Guardando…' : participante ? 'Guardar cambios' : 'Agregar persona' }}
        </button>
      </div>
    </form>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import { inputClass, selectClass } from 'components/formClasses'
import { useToast } from 'src/composables/useToast'
import { bump } from 'src/lib/reactive'
import {
  ROLES_PARTICIPANTE,
  addParticipante,
  getParticipantePorCorreo,
  listParticipantes,
  setParticipanteActivo,
  updateParticipante,
} from 'src/lib/compras'
import { listUbicaciones } from 'src/lib/inventario/comunes'
import { useAuth } from 'src/lib/auth'
import { AVISO_SOLO_DIRECCION, ROLES_SOLO_DIRECCION, ROL_CORTO, asegurarPersistido, correoValido, criticosUnicos, pistasCorreo, tieneRolSoloDireccion } from './directorioUtils'

const props = defineProps({ participante: Object })
const emit = defineEmits(['close', 'saved'])

const toast = useToast()
const { user } = useAuth()
const p = props.participante
const esAdmin = computed(() => user.value?.role === 'admin')
/** Quien no es Dirección solo ve (no edita) a las personas con roles de aprobación, tesorería, dirección o compras. */
const soloLectura = computed(() => !esAdmin.value && Boolean(p) && tieneRolSoloDireccion(p?.roles ?? []))
const rolBloqueado = (r) => soloLectura.value || (!esAdmin.value && ROLES_SOLO_DIRECCION.includes(r))

const nombre = ref(p?.nombre ?? '')
const correo = ref(p?.correo ?? '')
const area = ref(p?.area ?? '')
const ubicacionId = ref(p?.ubicacionId ?? '')
const puesto = ref(p?.puesto ?? '')
// El rol 'ceo' quedó EN DESUSO (022): no se ofrece ni se conserva al editar a una persona.
const roles = ref(p ? p.roles.filter((r) => r !== 'ceo') : ['solicitante'])
const tope = ref(p?.topeAprobacion === undefined || p?.topeAprobacion === null ? '' : String(p.topeAprobacion))
const activo = ref(p?.activo ?? true)
const motivo = ref('')
const intento = ref(false)
const guardando = ref(false)
const errorGeneral = ref('')

const areasConocidas = computed(() => [...new Set(listParticipantes({ incluirInactivos: true }).map((x) => x.area).filter((a) => Boolean(a)))].sort((a, b) => a.localeCompare(b, 'es')))

const gruposUbicacion = computed(() => {
  const todas = listUbicaciones()
  const grupos = [
    { titulo: 'Sucursales', items: todas.filter((u) => u.tipo === 'sucursal') },
    { titulo: 'CEDIS', items: todas.filter((u) => u.tipo === 'cedis') },
    { titulo: 'Oficinas', items: todas.filter((u) => u.tipo === 'oficina') },
  ]
  // Si la persona tiene una ubicación que ya no está activa en el catálogo, se conserva para no perderla al guardar.
  if (p?.ubicacionId && !todas.some((u) => u.id === p.ubicacionId)) grupos.push({ titulo: 'Otra', items: [{ id: p.ubicacionId, nombre: `${p.ubicacionId} (inactiva)`, tipo: 'oficina', activo: false }] })
  return grupos
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }))
    .filter((g) => g.items.length > 0)
})

const errorTope = computed(() => {
  const t = tope.value.trim()
  if (!t) return ''
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? '' : 'Escribe un monto de 0 o más, o déjalo vacío para «sin tope».'
})

const errorCorreo = computed(() => {
  const c = correo.value.trim()
  if (!c) return intento.value ? 'El correo es obligatorio: a ese correo llegan los avisos.' : ''
  if (!correoValido(c)) return 'El correo no es válido (ej. nombre@empresa.mx).'
  const dup = getParticipantePorCorreo(c)
  if (dup && dup.id !== p?.id) return `Ya existe ${dup.nombre}${dup.activo ? '' : ' (desactivado; mejor reactívalo)'} con ese correo.`
  return ''
})
const pistaCorreo = computed(() => pistasCorreo(correo.value).find((x) => x.tono !== 'danger'))

const AYUDA = {
  solicitante: 'Aparece en la liga pública para levantar requisiciones.',
  comprador: 'Cotiza y compra; recibe los avisos de nuevas requisiciones.',
  finanzas: 'Aprueba o rechaza compras hasta su tope de aprobación (basta uno de los aprobadores elegibles; sin tope = cualquier monto).',
  tesoreria: 'Recibe la solicitud de fondos y entrega el efectivo (compras con forma de pago efectivo).',
  cuentas_por_pagar: 'Recibe el aviso de pago de las compras por transferencia o tarjeta y registra el pago.',
  direccion: 'Recibe un aviso informativo (sin botones) de las compras de más de $50,000; no aprueba.',
  ceo: 'En desuso.',
  talento: 'Consulta responsivas, equipos y cargos por pérdida.',
  auditor: 'Puede ser asignado a auditorías de inventario.',
  infraestructura: 'Custodio de TI: confirma recepciones de equipos.',
  mantenimiento: 'Custodio de Mantenimiento: confirma recepciones.',
}
const ayudaRoles = computed(() => (roles.value.length ? roles.value.map((r) => `${ROL_CORTO[r]}: ${AYUDA[r]}`).join(' · ') : 'Elige uno o varios roles.'))

function alternarRol(r) {
  if (rolBloqueado(r)) return
  roles.value = roles.value.includes(r) ? roles.value.filter((x) => x !== r) : [...roles.value, r]
}

const rolesQueSeQuitan = computed(() => (p && p.activo && activo.value ? criticosUnicos(p, roles.value) : []))
const desactivando = computed(() => Boolean(p?.activo) && !activo.value)
const criticosAlDesactivar = computed(() => (p && desactivando.value ? criticosUnicos(p) : []))

function cambioTexto(nuevo, previo) {
  return nuevo.trim() === (previo ?? '') ? undefined : nuevo.trim()
}

async function guardar() {
  if (soloLectura.value) return
  intento.value = true
  errorGeneral.value = ''
  if (!nombre.value.trim() || errorCorreo.value || !correo.value.trim() || roles.value.length === 0 || errorTope.value) return
  if (desactivando.value && !motivo.value.trim()) return
  guardando.value = true
  try {
    if (!p) {
      const nuevo = await addParticipante({
        nombre: nombre.value,
        correo: correo.value,
        area: area.value,
        ubicacionId: ubicacionId.value || undefined,
        puesto: puesto.value,
        roles: roles.value,
        ...(roles.value.includes('finanzas') && tope.value.trim() ? { topeAprobacion: Number(tope.value) } : {}),
      })
      toast(`${nuevo.nombre} se agregó al directorio.`)
      bump()
      emit('saved', nuevo)
      return
    }
    // Solo se envía lo que cambió ('' limpia un campo opcional, también en la base).
    const patch = {}
    const n = cambioTexto(nombre.value, p.nombre)
    if (n !== undefined) patch.nombre = n
    const c = cambioTexto(correo.value.toLowerCase(), p.correo)
    if (c !== undefined) patch.correo = c
    const a = cambioTexto(area.value, p.area)
    if (a !== undefined) patch.area = a
    if (ubicacionId.value !== (p.ubicacionId ?? '')) patch.ubicacionId = ubicacionId.value
    const pu = cambioTexto(puesto.value, p.puesto)
    if (pu !== undefined) patch.puesto = pu
    if (JSON.stringify([...roles.value].sort()) !== JSON.stringify([...p.roles].sort())) patch.roles = roles.value
    // Tope de aprobación: solo Dirección; vacío = sin tope (se guarda null para limpiarlo también en la base).
    if (esAdmin.value && roles.value.includes('finanzas')) {
      const nuevoTope = tope.value.trim() ? Number(tope.value) : null
      if ((nuevoTope ?? null) !== (p.topeAprobacion ?? null)) patch.topeAprobacion = nuevoTope
    }
    if (Object.keys(patch).length > 0) {
      await updateParticipante(p.id, patch)
      await asegurarPersistido(p.id, patch)
    }
    if (activo.value !== p.activo) {
      await setParticipanteActivo(p.id, activo.value, activo.value ? undefined : motivo.value.trim())
      await asegurarPersistido(p.id, { activo: activo.value })
    }
    toast('Cambios guardados.')
    bump()
    emit('saved', p)
  } catch (e) {
    errorGeneral.value = e instanceof Error ? e.message : String(e)
    toast(errorGeneral.value, 'error')
    bump()
  } finally {
    guardando.value = false
  }
}
</script>
