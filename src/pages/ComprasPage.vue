<template>
  <div class="mx-auto min-h-full w-full min-w-0 max-w-[1400px] px-4 py-6 sm:px-6">
    <!-- Encabezado -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="truncate text-[17px] font-extrabold text-text">Compras Indirectas</h1>
        <p class="text-[12px] text-text-muted">
          Requisiciones de insumos y equipo: de la solicitud a la compra comprobada.
          <span v-if="modoDemo" class="ml-1 rounded-full border border-vz-blue/30 bg-vz-blue/10 px-2 py-px text-[10.5px] font-bold text-vz-blue">Modo demostración</span>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" :class="btn" @click="copiarLiga">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
          Liga para solicitantes
        </button>
        <button v-if="puedeCrear" type="button" :class="btnPrimary" @click="nuevaAbierta = true">+ Nueva requisición</button>
      </div>
    </div>

    <!-- Esqueleto mientras cargan las cachés -->
    <div v-if="cargando" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-busy="true">
      <div v-for="i in 10" :key="i" class="h-[88px] animate-pulse rounded-xl border border-border bg-surface motion-reduce:animate-none" />
    </div>

    <template v-else>
      <!-- KPIs -->
      <section class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Indicadores">
        <button type="button" class="text-left" @click="irEstados(ABIERTAS)"><KpiCard label="Abiertas" :amount="kpis.abiertas" :format="entero" accent="linear-gradient(90deg,#1F5FAE,#0FA391)" /></button>
        <button type="button" class="text-left" @click="irEstados(['recibida'])"><KpiCard label="Por validar" :amount="kpis.porValidar" :format="entero" /></button>
        <button type="button" class="text-left" @click="irEstados(['en_cotizacion'])"><KpiCard label="En cotización" :amount="kpis.enCotizacion" :format="entero" /></button>
        <button v-if="verDinero" type="button" class="text-left" @click="irEstados(['en_autorizacion'])"><KpiCard label="En autorización" :amount="kpis.enAutorizacion" :format="entero" :tone="kpis.enAutorizacion > 0 ? 'warning' : 'default'" /></button>
        <button v-if="verDinero" type="button" class="text-left" @click="irEstados(['autorizada'])"><KpiCard :label="role === 'cuentas_por_pagar' ? 'Por pagar' : 'Por fondear'" :amount="kpis.porFondear" :format="entero" :tone="kpis.porFondear > 0 ? 'warning' : 'default'" /></button>
        <button v-if="verDinero" type="button" class="text-left" @click="irEstados(['comprada', 'entregada'])">
          <KpiCard label="Compradas sin comprobar" :amount="kpis.compradasSinComprobar" :format="entero" :tone="kpis.compradasSinComprobar > 0 ? 'danger' : 'success'" hint="Gasto sin ticket o factura" />
        </button>
        <KpiCard v-if="kpis.cicloPromedioMs !== undefined" label="Tiempo promedio de ciclo" :amount="kpis.cicloPromedioMs / 86400000" :format="dias1" hint="De la solicitud a la entrega" />
        <KpiCard v-else label="Tiempo promedio de ciclo" value="—" hint="Aún sin requisiciones entregadas" />
        <KpiCard v-if="verGlobal" label="Ahorro por cotización" :amount="kpis.ahorroCotizacion" :format="formatoMonedaCorta" tone="success" hint="Cotización más cara vs. elegida" />
        <KpiCard v-if="verGlobal" label="Monto autorizado" :amount="kpis.montoAutorizado" :format="formatoMonedaCorta" />
        <KpiCard v-if="verGlobal" label="Monto gastado" :amount="kpis.montoGastado" :format="formatoMonedaCorta" :hint="hintGastado" :tone="kpis.montoAutorizado > 0 && kpis.montoGastado > kpis.montoAutorizado ? 'danger' : 'default'" />
      </section>

      <!-- Pestañas -->
      <div class="mb-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Secciones de Compras">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="tab === t.id"
          :class="`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2 text-[13px] font-bold transition-colors ${tab === t.id ? 'border-vz-blue text-vz-blue' : 'border-transparent text-text-muted hover:text-text'}`"
          @click="irTab(t.id)"
        >
          {{ t.label }}
          <span v-if="t.badge" class="rounded-full bg-vz-warning/20 px-1.5 text-[10.5px] font-extrabold text-vz-warning">{{ t.badge }}</span>
        </button>
      </div>

      <!-- Requisiciones -->
      <section v-show="tab === 'requisiciones'" role="tabpanel" aria-label="Requisiciones">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            :class="`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold ${filtros.mis ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-surface text-text-muted hover:bg-surface-hover'}`"
            :aria-pressed="filtros.mis"
            @click="filtros.mis = !filtros.mis"
          >
            Mis pendientes
            <span class="rounded-full bg-bg px-1.5 text-[11px] font-extrabold text-text-muted">{{ nMisPendientes }}</span>
          </button>
          <button
            type="button"
            :class="`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold ${filtros.abiertas ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border bg-surface text-text-muted hover:bg-surface-hover'}`"
            :aria-pressed="filtros.abiertas"
            @click="filtros.abiertas = !filtros.abiertas"
          >
            Solo abiertas
          </button>
          <input v-model="filtros.texto" type="search" :class="`${inputClass} max-w-[260px]`" placeholder="Buscar folio, solicitante, producto…" aria-label="Buscar requisiciones" />
          <div class="ml-auto flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="Vista">
            <button type="button" :class="vistaClase('tablero')" :aria-pressed="vista === 'tablero'" @click="setVista('tablero')">Tablero</button>
            <button type="button" :class="vistaClase('lista')" :aria-pressed="vista === 'lista'" @click="setVista('lista')">Lista</button>
          </div>
        </div>

        <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <select v-model="filtros.estado" :class="selectClass" aria-label="Estado">
            <option value="">Todos los estados</option>
            <option v-for="e in ESTADOS_TODOS" :key="e" :value="e">{{ ESTADOS[e].label }}</option>
          </select>
          <select v-model="filtros.area" :class="selectClass" aria-label="Área">
            <option value="">Todas las áreas</option>
            <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
          </select>
          <select v-model="filtros.solicitanteId" :class="selectClass" aria-label="Solicitante">
            <option value="">Todos los solicitantes</option>
            <option v-for="s in solicitantes" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </select>
          <select v-model="filtros.urgencia" :class="selectClass" aria-label="Urgencia">
            <option value="">Cualquier urgencia</option>
            <option value="urgente">Urgentes</option>
            <option value="normal">Normales</option>
          </select>
          <select v-model="filtros.destino" :class="selectClass" aria-label="Destino de inventario">
            <option value="">Cualquier destino</option>
            <option value="ti">Inventario TI</option>
            <option value="mantenimiento">Inventario Mantenimiento</option>
            <option value="ninguno">Sin inventario</option>
          </select>
          <select v-model="filtros.categoriaId" :class="selectClass" aria-label="Categoría">
            <option value="">Todas las categorías</option>
            <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
          <select v-if="verDinero" v-model="filtros.formaPago" :class="selectClass" aria-label="Forma de pago" data-test="filtro-forma-pago">
            <option value="">Cualquier forma de pago</option>
            <option value="efectivo">Efectivo (Tesorería)</option>
            <option value="transferencia">Transferencia (Cuentas por pagar)</option>
            <option value="tarjeta">Tarjeta (Cuentas por pagar)</option>
          </select>
        </div>
        <div class="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-text-muted">
          <label class="flex items-center gap-1.5">Desde <input v-model="filtros.desde" type="date" :class="`${inputClass} w-[150px]`" /></label>
          <label class="flex items-center gap-1.5">Hasta <input v-model="filtros.hasta" type="date" :class="`${inputClass} w-[150px]`" /></label>
          <button v-if="hayFiltros" type="button" :class="btnMini" @click="limpiar">Limpiar filtros</button>
          <span class="ml-auto font-semibold">{{ reqs.length }} de {{ totalReqs }} {{ totalReqs === 1 ? 'requisición' : 'requisiciones' }}</span>
        </div>

        <!-- Vacío total -->
        <div v-if="totalReqs === 0" class="rounded-xl border border-dashed border-border bg-surface px-4 py-14 text-center">
          <p class="text-[14px] font-extrabold text-text">Todavía no hay requisiciones</p>
          <p class="mx-auto mt-1 max-w-md text-[12.5px] text-text-muted">Los líderes de área las levantan con la liga pública; también puedes crear una desde aquí.</p>
          <div class="mt-4 flex justify-center gap-2">
            <button type="button" :class="btn" @click="copiarLiga">Copiar liga para solicitantes</button>
            <button v-if="puedeCrear" type="button" :class="btnPrimary" @click="nuevaAbierta = true">+ Nueva requisición</button>
          </div>
        </div>
        <template v-else>
          <div v-if="reqs.length === 0 && vista === 'tablero'" class="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-[13px] text-text-soft">
            Ninguna requisición coincide con los filtros. <button type="button" class="font-bold text-vz-blue hover:underline" @click="limpiar">Limpiar filtros</button>
          </div>
          <RequisicionesBoard v-else-if="vista === 'tablero'" :reqs="reqs" />
          <RequisicionesLista v-else :reqs="reqs" />
        </template>
      </section>

      <!-- Recepciones -->
      <section v-if="tab === 'recepciones' && puedeConfirmarRecepcion" role="tabpanel" aria-label="Recepciones pendientes">
        <p class="mb-3 text-[12.5px] text-text-muted">Compras ya realizadas que esperan confirmación del custodio para darse de alta en el inventario.</p>
        <RecepcionesPendientes :destino="destinoCustodio" @changed="bump" />
      </section>

      <!-- Correos -->
      <section v-if="tab === 'correos' && puedeVerCorreos" role="tabpanel" aria-label="Correos">
        <CorreosPanel />
      </section>

      <!-- Reportes -->
      <section v-if="tab === 'reportes' && verGlobal" role="tabpanel" aria-label="Reportes">
        <ComprasReportes :reqs="reqs" />
      </section>
    </template>

    <NuevaRequisicionModal v-if="nuevaAbierta" @close="nuevaAbierta = false" />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import KpiCard from 'components/KpiCard.vue'
import { inputClass, selectClass } from 'components/formClasses'
import RecepcionesPendientes from 'components/inventario/RecepcionesPendientes.vue'
import RequisicionesBoard from 'components/compras/RequisicionesBoard.vue'
import RequisicionesLista from 'components/compras/RequisicionesLista.vue'
import CorreosPanel from 'components/compras/CorreosPanel.vue'
import ComprasReportes from 'components/compras/ComprasReportes.vue'
import NuevaRequisicionModal from 'components/compras/NuevaRequisicionModal.vue'
import { useAcceso } from 'components/compras/useAcceso'
import { requisicionVisible } from 'src/lib/vistaRol'
import { calcularKpis } from 'components/compras/reportes'
import { btn, btnMini, btnPrimary, esMiPendiente, formatoMonedaCorta } from 'components/compras/util'
import {
  ESTADOS,
  ESTADOS_TODOS,
  RUTAS_COMPRAS,
  areComprasCachesReady,
  comprasModoLocal,
  destinoDeCategoria,
  esAbierta,
  listCategorias,
  listPartidas,
  listRequisiciones,
  recepcionesPendientes,
  urlBase,
} from 'src/lib/compras'
import { bump, track } from 'src/lib/reactive'
import { parseLocalDate } from 'src/lib/dateUtils'
import { DIA } from 'components/compras/util'
import { useToast } from 'src/composables/useToast'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { role, nombre, puedeCrear, puedeConfirmarRecepcion, puedeVerCorreos, destinoCustodio, verDinero, verGlobal } = useAcceso()
const modoDemo = comprasModoLocal()
const ABIERTAS = ESTADOS_TODOS.filter((e) => !ESTADOS[e].terminal)

const cargando = computed(() => {
  track()
  return !areComprasCachesReady()
})

// ---- Pestañas -----------------------------------------------------------------------------------------------------------
/** @typedef {'requisiciones' | 'recepciones' | 'correos' | 'reportes'} TabId */
const nPendientesRecepcion = computed(() => recepcionesPendientes(destinoCustodio.value).length)
const tabs = computed(() => {
  const t = [{ id: 'requisiciones', label: 'Requisiciones' }]
  if (puedeConfirmarRecepcion.value) t.push({ id: 'recepciones', label: 'Recepciones pendientes', badge: nPendientesRecepcion.value || undefined })
  if (puedeVerCorreos.value) t.push({ id: 'correos', label: 'Correos' })
  // Reportes (gasto, ahorro, proveedores): solo Dirección y Finanzas.
  if (verGlobal.value) t.push({ id: 'reportes', label: 'Reportes' })
  return t
})
const tabInicial = () => {
  const q = typeof route.query.tab === 'string' ? route.query.tab : ''
  return ['requisiciones', 'recepciones', 'correos', 'reportes'].includes(q) ? q : 'requisiciones'
}
const tab = ref(tabInicial())
// Si el rol no ve la pestaña pedida (p. ej. por la URL), se vuelve a Requisiciones.
watch(
  tabs,
  (t) => {
    if (!t.some((x) => x.id === tab.value)) tab.value = 'requisiciones'
  },
  { immediate: true },
)
function irTab(id) {
  tab.value = id
  void router.replace({ query: { ...route.query, tab: id === 'requisiciones' ? undefined : id } })
}

// ---- Vista (tablero / lista) --------------------------------------------------------------------------------------------
/** @typedef {'tablero' | 'lista'} Vista */
const VISTA_KEY = 'dga_cmp_vista'
function leerVista() {
  try {
    return localStorage.getItem(VISTA_KEY) === 'lista' ? 'lista' : 'tablero'
  } catch {
    return 'tablero'
  }
}
const vista = ref(leerVista())
function setVista(v) {
  vista.value = v
  try {
    localStorage.setItem(VISTA_KEY, v)
  } catch {
    /* almacenamiento no disponible: la vista solo vive en esta sesión */
  }
}
const vistaClase = (v) => `h-8 rounded-md px-3 text-[12.5px] font-bold ${vista.value === v ? 'bg-vz-blue text-white' : 'text-text-muted hover:bg-surface-hover'}`

// ---- Filtros ------------------------------------------------------------------------------------------------------------
const filtros = reactive({
  mis: false,
  abiertas: false,
  texto: '',
  estado: '',
  area: '',
  solicitanteId: '',
  urgencia: '',
  destino: '',
  categoriaId: '',
  formaPago: '',
  desde: '',
  hasta: '',
})
const hayFiltros = computed(() => filtros.mis || filtros.abiertas || !!(filtros.texto || filtros.estado || filtros.area || filtros.solicitanteId || filtros.urgencia || filtros.destino || filtros.categoriaId || filtros.formaPago || filtros.desde || filtros.hasta))
function resetFiltros() {
  Object.assign(filtros, { mis: false, abiertas: false, texto: '', estado: '', area: '', solicitanteId: '', urgencia: '', destino: '', categoriaId: '', formaPago: '', desde: '', hasta: '' })
}
function limpiar() {
  resetFiltros()
  const { estado, abiertas, urgentes, ...resto } = route.query
  if (estado !== undefined || abiertas !== undefined || urgentes !== undefined) void router.replace({ query: resto })
}

/** Filtros iniciales que llegan por URL (p. ej. desde "Tus pendientes" del Inicio): ?estado=, ?abiertas=1, ?urgentes=1. */
const primero = (v) => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : '')
function aplicarQuery() {
  const estado = primero(route.query.estado)
  const urgentes = primero(route.query.urgentes) === '1'
  const abiertas = primero(route.query.abiertas) === '1' || urgentes
  const estadoValido = Object.prototype.hasOwnProperty.call(ESTADOS, estado)
  if (!estadoValido && !abiertas) return
  resetFiltros()
  if (estadoValido) filtros.estado = estado
  if (abiertas) filtros.abiertas = true
  if (urgentes) filtros.urgencia = 'urgente'
  tab.value = 'requisiciones'
}
watch(() => [route.query.estado, route.query.abiertas, route.query.urgentes], aplicarQuery, { immediate: true })
function irEstados(estados) {
  limpiar()
  if (estados.length === 1) filtros.estado = estados[0]
  tab.value = 'requisiciones'
  void router.replace({ query: { ...route.query, tab: undefined } })
  if (estados.length > 1) vista.value = 'lista'
}

// Cada rol ve solo las requisiciones que le corresponden (custodios: las de su inventario o las suyas; Tesorería: las que ya tienen dinero).
const visible = (r) => (role.value ? requisicionVisible(role.value, r, nombre.value) : false)
const todas = computed(() => listRequisiciones().filter(visible))
const totalReqs = computed(() => todas.value.length)
const categorias = computed(() => listCategorias())
const areas = computed(() => [...new Set(todas.value.map((r) => r.area?.trim()).filter((a) => !!a))].sort((a, b) => a.localeCompare(b, 'es')))
const solicitantes = computed(() => {
  const m = new Map()
  for (const r of todas.value) m.set(r.solicitanteId, r.solicitanteNombre)
  return [...m.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
})

const reqs = computed(() => {
  let list = listRequisiciones({
    estado: filtros.estado || undefined,
    solicitanteId: filtros.solicitanteId || undefined,
    texto: filtros.texto.trim() || undefined,
    urgentes: filtros.urgencia === 'urgente' ? true : undefined,
    categoriaId: filtros.categoriaId || undefined,
    desde: filtros.desde ? parseLocalDate(filtros.desde).getTime() : undefined,
    hasta: filtros.hasta ? parseLocalDate(filtros.hasta).getTime() + DIA - 1 : undefined,
  })
  if (filtros.urgencia === 'normal') list = list.filter((r) => r.urgencia === 'normal')
  if (filtros.area) list = list.filter((r) => (r.area?.trim() ?? '') === filtros.area)
  if (filtros.destino) {
    const d = filtros.destino
    list = list.filter((r) => listPartidas(r.folio).some((p) => destinoDeCategoria(p.categoriaId) === d))
  }
  list = list.filter(visible)
  if (filtros.formaPago) list = list.filter((r) => (r.formaPago ?? 'efectivo') === filtros.formaPago)
  if (filtros.abiertas) list = list.filter((r) => esAbierta(r.estado))
  if (filtros.mis) list = list.filter((r) => esMiPendiente(r, role.value))
  return list
})

const nMisPendientes = computed(() => todas.value.filter((r) => esMiPendiente(r, role.value)).length)

// ---- KPIs ---------------------------------------------------------------------------------------------------------------
const kpis = computed(() => calcularKpis(todas.value))
const entero = (n) => String(Math.round(n))
const dias1 = (n) => `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} d`
const hintGastado = computed(() => (kpis.value.montoAutorizado > 0 ? `${Math.round((kpis.value.montoGastado / kpis.value.montoAutorizado) * 100)} % de lo autorizado` : 'Aún sin compras'))

// ---- Acciones -----------------------------------------------------------------------------------------------------------
const nuevaAbierta = ref(false)

async function copiarLiga() {
  const url = `${urlBase()}${RUTAS_COMPRAS.nueva}`

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()

      const copiado = document.execCommand('copy')
      textarea.remove()

      if (!copiado) throw new Error('No se pudo copiar')
    }

    toast('Liga copiada: compártela con los líderes de área.')
  } catch (error) {
    console.error('Error al copiar liga:', error)
    toast(`Copia esta liga: ${url}`, 'info')
  }
}
</script>
