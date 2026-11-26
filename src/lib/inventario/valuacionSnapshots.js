import { track } from '../reactive'
import { supabase, isSupabaseConfigured } from '../supabase'
import { leerTodo } from '../supabaseTodo'

/** @typedef {'sistemas' | 'mantenimiento' | 'total'} ValuacionTipo */

/**
 * @typedef {object} ValuacionSnapshot
 * @property {string} id
 * @property {string} label
 * @property {number} createdAt
 * @property {ValuacionTipo} tipo
 * @property {number} valorTotal
 */

const KEY = 'dga_inv_valuacion_snapshots'

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

export async function loadValuacionSnapshotsCache() {
  if (!isSupabaseConfigured || !supabase) {
    cache = readLocal()
    ready = true
    return
  }
  const { data } = await leerTodo('inv_valuacion_snapshots', { orden: 'created_at' })
  cache = (data ?? []).map((r) => ({ id: r.id, label: r.label, createdAt: new Date(r.created_at).getTime(), tipo: r.tipo, valorTotal: Number(r.valor_total) }))
  ready = true
}

export function isValuacionSnapshotsCacheReady() {
  return ready
}

export function listValuacionSnapshots(tipo = 'total') {
  track()
  return cache.filter((s) => s.tipo === tipo).sort((a, b) => a.createdAt - b.createdAt)
}

export async function guardarValuacionSnapshot(label, tipo, valorTotal) {
  const now = Date.now()
  const snapshot = { id: `${now}-${Math.round(Math.random() * 1e6)}`, label, createdAt: now, tipo, valorTotal }
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inv_valuacion_snapshots').insert({
      id: snapshot.id,
      label: snapshot.label,
      tipo: snapshot.tipo,
      valor_total: snapshot.valorTotal,
    })
    if (error) throw error
  } else {
    writeLocal([...readLocal(), snapshot])
  }
  cache = [...cache, snapshot]
  return snapshot
}
