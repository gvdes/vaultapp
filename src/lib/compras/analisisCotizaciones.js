/**
 * Análisis de cotizaciones: costo total comparable, puntaje 0-100, recomendación, insignias y alertas.
 *
 * FUNCIÓN PURA (sin caché, sin Supabase, sin reloj propio): la misma lógica se usa en la hoja del cotizador, en el correo de
 * autorización y en la liga pública de aprobación (que la alimenta con los datos crudos de `cmp_ver_para_aprobar`), y se prueba con Node.
 * Se re-exporta desde `cotizaciones.js` / `index.js`.
 *
 * COSTO TOTAL COMPARABLE (espejo de `cmp_monto_cotizacion` en supabase/migrations/020_cotizador.sql; si se cambia una, cambiar la otra):
 *     (Σ precio unitario × cantidad − descuento + flete) × (1 + IVA si los precios NO traen IVA incluido), a centavos.
 *
 * PUNTAJE = Σ peso × puntaje parcial / Σ pesos de los criterios con dato (los criterios sin dato NO penalizan: su peso se reparte).
 *   precio        = precio más bajo del grupo / precio · 100                     (solo cotizaciones completas)
 *   garantía      = meses / máximo de meses del grupo · 100                      ('ninguna' cuenta como 0 meses; si nadie ofrece garantía no se usa)
 *   entrega       = menor plazo del grupo / plazo · 100                          (0 días cuenta como 1)
 *   crédito       = días (tope 30) / máximo del grupo (tope 30) · 100            (si nadie da crédito no se usa)
 *   respaldo      = distribuidor autorizado 60 + soporte técnico 40              (lo que no se capturó no cuenta)
 *   condiciones   = promedio de: vigencia vigente, acepta devoluciones, anticipo bajo (0 % = 100; 50 % o más = 0)
 *   calificación  = estrellas / 5 · 100
 * Desempates (estables): mayor puntaje, menor total comparable, menor plazo de entrega, orden de captura.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------------------------------------------------
export const PESOS_DEFAULT = { precio: 40, garantia: 15, entrega: 10, credito: 10, respaldo: 15, condiciones: 5, calificacion: 5 }
export const IVA_DEFAULT = 16
/** Tope de días de crédito que cuenta para el puntaje. */
export const TOPE_CREDITO_DIAS = 30
/** Desde este anticipo (%) se muestra la alerta. */
export const ANTICIPO_ALERTA_PCT = 30
/** Con este anticipo (%) o más, el criterio "anticipo bajo" vale 0. */
export const ANTICIPO_CERO_PCT = 50

/** @typedef {keyof PesosCotizador} CriterioId */
export const CRITERIOS_ORDEN = ['precio', 'garantia', 'entrega', 'credito', 'respaldo', 'condiciones', 'calificacion']

/** Qué mide cada criterio, en lenguaje llano (se muestra en Directorio → Reglas y en la ayuda del cotizador). */
export const CRITERIOS_INFO = {
  precio: { label: 'Precio', explicacion: 'Cuánto cuesta en total (con descuento, flete e IVA). La más barata recibe el máximo; las demás, en proporción.' },
  garantia: { label: 'Garantía', explicacion: 'Meses de garantía. La que ofrece más meses recibe el máximo. Sin garantía vale cero.' },
  entrega: { label: 'Entrega', explicacion: 'Qué tan rápido entrega. El plazo más corto recibe el máximo.' },
  credito: { label: 'Crédito', explicacion: 'Días para pagar (más de 30 días ya no suma más). Contado vale cero.' },
  respaldo: { label: 'Respaldo de marca', explicacion: 'Si es distribuidor autorizado de la marca (60 %) y si da soporte técnico (40 %).' },
  condiciones: { label: 'Condiciones', explicacion: 'Que la cotización siga vigente, que acepte devoluciones y que pida poco o nada de anticipo.' },
  calificacion: { label: 'Calificación del proveedor', explicacion: 'Qué tan bien nos ha ido antes con ese proveedor (1 a 5 estrellas).' },
}

/** Completa y sanea los pesos leídos de la configuración (números ≥ 0; si vienen vacíos o en cero, los de fábrica). */
export function normalizarPesos(raw) {
  const out = { ...PESOS_DEFAULT }
  if (raw && typeof raw === 'object') {
    for (const k of CRITERIOS_ORDEN) {
      const v = Number(raw[k])
      if (raw[k] !== undefined && Number.isFinite(v) && v >= 0) out[k] = v
    }
  }
  return CRITERIOS_ORDEN.some((k) => out[k] > 0) ? out : { ...PESOS_DEFAULT }
}

export function sumaPesos(p) {
  return CRITERIOS_ORDEN.reduce((s, k) => s + (Number(p[k]) || 0), 0)
}

// ---------------------------------------------------------------------------------------------------------------------
// Costo total comparable
// ---------------------------------------------------------------------------------------------------------------------
/** Redondeo a centavos tolerante al ruido binario (0.1 + 0.2, 1000.005 × 100). */
export function redondear2(n) {
  return Math.round(Number((n * 100).toFixed(6))) / 100
}

/**
 * @typedef {object} DesgloseTotal
 * @property {number} subtotal - Σ precio × cantidad.
 * @property {number} descuento - Descuento realmente aplicado (nunca mayor al subtotal).
 * @property {number} flete
 * @property {number} base - (subtotal − descuento + flete) antes de IVA.
 * @property {number} iva - IVA sumado (0 si los precios ya lo traen incluido).
 * @property {boolean} ivaIncluido
 * @property {number} total - Costo total comparable.
 */

export function totalComparableDe(
  subtotal,
  c,
  ivaPct = IVA_DEFAULT,
  /** La cotización aún no tiene NINGÚN precio: el total es 0 aunque traiga flete (igual que la base). */
  sinPrecios = false,
) {
  const sub = Number.isFinite(subtotal) ? subtotal : 0
  if (sinPrecios) return { subtotal: 0, descuento: 0, flete: 0, base: 0, iva: 0, ivaIncluido: c.ivaIncluido !== false, total: 0 }
  const descuento = Math.min(Math.max(Number(c.descuentoMonto) || 0, 0), Math.max(sub, 0))
  const flete = Math.max(Number(c.flete) || 0, 0)
  const ivaIncluido = c.ivaIncluido !== false
  const base = sub - descuento + flete
  const total = redondear2(ivaIncluido ? base : base * (1 + ivaPct / 100))
  const baseR = redondear2(base)
  return { subtotal: redondear2(sub), descuento: redondear2(descuento), flete: redondear2(flete), base: baseR, iva: ivaIncluido ? 0 : redondear2(total - baseR), ivaIncluido, total }
}

// ---------------------------------------------------------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Extiende CriteriosCotizacion.
 * @typedef {object} EntradaAnalisis
 * @property {string} id
 * @property {string} proveedor
 * @property {number} subtotal - Σ precio × cantidad de las partidas con precio.
 * @property {boolean} completa - true si trae precio en TODAS las partidas (solo esas pueden elegirse).
 * @property {boolean} [sinPrecios] - true si no trae NINGÚN precio (su total es 0).
 */

/**
 * @typedef {'mas_barata' | 'recomendada' | 'mayor_garantia' | 'entrega_rapida' | 'mejor_credito' |
 *   'distribuidor' | 'mejor_calificacion'} InsigniaId
 */
/**
 * @typedef {object} Insignia
 * @property {InsigniaId} id
 * @property {string} label
 */
/** @typedef {'vencida' | 'anticipo' | 'sin_garantia' | 'sin_distribuidor' | 'datos_incompletos' | 'incompleta'} AlertaId */
/**
 * @typedef {object} AlertaCotizacion
 * @property {AlertaId} id
 * @property {string} label
 * @property {'danger' | 'warning' | 'neutral'} tono
 * @property {string} [detalle]
 */

/**
 * @typedef {object} AnalisisCotizacion
 * @property {string} id
 * @property {string} proveedor
 * @property {DesgloseTotal} desglose
 * @property {number} total - Costo total comparable.
 * @property {boolean} completa
 * @property {boolean} elegible - Puede ser la recomendada / elegida (completa y con total > 0).
 * @property {number} puntaje - 0-100 (un decimal).
 * @property {Record<CriterioId, number | null>} parciales - Puntaje parcial 0-100 por criterio (null = sin dato: no penaliza).
 * @property {CriterioId[]} faltantes - Criterios con peso que no traen dato (distintos del precio).
 * @property {boolean} esMasBarata
 * @property {boolean} esRecomendada
 * @property {number} posicion - Lugar entre las elegibles (1 = recomendada); 0 si no es elegible.
 * @property {number} diferencia - Diferencia contra la más barata elegible (≥ 0).
 * @property {Insignia[]} insignias
 * @property {string[]} razones - Por qué destaca ("Más barata", "Mayor garantía: 24 m", …).
 * @property {AlertaCotizacion[]} alertas
 */

/**
 * Ids de las cotizaciones con el mejor valor en cada criterio (solo si hay diferencia real entre las del grupo).
 * @typedef {Partial<Record<'total' | 'garantia' | 'entrega' | 'credito' | 'anticipo' | 'calificacion' |
 *   'puntaje', string[]>>} MejoresPor
 */

/**
 * @typedef {object} ResultadoAnalisis
 * @property {AnalisisCotizacion[]} filas
 * @property {string} [masBarataId]
 * @property {string} [recomendadaId]
 * @property {MejoresPor} mejores
 * @property {PesosCotizador} pesos
 * @property {number} ivaPct
 * @property {string} hoy
 */

/**
 * @typedef {object} OpcionesAnalisis
 * @property {PesosCotizador} [pesos]
 * @property {number} [ivaPct]
 * @property {string} [hoy] - AAAA-MM-DD contra el que se revisa la vigencia (por defecto, hoy en hora local).
 */

function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const tiene = (v) => v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v))
const numero = (v) => (tiene(v) && Number.isFinite(Number(v)) ? Number(v) : undefined)
const bool = (v) => (v === true || v === false ? v : undefined)

/** Meses de garantía efectivos (undefined = sin dato). 'ninguna' cuenta como 0. */
function mesesGarantia(e) {
  if (e.garantiaResponsable === 'ninguna') return 0
  return numero(e.garantiaMeses)
}

function distintos(valores) {
  return valores.length >= 2 && Math.max(...valores) - Math.min(...valores) > 1e-9
}

const textoDias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`

export function analizarCotizaciones(entradas, opts = {}) {
  const pesos = normalizarPesos(opts.pesos)
  const ivaPct = opts.ivaPct !== undefined && Number.isFinite(opts.ivaPct) && opts.ivaPct >= 0 ? opts.ivaPct : IVA_DEFAULT
  const hoy = opts.hoy ?? hoyLocal()

  const base = entradas.map((e) => {
    const desglose = totalComparableDe(e.subtotal, e, ivaPct, e.sinPrecios)
    return { e, desglose, elegible: e.completa && desglose.total > 0 }
  })
  const elegibles = base.filter((b) => b.elegible)

  // ---- Referencias del grupo --------------------------------------------------------------------------------------------
  const minTotal = elegibles.length ? Math.min(...elegibles.map((b) => b.desglose.total)) : undefined
  const esBarata = (b) => b.elegible && minTotal !== undefined && Math.abs(b.desglose.total - minTotal) < 0.005
  const masBarata = base.find(esBarata)

  const garantias = base.map((b) => mesesGarantia(b.e)).filter((x) => x !== undefined)
  const maxGarantia = garantias.length ? Math.max(...garantias) : 0
  const entregas = base.map((b) => numero(b.e.tiempoEntregaDias)).filter((x) => x !== undefined).map((d) => Math.max(d, 1))
  const minEntrega = entregas.length ? Math.min(...entregas) : undefined
  const creditos = base.map((b) => numero(b.e.diasCredito)).filter((x) => x !== undefined).map((d) => Math.min(Math.max(d, 0), TOPE_CREDITO_DIAS))
  const maxCredito = creditos.length ? Math.max(...creditos) : 0

  // ---- Puntajes ---------------------------------------------------------------------------------------------------------
  const calc = base.map((b) => {
    const e = b.e
    const parciales = { precio: null, garantia: null, entrega: null, credito: null, respaldo: null, condiciones: null, calificacion: null }
    if (b.elegible && minTotal !== undefined) parciales.precio = (minTotal / b.desglose.total) * 100

    const g = mesesGarantia(e)
    if (g !== undefined && maxGarantia > 0) parciales.garantia = (g / maxGarantia) * 100

    const d = numero(e.tiempoEntregaDias)
    if (d !== undefined && minEntrega !== undefined) parciales.entrega = (minEntrega / Math.max(d, 1)) * 100

    const c = numero(e.diasCredito)
    if (c !== undefined && maxCredito > 0) parciales.credito = (Math.min(Math.max(c, 0), TOPE_CREDITO_DIAS) / maxCredito) * 100

    const dist = bool(e.distribuidorAutorizado)
    const sop = bool(e.soporteTecnico)
    if (dist !== undefined || sop !== undefined) {
      const conocido = (dist !== undefined ? 60 : 0) + (sop !== undefined ? 40 : 0)
      parciales.respaldo = (((dist ? 60 : 0) + (sop ? 40 : 0)) / conocido) * 100
    }

    const sub = []
    if (typeof e.vigenciaHasta === 'string' && e.vigenciaHasta) sub.push(e.vigenciaHasta >= hoy ? 1 : 0)
    const dev = bool(e.aceptaDevoluciones)
    if (dev !== undefined) sub.push(dev ? 1 : 0)
    const ant = numero(e.anticipoPct)
    if (ant !== undefined) sub.push(Math.max(0, 1 - Math.min(Math.max(ant, 0), ANTICIPO_CERO_PCT) / ANTICIPO_CERO_PCT))
    if (sub.length) parciales.condiciones = (sub.reduce((s, x) => s + x, 0) / sub.length) * 100

    const cal = numero(e.calificacionProveedor)
    if (cal !== undefined) parciales.calificacion = (Math.min(Math.max(cal, 0), 5) / 5) * 100

    let num = 0
    let den = 0
    for (const k of CRITERIOS_ORDEN) {
      const p = parciales[k]
      if (p !== null && pesos[k] > 0) {
        num += pesos[k] * p
        den += pesos[k]
      }
    }
    const puntaje = den > 0 ? Math.round((num / den) * 100) / 100 : 0
    const faltantes = CRITERIOS_ORDEN.filter((k) => k !== 'precio' && pesos[k] > 0 && parciales[k] === null && !(['garantia', 'credito'].includes(k) && sinDiferencia(k, e)))
    return { ...b, parciales, puntaje, faltantes }
  })

  /** Garantía / crédito con dato pero sin diferenciar al grupo (nadie la ofrece): el parcial es null, pero NO es un dato faltante. */
  function sinDiferencia(k, e) {
    if (k === 'garantia') return mesesGarantia(e) !== undefined && maxGarantia <= 0
    if (k === 'credito') return numero(e.diasCredito) !== undefined && maxCredito <= 0
    return false
  }

  // ---- Ranking (solo elegibles) -----------------------------------------------------------------------------------------
  const orden = calc
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.elegible)
    .sort((a, b) => {
      if (b.c.puntaje !== a.c.puntaje) return b.c.puntaje - a.c.puntaje
      if (a.c.desglose.total !== b.c.desglose.total) return a.c.desglose.total - b.c.desglose.total
      const ea = numero(a.c.e.tiempoEntregaDias) ?? Infinity
      const eb = numero(b.c.e.tiempoEntregaDias) ?? Infinity
      if (ea !== eb) return ea - eb
      return a.i - b.i
    })
  const recomendada = orden[0]?.c
  const posicion = new Map(orden.map((x, n) => [x.c.e.id, n + 1]))

  // ---- Mejores por criterio (resaltado) ---------------------------------------------------------------------------------
  const mejores = {}
  if (elegibles.length >= 2 && distintos(elegibles.map((b) => b.desglose.total))) mejores.total = elegibles.filter(esBarata).map((b) => b.e.id)
  const mejorDe = (extraer, mayor) => {
    const con = base.map((b) => ({ id: b.e.id, v: extraer(b.e) })).filter((x) => x.v !== undefined)
    if (!distintos(con.map((x) => x.v))) return undefined
    const m = mayor ? Math.max(...con.map((x) => x.v)) : Math.min(...con.map((x) => x.v))
    return con.filter((x) => Math.abs(x.v - m) < 1e-9).map((x) => x.id)
  }
  mejores.garantia = mejorDe(mesesGarantia, true)
  mejores.entrega = mejorDe((e) => numero(e.tiempoEntregaDias), false)
  mejores.credito = mejorDe((e) => numero(e.diasCredito), true)
  mejores.anticipo = mejorDe((e) => numero(e.anticipoPct), false)
  mejores.calificacion = mejorDe((e) => numero(e.calificacionProveedor), true)
  if (orden.length >= 2 && distintos(orden.map((x) => x.c.puntaje))) mejores.puntaje = orden.filter((x) => x.c.puntaje === orden[0].c.puntaje).map((x) => x.c.e.id)
  for (const k of Object.keys(mejores)) if (!mejores[k]) delete mejores[k]

  // ---- Salida por cotización --------------------------------------------------------------------------------------------
  const filas = calc.map((c) => {
    const e = c.e
    const esMasBarata = esBarata(c)
    const esRecomendada = recomendada?.e.id === e.id
    const diferencia = c.elegible && minTotal !== undefined ? redondear2(c.desglose.total - minTotal) : 0
    const razones = []
    const insignias = []
    const gana = (k) => !!mejores[k]?.includes(e.id)

    if (esRecomendada) insignias.push({ id: 'recomendada', label: 'Recomendada' })
    if (esMasBarata && elegibles.length >= 2) {
      insignias.push({ id: 'mas_barata', label: 'Más barata' })
      razones.push('Más barata')
    } else if (c.elegible && minTotal !== undefined && elegibles.length >= 2 && esRecomendada) {
      razones.push(`Solo ${Math.round((diferencia / minTotal) * 1000) / 10} % más cara que la más barata`)
    }
    const g = mesesGarantia(e)
    if (gana('garantia') && g) {
      insignias.push({ id: 'mayor_garantia', label: 'Mayor garantía' })
      razones.push(`Mayor garantía: ${g} m`)
    }
    if (gana('entrega')) {
      insignias.push({ id: 'entrega_rapida', label: 'Entrega más rápida' })
      razones.push(`Entrega más rápida: ${textoDias(numero(e.tiempoEntregaDias))}`)
    }
    const cr = numero(e.diasCredito)
    if (cr && cr > 0 && (gana('credito') || !mejores.credito)) {
      if (gana('credito')) insignias.push({ id: 'mejor_credito', label: 'Mejor crédito' })
      razones.push(`Crédito a ${cr} días`)
    }
    if (e.distribuidorAutorizado === true) {
      razones.push('Distribuidor autorizado')
      if (esRecomendada) insignias.push({ id: 'distribuidor', label: 'Distribuidor autorizado' })
    }
    if (e.soporteTecnico === true && e.distribuidorAutorizado !== true) razones.push('Con soporte técnico')
    const cal = numero(e.calificacionProveedor)
    if (cal !== undefined && cal >= 4 && gana('calificacion')) {
      insignias.push({ id: 'mejor_calificacion', label: 'Mejor calificación' })
      razones.push(`Calificación del proveedor: ${cal}/5`)
    }

    const alertas = []
    if (!e.completa) alertas.push({ id: 'incompleta', label: 'Faltan precios', tono: 'warning', detalle: 'No trae precio en todas las partidas: no puede recomendarse ni elegirse.' })
    if (typeof e.vigenciaHasta === 'string' && e.vigenciaHasta && e.vigenciaHasta < hoy) alertas.push({ id: 'vencida', label: 'Cotización vencida', tono: 'danger', detalle: `Venció el ${e.vigenciaHasta}.` })
    const ant = numero(e.anticipoPct)
    if (ant !== undefined && ant >= ANTICIPO_ALERTA_PCT) alertas.push({ id: 'anticipo', label: `Pide ${ant}% de anticipo`, tono: ant >= ANTICIPO_CERO_PCT ? 'danger' : 'warning', detalle: 'Anticipo alto: hay riesgo si el proveedor no entrega.' })
    if (e.garantiaResponsable === 'ninguna' || g === 0) alertas.push({ id: 'sin_garantia', label: 'Sin garantía', tono: 'warning' })
    if (e.distribuidorAutorizado === false) alertas.push({ id: 'sin_distribuidor', label: 'Sin distribuidor autorizado', tono: 'warning', detalle: 'No es distribuidor autorizado de la marca.' })
    if (c.faltantes.length) alertas.push({ id: 'datos_incompletos', label: 'Datos incompletos', tono: 'neutral', detalle: `Falta: ${c.faltantes.map((k) => CRITERIOS_INFO[k].label.toLowerCase()).join(', ')}. Esos criterios no cuentan en el puntaje.` })

    return {
      id: e.id,
      proveedor: e.proveedor,
      desglose: c.desglose,
      total: c.desglose.total,
      completa: e.completa,
      elegible: c.elegible,
      puntaje: Math.round(c.puntaje * 10) / 10,
      parciales: c.parciales,
      faltantes: c.faltantes,
      esMasBarata,
      esRecomendada,
      posicion: posicion.get(e.id) ?? 0,
      diferencia,
      insignias,
      razones,
      alertas,
    }
  })

  return { filas, masBarataId: masBarata?.e.id, recomendadaId: recomendada?.e.id, mejores, pesos, ivaPct, hoy }
}

/** Texto corto de "por qué" (para justificar una elección o mostrar en el correo). */
export function textoRazones(a) {
  return a.razones.length ? `${a.razones.join('; ')} (puntaje ${a.puntaje}/100)` : `Mejor puntaje del comparativo (${a.puntaje}/100)`
}

// ---------------------------------------------------------------------------------------------------------------------
// Elección: ¿hace falta justificar?
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {object} EvaluacionEleccion
 * @property {boolean} esMasBarata - La elegida es (empata con) la más barata entre las completas.
 * @property {boolean} esRecomendada - La elegida es la recomendada por el comparativo.
 * @property {boolean} requiereJustificacion - Si no es la más barata o no es la recomendada, la justificación es obligatoria.
 * @property {string} [motivo] - UN solo mensaje claro (no se duplican avisos) que explica por qué hace falta.
 * @property {string} [sugerencia] - Texto sugerido para la justificación cuando la elegida es la recomendada pero no la más barata.
 */

const moneda = (n) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Regla de elección (misma en el cotizador, en `elegirProveedor` y en las pruebas): la elegida debe ser la más barata Y la recomendada; si no
 * lo es, se exige justificación con un solo aviso que dice cuál de las dos reglas no cumple.
 */
export function evaluarEleccion(res, id) {
  const f = res.filas.find((x) => x.id === id)
  const barata = res.filas.find((x) => x.id === res.masBarataId)
  const rec = res.filas.find((x) => x.id === res.recomendadaId)
  if (!f || !f.elegible) return { esMasBarata: false, esRecomendada: false, requiereJustificacion: false }
  const noBarata = !!barata && f.total - barata.total > 0.005
  const noRec = !!rec && rec.id !== f.id
  const dif = barata ? moneda(f.total - barata.total) : ''
  let motivo
  if (noBarata && noRec) {
    motivo =
      barata && rec && barata.id === rec.id
        ? `«${f.proveedor}» no es la más barata ni la recomendada: «${rec.proveedor}» es ambas (${dif} menos). Escribe la justificación de la elección.`
        : `«${f.proveedor}» no es la más barata (${dif} más que «${barata.proveedor}») ni la recomendada («${rec.proveedor}»). Escribe la justificación de la elección.`
  } else if (noBarata) {
    motivo = `«${f.proveedor}» no es la más barata (${dif} más que «${barata.proveedor}»), aunque es la recomendada por el comparativo. Escribe la justificación de la elección.`
  } else if (noRec) {
    motivo = `«${f.proveedor}» es la más barata, pero el comparativo recomienda a «${rec.proveedor}» (${textoRazones(rec)}). Escribe la justificación de la elección.`
  }
  return {
    esMasBarata: !noBarata,
    esRecomendada: !noRec,
    requiereJustificacion: noBarata || noRec,
    motivo,
    sugerencia: noBarata && !noRec ? `Recomendada por el comparativo: ${textoRazones(f)}.` : undefined,
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Textos cortos de los criterios (hoja, correo y liga de aprobación muestran lo mismo)
// ---------------------------------------------------------------------------------------------------------------------
/** @typedef {CriteriosCotizacion | undefined} Dato */

export function textoGarantia(c) {
  if (!c) return '—'
  if (c.garantiaResponsable === 'ninguna') return 'Sin garantía'
  if (c.garantiaMeses === undefined || c.garantiaMeses === null) return '—'
  const quien = c.garantiaResponsable === 'fabricante' ? ' (fabricante)' : c.garantiaResponsable === 'proveedor' ? ' (proveedor)' : ''
  return `${c.garantiaMeses} ${c.garantiaMeses === 1 ? 'mes' : 'meses'}${quien}`
}
export function textoCredito(c) {
  if (!c || c.diasCredito === undefined || c.diasCredito === null) return '—'
  return c.diasCredito === 0 ? 'Contado' : `${c.diasCredito} días`
}
export function textoAnticipo(c) {
  return !c || c.anticipoPct === undefined || c.anticipoPct === null ? '—' : c.anticipoPct === 0 ? 'Sin anticipo' : `${c.anticipoPct}%`
}
export function textoEntrega(c) {
  return !c || c.tiempoEntregaDias === undefined || c.tiempoEntregaDias === null ? '—' : c.tiempoEntregaDias === 0 ? 'Inmediata' : `${c.tiempoEntregaDias} ${c.tiempoEntregaDias === 1 ? 'día' : 'días'}`
}
export function textoSiNo(v) {
  return v === true ? 'Sí' : v === false ? 'No' : '—'
}
