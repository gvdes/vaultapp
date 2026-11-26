import { track } from '../reactive'
import { supabase, isSupabaseConfigured } from '../supabase'
import { leerTodo } from '../supabaseTodo'
import { registrarBitacora } from '../bitacora'

/**
 * @typedef {object} CargoPerdida
 * @property {string} id
 * @property {string} equipoId
 * @property {string} [usuarioAfectado]
 * @property {number} valorCalculado
 * @property {number} valorCobrado
 * @property {string} [motivo]
 * @property {string} [autorizadoPor]
 * @property {number} fecha
 * @property {string} [notas]
 */

const KEY = 'dga_inv_cargos_perdida'

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function writeLocal(items) {
  localStorage.setItem(KEY, JSON.stringify(items))
}

let cache = []
let ready = false

export async function loadCargosPerdidaCache() {
  if (!isSupabaseConfigured || !supabase) {
    cache = readLocal()
    ready = true
    return
  }
  const { data } = await leerTodo('inv_cargos_perdida', { orden: 'fecha', ascendente: false })
  cache = (data ?? []).map((r) => ({
    id: r.id,
    equipoId: r.equipo_id,
    usuarioAfectado: r.usuario_afectado ?? undefined,
    valorCalculado: Number(r.valor_calculado),
    valorCobrado: Number(r.valor_cobrado),
    motivo: r.motivo ?? undefined,
    autorizadoPor: r.autorizado_por ?? undefined,
    fecha: new Date(r.fecha).getTime(),
    notas: r.notas ?? undefined,
  }))
  ready = true
}

export function isCargosPerdidaCacheReady() {
  return ready
}

export function listCargosPerdida() {
  track()
  return [...cache].sort((a, b) => b.fecha - a.fecha)
}

export async function registrarCargoPerdida(input) {
  const now = Date.now()
  const cargo = { id: `${now}-${Math.round(Math.random() * 1e6)}`, fecha: now, ...input }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_cargos_perdida').insert({
      id: cargo.id,
      equipo_id: cargo.equipoId,
      usuario_afectado: cargo.usuarioAfectado ?? null,
      valor_calculado: cargo.valorCalculado,
      valor_cobrado: cargo.valorCobrado,
      motivo: cargo.motivo ?? null,
      autorizado_por: cargo.autorizadoPor ?? null,
      notas: cargo.notas ?? null,
    })
    if (error) throw error
  } else {
    writeLocal([...readLocal(), cargo])
  }
  cache = [cargo, ...cache]
  registrarBitacora({
    tabla: 'inv_cargos_perdida',
    registroId: cargo.id,
    accion: 'pérdida',
    despues: cargo,
    detalle: `Cargo por pérdida/daño: cobrado ${cargo.valorCobrado} de ${cargo.valorCalculado}${cargo.usuarioAfectado ? ` a ${cargo.usuarioAfectado}` : ''}`,
  })
  return cargo
}
