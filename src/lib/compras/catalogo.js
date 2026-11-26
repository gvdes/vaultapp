import { registrarBitacora, cambios } from '../bitacora'
import { crearTabla, nuevoId, normalizar, usuarioActual } from './store'
import { CATEGORIAS_SEED, CATALOGO_SEED } from './seedCatalogo'

/**
 * Categorías (las 8 de Finanzas, con destino de inventario) y catálogo de productos con proveedor sugerido y costo de
 * referencia. En modo local se siembran desde seedCatalogo.js (mismo contenido que el seed de 013_compras.sql).
 * Nada se borra: se desactiva (`activo = false`).
 */
const categorias = crearTabla({
  key: 'dga_cmp_categorias',
  tabla: 'cmp_categorias',
  pk: 'id',
  orderBy: 'orden',
  seed: () => CATEGORIAS_SEED,
})

const catalogo = crearTabla({
  key: 'dga_cmp_catalogo',
  tabla: 'cmp_catalogo',
  pk: 'id',
  num: ['costoReferencia'],
  orderBy: 'producto',
  seed: () => CATALOGO_SEED,
})

export const loadCatalogoCache = async () => {
  await Promise.all([categorias.load(), catalogo.load()])
}
export const isCatalogoCacheReady = () => categorias.isReady() && catalogo.isReady()

// ---- Categorías --------------------------------------------------------------------------------------------------------
export function listCategorias(opts) {
  const list = categorias.list()
  return [...(opts?.incluirInactivas ? list : list.filter((c) => c.activo))].sort((a, b) => a.orden - b.orden)
}

export function getCategoria(id) {
  return id ? categorias.get(id) : undefined
}

export function destinoDeCategoria(categoriaId) {
  return getCategoria(categoriaId)?.destinoInventario ?? 'ninguno'
}

export function getCategoriaPorNombre(nombre) {
  const n = normalizar(nombre)
  categorias.list()
  return categorias.raw().find((c) => normalizar(c.nombre) === n)
}

export async function addCategoria(input) {
  if (!input.nombre.trim()) throw new Error('El nombre de la categoría es obligatorio.')
  if (getCategoriaPorNombre(input.nombre)) throw new Error('Ya existe una categoría con ese nombre.')
  const orden = Math.max(0, ...categorias.raw().map((c) => c.orden)) + 1
  const cat = { id: `cat-${nuevoId()}`, nombre: input.nombre.trim().toUpperCase(), destinoInventario: input.destinoInventario, orden, activo: true }
  await categorias.insert(cat)
  registrarBitacora({ tabla: 'cmp_categorias', registroId: cat.id, accion: 'alta', despues: cat, detalle: `${usuarioActual()} creó la categoría ${cat.nombre}` })
  return cat
}

export async function updateCategoria(id, patch) {
  const prev = categorias.raw().find((c) => c.id === id)
  if (!prev) throw new Error('Categoría no encontrada.')
  await categorias.update(id, patch)
  const { antes, despues } = cambios(prev, patch)
  registrarBitacora({ tabla: 'cmp_categorias', registroId: id, accion: patch.activo === false ? 'desactivación' : 'cambio', antes, despues })
}

// ---- Catálogo ----------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} FiltroCatalogo
 * @property {string} [categoriaId]
 * @property {string} [texto]
 * @property {boolean} [incluirInactivos]
 */

export function listCatalogo(filtro) {
  let list = catalogo.list()
  if (!filtro?.incluirInactivos) list = list.filter((p) => p.activo)
  if (filtro?.categoriaId) list = list.filter((p) => p.categoriaId === filtro.categoriaId)
  if (filtro?.texto) {
    const q = normalizar(filtro.texto)
    list = list.filter((p) => normalizar(`${p.producto} ${p.proveedorSugerido ?? ''}`).includes(q))
  }
  return [...list].sort((a, b) => a.producto.localeCompare(b.producto, 'es'))
}

export function getProductoCatalogo(id) {
  return id ? catalogo.get(id) : undefined
}

/** Producto del catálogo por nombre exacto (sin acentos/mayúsculas), para sugerir proveedor y costo de referencia. */
export function buscarProductoPorNombre(producto, categoriaId) {
  const n = normalizar(producto)
  catalogo.list()
  return catalogo.raw().find((p) => p.activo && normalizar(p.producto) === n && (!categoriaId || p.categoriaId === categoriaId))
}

export async function addProducto(input) {
  if (!input.producto.trim()) throw new Error('El nombre del producto es obligatorio.')
  if (!getCategoria(input.categoriaId)) throw new Error('Elige una categoría válida.')
  const dup = buscarProductoPorNombre(input.producto, input.categoriaId)
  if (dup) throw new Error('Ese producto ya está en el catálogo de la categoría.')
  const p = {
    id: `prod-${nuevoId()}`,
    categoriaId: input.categoriaId,
    producto: input.producto.trim(),
    unidad: input.unidad?.trim() || 'pieza',
    proveedorSugerido: input.proveedorSugerido?.trim() || undefined,
    costoReferencia: input.costoReferencia,
    activo: input.activo ?? true,
  }
  await catalogo.insert(p)
  registrarBitacora({ tabla: 'cmp_catalogo', registroId: p.id, accion: 'alta', despues: p, detalle: `${usuarioActual()} agregó ${p.producto} al catálogo` })
  return p
}

export async function updateProducto(id, patch) {
  const prev = catalogo.raw().find((p) => p.id === id)
  if (!prev) throw new Error('Producto no encontrado.')
  await catalogo.update(id, patch)
  const { antes, despues } = cambios(prev, patch)
  registrarBitacora({ tabla: 'cmp_catalogo', registroId: id, accion: patch.activo === false ? 'desactivación' : 'cambio', antes, despues })
}

/**
 * Catálogo público (sin proveedor ni costos) para el formulario sin login.
 * @typedef {object} CatalogoPublico
 * @property {{ id: string; nombre: string; destinoInventario: DestinoInventario }[]} categorias
 * @property {{ id: string; categoriaId: string; producto: string; unidad?: string }[]} catalogo
 */

/** Deja en caché las listas cerradas que devolvió la RPC pública (para validar el destino 'ti' sin leer tablas). */
export function hidratarCatalogoPublico(cats, prods) {
  cats.forEach((c) => categorias.setLocal(c))
  prods.forEach((p) => catalogo.setLocal(p))
}

export function reiniciarCatalogoLocal() {
  categorias.reiniciarLocal()
  catalogo.reiniciarLocal()
}
