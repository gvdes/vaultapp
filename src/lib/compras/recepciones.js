import { registrarBitacora } from '../bitacora'
import { UBICACION_STOCK_MAESTRO, getFamilia } from '../inventario/comunes'
import { addEquipo, existeCompraRef as existeCompraRefEquipo, listEquipos } from '../inventario/sistemas'
import { addMaterial, existeCompraRef as existeCompraRefMaterial, listEntradas, listMateriales, registrarEntrada } from '../inventario/mantenimiento'
import { toLocalDateString } from '../dateUtils'
import { r2 } from './tipos'
import { crearTabla, nuevoId, ahora, normalizar, usuarioActual } from './store'
import { getRequisicion, listPartidas, registrarHookTransicion } from './requisiciones'
import { destinoDeCategoria, getCategoria } from './catalogo'
import { listCompras } from './compras'
import { notificarRol, plantillaRecepcionPendiente } from './outbox'

/**
 * Alimentación del inventario. Al pasar a "Comprada", las partidas de categorías con destino `ti` / `mantenimiento`
 * generan RECEPCIONES PENDIENTES para el custodio (Soporte e Infraestructura / Gerente de Mantenimiento) con todo precargado
 * (producto, cantidad, proveedor, factura/ticket, costo unitario real, fecha, "para quién" y `compraRef`). El custodio confirma
 * en 1 clic (capturando series/etiqueta) y recién ahí se crean los equipos (uno por unidad, en stock maestro/bodega) o la
 * entrada de material. Las categorías con destino `ninguno` no generan inventario. Nada se borra.
 */
const tRec = crearTabla({
  key: 'dga_cmp_recepciones',
  tabla: 'cmp_recepciones',
  pk: 'id',
  ts: ['createdAt', 'fechaConfirmacion'],
  num: ['cantidad'],
  orderBy: 'created_at',
})

export const loadRecepcionesCache = () => tRec.load()
export const isRecepcionesCacheReady = () => tRec.isReady()
export function reiniciarRecepcionesLocal() {
  tRec.reiniciarLocal()
}

/**
 * @typedef {object} FiltroRecepciones
 * @property {EstadoRecepcion} [estado]
 * @property {'ti' | 'mantenimiento'} [destino]
 * @property {string} [folio]
 */

export function listRecepciones(filtro) {
  let list = [...tRec.list()]
  if (filtro?.estado) list = list.filter((r) => r.estado === filtro.estado)
  if (filtro?.destino) list = list.filter((r) => r.destino === filtro.destino)
  if (filtro?.folio) list = list.filter((r) => r.folio === filtro.folio)
  return list.sort((a, b) => b.createdAt - a.createdAt)
}

export function getRecepcion(id) {
  return id ? tRec.get(id) : undefined
}

export function recepcionesPendientes(destino) {
  return listRecepciones({ estado: 'pendiente', destino })
}

/** Familia de inventario sugerida (el custodio puede cambiarla al confirmar). */
export function familiaSugerida(destino, categoriaId, producto) {
  const p = normalizar(producto)
  if (destino === 'ti') {
    const reglas = [
      [/ticket|termic|miniprinter/, 'fam-impresoras-tickets'],
      [/impresora/, 'fam-impresoras'],
      [/laptop|notebook/, 'fam-laptops'],
      [/\bpc\b|computadora|escritorio/, 'fam-pc'],
      [/monitor|pantalla/, 'fam-monitores'],
      [/celular|telefono|moto/, 'fam-celulares'],
      [/tablet/, 'fam-tablets'],
      [/camara/, 'fam-camaras'],
      [/audifon|diadema/, 'fam-audifonos'],
      [/mouse/, 'fam-mouse'],
      [/teclado/, 'fam-teclados'],
      [/radio/, 'fam-radios'],
      [/cable|adaptador|cargador|switch|access|acces point|bluetooth|soporte/, 'fam-cables'],
    ]
    return reglas.find(([re]) => re.test(p))?.[1]
  }
  const cat = getCategoria(categoriaId)?.nombre ?? ''
  if (/herramienta/i.test(cat)) return 'fam-herramienta'
  if (/mobiliario|equipo/i.test(cat)) return 'fam-equipo-mtto'
  if (/ferreter/i.test(cat)) return 'fam-material'
  return undefined
}

function fechaISO(ms) {
  return toLocalDateString(new Date(ms))
}

/**
 * Crea las recepciones pendientes de una requisición comprada (solo partidas con destino ti/mantenimiento). Es idempotente:
 * no duplica una recepción de la misma partida. Avisa por correo a los custodios correspondientes.
 */
export async function generarRecepcionesPendientes(folio) {
  const req = getRequisicion(folio)
  if (!req) throw new Error('Requisición no encontrada.')
  const creadas = []
  for (const p of listPartidas(folio)) {
    const destino = destinoDeCategoria(p.categoriaId)
    if (destino === 'ninguno') continue
    if (tRec.raw().some((r) => r.partidaId === p.id)) continue
    const compras = listCompras(folio).filter((c) => c.partidaId === p.id)
    if (compras.length === 0) continue
    const cantidad = compras.reduce((s, c) => s + c.cantidadComprada, 0)
    const total = compras.reduce((s, c) => s + c.cantidadComprada * c.costoUnitarioReal, 0)
    const ultima = compras[compras.length - 1]
    const datos = {
      producto: p.producto,
      cantidad,
      categoriaId: p.categoriaId,
      categoria: getCategoria(p.categoriaId)?.nombre ?? '',
      descripcion: p.descripcion,
      modeloMarca: p.modeloMarca,
      proveedor: ultima.proveedor ?? req.proveedorElegido,
      numeroFactura: compras.map((c) => c.numeroFactura).find(Boolean),
      ticketUrl: compras.map((c) => c.ticketUrl).find(Boolean),
      costoUnitarioReal: r2(total / cantidad),
      fechaCompra: fechaISO(ultima.fecha),
      paraQuien: req.paraQuien,
      solicitante: req.solicitanteNombre,
      area: req.area,
      ubicaciones: req.ubicaciones,
      compraRef: `${folio}#${p.num}`,
      familiaSugeridaId: familiaSugerida(destino, p.categoriaId, p.producto),
    }
    const rec = { id: `rec-${nuevoId()}`, folio, partidaId: p.id, destino, cantidad, estado: 'pendiente', datos, equipoIds: [], createdAt: ahora() }
    await tRec.insert(rec)
    registrarBitacora({ tabla: 'cmp_recepciones', registroId: rec.id, accion: 'alta', despues: { ...rec, datos: { ...datos, ticketUrl: datos.ticketUrl ? '[comprobante]' : undefined } }, detalle: `Recepción pendiente (${destino}) de ${cantidad} × ${p.producto} · ${folio}` })
    creadas.push(rec)
    await notificarRol(req, destino === 'ti' ? 'infraestructura' : 'mantenimiento', plantillaRecepcionPendiente(req, datos, destino), 'recepcion_pendiente')
  }
  return creadas
}

/**
 * @typedef {object} ConfirmacionInput
 * @property {string} [usuario]
 * @property {string[]} [series] - Series por unidad (serializados). Pueden venir vacías/parciales.
 * @property {string} [familiaId] - Familia de inventario (obligatoria si no hay sugerida). Debe ser del dominio de la recepción.
 * @property {string} [ubicacionId] - Ubicación inicial (por defecto el stock maestro / bodega).
 * @property {string} [modelo]
 * @property {string} [marca]
 * @property {string} [notas]
 */

/**
 * El custodio confirma la recepción: se crean los equipos (uno por unidad, `compraRef` único) o la entrada de material.
 * Es reintentable: si ya existe el equipo/entrada con el mismo `compraRef` no se duplica.
 */
export async function confirmarRecepcion(id, input = {}) {
  const rec = getRecepcion(id)
  if (!rec) throw new Error('Recepción no encontrada.')
  if (rec.estado === 'confirmada') throw new Error('Esta recepción ya fue confirmada.')
  const req = getRequisicion(rec.folio)
  const d = rec.datos
  const familiaId = input.familiaId ?? d.familiaSugeridaId
  if (!familiaId) throw new Error('Elige la familia de inventario.')
  const familia = getFamilia(familiaId)
  if (!familia) throw new Error('La familia de inventario no existe.')
  if ((rec.destino === 'ti') !== (familia.tipo === 'sistemas')) throw new Error(`La familia elegida no es del dominio de ${rec.destino === 'ti' ? 'Sistemas' : 'Mantenimiento'}.`)
  const usuario = input.usuario ?? usuarioActual()
  const ubicacionId = input.ubicacionId ?? UBICACION_STOCK_MAESTRO
  const notas = input.notas?.trim() || `Compra ${rec.folio}${d.paraQuien ? ` · para: ${d.paraQuien}` : ''} · solicitó ${d.solicitante}`
  const equipoIds = []
  let datos = d

  if (familia.modoInventario === 'serializado') {
    if (!Number.isInteger(rec.cantidad)) throw new Error('La cantidad debe ser un número entero para crear un equipo por unidad.')
    const series = (input.series ?? []).map((s) => s.trim())
    for (let i = 0; i < rec.cantidad; i++) {
      const ref = `${d.compraRef}#${i + 1}`
      if (existeCompraRefEquipo(ref)) {
        const ya = listEquipos().find((e) => e.compraRef === ref)
        if (ya) equipoIds.push(ya.id)
        continue
      }
      const eq = await addEquipo(
        {
          familiaId,
          modelo: input.modelo?.trim() || d.modeloMarca || d.producto,
          marca: input.marca?.trim() || undefined,
          numeroSerie: series[i] || undefined,
          ubicacionId,
          proveedor: d.proveedor,
          fechaCompra: d.fechaCompra,
          numeroFactura: d.numeroFactura,
          costoTotal: d.costoUnitarioReal,
          facturaUrl: d.ticketUrl,
          estado: 'disponible',
          notas,
          compraRef: ref,
        },
        usuario,
      )
      equipoIds.push(eq.id)
    }
  } else {
    const ref = d.compraRef
    let materialId = listMateriales().find((m) => m.familiaId === familiaId && m.ubicacionId === ubicacionId && normalizar(m.nombre) === normalizar(d.producto))?.id
    if (!existeCompraRefMaterial(ref)) {
      if (!materialId) {
        const m = await addMaterial({ familiaId, nombre: d.producto, marca: input.marca?.trim() || undefined, unidadMedida: 'pieza', cantidadActual: 0, minimo: 0, costoUnitario: d.costoUnitarioReal, ubicacionId, notas })
        materialId = m.id
      }
      const e = await registrarEntrada({
        materialId,
        fecha: d.fechaCompra,
        cantidad: rec.cantidad,
        costoUnitario: d.costoUnitarioReal,
        proveedor: d.proveedor,
        numeroFactura: d.numeroFactura,
        facturaUrl: d.ticketUrl,
        quienRecibio: usuario,
        compraRef: ref,
      })
      datos = { ...d, materialId, entradaMaterialId: e.id }
    } else {
      const e = listEntradas().find((x) => x.compraRef === ref)
      datos = { ...d, materialId: e?.materialId ?? materialId, entradaMaterialId: e?.id }
    }
  }

  const next = await tRec.update(id, { estado: 'confirmada', confirmadoPor: usuario, fechaConfirmacion: ahora(), equipoIds, datos: { ...datos, familiaSugeridaId: familiaId } })
  registrarBitacora({
    tabla: 'cmp_recepciones',
    registroId: id,
    accion: 'confirmación',
    antes: { estado: 'pendiente' },
    despues: { estado: 'confirmada', equipoIds, materialId: datos.materialId },
    detalle: `${usuario} confirmó la recepción de ${rec.cantidad} × ${d.producto} (${rec.folio})${req ? '' : ''}`,
  })
  return next
}

// Al pasar a "Comprada" se generan las recepciones pendientes (solo ti / mantenimiento).
registrarHookTransicion(async ({ folio, a }) => {
  if (a === 'comprada') await generarRecepcionesPendientes(folio)
})
