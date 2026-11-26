<template>
  <div>
    <p v-if="eventos.length === 0" class="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-[12.5px] text-text-soft">Sin movimientos todavía.</p>
    <ol v-else class="relative ml-2 border-l border-border pl-5">
      <li v-for="e in eventos" :key="e.id" class="relative pb-4 last:pb-0">
        <span class="absolute -left-[27px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-surface" :style="{ background: e.color }" />
        <div class="rounded-lg border border-border bg-surface px-3 py-2">
          <div class="flex flex-wrap items-baseline justify-between gap-x-3">
            <p class="text-[12.5px] font-bold text-text">{{ e.titulo }}</p>
            <p class="text-[11px] text-text-soft">{{ fechaHora(e.fecha) }}</p>
          </div>
          <p v-if="e.quien" class="text-[11.5px] text-text-muted">{{ e.quien }}</p>
          <p v-if="e.detalle" class="text-[12px] text-text-muted">{{ e.detalle }}</p>
          <p v-if="e.comentario" class="mt-0.5 text-[12px] italic text-text-muted">«{{ e.comentario }}»</p>
        </div>
      </li>
    </ol>
    <p class="mt-3 text-[11px] text-text-soft">El historial es de solo lectura: nada se edita ni se borra.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  ESTADOS,
  formatoMoneda,
  getHistorial,
  getPartida,
  listAprobaciones,
  listCompras,
  listCotizaciones,
  listMovimientosDinero,
  listRecepciones,
  NIVEL_LABEL,
} from 'src/lib/compras'
import { fechaHora } from './util'
import { useAcceso } from './useAcceso'

/** Línea de tiempo unificada: cambios de estado + cotizaciones + decisiones + dinero + compras + recepciones. */
const props = defineProps({ folio: { type: String, required: true } })
// El custodio (Soporte/Mantenimiento) ve estados, partidas y entrega, pero no cotizaciones, aprobaciones, dinero ni precios.
const { verDinero } = useAcceso()

/**
 * @typedef {object} Evento
 * @property {string} id
 * @property {number} fecha
 * @property {string} titulo
 * @property {string} [quien]
 * @property {string} [detalle]
 * @property {string} [comentario]
 * @property {string} color
 */

const DINERO = {
  solicitud: 'Se solicitó el dinero (Tesorería) o el pago (Cuentas por pagar)',
  entrega_efectivo: 'Entrega de efectivo',
  transferencia: 'Transferencia registrada',
  pago_tarjeta: 'Pago con tarjeta registrado',
  comprobacion: 'Comprobación del gasto',
  devolucion_cambio: 'Cambio devuelto a Tesorería',
}

const eventos = computed(() => {
  const f = props.folio
  const out = []
  for (const h of getHistorial(f)) {
    out.push({
      id: `h-${h.id}`,
      fecha: h.fecha,
      titulo: h.deEstado ? `${ESTADOS[h.deEstado].corta} → ${ESTADOS[h.aEstado].corta}` : `Estado: ${ESTADOS[h.aEstado].label}`,
      quien: h.usuario,
      comentario: h.comentario,
      color: ESTADOS[h.aEstado].color,
    })
  }
  for (const c of verDinero.value ? listCotizaciones(f, { incluirDescartadas: true }) : []) {
    out.push({
      id: `c-${c.id}`,
      fecha: c.createdAt,
      titulo: `Cotización de ${c.proveedor}${c.activo ? '' : ' (descartada)'}`,
      quien: c.registradoPor,
      detalle: c.elegida ? 'Elegida como ganadora' : undefined,
      comentario: c.justificacion,
      color: '#0E7490',
    })
  }
  for (const a of verDinero.value ? listAprobaciones(f) : []) {
    out.push({
      id: `a-${a.id}`,
      fecha: a.fecha,
      titulo: `${a.decision === 'aprobada' ? 'Aprobó' : a.decision === 'rechazada' ? 'Rechazó' : 'Pidió ajuste'} · ${NIVEL_LABEL[a.nivel]}`,
      quien: `${a.aprobadorNombre} · ${a.via === 'correo' ? 'desde la liga del correo' : 'desde la app'}`,
      detalle: a.monto ? formatoMoneda(a.monto) : undefined,
      comentario: a.comentario,
      color: a.decision === 'aprobada' ? '#15803D' : a.decision === 'rechazada' ? '#B42318' : '#B45309',
    })
  }
  for (const m of verDinero.value ? listMovimientosDinero(f) : []) {
    out.push({
      id: `d-${m.id}`,
      fecha: m.fecha,
      titulo: `${DINERO[m.tipo]} · ${formatoMoneda(m.monto)}`,
      quien: m.registradoPor,
      detalle: [m.referencia ? `Ref. ${m.referencia}` : m.folioCajaChica ? `Folio ${m.folioCajaChica}` : '', m.familiaGasto ?? '', m.receptor ? `Recibe ${m.receptor}` : ''].filter(Boolean).join(' · ') || undefined,
      comentario: m.notas,
      color: '#047857',
    })
  }
  for (const c of listCompras(f)) {
    const p = getPartida(c.partidaId)
    out.push({
      id: `p-${c.id}`,
      fecha: c.fecha,
      titulo: `Compra: ${c.cantidadComprada} × ${p?.producto ?? 'partida'}${verDinero.value ? ` a ${formatoMoneda(c.costoUnitarioReal)}` : ''}`,
      quien: c.registradoPor,
      detalle: verDinero.value ? [c.proveedor, c.numeroFactura ? `factura ${c.numeroFactura}` : c.ticketUrl ? 'con ticket' : ''].filter(Boolean).join(' · ') || undefined : undefined,
      color: '#6D28D9',
    })
  }
  for (const r of listRecepciones({ folio: f })) {
    out.push({ id: `rp-${r.id}`, fecha: r.createdAt, titulo: `Recepción pendiente (${r.destino === 'ti' ? 'TI' : 'Mantenimiento'}): ${r.cantidad} × ${r.datos.producto}`, color: '#C8A24B' })
    if (r.estado === 'confirmada' && r.fechaConfirmacion) {
      out.push({ id: `rc-${r.id}`, fecha: r.fechaConfirmacion, titulo: `Recepción confirmada: ${r.cantidad} × ${r.datos.producto}`, quien: r.confirmadoPor, color: '#12A66B' })
    }
  }
  return out.sort((a, b) => a.fecha - b.fecha)
})
</script>
