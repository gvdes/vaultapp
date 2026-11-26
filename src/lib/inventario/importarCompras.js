import * as XLSX from 'xlsx'
import { getFamilia, listFamilias, UBICACION_STOCK_MAESTRO } from './comunes'
import { addEquipo, existeCompraRef as existeRefEquipo, existeSerie, serieControlable } from './sistemas'
import { addMaterial, existeCompraRef as existeRefEntrada, listMateriales, registrarEntrada } from './mantenimiento'
import { addProveedor, listProveedores } from './proveedores'
import { toLocalDateString, todayLocalDateString } from '../dateUtils'

/**
 * Importador genérico de compras (Compras/Adquisiciones → stock maestro).
 *
 * Todo lo "puro" (parseo CSV/XLSX/JSON, mapeo de columnas por alias, clasificación, hash, evaluación de
 * duplicados) vive aquí sin tocar DOM; solo `importarFilas` escribe en las cachés de inventario.
 */

/** @typedef {string[][]} Tabla */
/** @typedef {'equipo' | 'material'} TipoCompra */
/** @typedef {'nuevo' | 'duplicado' | 'sin_serie' | 'error'} EstadoFila */

export class ImportError extends Error {}

export const IMPORT_URL_KEY = 'dga_inv_import_url'
const MAX_UNIDADES_POR_FILA = 200

// ---------------------------------------------------------------------------------------------
// Utilidades de texto / números / fechas
// ---------------------------------------------------------------------------------------------

/** minúsculas, sin acentos, espacios colapsados. */
export function norm(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Igual que norm() pero solo letras y dígitos (para comparar encabezados). */
export function llave(s) {
  return norm(s).replace(/[^a-z0-9]/g, '')
}

export function parseNumero(v) {
  if (v == null) return undefined
  const m = String(v).replace(/\s/g, '').match(/-?\d[\d.,]*/)
  if (!m) return undefined
  let t = m[0]
  const lastDot = t.lastIndexOf('.')
  const lastCom = t.lastIndexOf(',')
  if (lastDot >= 0 && lastCom >= 0) {
    // el último separador es el decimal; el otro, de miles
    if (lastDot > lastCom) t = t.replace(/,/g, '')
    else t = t.replace(/\./g, '').replace(',', '.')
  } else if (lastCom >= 0) {
    t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.')
  } else if (lastDot >= 0 && t.indexOf('.') !== lastDot) {
    t = t.replace(/\./g, '') // varios puntos → separador de miles
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
}

function ymd(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return ''
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Devuelve YYYY-MM-DD o '' si no se reconoce. Los formatos con barras se leen como día/mes/año (México). */
export function parseFecha(v) {
  const s = (v ?? '').trim()
  if (!s) return ''
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?/)
  if (m) {
    const tiempo = m[4] != null
    const medianocheUtc = m[4] === '00' && m[5] === '00' && (m[6] ?? '00') === '00'
    if (tiempo && m[7] && !(m[7] === 'Z' && medianocheUtc)) {
      // instante con zona horaria → fecha local (Apps Script serializa fechas como ISO en UTC)
      const d = new Date(s)
      if (!Number.isNaN(d.getTime())) return toLocalDateString(d)
    }
    return ymd(Number(m[1]), Number(m[2]), Number(m[3]))
  }
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (m) {
    let d = Number(m[1])
    let mo = Number(m[2])
    let y = Number(m[3])
    if (y < 100) y += 2000
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]
    return ymd(y, mo, d)
  }
  m = norm(s).match(/(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?\s*(?:de\s+|del\s+)?(\d{4})/)
  if (m && MESES[m[2]]) return ymd(Number(m[3]), MESES[m[2]], Number(m[1]))
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Number(s)
    if (n > 20000 && n < 80000) return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10)
  }
  const t = Date.parse(s)
  return Number.isNaN(t) ? '' : toLocalDateString(new Date(t))
}

function parseGarantiaMeses(v) {
  const n = parseNumero(v)
  if (n == null || n <= 0) return undefined
  return /a[nñ]o/i.test(v) ? Math.round(n * 12) : Math.round(n)
}

export function splitSeries(v) {
  return Array.from(new Set(v.split(/[\n\r;,|]+/).map((x) => x.trim()).filter(Boolean)))
}

// ---------------------------------------------------------------------------------------------
// Lectura: CSV, XLSX, JSON, archivo, URL
// ---------------------------------------------------------------------------------------------

function detectarDelimitador(text) {
  const cuenta = { ',': 0, ';': 0, '\t': 0 }
  let q = false
  for (let i = 0; i < text.length && i < 20000; i++) {
    const c = text[i]
    if (c === '"') q = !q
    else if (!q && (c === '\n' || c === '\r')) {
      if (Object.values(cuenta).some((n) => n > 0)) break
    } else if (!q && c in cuenta) cuenta[c]++
  }
  return (Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0] ?? [','])[0]
}

/** Parser CSV tolerante: comillas, "" escapadas, comas y saltos de línea dentro de comillas, CRLF, BOM. */
export function parseCsv(texto, delimitador) {
  const text = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
  const d = delimitador ?? detectarDelimitador(text)
  const rows = []
  let row = []
  let field = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQ = false
      } else field += c
    } else if (c === '"' && field === '') inQ = true
    else if (c === d) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function celdaATexto(v) {
  if (v == null) return ''
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    // SheetJS entrega las fechas con desfases de minutos; +12 h evita caer en el día anterior
    return toLocalDateString(new Date(v.getTime() + 12 * 3600 * 1000))
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6)
  if (Array.isArray(v)) return v.map(celdaATexto).filter(Boolean).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v).trim()
}

function tablaDeLibro(wb) {
  const tablas = wb.SheetNames.map((n) => {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' })
    return filas.map((r) => r.map(celdaATexto))
  })
  return tablas.find((t) => localizarEncabezado(t) >= 0) ?? tablas[0] ?? []
}

export function tablaDeXlsx(buffer) {
  return tablaDeLibro(XLSX.read(buffer, { type: 'array', cellDates: true }))
}

/** JSON → tabla. Acepta un arreglo de objetos, un arreglo de arreglos o `{ rows | data | items | ...: [...] }`. */
export function tablaDeJson(data) {
  let arr = data
  if (!Array.isArray(arr) && arr && typeof arr === 'object') {
    const o = arr
    const k = ['rows', 'data', 'items', 'values', 'records', 'compras', 'requisiciones', 'result'].find((x) => Array.isArray(o[x]))
    if (k) arr = o[k]
  }
  if (!Array.isArray(arr)) throw new ImportError('El JSON no contiene una lista de filas. Devuelve un arreglo de objetos o { "rows": [...] }.')
  if (arr.length === 0) return []
  if (Array.isArray(arr[0])) return arr.map((r) => r.map(celdaATexto))
  const objs = arr.filter((x) => !!x && typeof x === 'object')
  const headers = []
  for (const o of objs) for (const k of Object.keys(o)) if (!headers.includes(k)) headers.push(k)
  return [headers, ...objs.map((o) => headers.map((h) => celdaATexto(o[h])))]
}

function decodificar(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf) // CSV exportado desde Excel en Windows
  }
}

/** Texto (CSV o JSON) → tabla, detectando el formato por contenido. */
export function tablaDeTexto(texto) {
  const t = texto.trim()
  if (/^<(!doctype|html)/i.test(t)) {
    throw new ImportError('La dirección devolvió una página web, no un CSV. En Google Sheets usa Archivo → Compartir → Publicar en la web → CSV.')
  }
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      return tablaDeJson(JSON.parse(t))
    } catch (e) {
      if (e instanceof ImportError) throw e
      // no era JSON válido: se intenta como CSV
    }
  }
  return parseCsv(texto)
}

export async function leerArchivo(file) {
  const nombre = file.name.toLowerCase()
  const buf = await file.arrayBuffer()
  try {
    if (/\.(xlsx|xlsm|xls)$/.test(nombre)) return tablaDeXlsx(buf)
    return tablaDeTexto(decodificar(buf))
  } catch (e) {
    if (e instanceof ImportError) throw e
    throw new ImportError('No se pudo leer el archivo. Verifica que sea un CSV, XLSX o JSON válido.')
  }
}

export async function leerUrl(url) {
  let u
  try {
    u = new URL(url.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocolo')
  } catch {
    throw new ImportError('La dirección no es válida. Debe empezar con https://')
  }
  let res
  try {
    res = await fetch(u.toString(), { headers: { Accept: 'text/csv, application/json, text/plain, */*' } })
  } catch {
    throw new ImportError('No se pudo leer la dirección: el servidor no permite leerlo desde el navegador (CORS) o no hay conexión. Descarga el CSV y súbelo.')
  }
  if (!res.ok) throw new ImportError(`El servidor respondió ${res.status}${res.statusText ? ` (${res.statusText})` : ''}. Revisa que la dirección sea pública.`)
  const buf = await res.arrayBuffer()
  const tipo = res.headers.get('content-type') ?? ''
  if (/spreadsheetml|ms-excel|octet-stream/.test(tipo) && /\.(xlsx|xls)(\?|$)/i.test(u.pathname + u.search)) return tablaDeXlsx(buf)
  return tablaDeTexto(decodificar(buf))
}

export function getUltimaUrl() {
  try {
    return localStorage.getItem(IMPORT_URL_KEY) ?? ''
  } catch {
    return ''
  }
}
export function setUltimaUrl(url) {
  try {
    localStorage.setItem(IMPORT_URL_KEY, url)
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

// ---------------------------------------------------------------------------------------------
// Mapeo de columnas por alias
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {'fecha' | 'producto' | 'cantidad' | 'proveedor' | 'costo' | 'costoAlt' | 'factura' | 'series' |
 *   'categoria' | 'marca' | 'modelo' | 'garantia' | 'destino' | 'unidad'} Campo
 */

export const CAMPO_ETIQUETA = {
  fecha: 'Fecha', producto: 'Producto', cantidad: 'Cantidad', proveedor: 'Proveedor', costo: 'Costo unitario',
  costoAlt: 'Costo (menudeo)', factura: 'Factura / folio', series: 'Números de serie', categoria: 'Categoría',
  marca: 'Marca', modelo: 'Modelo', garantia: 'Garantía', destino: 'Destino', unidad: 'Unidad',
}

/**
 * @typedef {object} Alias
 * @property {string[]} exact
 * @property {string[]} [starts]
 * @property {string[]} [contains]
 */

// Las llaves van normalizadas (llave()): sin acentos, minúsculas, solo letras y dígitos.
const ALIAS = {
  fecha: {
    exact: ['fecha', 'fechacompra', 'fechadecompra', 'fechafactura', 'fechapedido', 'fechaorden', 'fechadelrequisicion', 'fecharequisicion', 'fechadelacompra', 'marcatemporal', 'timestamp'],
    starts: ['fecha'],
  },
  series: {
    exact: ['serie', 'series', 'numerodeserie', 'numerosdeserie', 'numeroserie', 'numerosserie', 'numerodeseries', 'noserie', 'nserie', 'numserie', 'serial', 'seriales', 'sn', 'ns'],
    starts: ['serie', 'numerodeserie', 'numerosdeserie', 'noserie'],
    contains: ['serie', 'serial'],
  },
  factura: {
    exact: ['factura', 'folio', 'nofactura', 'numerofactura', 'numerodefactura', 'foliofactura', 'nfactura', 'folioderequisicion', 'foliorequisicion', 'requisicion', 'ordendecompra', 'oc'],
    starts: ['factura', 'folio'],
    contains: ['factura', 'folio'],
  },
  cantidad: {
    exact: ['cantidad', 'cant', 'cantidadcomprada', 'cantidadsolicitada', 'cantidadrecibida', 'piezas', 'pzas', 'unidades', 'qty', 'numpiezas'],
    starts: ['cantidad'],
    contains: ['cantidad'],
  },
  producto: {
    exact: ['producto', 'productos', 'articulo', 'articulos', 'descripcion', 'descripciondelproducto', 'concepto', 'item', 'material', 'equipo', 'nombre'],
    starts: ['producto', 'articulo', 'descripcion'],
    contains: ['producto', 'articulo', 'descripcion'],
  },
  proveedor: {
    exact: ['proveedor', 'razonsocial', 'proveedorrazonsocial', 'proveedorsugerido'],
    starts: ['proveedor', 'razonsocial'],
    contains: ['proveedor', 'razonsocial'],
  },
  costo: {
    exact: ['costounitario', 'preciounitario', 'costo', 'precio', 'preciocompra', 'costocompra', 'costoporunidad', 'valorunitario', 'costounit', 'pu'],
    starts: ['costounitario', 'preciounitario'],
    contains: ['costounitario', 'preciounitario'],
  },
  costoAlt: {
    exact: ['mejormenudeo', 'costomenudeo', 'menudeo'],
    starts: ['costomenudeo', 'mejormenudeo'],
  },
  categoria: {
    exact: ['categoria', 'familia', 'clasificacion', 'rubro', 'linea', 'grupo', 'tipo'],
    starts: ['categoria', 'familia', 'clasificacion'],
    contains: ['categoria', 'familia', 'clasificacion'],
  },
  marca: { exact: ['marca', 'brand', 'fabricante'] },
  modelo: { exact: ['modelo', 'model'], starts: ['modelo'] },
  garantia: { exact: ['garantia', 'garantiameses', 'mesesdegarantia', 'garantiaenmeses'], starts: ['garantia'], contains: ['garantia'] },
  destino: {
    exact: ['destino', 'ubicacion', 'ubicaciondestino', 'sucursal', 'areadestino', 'entregaen'],
    starts: ['destino', 'ubicacion'],
    contains: ['destino', 'ubicacion'],
  },
  unidad: { exact: ['unidad', 'unidadpresentacion', 'presentacion', 'unidaddemedida', 'um'], starts: ['unidad', 'presentacion'] },
}

const ORDEN_CAMPOS = ['fecha', 'series', 'factura', 'cantidad', 'producto', 'proveedor', 'costo', 'costoAlt', 'categoria', 'marca', 'modelo', 'garantia', 'destino', 'unidad']

/** @typedef {Partial<Record<Campo, number>>} Mapeo */

export function mapearEncabezados(headers) {
  const llaves = headers.map((h) => llave(h ?? ''))
  const usados = new Set()
  const mapeo = {}
  for (const campo of ORDEN_CAMPOS) {
    const a = ALIAS[campo]
    const pasos = [
      [a.exact, (h, x) => h === x],
      [a.starts, (h, x) => h.startsWith(x)],
      [a.contains, (h, x) => h.includes(x)],
    ]
    let hallado = -1
    for (const [lista, cmp] of pasos) {
      if (!lista) continue
      for (const x of lista) {
        const idx = llaves.findIndex((h, i) => h !== '' && !usados.has(i) && cmp(h, x))
        if (idx >= 0) {
          hallado = idx
          break
        }
      }
      if (hallado >= 0) break
    }
    if (hallado >= 0) {
      mapeo[campo] = hallado
      usados.add(hallado)
    }
  }
  return mapeo
}

/** Índice de la fila de encabezados (la primera con una columna de producto reconocible) o -1. */
export function localizarEncabezado(tabla) {
  const limite = Math.min(tabla.length, 15)
  for (let i = 0; i < limite; i++) {
    if (mapearEncabezados(tabla[i]).producto !== undefined) return i
  }
  return -1
}

// ---------------------------------------------------------------------------------------------
// Clasificación (equipo serializado vs material por cantidad)
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {object} Regla
 * @property {TipoCompra} tipo
 * @property {string} familiaId
 * @property {RegExp} re
 */

/** Palabras (ya sin acentos) → regex con plural opcional y límites de palabra. */
function kw(palabras) {
  return new RegExp(`\\b(?:${palabras.join('|')})(?:s|es)?\\b`)
}

const FAM_TI_GENERICO = 'fam-cables'

const REGLAS = [
  // --- Mantenimiento / consumibles
  {
    tipo: 'material',
    familiaId: 'fam-consumible',
    re: kw([
      'toner', 'cartucho', 'tinta', 'papel', 'hoja', 'folder', 'lapiz', 'lapice', 'pluma', 'boligrafo', 'marcador', 'plumon', 'resaltador', 'clip', 'grapa',
      'libreta', 'cuaderno', 'etiqueta', 'cinta adhesiva', 'cinta masking', 'diurex', 'pegamento', 'resistol', 'tijera', 'jabon', 'cloro', 'desinfectante',
      'limpiador', 'detergente', 'trapeador', 'escoba', 'fabuloso', 'bolsa', 'sanita', 'toalla', 'cubreboca', 'gel', 'cafe', 'servilleta', 'aromatizante',
      'pinol', 'esponja', 'trapo', 'recogedor', 'cepillo', 'guante', 'vaso', 'rollo', 'post-it',
    ]),
  },
  {
    tipo: 'material',
    familiaId: 'fam-refaccion',
    re: kw(['refaccion', 'repuesto', 'filtro', 'foco', 'lampara', 'balastra', 'bomba', 'valvula', 'chapa', 'cerradura', 'bisagra', 'rodamiento', 'banda', 'fusible', 'apagador', 'interruptor', 'termomagnetico', 'empaque', 'balata', 'resorte']),
  },
  // Herramienta se lleva por pieza (familia serializada en Mantenimiento), por eso es "equipo"
  {
    tipo: 'equipo',
    familiaId: 'fam-herramienta',
    re: kw([
      'herramienta', 'taladro', 'martillo', 'desarmador', 'pinza', 'llave inglesa', 'llave stillson', 'llave allen', 'juego de llaves', 'sierra', 'esmeril', 'cautin',
      'multimetro', 'escalera', 'flexometro', 'pistola de calor', 'rotomartillo', 'atornillador', 'lijadora', 'cortadora', 'soldadora', 'compresor', 'hidrolavadora',
      'carretilla', 'pulidora', 'caladora', 'amoladora', 'ponchadora', 'probador de cable',
    ]),
  },
  // --- TI (equipo serializado). Las específicas van primero: en un empate de posición gana la primera regla.
  { tipo: 'equipo', familiaId: FAM_TI_GENERICO, re: kw(['mouse ?pad', 'mousepad']) },
  { tipo: 'equipo', familiaId: 'fam-laptops', re: kw(['laptop', 'notebook', 'macbook', 'ultrabook', 'chromebook', 'computadora portatil']) },
  { tipo: 'equipo', familiaId: 'fam-pc', re: kw(['pc', 'cpu', 'computadora', 'computador', 'desktop', 'all in one', 'mini pc', 'imac', 'workstation', 'equipo de computo']) },
  { tipo: 'equipo', familiaId: 'fam-impresoras-tickets', re: kw(['impresora de tickets', 'impresora termica', 'impresora de etiquetas', 'impresora de recibos', 'ticketera', 'miniprinter', 'impresora de codigo']) },
  { tipo: 'equipo', familiaId: 'fam-impresoras', re: kw(['impresora', 'multifuncional', 'plotter', 'copiadora']) },
  { tipo: 'equipo', familiaId: 'fam-monitores', re: kw(['monitor', 'pantalla', 'display', 'smart tv', 'television', 'tv']) },
  { tipo: 'equipo', familiaId: 'fam-mouse', re: kw(['mouse', 'raton', 'trackpad']) },
  { tipo: 'equipo', familiaId: 'fam-teclados', re: kw(['teclado', 'keyboard']) },
  { tipo: 'equipo', familiaId: 'fam-celulares', re: kw(['celular', 'smartphone', 'iphone', 'telefono movil', 'telefono celular']) },
  { tipo: 'equipo', familiaId: 'fam-tablets', re: kw(['tablet', 'ipad']) },
  { tipo: 'equipo', familiaId: 'fam-radios', re: kw(['radio', 'walkie talkie', 'walkie', 'radiocomunicador']) },
  { tipo: 'equipo', familiaId: 'fam-audifonos', re: kw(['diadema', 'audifono', 'auricular', 'headset', 'manos libres', 'bocina', 'altavoz', 'microfono']) },
  { tipo: 'equipo', familiaId: 'fam-camaras', re: kw(['camara', 'webcam', 'cctv', 'dvr', 'nvr']) },
  {
    tipo: 'equipo',
    familiaId: 'fam-cables',
    re: kw([
      'cable', 'adaptador', 'hub', 'cargador', 'convertidor', 'usb', 'hdmi', 'vga', 'ethernet', 'patch', 'conector', 'multicontacto', 'regulador', 'nobreak', 'ups',
      'switch', 'router', 'access point', 'modem', 'firewall', 'rack', 'servidor', 'disco duro', 'ssd', 'memoria ram', 'memoria usb', 'funda', 'mochila', 'maletin',
      'soporte para',
    ]),
  },
]

const REGLAS_CATEGORIA = [
  { re: /papeleria|limpieza|consumible|insumo|cafeteria|higiene|abarrote/, tipo: 'material', familiaId: 'fam-consumible' },
  { re: /herramienta|ferreteria/, tipo: 'equipo', familiaId: 'fam-herramienta' },
  { re: /refaccion|repuesto|plomeria|electric|pintura|construccion/, tipo: 'material', familiaId: 'fam-refaccion' },
  { re: /tecnolog|computo|sistemas|informatica|telecom|redes|\bti\b/, tipo: 'equipo', familiaId: FAM_TI_GENERICO },
]

/**
 * @typedef {object} Clasificacion
 * @property {TipoCompra} tipo
 * @property {string} familiaId
 */

/** Clasifica por palabras clave del producto (gana la palabra que aparece primero); la categoría solo desempata cuando el producto no dice nada. */
export function clasificar(producto, categoria = '') {
  const texto = norm(producto)
  let mejor = null
  let mejorIdx = Infinity
  for (const r of REGLAS) {
    const m = r.re.exec(texto)
    if (m && m.index < mejorIdx) {
      mejor = r
      mejorIdx = m.index
    }
  }
  if (mejor) return { tipo: mejor.tipo, familiaId: mejor.familiaId }
  const cat = norm(categoria)
  if (cat) {
    const rc = REGLAS_CATEGORIA.find((x) => x.re.test(cat))
    if (rc) return { tipo: rc.tipo, familiaId: rc.familiaId }
  }
  return { tipo: 'material', familiaId: 'fam-material' }
}

/** Familias válidas para un tipo: equipo → serializadas (Sistemas + herramienta/equipo de Mantenimiento); material → por cantidad. */
export function familiasPara(tipo) {
  if (tipo === 'equipo') return [...listFamilias('sistemas'), ...listFamilias('mantenimiento').filter((f) => f.modoInventario === 'serializado')]
  return listFamilias('mantenimiento').filter((f) => f.modoInventario === 'cantidad')
}

/** Familia por defecto para un tipo dado (respeta la clasificación si ya coincide con el tipo). */
export function familiaPorDefecto(tipo, producto, categoria = '') {
  const c = clasificar(producto, categoria)
  const validas = familiasPara(tipo)
  if (c.tipo === tipo && (validas.length === 0 || validas.some((f) => f.id === c.familiaId))) return c.familiaId
  return validas.find((f) => f.id === (tipo === 'equipo' ? FAM_TI_GENERICO : 'fam-material'))?.id ?? validas[0]?.id ?? (tipo === 'equipo' ? FAM_TI_GENERICO : 'fam-material')
}

// ---------------------------------------------------------------------------------------------
// Hash estable de compra (dedupe)
// ---------------------------------------------------------------------------------------------

/** cyrb53: hash de 53 bits, determinista y sincrónico. */
export function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function claveBaseCompra(f) {
  return [f.fecha, f.producto, f.proveedor, f.factura].map((x) => norm(x ?? '')).join('|')
}

/** compraRef de una unidad: hash(fecha|producto|proveedor|factura|índice). El índice empieza en 1. */
export function compraRef(f, indice) {
  return `cmp-${hash53(`${claveBaseCompra(f)}|${indice}`)}`
}

// ---------------------------------------------------------------------------------------------
// Filas normalizadas y vista previa
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {object} CompraBruta
 * @property {number} fila - Número de fila en el origen (1 = primera fila del archivo).
 * @property {string} fecha
 * @property {string} producto
 * @property {string} categoria
 * @property {number} cantidad
 * @property {string} proveedor
 * @property {number} [costo]
 * @property {string} factura
 * @property {string[]} series
 * @property {string} marca
 * @property {string} modelo
 * @property {number} [garantiaMeses]
 * @property {string} destino
 * @property {string} unidad
 */

/**
 * Extiende CompraBruta.
 * @typedef {object} FilaPreview
 * @property {number} id
 * @property {TipoCompra} tipo
 * @property {string} familiaId
 * @property {boolean} incluir
 * @property {EstadoFila} estado
 * @property {string} mensaje
 * @property {number} nuevas - Unidades (equipos) o entradas (material) que realmente se crearían.
 */

/**
 * @typedef {object} ResultadoPreview
 * @property {FilaPreview[]} filas
 * @property {Partial<Record<Campo, string>>} columnas - campo → nombre de la columna detectada
 * @property {string[]} avisos
 */

function esFilaCategoria(celdas) {
  const llenas = celdas.map((c) => (c ?? '').trim()).filter(Boolean)
  if (llenas.length !== 1) return null
  const t = llenas[0]
  const simbolo = /^[^\p{L}\p{N}]/u.test(t)
  const mayus = t === t.toUpperCase() && /\p{L}/u.test(t)
  if (!simbolo && !mayus) return null
  const limpio = t.replace(/^[^\p{L}\p{N}]+/u, '').trim()
  return limpio || null
}

function refsDeFila(f) {
  const n = f.tipo === 'equipo' ? Math.max(0, Math.floor(f.cantidad)) : 1
  return Array.from({ length: Math.min(n, MAX_UNIDADES_POR_FILA) }, (_, i) => compraRef(f, i + 1))
}

/** Dominio al que pertenece una fila de compra: el material siempre es de Mantenimiento; el equipo, el de su familia. */
function dominioDeFila(f) {
  if (f.tipo === 'material') return 'mantenimiento'
  return getFamilia(f.familiaId)?.tipo ?? 'sistemas'
}

const existeRef = (ref) => existeRefEquipo(ref) || existeRefEntrada(ref)

/** Pone la cantidad al menos igual al número de series dadas (un equipo por serie). */
export function ajustarCantidad(f) {
  if (f.tipo === 'equipo' && f.series.length > f.cantidad) f.cantidad = f.series.length
}

/**
 * Recalcula estado/mensaje/nuevas de todas las filas (tras editar tipo, familia o cantidad).
 * Una fila marcada se desmarca sola si queda duplicada o con error.
 */
export function reevaluarFilas(filas, dominio) {
  const vistos = new Set()
  const seriesVistas = new Set()
  for (const f of filas) {
    f.nuevas = 0
    if (dominio && dominioDeFila(f) !== dominio) {
      f.estado = 'error'
      f.mensaje = `Fuera de tu área: esta compra es de ${dominioDeFila(f) === 'sistemas' ? 'Sistemas' : 'Mantenimiento'}`
    } else if (!f.producto) {
      f.estado = 'error'
      f.mensaje = 'Falta el producto'
    } else if (!(f.cantidad > 0)) {
      f.estado = 'error'
      f.mensaje = 'Cantidad inválida'
    } else if (f.tipo === 'equipo' && !Number.isInteger(f.cantidad)) {
      f.estado = 'error'
      f.mensaje = 'Un equipo se cuenta por pieza: la cantidad debe ser entera'
    } else if (f.tipo === 'equipo' && f.cantidad > MAX_UNIDADES_POR_FILA) {
      f.estado = 'error'
      f.mensaje = `Cantidad demasiado alta (máx. ${MAX_UNIDADES_POR_FILA} por fila)`
    } else {
      const refs = refsDeFila(f)
      const existentes = refs.filter(existeRef).length
      const repetidas = refs.filter((r) => vistos.has(r)).length
      if (existentes === refs.length) {
        f.estado = 'duplicado'
        f.mensaje = 'Ya importada anteriormente'
      } else if (repetidas === refs.length) {
        f.estado = 'duplicado'
        f.mensaje = 'Repetida en el archivo'
      } else {
        // Candado de serie única: una serie ya registrada (o repetida en el archivo) no se puede volver a dar de alta.
        const conflictos =
          f.tipo === 'equipo'
            ? f.series
                .slice(0, refs.length)
                .filter((s, i) => !existeRef(refs[i]) && !vistos.has(refs[i]) && serieControlable(s) && (existeSerie(s) || seriesVistas.has(norm(s))))
            : []
        if (conflictos.length > 0) {
          f.estado = 'duplicado'
          f.mensaje = `Serie ya registrada: ${conflictos.join(', ')}`
          f.incluir = false
          continue
        }
        const libres = refs.filter((r) => !existeRef(r) && !vistos.has(r))
        libres.forEach((r) => vistos.add(r))
        if (f.tipo === 'equipo') f.series.forEach((s) => serieControlable(s) && seriesVistas.add(norm(s)))
        f.nuevas = libres.length
        const pendientes = f.tipo === 'equipo' ? Math.max(0, f.cantidad - f.series.length) : 0
        if (pendientes > 0) {
          f.estado = 'sin_serie'
          f.mensaje = f.series.length ? `Faltan ${pendientes} serie(s): se marcarán como pendientes de captura` : 'Sin serie: se creará como pendiente de captura'
        } else {
          f.estado = 'nuevo'
          f.mensaje = libres.length < refs.length ? `${refs.length - libres.length} de ${refs.length} unidades ya existían` : ''
        }
      }
    }
    if (f.estado === 'error' || f.estado === 'duplicado') f.incluir = false
  }
}

/** Tabla cruda → filas de vista previa ya clasificadas y evaluadas. */
export function construirPreview(tabla, dominio) {
  const cab = localizarEncabezado(tabla)
  if (cab < 0) {
    throw new ImportError('No se encontró una columna de producto (Producto, Artículo, Descripción…). Revisa que la primera fila tenga encabezados.')
  }
  const headers = tabla[cab]
  const mapeo = mapearEncabezados(headers)
  const columnas = {}
  for (const c of ORDEN_CAMPOS) if (mapeo[c] !== undefined) columnas[c] = (headers[mapeo[c]] ?? '').trim()

  const avisos = []
  if (mapeo.cantidad === undefined) avisos.push('No se detectó columna de cantidad: se asume 1 por fila (o el número de series, si las hay).')
  if (mapeo.costo === undefined && mapeo.costoAlt === undefined) avisos.push('No se detectó columna de costo: los costos quedarán en 0.')
  if (mapeo.fecha === undefined) avisos.push('No se detectó columna de fecha: se usará la fecha de hoy como fecha de compra.')

  const get = (celdas, campo) => {
    const i = mapeo[campo]
    return i === undefined ? '' : (celdas[i] ?? '').trim()
  }

  const filas = []
  let categoriaActual = ''
  for (let r = cab + 1; r < tabla.length; r++) {
    const celdas = tabla[r]
    if (celdas.every((c) => !(c ?? '').trim())) continue
    const cat = esFilaCategoria(celdas)
    if (cat) {
      categoriaActual = cat
      continue
    }
    const producto = get(celdas, 'producto')
    const series = splitSeries(get(celdas, 'series'))
    const categoria = get(celdas, 'categoria') || categoriaActual
    const cantRaw = get(celdas, 'cantidad')
    let cantidad = 1
    if (cantRaw) cantidad = parseNumero(cantRaw) ?? 0
    else if (series.length > 0) cantidad = series.length
    const costo = parseNumero(get(celdas, 'costo')) ?? parseNumero(get(celdas, 'costoAlt'))
    const clase = clasificar(producto, categoria)
    const fila = {
      id: filas.length,
      fila: r + 1,
      fecha: parseFecha(get(celdas, 'fecha')),
      producto,
      categoria,
      cantidad,
      proveedor: get(celdas, 'proveedor'),
      costo: costo != null && costo >= 0 ? costo : undefined,
      factura: get(celdas, 'factura'),
      series,
      marca: get(celdas, 'marca'),
      modelo: get(celdas, 'modelo'),
      garantiaMeses: parseGarantiaMeses(get(celdas, 'garantia')),
      destino: get(celdas, 'destino'),
      unidad: get(celdas, 'unidad'),
      tipo: clase.tipo,
      familiaId: clase.familiaId,
      incluir: true,
      estado: 'nuevo',
      mensaje: '',
      nuevas: 0,
    }
    // Si la familia sugerida no existe en este catálogo, se cae a la primera válida del tipo.
    if (!familiasPara(fila.tipo).some((f) => f.id === fila.familiaId) && getFamilia(fila.familiaId) == null) {
      fila.familiaId = familiaPorDefecto(fila.tipo, producto, categoria)
    }
    ajustarCantidad(fila)
    filas.push(fila)
  }
  if (filas.length === 0) avisos.push('El archivo no tiene filas de datos debajo de los encabezados.')
  reevaluarFilas(filas, dominio)
  return { filas, columnas, avisos }
}

/** Cambia el tipo de una fila reasignando familia y reajustando cantidad; después hay que llamar reevaluarFilas. */
export function cambiarTipo(f, tipo) {
  f.tipo = tipo
  f.familiaId = familiaPorDefecto(tipo, f.producto, f.categoria)
  ajustarCantidad(f)
}

// ---------------------------------------------------------------------------------------------
// Confirmación: crea equipos / materiales / entradas / proveedores
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {object} ResultadoImportacion
 * @property {number} equipos
 * @property {number} entradas
 * @property {number} materialesNuevos
 * @property {number} proveedoresNuevos
 * @property {number} omitidos
 * @property {string[]} errores
 */

/**
 * @typedef {object} OpcionesImportacion
 * @property {string} [quienRecibio]
 * @property {(hechas: number, total: number) => void} [onProgreso]
 */

export function filasImportables(filas) {
  return filas.filter((f) => f.incluir && (f.estado === 'nuevo' || f.estado === 'sin_serie'))
}

export async function importarFilas(filas, opts = {}) {
  const res = { equipos: 0, entradas: 0, materialesNuevos: 0, proveedoresNuevos: 0, omitidos: 0, errores: [] }
  const aImportar = filasImportables(filas)
  const hoy = todayLocalDateString()
  const proveedores = new Map()

  async function asegurarProveedor(nombre) {
    if (!nombre) return undefined
    const k = llave(nombre)
    const cacheado = proveedores.get(k)
    if (cacheado) return cacheado
    let p = listProveedores(true).find((x) => llave(x.nombre) === k)
    if (!p) {
      p = await addProveedor({ nombre })
      res.proveedoresNuevos++
    }
    const v = { id: p.id, nombre: p.nombre }
    proveedores.set(k, v)
    return v
  }

  let hechas = 0
  for (const f of aImportar) {
    try {
      const prov = await asegurarProveedor(f.proveedor)
      const base = hash53(claveBaseCompra(f)).slice(0, 6).toUpperCase()

      if (f.tipo === 'equipo') {
        for (let n = 1; n <= f.cantidad; n++) {
          const ref = compraRef(f, n)
          if (existeRef(ref)) {
            res.omitidos++
            continue
          }
          const serie = f.series[n - 1]
          if (serie && existeSerie(serie)) {
            res.omitidos++
            res.errores.push(`Fila ${f.fila}: la serie ${serie} ya está registrada; se omitió esa unidad.`)
            continue
          }
          const pendiente = !serie
          const notas = [
            'Importado de compras.',
            pendiente ? 'Serie pendiente de captura.' : '',
            f.destino ? `Destino indicado en la compra: ${f.destino}.` : '',
          ]
            .filter(Boolean)
            .join(' ')
          await addEquipo({
            familiaId: f.familiaId,
            modelo: f.modelo || f.producto,
            marca: f.marca || undefined,
            numeroSerie: serie || `PENDIENTE-${base}-${n}`,
            ubicacionId: UBICACION_STOCK_MAESTRO,
            proveedor: prov?.nombre,
            fechaCompra: f.fecha || hoy,
            numeroFactura: f.factura || undefined,
            costoTotal: f.costo ?? 0,
            garantiaMeses: f.garantiaMeses,
            estado: 'disponible',
            notas,
            compraRef: ref,
          }, opts.quienRecibio)
          res.equipos++
        }
      } else {
        const ref = compraRef(f, 1)
        if (existeRef(ref)) {
          res.omitidos++
        } else {
          const k = llave(f.producto)
          let mat = listMateriales().find((m) => m.familiaId === f.familiaId && llave(m.nombre) === k)
          if (!mat) {
            mat = await addMaterial({
              familiaId: f.familiaId,
              nombre: f.producto,
              marca: f.marca || undefined,
              unidadMedida: f.unidad || 'pieza',
              cantidadActual: 0,
              minimo: 0,
              costoUnitario: f.costo ?? 0,
              garantiaMeses: f.garantiaMeses,
              ubicacionId: UBICACION_STOCK_MAESTRO,
              notas: f.destino ? `Destino indicado en la compra: ${f.destino}.` : undefined,
            })
            res.materialesNuevos++
          }
          await registrarEntrada({
            materialId: mat.id,
            fecha: f.fecha || hoy,
            cantidad: f.cantidad,
            costoUnitario: f.costo,
            proveedor: prov?.nombre,
            proveedorId: prov?.id,
            numeroFactura: f.factura || undefined,
            quienRecibio: opts.quienRecibio,
            compraRef: ref,
          })
          res.entradas++
        }
      }
    } catch (e) {
      res.errores.push(`Fila ${f.fila}: ${e instanceof Error && e.message ? e.message : 'no se pudo guardar'}`)
    }
    hechas++
    opts.onProgreso?.(hechas, aImportar.length)
  }
  return res
}
