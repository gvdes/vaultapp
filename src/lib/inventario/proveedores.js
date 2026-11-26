import { track } from '../reactive'
import { supabase, isSupabaseConfigured } from '../supabase'
import { leerTodo } from '../supabaseTodo'
import { registrarBitacora, cambios } from '../bitacora'

/**
 * @typedef {object} Proveedor
 * @property {string} id
 * @property {string} nombre
 * @property {string} [contacto]
 * @property {string} [telefono]
 * @property {string} [notas]
 * @property {boolean} activo - Nunca se borra un proveedor: se desactiva (conserva su historial de compras) y se puede reactivar.
 * @property {number} createdAt
 */

const KEY = 'dga_inv_proveedores'

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    // Registros de antes de existir la bandera `activo` se consideran activos.
    return raw ? JSON.parse(raw).map((p) => ({ ...p, activo: p.activo !== false })) : []
  } catch {
    return []
  }
}
function writeLocal(items) {
  localStorage.setItem(KEY, JSON.stringify(items))
}

let cache = []
let ready = false

export async function loadProveedoresCache() {
  if (!isSupabaseConfigured || !supabase) {
    cache = readLocal()
    ready = true
    return
  }
  const { data } = await leerTodo('inv_proveedores', { orden: 'nombre' })
  cache = (data ?? []).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    contacto: r.contacto ?? undefined,
    telefono: r.telefono ?? undefined,
    notas: r.notas ?? undefined,
    activo: r.activo !== false,
    createdAt: new Date(r.created_at).getTime(),
  }))
  ready = true
}

export function isProveedoresCacheReady() {
  return ready
}

/** Proveedores activos (o todos, con `incluirInactivos`), por nombre. */
export function listProveedores(incluirInactivos = false) {
  track()
  const list = incluirInactivos ? cache : cache.filter((p) => p.activo)
  return [...list].sort((a, b) => a.nombre.localeCompare(b.nombre))
}

/** Proveedores desactivados (se muestran aparte, con opción de reactivar). */
export function listProveedoresInactivos() {
  track()
  return cache.filter((p) => !p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export function getProveedor(id) {
  track()
  return cache.find((p) => p.id === id)
}

export async function addProveedor(input) {
  const now = Date.now()
  const proveedor = { id: `${now}-${Math.round(Math.random() * 1e6)}`, createdAt: now, ...input, activo: input.activo ?? true }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_proveedores').insert({
      id: proveedor.id,
      nombre: proveedor.nombre,
      contacto: proveedor.contacto ?? null,
      telefono: proveedor.telefono ?? null,
      notas: proveedor.notas ?? null,
      activo: proveedor.activo,
    })
    if (error) throw error
  } else {
    writeLocal([...readLocal(), proveedor])
  }
  cache = [...cache, proveedor]
  registrarBitacora({ tabla: 'inv_proveedores', registroId: proveedor.id, accion: 'alta', despues: proveedor, detalle: `Proveedor "${proveedor.nombre}"` })
  return proveedor
}

export async function updateProveedor(id, patch) {
  const prev = cache.find((p) => p.id === id)
  cache = cache.map((p) => (p.id === id ? { ...p, ...patch } : p))
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_proveedores').update(patch).eq('id', id)
    if (error) throw error
  } else {
    writeLocal(cache)
  }
  const { antes, despues } = cambios(prev, patch)
  registrarBitacora({ tabla: 'inv_proveedores', registroId: id, accion: 'cambio', antes, despues, detalle: prev ? `Proveedor "${prev.nombre}"` : undefined })
}

/** Desactiva un proveedor (nunca se borra): deja de ofrecerse al registrar compras, pero conserva todo su historial. */
export async function desactivarProveedor(id) {
  const prev = cache.find((p) => p.id === id)
  await setActivo(id, false)
  registrarBitacora({
    tabla: 'inv_proveedores',
    registroId: id,
    accion: 'desactivación',
    antes: { activo: true },
    despues: { activo: false },
    detalle: prev ? `Proveedor "${prev.nombre}"` : undefined,
  })
}

export async function reactivarProveedor(id) {
  const prev = cache.find((p) => p.id === id)
  await setActivo(id, true)
  registrarBitacora({
    tabla: 'inv_proveedores',
    registroId: id,
    accion: 'reactivación',
    antes: { activo: false },
    despues: { activo: true },
    detalle: prev ? `Proveedor "${prev.nombre}"` : undefined,
  })
}

async function setActivo(id, activo) {
  cache = cache.map((p) => (p.id === id ? { ...p, activo } : p))
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_proveedores').update({ activo }).eq('id', id)
    if (error) throw error
  } else {
    writeLocal(cache)
  }
}
