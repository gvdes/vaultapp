<template>
  <section class="rounded-2xl border border-border bg-surface p-4 sm:p-5">
    <!-- Encabezado + filtros -->
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-[15px] font-extrabold text-text">Mapa de sucursales</h2>
        <p class="text-[12px] text-text-muted">Valor de inventario por sucursal. Toca un punto o una fila para abrir su ficha completa.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div v-if="!dominioFijo" class="flex rounded-full border border-border bg-bg p-0.5" role="group" aria-label="Filtro de inventario">
          <button
            v-for="f in FILTROS"
            :key="f.id"
            type="button"
            class="rounded-full px-3 py-1 text-[12px] font-bold transition-all duration-200"
            :class="filtro === f.id ? 'text-white shadow-sm' : 'text-text-muted hover:text-text'"
            :style="filtro === f.id ? { background: f.color } : undefined"
            :aria-pressed="filtro === f.id"
            @click="filtro = f.id"
          >
            {{ f.label }}
          </button>
        </div>
        <button
          v-if="isAdmin"
          type="button"
          class="h-8 rounded-full border px-3 text-[12px] font-bold transition-colors"
          :class="ajustar ? 'border-vz-warning bg-vz-warning/15 text-vz-warning' : 'border-border text-text-muted hover:bg-surface-hover'"
          :aria-pressed="ajustar"
          @click="ajustar = !ajustar"
        >
          {{ ajustar ? 'Listo' : 'Ajustar posiciones' }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <!-- Mapa + detalle -->
      <div class="flex min-w-0 flex-col gap-3 lg:col-span-3">
        <div class="relative overflow-hidden rounded-xl border border-border">
          <div ref="mapEl" class="vz-map h-[340px] w-full sm:h-[420px]" :class="theme === 'dark' ? 'vz-map-dark' : ''" />
          <button
            type="button"
            class="absolute bottom-3 left-3 z-[500] rounded-md border border-border bg-surface/95 px-2 py-1 text-[11px] font-bold text-text shadow-sm hover:bg-surface-hover"
            @click="verTodo()"
          >
            Ver todo
          </button>
          <div v-if="ajustar" class="absolute inset-x-3 top-3 z-[500] rounded-md bg-vz-warning/95 px-3 py-1.5 text-center text-[11.5px] font-bold text-vz-ink shadow">
            Arrastra los puntos para corregir su ubicación; se guarda al soltar.
          </div>
          <div v-if="tilesFallaron" class="absolute bottom-3 right-3 z-[500] max-w-[55%] rounded-md bg-surface/95 px-2 py-1 text-[10.5px] text-text-muted shadow-sm">
            Mapa base no disponible; los puntos siguen activos.
          </div>
        </div>

        <!-- Detalle de la sucursal seleccionada -->
        <Transition name="vz-fade" mode="out-in">
          <div v-if="detalle" :key="detalle.key" class="rounded-xl border border-border bg-bg/60 p-4">
            <div class="mb-3 flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-[14px] font-extrabold text-text">{{ detalle.nombre }}</p>
                <p v-if="detalle.pisos.length > 1" class="mt-0.5 text-[11px] text-text-muted">{{ detalle.pisos.map((p) => `${p.nombre}: ${money.format(p.valor)}`).join(' · ') }}</p>
                <p v-else class="mt-0.5 text-[11px] text-text-muted">{{ detalle.tipoLabel }}</p>
              </div>
              <button type="button" class="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-text-muted hover:bg-surface-hover" @click="seleccionarKey(null)">Cerrar</button>
            </div>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div v-if="dominioFijo !== 'mantenimiento'">
                <p class="text-[11px] text-text-muted">Valor TI</p>
                <p class="text-[15px] font-extrabold text-vz-blue"><AnimatedNumber :value="detalle.valorTI" :format="fmtMoney" :duration="600" /></p>
              </div>
              <div v-if="dominioFijo !== 'sistemas'">
                <p class="text-[11px] text-text-muted">Valor Mantenimiento</p>
                <p class="text-[15px] font-extrabold text-vz-gold"><AnimatedNumber :value="detalle.valorMtto" :format="fmtMoney" :duration="600" /></p>
              </div>
              <div v-if="!dominioFijo" class="col-span-2 sm:col-span-1">
                <p class="text-[11px] text-text-muted">Total</p>
                <p class="text-[15px] font-extrabold text-text"><AnimatedNumber :value="detalle.valorTI + detalle.valorMtto" :format="fmtMoney" :duration="600" /></p>
              </div>
              <div>
                <p class="text-[11px] text-text-muted">Equipos</p>
                <p class="text-[15px] font-extrabold text-text"><AnimatedNumber :value="detalle.equipos" :duration="600" /></p>
              </div>
              <div v-if="dominioFijo !== 'sistemas'">
                <p class="text-[11px] text-text-muted">Materiales</p>
                <p class="text-[15px] font-extrabold text-text"><AnimatedNumber :value="detalle.materiales" :duration="600" /></p>
              </div>
              <div>
                <p class="text-[11px] text-text-muted">{{ dominioFijo === 'sistemas' ? 'Dañados' : 'Dañados · Bajo mínimo' }}</p>
                <p class="text-[15px] font-extrabold">
                  <span :class="detalle.danados > 0 ? 'text-vz-danger' : 'text-text'">{{ detalle.danados }}</span>
                  <span v-if="dominioFijo !== 'sistemas'" class="text-text-soft"> · </span>
                  <span v-if="dominioFijo !== 'sistemas'" :class="detalle.bajoMinimo > 0 ? 'text-vz-danger' : 'text-text'">{{ detalle.bajoMinimo }}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              class="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-vz-blue px-3 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
              @click="abrirFicha(detalle.ubicacionIds)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.6a2 2 0 011.4.6l4.8 4.8a2 2 0 01.6 1.4V19a2 2 0 01-2 2z" /></svg>
              Ver ficha completa
            </button>
            <p v-if="filtro !== 'todo'" class="mt-2 text-[10.5px] text-text-soft">Equipos, materiales y alertas se cuentan con el filtro «{{ filtroLabel }}».</p>
          </div>
          <div v-else key="vacio" class="rounded-xl border border-dashed border-border p-4 text-center text-[12px] text-text-soft">Selecciona una sucursal para ver su detalle.</div>
        </Transition>
      </div>

      <!-- Total por sucursal -->
      <div class="flex min-w-0 flex-col rounded-xl border border-border p-3 lg:col-span-2">
        <div class="mb-2 flex items-baseline justify-between gap-2">
          <h3 class="text-[13px] font-bold text-text">Total por sucursal</h3>
          <span class="text-[13px] font-extrabold" :style="{ color: colorFiltro }"><AnimatedNumber :value="totalFiltrado" :format="fmtMoney" /></span>
        </div>
        <p v-if="ranking.length === 0" class="py-6 text-center text-[12px] text-text-soft">Sin inventario valuado para este filtro.</p>
        <ul class="vz-scroll m-0 flex max-h-[470px] list-none flex-col gap-0.5 overflow-y-auto p-0 pr-1">
          <li v-for="(r, i) in ranking" :key="r.ubicacionId">
            <button
              type="button"
              class="group w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover"
              :class="r.selKey === selKey ? 'bg-surface-hover ring-1 ring-border' : ''"
              @click="clicFila(r)"
            >
              <div class="flex items-center justify-between gap-2 text-[12px]">
                <span class="flex min-w-0 items-center gap-1.5">
                  <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-bg text-[9.5px] font-bold text-text-soft">{{ i + 1 }}</span>
                  <span class="truncate font-semibold text-text">{{ r.nombre }}</span>
                  <span v-if="!r.conMapa" class="shrink-0 rounded bg-bg px-1 text-[9px] font-bold uppercase text-text-soft">sin mapa</span>
                </span>
                <span class="shrink-0 font-bold text-text"><AnimatedNumber :value="r.valor" :format="fmtMoney" :duration="800" /></span>
              </div>
              <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
                <div
                  class="vz-bar h-full rounded-full"
                  :style="{ width: `${r.pct * barEscala}%`, background: colorFiltro, transitionDelay: `${Math.min(i, 14) * 35}ms` }"
                />
              </div>
            </button>
          </li>
        </ul>
      </div>
    </div>
    <SucursalFicha
      v-if="fichaIds"
      :ubicacion-ids="fichaIds"
      :ubicacion-inicial="fichaInicial"
      :dominio-inicial="filtro"
      :dominio-fijo="dominioFijo"
      @close="fichaIds = null"
    />
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { bump } from 'src/lib/reactive'
import { useAuth } from 'src/lib/auth'
import { useToast } from 'src/composables/useToast'
import { useTheme } from 'src/composables/useTheme'
import { setUbicacionCoords } from 'src/lib/inventario/comunes'
import { resumenPorPunto, resumenPorUbicacion } from 'src/lib/inventario/analisisUbicaciones'
import AnimatedNumber from './AnimatedNumber.vue'
import SucursalFicha from './SucursalFicha.vue'

/** `dominioFijo`: limita el mapa y su ficha a un dominio (Soporte = sistemas, Mantenimiento = mantenimiento); sin valor = Dirección, ambos. */
const props = defineProps({ dominioFijo: String })
const emit = defineEmits(['select'])

const FILTROS = [
  { id: 'todo', label: 'Todo', color: '#0FA391' },
  { id: 'ti', label: 'TI', color: '#1F5FAE' },
  { id: 'mantenimiento', label: 'Mantenimiento', color: '#C8A24B' },
]
const COLOR_CERO = '#94A3B8'
const R_MIN = 9
const R_MAX = 34
const R_CERO = 5

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const fmtMoney = (n) => money.format(Math.round(n))

const { user } = useAuth()
const toast = useToast()
const { theme } = useTheme()
const isAdmin = computed(() => user.value?.role === 'admin')

const filtro = ref(props.dominioFijo === 'sistemas' ? 'ti' : (props.dominioFijo ?? 'todo'))
const selKey = ref(null)
const hoverKey = ref(null)
const ajustar = ref(false)
const tilesFallaron = ref(false)
const barEscala = ref(0)

const filtroActual = computed(() => FILTROS.find((f) => f.id === filtro.value) ?? FILTROS[0])
const colorFiltro = computed(() => filtroActual.value.color)
const filtroLabel = computed(() => filtroActual.value.label)

const puntos = computed(() => resumenPorPunto(filtro.value))
const filas = computed(() => resumenPorUbicacion(filtro.value))

/** Mapa ubicacionId → clave del punto del mapa (si tiene coordenadas). */
const keyPorUbicacion = computed(() => {
  const m = new Map()
  for (const p of puntos.value) for (const u of p.ubicaciones) m.set(u.ubicacionId, p.key)
  return m
})

const totalFiltrado = computed(() => filas.value.reduce((s, r) => s + r.valor, 0))

const ranking = computed(() => {
  const lista = filas.value.filter((r) => r.valor > 0).sort((a, b) => b.valor - a.valor)
  const max = lista[0]?.valor ?? 0
  return lista.map((r) => {
    const key = keyPorUbicacion.value.get(r.ubicacionId)
    return {
      ubicacionId: r.ubicacionId,
      nombre: r.nombre,
      valor: r.valor,
      pct: max > 0 ? Math.max(2, (r.valor / max) * 100) : 0,
      conMapa: !!key,
      selKey: key ?? `u:${r.ubicacionId}`,
    }
  })
})

const TIPO_LABEL = { sucursal: 'Sucursal', cedis: 'Centro de distribución', oficina: 'Oficina', otro: 'Otra ubicación' }

const detalle = computed(() => {
  const k = selKey.value
  if (!k) return null
  if (k.startsWith('u:')) {
    const r = filas.value.find((f) => f.ubicacionId === k.slice(2))
    if (!r) return null
    return { key: k, ubicacionIds: [r.ubicacionId], nombre: r.nombre, tipoLabel: TIPO_LABEL[r.tipo] ?? r.tipo, pisos: [], valorTI: r.valorTI, valorMtto: r.valorMtto, equipos: r.equipos, materiales: r.materiales, danados: r.danados, bajoMinimo: r.bajoMinimo }
  }
  const p = puntos.value.find((x) => x.key === k)
  if (!p) return null
  return {
    key: k,
    ubicacionIds: p.ubicaciones.map((u) => u.ubicacionId),
    nombre: p.nombre,
    tipoLabel: TIPO_LABEL[p.ubicaciones[0]?.tipo ?? 'otro'] ?? '',
    pisos: p.ubicaciones.map((u) => ({ nombre: u.nombre, valor: u.valor })),
    valorTI: p.valorTI,
    valorMtto: p.valorMtto,
    equipos: p.equipos,
    materiales: p.materiales,
    danados: p.danados,
    bajoMinimo: p.bajoMinimo,
  }
})

// ---- Ficha completa ----
const fichaIds = ref(null)
const fichaInicial = ref(undefined)

function idsDeKey(key) {
  if (key.startsWith('u:')) return [key.slice(2)]
  return puntos.value.find((p) => p.key === key)?.ubicaciones.map((u) => u.ubicacionId) ?? []
}

function abrirFicha(ids, inicial) {
  if (ids.length === 0) return
  fichaInicial.value = inicial
  fichaIds.value = ids
}

/** Fila del ranking: resalta/vuela como antes y abre la ficha; si la fila es un piso de un punto agrupado, abre enfocada en ese piso. */
function clicFila(r) {
  seleccionarKey(r.selKey, true)
  const ids = idsDeKey(r.selKey)
  abrirFicha(ids, ids.length > 1 ? r.ubicacionId : undefined)
}

function seleccionarKey(key, volar = false) {
  selKey.value = key
  if (key && volar && !key.startsWith('u:')) volarA(key)
  if (!key) {
    emit('select', [])
    return
  }
  if (key.startsWith('u:')) emit('select', [key.slice(2)])
  else emit('select', puntos.value.find((p) => p.key === key)?.ubicaciones.map((u) => u.ubicacionId) ?? [])
}

// ---------------------------------------------------------------- Leaflet
/**
 * @typedef {object} Entry
 * @property {L.CircleMarker} marker
 * @property {number} radius
 * @property {number} raf
 * @property {string} color
 */

const mapEl = ref(null)
let map = null
let tiles = null
let pulse = null
let pulseSig = ''
let ro = null
let ajustado = false
const entries = new Map()
const handles = new Map()

const reduced = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function radioDe(p, max) {
  if (p.valor <= 0 || max <= 0) return R_CERO
  return R_MIN + (R_MAX - R_MIN) * Math.sqrt(p.valor / max)
}

function tooltipHtml(p) {
  return `<strong>${esc(p.nombre)}</strong><br>${esc(money.format(Math.round(p.valor)))}`
}

function tween(entry, destino) {
  cancelAnimationFrame(entry.raf)
  const desde = entry.radius
  if (reduced() || desde === destino) {
    entry.radius = destino
    entry.marker.setRadius(destino)
    return
  }
  const t0 = performance.now()
  const dur = 650
  const paso = (now) => {
    const p = Math.min(1, (now - t0) / dur)
    const e = 1 - Math.pow(1 - p, 3)
    entry.radius = desde + (destino - desde) * e
    entry.marker.setRadius(entry.radius)
    if (p < 1) entry.raf = requestAnimationFrame(paso)
  }
  entry.raf = requestAnimationFrame(paso)
}

function estiloPin(color, cero, activo) {
  return {
    color: activo ? '#ffffff' : color,
    weight: activo ? 3 : 2,
    fillColor: cero ? COLOR_CERO : color,
    fillOpacity: cero ? 0.55 : 0.6,
    opacity: 1,
  }
}

function sincronizarPines() {
  if (!map) return
  const lista = puntos.value
  const max = lista.reduce((m, p) => Math.max(m, p.valor), 0)
  const vivos = new Set(lista.map((p) => p.key))
  for (const [key, en] of entries) {
    if (!vivos.has(key)) {
      cancelAnimationFrame(en.raf)
      en.marker.remove()
      entries.delete(key)
    }
  }
  // Los más grandes primero, para que los chicos queden encima.
  for (const p of lista) {
    const cero = p.valor <= 0
    const color = cero ? COLOR_CERO : colorFiltro.value
    const destino = radioDe(p, max)
    let en = entries.get(p.key)
    if (!en) {
      const marker = L.circleMarker([p.lat, p.lng], { radius: 0, ...estiloPin(color, cero, false) }).addTo(map)
      marker.bindTooltip(tooltipHtml(p), { direction: 'top', offset: [0, -4], className: 'vz-tip' })
      marker.on('click', () => {
        seleccionarKey(p.key)
        // En modo "Ajustar posiciones" el clic no abre la ficha (se está arrastrando).
        if (!ajustar.value) abrirFicha(idsDeKey(p.key))
      })
      marker.on('mouseover', () => {
        hoverKey.value = p.key
      })
      marker.on('mouseout', () => {
        if (hoverKey.value === p.key) hoverKey.value = null
      })
      en = { marker, radius: 0, raf: 0, color }
      entries.set(p.key, en)
    } else {
      en.marker.setLatLng([p.lat, p.lng])
      en.marker.setTooltipContent(tooltipHtml(p))
    }
    en.color = color
    en.marker.setStyle(estiloPin(color, cero, p.key === selKey.value))
    tween(en, destino)
  }
  if (!ajustado && lista.length > 0) {
    ajustado = true
    verTodo(true)
  }
  actualizarPulso()
  sincronizarHandles()
}

function actualizarPulso() {
  if (!map) return
  const key = hoverKey.value ?? selKey.value
  const en = key ? entries.get(key) : undefined
  const p = key ? puntos.value.find((x) => x.key === key) : undefined
  if (!en || !p) {
    pulse?.remove()
    pulse = null
    pulseSig = ''
    return
  }
  const max = puntos.value.reduce((m, x) => Math.max(m, x.valor), 0)
  const size = Math.round(radioDe(p, max) * 2 + 6)
  const sig = `${key}|${size}|${en.color}`
  if (pulse && pulseSig === sig) return
  const icon = L.divIcon({
    className: 'vz-pulse-wrap',
    html: `<span class="vz-pulse" style="--c:${en.color};width:${size}px;height:${size}px"></span><span class="vz-pulse vz-pulse-2" style="--c:${en.color};width:${size}px;height:${size}px"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
  if (pulse) {
    pulse.setLatLng([p.lat, p.lng])
    pulse.setIcon(icon)
  } else {
    pulse = L.marker([p.lat, p.lng], { icon, interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(map)
  }
  pulseSig = sig
}

function sincronizarHandles() {
  if (!map) return
  const activos = ajustar.value && isAdmin.value
  for (const [key, h] of handles) {
    if (!activos || !puntos.value.some((p) => p.key === key)) {
      h.remove()
      handles.delete(key)
    }
  }
  if (!activos) return
  for (const p of puntos.value) {
    const existente = handles.get(p.key)
    if (existente) {
      existente.setLatLng([p.lat, p.lng])
      continue
    }
    const icon = L.divIcon({ className: 'vz-handle-wrap', html: '<span class="vz-handle"></span>', iconSize: [22, 22], iconAnchor: [11, 11] })
    const h = L.marker([p.lat, p.lng], { icon, draggable: true, zIndexOffset: 1000, title: p.nombre }).addTo(map)
    h.on('drag', (ev) => {
      const ll = ev.target.getLatLng()
      entries.get(p.key)?.marker.setLatLng(ll)
      pulse?.setLatLng(ll)
    })
    h.on('dragend', (ev) => void alSoltar(p.key, ev.target.getLatLng()))
    handles.set(p.key, h)
  }
}

async function alSoltar(key, ll) {
  const p = puntos.value.find((x) => x.key === key)
  if (!p) return
  const lat = Math.round(ll.lat * 1e5) / 1e5
  const lng = Math.round(ll.lng * 1e5) / 1e5
  const nuevaKey = `${lat.toFixed(5)},${lng.toFixed(5)}`
  const eraSeleccionado = selKey.value === key
  // El marcador y el handle se re-crean con la nueva clave cuando se recalculen los puntos.
  handles.get(key)?.remove()
  handles.delete(key)
  if (eraSeleccionado) selKey.value = nuevaKey
  try {
    await Promise.all(p.ubicaciones.map((u) => setUbicacionCoords(u.ubicacionId, lat, lng)))
    toast(`Posición de «${p.nombre}» actualizada.`)
  } catch {
    toast(`«${p.nombre}» se movió solo en este navegador; no se pudo guardar en el servidor.`, 'error')
  } finally {
    bump()
  }
}

function volarA(key) {
  const p = puntos.value.find((x) => x.key === key)
  if (!map || !p) return
  const zoom = Math.max(map.getZoom(), 15)
  if (reduced()) map.setView([p.lat, p.lng], zoom, { animate: false })
  else map.flyTo([p.lat, p.lng], zoom, { duration: 0.9 })
  entries.get(key)?.marker.bringToFront()
}

/** Encuadra los puntos; ignora los muy alejados del centro (p. ej. Texcoco) salvo con `todo`. */
function verTodo(soloNucleo = false) {
  if (!map || puntos.value.length === 0) return
  const lista = puntos.value
  let sel = lista
  if (soloNucleo) {
    const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    const mLat = med(lista.map((p) => p.lat))
    const mLng = med(lista.map((p) => p.lng))
    const nucleo = lista.filter((p) => Math.abs(p.lat - mLat) < 0.15 && Math.abs(p.lng - mLng) < 0.15)
    if (nucleo.length > 0) sel = nucleo
  }
  const bounds = L.latLngBounds(sel.map((p) => [p.lat, p.lng]))
  map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16, animate: !reduced() })
}

function iniciarMapa() {
  if (!mapEl.value) return
  map = L.map(mapEl.value, { center: [19.43, -99.13], zoom: 14, zoomControl: true, attributionControl: true, scrollWheelZoom: false })
  // Rueda del mouse solo tras hacer clic en el mapa, para no atrapar el scroll de la página.
  map.on('click', () => map?.scrollWheelZoom.enable())
  map.on('mouseout', () => map?.scrollWheelZoom.disable())
  tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map)
  tiles.on('tileerror', () => {
    tilesFallaron.value = true
  })
  tiles.on('tileload', () => {
    tilesFallaron.value = false
  })
  ro = new ResizeObserver(() => map?.invalidateSize())
  ro.observe(mapEl.value)
  sincronizarPines()
}

function animarBarras() {
  if (reduced()) {
    barEscala.value = 1
    return
  }
  barEscala.value = 0
  void nextTick(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => (barEscala.value = 1)))
  })
}

onMounted(() => {
  try {
    iniciarMapa()
  } catch {
    tilesFallaron.value = true
  }
  animarBarras()
})

onBeforeUnmount(() => {
  for (const en of entries.values()) cancelAnimationFrame(en.raf)
  entries.clear()
  handles.clear()
  ro?.disconnect()
  map?.remove()
  map = null
})

watch(puntos, () => sincronizarPines())
watch(filtro, () => animarBarras())
watch([hoverKey, selKey], () => {
  for (const [key, en] of entries) {
    en.marker.setStyle(estiloPin(en.color, en.color === COLOR_CERO, key === selKey.value))
  }
  if (selKey.value) entries.get(selKey.value)?.marker.bringToFront()
  actualizarPulso()
})
watch(ajustar, () => {
  if (!isAdmin.value) ajustar.value = false
  sincronizarHandles()
})
</script>

<style>
.vz-map {
  background-color: var(--color-bg);
  z-index: 0;
}
.vz-map.vz-map-dark .leaflet-tile-pane {
  filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9);
}
.vz-map .leaflet-container,
.vz-map.leaflet-container {
  background: var(--color-bg);
  font-family: inherit;
}
.vz-map .leaflet-control-attribution {
  font-size: 10px;
}
.vz-tip.leaflet-tooltip {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.35;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}
.vz-tip.leaflet-tooltip-top::before {
  border-top-color: var(--color-border);
}
.vz-bar {
  transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
.vz-pulse-wrap {
  background: none;
  border: 0;
  pointer-events: none;
}
.vz-pulse {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  border: 2px solid var(--c);
  opacity: 0;
  animation: vz-pulse 1.8s ease-out infinite;
}
.vz-pulse-2 {
  animation-delay: 0.9s;
}
@keyframes vz-pulse {
  0% {
    transform: scale(0.9);
    opacity: 0.85;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}
.vz-handle-wrap {
  background: none;
  border: 0;
}
.vz-handle {
  display: block;
  width: 22px;
  height: 22px;
  border-radius: 9999px;
  background: #ffffff;
  border: 3px solid #e3a517;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  cursor: grab;
}
.vz-fade-enter-active,
.vz-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.vz-fade-enter-from,
.vz-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
@media (prefers-reduced-motion: reduce) {
  .vz-pulse {
    animation: none;
    opacity: 0.6;
    transform: scale(1.3);
  }
  .vz-bar,
  .vz-fade-enter-active,
  .vz-fade-leave-active {
    transition: none !important;
  }
}
</style>
