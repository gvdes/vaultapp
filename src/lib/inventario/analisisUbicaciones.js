import { track } from '../reactive'
import { listEquipos } from './sistemas'
import { listMateriales } from './mantenimiento'
import { listUbicaciones, getFamilia } from './comunes'
import { calcularValorDepreciado } from './depreciacion'

/** @typedef {'todo' | 'ti' | 'mantenimiento'} FiltroInventario */

/**
 * @typedef {object} ResumenUbicacion
 * @property {string} ubicacionId
 * @property {string} nombre
 * @property {UbicacionTipo | 'otro'} tipo
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {number} valor - Valor según el filtro (todo = TI + Mantenimiento).
 * @property {number} valorTI - Valor TI (equipos de familias de Sistemas, depreciados). Independiente del filtro.
 * @property {number} valorMtto - Valor Mantenimiento (equipos depreciados + materiales). Independiente del filtro.
 * @property {number} equipos - Conteos según el filtro.
 * @property {number} materiales
 * @property {number} danados
 * @property {number} bajoMinimo
 */

/**
 * @typedef {object} ResumenPunto
 * @property {string} key - Clave estable = coordenadas redondeadas.
 * @property {string} nombre
 * @property {number} lat
 * @property {number} lng
 * @property {number} valor
 * @property {number} valorTI
 * @property {number} valorMtto
 * @property {number} equipos
 * @property {number} materiales
 * @property {number} danados
 * @property {number} bajoMinimo
 * @property {ResumenUbicacion[]} ubicaciones - Ubicaciones (p. ej. pisos de un mismo edificio) que comparten este punto.
 */

/**
 * @typedef {object} Acum
 * @property {number} valorTI
 * @property {number} valorMtto
 * @property {number} equiposTI
 * @property {number} equiposMtto
 * @property {number} materiales
 * @property {number} danadosTI
 * @property {number} danadosMtto
 * @property {number} bajoMinimo
 */

function vacio() {
  return { valorTI: 0, valorMtto: 0, equiposTI: 0, equiposMtto: 0, materiales: 0, danadosTI: 0, danadosMtto: 0, bajoMinimo: 0 }
}

/**
 * Valor de inventario por ubicación. TI = equipos no-baja de familias 'sistemas' (depreciados).
 * Mantenimiento = equipos no-baja de familias 'mantenimiento' (depreciados) + materiales (cantidad × costo).
 * Incluye todas las ubicaciones activas (también oficinas y las de valor 0).
 */
export function resumenPorUbicacion(filtro = 'todo') {
  track()
  const porUbi = new Map()
  const get = (id) => {
    let a = porUbi.get(id)
    if (!a) {
      a = vacio()
      porUbi.set(id, a)
    }
    return a
  }

  for (const e of listEquipos()) {
    if (e.estado === 'baja' || !e.ubicacionId) continue
    const familia = getFamilia(e.familiaId)
    if (!familia) continue
    const valor = calcularValorDepreciado(e, familia)
    const a = get(e.ubicacionId)
    if (familia.tipo === 'sistemas') {
      a.valorTI += valor
      a.equiposTI += 1
      if (e.estado === 'danado') a.danadosTI += 1
    } else {
      a.valorMtto += valor
      a.equiposMtto += 1
      if (e.estado === 'danado') a.danadosMtto += 1
    }
  }

  for (const m of listMateriales()) {
    if (!m.ubicacionId) continue
    const a = get(m.ubicacionId)
    a.valorMtto += m.cantidadActual * (m.costoUnitario || 0)
    a.materiales += 1
    if (m.cantidadActual < m.minimo) a.bajoMinimo += 1
  }

  const ubicaciones = listUbicaciones()
  const conocidas = new Set(ubicaciones.map((u) => u.id))
  const filas = ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre, tipo: u.tipo, lat: u.lat, lng: u.lng })).map(
    (u) => armar(u, porUbi.get(u.id) ?? vacio(), filtro),
  )
  // Ubicaciones referenciadas por datos pero ya inactivas/desconocidas: se suman para no perder valor del total.
  for (const [id, a] of porUbi) {
    if (!conocidas.has(id)) filas.push(armar({ id, nombre: id, tipo: 'otro' }, a, filtro))
  }
  return filas
}

function armar(u, a, filtro) {
  const ti = filtro !== 'mantenimiento'
  const mt = filtro !== 'ti'
  return {
    ubicacionId: u.id,
    nombre: u.nombre,
    tipo: u.tipo,
    lat: u.lat,
    lng: u.lng,
    valor: (ti ? a.valorTI : 0) + (mt ? a.valorMtto : 0),
    valorTI: a.valorTI,
    valorMtto: a.valorMtto,
    equipos: (ti ? a.equiposTI : 0) + (mt ? a.equiposMtto : 0),
    materiales: mt ? a.materiales : 0,
    danados: (ti ? a.danadosTI : 0) + (mt ? a.danadosMtto : 0),
    bajoMinimo: mt ? a.bajoMinimo : 0,
  }
}

function nombreDePunto(nombres) {
  if (nombres.length === 1) return nombres[0]
  const bases = nombres.map((n) => n.replace(/\s+piso\s+\d+\s*$/i, '').trim())
  if (bases.every((b) => b === bases[0])) return `${bases[0]} (${nombres.length} pisos)`
  return nombres.join(' / ')
}

/**
 * Agrupa las ubicaciones con coordenadas idénticas en un solo punto del mapa
 * (p. ej. los 4 pisos de Cedis San Pablo → un pin). Las ubicaciones sin coordenadas no aparecen.
 * Incluye puntos con valor 0.
 */
export function resumenPorPunto(filtro = 'todo') {
  track()
  const grupos = new Map()
  for (const r of resumenPorUbicacion(filtro)) {
    if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue
    const key = `${r.lat.toFixed(5)},${r.lng.toFixed(5)}`
    const g = grupos.get(key)
    if (g) g.push(r)
    else grupos.set(key, [r])
  }
  const puntos = []
  for (const [key, ubis] of grupos) {
    const sum = (f) => ubis.reduce((s, r) => s + f(r), 0)
    puntos.push({
      key,
      nombre: nombreDePunto(ubis.map((u) => u.nombre)),
      lat: ubis[0].lat,
      lng: ubis[0].lng,
      valor: sum((r) => r.valor),
      valorTI: sum((r) => r.valorTI),
      valorMtto: sum((r) => r.valorMtto),
      equipos: sum((r) => r.equipos),
      materiales: sum((r) => r.materiales),
      danados: sum((r) => r.danados),
      bajoMinimo: sum((r) => r.bajoMinimo),
      ubicaciones: ubis,
    })
  }
  return puntos.sort((a, b) => b.valor - a.valor)
}
