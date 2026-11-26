<template>
  <PublicShell activo="estatus" ancho="normal">
    <!-- Búsqueda por folio + clave -->
    <div v-if="modoBusqueda" class="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h1 class="text-[24px] font-extrabold leading-tight text-text sm:text-[28px]">Consultar estatus</h1>
        <p class="mt-1 text-[14px] leading-snug text-text-muted">Escribe el folio de tu requisición y la clave que te llegó en el correo de confirmación. También puedes pegar aquí la liga completa.</p>
      </div>

      <form :class="`${tarjeta} flex flex-col gap-3.5`" novalidate @submit.prevent="buscar">
        <CampoForm label="Folio" for-id="b-folio" required :error="errorBusqueda && !folioBusqueda.trim() ? 'Escribe tu folio.' : undefined" hint="Se ve así: REQ-20261021-143005">
          <input id="b-folio" v-model="folioBusqueda" :class="`${inp} uppercase`" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="REQ-AAAAMMDD-HHMMSS" />
        </CampoForm>
        <CampoForm label="Clave de seguimiento" for-id="b-clave" required :error="errorBusqueda && !claveBusqueda.trim() ? 'Escribe tu clave.' : undefined" hint="Es la parte final de la liga de seguimiento de tu correo.">
          <input id="b-clave" v-model="claveBusqueda" :class="inp" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Pega aquí tu clave o tu liga" @input="detectarLiga" @paste="alPegar" />
        </CampoForm>
        <p v-if="errorBusqueda" role="alert" class="text-[12.5px] font-semibold text-vz-danger">{{ errorBusqueda }}</p>
        <button type="submit" :class="btnPrimario">Ver el avance</button>
      </form>

      <div v-if="mias.length" :class="tarjeta">
        <h2 class="text-[15px] font-extrabold text-text">Tus requisiciones en este dispositivo</h2>
        <p class="mt-0.5 text-[12.5px] text-text-muted">Las que levantaste desde aquí. Toca una para ver su avance.</p>
        <ul class="mt-3 flex flex-col gap-2">
          <li v-for="m in mias" :key="m.folio" class="flex items-center gap-2">
            <RouterLink :to="RUTAS_COMPRAS.estatus(m.folio, m.token)" class="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-border bg-bg px-3.5 py-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-vz-blue">
              <span class="min-w-0">
                <span class="block truncate text-[14px] font-extrabold text-text">{{ m.folio }}</span>
                <span class="block text-[12px] text-text-muted">{{ fechaCorta(m.fecha) }}<template v-if="m.solicitante"> · {{ m.solicitante }}</template></span>
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4 shrink-0 text-text-soft" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
            </RouterLink>
            <button type="button" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-soft hover:bg-surface-hover hover:text-vz-danger focus-visible:outline-2 focus-visible:outline-vz-blue" :aria-label="`Quitar ${m.folio} de esta lista`" title="Quitar de esta lista (no cancela la requisición)" @click="olvidar(m.folio)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Cargando -->
    <div v-else-if="cargando" class="flex flex-col gap-4" role="status" aria-live="polite" aria-label="Cargando el seguimiento">
      <div :class="`${tarjeta} flex flex-col gap-3`">
        <SkeletonBlock cls="h-4 w-24" />
        <SkeletonBlock cls="h-9 w-72 max-w-full" />
        <SkeletonBlock cls="h-12 w-56 max-w-full" />
      </div>
      <div :class="`${tarjeta} flex flex-col gap-4`">
        <SkeletonBlock v-for="i in 4" :key="i" cls="h-10 w-full" />
      </div>
    </div>

    <!-- Liga inválida -->
    <div v-else-if="invalida" :class="`${tarjeta} mx-auto mt-4 max-w-lg text-center`">
      <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-vz-warning/15 text-vz-warning">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-7 w-7" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      </div>
      <h1 class="text-[19px] font-extrabold text-text">Esta liga no es válida o ya venció</h1>
      <p class="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-snug text-text-muted">No encontramos ninguna requisición con ese folio y clave. Revisa que la liga esté completa, o escribe tu folio y clave a mano.</p>
      <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <RouterLink :to="RUTAS_COMPRAS.estatus('buscar', 'buscar')" :class="btnPrimario">Escribir folio y clave</RouterLink>
        <RouterLink :to="RUTAS_COMPRAS.nueva" :class="btnSecundario">Nueva requisición</RouterLink>
      </div>
    </div>

    <!-- Error al consultar -->
    <div v-else-if="errorCarga && !est" :class="`${tarjeta} mx-auto mt-4 max-w-lg text-center`" role="alert">
      <h1 class="text-[18px] font-extrabold text-text">No pudimos consultar tu requisición</h1>
      <p class="mt-1 text-[13.5px] text-text-muted">{{ errorCarga }}</p>
      <button type="button" :class="`${btnPrimario} mt-4`" @click="cargar(false)">Reintentar</button>
    </div>

    <!-- Seguimiento -->
    <div v-else-if="est" class="flex flex-col gap-4">
      <!-- Encabezado -->
      <section :class="tarjeta" aria-labelledby="seg-folio">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[11.5px] font-extrabold uppercase tracking-[0.14em] text-text-soft">Tu requisición</p>
            <h1 id="seg-folio" class="mt-0.5 break-all text-[22px] font-extrabold leading-tight text-text sm:text-[26px]">{{ est.folio }}</h1>
          </div>
          <button type="button" :class="`${btnSecundario} h-10 px-3.5`" :disabled="actualizando" @click="cargar(true)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" :class="`h-4 w-4 ${actualizando ? 'animate-spin motion-reduce:animate-none' : ''}`" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {{ actualizando ? 'Actualizando…' : 'Actualizar' }}
          </button>
        </div>

        <div class="mt-4 flex items-center gap-3 rounded-2xl border px-4 py-3.5" :style="estiloEstado" role="status" aria-live="polite">
          <span class="h-3.5 w-3.5 shrink-0 rounded-full" :style="{ backgroundColor: info.color }" aria-hidden="true" />
          <div class="min-w-0">
            <p class="text-[11.5px] font-bold uppercase tracking-wider text-text-muted">Estatus actual</p>
            <p class="text-[20px] font-extrabold leading-tight text-text sm:text-[22px]">{{ info.label }}</p>
          </div>
          <span v-if="est.urgencia === 'urgente'" class="ml-auto shrink-0 rounded-full bg-vz-danger px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">Urgente</span>
        </div>

        <p class="mt-3 text-[13.5px] leading-snug text-text"><span class="font-extrabold">¿Qué sigue?</span> {{ siguientePaso }}</p>
        <p class="mt-1.5 text-[12.5px] text-text-muted">
          {{ tiempoTexto }}
          <span v-if="actualizadoEn" class="text-text-soft"> · Actualizado {{ hace(actualizadoEn, ahoraMs) }}</span>
        </p>
      </section>

      <!-- Avisos laterales -->
      <section v-if="est.estado === 'en_espera'" class="flex gap-3 rounded-2xl border border-vz-warning/45 bg-vz-warning/10 p-4" role="note">
        <svg viewBox="0 0 24 24" fill="currentColor" class="mt-0.5 h-6 w-6 shrink-0 text-vz-warning" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.500 5H17v14h-3.500z" /></svg>
        <div>
          <p class="text-[15px] font-extrabold text-text">Tu requisición está en espera</p>
          <p class="mt-0.5 text-[13.5px] leading-snug text-text-muted">Se detuvo de forma temporal en la etapa «{{ etapaDondeSeDetuvo }}». Adquisiciones te explica el motivo y te avisa por correo cuando se reanude. Si lo necesitas pronto, contáctalos directamente.</p>
        </div>
      </section>
      <section v-else-if="est.estado === 'rechazada'" class="flex gap-3 rounded-2xl border border-vz-danger/45 bg-vz-danger/10 p-4" role="note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="mt-0.5 h-6 w-6 shrink-0 text-vz-danger" aria-hidden="true"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
        <div>
          <p class="text-[15px] font-extrabold text-text">Esta requisición no fue autorizada</p>
          <p class="mt-0.5 text-[13.5px] leading-snug text-text-muted">El motivo de la decisión te llegó por correo. Si todavía necesitas lo solicitado, levanta una requisición nueva con los ajustes que se indicaron.</p>
          <RouterLink :to="RUTAS_COMPRAS.nueva" :class="`${btnSecundario} mt-3`">Hacer una nueva requisición</RouterLink>
        </div>
      </section>
      <section v-else-if="est.estado === 'cancelada'" class="flex gap-3 rounded-2xl border border-border bg-surface p-4" role="note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mt-0.5 h-6 w-6 shrink-0 text-text-soft" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
        <div>
          <p class="text-[15px] font-extrabold text-text">Esta requisición fue cancelada</p>
          <p class="mt-0.5 text-[13.5px] leading-snug text-text-muted">El motivo se te avisó por correo. Nada se borra: el registro queda como historial. Si aún lo necesitas, levanta una nueva.</p>
          <RouterLink :to="RUTAS_COMPRAS.nueva" :class="`${btnSecundario} mt-3`">Hacer una nueva requisición</RouterLink>
        </div>
      </section>

      <!-- Confirmar recibido -->
      <section v-if="est.puedeConfirmar" class="rounded-2xl border-2 border-vz-success/50 bg-vz-success/10 p-4 sm:p-5" aria-labelledby="seg-recibi">
        <h2 id="seg-recibi" class="text-[17px] font-extrabold text-text">¿Ya tienes tu pedido en las manos?</h2>
        <p class="mt-1 text-[13.5px] leading-snug text-text-muted">Cuando lo recibas completo, confírmalo para cerrar la requisición. Si algo falta o llegó mal, no confirmes y avísale a Adquisiciones.</p>
        <button type="button" :class="`${btnPrimario} mt-3 w-full bg-vz-success hover:bg-vz-success hover:opacity-90 sm:w-auto`" :disabled="confirmandoRecibido" @click="yaRecibi">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="h-4 w-4" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          {{ confirmandoRecibido ? 'Confirmando…' : 'Ya recibí mi pedido' }}
        </button>
      </section>
      <section v-else-if="est.estado === 'entregada'" class="flex gap-3 rounded-2xl border border-vz-success/45 bg-vz-success/10 p-4" role="note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="mt-0.5 h-6 w-6 shrink-0 text-vz-success" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        <div>
          <p class="text-[15px] font-extrabold text-text">¡Listo! Recibiste tu pedido</p>
          <p class="mt-0.5 text-[13.5px] leading-snug text-text-muted">La requisición quedó cerrada. Gracias por confirmar.</p>
        </div>
      </section>

      <!-- Etapas -->
      <section :class="tarjeta" aria-labelledby="seg-etapas">
        <h2 id="seg-etapas" class="mb-4 text-[16px] font-extrabold text-text">Avance de tu requisición</h2>
        <EstadoStepper :estado="est.estado" :historial="est.historial" />
      </section>

      <!-- Productos -->
      <section :class="tarjeta" aria-labelledby="seg-productos">
        <h2 id="seg-productos" class="mb-3 text-[16px] font-extrabold text-text">Lo que pediste</h2>
        <ul class="divide-y divide-border rounded-xl border border-border">
          <li v-for="p in est.partidas" :key="p.num" class="flex items-center gap-3 px-3.5 py-3">
            <span class="flex h-7 min-w-7 items-center justify-center rounded-full bg-vz-blue/12 px-1.5 text-[12px] font-extrabold text-vz-blue" aria-hidden="true">{{ p.num }}</span>
            <span class="min-w-0 flex-1 text-[14px] font-semibold text-text">{{ p.producto }}</span>
            <span class="shrink-0 rounded-lg bg-bg px-2.5 py-1 text-[13px] font-extrabold text-text">× {{ p.cantidad }}</span>
          </li>
        </ul>
      </section>

      <!-- Datos -->
      <section :class="tarjeta" aria-labelledby="seg-datos">
        <h2 id="seg-datos" class="mb-3 text-[16px] font-extrabold text-text">Datos de la requisición</h2>
        <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div><dt class="text-[12px] font-bold uppercase tracking-wider text-text-soft">Solicitante</dt><dd class="mt-0.5 text-[14px] font-semibold text-text">{{ est.solicitante }}</dd></div>
          <div><dt class="text-[12px] font-bold uppercase tracking-wider text-text-soft">Área</dt><dd class="mt-0.5 text-[14px] font-semibold text-text">{{ est.area || '—' }}</dd></div>
          <div class="sm:col-span-2">
            <dt class="text-[12px] font-bold uppercase tracking-wider text-text-soft">Sucursal(es)</dt>
            <dd class="mt-1 flex flex-wrap gap-1.5">
              <span v-for="s in est.sucursales" :key="s" class="rounded-full border border-border bg-bg px-2.5 py-1 text-[12.5px] font-semibold text-text">{{ s }}</span>
              <span v-if="!est.sucursales.length" class="text-[14px] font-semibold text-text">—</span>
            </dd>
          </div>
          <div><dt class="text-[12px] font-bold uppercase tracking-wider text-text-soft">Fecha de solicitud</dt><dd class="mt-0.5 text-[14px] font-semibold text-text">{{ fechaHora(est.creada) }}</dd></div>
          <div><dt class="text-[12px] font-bold uppercase tracking-wider text-text-soft">Urgencia</dt><dd class="mt-0.5 text-[14px] font-semibold text-text">{{ est.urgencia === 'urgente' ? 'Urgente' : 'Normal' }}</dd></div>
        </dl>
        <p class="mt-4 text-[12px] leading-snug text-text-soft">Por seguridad, aquí no se muestran proveedores, precios ni montos.</p>
      </section>

      <div class="flex justify-center pt-1">
        <RouterLink :to="RUTAS_COMPRAS.estatus('buscar', 'buscar')" class="text-[13px] font-bold text-vz-blue underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-vz-blue">Consultar otra requisición</RouterLink>
      </div>
    </div>
  </PublicShell>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PublicShell from 'components/compras/publico/PublicShell.vue'
import SkeletonBlock from 'components/compras/publico/SkeletonBlock.vue'
import CampoForm from 'components/compras/publico/CampoForm.vue'
import EstadoStepper from 'components/compras/publico/EstadoStepper.vue'
import { btnPrimario, btnSecundario, duracion, fechaCorta, fechaHora, hace, inp, tarjeta } from 'components/compras/publico/estilos'
import { listarMisRequisiciones, olvidarRequisicion } from 'components/compras/publico/misRequisiciones'
import { useToast } from 'src/composables/useToast'
import { useConfirm } from 'src/composables/useConfirm'
import { ESTADOS, ESTADOS_FLUJO, RUTAS_COMPRAS, confirmarRecibido, consultarRequisicionPublica } from 'src/lib/compras'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirmar = useConfirm()

const folioRuta = computed(() => String(route.params.folio ?? ''))
const tokenRuta = computed(() => String(route.params.token ?? ''))
const modoBusqueda = computed(() => tokenRuta.value === 'buscar')

// ---------------------------------------------------------------------------------------------------------------------
// Búsqueda por folio + clave
// ---------------------------------------------------------------------------------------------------------------------
const folioBusqueda = ref(folioRuta.value && folioRuta.value !== 'buscar' ? folioRuta.value : '')
const claveBusqueda = ref('')
const errorBusqueda = ref('')
const mias = ref([])

function refrescarMias() {
  mias.value = listarMisRequisiciones()
}
function olvidar(folio) {
  olvidarRequisicion(folio)
  refrescarMias()
}
/** Si pegan la liga completa, se separa folio y clave solos. */
function extraerDeLiga(texto) {
  const m = texto.match(/estatus\/([^/\s?#]+)\/([^/\s?#]+)/i)
  return m ? { folio: decodeURIComponent(m[1]), token: decodeURIComponent(m[2]) } : null
}
function detectarLiga() {
  const x = extraerDeLiga(claveBusqueda.value)
  if (x) {
    folioBusqueda.value = x.folio
    claveBusqueda.value = x.token
  }
}
function alPegar(ev) {
  const t = ev.clipboardData?.getData('text') ?? ''
  const x = extraerDeLiga(t)
  if (x) {
    ev.preventDefault()
    folioBusqueda.value = x.folio
    claveBusqueda.value = x.token
  }
}
function buscar() {
  errorBusqueda.value = ''
  const folio = folioBusqueda.value.trim().toUpperCase()
  const clave = claveBusqueda.value.trim()
  if (!folio || !clave) {
    errorBusqueda.value = 'Escribe tu folio y tu clave para continuar.'
    return
  }
  if (clave.toLowerCase() === 'buscar' || folio.toLowerCase() === 'buscar') {
    errorBusqueda.value = 'Esa clave no es válida. Cópiala del correo que recibiste.'
    return
  }
  void router.push(RUTAS_COMPRAS.estatus(folio, clave))
}

// ---------------------------------------------------------------------------------------------------------------------
// Seguimiento
// ---------------------------------------------------------------------------------------------------------------------
const est = ref(null)
const cargando = ref(!modoBusqueda.value)
const actualizando = ref(false)
const invalida = ref(false)
const errorCarga = ref('')
const actualizadoEn = ref(0)
const ahoraMs = ref(Date.now())
const confirmandoRecibido = ref(false)
let reloj
let peticion = 0

async function cargar(manual) {
  if (modoBusqueda.value) return
  const mia = ++peticion
  errorCarga.value = ''
  if (manual && est.value) actualizando.value = true
  else {
    cargando.value = true
    invalida.value = false
  }
  try {
    const r = await consultarRequisicionPublica(folioRuta.value, tokenRuta.value)
    if (mia !== peticion) return
    if (!r) {
      est.value = null
      invalida.value = true
    } else {
      est.value = r
      invalida.value = false
      actualizadoEn.value = Date.now()
      ahoraMs.value = Date.now()
    }
  } catch (e) {
    if (mia !== peticion) return
    errorCarga.value = e instanceof Error && e.message ? 'Revisa tu conexión e intenta de nuevo.' : 'Intenta de nuevo en unos minutos.'
    if (manual && est.value) toast('No pudimos actualizar. Intenta de nuevo.', 'error')
  } finally {
    if (mia === peticion) {
      cargando.value = false
      actualizando.value = false
    }
  }
}

function iniciar() {
  est.value = null
  invalida.value = false
  errorCarga.value = ''
  if (modoBusqueda.value) {
    refrescarMias()
    folioBusqueda.value = folioRuta.value && folioRuta.value !== 'buscar' ? folioRuta.value : folioBusqueda.value
    cargando.value = false
  } else {
    void cargar(false)
  }
}
watch(() => [folioRuta.value, tokenRuta.value], iniciar)
onMounted(() => {
  iniciar()
  reloj = setInterval(() => (ahoraMs.value = Date.now()), 30000)
})
onBeforeUnmount(() => clearInterval(reloj))

// ---------------------------------------------------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------------------------------------------------
const info = computed(() => ESTADOS[est.value?.estado ?? 'recibida'])
const estiloEstado = computed(() => ({
  backgroundColor: `color-mix(in srgb, ${info.value.color} 12%, transparent)`,
  borderColor: `color-mix(in srgb, ${info.value.color} 45%, transparent)`,
}))

const SIGUIENTE = {
  recibida: 'Adquisiciones va a revisar tu solicitud y empezará a pedir cotizaciones a proveedores.',
  en_cotizacion: 'Estamos comparando proveedores para elegir la mejor opción. Después se manda a autorización.',
  en_autorizacion: 'Finanzas está revisando la compra para autorizarla.',
  autorizada: 'Ya está autorizada. Se está gestionando el dinero para que Adquisiciones pueda comprar.',
  fondeada: 'Adquisiciones ya tiene el dinero y está haciendo la compra.',
  comprada: 'Ya se compró. Cuando tengas el pedido en tus manos, confirma abajo con el botón «Ya recibí mi pedido».',
  entregada: 'No falta nada: la requisición está cerrada.',
  en_espera: 'Adquisiciones te avisará por correo en cuanto se reanude el proceso.',
  rechazada: 'No se continuará con esta compra. Si todavía la necesitas, levanta una requisición nueva.',
  cancelada: 'No se continuará con esta compra. Si todavía la necesitas, levanta una requisición nueva.',
}
const siguientePaso = computed(() => SIGUIENTE[est.value?.estado ?? 'recibida'])

const ultimoMovimiento = computed(() => {
  const h = est.value?.historial ?? []
  return h.length ? h[h.length - 1].fecha : est.value?.creada ?? 0
})
const tiempoTexto = computed(() => {
  const e = est.value
  if (!e) return ''
  if (ESTADOS[e.estado].terminal) return `Proceso cerrado en ${duracion(e.creada, ultimoMovimiento.value)} desde que la levantaste.`
  return `Llevas ${duracion(e.creada, ahoraMs.value)} desde que la levantaste.`
})

const etapaDondeSeDetuvo = computed(() => {
  let max = 0
  for (const h of est.value?.historial ?? []) max = Math.max(max, ESTADOS_FLUJO.indexOf(h.estado))
  return ESTADOS[ESTADOS_FLUJO[max]].corta
})

async function yaRecibi() {
  const e = est.value
  if (!e || confirmandoRecibido.value) return
  const ok = await confirmar({
    title: '¿Ya recibiste tu pedido?',
    message: `Al confirmar, la requisición ${e.folio} queda cerrada. Hazlo solo si recibiste todo lo solicitado.`,
    confirmLabel: 'Sí, ya lo recibí',
    cancelLabel: 'Todavía no',
  })
  if (!ok) return
  confirmandoRecibido.value = true
  try {
    const r = await confirmarRecibido(folioRuta.value, tokenRuta.value)
    toast(r.mensaje || 'Gracias, quedó registrada la recepción.')
    await cargar(true)
  } catch (err) {
    toast(err instanceof Error && err.message ? err.message : 'No pudimos registrar la confirmación. Intenta de nuevo.', 'error')
  } finally {
    confirmandoRecibido.value = false
  }
}
</script>
