<template>
  <!-- Documento imprimible: fondo blanco y colores fijos (no depende del tema claro/oscuro). -->
  <div
    v-if="auditoria"
    class="mx-auto w-full"
    style="max-width: 794px; background: #fff; color: #111827; padding: 32px 40px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.5"
  >
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px">
      <Logo size="lg" />
      <div style="text-align: right">
        <p style="font-size: 18px; font-weight: 800; color: #1e3a8a; margin: 0">Acta de auditoría física de inventario</p>
        <p style="margin: 2px 0 0">Folio: <strong>{{ folio }}</strong></p>
        <p style="margin: 0">Proceso GV-INF-008 · Inventario y Control de Equipo Informático</p>
        <p v-if="auditoria.estado !== 'completada'" style="margin: 2px 0 0; color: #b45309; font-weight: 700">BORRADOR — la auditoría aún no está cerrada ({{ ESTADO_AUDITORIA_LABEL[auditoria.estado] }})</p>
      </div>
    </div>

    <h3 :style="tituloSeccion">Datos de la auditoría</h3>
    <table style="border-collapse: collapse; width: 100%">
      <tbody>
        <tr v-for="[k, v] in filasDatos" :key="k">
          <td :style="celdaClave">{{ k }}</td>
          <td :style="celdaValor">{{ v }}</td>
        </tr>
      </tbody>
    </table>

    <h3 :style="tituloSeccion">Resumen de exactitud</h3>
    <div style="display: flex; gap: 12px">
      <div :style="cajaKpi">
        <p style="margin: 0; font-size: 22px; font-weight: 800" :style="{ color: cumpleMeta === false ? '#b91c1c' : '#047857' }">{{ exactitud.pct === null ? '—' : `${exactitud.pct}%` }}</p>
        <p style="margin: 0; font-size: 10.5px; color: #4b5563">Exactitud del inventario (meta ≥ {{ META_EXACTITUD_AUDITORIA }}%)</p>
      </div>
      <div :style="cajaKpi">
        <p style="margin: 0; font-size: 22px; font-weight: 800">{{ exactitud.total }}</p>
        <p style="margin: 0; font-size: 10.5px; color: #4b5563">Partidas contadas</p>
      </div>
      <div :style="cajaKpi">
        <p style="margin: 0; font-size: 22px; font-weight: 800">{{ exactitud.coinciden }}</p>
        <p style="margin: 0; font-size: 10.5px; color: #4b5563">Coinciden con el registro</p>
      </div>
      <div :style="cajaKpi">
        <p style="margin: 0; font-size: 22px; font-weight: 800" :style="{ color: exactitud.discrepancias > 0 ? '#b45309' : '#111827' }">{{ exactitud.discrepancias }}</p>
        <p style="margin: 0; font-size: 10.5px; color: #4b5563">Discrepancias</p>
      </div>
    </div>
    <p style="margin: 6px 0 0; color: #374151">
      Equipos: {{ resumenEquipos.bien }} en buen estado, {{ resumenEquipos.danado }} dañado(s), {{ resumenEquipos.perdido }} no encontrado(s)
      {{ resumenEquipos.pendiente > 0 ? `, ${resumenEquipos.pendiente} sin contar` : '' }}. Materiales: {{ resumenMateriales.coinciden }} coinciden, {{ resumenMateriales.difieren }} con diferencia
      {{ resumenMateriales.pendiente > 0 ? `, ${resumenMateriales.pendiente} sin contar` : '' }}.
    </p>

    <h3 :style="tituloSeccion">Discrepancias y resoluciones</h3>
    <p v-if="discrepancias.length === 0" style="margin: 0; color: #374151">Sin discrepancias: todo lo contado coincidió con el registro.</p>
    <table v-else style="border-collapse: collapse; width: 100%; font-size: 11px">
      <thead>
        <tr>
          <th v-for="c in ['Tipo', 'Artículo', 'Registro', 'Hallazgo', 'Nota del conteo', 'Resolución']" :key="c" :style="celdaEncabezado">{{ c }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in discrepancias" :key="d.id" style="page-break-inside: avoid">
          <td :style="celdaTabla">{{ d.tipo === 'equipo' ? 'Equipo' : 'Material' }}</td>
          <td :style="celdaTabla">{{ nombreItem(d) }}</td>
          <td :style="celdaTabla">{{ d.tipo === 'equipo' ? 'Presente' : `${d.cantidadEsperada} ${unidad(d)}` }}</td>
          <td :style="celdaTabla">{{ hallazgo(d) }}</td>
          <td :style="celdaTabla">{{ d.notas || '—' }}</td>
          <td :style="celdaTabla">{{ resolucion(d) }}</td>
        </tr>
      </tbody>
    </table>

    <h3 :style="tituloSeccion">Observaciones</h3>
    <p style="margin: 0; white-space: pre-wrap; text-align: justify">{{ auditoria.notas || 'Sin observaciones.' }}</p>
    <p v-if="auditoria.alcance" style="margin: 6px 0 0; color: #374151"><strong>Alcance:</strong> {{ auditoria.alcance }}</p>

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 64px">
      <div v-for="f in firmas" :key="f.rol" style="text-align: center">
        <div style="border-top: 1px solid #111827; padding-top: 4px">
          <p style="margin: 0; font-weight: 700">{{ f.rol }}</p>
          <p style="margin: 2px 0 0; color: #374151; font-size: 11px">{{ f.detalle }}</p>
        </div>
      </div>
    </div>

    <p style="margin: 28px 0 0; text-align: center; color: #6b7280; font-size: 10px">
      Documento generado por la plataforma de inventarios de Grupo Vizcarra. Una vez cerrada, la auditoría es inmutable y no puede modificarse ni eliminarse.
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Logo from 'components/Logo.vue'
import { getUbicacion } from 'src/lib/inventario/comunes'
import { getEquipo } from 'src/lib/inventario/sistemas'
import { getMaterial } from 'src/lib/inventario/mantenimiento'
import {
  discrepanciasAuditoria,
  ESTADO_AUDITORIA_LABEL,
  exactitudAuditoria,
  getAuditoria,
  itemCoincide,
  listItems,
  META_EXACTITUD_AUDITORIA,
  MODALIDAD_LABEL,
  TIPO_AUDITORIA_LABEL,
} from 'src/lib/inventario/auditorias'

const props = defineProps({ auditoriaId: { type: String, required: true } })

const auditoria = computed(() => getAuditoria(props.auditoriaId))
const ubicacion = computed(() => (auditoria.value ? getUbicacion(auditoria.value.ubicacionId) : undefined))
const items = computed(() => listItems(props.auditoriaId))
const discrepancias = computed(() => discrepanciasAuditoria(props.auditoriaId))
const exactitud = computed(() => exactitudAuditoria(props.auditoriaId))
const cumpleMeta = computed(() => (exactitud.value.pct === null ? null : exactitud.value.pct >= META_EXACTITUD_AUDITORIA))

const fecha = (t) =>
  t ? new Date(t).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

const folio = computed(() => {
  const a = auditoria.value
  if (!a) return ''
  const d = new Date(a.fechaInicio)
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `AUD-${ymd}-${a.id.slice(-4).toUpperCase()}`
})

const area = computed(() => {
  const t = auditoria.value?.tipo
  return t === 'sistemas' ? 'Infraestructura y Soporte de Redes' : t === 'mantenimiento' ? 'Gerencia de Mantenimiento' : 'Infraestructura y Mantenimiento'
})

const filasDatos = computed(() => {
  const a = auditoria.value
  if (!a) return []
  const filas = [
    ['Sucursal / ubicación', ubicacion.value?.nombre ?? a.ubicacionId],
    ['Alcance', `${TIPO_AUDITORIA_LABEL[a.tipo]}${a.alcance ? ` — ${a.alcance}` : ''}`],
    ['Fecha de inicio', fecha(a.fechaInicio)],
  ]
  if (a.fechaProgramada) filas.push(['Fecha programada', fecha(new Date(`${a.fechaProgramada}T00:00:00`).getTime())])
  filas.push(['Conteo enviado a verificación', fecha(a.fechaEnvio)])
  filas.push(['Fecha de cierre', a.fechaCierre ? fecha(a.fechaCierre) : 'Pendiente (auditoría abierta)'])
  filas.push(['Modalidad', MODALIDAD_LABEL[a.modalidad] + (a.sorpresa ? ' · sorpresa' : '')])
  filas.push(['Auditor / quien contó', a.auditorNombre ?? (a.modalidad === 'interna' ? (a.realizadaPor ?? '—') : '—')])
  filas.push(['Verificó y cerró', a.verificadaPor ?? '—'])
  return filas
})

const resumenEquipos = computed(() => {
  const eq = items.value.filter((i) => i.tipo === 'equipo')
  return {
    bien: eq.filter((i) => i.encontrado && i.condicion !== 'danado').length,
    danado: eq.filter((i) => i.encontrado && i.condicion === 'danado').length,
    perdido: eq.filter((i) => i.encontrado === false).length,
    pendiente: eq.filter((i) => i.encontrado === undefined).length,
  }
})
const resumenMateriales = computed(() => {
  const ma = items.value.filter((i) => i.tipo === 'material')
  return {
    coinciden: ma.filter((i) => itemCoincide(i) === true).length,
    difieren: ma.filter((i) => itemCoincide(i) === false).length,
    pendiente: ma.filter((i) => i.cantidadContada == null).length,
  }
})

function nombreItem(i) {
  if (i.tipo === 'equipo') {
    const e = i.equipoId ? getEquipo(i.equipoId) : undefined
    return `${e?.modelo || 'Equipo'}${e?.numeroSerie ? ` · ${e.numeroSerie}` : ''}`
  }
  return (i.materialId ? getMaterial(i.materialId)?.nombre : undefined) ?? 'Material'
}
const unidad = (i) => (i.materialId ? (getMaterial(i.materialId)?.unidadMedida ?? '') : '')
function hallazgo(i) {
  if (i.tipo === 'equipo') return i.encontrado === false ? 'No encontrado' : 'Encontrado dañado'
  const dif = (i.cantidadContada ?? 0) - (i.cantidadEsperada ?? 0)
  return `Contado ${i.cantidadContada} ${unidad(i)} (${dif > 0 ? '+' : ''}${dif})`
}
function resolucion(i) {
  if (i.resolucion) return i.resolucion
  if (i.tipo === 'equipo') {
    const e = i.equipoId ? getEquipo(i.equipoId) : undefined
    if (e?.estado === 'baja') return 'Dado de baja'
  }
  return auditoria.value?.estado === 'completada' ? 'Sin resolver al cierre' : 'Pendiente'
}

const firmas = computed(() => {
  const a = auditoria.value
  return [
    { rol: 'Auditor', detalle: a?.auditorNombre ?? a?.realizadaPor ?? 'Nombre y firma' },
    { rol: 'Gerente de la sucursal', detalle: ubicacion.value?.nombre ?? 'Nombre y firma' },
    { rol: `Verifica ${area.value}`, detalle: a?.verificadaPor ?? 'Nombre y firma' },
  ]
})

const tituloSeccion = 'font-size: 13px; font-weight: 800; color: #1e3a8a; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 0.03em'
const celdaClave = 'border: 1px solid #d1d5db; background: #f3f4f6; padding: 5px 8px; font-weight: 700; width: 32%'
const celdaValor = 'border: 1px solid #d1d5db; padding: 5px 8px'
const cajaKpi = 'flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px; text-align: center'
const celdaEncabezado = 'border: 1px solid #d1d5db; background: #f3f4f6; padding: 4px 6px; text-align: left; font-weight: 700'
const celdaTabla = 'border: 1px solid #d1d5db; padding: 4px 6px; vertical-align: top'
</script>
