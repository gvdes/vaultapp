import { supabase, isSupabaseConfigured } from '../supabase'
import { loadAllCaches } from '../dataSync'
import { getFamilia, getUbicacion } from './comunes'
import { getEquipo } from './sistemas'
import { getMaterial } from './mantenimiento'
import {
  enviarAVerificacion,
  getAuditoriaPorToken,
  listItems,
  marcarEquipoItem,
  marcarMaterialItem,
} from './auditorias'

/**
 * Conteo público de una auditoría por LIGA (token), sin sesión.
 *
 * Con Supabase todo va por las funciones `SECURITY DEFINER` de la migración 015 (`auditoria_publica_obtener`,
 * `auditoria_publica_marcar`, `auditoria_publica_enviar`): el usuario anónimo no lee tablas y solo puede tocar los ítems
 * de la auditoría dueña del token mientras está `en_conteo`. Sin Supabase (modo demo local) se aplica la misma lógica
 * contra las cachés/localStorage. Nunca se expone la existencia esperada de los materiales (el conteo es a ciegas),
 * ni costos ni facturas.
 * @typedef {object} ItemPublico
 * @property {string} id
 * @property {AuditoriaItemTipo} tipo
 * @property {string} [equipoId]
 * @property {string} [materialId]
 * @property {string} nombre
 * @property {string} [marca]
 * @property {string} [familia]
 * @property {string} [numeroSerie]
 * @property {string} [usuario]
 * @property {string} [unidad]
 * @property {boolean} [encontrado]
 * @property {Condicion} [condicion]
 * @property {number} [cantidadContada]
 * @property {string} [notas]
 * @property {boolean} tieneFoto
 * @property {string} [fotoUrl] - Solo modo local: la imagen guardada (con Supabase solo se sabe que existe).
 * @property {boolean} reconteo
 * @property {string} [notaReconteo]
 */

/**
 * @typedef {object} AuditoriaPublica
 * @property {string} id
 * @property {AuditoriaEstado} estado
 * @property {string} sucursal
 * @property {AuditoriaTipo} tipo
 * @property {AuditoriaModalidad} modalidad
 * @property {string} [alcance]
 * @property {string} [auditorNombre]
 * @property {string} [fechaProgramada]
 * @property {ItemPublico[]} items
 */

function estadoNorm(e) {
  return e === 'por_verificar' || e === 'completada' ? e : 'en_conteo'
}

function mensajeError(error) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'No se pudo completar la operación.'
}

export async function fetchAuditoriaPublica(token) {
  if (!token) return null
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('auditoria_publica_obtener', { p_token: token })
    if (error || !data) return null
    const r = data
    const items = Array.isArray(r.items) ? r.items : []
    return {
      id: r.id,
      estado: estadoNorm(r.estado),
      sucursal: r.sucursal ?? '',
      tipo: r.tipo,
      modalidad: r.modalidad ?? 'auditor',
      alcance: r.alcance ?? undefined,
      auditorNombre: r.auditor_nombre ?? undefined,
      fechaProgramada: r.fecha_programada ? String(r.fecha_programada).slice(0, 10) : undefined,
      items: items.map((i) => ({
        id: i.id,
        tipo: i.tipo,
        equipoId: i.equipo_id ?? undefined,
        materialId: i.material_id ?? undefined,
        nombre: i.nombre ?? '—',
        marca: i.marca ?? undefined,
        familia: i.familia ?? undefined,
        numeroSerie: i.numero_serie ?? undefined,
        usuario: i.usuario ?? undefined,
        unidad: i.unidad ?? undefined,
        encontrado: i.encontrado ?? undefined,
        condicion: i.condicion ?? undefined,
        cantidadContada: i.cantidad_contada != null ? Number(i.cantidad_contada) : undefined,
        notas: i.notas ?? undefined,
        tieneFoto: Boolean(i.tiene_foto),
        reconteo: Boolean(i.reconteo),
        notaReconteo: i.nota_reconteo ?? undefined,
      })),
    }
  }

  // Modo local: mismas reglas contra las cachés en memoria / localStorage.
  await loadAllCaches()
  const a = getAuditoriaPorToken(token)
  if (!a) return null
  return {
    id: a.id,
    estado: a.estado,
    sucursal: getUbicacion(a.ubicacionId)?.nombre ?? a.ubicacionId,
    tipo: a.tipo,
    modalidad: a.modalidad,
    alcance: a.alcance,
    auditorNombre: a.auditorNombre,
    fechaProgramada: a.fechaProgramada,
    items: listItems(a.id)
      .map((i) => {
        if (i.tipo === 'equipo') {
          const e = i.equipoId ? getEquipo(i.equipoId) : undefined
          return {
            id: i.id,
            tipo: 'equipo',
            equipoId: i.equipoId,
            nombre: e?.modelo || e?.numeroSerie || 'Equipo',
            marca: e?.marca,
            familia: getFamilia(e?.familiaId)?.nombre,
            numeroSerie: e?.numeroSerie,
            usuario: e?.usuarioAsignado,
            encontrado: i.encontrado,
            condicion: i.condicion,
            notas: i.notas,
            tieneFoto: Boolean(i.fotoUrl),
            fotoUrl: i.fotoUrl,
            reconteo: Boolean(i.reconteo),
            notaReconteo: i.notaReconteo,
          }
        }
        const m = i.materialId ? getMaterial(i.materialId) : undefined
        return {
          id: i.id,
          tipo: 'material',
          materialId: i.materialId,
          nombre: m?.nombre ?? 'Material',
          marca: m?.marca,
          familia: getFamilia(m?.familiaId)?.nombre,
          unidad: m?.unidadMedida,
          cantidadContada: i.cantidadContada,
          notas: i.notas,
          tieneFoto: Boolean(i.fotoUrl),
          fotoUrl: i.fotoUrl,
          reconteo: Boolean(i.reconteo),
          notaReconteo: i.notaReconteo,
        }
      })
      .sort((x, y) => (x.tipo === y.tipo ? x.nombre.localeCompare(y.nombre, 'es') : x.tipo === 'equipo' ? -1 : 1)),
  }
}

/**
 * @typedef {object} MarcaEquipoPublica
 * @property {boolean} encontrado
 * @property {'bien' | 'danado'} [condicion]
 * @property {string} [notas]
 * @property {string} [fotoUrl] - undefined = sin cambio; '' = quitar; data URL = reemplazar.
 * @property {string} [contadoPor]
 */

export async function marcarEquipoPublico(token, itemId, m) {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('auditoria_publica_marcar', {
      p_token: token,
      p_item_id: itemId,
      p_encontrado: m.encontrado,
      p_condicion: m.encontrado ? (m.condicion ?? 'bien') : null,
      p_cantidad_contada: null,
      p_notas: m.notas ?? '',
      p_foto_url: m.fotoUrl ?? null,
      p_contado_por: m.contadoPor ?? null,
    })
    if (error) throw new Error(mensajeError(error))
    return
  }
  const a = getAuditoriaPorToken(token)
  const it = a ? listItems(a.id).find((i) => i.id === itemId) : undefined
  if (!a || !it) throw new Error('El artículo no pertenece a esta auditoría.')
  await marcarEquipoItem(itemId, {
    encontrado: m.encontrado,
    condicion: m.encontrado ? (m.condicion ?? 'bien') : 'perdido',
    notas: m.notas?.trim() || undefined,
    verificadoPor: m.contadoPor?.trim() || a.auditorNombre,
    fotoUrl: m.fotoUrl,
  })
}

/**
 * @typedef {object} MarcaMaterialPublica
 * @property {number} cantidadContada
 * @property {string} [notas]
 * @property {string} [fotoUrl]
 * @property {string} [contadoPor]
 */

export async function marcarMaterialPublico(token, itemId, m) {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('auditoria_publica_marcar', {
      p_token: token,
      p_item_id: itemId,
      p_encontrado: null,
      p_condicion: null,
      p_cantidad_contada: m.cantidadContada,
      p_notas: m.notas ?? '',
      p_foto_url: m.fotoUrl ?? null,
      p_contado_por: m.contadoPor ?? null,
    })
    if (error) throw new Error(mensajeError(error))
    return
  }
  const a = getAuditoriaPorToken(token)
  const it = a ? listItems(a.id).find((i) => i.id === itemId) : undefined
  if (!a || !it) throw new Error('El artículo no pertenece a esta auditoría.')
  await marcarMaterialItem(
    itemId,
    m.cantidadContada,
    m.notas?.trim() || undefined,
    m.contadoPor?.trim() || a.auditorNombre,
    m.fotoUrl,
  )
}

export async function enviarAuditoriaPublica(token) {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('auditoria_publica_enviar', { p_token: token })
    if (error) throw new Error(mensajeError(error))
    return
  }
  const a = getAuditoriaPorToken(token)
  if (!a) throw new Error('Liga de auditoría no válida.')
  await enviarAVerificacion(a.id)
}
