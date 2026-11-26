import { supabase, isSupabaseConfigured } from '../supabase'
import { loadAllCaches } from '../dataSync'
import { getFamilia, getUbicacion } from './comunes'
import { getEquipo } from './sistemas'
import { getMaterial } from './mantenimiento'

/**
 * Datos de identificación y custodia que puede ver CUALQUIERA que escanee un QR (sin sesión).
 * Nunca incluyen costos, facturas ni proveedor.
 *
 * Con Supabase se leen mediante las funciones RPC `verificar_equipo` / `verificar_material`
 * (migración 007): el usuario anónimo no tiene acceso de lectura a las tablas.
 * Sin Supabase (modo demo local) se leen de las cachés en memoria.
 * @typedef {object} EquipoPublico
 * @property {string} id
 * @property {string} [familia]
 * @property {string} [modelo]
 * @property {string} [marca]
 * @property {string} [numeroSerie]
 * @property {string} [ubicacion]
 * @property {string} [usuarioAsignado]
 * @property {string} [areaDepartamento]
 * @property {string} estado
 * @property {string} [fotoUrl]
 */

/**
 * @typedef {object} MaterialPublico
 * @property {string} id
 * @property {string} [familia]
 * @property {string} nombre
 * @property {string} [marca]
 * @property {string} [descripcion]
 * @property {string} unidadMedida
 * @property {number} cantidadActual
 * @property {string} [ubicacion]
 */

export async function fetchEquipoPublico(id) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('verificar_equipo', { p_id: id })
    const r = Array.isArray(data) ? data[0] : null
    if (error || !r) return null
    return {
      id: r.id,
      familia: r.familia ?? undefined,
      modelo: r.modelo ?? undefined,
      marca: r.marca ?? undefined,
      numeroSerie: r.numero_serie ?? undefined,
      ubicacion: r.ubicacion ?? undefined,
      usuarioAsignado: r.usuario_asignado ?? undefined,
      areaDepartamento: r.area_departamento ?? undefined,
      estado: r.estado,
      fotoUrl: r.foto_url ?? undefined,
    }
  }
  await loadAllCaches()
  const e = getEquipo(id)
  if (!e) return null
  return {
    id: e.id,
    familia: getFamilia(e.familiaId)?.nombre,
    modelo: e.modelo,
    marca: e.marca,
    numeroSerie: e.numeroSerie,
    ubicacion: getUbicacion(e.ubicacionId)?.nombre,
    usuarioAsignado: e.usuarioAsignado,
    areaDepartamento: e.areaDepartamento,
    estado: e.estado,
    fotoUrl: e.fotoUrl,
  }
}

export async function fetchMaterialPublico(id) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('verificar_material', { p_id: id })
    const r = Array.isArray(data) ? data[0] : null
    if (error || !r) return null
    return {
      id: r.id,
      familia: r.familia ?? undefined,
      nombre: r.nombre,
      marca: r.marca ?? undefined,
      descripcion: r.descripcion ?? undefined,
      unidadMedida: r.unidad_medida,
      cantidadActual: Number(r.cantidad_actual ?? 0),
      ubicacion: r.ubicacion ?? undefined,
    }
  }
  await loadAllCaches()
  const m = getMaterial(id)
  if (!m) return null
  return {
    id: m.id,
    familia: getFamilia(m.familiaId)?.nombre,
    nombre: m.nombre,
    marca: m.marca,
    descripcion: m.descripcion,
    unidadMedida: m.unidadMedida,
    cantidadActual: m.cantidadActual,
    ubicacion: getUbicacion(m.ubicacionId)?.nombre,
  }
}
