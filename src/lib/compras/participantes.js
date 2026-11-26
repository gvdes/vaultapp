import { supabase } from '../supabase'
import { registrarBitacora, cambios } from '../bitacora'
import { loadComunesCache, isComunesCacheReady, getUbicacion } from '../inventario/comunes'
import { crearTabla, modoLocal, nuevoId, ahora, errorDe, normalizar, usuarioActual } from './store'

/**
 * Directorio de participantes de Compras Indirectas (solicitantes, comprador, aprobadores, tesorería, custodios…).
 * Nunca se borra: se desactiva. Los nombres/correos viven aquí (jamás fijos en código): cuando cambie el Gerente de
 * Mantenimiento, basta actualizar el directorio.
 */
const tabla = crearTabla({
  key: 'dga_cmp_participantes',
  tabla: 'cmp_participantes',
  pk: 'id',
  ts: ['createdAt', 'bajaAt'],
  num: ['topeAprobacion'],
  orderBy: 'nombre',
})

export const loadParticipantesCache = () => tabla.load()
export const isParticipantesCacheReady = () => tabla.isReady()

export function listParticipantes(opts) {
  let list = tabla.list()
  if (!opts?.incluirInactivos) list = list.filter((p) => p.activo)
  if (opts?.rol) list = list.filter((p) => p.roles.includes(opts.rol))
  return [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function getParticipante(id) {
  return id ? tabla.get(id) : undefined
}

/** Participantes activos con un rol (p. ej. todos los de 'finanzas' para la solicitud de autorización). */
export function participantesPorRol(rol) {
  return listParticipantes({ rol })
}

export function getParticipantePorCorreo(correo) {
  if (!correo) return undefined
  const c = correo.trim().toLowerCase()
  tabla.list()
  return tabla.raw().find((p) => p.correo.toLowerCase() === c)
}

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validar(input, idActual) {
  if (!input.nombre.trim()) throw new Error('El nombre es obligatorio.')
  if (!CORREO_RE.test(input.correo.trim())) throw new Error('El correo no es válido.')
  if (input.roles.length === 0) throw new Error('Asigna al menos un rol.')
  const dup = tabla.raw().find((p) => p.id !== idActual && p.correo.toLowerCase() === input.correo.trim().toLowerCase())
  if (dup) throw new Error(`Ya existe un participante con ese correo (${dup.nombre}).`)
}

/** El tope de aprobación (solo aprobadores de Finanzas): vacío = sin tope; si se captura debe ser un monto de 0 o más. */
function validarTope(input) {
  const t = input.topeAprobacion
  if (t === undefined || t === null) return
  if (!Number.isFinite(t) || t < 0) throw new Error('El tope de aprobación debe ser un monto de 0 o más (o vacío para «sin tope»).')
  if (!input.roles.includes('finanzas')) throw new Error('El tope de aprobación solo aplica a quien tiene el rol Finanzas.')
}

export async function addParticipante(input) {
  validar(input)
  validarTope(input)
  const p = {
    id: input.id ?? `part-${nuevoId()}`,
    nombre: input.nombre.trim(),
    correo: input.correo.trim().toLowerCase(),
    area: input.area?.trim() || undefined,
    ubicacionId: input.ubicacionId || undefined,
    puesto: input.puesto?.trim() || undefined,
    roles: [...new Set(input.roles)],
    ...(input.topeAprobacion !== undefined && input.topeAprobacion !== null ? { topeAprobacion: input.topeAprobacion } : {}),
    activo: input.activo ?? true,
    createdAt: ahora(),
  }
  await tabla.insert(p)
  registrarBitacora({ tabla: 'cmp_participantes', registroId: p.id, accion: 'alta', despues: p, detalle: `${usuarioActual()} agregó a ${p.nombre}` })
  return p
}

export async function updateParticipante(id, patch) {
  const prev = tabla.raw().find((p) => p.id === id)
  if (!prev) throw new Error('Participante no encontrado.')
  const merged = { ...prev, ...patch }
  validar(merged, id)
  validarTope(merged)
  const limpio = { ...patch }
  if (patch.correo) limpio.correo = patch.correo.trim().toLowerCase()
  if (patch.nombre) limpio.nombre = patch.nombre.trim()
  if (patch.roles) limpio.roles = [...new Set(patch.roles)]
  await tabla.update(id, limpio)
  const { antes, despues } = cambios(prev, limpio)
  registrarBitacora({ tabla: 'cmp_participantes', registroId: id, accion: 'cambio', antes, despues })
}

/** Desactiva (no borra) a un participante: deja de aparecer en el directorio público y de recibir correos. */
export async function setParticipanteActivo(id, activo, motivo) {
  const prev = tabla.raw().find((p) => p.id === id)
  if (!prev) throw new Error('Participante no encontrado.')
  if (!activo && !motivo?.trim()) throw new Error('Indica el motivo de la desactivación.')
  const patch = activo
    ? { activo: true, motivoBaja: '', bajaPor: '' }
    : { activo: false, motivoBaja: motivo.trim(), bajaPor: usuarioActual(), bajaAt: ahora() }
  await tabla.update(id, patch)
  registrarBitacora({
    tabla: 'cmp_participantes',
    registroId: id,
    accion: activo ? 'reactivación' : 'desactivación',
    antes: { activo: prev.activo, motivoBaja: prev.motivoBaja },
    despues: { activo, motivoBaja: patch.motivoBaja },
    detalle: activo ? `${usuarioActual()} reactivó a ${prev.nombre}` : `${usuarioActual()} desactivó a ${prev.nombre}: ${motivo.trim()}`,
  })
}

// ---- Directorio PÚBLICO (sin correos) -----------------------------------------------------------------------------------
/**
 * @typedef {object} SolicitantePublico
 * @property {string} id
 * @property {string} nombre
 * @property {string} [area]
 * @property {string} [ubicacionId]
 */

/**
 * Solicitantes activos para la liga pública (sin login). Con Supabase usa la RPC `cmp_directorio_publico()` (NO trae
 * correos); en modo local lee la caché.
 */
export async function directorioPublico() {
  if (!modoLocal()) {
    const { data, error } = await supabase.rpc('cmp_directorio_publico')
    if (error) throw errorDe(error)
    return (data ?? []).map((r) => ({
      id: r.id,
      nombre: r.nombre,
      area: r.area ?? undefined,
      ubicacionId: r.ubicacion_id ?? undefined,
    }))
  }
  if (!tabla.isReady()) await tabla.load()
  if (!isComunesCacheReady()) await loadComunesCache()
  return tabla
    .raw()
    .filter((p) => p.activo && p.roles.includes('solicitante'))
    .map((p) => ({ id: p.id, nombre: p.nombre, area: p.area, ubicacionId: p.ubicacionId }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Búsqueda simple por nombre/área/correo (sin acentos). */
export function buscarParticipantes(texto, opts) {
  const q = normalizar(texto)
  return listParticipantes({ rol: opts?.rol }).filter((p) => !q || normalizar(`${p.nombre} ${p.area ?? ''} ${p.correo} ${p.puesto ?? ''}`).includes(q))
}

export function nombreUbicacionParticipante(p) {
  return p.ubicacionId ? getUbicacion(p.ubicacionId)?.nombre : undefined
}

export function reiniciarParticipantesLocal() {
  tabla.reiniciarLocal()
}
