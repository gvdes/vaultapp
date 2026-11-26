import { supabase, isSupabaseConfigured } from './supabase'
import { DEMO_USERS_PUBLIC, ROLE_LABELS } from './auth'

/**
 * Perfiles de la plataforma (tabla `profiles`: usuario, nombre, rol). Solo lo usa la pestaña "Accesos" del Directorio.
 *
 * - Con Supabase lee `profiles` (cualquier autenticado puede leer) y actualiza rol/nombre (la política
 *   `profiles_update_admin` de la migración 011 solo deja a Dirección).
 * - Sin Supabase (modo demo) muestra los usuarios de demostración en solo lectura.
 *
 * Aquí NO se crean usuarios ni se manejan contraseñas: eso se hace en Supabase Auth.
 */

/**
 * @typedef {object} Perfil
 * @property {string} id
 * @property {string} username - Usuario con el que inicia sesión (el correo interno se arma con él).
 * @property {string} displayName
 * @property {Role} role
 * @property {string} [participanteId] - Participante del directorio al que está ligado el usuario (aprobadores de Finanzas; migración 022). Sin liga no puede aprobar.
 * @property {number} [createdAt]
 */

export const ROLES_ORDEN = ['admin', 'capturista', 'mantenimiento', 'adquisiciones', 'finanzas', 'tesoreria', 'cuentas_por_pagar', 'talento', 'solicitante']

/**
 * @typedef {object} RolInfo
 * @property {Role} role
 * @property {string} label
 * @property {string} puede - Qué puede hacer (resumen del modelo de permisos de lib/access.js).
 * @property {string} noPuede - Qué NO puede hacer (límites de control).
 */

/** Leyenda de roles: resume los comentarios de lib/access.js (si cambia el modelo de permisos, actualizar aquí). */
export const ROLES_INFO = [
  {
    role: 'admin',
    label: ROLE_LABELS.admin,
    puede: 'Todo, en Sistemas y Mantenimiento; ve la bitácora, administra accesos, directorio, topes de aprobación y reglas de compras, y ve todo el módulo de Compras. Recibe un aviso por correo de las compras de más de $50,000.',
    noPuede: 'No aprueba compras: la autorización la resuelve Finanzas (Dirección solo consulta y recibe avisos). Toda acción queda en la bitácora inmutable.',
  },
  {
    role: 'capturista',
    label: ROLE_LABELS.capturista,
    puede: 'Opera SOLO Sistemas: da de alta su stock, asigna, da de baja, audita, resuelve solicitudes y confirma recepciones de TI. Administra el directorio.',
    noPuede: 'No opera el inventario de Mantenimiento ni administra accesos o reglas de compras.',
  },
  {
    role: 'mantenimiento',
    label: ROLE_LABELS.mantenimiento,
    puede: 'Opera SOLO Mantenimiento: material, herramienta, equipo, proveedores, calendario preventivo, salidas, auditorías, solicitudes y recepciones. Consulta el directorio.',
    noPuede: 'No opera Sistemas ni administra el directorio, accesos o reglas.',
  },
  {
    role: 'adquisiciones',
    label: ROLE_LABELS.adquisiciones,
    puede: 'Cotiza, elige proveedor y realiza las compras indirectas; carga stock en ambos dominios. Consulta el directorio y las reglas de compras.',
    noPuede: 'No asigna, no da de baja ni audita (el comprador no es el custodio del inventario).',
  },
  {
    role: 'finanzas',
    label: ROLE_LABELS.finanzas,
    puede: 'Aprueba o rechaza compras dentro de su tope de aprobación (basta uno de los aprobadores elegibles; sin tope = cualquier monto), ve la bitácora y consulta las reglas de compras. En inventario es solo lectura.',
    noPuede: 'No aprueba si su usuario no está ligado a un aprobador del directorio, ni por encima de su tope. No opera inventario, no cotiza ni compra, y no cambia las reglas.',
  },
  {
    role: 'tesoreria',
    label: ROLE_LABELS.tesoreria,
    puede: 'Entrega el efectivo de las compras aprobadas con forma de pago efectivo (caja chica) y registra folio y tipo de gasto. Consulta el catálogo de proveedores. En inventario es solo lectura.',
    noPuede: 'No paga transferencias ni tarjeta (eso es de Cuentas por pagar), no aprueba ni cotiza; no entra al directorio ni a las reglas.',
  },
  {
    role: 'cuentas_por_pagar',
    label: ROLE_LABELS.cuentas_por_pagar,
    puede: 'Paga las compras aprobadas por transferencia o tarjeta (referencia, fecha y comprobante); da de alta y corrige proveedores del catálogo (razón social, RFC, CLABE). Ve la CLABE completa.',
    noPuede: 'No entrega efectivo, no aprueba ni cotiza, no ve inventario ni cotizaciones.',
  },
  {
    role: 'talento',
    label: ROLE_LABELS.talento,
    puede: 'Solo lectura de responsivas, equipos por responsable y cargos por pérdida; administra el directorio de colaboradores junto con Soporte.',
    noPuede: 'No modifica inventario ni compras.',
  },
  {
    role: 'solicitante',
    label: ROLE_LABELS.solicitante,
    puede: 'Consulta ambos dominios (solo lectura) y levanta/cancela sus solicitudes de inventario.',
    noPuede: 'Sin herramientas de gestión. Es el rol por defecto de una cuenta nueva.',
  },
]

export function rolLabel(r) {
  return ROLE_LABELS[r] ?? r
}

/** true cuando no hay Supabase: los perfiles son los usuarios de demostración y no se editan. */
export function perfilesSoloLectura() {
  return !(isSupabaseConfigured && supabase)
}

export async function listPerfiles() {
  if (!supabase || !isSupabaseConfigured) {
    return DEMO_USERS_PUBLIC.map((u) => ({
      id: `demo-${u.username}`,
      username: u.username,
      // El roster demo no expone nombres: se usa la etiqueta del rol.
      displayName: ROLE_LABELS[u.role],
      role: u.role,
    }))
  }
  // select('*'): sigue funcionando aunque la base todavía no tenga la columna participante_id (migración 022).
  const { data, error } = await supabase.from('profiles').select('*').order('display_name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    participanteId: r.participante_id ?? undefined,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : undefined,
  }))
}

/** Cambia rol y/o nombre. Solo Dirección (lo impone la base). El usuario afectado debe volver a iniciar sesión. */
export async function updatePerfil(id, patch) {
  if (!supabase || !isSupabaseConfigured) throw new Error('En modo demostración los accesos son de solo lectura.')
  const fila = {}
  if (patch.role) fila.role = patch.role
  if (patch.displayName !== undefined) {
    const nombre = patch.displayName.trim()
    if (!nombre) throw new Error('El nombre no puede quedar vacío.')
    fila.display_name = nombre
  }
  if (patch.participanteId !== undefined) fila.participante_id = patch.participanteId || null
  if (Object.keys(fila).length === 0) return
  // `select()` devuelve las filas afectadas: si la política RLS no deja actualizar, llega vacío (sin error).
  const { data, error } = await supabase.from('profiles').update(fila).eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('No se pudo actualizar: solo Dirección General puede cambiar accesos.')
}
