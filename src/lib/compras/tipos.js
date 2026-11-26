/**
 * Compras Indirectas · tipos, estados, tabla de transiciones y rutas.
 * Todo el módulo respeta lo que ya operaba Finanzas (folio REQ-AAAAMMDD-HHMMSS, 8 categorías, estatus numerados)
 * y añade control: nada se borra (se cancela/desactiva), todo cambio queda en historial append-only.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {'recibida' | 'en_cotizacion' | 'en_autorizacion' | 'autorizada' | 'fondeada' | 'comprada' |
 *   'entregada' | 'en_espera' | 'rechazada' | 'cancelada'} EstadoReq
 */

/** @typedef {'info' | 'warn' | 'ok' | 'danger' | 'muted'} TonoEstado */

/**
 * @typedef {object} EstadoInfo
 * @property {EstadoReq} id
 * @property {string} label - Etiqueta completa (respeta los textos de Finanzas: "1. Recibida / Por validar", "2. En firma / autorización").
 * @property {string} corta - Etiqueta corta para chips y tablas.
 * @property {number} [numero] - Numeración que ya usaba Finanzas (solo 1 y 2); el resto no tiene número oficial.
 * @property {number} [paso] - Posición en el flujo principal (1-7); los laterales (en_espera, rechazada, cancelada) no tienen.
 * @property {boolean} lateral
 * @property {boolean} terminal
 * @property {TonoEstado} tono
 * @property {string} color - Color de texto/borde (hex; sirve también en correos).
 * @property {string} fondo - Color de fondo suave (hex).
 * @property {string} descripcion
 */

export const ESTADOS = {
  recibida: {
    id: 'recibida', label: '1. Recibida / Por validar', corta: 'Recibida', numero: 1, paso: 1, lateral: false, terminal: false,
    tono: 'info', color: '#1f5fae', fondo: '#e8f0fb', descripcion: 'El solicitante la levantó; Adquisiciones la valida y empieza a cotizar.',
  },
  en_cotizacion: {
    id: 'en_cotizacion', label: 'En cotización', corta: 'Cotizando', paso: 2, lateral: false, terminal: false,
    tono: 'info', color: '#0e7490', fondo: '#e0f4f8', descripcion: 'Adquisiciones compara proveedores y elige el ganador.',
  },
  en_autorizacion: {
    id: 'en_autorizacion', label: '2. En firma / autorización', corta: 'En autorización', numero: 2, paso: 3, lateral: false, terminal: false,
    tono: 'warn', color: '#b45309', fondo: '#fdf1dc', descripcion: 'Finanzas decide (basta un aprobador cuyo tope cubra el monto). Si la compra pasa del umbral, Dirección solo recibe un aviso.',
  },
  autorizada: {
    id: 'autorizada', label: 'Autorizada (por fondear)', corta: 'Autorizada', paso: 4, lateral: false, terminal: false,
    tono: 'ok', color: '#15803d', fondo: '#e3f5e9', descripcion: 'Autorizada; Tesorería entrega el efectivo, o Cuentas por pagar paga la transferencia / tarjeta.',
  },
  fondeada: {
    id: 'fondeada', label: 'Fondeada (dinero entregado)', corta: 'Fondeada', paso: 5, lateral: false, terminal: false,
    tono: 'ok', color: '#047857', fondo: '#dcf3ea', descripcion: 'Se entregó el dinero (efectivo de Tesorería) o se registró el pago (Cuentas por pagar); Adquisiciones ya puede comprar.',
  },
  comprada: {
    id: 'comprada', label: 'Comprada', corta: 'Comprada', paso: 6, lateral: false, terminal: false,
    tono: 'ok', color: '#6d28d9', fondo: '#efe8fb', descripcion: 'Adquisiciones compró y registró costos reales y comprobantes; falta que el solicitante confirme.',
  },
  entregada: {
    id: 'entregada', label: 'Comprada y entregada', corta: 'Entregada', paso: 7, lateral: false, terminal: true,
    tono: 'ok', color: '#166534', fondo: '#d9f2e0', descripcion: 'El solicitante confirmó que recibió. Proceso cerrado.',
  },
  en_espera: {
    id: 'en_espera', label: 'En espera', corta: 'En espera', lateral: true, terminal: false,
    tono: 'muted', color: '#4b5563', fondo: '#eceef2', descripcion: 'Detenida con un motivo; se puede reanudar donde se quedó.',
  },
  rechazada: {
    id: 'rechazada', label: 'Rechazada', corta: 'Rechazada', lateral: true, terminal: true,
    tono: 'danger', color: '#b42318', fondo: '#fde8e6', descripcion: 'No fue autorizada (con motivo). Si aún se necesita, se levanta una nueva.',
  },
  cancelada: {
    id: 'cancelada', label: 'Cancelada', corta: 'Cancelada', lateral: true, terminal: true,
    tono: 'muted', color: '#6b7280', fondo: '#eceef2', descripcion: 'Cancelada con un motivo. Nada se borra: queda en el historial.',
  },
}

/** Flujo principal en orden (útil para barras de progreso / línea de tiempo). */
export const ESTADOS_FLUJO = ['recibida', 'en_cotizacion', 'en_autorizacion', 'autorizada', 'fondeada', 'comprada', 'entregada']
export const ESTADOS_LATERALES = ['en_espera', 'rechazada', 'cancelada']
export const ESTADOS_TODOS = [...ESTADOS_FLUJO, ...ESTADOS_LATERALES]

/**
 * Transiciones legales. Idéntica a `cmp_transicion_valida` en supabase/migrations/013_compras.sql
 * (si se cambia una, cambiar la otra).
 */
export const ESTADOS_TRANSICIONES = {
  recibida: ['en_cotizacion', 'en_espera', 'cancelada'],
  en_cotizacion: ['en_autorizacion', 'en_espera', 'cancelada'],
  en_autorizacion: ['autorizada', 'rechazada', 'en_cotizacion', 'en_espera', 'cancelada'],
  autorizada: ['fondeada', 'en_espera', 'cancelada'],
  fondeada: ['comprada', 'en_espera', 'cancelada'],
  comprada: ['entregada', 'cancelada'],
  entregada: [],
  en_espera: ['recibida', 'en_cotizacion', 'en_autorizacion', 'autorizada', 'fondeada', 'cancelada', 'rechazada'],
  rechazada: [],
  cancelada: [],
}

/** Estados que exigen un comentario/motivo al entrar (también lo exige el trigger de la base). */
export const ESTADOS_CON_COMENTARIO = ['rechazada', 'cancelada', 'en_espera']

/** Qué rol puede llevar una requisición a cada estado (separación de funciones; espejo de `cmp_rol_puede_estado`). */
export const ROLES_POR_ESTADO = {
  recibida: ['admin', 'adquisiciones'],
  en_cotizacion: ['admin', 'adquisiciones', 'finanzas'],
  en_autorizacion: ['admin', 'adquisiciones'],
  autorizada: ['admin', 'finanzas'],
  rechazada: ['admin', 'finanzas'],
  fondeada: ['admin', 'tesoreria', 'cuentas_por_pagar'],
  comprada: ['admin', 'adquisiciones'],
  entregada: ['admin', 'adquisiciones', 'capturista', 'mantenimiento'],
  en_espera: ['admin', 'adquisiciones', 'finanzas'],
  cancelada: ['admin', 'adquisiciones', 'finanzas'],
}

export function puedeTransicionar(de, a) {
  return ESTADOS_TRANSICIONES[de]?.includes(a) ?? false
}
export function esTerminal(e) {
  return ESTADOS[e].terminal
}
export function esAbierta(e) {
  return !ESTADOS[e].terminal
}
export function rolPuedeEstado(rol, a) {
  return ROLES_POR_ESTADO[a].includes(rol)
}

// ---------------------------------------------------------------------------------------------------------------------
// Directorio, catálogo, configuración
// ---------------------------------------------------------------------------------------------------------------------
/**
 * EN DESUSO (migración 022): los CEOs salieron del flujo. Se conserva solo por compatibilidad con datos viejos.
 * @typedef {'solicitante' | 'comprador' | 'finanzas' | 'tesoreria' | 'cuentas_por_pagar' | 'direccion' | 'ceo' | 'talento' |
 *   'auditor' | 'infraestructura' | 'mantenimiento'} RolParticipante
 */

export const ROLES_PARTICIPANTE = [
  { id: 'solicitante', label: 'Solicitante' },
  { id: 'comprador', label: 'Comprador (Adquisiciones)' },
  { id: 'finanzas', label: 'Finanzas (aprueba, con tope opcional)' },
  { id: 'tesoreria', label: 'Tesorería (efectivo / caja chica)' },
  { id: 'cuentas_por_pagar', label: 'Cuentas por pagar (transferencias y tarjeta)' },
  { id: 'direccion', label: 'Dirección (recibe aviso de compras grandes)' },
  { id: 'talento', label: 'Talento' },
  { id: 'auditor', label: 'Auditor' },
  { id: 'infraestructura', label: 'Infraestructura y Soporte (custodio TI)' },
  { id: 'mantenimiento', label: 'Mantenimiento (custodio)' },
]

/**
 * @typedef {object} Participante
 * @property {string} id
 * @property {string} nombre
 * @property {string} correo
 * @property {string} [area]
 * @property {string} [ubicacionId]
 * @property {string} [puesto]
 * @property {RolParticipante[]} roles
 * @property {number | null} [topeAprobacion] - Tope de aprobación (MXN, inclusive) de un aprobador de Finanzas. undefined = SIN tope (aprueba cualquier monto). Solo lo asigna Dirección. Elegible para un monto M = sin tope o M <= tope (ver `topeCubre` / `esAprobadorElegible`).
 * @property {boolean} activo
 * @property {string} [motivoBaja] - Desactivación (nunca se borra): por qué, quién y cuándo.
 * @property {string} [bajaPor]
 * @property {number} [bajaAt]
 * @property {number} createdAt
 */

/** @typedef {'ti' | 'mantenimiento' | 'ninguno'} DestinoInventario */

/**
 * @typedef {object} CategoriaCompra
 * @property {string} id
 * @property {string} nombre
 * @property {DestinoInventario} destinoInventario
 * @property {number} orden
 * @property {boolean} activo
 */

/**
 * @typedef {object} ProductoCatalogo
 * @property {string} id
 * @property {string} categoriaId
 * @property {string} producto
 * @property {string} [unidad]
 * @property {string} [proveedorSugerido]
 * @property {number} [costoReferencia]
 * @property {boolean} activo
 */

/**
 * @typedef {object} ConfigCompras
 * @property {number} umbralCotizacionSimple - Compras con monto MENOR a este valor (MXN, default 1,000) basta 1 cotización; a partir de él (>=) se exigen `cotizacionesMinimas` de proveedores distintos, salvo excepción documentada.
 * @property {number} umbralSinCotizacion - Compras con monto ESTRICTAMENTE MENOR a este valor (MXN, default 100) no requieren cotización: solo el registro (proveedor y precio); siguen requiriendo autorización de Finanzas (cmp_config 'umbral_sin_cotizacion').
 * @property {number} umbralDireccion - AVISO a Dirección: por encima de este monto Dirección recibe un correo informativo (no aprueba). Confirmado por Finanzas: 50,000.
 * @property {number} umbralCeo - EN DESUSO (migración 022): los CEOs ya no participan. Se conserva el valor por compatibilidad.
 * @property {number} cotizacionesMinimas - Cotizaciones de proveedores DISTINTOS que se exigen a partir del umbral simple (default 3), salvo excepción documentada (con ella basta 1).
 * @property {string[]} copiasRespaldo - Correos que reciben copia de respaldo de los correos (sin ligas de aprobación).
 * @property {number} toleranciaDiferenciaPct - Tolerancia (%) entre lo comprado y lo autorizado antes de exigir re-aprobación/justificación.
 * @property {number} diasExpiraToken - Vigencia (días) de las ligas de aprobación por correo.
 * @property {string} urlBase - URL pública de la app para las ligas de los correos ('' = usar el origen actual).
 * @property {number} ivaPct - Tasa de IVA (%) para normalizar cotizaciones sin IVA incluido (cmp_config 'iva_pct').
 * @property {PesosCotizador} cotizadorPesos - Pesos del puntaje del cotizador; suman 100 (cmp_config 'cotizador_pesos').
 */

// ---------------------------------------------------------------------------------------------------------------------
// Requisición y partidas
// ---------------------------------------------------------------------------------------------------------------------
/** @typedef {'normal' | 'urgente'} Urgencia */
/** @typedef {'efectivo' | 'transferencia' | 'tarjeta'} FormaPago */
/** @typedef {'remision' | 'factura'} TipoProveedor */
/** @typedef {'tesoreria' | 'cuentas_por_pagar'} DestinoPago */

/** Etiqueta de cada forma de pago de la compra. */
export const FORMA_PAGO_LABEL = { efectivo: 'Efectivo (caja chica)', transferencia: 'Transferencia', tarjeta: 'Tarjeta' }
/** Etiqueta de cada tipo de proveedor. */
export const TIPO_PROVEEDOR_LABEL = { remision: 'Remisión (efectivo)', factura: 'Factura' }
export const DESTINO_PAGO_LABEL = { tesoreria: 'Tesorería', cuentas_por_pagar: 'Cuentas por pagar' }

/**
 * Ruteo del pago: efectivo → Tesorería (caja chica); transferencia o tarjeta → Cuentas por pagar. Una requisición vieja sin forma de pago
 * se trata como efectivo (el flujo de antes).
 * @param {FormaPago | undefined} formaPago
 * @returns {DestinoPago}
 */
export function destinoDePago(formaPago) {
  return formaPago === 'transferencia' || formaPago === 'tarjeta' ? 'cuentas_por_pagar' : 'tesoreria'
}

/**
 * Proveedor del catálogo (tabla `cmp_proveedores`). Solo se registra el proveedor ELEGIDO para una compra; nada se borra: se da de baja con motivo.
 * @typedef {object} Proveedor
 * @property {string} id - `prv-…` generado por el cliente.
 * @property {string} nombreComercial - El nombre con que se cotizó.
 * @property {string} [razonSocial]
 * @property {TipoProveedor} tipo - remision (se paga en efectivo) o factura.
 * @property {FormaPago} formaPago - Forma habitual: remision ⇒ efectivo; factura ⇒ transferencia o tarjeta.
 * @property {string} [rfc] - 12 o 13 caracteres en mayúsculas; único entre proveedores.
 * @property {string} [clabe] - 18 dígitos con dígito verificador (obligatoria solo para factura con transferencia).
 * @property {string} [direccionFiscal]
 * @property {string} [cp] - 5 dígitos.
 * @property {string} [notas]
 * @property {boolean} activo
 * @property {string} [motivoBaja] - Obligatorio cuando activo = false.
 * @property {string} [creadoPor]
 * @property {string} [actualizadoPor]
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {object} ProveedorSugerido
 * @property {string} empresa
 * @property {string} [contacto]
 * @property {string} [telefono]
 * @property {string} [direccion]
 */

/**
 * @typedef {object} Requisicion
 * @property {string} folio - REQ-AAAAMMDD-HHMMSS (clave primaria).
 * @property {string} solicitanteId
 * @property {string} solicitanteNombre
 * @property {string} solicitanteCorreo
 * @property {string} [area]
 * @property {string[]} ubicaciones - ids de inv_ubicaciones (lista cerrada).
 * @property {string} [paraQuien]
 * @property {Urgencia} urgencia
 * @property {string} [fechaRequerida] - AAAA-MM-DD
 * @property {EstadoReq} estado
 * @property {string} token - Token de la liga de seguimiento/confirmación (sin login).
 * @property {ProveedorSugerido[]} proveedoresSugeridos
 * @property {string} [notas]
 * @property {number} [montoAutorizado]
 * @property {string} [proveedorElegido] - Nombre del proveedor elegido (se sincroniza con `nombreComercial` del catálogo).
 * @property {string} [proveedorId] - Proveedor del catálogo (`cmp_proveedores.id`) elegido para la compra; sin él no se puede pedir la autorización. Desde «autorizada» ya no cambia.
 * @property {FormaPago} formaPago - efectivo → Tesorería; transferencia / tarjeta → Cuentas por pagar. Desde «autorizada» ya no cambia.
 * @property {boolean} requiereDireccion - Desde 022 significa «se avisó a Dirección» (monto > umbral de aviso). Ya no condiciona ninguna transición.
 * @property {boolean} requiereCeo - EN DESUSO (022): los CEOs salieron del flujo; siempre false en datos nuevos.
 * @property {string} [familiaGasto]
 * @property {string} [folioCajaChica]
 * @property {string} [receptorEfectivo]
 * @property {ExcepcionTipo} [excepcionTipo] - Tipo de excepción de cotizaciones (monto >= umbral simple con menos de N cotizaciones de proveedores distintos). Congelada desde «en autorización».
 * @property {InstruidaPor} [excepcionInstruidaPor] - Quién instruyó la adjudicación directa (solo con `adjudicacion_directa`).
 * @property {string} [excepcionCotizaciones] - Justificación escrita de la excepción (mínimo 15 caracteres).
 * @property {string} [justificacionDiferencia] - Justificación cuando lo comprado rebasó lo autorizado.
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {object} Partida
 * @property {string} id - `${folio}-P${num}`
 * @property {string} folio
 * @property {number} num
 * @property {string} categoriaId
 * @property {string} producto
 * @property {number} cantidad
 * @property {string} [descripcion]
 * @property {string} [modeloMarca]
 * @property {string} [comentario]
 * @property {string} [imagenUrl]
 * @property {Record<string, number>} distribucion - Reparto de la cantidad por sucursal: { ubicacionId: cantidad }.
 */

/**
 * @typedef {object} HistorialEstado
 * @property {string} id
 * @property {string} folio
 * @property {EstadoReq} [deEstado]
 * @property {EstadoReq} aEstado
 * @property {string} [usuario]
 * @property {string} [comentario]
 * @property {number} fecha
 */

// ---------------------------------------------------------------------------------------------------------------------
// Cotizaciones, aprobaciones, dinero, compras, recepciones, correos
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Quién responde por la garantía de lo cotizado.
 * @typedef {'proveedor' | 'fabricante' | 'ninguna'} GarantiaResponsable
 */

/**
 * Criterios de comparación de una cotización (todos opcionales: sin dato = no penaliza). Ver COMPRAS_INDIRECTAS.md.
 * Precio: descuentoMonto, flete, ivaIncluido · Entrega: tiempoEntregaDias · Garantía: garantiaMeses, garantiaResponsable ·
 * Pago: diasCredito (0 = contado), anticipoPct · Marca: distribuidorAutorizado, soporteTecnico · Condiciones: vigenciaHasta, aceptaDevoluciones ·
 * Historial: calificacionProveedor (1 a 5).
 * @typedef {object} CriteriosCotizacion
 * @property {number} [descuentoMonto] - Descuento en pesos (volumen / pronto pago).
 * @property {number} [flete] - Flete / envío en pesos.
 * @property {boolean} [ivaIncluido] - false = los precios NO traen IVA: el comparativo suma el IVA para comparar manzanas con manzanas. Por defecto true.
 * @property {number} [tiempoEntregaDias]
 * @property {number} [garantiaMeses]
 * @property {GarantiaResponsable} [garantiaResponsable]
 * @property {number} [diasCredito] - Días de crédito (0 = contado).
 * @property {number} [anticipoPct] - Anticipo que pide el proveedor (0-100).
 * @property {boolean} [distribuidorAutorizado]
 * @property {boolean} [soporteTecnico]
 * @property {string} [vigenciaHasta] - AAAA-MM-DD: hasta cuándo respeta el precio.
 * @property {boolean} [aceptaDevoluciones]
 * @property {number} [calificacionProveedor] - Experiencia previa con el proveedor (1 a 5).
 */

/**
 * Pesos del puntaje (suman 100).
 * @typedef {object} PesosCotizador
 * @property {number} precio
 * @property {number} garantia
 * @property {number} entrega
 * @property {number} credito
 * @property {number} respaldo
 * @property {number} condiciones
 * @property {number} calificacion
 */

/**
 * Extiende CriteriosCotizacion.
 * @typedef {object} Cotizacion
 * @property {string} id
 * @property {string} folio
 * @property {string} proveedor
 * @property {string} [contacto]
 * @property {string} [telefono]
 * @property {string} [direccion]
 * @property {string} [calidad] - Notas libres (antes: calidad / marca ofrecida).
 * @property {string} [condiciones] - Notas libres (antes: condiciones de pago / envío).
 * @property {string} [archivoUrl]
 * @property {boolean} elegida
 * @property {boolean} [esRegistro] - true = REGISTRO de compra menor (< umbralSinCotizacion): solo proveedor y precio, sin criterios, comparativo ni justificación; se elige sola (cmp_cotizaciones.es_registro).
 * @property {string} [justificacion]
 * @property {string} [registradoPor]
 * @property {boolean} activo - false = descartada (no se borra).
 * @property {number} createdAt
 */

/**
 * @typedef {object} CotizacionItem
 * @property {string} id - `${cotizacionId}:${partidaId}` (clave local; en la base la clave es compuesta).
 * @property {string} cotizacionId
 * @property {string} partidaId
 * @property {number} precioUnitario
 */

/**
 * Niveles de autorización. Desde la migración 022 SOLO decide `finanzas`; `direccion` y `ceo` existen únicamente para leer
 * el historial de la cadena de tres niveles (019): ningún flujo nuevo los usa ni la base permite registrarlos.
 * @typedef {'finanzas' | 'direccion' | 'ceo'} NivelAprobacion
 */
/** Niveles que deciden HOY (un solo nivel de decisión: Finanzas). */
export const ORDEN_NIVELES = ['finanzas']
/** Nombre corto del nivel (chips, tablas, historial; los niveles viejos se marcan como históricos). */
export const NIVEL_LABEL = { finanzas: 'Finanzas', direccion: 'Dirección (histórico)', ceo: 'CEOs (histórico)' }
/** Nombre del nivel dentro de una frase. */
export const NIVEL_LABEL_FRASE = { finanzas: 'Finanzas', direccion: 'Dirección', ceo: 'los CEOs' }

/** ¿Un tope cubre el monto? Sin tope (undefined/null) cubre cualquiera. Inclusive, a centavos: 10,000.00 sí, 10,000.01 no (tope 10,000). */
export function topeCubre(tope, monto) {
  if (tope === undefined || tope === null) return true
  return Math.round((monto + Number.EPSILON) * 100) <= Math.round((tope + Number.EPSILON) * 100)
}

/** Aprobador ELEGIBLE para un monto: participante activo con rol finanzas cuyo tope cubre el monto (sin tope = cualquier monto). */
export function esAprobadorElegible(p, monto) {
  return !!p && p.activo && p.roles.includes('finanzas') && topeCubre(p.topeAprobacion, monto)
}

/** Mensaje cuando ningún aprobador cubre el monto (el mismo texto que la base de datos). */
export const MSG_SIN_APROBADOR = 'No hay un aprobador de Finanzas activo con tope suficiente para este monto.'
/** @typedef {'aprobada' | 'rechazada' | 'ajuste'} DecisionAprobacion */

/**
 * @typedef {object} Aprobacion
 * @property {string} id
 * @property {string} folio
 * @property {NivelAprobacion} nivel
 * @property {DecisionAprobacion} decision
 * @property {string} aprobadorNombre
 * @property {string} [aprobadorCorreo]
 * @property {'correo' | 'app'} via
 * @property {string} [comentario]
 * @property {number} [monto]
 * @property {string} [tokenUsado]
 * @property {number} fecha
 */

/** @typedef {'solicitud' | 'entrega_efectivo' | 'transferencia' | 'pago_tarjeta' | 'comprobacion' | 'devolucion_cambio'} TipoMovimientoDinero */

/**
 * @typedef {object} MovimientoDinero
 * @property {string} id
 * @property {string} folio
 * @property {TipoMovimientoDinero} tipo
 * @property {number} monto
 * @property {string} [folioCajaChica] - Solo efectivo: folio de caja chica.
 * @property {string} [referencia] - Transferencia: folio / clave de rastreo (obligatoria). Tarjeta: EXACTAMENTE los últimos 4 dígitos (nunca el número completo). Máximo 100 caracteres.
 * @property {string} [familiaGasto]
 * @property {string} [receptor]
 * @property {string} [archivoUrl]
 * @property {string} [notas]
 * @property {string} [registradoPor]
 * @property {number} fecha
 */

/**
 * @typedef {object} CompraReal
 * @property {string} id
 * @property {string} folio
 * @property {string} partidaId
 * @property {number} cantidadComprada
 * @property {number} costoUnitarioReal
 * @property {string} [proveedor]
 * @property {string} [numeroFactura]
 * @property {string} [ticketUrl]
 * @property {number} fecha
 * @property {string} [registradoPor]
 */

/** @typedef {'pendiente' | 'confirmada'} EstadoRecepcion */

/**
 * Todo lo que el custodio necesita ya precargado para confirmar en 1 clic.
 * @typedef {object} DatosRecepcion
 * @property {string} producto
 * @property {number} cantidad
 * @property {string} categoriaId
 * @property {string} categoria
 * @property {string} [descripcion]
 * @property {string} [modeloMarca]
 * @property {string} [proveedor]
 * @property {string} [numeroFactura]
 * @property {string} [ticketUrl]
 * @property {number} costoUnitarioReal
 * @property {string} fechaCompra
 * @property {string} [paraQuien]
 * @property {string} solicitante
 * @property {string} [area]
 * @property {string[]} ubicaciones
 * @property {string} compraRef - Referencia única de la compra: `${folio}#${num de partida}`. Se vuelve `compraRef` de equipos/entradas.
 * @property {string} [familiaSugeridaId] - Familia de inventario sugerida (editable al confirmar).
 * @property {string} [entradaMaterialId] - Al confirmar: id de la entrada de material creada (destino 'mantenimiento' por cantidad).
 * @property {string} [materialId]
 */

/**
 * @typedef {object} Recepcion
 * @property {string} id
 * @property {string} folio
 * @property {string} partidaId
 * @property {'ti' | 'mantenimiento'} destino
 * @property {number} cantidad
 * @property {EstadoRecepcion} estado
 * @property {DatosRecepcion} datos
 * @property {string} [confirmadoPor]
 * @property {number} [fechaConfirmacion]
 * @property {string[]} equipoIds
 * @property {number} createdAt
 */

/**
 * Aviso INFORMATIVO a Dirección (sin botones ni liga): la compra rebasa el umbral de aviso y la autoriza Finanzas.
 * Históricos de la cadena de tres niveles (019): ya no se generan.
 * @typedef {'confirmacion_solicitante' | 'nueva_requisicion' | 'autorizacion_finanzas' | 'aviso_direccion' | 'aviso_excepcion_cotizaciones' |
 *   'autorizacion_direccion' | 'autorizacion_ceo' | 'tesoreria_fondos' | 'estado_solicitante' |
 *   'estado_comprador' | 'alerta_finanzas' | 'recepcion_pendiente' | 'pago_pendiente'} TipoCorreo
 */

/** @typedef {'pendiente' | 'enviando' | 'enviado' | 'error' | 'simulado'} EstadoCorreo */

/**
 * @typedef {object} NotificacionCorreo
 * @property {string} id
 * @property {string} paraCorreo
 * @property {string} [paraNombre]
 * @property {string} asunto
 * @property {string} cuerpoHtml
 * @property {TipoCorreo} tipo
 * @property {string} [requisicionId]
 * @property {EstadoCorreo} estado
 * @property {string} [error]
 * @property {number} [enviadoAt]
 * @property {number} createdAt
 */

/**
 * @typedef {object} TokenAprobacion
 * @property {string} token
 * @property {string} folio
 * @property {'aprobacion' | 'auditoria'} tipo
 * @property {NivelAprobacion} [nivel]
 * @property {string} [aprobadorCorreo]
 * @property {string} [aprobadorNombre]
 * @property {number} [usadoAt]
 * @property {number} expiraAt
 * @property {number} createdAt
 */

// ---------------------------------------------------------------------------------------------------------------------
// Rutas (las pantallas y los correos deben usar estos constructores)
// ---------------------------------------------------------------------------------------------------------------------
export const RUTAS_COMPRAS = {
  /** Pública: formulario para levantar una requisición (liga general). */
  nueva: '/compras/nueva',
  /** Pública: seguimiento por folio + token (el solicitante también confirma recibido aquí). */
  estatus: (folio, token) => `/compras/estatus/${encodeURIComponent(folio)}/${encodeURIComponent(token)}`,
  /** Pública: aprobar/rechazar con token de un solo uso. `?d=aprobada|rechazada|ajuste` solo PRESELECCIONA (no ejecuta). */
  aprobar: (token, decision) => `/compras/aprobar/${encodeURIComponent(token)}${decision ? `?d=${decision}` : ''}`,
  /** Privada: tablero de requisiciones. */
  lista: '/compras',
  /** Privada: catálogo de proveedores (Adquisiciones, Finanzas, Tesorería, Cuentas por pagar y Dirección). */
  proveedores: '/proveedores',
  /** Privada: detalle de una requisición. */
  requisicion: (folio) => `/compras/requisicion/${encodeURIComponent(folio)}`,
}

// ---------------------------------------------------------------------------------------------------------------------
// Utilidades comunes
// ---------------------------------------------------------------------------------------------------------------------
export function formatoMoneda(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
}

// ---- Excepción de cotizaciones (SPEC 3) --------------------------------------------------------------------------------------
/** @typedef {'especializado' | 'adjudicacion_directa' | 'urgencia'} ExcepcionTipo */
/** @typedef {'ceo' | 'dga'} InstruidaPor */
/** Tipos de excepción de cotizaciones (con ella basta 1 cotización; la justificación escrita es siempre obligatoria). */
export const EXCEPCION_TIPO_LABEL = { especializado: 'Producto o servicio especializado', adjudicacion_directa: 'Adjudicación directa', urgencia: 'Urgencia' }
export const INSTRUIDA_POR_LABEL = { ceo: 'CEO', dga: 'DGA' }
/** Mínimo de caracteres de la justificación de la excepción. */
export const EXCEPCION_JUSTIFICACION_MIN = 15

/** Texto de la excepción para Finanzas: «Producto o servicio especializado — …» / «Adjudicación directa instruida por CEO — …» / «Urgencia — …». */
export function textoExcepcion(x) {
  const just = (x?.justificacion ?? x?.excepcionCotizaciones ?? '').trim()
  const tipo = x?.tipo ?? x?.excepcionTipo
  const por = x?.instruidaPor ?? x?.excepcionInstruidaPor
  const cabeza = tipo === 'adjudicacion_directa' ? `Adjudicación directa${por ? ` instruida por ${INSTRUIDA_POR_LABEL[por] ?? por}` : ''}` : EXCEPCION_TIPO_LABEL[tipo] ?? ''
  return [cabeza, just].filter(Boolean).join(' — ')
}

/** Valida la excepción: devuelve el mensaje de error en español o '' si es válida (tipo obligatorio; «instruida por» solo en adjudicación directa; justificación >= 15). */
export function errorExcepcion(x) {
  const tipo = x?.tipo
  const por = x?.instruidaPor
  if (!tipo) return 'Elige el tipo de excepción: producto o servicio especializado, adjudicación directa instruida por CEO/DGA o urgencia.'
  if (!EXCEPCION_TIPO_LABEL[tipo]) return 'El tipo de excepción no es válido.'
  if (tipo === 'adjudicacion_directa' && !INSTRUIDA_POR_LABEL[por ?? '']) return 'Indica quién instruyó la adjudicación directa: CEO o DGA.'
  if (tipo !== 'adjudicacion_directa' && por) return `La excepción por ${tipo === 'urgencia' ? 'urgencia' : 'producto especializado'} no lleva «instruida por».`
  if ((x?.justificacion ?? '').trim().length < EXCEPCION_JUSTIFICACION_MIN) return `Escribe la justificación de la excepción (mínimo ${EXCEPCION_JUSTIFICACION_MIN} caracteres).`
  return ''
}

/** Mensaje cuando faltan cotizaciones de proveedores distintos para una compra a partir del umbral. */
export function textoFaltanCotizaciones(umbral, requeridas, hay) {
  return `Para compras de ${formatoUmbral(umbral)} o más se requieren ${requeridas} cotizaciones de proveedores distintos (hay ${hay}). Registra las faltantes o documenta la excepción (producto especializado, adjudicación directa de CEO/DGA o urgencia).`
}

/** Umbral en pesos sin centavos cuando es entero ("$100"); con centavos si no ("$99.50"). */
export function formatoUmbral(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n)
}

/** Leyenda de Finanzas para un registro de compra menor (pura: el umbral lo da quien llama; por defecto el de fábrica, 100). */
export function textoLeyendaCompraMenor(umbral = 100) {
  return `Compra menor (menos de ${formatoUmbral(umbral)}): sin cotización, solo registro`
}

/** Mensaje cuando un registro de compra menor llega al umbral o lo rebasa (espejo del mensaje del servidor). */
export function textoRegistroExcedido(umbral = 100) {
  return `Una compra menor (solo registro) aplica únicamente por debajo de ${formatoUmbral(umbral)}; para este monto registra una cotización completa.`
}

/** Redondeo a centavos para evitar 0.1+0.2 en sumas de dinero. */
export function r2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
