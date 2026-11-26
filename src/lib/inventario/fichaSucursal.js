import { track } from '../reactive'
import { parseLocalDate, toLocalDateString } from '../dateUtils'
import { getFamilia, getUbicacion } from './comunes'
import { listEquipos, listMovimientos } from './sistemas'
import { listMateriales, listEntradas, listSalidas } from './mantenimiento'
import { listResponsivas } from './responsivas'
import { calcularValorDepreciado, mesesEntre } from './depreciacion'
import { getAlertasControl } from './alertasControl'
import { listAuditorias, exactitudAuditoria, ESTADO_AUDITORIA_LABEL, FRECUENCIA_AUDITORIA_DIAS } from './auditorias'

/**
 * Ficha de sucursal: todo lo que una ubicación (o un punto del mapa con varios pisos) tiene en Sistemas (TI) y
 * Mantenimiento, con los indicadores que sirven para decidir: control, trazabilidad, responsables y valor actual vs inversión.
 * Solo lectura. Las funciones son puras y baratas (recalcularlas al filtrar es seguro).
 */

// ---- Umbrales (ajustables) ----
/** Garantías que vencen en esta cantidad de días (o menos) cuentan como "por vencer". */
export const DIAS_GARANTIA_POR_VENCER = 90
/** Fracción de la vida útil consumida desde la cual el equipo se considera cerca del fin de vida. */
export const UMBRAL_FIN_VIDA = 0.85

const DIA_MS = 86400000
const MESES_PROXIMOS = 12

/** @typedef {'ti' | 'mantenimiento'} DominioFicha */
/** @typedef {'todo' | DominioFicha} FiltroDominioFicha */
/** @typedef {'equipo' | 'material'} TipoItemFicha */
/**
 * Estado de un renglón: el del equipo, o el de existencia del material.
 * @typedef {Equipo['estado'] | 'ok' | 'bajo_minimo' | 'sobre_maximo'} EstadoItemFicha
 */

export const ESTADO_ITEM_LABEL = {
  disponible: 'Disponible',
  asignado: 'Asignado',
  danado: 'Dañado',
  en_reparacion: 'En reparación',
  baja: 'Baja',
  ok: 'En rango',
  bajo_minimo: 'Bajo mínimo',
  sobre_maximo: 'Sobre máximo',
}
export const ESTADO_ITEM_TONE = {
  disponible: 'success',
  asignado: 'info',
  danado: 'danger',
  en_reparacion: 'warning',
  baja: 'neutral',
  ok: 'success',
  bajo_minimo: 'danger',
  sobre_maximo: 'warning',
}

/**
 * @typedef {object} FlagsItemFicha
 * @property {boolean} sinResponsable
 * @property {boolean} sinResponsiva
 * @property {boolean} danado
 * @property {boolean} bajoMinimo
 * @property {boolean} sobreMaximo
 * @property {boolean} garantiaPorVencer
 * @property {boolean} garantiaVencida
 * @property {boolean} finVida
 */

/**
 * @typedef {object} FichaItem
 * @property {string} id - Id del equipo o del material.
 * @property {TipoItemFicha} tipo
 * @property {DominioFicha} dominio
 * @property {string} familiaId
 * @property {string} familia
 * @property {string} nombre - Modelo (equipos) o nombre (materiales).
 * @property {string} [marca]
 * @property {string} [serie]
 * @property {string} ubicacionId
 * @property {string} ubicacion
 * @property {string} piso - "Piso 2" cuando la ubicación es un piso; si no, el nombre de la ubicación.
 * @property {string} [responsable]
 * @property {string} [puesto]
 * @property {string} [area]
 * @property {EstadoItemFicha} estado
 * @property {string} estadoLabel
 * @property {string} [fechaCompra]
 * @property {string} [proveedor]
 * @property {string} [factura]
 * @property {number} costoOriginal - Equipos: costo de compra. Materiales: existencia × costo unitario.
 * @property {number} valorActual - Equipos: valor depreciado hoy. Materiales: existencia × costo unitario.
 * @property {number | null} vidaPct - Equipos serializados: fracción de la vida útil consumida (0 = nuevo, 1 = fin de vida; puede pasar de 1).
 * @property {number | null} mesesRestantes - Meses que faltan para el fin de vida útil (negativo = ya la rebasó).
 * @property {number | null} mesesAntiguedad
 * @property {number | null} garantiaDias - Días restantes de garantía (negativo = vencida); null = sin garantía registrada.
 * @property {string} [garantiaFin]
 * @property {boolean | null} responsivaFirmada - null = no aplica (materiales o equipos que no están asignados).
 * @property {string} [responsivaFolio]
 * @property {number} [cantidad] - Materiales
 * @property {string} [unidad]
 * @property {number} [minimo]
 * @property {number} [maximo]
 * @property {number} [costoUnitario]
 * @property {string} [notas]
 * @property {FlagsItemFicha} flags
 * @property {number} nAlertas - Cuántas alertas distintas tiene la partida (para ordenar/mostrar).
 * @property {{ path: '/sistemas' | '/mantenimiento'; query: { familia: string; highlight: string } }} ruta
 */

/**
 * @typedef {object} FichaFamilia
 * @property {string} familiaId
 * @property {string} nombre
 * @property {DominioFicha} dominio
 * @property {number} partidas - Renglones (equipos + materiales).
 * @property {number} unidades - Piezas: equipos + unidades de material.
 * @property {number} valorActual
 * @property {number} invertido
 */

/**
 * @typedef {object} FichaResponsable
 * @property {string} nombre
 * @property {string} [puesto]
 * @property {number} equipos
 * @property {number} valor
 * @property {number} conResponsiva
 * @property {number} sinResponsiva
 * @property {string[]} familias
 */

/**
 * @typedef {object} FichaMovimiento
 * @property {string} id
 * @property {number} fecha
 * @property {'asignacion' | 'reasignacion' | 'cambio_estado' | 'baja' | 'entrada' | 'consumo' | 'traslado_salida' | 'traslado_entrada' | 'responsiva' | 'devolucion'} tipo
 * @property {DominioFicha} dominio
 * @property {string} titulo
 * @property {string} detalle
 * @property {string} [itemId] - Equipo o material al que se refiere (para el historial por partida).
 */

/**
 * @typedef {object} FichaAlerta
 * @property {string} id
 * @property {AlertaControl['regla']} regla
 * @property {SeveridadAlerta} severidad
 * @property {string} titulo
 * @property {string} detalle
 * @property {number} conteo
 * @property {number} [valor]
 * @property {AlertaItem[]} items
 */

/**
 * @typedef {object} FichaAuditoriaUbicacion
 * @property {string} ubicacionId
 * @property {string} nombre
 * @property {string} [ultimaId]
 * @property {number | null} ultimaFecha - Fecha de cierre de la última auditoría completada.
 * @property {number | null} exactitud
 * @property {number} partidas
 * @property {AuditoriaEstado | null} estado
 * @property {string} estadoLabel
 * @property {number} proxima
 * @property {number} dias - Días hasta la próxima (negativo = vencida).
 * @property {boolean} vencida
 * @property {boolean} nunca
 * @property {AuditoriaEstado | null} abiertaEstado - Auditoría abierta (en conteo / por verificar), si hay.
 * @property {string} abiertaLabel
 */

/**
 * @typedef {object} FichaAuditoria
 * @property {FichaAuditoriaUbicacion[]} porUbicacion
 * @property {FichaAuditoriaUbicacion | null} ultima - La auditoría cerrada más reciente de todo el grupo.
 * @property {FichaAuditoriaUbicacion | null} proxima - La próxima fecha más cercana (o vencida) del grupo.
 * @property {boolean} vencida
 */

/**
 * @typedef {object} FichaKpis
 * @property {number} valorTI
 * @property {number} valorMtto
 * @property {number} valorActual
 * @property {number} valorInvertido
 * @property {number} pctConservado - 0-100, sobre lo invertido.
 * @property {number} pctDepreciado
 * @property {number} equipos
 * @property {number} equiposTI
 * @property {number} equiposMtto
 * @property {number} materiales
 * @property {number} unidadesMaterial
 * @property {number} responsables
 * @property {number} sinResponsable
 * @property {number} sinResponsiva
 * @property {number} asignados - Asignados que sí requieren responsiva (base del % firmado).
 * @property {number} danados
 * @property {number} bajoMinimo
 * @property {number} sobreMaximo
 * @property {number} garantiaPorVencer
 * @property {number} garantiaVencida
 * @property {number} finVida
 * @property {number} reposicionFinVida - Costo estimado de reponer los equipos cerca del fin de vida (a su costo de compra).
 * @property {number | null} antiguedadMeses - Meses promedio de antigüedad de los equipos con fecha de compra; null = sin datos.
 */

/**
 * @typedef {object} FichaReposicion
 * @property {{ n: number; valor: number }} vencidos - Ya rebasaron su vida útil.
 * @property {{ n: number; valor: number }} cerca - Entre el 85% de su vida útil y el fin.
 * @property {{ n: number; valor: number }} proximos12m - Llegan al fin de su vida útil dentro de los próximos 12 meses (sin contar los ya vencidos).
 * @property {{ etiqueta: string; n: number; valor: number }[]} tramos - Distribución de equipos por tramo de vida consumida.
 */

/**
 * @typedef {object} FichaUbicacion
 * @property {string} id
 * @property {string} nombre
 * @property {string} piso
 * @property {number} valor
 * @property {number} partidas
 */

/**
 * @typedef {object} FichaSucursal
 * @property {string[]} ubicacionIds
 * @property {string} nombre
 * @property {UbicacionTipo | 'otro'} tipo
 * @property {string} tipoLabel
 * @property {FichaUbicacion[]} ubicaciones - Una entrada por ubicación (pisos).
 * @property {boolean} agrupada
 * @property {FichaKpis} kpis
 * @property {FichaFamilia[]} familias
 * @property {FichaResponsable[]} responsables
 * @property {{ equipos: number; valor: number }} sinResponsableDetalle - Equipos activos sin responsable (fila aparte de "quién tiene qué").
 * @property {FichaReposicion} reposicion
 * @property {FichaItem[]} items
 * @property {FichaAlerta[]} alertas
 * @property {FichaAuditoria} auditoria
 * @property {FichaMovimiento[]} movimientos
 * @property {Record<string, FichaMovimiento[]>} historialPorItem - Historial resumido (más reciente primero) por equipo/material.
 */

const TIPO_LABEL = { sucursal: 'Sucursal', cedis: 'Centro de distribución', oficina: 'Oficina', otro: 'Otra ubicación' }

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const money = (n) => currency.format(Math.round(n))

function tsFecha(fecha) {
  if (!fecha) return NaN
  return parseLocalDate(fecha.slice(0, 10)).getTime()
}

function nombreUbicacion(id) {
  return (id && getUbicacion(id)?.nombre) || id || 'Sin ubicación'
}

function pisoDe(nombre) {
  const m = /piso\s+(\d+)\s*$/i.exec(nombre)
  return m ? `Piso ${m[1]}` : nombre
}

function nombreDeGrupo(nombres) {
  if (nombres.length === 1) return nombres[0]
  const bases = nombres.map((n) => n.replace(/\s+piso\s+\d+\s*$/i, '').trim())
  if (bases.every((b) => b === bases[0])) return bases[0]
  return nombres.join(' / ')
}

function dominioDe(f) {
  return f?.tipo === 'mantenimiento' ? 'mantenimiento' : 'ti'
}

function normalizar(s) {
  return (s ?? '').trim().toLowerCase()
}

function sumarMeses(fecha, meses) {
  const d = parseLocalDate(fecha.slice(0, 10))
  return new Date(d.getFullYear(), d.getMonth() + meses, d.getDate())
}

/** Responsiva vigente por equipo (la última, si es una entrega). Una sola pasada sobre las responsivas. */
function responsivasVigentes() {
  const vistos = new Set()
  const vigentes = new Map()
  for (const r of listResponsivas()) {
    if (vistos.has(r.equipoId)) continue
    vistos.add(r.equipoId)
    if (r.tipo === 'entrega') vigentes.set(r.equipoId, r)
  }
  return vigentes
}

function itemDeEquipo(e, familia, vigentes, now) {
  const valorActual = calcularValorDepreciado(e, familia)
  const fechaBase = e.fechaCompra ?? e.fechaAsignacion
  const mesesAntig = fechaBase ? mesesEntre(fechaBase) : mesesEntre(toLocalDateString(new Date(e.createdAt)))
  const vidaPct = familia.vidaUtilMeses > 0 ? mesesAntig / familia.vidaUtilMeses : null
  const mesesRestantes = familia.vidaUtilMeses > 0 ? familia.vidaUtilMeses - mesesAntig : null

  let garantiaDias = null
  let garantiaFin
  if (e.fechaCompra && e.garantiaMeses && e.garantiaMeses > 0) {
    const fin = sumarMeses(e.fechaCompra, e.garantiaMeses)
    garantiaFin = toLocalDateString(fin)
    garantiaDias = Math.ceil((fin.getTime() - now) / DIA_MS)
  }

  const responsable = e.usuarioAsignado?.trim() || undefined
  const resp = vigentes.get(e.id)
  const asignado = e.estado === 'asignado'
  const firmada = resp ? !!resp.documentoUrl : !!e.responsivaUrl
  const responsivaFirmada = asignado ? firmada : null

  const flags = {
    sinResponsable: !responsable,
    sinResponsiva: asignado && !firmada,
    danado: e.estado === 'danado' || e.estado === 'en_reparacion',
    bajoMinimo: false,
    sobreMaximo: false,
    garantiaPorVencer: garantiaDias !== null && garantiaDias >= 0 && garantiaDias <= DIAS_GARANTIA_POR_VENCER,
    garantiaVencida: garantiaDias !== null && garantiaDias < 0,
    finVida: vidaPct !== null && vidaPct >= UMBRAL_FIN_VIDA,
  }
  const ubicacion = nombreUbicacion(e.ubicacionId)
  return {
    id: e.id,
    tipo: 'equipo',
    dominio: dominioDe(familia),
    familiaId: familia.id,
    familia: familia.nombre,
    nombre: e.modelo || e.numeroSerie || e.id,
    marca: e.marca,
    serie: e.numeroSerie,
    ubicacionId: e.ubicacionId ?? '',
    ubicacion,
    piso: pisoDe(ubicacion),
    responsable,
    puesto: e.puesto,
    area: e.areaDepartamento,
    estado: e.estado,
    estadoLabel: ESTADO_ITEM_LABEL[e.estado] ?? e.estado,
    fechaCompra: e.fechaCompra,
    proveedor: e.proveedor,
    factura: e.numeroFactura,
    costoOriginal: e.costoTotal || 0,
    valorActual,
    vidaPct,
    mesesRestantes,
    mesesAntiguedad: mesesAntig,
    garantiaDias,
    garantiaFin,
    responsivaFirmada,
    responsivaFolio: resp?.folio,
    notas: e.notas,
    flags,
    nAlertas: contarFlags(flags),
    ruta: { path: familia.tipo === 'mantenimiento' ? '/mantenimiento' : '/sistemas', query: { familia: familia.id, highlight: e.id } },
  }
}

function itemDeMaterial(m, familia) {
  const valor = m.cantidadActual * (m.costoUnitario || 0)
  const bajo = m.cantidadActual < m.minimo
  const sobre = m.maximo != null && m.maximo > 0 && m.cantidadActual > m.maximo
  const estado = bajo ? 'bajo_minimo' : sobre ? 'sobre_maximo' : 'ok'
  const flags = {
    sinResponsable: false,
    sinResponsiva: false,
    danado: false,
    bajoMinimo: bajo,
    sobreMaximo: sobre,
    garantiaPorVencer: false,
    garantiaVencida: false,
    finVida: false,
  }
  const ubicacion = nombreUbicacion(m.ubicacionId)
  return {
    id: m.id,
    tipo: 'material',
    dominio: 'mantenimiento',
    familiaId: m.familiaId,
    familia: familia?.nombre ?? m.familiaId,
    nombre: m.nombre,
    marca: m.marca,
    ubicacionId: m.ubicacionId ?? '',
    ubicacion,
    piso: pisoDe(ubicacion),
    estado,
    estadoLabel: ESTADO_ITEM_LABEL[estado] ?? estado,
    costoOriginal: valor,
    valorActual: valor,
    vidaPct: null,
    mesesRestantes: null,
    mesesAntiguedad: null,
    garantiaDias: null,
    responsivaFirmada: null,
    cantidad: m.cantidadActual,
    unidad: m.unidadMedida,
    minimo: m.minimo,
    maximo: m.maximo,
    costoUnitario: m.costoUnitario,
    notas: m.notas,
    flags,
    nAlertas: contarFlags(flags),
    ruta: { path: '/mantenimiento', query: { familia: m.familiaId, highlight: m.id } },
  }
}

function contarFlags(f) {
  return [f.sinResponsable, f.sinResponsiva, f.danado, f.bajoMinimo, f.sobreMaximo, f.garantiaPorVencer, f.finVida].filter(Boolean).length
}

function fusionarAlertas(ids, dominio) {
  if (ids.length === 0) return []
  if (ids.length === 1) {
    return getAlertasControl(ids[0], { dominio }).map((a) => ({ id: a.id, regla: a.regla, severidad: a.severidad, titulo: a.titulo, detalle: a.detalle, conteo: a.conteo, valor: a.valor, items: a.items }))
  }
  const ORDEN = { alta: 0, media: 1, baja: 2 }
  const porRegla = new Map()
  for (const id of ids) {
    for (const a of getAlertasControl(id, { dominio })) {
      const g = porRegla.get(a.regla)
      if (g) g.partes.push({ ubicacionId: id, alerta: a })
      else porRegla.set(a.regla, { base: a, partes: [{ ubicacionId: id, alerta: a }] })
    }
  }
  const res = []
  for (const { base, partes } of porRegla.values()) {
    const conteo = partes.reduce((s, p) => s + p.alerta.conteo, 0)
    const hayValor = partes.some((p) => p.alerta.valor !== undefined)
    const valor = hayValor ? partes.reduce((s, p) => s + (p.alerta.valor ?? 0), 0) : undefined
    const severidad = partes.map((p) => p.alerta.severidad).sort((a, b) => ORDEN[a] - ORDEN[b])[0]
    const items = partes.flatMap((p) =>
      p.alerta.items.map((i) => ({ texto: `${pisoDe(nombreUbicacion(p.ubicacionId))}: ${i.texto}`, ruta: i.ruta })),
    )
    res.push({
      id: base.id,
      regla: base.regla,
      severidad,
      titulo: base.titulo,
      detalle:
        partes.length === 1
          ? partes[0].alerta.detalle
          : `${conteo} en ${partes.length} ubicaciones${valor !== undefined ? ` (${money(valor)})` : ''}: ${partes.map((p) => pisoDe(nombreUbicacion(p.ubicacionId))).join(', ')}.`,
      conteo,
      valor,
      items,
    })
  }
  return res.sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad] || (b.valor ?? 0) - (a.valor ?? 0))
}

function auditoriaDe(ids, now, dominio) {
  const todas = listAuditorias().filter((a) => !dominio || a.tipo === dominio)
  const porUbicacion = ids.map((id) => {
    const propias = todas.filter((a) => a.ubicacionId === id)
    const cerradas = propias.filter((a) => a.estado === 'completada').sort((a, b) => (b.fechaCierre ?? b.fechaInicio) - (a.fechaCierre ?? a.fechaInicio))
    const ultima = cerradas[0]
    const ultimaFecha = ultima ? (ultima.fechaCierre ?? ultima.fechaInicio) : null
    const ex = ultima ? exactitudAuditoria(ultima.id) : null
    const abierta = propias.filter((a) => a.estado !== 'completada').sort((a, b) => b.fechaInicio - a.fechaInicio)[0]
    const proxima = ultimaFecha === null ? now : ultimaFecha + FRECUENCIA_AUDITORIA_DIAS * DIA_MS
    const dias = Math.ceil((proxima - now) / DIA_MS)
    return {
      ubicacionId: id,
      nombre: nombreUbicacion(id),
      ultimaId: ultima?.id,
      ultimaFecha,
      exactitud: ex?.pct ?? null,
      partidas: ex?.total ?? 0,
      estado: ultima?.estado ?? null,
      estadoLabel: ultima ? ESTADO_AUDITORIA_LABEL[ultima.estado] : 'Nunca auditada',
      proxima,
      dias,
      vencida: ultimaFecha === null || proxima < now,
      nunca: ultimaFecha === null,
      abiertaEstado: abierta?.estado ?? null,
      abiertaLabel: abierta ? ESTADO_AUDITORIA_LABEL[abierta.estado] : '',
    }
  })
  const conCierre = porUbicacion.filter((p) => p.ultimaFecha !== null).sort((a, b) => b.ultimaFecha - a.ultimaFecha)
  const ordenadas = [...porUbicacion].sort((a, b) => a.proxima - b.proxima)
  return { porUbicacion, ultima: conCierre[0] ?? null, proxima: ordenadas[0] ?? null, vencida: porUbicacion.some((p) => p.vencida) }
}

const fmtFecha = (ts) => new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

function movimientosDe(
  ids,
  equiposPorId,
  materialesPorId,
) {
  const res = []
  const nomEq = (e, id) => (e ? e.modelo || e.numeroSerie || id : 'Equipo eliminado')
  const domEq = (e) => dominioDe(getFamilia(e?.familiaId))

  for (const m of listMovimientos()) {
    const e = equiposPorId.get(m.equipoId)
    const toca = (m.ubicacionNuevaId && ids.has(m.ubicacionNuevaId)) || (m.ubicacionAnteriorId && ids.has(m.ubicacionAnteriorId)) || (e?.ubicacionId && ids.has(e.ubicacionId))
    if (!toca) continue
    const partes = []
    if (m.ubicacionAnteriorId !== m.ubicacionNuevaId && (m.ubicacionAnteriorId || m.ubicacionNuevaId)) {
      partes.push(`${m.ubicacionAnteriorId ? nombreUbicacion(m.ubicacionAnteriorId) : '—'} → ${m.ubicacionNuevaId ? nombreUbicacion(m.ubicacionNuevaId) : '—'}`)
    }
    if (m.usuarioAnterior !== m.usuarioNuevo && (m.usuarioAnterior || m.usuarioNuevo)) partes.push(`${m.usuarioAnterior || 'sin responsable'} → ${m.usuarioNuevo || 'sin responsable'}`)
    if (m.estadoAnterior !== m.estadoNuevo && m.estadoNuevo) partes.push(`${ESTADO_ITEM_LABEL[m.estadoAnterior ?? ''] ?? m.estadoAnterior ?? '—'} → ${ESTADO_ITEM_LABEL[m.estadoNuevo] ?? m.estadoNuevo}`)
    if (m.motivo) partes.push(m.motivo)
    const titulo =
      m.tipo === 'asignacion' ? 'Alta / asignación' : m.tipo === 'reasignacion' ? 'Reasignación' : m.tipo === 'baja' ? 'Baja' : 'Cambio de estado'
    res.push({
      id: `mov-${m.id}`,
      fecha: m.fecha,
      tipo: m.tipo,
      dominio: domEq(e),
      titulo: `${titulo}: ${nomEq(e, m.equipoId)}`,
      detalle: partes.join(' · '),
      itemId: m.equipoId,
    })
  }

  for (const en of listEntradas()) {
    const mat = materialesPorId.get(en.materialId)
    if (!mat?.ubicacionId || !ids.has(mat.ubicacionId)) continue
    const t = tsFecha(en.fecha)
    res.push({
      id: `ent-${en.id}`,
      fecha: Number.isFinite(t) ? t : en.createdAt,
      tipo: 'entrada',
      dominio: 'mantenimiento',
      titulo: `Entrada: ${mat.nombre} ×${en.cantidad} ${mat.unidadMedida}`,
      detalle: [en.proveedor, en.numeroFactura ? `Factura/OC ${en.numeroFactura}` : '', en.quienRecibio ? `recibió ${en.quienRecibio}` : ''].filter(Boolean).join(' · '),
      itemId: mat.id,
    })
  }

  for (const s of listSalidas()) {
    const mat = materialesPorId.get(s.materialId)
    if (!mat) continue
    const origenEn = !!mat.ubicacionId && ids.has(mat.ubicacionId)
    const destinoEn = !!s.ubicacionDestinoId && ids.has(s.ubicacionDestinoId)
    const traslado = s.tipo === 'traslado'
    if (!origenEn && !(traslado && destinoEn)) continue
    const t = tsFecha(s.fecha)
    const fecha = Number.isFinite(t) ? t : s.createdAt
    const quien = [s.quienSolicito ? `solicitó ${s.quienSolicito}` : '', s.responsable ? `responsable ${s.responsable}` : '', s.quienEntrego ? `entregó ${s.quienEntrego}` : ''].filter(Boolean)
    if (traslado && !origenEn && destinoEn) {
      res.push({
        id: `sal-${s.id}-in`,
        fecha,
        tipo: 'traslado_entrada',
        dominio: 'mantenimiento',
        titulo: `Traslado recibido: ${mat.nombre} ×${s.cantidad} ${mat.unidadMedida}`,
        detalle: [`desde ${nombreUbicacion(mat.ubicacionId)}`, ...quien].join(' · '),
        itemId: mat.id,
      })
    } else if (traslado) {
      res.push({
        id: `sal-${s.id}`,
        fecha,
        tipo: 'traslado_salida',
        dominio: 'mantenimiento',
        titulo: `Traslado enviado: ${mat.nombre} ×${s.cantidad} ${mat.unidadMedida}`,
        detalle: [`a ${nombreUbicacion(s.ubicacionDestinoId)}`, ...quien].join(' · '),
        itemId: mat.id,
      })
    } else {
      res.push({
        id: `sal-${s.id}`,
        fecha,
        tipo: 'consumo',
        dominio: 'mantenimiento',
        titulo: `Salida: ${mat.nombre} ×${s.cantidad} ${mat.unidadMedida}`,
        detalle: [s.motivo, s.ubicacionDestinoId ? `para ${nombreUbicacion(s.ubicacionDestinoId)}` : '', ...quien].filter(Boolean).join(' · '),
        itemId: mat.id,
      })
    }
  }

  for (const r of listResponsivas()) {
    const e = equiposPorId.get(r.equipoId)
    const toca = (r.ubicacionId && ids.has(r.ubicacionId)) || (e?.ubicacionId && ids.has(e.ubicacionId))
    if (!toca) continue
    const t = tsFecha(r.fecha)
    res.push({
      id: `resp-${r.id}`,
      fecha: Number.isFinite(t) ? t : r.createdAt,
      tipo: r.tipo === 'devolucion' ? 'devolucion' : 'responsiva',
      dominio: domEq(e),
      titulo: `${r.tipo === 'devolucion' ? 'Devolución' : 'Responsiva'} ${r.folio}: ${nomEq(e, r.equipoId)}`,
      detalle: [r.responsable ? `${r.tipo === 'devolucion' ? 'devuelve' : 'a'} ${r.responsable}` : '', r.documentoUrl ? 'firmada' : 'sin documento firmado'].filter(Boolean).join(' · '),
      itemId: r.equipoId,
    })
  }

  return res.sort((a, b) => b.fecha - a.fecha)
}

/**
 * Ficha de una o varias ubicaciones (p. ej. todos los pisos de un mismo punto del mapa).
 * `opts.limiteMovimientos` (12 por defecto) acota la línea de tiempo.
 */
export function getFichaSucursal(ubicacionIds, opts = {}) {
  track()
  const now = Date.now()
  const ids = [...new Set(ubicacionIds.filter(Boolean))]
  const set = new Set(ids)
  const limite = opts.limiteMovimientos ?? 12
  /** Alcance por rol: con `dominio` la ficha solo incluye ese dominio (Soporte = TI, Mantenimiento = mantenimiento). */
  const dFicha = opts.dominio === 'sistemas' ? 'ti' : opts.dominio

  const todosEquipos = listEquipos()
  const todosMateriales = listMateriales()
  const vigentes = responsivasVigentes()

  const items = []
  for (const e of todosEquipos) {
    if (e.estado === 'baja' || !e.ubicacionId || !set.has(e.ubicacionId)) continue
    const familia = getFamilia(e.familiaId)
    if (!familia) continue
    if (dFicha && dominioDe(familia) !== dFicha) continue
    items.push(itemDeEquipo(e, familia, vigentes, now))
  }
  for (const m of todosMateriales) {
    if (!m.ubicacionId || !set.has(m.ubicacionId)) continue
    if (dFicha && dFicha !== 'mantenimiento') continue
    items.push(itemDeMaterial(m, getFamilia(m.familiaId)))
  }
  items.sort((a, b) => b.valorActual - a.valorActual)

  const equiposItems = items.filter((i) => i.tipo === 'equipo')
  const materialesItems = items.filter((i) => i.tipo === 'material')

  // ---- KPIs ----
  const sum = (xs, f) => xs.reduce((s, i) => s + f(i), 0)
  const valorTI = sum(items.filter((i) => i.dominio === 'ti'), (i) => i.valorActual)
  const valorMtto = sum(items.filter((i) => i.dominio === 'mantenimiento'), (i) => i.valorActual)
  const valorActual = valorTI + valorMtto
  const valorInvertido = sum(items, (i) => i.costoOriginal)
  const pctConservado = valorInvertido > 0 ? Math.min(100, (valorActual / valorInvertido) * 100) : 0
  const responsablesSet = new Set(equiposItems.filter((i) => i.responsable).map((i) => normalizar(i.responsable)))
  const finVida = equiposItems.filter((i) => i.flags.finVida)
  const conAntig = equiposItems.filter((i) => i.mesesAntiguedad !== null && i.fechaCompra)
  const kpis = {
    valorTI,
    valorMtto,
    valorActual,
    valorInvertido,
    pctConservado,
    pctDepreciado: valorInvertido > 0 ? 100 - pctConservado : 0,
    equipos: equiposItems.length,
    equiposTI: equiposItems.filter((i) => i.dominio === 'ti').length,
    equiposMtto: equiposItems.filter((i) => i.dominio === 'mantenimiento').length,
    materiales: materialesItems.length,
    unidadesMaterial: sum(materialesItems, (i) => i.cantidad ?? 0),
    responsables: responsablesSet.size,
    sinResponsable: equiposItems.filter((i) => i.flags.sinResponsable).length,
    sinResponsiva: equiposItems.filter((i) => i.flags.sinResponsiva).length,
    asignados: equiposItems.filter((i) => i.estado === 'asignado').length,
    danados: equiposItems.filter((i) => i.flags.danado).length,
    bajoMinimo: materialesItems.filter((i) => i.flags.bajoMinimo).length,
    sobreMaximo: materialesItems.filter((i) => i.flags.sobreMaximo).length,
    garantiaPorVencer: equiposItems.filter((i) => i.flags.garantiaPorVencer).length,
    garantiaVencida: equiposItems.filter((i) => i.flags.garantiaVencida).length,
    finVida: finVida.length,
    reposicionFinVida: sum(finVida, (i) => i.costoOriginal),
    antiguedadMeses: conAntig.length > 0 ? sum(conAntig, (i) => i.mesesAntiguedad ?? 0) / conAntig.length : null,
  }

  // ---- Por familia ----
  const famMap = new Map()
  for (const i of items) {
    let f = famMap.get(i.familiaId)
    if (!f) {
      f = { familiaId: i.familiaId, nombre: i.familia, dominio: i.dominio, partidas: 0, unidades: 0, valorActual: 0, invertido: 0 }
      famMap.set(i.familiaId, f)
    }
    f.partidas += 1
    f.unidades += i.tipo === 'material' ? (i.cantidad ?? 0) : 1
    f.valorActual += i.valorActual
    f.invertido += i.costoOriginal
  }
  const familias = [...famMap.values()].sort((a, b) => b.valorActual - a.valorActual)

  // ---- Quién tiene qué ----
  const respMap = new Map()
  let sinRespN = 0
  let sinRespValor = 0
  for (const i of equiposItems) {
    if (!i.responsable) {
      sinRespN += 1
      sinRespValor += i.valorActual
      continue
    }
    const k = normalizar(i.responsable)
    let r = respMap.get(k)
    if (!r) {
      r = { nombre: i.responsable, puesto: i.puesto, equipos: 0, valor: 0, conResponsiva: 0, sinResponsiva: 0, familias: [], fams: new Map() }
      respMap.set(k, r)
    }
    r.equipos += 1
    r.valor += i.valorActual
    if (!r.puesto && i.puesto) r.puesto = i.puesto
    if (i.estado === 'asignado') {
      if (i.flags.sinResponsiva) r.sinResponsiva += 1
      else r.conResponsiva += 1
    }
    r.fams.set(i.familia, (r.fams.get(i.familia) ?? 0) + 1)
  }
  const responsables = [...respMap.values()]
    .map(({ fams, ...r }) => ({ ...r, familias: [...fams.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}${c > 1 ? ` ×${c}` : ''}`) }))
    .sort((a, b) => b.valor - a.valor)

  // ---- Vida útil / reposición ----
  const vencidos = equiposItems.filter((i) => i.vidaPct !== null && i.vidaPct >= 1)
  const cerca = equiposItems.filter((i) => i.vidaPct !== null && i.vidaPct >= UMBRAL_FIN_VIDA && i.vidaPct < 1)
  const prox = equiposItems.filter((i) => i.mesesRestantes !== null && i.mesesRestantes > 0 && i.mesesRestantes <= MESES_PROXIMOS)
  const tramo = (etiqueta, desde, hasta) => {
    const xs = equiposItems.filter((i) => i.vidaPct !== null && i.vidaPct >= desde && i.vidaPct < hasta)
    return { etiqueta, n: xs.length, valor: sum(xs, (i) => i.valorActual) }
  }
  const reposicion = {
    vencidos: { n: vencidos.length, valor: sum(vencidos, (i) => i.costoOriginal) },
    cerca: { n: cerca.length, valor: sum(cerca, (i) => i.costoOriginal) },
    proximos12m: { n: prox.length, valor: sum(prox, (i) => i.costoOriginal) },
    tramos: [tramo('0-50%', 0, 0.5), tramo('50-85%', 0.5, UMBRAL_FIN_VIDA), tramo('85-100%', UMBRAL_FIN_VIDA, 1), tramo('Más del 100%', 1, Infinity)],
  }

  // ---- Movimientos / historial ----
  const equiposPorId = new Map(todosEquipos.map((e) => [e.id, e]))
  const materialesPorId = new Map(todosMateriales.map((m) => [m.id, m]))
  const movs = movimientosDe(set, equiposPorId, materialesPorId).filter((m) => !dFicha || m.dominio === dFicha)
  const historialPorItem = {}
  for (const m of movs) {
    if (!m.itemId) continue
    const arr = (historialPorItem[m.itemId] ??= [])
    if (arr.length < 6) arr.push(m)
  }

  // ---- Identidad ----
  const nombres = ids.map((id) => nombreUbicacion(id))
  const primera = ids[0] ? getUbicacion(ids[0]) : undefined
  const tipo = primera?.tipo ?? 'otro'
  const valorPorUbi = new Map()
  for (const i of items) {
    const g = valorPorUbi.get(i.ubicacionId) ?? { valor: 0, partidas: 0 }
    g.valor += i.valorActual
    g.partidas += 1
    valorPorUbi.set(i.ubicacionId, g)
  }
  const ubicaciones = ids.map((id) => ({
    id,
    nombre: nombreUbicacion(id),
    piso: pisoDe(nombreUbicacion(id)),
    valor: valorPorUbi.get(id)?.valor ?? 0,
    partidas: valorPorUbi.get(id)?.partidas ?? 0,
  }))

  return {
    ubicacionIds: ids,
    nombre: nombres.length > 0 ? nombreDeGrupo(nombres) : 'Sin ubicación',
    tipo,
    tipoLabel: TIPO_LABEL[tipo] ?? tipo,
    ubicaciones,
    agrupada: ids.length > 1,
    kpis,
    familias,
    responsables,
    sinResponsableDetalle: { equipos: sinRespN, valor: sinRespValor },
    reposicion,
    items,
    alertas: fusionarAlertas(ids, opts.dominio),
    auditoria: auditoriaDe(ids, now, opts.dominio),
    movimientos: movs.slice(0, limite),
    historialPorItem,
  }
}

// ---- Filtros y orden de la tabla (puros) ----

/**
 * @typedef {object} FiltrosFicha
 * @property {FiltroDominioFicha} dominio
 * @property {string} familiaId - '' = todas.
 * @property {string} estado - '' = todos.
 * @property {string} responsable - '' = todos; SIN_RESPONSABLE = solo los que no tienen.
 * @property {string} q
 * @property {boolean} soloSinResponsable
 * @property {boolean} soloSinResponsiva
 * @property {boolean} soloDanados
 * @property {boolean} soloBajoMinimo
 * @property {boolean} soloGarantia
 * @property {boolean} soloFinVida
 */

export const SIN_RESPONSABLE = '__sin_responsable__'

export function filtrosVacios(dominio = 'todo') {
  return {
    dominio,
    familiaId: '',
    estado: '',
    responsable: '',
    q: '',
    soloSinResponsable: false,
    soloSinResponsiva: false,
    soloDanados: false,
    soloBajoMinimo: false,
    soloGarantia: false,
    soloFinVida: false,
  }
}

export function hayFiltrosActivos(f, dominioBase = 'todo') {
  return (
    f.dominio !== dominioBase ||
    !!f.familiaId ||
    !!f.estado ||
    !!f.responsable ||
    !!f.q.trim() ||
    f.soloSinResponsable ||
    f.soloSinResponsiva ||
    f.soloDanados ||
    f.soloBajoMinimo ||
    f.soloGarantia ||
    f.soloFinVida
  )
}

function sinAcentos(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filtrarItemsFicha(items, f) {
  const q = sinAcentos(f.q.trim())
  const respSel = f.responsable && f.responsable !== SIN_RESPONSABLE ? normalizar(f.responsable) : ''
  return items.filter((i) => {
    if (f.dominio !== 'todo' && i.dominio !== f.dominio) return false
    if (f.familiaId && i.familiaId !== f.familiaId) return false
    if (f.estado && i.estado !== f.estado) return false
    if (f.responsable === SIN_RESPONSABLE && (i.tipo !== 'equipo' || i.responsable)) return false
    if (respSel && normalizar(i.responsable) !== respSel) return false
    if (f.soloSinResponsable && !i.flags.sinResponsable) return false
    if (f.soloSinResponsiva && !i.flags.sinResponsiva) return false
    if (f.soloDanados && !i.flags.danado) return false
    if (f.soloBajoMinimo && !i.flags.bajoMinimo) return false
    if (f.soloGarantia && !i.flags.garantiaPorVencer) return false
    if (f.soloFinVida && !i.flags.finVida) return false
    if (q) {
      const texto = sinAcentos([i.nombre, i.marca, i.serie, i.familia, i.responsable, i.ubicacion, i.factura, i.proveedor].filter(Boolean).join(' '))
      if (!texto.includes(q)) return false
    }
    return true
  })
}

/**
 * @typedef {'nombre' | 'familia' | 'ubicacion' | 'responsable' | 'estado' | 'fechaCompra' | 'costoOriginal' |
 *   'valorActual' | 'vidaPct' | 'garantiaDias' | 'alertas'} ColumnaFicha
 */

export function ordenarItemsFicha(items, columna, dir) {
  const m = dir === 'asc' ? 1 : -1
  const texto = (a, b) => (a ?? '').localeCompare(b ?? '', 'es', { sensitivity: 'base' })
  // Los valores vacíos (null/undefined) siempre al final, sin importar el sentido.
  const num = (a, b) => {
    if (a == null && b == null) return 0
    if (a == null) return 1
    if (b == null) return -1
    return (a - b) * m
  }
  const copia = [...items]
  copia.sort((a, b) => {
    switch (columna) {
      case 'nombre':
        return texto(a.nombre, b.nombre) * m
      case 'familia':
        return texto(a.familia, b.familia) * m || texto(a.nombre, b.nombre)
      case 'ubicacion':
        return texto(a.ubicacion, b.ubicacion) * m
      case 'responsable':
        if (!a.responsable && b.responsable) return 1
        if (a.responsable && !b.responsable) return -1
        return texto(a.responsable, b.responsable) * m
      case 'estado':
        return texto(a.estadoLabel, b.estadoLabel) * m
      case 'fechaCompra':
        return num(a.fechaCompra ? tsFecha(a.fechaCompra) : null, b.fechaCompra ? tsFecha(b.fechaCompra) : null)
      case 'costoOriginal':
        return num(a.costoOriginal, b.costoOriginal)
      case 'valorActual':
        return num(a.valorActual, b.valorActual)
      case 'vidaPct':
        return num(a.vidaPct, b.vidaPct)
      case 'garantiaDias':
        return num(a.garantiaDias, b.garantiaDias)
      case 'alertas':
        return (a.nAlertas - b.nAlertas) * m
    }
  })
  return copia
}

export function totalesItemsFicha(items) {
  let unidades = 0
  let valorActual = 0
  let invertido = 0
  for (const i of items) {
    unidades += i.tipo === 'material' ? (i.cantidad ?? 0) : 1
    valorActual += i.valorActual
    invertido += i.costoOriginal
  }
  return { partidas: items.length, unidades, valorActual, invertido }
}

export { fmtFecha as formatoFechaFicha }
