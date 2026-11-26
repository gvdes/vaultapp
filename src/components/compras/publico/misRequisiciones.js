/**
 * Requisiciones que este dispositivo levantó (para volver a abrir su seguimiento sin teclear folio ni clave).
 * Solo vive en localStorage del navegador; si no hay almacenamiento, simplemente no se recuerda nada.
 */
const CLAVE = 'dga_cmp_mis_requisiciones'

/**
 * @typedef {object} MiRequisicion
 * @property {string} folio
 * @property {string} token
 * @property {number} fecha
 * @property {string} [solicitante]
 */

export function listarMisRequisiciones() {
  try {
    const raw = localStorage.getItem(CLAVE)
    const lista = raw ? JSON.parse(raw) : []
    return Array.isArray(lista) ? lista.filter((x) => x && typeof x.folio === 'string' && typeof x.token === 'string') : []
  } catch {
    return []
  }
}

export function recordarRequisicion(r) {
  try {
    const lista = listarMisRequisiciones().filter((x) => x.folio !== r.folio)
    lista.unshift(r)
    localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, 12)))
  } catch {
    /* sin almacenamiento */
  }
}

export function olvidarRequisicion(folio) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(listarMisRequisiciones().filter((x) => x.folio !== folio)))
  } catch {
    /* sin almacenamiento */
  }
}
