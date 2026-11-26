import { ROLES_PARTICIPANTE, comprasModoLocal, getParticipante, listParticipantes, loadParticipantesCache } from 'src/lib/compras'
import { listUbicaciones } from 'src/lib/inventario/comunes'

/** Minúsculas, sin acentos ni espacios repetidos (para comparar y buscar). */
export function normalizar(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Misma regla que valida `addParticipante` (lib/compras/participantes.js). */
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function correoValido(c) {
  return CORREO_RE.test((c ?? '').trim())
}

/** Proveedores de correo personal: se avisa con suavidad ("conviene el corporativo"), nunca se bloquea. */
const DOMINIOS_PERSONALES = [
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'hotmail.com.mx', 'outlook.com', 'outlook.es', 'live.com', 'live.com.mx', 'msn.com',
  'yahoo.com', 'yahoo.com.mx', 'yahoo.es', 'icloud.com', 'me.com', 'prodigy.net.mx', 'aol.com', 'proton.me', 'protonmail.com',
]

export function esCorreoPersonal(c) {
  const dom = (c ?? '').trim().toLowerCase().split('@')[1]
  return Boolean(dom) && DOMINIOS_PERSONALES.includes(dom)
}

export function esCorreoEjemplo(c) {
  return (c ?? '').trim().toLowerCase().endsWith('@ejemplo.mx')
}

/**
 * @typedef {object} Pista
 * @property {'danger' | 'warning' | 'neutral'} tono
 * @property {string} texto
 */

/** Pistas de calidad de datos de una persona (sin correo, correo inválido, personal, de ejemplo). */
export function pistasCorreo(correo) {
  const c = (correo ?? '').trim()
  if (!c) return [{ tono: 'danger', texto: 'Sin correo: no recibirá avisos' }]
  if (!correoValido(c)) return [{ tono: 'danger', texto: 'Correo no válido' }]
  const out = []
  if (esCorreoPersonal(c)) out.push({ tono: 'warning', texto: 'Correo personal: conviene el corporativo' })
  if (esCorreoEjemplo(c)) out.push({ tono: 'neutral', texto: 'Correo de ejemplo (demo): reemplazar por el real' })
  return out
}

/** Etiquetas cortas de los roles de proceso (chips). */
export const ROL_CORTO = {
  solicitante: 'Solicitante',
  comprador: 'Comprador',
  finanzas: 'Finanzas',
  tesoreria: 'Tesorería',
  cuentas_por_pagar: 'Cuentas por pagar',
  direccion: 'Dirección',
  ceo: 'CEOs (en desuso)',
  talento: 'Talento',
  auditor: 'Auditor',
  infraestructura: 'Infraestructura',
  mantenimiento: 'Mantenimiento',
}

export const ROLES_IDS = ROLES_PARTICIPANTE.map((r) => r.id)

/** Roles que se muestran como chips: el rol 'ceo' quedó EN DESUSO (migración 022) y ya no aparece en la interfaz. */
export function rolesVisibles(roles) {
  return roles.filter((r) => r !== 'ceo')
}

/** Texto del tope de aprobación de un aprobador de Finanzas ('' si la persona no tiene el rol finanzas). */
export function textoTope(p) {
  if (!p.roles.includes('finanzas')) return ''
  return p.topeAprobacion === undefined || p.topeAprobacion === null ? 'sin tope' : `tope ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(p.topeAprobacion)}`
}

/**
 * Roles críticos del proceso: si se desactiva (o se le quita el rol) a la ÚLTIMA persona activa que lo tiene, parte del
 * flujo se queda sin responsable (nadie recibe la solicitud de autorización, de fondos, etc.).
 */
export const ROLES_CRITICOS = [
  { id: 'finanzas', consecuencia: 'nadie recibiría las solicitudes de autorización de compras' },
  { id: 'comprador', consecuencia: 'nadie recibiría los avisos de nuevas requisiciones ni cotizaría' },
  { id: 'tesoreria', consecuencia: 'nadie recibiría la solicitud de fondos de caja chica (compras en efectivo)' },
  { id: 'cuentas_por_pagar', consecuencia: 'nadie recibiría el aviso de pago de las compras por transferencia o tarjeta' },
  { id: 'direccion', consecuencia: 'nadie recibiría el aviso informativo de las compras de más de $50,000 (Dirección no aprueba, solo se entera)' },
  { id: 'infraestructura', consecuencia: 'nadie confirmaría las recepciones de equipos de TI' },
  { id: 'mantenimiento', consecuencia: 'nadie confirmaría las recepciones de Mantenimiento' },
]

export function esRolCritico(r) {
  return ROLES_CRITICOS.some((c) => c.id === r)
}

/** Cuántas personas ACTIVAS tienen cada rol (excluyendo opcionalmente a una). */
export function titularesActivos(rol, excluirId) {
  return listParticipantes({ rol }).filter((p) => p.id !== excluirId)
}

/**
 * Roles críticos de los que `p` es el único titular activo. Si `rolesQueQuedan` se pasa, solo cuenta los roles críticos que
 * `p` dejaría de tener (p. ej. al quitar un chip en edición); si no, todos los que tiene (al desactivarlo).
 */
export function criticosUnicos(p, rolesQueQuedan) {
  if (!p.activo) return []
  const out = []
  for (const c of ROLES_CRITICOS) {
    if (!p.roles.includes(c.id)) continue
    if (rolesQueQuedan && rolesQueQuedan.includes(c.id)) continue
    if (titularesActivos(c.id, p.id).length === 0) out.push({ id: c.id, label: ROL_CORTO[c.id], consecuencia: c.consecuencia })
  }
  return out
}

/** Cobertura de cada rol crítico (cuántas personas activas lo tienen). */
export function coberturaCritica() {
  return ROLES_CRITICOS.map((c) => ({ id: c.id, label: ROL_CORTO[c.id], n: titularesActivos(c.id).length }))
}

/** Busca una ubicación del catálogo por nombre (sin acentos ni mayúsculas); acepta coincidencia exacta o contenida única. */
export function ubicacionPorNombre(texto) {
  const q = normalizar(texto)
  if (!q) return undefined
  const todas = listUbicaciones()
  const exacta = todas.find((u) => normalizar(u.nombre) === q || normalizar(u.id) === q)
  if (exacta) return exacta
  const parecidas = todas.filter((u) => normalizar(u.nombre).includes(q) || q.includes(normalizar(u.nombre)))
  return parecidas.length === 1 ? parecidas[0] : undefined
}

/** Rol de proceso a partir de un texto libre del CSV ("Finanzas", "tesorería", "comprador (adquisiciones)"…). */
export function rolDesdeTexto(texto) {
  const q = normalizar(texto)
  if (!q) return undefined
  const directo = ROLES_PARTICIPANTE.find((r) => r.id === q || normalizar(r.label) === q || normalizar(ROL_CORTO[r.id]) === q)
  if (directo) return directo.id
  return ROLES_PARTICIPANTE.find((r) => q.startsWith(r.id) || normalizar(r.label).startsWith(q))?.id
}

// ---------------------------------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------------------------------

/** Lee un CSV (comas, punto y coma o tabulador; comillas dobles; saltos dentro de comillas). */
export function parseCsv(texto) {
  const limpio = texto.replace(/^﻿/, '')
  const primera = limpio.split(/\r?\n/, 1)[0] ?? ''
  const cuenta = (ch) => primera.split(ch).length - 1
  const delim = [',', ';', '\t'].reduce((mejor, ch) => (cuenta(ch) > cuenta(mejor) ? ch : mejor), ',')
  const filas = []
  let fila = []
  let celda = ''
  let comillas = false
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]
    if (comillas) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') {
          celda += '"'
          i++
        } else comillas = false
      } else celda += ch
    } else if (ch === '"') comillas = true
    else if (ch === delim) {
      fila.push(celda)
      celda = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++
      fila.push(celda)
      celda = ''
      if (fila.some((c) => c.trim() !== '')) filas.push(fila)
      fila = []
    } else celda += ch
  }
  fila.push(celda)
  if (fila.some((c) => c.trim() !== '')) filas.push(fila)
  return filas
}

/** Decodifica el archivo: UTF-8 y, si no es válido (típico de "CSV" de Excel en Windows), Windows-1252. */
export async function leerArchivoTexto(file) {
  const buf = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

/** Evita que Excel interprete un texto como fórmula al abrir un archivo exportado. */
export function seguroExcel(v) {
  const s = v ?? ''
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

export function fechaCorta(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Texto de la plantilla CSV descargable. */
export const PLANTILLA_CSV =
  'nombre,correo,area,sucursal,puesto,roles\n' +
  '"Nombre Apellido","nombre.apellido@empresa.mx","Ventas","","Líder de Sucursal","solicitante"\n' +
  '"Otra Persona","otra.persona@empresa.mx","Finanzas","","Analista","finanzas; solicitante"\n'

/**
 * Con Supabase, un UPDATE que la política RLS no permite NO da error (afecta 0 filas) y la caché local quedaría mal.
 * Tras guardar, se vuelve a leer la tabla y se comprueba que el cambio realmente quedó; si no, se avisa con claridad.
 */
export async function asegurarPersistido(id, esperado) {
  if (comprasModoLocal()) return
  try {
    await loadParticipantesCache()
  } catch {
    return
  }
  const real = getParticipante(id)
  const igual = (k, a, b) =>
    k === 'roles' ? JSON.stringify([...a].sort()) === JSON.stringify([...(b ?? [])].sort()) : (a ?? '') === (b ?? '')
  const falla = !real || Object.entries(esperado).some(([k, v]) => !igual(k, v, (real)[k]))
  if (falla) {
    throw new Error('El cambio no quedó guardado en la base de datos: tu rol no tiene permiso para editar el directorio en Supabase. Avisa a Desarrollo (falta ajustar la política de cmp_participantes).')
  }
}

/** Roles que mueven dinero o autorizan: solo Dirección los asigna o quita (trigger en la base, migraciones 018, 019 y 022; 'ceo' queda por compatibilidad). El tope de aprobación también es solo de Dirección. */
export const ROLES_SOLO_DIRECCION = ['finanzas', 'tesoreria', 'cuentas_por_pagar', 'direccion', 'ceo', 'comprador']
export const AVISO_SOLO_DIRECCION = 'Solo Dirección asigna roles de aprobación, tesorería y compras.'

export function tieneRolSoloDireccion(roles) {
  return roles.some((r) => ROLES_SOLO_DIRECCION.includes(r))
}
