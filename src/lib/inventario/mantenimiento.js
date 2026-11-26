import { track } from '../reactive'
import { supabase, isSupabaseConfigured } from '../supabase'
import { leerTodo } from '../supabaseTodo'
import { registrarBitacora, cambios } from '../bitacora'

/**
 * @typedef {object} Material
 * @property {string} id
 * @property {string} familiaId
 * @property {string} nombre
 * @property {string} [marca]
 * @property {string} [descripcion] - Detalle: qué es, presentación y para qué se usa (obligatorio en consumibles).
 * @property {string} unidadMedida
 * @property {number} cantidadActual
 * @property {number} minimo
 * @property {number} [maximo]
 * @property {number} costoUnitario
 * @property {number} [ultimoCosto]
 * @property {number} [garantiaMeses]
 * @property {string} [ubicacionId]
 * @property {string} [notas]
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {object} MaterialEntrada
 * @property {string} id
 * @property {string} materialId
 * @property {string} fecha
 * @property {number} cantidad
 * @property {number} [costoUnitario]
 * @property {string} [proveedor]
 * @property {string} [proveedorId]
 * @property {string} [numeroFactura] - Número de factura u orden de compra (evidencia de la compra; inmutable para los operadores).
 * @property {string} [facturaUrl]
 * @property {string} [quienRecibio]
 * @property {string} [compraRef] - Referencia única de la compra importada (evita duplicar al re-importar).
 * @property {number} createdAt
 */

/**
 * @typedef {object} MaterialSalida
 * @property {string} id
 * @property {string} materialId
 * @property {string} fecha
 * @property {number} cantidad
 * @property {string} [motivo]
 * @property {string} [ubicacionDestinoId]
 * @property {string} [quienSolicito]
 * @property {string} [quienEntrego]
 * @property {string} [responsable]
 * @property {string} [evidenciaUrl]
 * @property {'consumo' | 'traslado'} [tipo] - 'consumo' (default): el material se usa/gasta. 'traslado': pasa a ser inventario de la sucursal destino.
 * @property {number} createdAt
 */

const MATERIALES_KEY = 'dga_inv_materiales'
const ENTRADAS_KEY = 'dga_inv_materiales_entradas'
const SALIDAS_KEY = 'dga_inv_materiales_salidas'

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function writeLocal(key, items) {
  localStorage.setItem(key, JSON.stringify(items))
}

function materialFromRow(r) {
  return {
    id: r.id,
    familiaId: r.familia_id,
    nombre: r.nombre,
    marca: r.marca ?? undefined,
    descripcion: r.descripcion ?? undefined,
    unidadMedida: r.unidad_medida,
    cantidadActual: Number(r.cantidad_actual ?? 0),
    minimo: Number(r.minimo ?? 0),
    maximo: r.maximo != null ? Number(r.maximo) : undefined,
    costoUnitario: Number(r.costo_unitario ?? 0),
    ultimoCosto: r.ultimo_costo != null ? Number(r.ultimo_costo) : undefined,
    garantiaMeses: r.garantia_meses != null ? Number(r.garantia_meses) : undefined,
    ubicacionId: r.ubicacion_id ?? undefined,
    notas: r.notas ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  }
}

function materialToRow(m) {
  const row = {}
  if (m.familiaId !== undefined) row.familia_id = m.familiaId
  if (m.nombre !== undefined) row.nombre = m.nombre
  if (m.marca !== undefined) row.marca = m.marca || null
  if (m.descripcion !== undefined) row.descripcion = m.descripcion || null
  if (m.unidadMedida !== undefined) row.unidad_medida = m.unidadMedida
  if (m.cantidadActual !== undefined) row.cantidad_actual = m.cantidadActual
  if (m.minimo !== undefined) row.minimo = m.minimo
  if (m.maximo !== undefined) row.maximo = m.maximo ?? null
  if (m.costoUnitario !== undefined) row.costo_unitario = m.costoUnitario
  if (m.ultimoCosto !== undefined) row.ultimo_costo = m.ultimoCosto ?? null
  if (m.garantiaMeses !== undefined) row.garantia_meses = m.garantiaMeses ?? null
  if (m.ubicacionId !== undefined) row.ubicacion_id = m.ubicacionId || null
  if (m.notas !== undefined) row.notas = m.notas || null
  return row
}

let materialesCache = []
let entradasCache = []
let salidasCache = []
let ready = false

export async function loadMantenimientoCache() {
  if (!isSupabaseConfigured || !supabase) {
    materialesCache = readLocal(MATERIALES_KEY)
    entradasCache = readLocal(ENTRADAS_KEY)
    salidasCache = readLocal(SALIDAS_KEY)
    ready = true
    return
  }
  const [matRes, entRes, salRes] = await Promise.all([
    leerTodo('inv_materiales'),
    leerTodo('inv_materiales_entradas', { orden: 'fecha', ascendente: false }),
    leerTodo('inv_materiales_salidas', { orden: 'fecha', ascendente: false }),
  ])
  materialesCache = (matRes.data ?? []).map(materialFromRow)
  entradasCache = (entRes.data ?? []).map((r) => ({
    id: r.id,
    materialId: r.material_id,
    fecha: r.fecha,
    cantidad: Number(r.cantidad),
    costoUnitario: r.costo_unitario != null ? Number(r.costo_unitario) : undefined,
    proveedor: r.proveedor ?? undefined,
    proveedorId: r.proveedor_id ?? undefined,
    numeroFactura: r.numero_factura ?? undefined,
    facturaUrl: r.factura_url ?? undefined,
    quienRecibio: r.quien_recibio ?? undefined,
    compraRef: r.compra_ref ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
  }))
  salidasCache = (salRes.data ?? []).map((r) => ({
    id: r.id,
    materialId: r.material_id,
    fecha: r.fecha,
    cantidad: Number(r.cantidad),
    motivo: r.motivo ?? undefined,
    ubicacionDestinoId: r.ubicacion_destino_id ?? undefined,
    quienSolicito: r.quien_solicito ?? undefined,
    quienEntrego: r.quien_entrego ?? undefined,
    responsable: r.responsable ?? undefined,
    evidenciaUrl: r.evidencia_url ?? undefined,
    tipo: r.tipo ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
  }))
  ready = true
}

export function isMantenimientoCacheReady() {
  return ready
}

export function listMateriales() {
  track()
  return materialesCache
}

export function listMaterialesPorFamilia(familiaId) {
  track()
  return materialesCache.filter((m) => m.familiaId === familiaId)
}

export function getMaterial(id) {
  track()
  return materialesCache.find((m) => m.id === id)
}

export async function addMaterial(input) {
  const now = Date.now()
  const material = { id: `${now}-${Math.round(Math.random() * 1e6)}`, ...input, createdAt: now, updatedAt: now }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_materiales').insert({ id: material.id, ...materialToRow(material) })
    if (error) throw error
  } else {
    writeLocal(MATERIALES_KEY, [...readLocal(MATERIALES_KEY), material])
  }
  materialesCache = [...materialesCache, material]
  registrarBitacora({ tabla: 'inv_materiales', registroId: material.id, accion: 'alta', despues: material, detalle: `Alta de material ${material.nombre}` })
  return material
}

export async function updateMaterial(id, patch) {
  const prev = materialesCache.find((m) => m.id === id)
  materialesCache = materialesCache.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: Date.now() } : m))
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_materiales').update({ ...materialToRow(patch), updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  } else {
    writeLocal(MATERIALES_KEY, materialesCache)
  }
  const dif = cambios(prev, patch)
  if (Object.keys(dif.despues).length > 0) {
    registrarBitacora({ tabla: 'inv_materiales', registroId: id, accion: 'cambio', antes: dif.antes, despues: dif.despues, detalle: prev ? `Material ${prev.nombre}` : undefined })
  }
}

export function listEntradas(materialId) {
  track()
  const list = materialId ? entradasCache.filter((e) => e.materialId === materialId) : entradasCache
  return [...list].sort((a, b) => b.createdAt - a.createdAt)
}

/** ¿Ya existe una entrada importada con esta referencia de compra? */
export function existeCompraRef(ref) {
  track()
  return entradasCache.some((e) => e.compraRef === ref)
}

export function listSalidas(materialId) {
  track()
  const list = materialId ? salidasCache.filter((s) => s.materialId === materialId) : salidasCache
  return [...list].sort((a, b) => b.createdAt - a.createdAt)
}

/** Salidas que son consumo real (excluye los traslados entre ubicaciones, que no gastan material). */
export function listConsumos(materialId) {
  return listSalidas(materialId).filter((s) => s.tipo !== 'traslado')
}

export async function registrarEntrada(input) {
  const now = Date.now()
  const entrada = { id: `${now}-${Math.round(Math.random() * 1e6)}`, ...input, createdAt: now }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_materiales_entradas').insert({
      id: entrada.id,
      material_id: entrada.materialId,
      fecha: entrada.fecha,
      cantidad: entrada.cantidad,
      costo_unitario: entrada.costoUnitario ?? null,
      proveedor: entrada.proveedor ?? null,
      proveedor_id: entrada.proveedorId ?? null,
      numero_factura: entrada.numeroFactura ?? null,
      factura_url: entrada.facturaUrl ?? null,
      quien_recibio: entrada.quienRecibio ?? null,
      compra_ref: entrada.compraRef ?? null,
    })
    if (error) throw error
  } else {
    writeLocal(ENTRADAS_KEY, [...readLocal(ENTRADAS_KEY), entrada])
  }
  entradasCache = [entrada, ...entradasCache]
  registrarBitacora({
    tabla: 'inv_materiales_entradas',
    registroId: entrada.id,
    accion: 'entrada',
    despues: entrada,
    detalle: `Entrada de ${entrada.cantidad} a ${getMaterial(entrada.materialId)?.nombre ?? entrada.materialId}`,
  })

  const material = getMaterial(entrada.materialId)
  if (material) {
    await updateMaterial(material.id, {
      cantidadActual: material.cantidadActual + entrada.cantidad,
      ...(entrada.costoUnitario != null ? { ultimoCosto: entrada.costoUnitario, costoUnitario: entrada.costoUnitario } : {}),
    })
  }
  return entrada
}

export async function registrarSalida(input) {
  const material = getMaterial(input.materialId)
  if (!material) throw new Error('Material no encontrado')
  if (input.cantidad > material.cantidadActual) throw new Error('No hay suficiente existencia para esta salida.')

  const now = Date.now()
  const salida = { id: `${now}-${Math.round(Math.random() * 1e6)}`, ...input, createdAt: now }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_materiales_salidas').insert({
      id: salida.id,
      material_id: salida.materialId,
      fecha: salida.fecha,
      cantidad: salida.cantidad,
      motivo: salida.motivo ?? null,
      ubicacion_destino_id: salida.ubicacionDestinoId ?? null,
      quien_solicito: salida.quienSolicito ?? null,
      quien_entrego: salida.quienEntrego ?? null,
      responsable: salida.responsable ?? null,
      evidencia_url: salida.evidenciaUrl ?? null,
      tipo: salida.tipo ?? 'consumo',
    })
    if (error) throw error
  } else {
    writeLocal(SALIDAS_KEY, [...readLocal(SALIDAS_KEY), salida])
  }
  salidasCache = [salida, ...salidasCache]
  registrarBitacora({
    tabla: 'inv_materiales_salidas',
    registroId: salida.id,
    accion: salida.tipo === 'traslado' ? 'traslado' : 'salida',
    despues: salida,
    detalle: `Salida de ${salida.cantidad} de ${material.nombre}${salida.motivo ? `: ${salida.motivo}` : ''}`,
  })
  await updateMaterial(material.id, { cantidadActual: material.cantidadActual - salida.cantidad })
  return salida
}

/**
 * @typedef {object} TrasladoInput
 * @property {string} materialId
 * @property {string} destinoId
 * @property {number} cantidad
 * @property {string} fecha
 * @property {string} [quienSolicito]
 * @property {string} [responsable]
 * @property {string} [quienEntrego]
 * @property {string} [motivo]
 */

/**
 * Traslada material del stock de origen a una sucursal/área: baja la existencia de origen y la SUMA a un registro
 * del mismo material en la ubicación destino (se crea si no existe). No cuenta como consumo; el material pasa a ser
 * inventario de esa sucursal (y aparece en su valor del mapa y en sus auditorías).
 * Con Supabase usa la función segura `trasladar_material` (una sola transacción en la base de datos).
 */
export async function trasladarMaterial(input) {
  const origen = getMaterial(input.materialId)
  if (!origen) throw new Error('Material no encontrado')
  if (!input.cantidad || input.cantidad <= 0) throw new Error('La cantidad debe ser mayor a cero.')
  if (input.cantidad > origen.cantidadActual) throw new Error('No hay suficiente existencia para el traslado.')
  if (origen.ubicacionId === input.destinoId) throw new Error('El destino es la misma ubicación de origen.')

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('trasladar_material', {
      p_material_id: input.materialId,
      p_destino_id: input.destinoId,
      p_cantidad: input.cantidad,
      p_fecha: input.fecha,
      p_solicito: input.quienSolicito ?? null,
      p_responsable: input.responsable ?? null,
      p_entrego: input.quienEntrego ?? null,
    })
    if (error) throw error
    registrarBitacora({
      tabla: 'inv_materiales',
      registroId: input.materialId,
      accion: 'traslado',
      despues: { destinoId: input.destinoId, cantidad: input.cantidad },
      detalle: `Traslado de ${input.cantidad} de ${origen.nombre}`,
    })
    await loadMantenimientoCache()
    return
  }

  const existente = materialesCache.find(
    (m) => m.id !== origen.id && m.familiaId === origen.familiaId && m.nombre === origen.nombre && m.ubicacionId === input.destinoId,
  )
  const destino =
    existente ??
    (await addMaterial({
      familiaId: origen.familiaId,
      nombre: origen.nombre,
      marca: origen.marca,
      descripcion: origen.descripcion,
      unidadMedida: origen.unidadMedida,
      cantidadActual: 0,
      minimo: 0,
      costoUnitario: origen.costoUnitario,
      ultimoCosto: origen.ultimoCosto,
      garantiaMeses: origen.garantiaMeses,
      ubicacionId: input.destinoId,
      notas: origen.notas,
    }))
  await registrarSalida({
    materialId: origen.id,
    fecha: input.fecha,
    cantidad: input.cantidad,
    motivo: input.motivo ?? 'Traslado',
    ubicacionDestinoId: input.destinoId,
    quienSolicito: input.quienSolicito,
    quienEntrego: input.quienEntrego,
    responsable: input.responsable,
    tipo: 'traslado',
  })
  await updateMaterial(destino.id, { cantidadActual: destino.cantidadActual + input.cantidad })
}

export function materialesBajoMinimo() {
  track()
  return materialesCache.filter((m) => m.cantidadActual < m.minimo)
}

export function valorInventarioMantenimiento() {
  track()
  return materialesCache.reduce((sum, m) => sum + m.cantidadActual * (m.costoUnitario || 0), 0)
}
