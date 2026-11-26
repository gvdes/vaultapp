import { norm } from './estilos'

export const MAX_PARTIDAS = 30
export const MAX_UBICACIONES = 12
export const MIN_DESCRIPCION = 10
export const CLAVE_BORRADOR = 'dga_cmp_borrador_v1'

/** @typedef {'lista' | 'general'} ModoSucursal */

/**
 * @typedef {object} PartidaForm
 * @property {string} uid
 * @property {string} producto
 * @property {string} categoriaId
 * @property {string} unidad
 * @property {boolean} delCatalogo - El producto salió del catálogo (categoría y unidad vienen de ahí).
 * @property {number} cantidad
 * @property {string} descripcion
 * @property {string} modeloMarca
 * @property {string} comentario
 * @property {string} imagenUrl
 * @property {Record<string, number>} distribucion
 * @property {boolean} repartoManual - El usuario editó el reparto a mano (si no, se reparte parejo solo).
 * @property {boolean} detallesAbiertos
 */

/**
 * Extiende ProveedorSugerido.
 * @typedef {object} ProveedorForm
 * @property {string} empresa
 * @property {string} contacto
 * @property {string} telefono
 * @property {string} direccion
 */

/**
 * @typedef {object} FormularioEstado
 * @property {string} solicitanteId
 * @property {ModoSucursal} modo
 * @property {string[]} ubicaciones
 * @property {string} entregaId - Dónde se entrega cuando la compra es general (no se carga a ninguna sucursal).
 * @property {Urgencia} urgencia
 * @property {string} motivoUrgencia
 * @property {string} fechaRequerida
 * @property {string} paraQuien
 * @property {string} notas
 * @property {PartidaForm[]} partidas
 * @property {ProveedorForm[]} proveedores
 */

let contador = 0
export function nuevoUid() {
  contador++
  return `p${Date.now().toString(36)}${contador}`
}

export function nuevaPartida() {
  return {
    uid: nuevoUid(),
    producto: '',
    categoriaId: '',
    unidad: '',
    delCatalogo: false,
    cantidad: 1,
    descripcion: '',
    modeloMarca: '',
    comentario: '',
    imagenUrl: '',
    distribucion: {},
    repartoManual: false,
    detallesAbiertos: false,
  }
}

export function nuevoProveedor() {
  return { empresa: '', contacto: '', telefono: '', direccion: '' }
}

export function formularioVacio() {
  return {
    solicitanteId: '',
    modo: 'lista',
    ubicaciones: [],
    entregaId: '',
    urgencia: 'normal',
    motivoUrgencia: '',
    fechaRequerida: '',
    paraQuien: '',
    notas: '',
    partidas: [nuevaPartida()],
    proveedores: [],
  }
}

/** Categorías que piden "¿Qué es?": tecnología y consumibles (y todo lo que se consume). */
export function requiereDescripcion(cat, producto = '') {
  if (!cat) return norm(producto).includes('consumible')
  const n = norm(cat.nombre)
  return cat.destinoInventario === 'ti' || n.includes('tecnolog') || n.includes('consumible') || norm(producto).includes('consumible')
}

/** Reparte `cantidad` lo más parejo posible entre las sucursales ({id: n}); los sobrantes van a las primeras. */
export function repartoParejo(cantidad, ids) {
  const out = {}
  if (ids.length === 0) return out
  const base = Math.floor(cantidad / ids.length)
  let resto = cantidad - base * ids.length
  for (const id of ids) {
    out[id] = base + (resto > 0 ? 1 : 0)
    if (resto > 0) resto--
  }
  return out
}

export function sumaReparto(p, ids) {
  return ids.reduce((s, id) => s + (Number(p.distribucion[id]) || 0), 0)
}

// ---------------------------------------------------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} ErroresPartida
 * @property {string} [producto]
 * @property {string} [categoria]
 * @property {string} [cantidad]
 * @property {string} [descripcion]
 * @property {string} [reparto]
 */
/**
 * @typedef {object} ErroresForm
 * @property {string} [solicitante]
 * @property {string} [ubicaciones]
 * @property {string} [entrega]
 * @property {string} [motivo]
 * @property {string} [fecha]
 * @property {string} [paraQuien]
 * @property {Record<string, ErroresPartida>} partidas
 * @property {Record<number, string>} proveedores
 * @property {string} [partidasGeneral]
 * @property {{ id: string; msg: string }[]} lista - Lista plana (id del elemento al que saltar + mensaje).
 */

/**
 * @typedef {object} ContextoValidacion
 * @property {CategoriaCompra[]} categorias
 * @property {string[]} ubicacionesFinales - Ubicaciones que realmente se enviarán.
 * @property {string} hoy
 */

export function validarFormulario(f, ctx) {
  const e = { partidas: {}, proveedores: {}, lista: [] }
  const add = (id, msg) => e.lista.push({ id, msg })

  if (!f.solicitanteId) {
    e.solicitante = 'Elige quién solicita.'
    add('f-solicitante', e.solicitante)
  }
  if (f.modo === 'general') {
    if (!f.entregaId) {
      e.entrega = 'Indica dónde se entrega la compra.'
      add('f-ubicaciones', e.entrega)
    }
  } else if (f.ubicaciones.length === 0) {
    e.ubicaciones = 'Elige al menos una sucursal, o marca «General» si no se carga a ninguna.'
    add('f-ubicaciones', e.ubicaciones)
  } else if (f.ubicaciones.length > MAX_UBICACIONES) {
    e.ubicaciones = `Máximo ${MAX_UBICACIONES} lugares por requisición. Divide la compra en dos.`
    add('f-ubicaciones', e.ubicaciones)
  }
  if (f.urgencia === 'urgente') {
    if (f.motivoUrgencia.trim().length < 5) {
      e.motivo = 'Cuéntanos en pocas palabras por qué es urgente.'
      add('f-motivo', e.motivo)
    }
    if (!f.fechaRequerida) {
      e.fecha = 'Si es urgente, indica para cuándo la necesitas.'
      add('f-fecha', e.fecha)
    }
  }
  if (f.fechaRequerida && f.fechaRequerida < ctx.hoy) {
    e.fecha = 'Esa fecha ya pasó. Elige hoy o una fecha futura.'
    add('f-fecha', e.fecha)
  }

  if (f.partidas.length === 0) {
    e.partidasGeneral = 'Agrega al menos un producto.'
    add('f-partidas', e.partidasGeneral)
  }
  let hayTI = false
  const multi = ctx.ubicacionesFinales.length > 1
  f.partidas.forEach((p, i) => {
    const pe = {}
    const n = i + 1
    const cat = ctx.categorias.find((c) => c.id === p.categoriaId)
    if (cat?.destinoInventario === 'ti') hayTI = true
    if (p.producto.trim().length < 2) pe.producto = 'Escribe qué necesitas comprar.'
    if (!p.categoriaId) pe.categoria = 'Elige una categoría.'
    if (!Number.isInteger(p.cantidad) || p.cantidad < 1 || p.cantidad > 100000) pe.cantidad = 'La cantidad debe ser 1 o más.'
    if (requiereDescripcion(cat, p.producto) && p.descripcion.trim().length < MIN_DESCRIPCION) {
      pe.descripcion = `Cuéntanos qué es, la presentación y para qué se usa (mínimo ${MIN_DESCRIPCION} letras).`
    }
    if (multi && !pe.cantidad) {
      const suma = sumaReparto(p, ctx.ubicacionesFinales)
      if (suma !== p.cantidad) pe.reparto = `El reparto suma ${suma} y la cantidad es ${p.cantidad}. Ajusta para que coincidan.`
    }
    if (Object.keys(pe).length) {
      e.partidas[p.uid] = pe
      add(`p-${p.uid}`, `Producto ${n}: ${Object.values(pe)[0]}`)
    }
  })
  if (hayTI && f.paraQuien.trim().length < 3) {
    e.paraQuien = 'En compras de tecnología indica para quién es (persona, área o sucursal).'
    add('f-paraquien', e.paraQuien)
  }
  f.proveedores.forEach((pv, i) => {
    const algo = pv.contacto.trim() || pv.telefono.trim() || pv.direccion.trim()
    if (algo && !pv.empresa.trim()) {
      e.proveedores[i] = 'Escribe el nombre de la empresa.'
      add(`pv-${i}`, `Proveedor ${i + 1}: ${e.proveedores[i]}`)
    }
  })
  return e
}

export function hayErrores(e) {
  return e.lista.length > 0
}

// ---------------------------------------------------------------------------------------------------------------------
// Armado del payload
// ---------------------------------------------------------------------------------------------------------------------
export function armarInput(f, ubicacionesFinales, nombreEntrega) {
  const multi = ubicacionesFinales.length > 1
  const partidas = f.partidas.map((p) => ({
    categoriaId: p.categoriaId,
    producto: p.producto.trim(),
    cantidad: p.cantidad,
    descripcion: p.descripcion.trim() || undefined,
    modeloMarca: p.modeloMarca.trim() || undefined,
    comentario: p.comentario.trim() || undefined,
    imagenUrl: p.imagenUrl || undefined,
    distribucion: multi
      ? Object.fromEntries(ubicacionesFinales.map((id) => [id, Number(p.distribucion[id]) || 0]).filter(([, c]) => c > 0))
      : undefined,
  }))
  const notas = []
  if (f.urgencia === 'urgente' && f.motivoUrgencia.trim()) notas.push(`Motivo de urgencia: ${f.motivoUrgencia.trim()}`)
  if (f.modo === 'general') notas.push(`Compra general: no se carga a ninguna sucursal${nombreEntrega ? ` (se entrega en ${nombreEntrega})` : ''}.`)
  if (f.notas.trim()) notas.push(f.notas.trim())
  const proveedoresSugeridos = f.proveedores
    .filter((p) => p.empresa.trim())
    .map((p) => ({
      empresa: p.empresa.trim(),
      contacto: p.contacto.trim() || undefined,
      telefono: p.telefono.trim() || undefined,
      direccion: p.direccion.trim() || undefined,
    }))
  return {
    solicitanteId: f.solicitanteId,
    ubicaciones: ubicacionesFinales,
    urgencia: f.urgencia,
    fechaRequerida: f.fechaRequerida || undefined,
    paraQuien: f.paraQuien.trim() || undefined,
    notas: notas.join('\n') || undefined,
    proveedoresSugeridos,
    partidas,
  }
}
