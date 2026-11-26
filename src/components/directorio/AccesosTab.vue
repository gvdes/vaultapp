<template>
  <div class="flex flex-col gap-3">
    <div v-if="soloLectura" class="flex gap-2.5 rounded-xl border border-vz-warning/40 bg-vz-warning/10 p-3 text-[12.5px] text-text">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="mt-0.5 h-4 w-4 shrink-0 text-vz-warning">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <p>
        <b>Modo demostración (sin Supabase):</b> aquí se muestran los 8 usuarios de prueba de la app, <b>solo lectura</b>. Con Supabase configurado esta pantalla lista los perfiles reales (tabla
        <code class="rounded bg-surface px-1">profiles</code>) y permite cambiar el rol y el nombre.
      </p>
    </div>

    <div class="flex gap-2.5 rounded-xl border border-vz-blue/25 bg-vz-blue/5 p-3 text-[12.5px] text-text-muted">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="mt-0.5 h-4 w-4 shrink-0 text-vz-blue">
        <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
      <p>
        Un <b class="text-text">acceso</b> es una cuenta para entrar a la plataforma (distinta de una <b class="text-text">persona del directorio</b>, que puede no tener cuenta, como los solicitantes).
        <b class="text-text">Si cambias el rol de alguien, esa persona debe cerrar sesión y volver a entrar</b> para que el cambio surta efecto. Aquí no se manejan contraseñas.
      </p>
    </div>

    <!-- Lista -->
    <div class="flex items-center justify-between gap-2">
      <p class="text-[12.5px] text-text-muted">
        <b class="text-text">{{ perfiles.length }}</b> usuario(s)<template v-if="!soloLectura"> · <b class="text-text">{{ nAdmins }}</b> con rol de Dirección</template>
      </p>
      <button type="button" class="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover" :disabled="cargando" @click="cargar">
        {{ cargando ? 'Cargando…' : 'Actualizar' }}
      </button>
    </div>

    <p v-if="error" class="rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ error }}</p>

    <div v-if="cargando && perfiles.length === 0" class="rounded-xl border border-border bg-surface p-8 text-center text-[13px] text-text-soft">Cargando usuarios…</div>
    <div v-else-if="perfiles.length === 0 && !error" class="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
      <p class="text-[14px] font-bold text-text">Todavía no hay usuarios</p>
      <p class="mt-1 text-[12.5px] text-text-muted">Crea el primero en Supabase Auth (instrucciones más abajo); aparecerá aquí con rol Solicitante.</p>
    </div>

    <template v-else-if="perfiles.length > 0">
      <div class="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
        <table class="w-full table-fixed border-collapse text-[13px]">
          <thead>
            <tr class="border-b border-border bg-bg">
              <th class="w-[24%] px-3 py-2 text-left font-bold text-text-muted">Usuario</th>
              <th class="w-[34%] px-3 py-2 text-left font-bold text-text-muted">Nombre</th>
              <th class="w-[26%] px-3 py-2 text-left font-bold text-text-muted">Rol</th>
              <th class="w-[16%] px-3 py-2 text-right font-bold text-text-muted" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in perfiles" :key="u.id" class="border-b border-border last:border-0 hover:bg-surface-hover">
              <td class="break-all px-3 py-2.5 font-mono text-[12px] text-text-muted">{{ u.username }}</td>
              <td class="break-words px-3 py-2.5 font-bold text-text">
                {{ u.displayName }}
                <span v-if="esYo(u)" class="ml-1 rounded-full bg-vz-blue/10 px-1.5 py-0.5 text-[10.5px] font-bold text-vz-blue">Tú</span>
                <p v-if="u.role === 'finanzas'" :class="`mt-0.5 text-[11.5px] font-semibold ${u.participanteId ? 'text-text-muted' : 'text-vz-warning'}`">{{ textoLiga(u) }}</p>
              </td>
              <td class="px-3 py-2.5"><StatusPill :label="rolLabel(u.role)" :tone="u.role === 'admin' ? 'info' : u.role === 'solicitante' ? 'neutral' : 'success'" /></td>
              <td class="px-3 py-2.5 text-right">
                <button v-if="!soloLectura" type="button" class="text-[12.5px] font-bold text-vz-blue hover:underline" @click="abrir(u)">Editar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex flex-col gap-2 md:hidden">
        <div v-for="u in perfiles" :key="u.id" class="rounded-xl border border-border bg-surface p-3.5">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="break-words text-[14px] font-bold text-text">
                {{ u.displayName }}
                <span v-if="esYo(u)" class="ml-1 rounded-full bg-vz-blue/10 px-1.5 py-0.5 text-[10.5px] font-bold text-vz-blue">Tú</span>
              </p>
              <p class="break-all font-mono text-[12px] text-text-muted">{{ u.username }}</p>
              <p v-if="u.role === 'finanzas'" :class="`mt-0.5 text-[11.5px] font-semibold ${u.participanteId ? 'text-text-muted' : 'text-vz-warning'}`">{{ textoLiga(u) }}</p>
            </div>
            <StatusPill :label="rolLabel(u.role)" :tone="u.role === 'admin' ? 'info' : u.role === 'solicitante' ? 'neutral' : 'success'" />
          </div>
          <button v-if="!soloLectura" type="button" class="mt-2.5 h-8 w-full rounded-lg border border-border bg-surface text-[12.5px] font-bold text-vz-blue hover:bg-surface-hover" @click="abrir(u)">Editar</button>
        </div>
      </div>
    </template>

    <!-- Leyenda de roles -->
    <section class="rounded-xl border border-border bg-surface p-4">
      <h2 class="text-[13.5px] font-extrabold text-text">¿Qué puede hacer cada rol?</h2>
      <p class="mb-3 text-[12px] text-text-muted">Cada rol actúa en lo suyo: quien compra no custodia el inventario, y quien aprueba no cotiza.</p>
      <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div v-for="r in ROLES_INFO" :key="r.role" class="rounded-lg border border-border bg-bg p-3">
          <p class="text-[13px] font-bold text-text">{{ r.label }} <span class="ml-1 font-mono text-[11px] font-normal text-text-soft">{{ r.role }}</span></p>
          <p class="mt-1 text-[12px] text-text-muted"><b class="text-vz-success">Puede:</b> {{ r.puede }}</p>
          <p class="mt-0.5 text-[12px] text-text-muted"><b class="text-vz-danger">No puede:</b> {{ r.noPuede }}</p>
        </div>
      </div>
    </section>

    <!-- Cómo crear usuarios -->
    <section class="rounded-xl border border-border bg-surface p-4">
      <h2 class="text-[13.5px] font-extrabold text-text">Cómo crear un usuario nuevo</h2>
      <p class="mb-2 text-[12px] text-text-muted">Se hace en Supabase, no en esta pantalla (la contraseña nunca pasa por la app).</p>
      <ol class="list-decimal space-y-1.5 pl-5 text-[12.5px] text-text-muted">
        <li>En el panel de Supabase abre <b class="text-text">Authentication → Users → Add user → Create new user</b>.</li>
        <li>
          En <b class="text-text">Email</b> escribe <code class="rounded bg-bg px-1 text-text">usuario@dga-inventarios.interno</code> (el usuario en minúsculas, sin espacios; es lo que se teclea al entrar) y define una contraseña
          temporal que le darás en persona.
        </li>
        <li>
          En <b class="text-text">User Metadata</b> pega:
          <code class="mt-1 block break-all rounded bg-bg px-2 py-1 text-[11.5px] text-text">{"username": "usuario", "display_name": "Nombre Apellido"}</code>
        </li>
        <li>La cuenta nace con rol <b class="text-text">Solicitante</b>. Vuelve aquí, pulsa <b class="text-text">Actualizar</b> y asígnale el rol que corresponda.</li>
        <li>
          Para dar de baja a alguien, cámbialo a Solicitante y bloquéalo en Supabase (<b class="text-text">Ban user</b>). No borres la cuenta: así se conserva quién hizo cada cambio en la bitácora.
        </li>
      </ol>
    </section>

    <!-- Edición -->
    <AppModal v-if="editando" :title="`Editar acceso: ${editando.username}`" @close="editando = undefined">
      <form class="flex flex-col gap-3" novalidate @submit.prevent="guardar">
        <AppField label="Nombre que se muestra">
          <input v-model="nombre" :class="inputClass" maxlength="100" />
          <span v-if="intento && !nombre.trim()" class="text-[11.5px] font-semibold text-vz-danger">El nombre no puede quedar vacío.</span>
        </AppField>
        <AppField label="Rol">
          <select v-model="rol" :class="selectClass" :disabled="bloqueoRol !== ''">
            <option v-for="r in ROLES_ORDEN" :key="r" :value="r">{{ rolLabel(r) }}</option>
          </select>
        </AppField>
        <AppField v-if="rol === 'finanzas'" label="Aprobador del directorio al que está ligado">
          <select v-model="participanteId" :class="selectClass">
            <option value="">Sin liga (no podrá aprobar ni rechazar)</option>
            <option v-for="p in aprobadoresDirectorio" :key="p.id" :value="p.id">{{ p.nombre }} · {{ textoTope(p) }}</option>
          </select>
        </AppField>
        <p v-if="rol === 'finanzas'" class="text-[11.5px] text-text-soft">Un usuario de Finanzas solo decide compras si está ligado a un aprobador activo del directorio cuyo tope cubra el monto. Solo Dirección asigna esta liga.</p>
        <p v-if="bloqueoRol" class="text-[12px] font-semibold text-vz-warning">{{ bloqueoRol }}</p>
        <p v-else-if="rolInfo" class="rounded-lg border border-border bg-bg p-2.5 text-[12px] text-text-muted">{{ rolInfo.puede }}</p>
        <p v-if="rol !== editando.role" class="rounded-lg border border-vz-warning/40 bg-vz-warning/10 p-2.5 text-[12px] text-text">
          Al guardar, <b>{{ editando.displayName }}</b> deberá cerrar sesión y volver a entrar para que el nuevo rol surta efecto.
        </p>
        <p v-if="errorModal" class="rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ errorModal }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="h-9 rounded-lg border border-border bg-surface px-4 text-[13px] font-bold text-text hover:bg-surface-hover" @click="editando = undefined">Cancelar</button>
          <button type="submit" :disabled="guardando || !hayCambios" class="h-9 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white hover:bg-primary-hover disabled:opacity-50">
            {{ guardando ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </form>
    </AppModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import AppField from 'components/AppField.vue'
import StatusPill from 'components/StatusPill.vue'
import { inputClass, selectClass } from 'components/formClasses'
import { useAuth } from 'src/lib/auth'
import { useConfirm } from 'src/composables/useConfirm'
import { useToast } from 'src/composables/useToast'
import { ROLES_INFO, ROLES_ORDEN, listPerfiles, perfilesSoloLectura, rolLabel, updatePerfil } from 'src/lib/perfiles'
import { getParticipante, participantesPorRol } from 'src/lib/compras'
import { textoTope } from './directorioUtils'

const { user } = useAuth()
const confirmar = useConfirm()
const toast = useToast()

const soloLectura = perfilesSoloLectura()
const perfiles = ref([])
const cargando = ref(false)
const error = ref('')

const editando = ref()
const nombre = ref('')
const rol = ref('solicitante')
const participanteId = ref('')
const intento = ref(false)
const guardando = ref(false)
const errorModal = ref('')

const aprobadoresDirectorio = computed(() => participantesPorRol('finanzas'))
/** Con quién está ligado un usuario de Finanzas (sin liga no puede aprobar). */
function textoLiga(u) {
  const p = getParticipante(u.participanteId)
  return p ? `Aprobador: ${p.nombre} (${textoTope(p) || 'sin rol finanzas'})${p.activo ? '' : ' · inactivo'}` : 'Sin liga a un aprobador: no puede aprobar'
}

const nAdmins = computed(() => perfiles.value.filter((p) => p.role === 'admin').length)
const esYo = (u) => u.id === user.value?.id

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    perfiles.value = await listPerfiles()
  } catch (e) {
    error.value = `No se pudieron leer los usuarios: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

function abrir(u) {
  editando.value = u
  nombre.value = u.displayName
  rol.value = u.role
  participanteId.value = u.participanteId ?? ''
  intento.value = false
  errorModal.value = ''
}

/** Razones por las que el rol no se puede cambiar (evita quedarse sin Dirección o auto-bloquearse). */
const bloqueoRol = computed(() => {
  const u = editando.value
  if (!u) return ''
  if (esYo(u)) return 'No puedes cambiar tu propio rol (podrías quedarte sin acceso). Pídele a otra persona de Dirección que lo haga.'
  if (u.role === 'admin' && nAdmins.value <= 1) return 'Es la única cuenta de Dirección: primero asigna ese rol a otra persona.'
  return ''
})

const rolInfo = computed(() => ROLES_INFO.find((r) => r.role === rol.value))
const hayCambios = computed(
  () => Boolean(editando.value) && (rol.value !== editando.value?.role || nombre.value.trim() !== editando.value?.displayName || (rol.value === 'finanzas' && participanteId.value !== (editando.value?.participanteId ?? ''))),
)

async function guardar() {
  const u = editando.value
  if (!u) return
  intento.value = true
  errorModal.value = ''
  if (!nombre.value.trim() || !hayCambios.value) return
  const cambiaRol = rol.value !== u.role
  if (cambiaRol) {
    const ok = await confirmar({
      title: 'Cambiar rol',
      message: `¿Cambiar el rol de ${u.displayName} de "${rolLabel(u.role)}" a "${rolLabel(rol.value)}"? Deberá cerrar sesión y volver a entrar.`,
      confirmLabel: 'Cambiar rol',
      danger: rol.value === 'admin',
    })
    if (!ok) return
  }
  guardando.value = true
  try {
    const cambiaLiga = rol.value === 'finanzas' && participanteId.value !== (u.participanteId ?? '')
    await updatePerfil(u.id, {
      role: cambiaRol ? rol.value : undefined,
      displayName: nombre.value.trim() !== u.displayName ? nombre.value : undefined,
      participanteId: cambiaLiga ? participanteId.value || null : undefined,
    })
    toast(cambiaRol ? `Rol actualizado. ${u.displayName} debe volver a iniciar sesión.` : cambiaLiga ? 'Liga con el aprobador actualizada. Debe volver a iniciar sesión.' : 'Nombre actualizado.')
    editando.value = undefined
    await cargar()
  } catch (e) {
    errorModal.value = e instanceof Error ? e.message : String(e)
    toast(errorModal.value, 'error')
  } finally {
    guardando.value = false
  }
}
</script>
