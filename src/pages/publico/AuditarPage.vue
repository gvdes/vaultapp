<template>
  <div v-if="cargando" class="flex h-screen items-center justify-center bg-bg">
    <div class="h-8 w-8 animate-spin rounded-full border-2 border-vz-blue border-t-transparent" />
  </div>

  <!-- Liga inválida -->
  <div v-else-if="!aud" class="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
    <div class="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-lg">
      <div class="mb-4 flex justify-center"><Logo size="lg" /></div>
      <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-vz-danger/10 text-vz-danger">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-7 w-7">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h1 class="text-[16px] font-extrabold text-text">Liga de auditoría no válida</h1>
      <p class="mt-1 text-[13px] text-text-muted">Esta liga no corresponde a ninguna auditoría. Pide que te la vuelvan a compartir.</p>
    </div>
  </div>

  <!-- Ya enviada / cerrada / éxito -->
  <div v-else-if="enviado || aud.estado !== 'en_conteo'" class="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
    <div class="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-lg">
      <div class="mb-4 flex justify-center"><Logo size="lg" /></div>
      <div class="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-vz-success/10 text-vz-success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-8 w-8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      <template v-if="enviado || aud.estado === 'por_verificar'">
        <h1 class="text-[17px] font-extrabold text-text">¡Conteo enviado!</h1>
        <p class="mt-1 text-[13px] text-text-muted">
          Tu conteo de <span class="font-bold text-text">{{ aud.sucursal }}</span> quedó enviado a verificación. El responsable de inventario lo revisará; si necesita que
          vuelvas a contar algún artículo, te compartirá la misma liga.
        </p>
      </template>
      <template v-else>
        <h1 class="text-[17px] font-extrabold text-text">Auditoría cerrada</h1>
        <p class="mt-1 text-[13px] text-text-muted">La auditoría de {{ aud.sucursal }} ya fue verificada y cerrada. Ya no admite cambios. ¡Gracias por tu apoyo!</p>
      </template>
      <p class="mt-4 text-[11.5px] text-text-soft">Ya puedes cerrar esta página.</p>
    </div>
  </div>

  <!-- Conteo -->
  <div v-else class="min-h-screen bg-bg pb-32">
    <header class="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div class="mx-auto flex max-w-xl items-center gap-3 px-4 py-2.5">
        <Logo />
        <div class="min-w-0 flex-1">
          <p class="truncate text-[13px] font-extrabold text-text">{{ aud.sucursal }}</p>
          <p class="truncate text-[11.5px] text-text-muted">Auditoría física · {{ TIPO_AUDITORIA_LABEL[aud.tipo] }}</p>
        </div>
        <ThemeToggle />
      </div>
      <div class="mx-auto max-w-xl px-4 pb-2.5">
        <div class="mb-1 flex items-center justify-between text-[11.5px] font-semibold text-text-muted">
          <span>{{ contados }} de {{ aud.items.length }} contados</span>
          <span>{{ porcentaje }}%</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-border">
          <div class="h-full rounded-full bg-vz-success transition-all duration-300" :style="{ width: `${porcentaje}%` }" />
        </div>
      </div>
    </header>

    <main class="mx-auto flex max-w-xl flex-col gap-3 px-4 pt-4">
      <section class="rounded-xl border border-border bg-surface p-3.5 text-[12.5px] text-text-muted">
        <p class="font-bold text-text">Cuenta lo que realmente hay en sitio.</p>
        <p class="mt-0.5">
          Equipos: marca <b>Bien</b>, <b>Dañado</b> o <b>No encontrado</b>. Materiales: escribe la cantidad que cuentas (sin ver la existencia del sistema). Puedes agregar
          una nota y una foto como evidencia.
        </p>
        <p v-if="aud.alcance" class="mt-1.5 rounded-lg bg-bg px-2.5 py-1.5"><span class="font-bold text-text">Alcance:</span> {{ aud.alcance }}</p>
        <label class="mt-2.5 flex flex-col gap-1">
          <span class="text-[12px] font-semibold text-text">¿Quién cuenta?</span>
          <input v-model="contador" :class="inputClass" placeholder="Tu nombre" maxlength="120" @change="guardarContador" />
        </label>
      </section>

      <!-- Búsqueda + QR -->
      <section class="flex gap-2">
        <div class="relative flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-soft">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
          </svg>
          <input v-model="busqueda" type="search" :class="`${inputClass} !h-11 pl-8`" placeholder="Buscar por serie, modelo o nombre" />
        </div>
        <button
          v-if="soportaQR"
          type="button"
          class="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-vz-blue bg-vz-blue/10 px-3 text-[12.5px] font-bold text-vz-blue"
          @click="abrirEscaner"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
          </svg>
          Escanear QR
        </button>
      </section>
      <p v-if="!soportaQR" class="-mt-1 text-[11.5px] text-text-soft">Tu navegador no puede leer el QR de la etiqueta; busca el equipo por su número de serie.</p>
      <p v-if="avisoScan" class="rounded-lg border border-vz-blue/30 bg-vz-blue/10 px-3 py-2 text-[12px] font-semibold text-vz-blue">{{ avisoScan }}</p>

      <div class="flex gap-1.5">
        <button
          v-for="f in FILTROS"
          :key="f.id"
          type="button"
          :class="`h-9 flex-1 rounded-lg border text-[12.5px] font-bold ${filtro === f.id ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-surface text-text-muted'}`"
          @click="filtro = f.id"
        >
          {{ f.label }} ({{ f.id === 'todos' ? aud.items.length : f.id === 'pendientes' ? pendientes : contados }})
        </button>
      </div>

      <!-- Pedidos de reconteo -->
      <section v-if="reconteos.length > 0" class="flex flex-col gap-2">
        <h2 class="text-[12.5px] font-extrabold uppercase tracking-wide text-vz-warning">Volver a contar ({{ reconteos.length }})</h2>
        <ItemCard v-for="it in reconteos" :key="it.id" v-bind="itemProps(it)" />
      </section>

      <section v-if="equiposVisibles.length > 0" class="flex flex-col gap-2">
        <h2 class="text-[12.5px] font-extrabold uppercase tracking-wide text-text-muted">Equipos ({{ equiposVisibles.length }})</h2>
        <ItemCard v-for="it in equiposVisibles" :key="it.id" v-bind="itemProps(it)" />
      </section>

      <section v-if="materialesVisibles.length > 0" class="flex flex-col gap-2">
        <h2 class="text-[12.5px] font-extrabold uppercase tracking-wide text-text-muted">Materiales ({{ materialesVisibles.length }})</h2>
        <ItemCard v-for="it in materialesVisibles" :key="it.id" v-bind="itemProps(it)" />
      </section>

      <p v-if="aud.items.length === 0" class="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-text-soft">
        Esta auditoría no tiene artículos registrados. Puedes enviarla a verificación.
      </p>
      <p v-else-if="visiblesTotal === 0" class="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-text-soft">
        Ningún artículo coincide con tu búsqueda o filtro.
      </p>
    </main>

    <!-- Barra fija de envío -->
    <footer class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
      <div class="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
        <p class="min-w-0 flex-1 text-[12px] leading-snug text-text-muted">
          <template v-if="pendientes === 0"><b class="text-vz-success">Todo contado.</b> Revisa y envía.</template>
          <template v-else>
            Faltan <b class="text-text">{{ pendientes }}</b> artículo(s) por contar.
          </template>
        </p>
        <button
          type="button"
          :disabled="pendientes > 0"
          class="h-11 shrink-0 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          @click="confirmando = true"
        >
          Enviar a verificación
        </button>
      </div>
    </footer>

    <!-- Confirmación -->
    <div v-if="confirmando" class="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" @click="!enviando && (confirmando = false)">
      <div class="w-full max-w-md rounded-t-2xl border border-border bg-surface p-5 shadow-xl sm:rounded-2xl" @click.stop>
        <h2 class="text-[16px] font-extrabold text-text">¿Enviar a verificación?</h2>
        <p class="mt-1 text-[12.5px] text-text-muted">Resumen de tu conteo en {{ aud.sucursal }}:</p>
        <ul class="mt-3 flex flex-col gap-1.5 text-[13px]">
          <li class="flex justify-between"><span class="text-text-muted">Equipos en buen estado</span><b class="text-vz-success">{{ resumen.bien }}</b></li>
          <li class="flex justify-between"><span class="text-text-muted">Equipos dañados</span><b class="text-vz-warning">{{ resumen.danado }}</b></li>
          <li class="flex justify-between"><span class="text-text-muted">Equipos no encontrados</span><b class="text-vz-danger">{{ resumen.perdido }}</b></li>
          <li class="flex justify-between"><span class="text-text-muted">Materiales contados</span><b class="text-text">{{ resumen.materiales }}</b></li>
        </ul>
        <p class="mt-3 rounded-lg bg-bg px-3 py-2 text-[11.5px] text-text-muted">
          Al enviar ya no podrás cambiar tus respuestas, salvo que el verificador te pida contar de nuevo algún artículo.
        </p>
        <div class="mt-4 flex gap-2">
          <button type="button" :disabled="enviando" class="h-11 flex-1 rounded-lg border border-border bg-bg text-[13px] font-bold text-text-muted" @click="confirmando = false">
            Seguir revisando
          </button>
          <button type="button" :disabled="enviando" class="h-11 flex-1 rounded-lg bg-vz-success text-[13px] font-bold text-white disabled:opacity-60" @click="enviar">
            {{ enviando ? 'Enviando…' : 'Confirmar y enviar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Escáner QR -->
    <div v-if="escaneando" class="fixed inset-0 z-50 flex flex-col bg-black">
      <div class="flex items-center justify-between p-4 text-white">
        <p class="text-[14px] font-bold">Apunta al QR de la etiqueta</p>
        <button type="button" class="h-9 rounded-lg bg-white/15 px-3 text-[13px] font-bold" @click="cerrarEscaner">Cerrar</button>
      </div>
      <div class="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref="videoRef" class="h-full w-full object-cover" playsinline muted />
        <div class="pointer-events-none absolute h-56 w-56 rounded-2xl border-2 border-white/80" />
      </div>
      <p class="p-4 text-center text-[12.5px] text-white/85">{{ errorScan || 'Se detecta automáticamente. Si no lee, acércate o busca por número de serie.' }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import Logo from 'components/Logo.vue'
import ThemeToggle from 'components/ThemeToggle.vue'
import StatusPill from 'components/StatusPill.vue'
import { inputClass, textareaClass } from 'components/formClasses'
import { useToast } from 'src/composables/useToast'
import { comprimirFoto } from 'src/lib/inventario/fotoComprimida'
import { TIPO_AUDITORIA_LABEL } from 'src/lib/inventario/auditorias'
import {
  enviarAuditoriaPublica,
  fetchAuditoriaPublica,
  marcarEquipoPublico,
  marcarMaterialPublico,
} from 'src/lib/inventario/auditoriasPublico'

// Página pública (sin sesión): el token de la liga es la única credencial. Nunca muestra costos ni existencias esperadas.
const route = useRoute()
const toast = useToast()
const token = computed(() => String(route.params.token ?? ''))

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'contados', label: 'Contados' },
]
/** @typedef {(typeof FILTROS)[number]['id']} FiltroId */

const cargando = ref(true)
const aud = ref(null)
const enviado = ref(false)
const confirmando = ref(false)
const enviando = ref(false)
const busqueda = ref('')
const filtro = ref('todos')
const contador = ref('')
const avisoScan = ref('')
const fotos = reactive({})
const guardando = reactive({})
const resaltado = ref('')

const CLAVE_CONTADOR = 'dga_aud_contador'
const guardarContador = () => {
  try {
    localStorage.setItem(CLAVE_CONTADOR, contador.value.trim())
  } catch {
    /* sin almacenamiento: solo vive en esta sesión */
  }
}

onMounted(async () => {
  try {
    aud.value = await fetchAuditoriaPublica(token.value)
  } catch {
    aud.value = null
  } finally {
    cargando.value = false
  }
  let guardado = ''
  try {
    guardado = localStorage.getItem(CLAVE_CONTADOR) ?? ''
  } catch {
    /* ignorar */
  }
  contador.value = guardado || aud.value?.auditorNombre || ''
})

// ---- Estado de avance -------------------------------------------------------------------------------------------------
const marcado = (i) => (i.tipo === 'equipo' ? i.encontrado !== undefined : i.cantidadContada != null)
const esPendiente = (i) => i.reconteo || !marcado(i)
const pendientes = computed(() => (aud.value?.items ?? []).filter(esPendiente).length)
const contados = computed(() => (aud.value?.items.length ?? 0) - pendientes.value)
const porcentaje = computed(() => {
  const total = aud.value?.items.length ?? 0
  return total === 0 ? 100 : Math.round((contados.value / total) * 100)
})

const normalizar = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const coincideBusqueda = (i) => {
  const q = normalizar(busqueda.value.trim())
  if (!q) return true
  return [i.nombre, i.numeroSerie, i.marca, i.usuario, i.familia].some((v) => normalizar(v).includes(q))
}
const pasaFiltro = (i) => (filtro.value === 'todos' ? true : filtro.value === 'pendientes' ? esPendiente(i) : !esPendiente(i))
const visibles = computed(() => (aud.value?.items ?? []).filter((i) => coincideBusqueda(i) && pasaFiltro(i)))
const reconteos = computed(() => visibles.value.filter((i) => i.reconteo))
const equiposVisibles = computed(() => visibles.value.filter((i) => i.tipo === 'equipo' && !i.reconteo))
const materialesVisibles = computed(() => visibles.value.filter((i) => i.tipo === 'material' && !i.reconteo))
const visiblesTotal = computed(() => visibles.value.length)

const resumen = computed(() => {
  const items = aud.value?.items ?? []
  return {
    bien: items.filter((i) => i.tipo === 'equipo' && i.encontrado && i.condicion !== 'danado').length,
    danado: items.filter((i) => i.tipo === 'equipo' && i.encontrado && i.condicion === 'danado').length,
    perdido: items.filter((i) => i.tipo === 'equipo' && i.encontrado === false).length,
    materiales: items.filter((i) => i.tipo === 'material' && i.cantidadContada != null).length,
  }
})

// ---- Guardado de marcas -----------------------------------------------------------------------------------------------
function actualizarLocal(id, parche) {
  const a = aud.value
  if (!a) return
  const idx = a.items.findIndex((i) => i.id === id)
  if (idx >= 0) a.items[idx] = { ...a.items[idx], ...parche }
}

async function guardarEquipo(it, encontrado, condicion, notas, foto) {
  guardando[it.id] = true
  try {
    await marcarEquipoPublico(token.value, it.id, { encontrado, condicion, notas, fotoUrl: foto, contadoPor: contador.value })
    guardarContador()
    actualizarLocal(it.id, {
      encontrado,
      condicion: encontrado ? (condicion ?? 'bien') : 'perdido',
      notas: notas.trim() || undefined,
      reconteo: false,
      tieneFoto: foto === undefined ? it.tieneFoto : Boolean(foto),
    })
    if (foto !== undefined) {
      if (foto) fotos[it.id] = foto
      else delete fotos[it.id]
    }
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.', 'error')
  } finally {
    guardando[it.id] = false
  }
}

async function guardarMaterial(it, cantidad, notas, foto) {
  guardando[it.id] = true
  try {
    await marcarMaterialPublico(token.value, it.id, { cantidadContada: cantidad, notas, fotoUrl: foto, contadoPor: contador.value })
    guardarContador()
    actualizarLocal(it.id, {
      cantidadContada: cantidad,
      notas: notas.trim() || undefined,
      reconteo: false,
      tieneFoto: foto === undefined ? it.tieneFoto : Boolean(foto),
    })
    if (foto !== undefined) {
      if (foto) fotos[it.id] = foto
      else delete fotos[it.id]
    }
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.', 'error')
  } finally {
    guardando[it.id] = false
  }
}

async function enviar() {
  enviando.value = true
  try {
    await enviarAuditoriaPublica(token.value)
    enviado.value = true
    confirmando.value = false
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo enviar el conteo.', 'error')
  } finally {
    enviando.value = false
  }
}

// ---- Tarjeta de ítem (componente local) -------------------------------------------------------------------------------
const itemProps = (it) => ({
  it,
  foto: fotos[it.id] ?? it.fotoUrl,
  guardando: Boolean(guardando[it.id]),
  resaltado: resaltado.value === it.id,
  fnEquipo: guardarEquipo,
  fnMaterial: guardarMaterial,
})

const ItemCard = defineComponent({
  name: 'ItemCard',
  props: {
    it: { type: Object, required: true },
    foto: { type: String, default: undefined },
    guardando: { type: Boolean, default: false },
    resaltado: { type: Boolean, default: false },
    fnEquipo: { type: Function, required: true },
    fnMaterial: { type: Function, required: true },
  },
  setup(props) {
    const nota = ref(props.it.notas ?? '')
    const cantidad = ref(props.it.cantidadContada != null ? String(props.it.cantidadContada) : '')
    const abierto = ref(false)
    const fotoInput = ref(null)

    const estadoEquipo = () => (props.it.encontrado === undefined ? '' : props.it.encontrado === false ? 'perdido' : props.it.condicion === 'danado' ? 'danado' : 'bien')

    const marcarEquipo = (est) => {
      void props.fnEquipo(props.it, est !== 'perdido', est === 'perdido' ? undefined : est, nota.value)
      if (est !== 'bien') abierto.value = true
    }
    const guardarNota = () => {
      if (!marcado(props.it)) return
      if ((props.it.notas ?? '') === nota.value.trim()) return
      if (props.it.tipo === 'equipo') {
        const est = estadoEquipo()
        if (est) void props.fnEquipo(props.it, est !== 'perdido', est === 'perdido' ? undefined : est, nota.value)
      } else if (cantidad.value !== '') {
        void props.fnMaterial(props.it, Number(cantidad.value), nota.value)
      }
    }
    const guardarCantidad = () => {
      const n = Number(cantidad.value)
      if (cantidad.value === '' || !Number.isFinite(n) || n < 0) {
        toast('Escribe una cantidad válida (0 o más).', 'error')
        return
      }
      void props.fnMaterial(props.it, n, nota.value)
    }
    const alElegirFoto = async (ev) => {
      const input = ev.target
      const file = input.files?.[0]
      input.value = ''
      if (!file) return
      try {
        const data = await comprimirFoto(file)
        if (props.it.tipo === 'equipo') {
          const est = estadoEquipo()
          if (est) await props.fnEquipo(props.it, est !== 'perdido', est === 'perdido' ? undefined : est, nota.value, data)
        } else {
          await props.fnMaterial(props.it, Number(cantidad.value), nota.value, data)
        }
      } catch {
        toast('No se pudo procesar la foto.', 'error')
      }
    }
    const quitarFoto = () => {
      if (props.it.tipo === 'equipo') {
        const est = estadoEquipo()
        if (est) void props.fnEquipo(props.it, est !== 'perdido', est === 'perdido' ? undefined : est, nota.value, '')
      } else {
        void props.fnMaterial(props.it, Number(cantidad.value), nota.value, '')
      }
    }

    const ESTILO_BOTON = {
      bien: { on: 'border-transparent bg-vz-success text-white', off: 'border-vz-success/30 bg-vz-success/10 text-vz-success' },
      danado: { on: 'border-transparent bg-vz-warning text-white', off: 'border-vz-warning/30 bg-vz-warning/10 text-vz-warning' },
      perdido: { on: 'border-transparent bg-vz-danger text-white', off: 'border-vz-danger/30 bg-vz-danger/10 text-vz-danger' },
    }

    const botonEstado = (est, label) => {
      const activo = estadoEquipo() === est && !props.it.reconteo
      return h(
        'button',
        {
          type: 'button',
          disabled: props.guardando,
          class: `h-11 rounded-lg border text-[12.5px] font-bold transition-colors disabled:opacity-60 ${activo ? ESTILO_BOTON[est].on : ESTILO_BOTON[est].off}`,
          onClick: () => marcarEquipo(est),
        },
        label,
      )
    }

    return () => {
      const it = props.it
      const esEquipo = it.tipo === 'equipo'
      const hecho = marcado(it) && !it.reconteo
      const mostrarDetalle = abierto.value || (hecho && (Boolean(nota.value) || it.tieneFoto || estadoEquipo() === 'danado' || estadoEquipo() === 'perdido'))
      const puedeDetallar = marcado(it)

      const detalleEquipo = [it.marca, it.numeroSerie ? `Serie ${it.numeroSerie}` : undefined, it.usuario ? `Asignado a ${it.usuario}` : undefined].filter(Boolean).join(' · ')
      const detalleMaterial = [it.marca, it.familia, it.unidad ? `Unidad: ${it.unidad}` : undefined].filter(Boolean).join(' · ')

      return h(
        'article',
        {
          id: `item-${it.id}`,
          class: `rounded-xl border bg-surface p-3 transition-shadow ${
            props.resaltado ? 'border-vz-blue ring-2 ring-vz-blue/40' : it.reconteo ? 'border-vz-warning/60' : hecho ? 'border-vz-success/30' : 'border-border'
          }`,
        },
        [
          h('div', { class: 'mb-2 flex items-start justify-between gap-2' }, [
            h('div', { class: 'min-w-0' }, [
              h('p', { class: 'break-words text-[13.5px] font-extrabold text-text' }, it.nombre),
              h('p', { class: 'break-words text-[12px] text-text-muted' }, esEquipo ? detalleEquipo || '—' : detalleMaterial || '—'),
            ]),
            hecho
              ? h(StatusPill, {
                  label: esEquipo ? (estadoEquipo() === 'perdido' ? 'No encontrado' : estadoEquipo() === 'danado' ? 'Dañado' : 'Bien') : `Contado: ${it.cantidadContada}`,
                  tone: esEquipo ? (estadoEquipo() === 'perdido' ? 'danger' : estadoEquipo() === 'danado' ? 'warning' : 'success') : 'success',
                })
              : null,
          ]),
          it.reconteo
            ? h(
                'p',
                { class: 'mb-2 rounded-lg border border-vz-warning/30 bg-vz-warning/10 px-2.5 py-1.5 text-[12px] text-vz-warning' },
                `El verificador pidió contar este artículo de nuevo${it.notaReconteo ? `: ${it.notaReconteo}` : '.'}`,
              )
            : null,
          esEquipo
            ? h('div', { class: 'grid grid-cols-3 gap-1.5' }, [botonEstado('bien', 'Bien'), botonEstado('danado', 'Dañado'), botonEstado('perdido', 'No encontrado')])
            : h('div', { class: 'flex gap-2' }, [
                h('input', {
                  type: 'number',
                  inputmode: 'decimal',
                  min: 0,
                  step: 'any',
                  value: cantidad.value,
                  placeholder: 'Cantidad contada',
                  class: `${inputClass} !h-11 flex-1`,
                  onInput: (e) => (cantidad.value = e.target.value),
                  onKeydown: (e) => {
                    if (e.key === 'Enter') guardarCantidad()
                  },
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    disabled: props.guardando,
                    class: 'h-11 shrink-0 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white disabled:opacity-60',
                    onClick: guardarCantidad,
                  },
                  props.guardando ? 'Guardando…' : hecho ? 'Actualizar' : 'Guardar',
                ),
              ]),
          puedeDetallar && !mostrarDetalle
            ? h('button', { type: 'button', class: 'mt-2 text-[12px] font-semibold text-vz-blue', onClick: () => (abierto.value = true) }, 'Agregar nota o foto')
            : null,
          mostrarDetalle
            ? h('div', { class: 'mt-2.5 flex flex-col gap-2 border-t border-border pt-2.5' }, [
                h('textarea', {
                  value: nota.value,
                  rows: 2,
                  maxlength: 1000,
                  placeholder: 'Nota (opcional): ¿qué le pasa, dónde estaba, quién lo tiene…?',
                  class: textareaClass,
                  onInput: (e) => (nota.value = e.target.value),
                  onBlur: guardarNota,
                }),
                h('div', { class: 'flex items-center gap-2' }, [
                  h(
                    'label',
                    {
                      class: `flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-bg px-3 text-[12.5px] font-bold text-text-muted ${puedeDetallar ? '' : 'opacity-50'}`,
                    },
                    [
                      '📷 ' + (props.foto || it.tieneFoto ? 'Cambiar foto' : 'Tomar foto'),
                      h('input', { ref: fotoInput, type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden', disabled: !puedeDetallar, onChange: alElegirFoto }),
                    ],
                  ),
                  props.foto
                    ? h('img', { src: props.foto, alt: 'Evidencia', class: 'h-10 w-10 rounded-lg border border-border object-cover' })
                    : it.tieneFoto
                      ? h('span', { class: 'text-[12px] text-text-muted' }, 'Foto adjunta')
                      : null,
                  props.foto || it.tieneFoto
                    ? h('button', { type: 'button', class: 'ml-auto text-[12px] font-semibold text-vz-danger', onClick: quitarFoto }, 'Quitar')
                    : null,
                ]),
              ])
            : null,
        ],
      )
    }
  },
})

// ---- Lectura de QR (BarcodeDetector, si el navegador lo trae) ---------------------------------------------------------
/**
 * @typedef {object} DetectorLike
 * @property {(source: CanvasImageSource) => Promise<{ rawValue: string }[]>} detect
 */
/** @typedef {new (opts: { formats: string[] }) => DetectorLike} DetectorCtor */
const detectorCtor = typeof window !== 'undefined' ? (window).BarcodeDetector : undefined
const soportaQR = Boolean(detectorCtor) && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

const escaneando = ref(false)
const errorScan = ref('')
const videoRef = ref(null)
let stream = null
let timer = null
let detector = null

function detenerCamara() {
  if (timer) clearTimeout(timer)
  timer = null
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

function cerrarEscaner() {
  detenerCamara()
  escaneando.value = false
}

async function abrirEscaner() {
  if (!detectorCtor) return
  errorScan.value = ''
  avisoScan.value = ''
  escaneando.value = true
  await nextTick()
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    const video = videoRef.value
    if (!video) return
    video.srcObject = stream
    await video.play()
    detector = new detectorCtor({ formats: ['qr_code'] })
    bucle()
  } catch {
    errorScan.value = 'No se pudo abrir la cámara (¿diste permiso?). Busca el equipo por su número de serie.'
  }
}

function bucle() {
  timer = setTimeout(async () => {
    const video = videoRef.value
    if (!escaneando.value || !video || !detector) return
    try {
      const codigos = await detector.detect(video)
      for (const c of codigos) {
        if (procesarCodigo(c.rawValue)) return
      }
    } catch {
      /* fotograma ilegible: se reintenta */
    }
    bucle()
  }, 300)
}

/** Devuelve true si el código coincidió con un artículo de esta auditoría (y cierra el escáner). */
function procesarCodigo(raw) {
  const eq = /\/verificar\/equipo\/([^/?#\s]+)/.exec(raw)
  const ma = /\/verificar\/material\/([^/?#\s]+)/.exec(raw)
  const id = eq?.[1] ?? ma?.[1]
  if (!id || !aud.value) {
    errorScan.value = 'Ese QR no es de una etiqueta de inventario.'
    return false
  }
  const item = aud.value.items.find((i) => (eq ? i.equipoId === id : i.materialId === id))
  if (!item) {
    errorScan.value = 'Ese artículo no forma parte de esta auditoría.'
    return false
  }
  cerrarEscaner()
  busqueda.value = ''
  filtro.value = 'todos'
  resaltado.value = item.id
  avisoScan.value = `Encontrado: ${item.nombre}${item.numeroSerie ? ` · ${item.numeroSerie}` : ''}`
  void nextTick(() => document.getElementById(`item-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  setTimeout(() => {
    if (resaltado.value === item.id) resaltado.value = ''
  }, 6000)
  return true
}

onBeforeUnmount(detenerCamara)
</script>
