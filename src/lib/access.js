
/** @typedef {'edit' | 'view'} AccessLevel */

/**
 * Modelo de permisos (8 roles; cada uno actúa en lo suyo):
 * - capturista (Uriel, Líder de TI / Infraestructura y Soporte): opera SOLO el dominio `sistemas`. Da de alta su
 *   propio stock (equipos, compras) y lo asigna, da de baja, audita y resuelve solicitudes de Sistemas.
 * - mantenimiento (Gerente de Mantenimiento): opera SOLO el dominio `mantenimiento` (material, herramienta, equipo,
 *   proveedores, calendario preventivo, salidas, auditorías y solicitudes de Mantenimiento).
 * - admin (Dirección General): todo, en ambos dominios, y es el único que ve/ajusta todo lo demás.
 * - adquisiciones (Analista de Adquisiciones): cotiza y realiza las compras indirectas y carga stock en ambos
 *   dominios; NO asigna, no da de baja ni audita (el comprador no es el custodio del inventario).
 * - finanzas: aprueba/rechaza compras (según su tope de aprobación) y ve la bitácora; en inventario es SOLO LECTURA.
 * - tesoreria (caja chica): entrega el EFECTIVO de las compras aprobadas (forma de pago efectivo); en inventario es SOLO LECTURA.
 * - cuentas_por_pagar: paga las compras aprobadas por TRANSFERENCIA o TARJETA (registra referencia, fecha y comprobante), da de alta y corrige
 *   proveedores del catálogo (RFC, CLABE…); no ve inventario ni cotizaciones.
 * - talento: SOLO LECTURA; ve responsivas, equipos por responsable y cargos por pérdida (recuperar equipo / descuentos);
 *   administra el directorio de colaboradores junto con Soporte.
 * - solicitante: solo consulta (ambos dominios, solo lectura) y levanta/cancela sus solicitudes.
 *
 * Control: el comprador (Adquisiciones/Finanzas) no es el custodio, y la evidencia de compra (proveedor, factura,
 * costo, serie…) de un registro ya creado solo la puede modificar Dirección o Adquisiciones (`canEditCompra`).
 *
 * Los helpers reciben el dominio (`FamiliaTipo`). Sin dominio devuelven true si el rol puede en ALGÚN dominio
 * (sirve para mostrar/ocultar controles genéricos, p. ej. el botón de snapshot del Home).
 */

/** Roles que operan el inventario (ven las herramientas de gestión). Finanzas, Tesorería, Talento y solicitantes: solo lectura. */
const ROLES_OPERADORES_INVENTARIO = ['admin', 'capturista', 'mantenimiento', 'adquisiciones']

export function getAccess(role) {
  return ROLES_OPERADORES_INVENTARIO.includes(role) ? 'edit' : 'view'
}

/** Ve las herramientas de gestión (botones de acción, etiquetas QR, historial…). */
export function isEditor(role) {
  return getAccess(role) === 'edit'
}

/** Dominio propio de un operador (capturista → sistemas, mantenimiento → mantenimiento); undefined = sin dominio fijo (admin, adquisiciones…). */
export function dominioPropio(role) {
  if (role === 'capturista') return 'sistemas'
  if (role === 'mantenimiento') return 'mantenimiento'
  return undefined
}

/** Alta de equipos/materiales (stock), compras/entradas y proveedores en el dominio indicado. */
export function canLoadStock(role, tipo) {
  if (role === 'admin' || role === 'adquisiciones') return true
  const dom = dominioPropio(role)
  if (!dom) return false
  return tipo === undefined || tipo === dom
}

/** Asigna ubicaciones/usuarios, bajas, pérdidas, salidas/traslados, auditorías, solicitudes y responsivas del dominio. */
export function canAssign(role, tipo) {
  if (role === 'admin') return true
  const dom = dominioPropio(role)
  if (!dom) return false
  return tipo === undefined || tipo === dom
}

/** Correr una auditoría física del tipo dado: una auditoría de 'ambos' dominios solo la corre Dirección. */
export function canRunAudit(role, tipo) {
  return tipo === 'ambos' ? role === 'admin' : canAssign(role, tipo)
}

/** Editar los datos de compra (modelo, serie, proveedor, factura, costo…) de un registro YA creado. */
export function canEditCompra(role) {
  return role === 'admin' || role === 'adquisiciones'
}

// ---- Compras indirectas (los solicitantes no tienen cuenta: usan la liga pública) ----

/** Entra al módulo de Compras de la plataforma. */
export function canViewCompras(role) {
  return role === 'adquisiciones' || role === 'finanzas' || role === 'tesoreria' || role === 'cuentas_por_pagar' || role === 'admin' || role === 'capturista' || role === 'mantenimiento'
}

/** Cotiza, elige proveedor y registra la compra física. */
export function canQuote(role) {
  return role === 'adquisiciones' || role === 'admin'
}

/**
 * Decide (aprueba / rechaza / pide ajuste) requisiciones desde la app: SOLO el rol finanzas (migración 022). Dirección (admin) consulta y
 * recibe avisos pero ya no aprueba. Además hay que estar ligado a un aprobador del directorio cuyo tope cubra el monto
 * (`puedeDecidirFolio` en lib/compras/aprobaciones.js); este helper solo responde por el rol.
 */
export function canApproveFinanzas(role) {
  return role === 'finanzas'
}

/** Registra la entrega del EFECTIVO de caja chica (Tesorería; Dirección también puede). Solo aplica a requisiciones con forma de pago efectivo. */
export function canFundCaja(role) {
  return role === 'tesoreria' || role === 'admin'
}

/** Registra el pago por transferencia o tarjeta (referencia, fecha y comprobante): SOLO Cuentas por pagar. Tesorería no paga transferencias ni tarjeta. */
export function canRegistrarPago(role) {
  return role === 'cuentas_por_pagar'
}

// ---- Catálogo de proveedores (cmp_proveedores) ----

/** Ve el catálogo: Adquisiciones, Finanzas, Tesorería, Cuentas por pagar y Dirección. Nadie más (ni por menú ni por URL). */
export function canViewProveedores(role) {
  return role === 'admin' || role === 'adquisiciones' || role === 'finanzas' || role === 'tesoreria' || role === 'cuentas_por_pagar'
}

/** Da de alta proveedores (el elegido para una compra): Adquisiciones, Dirección y Cuentas por pagar. */
export function canCreateProveedor(role) {
  return role === 'adquisiciones' || role === 'admin' || role === 'cuentas_por_pagar'
}

/** Edita un proveedor existente (nombre comercial, dirección, CP, notas; baja y reactivación). */
export function canEditProveedor(role) {
  return role === 'adquisiciones' || role === 'finanzas' || role === 'cuentas_por_pagar' || role === 'admin'
}

/** Da de baja y reactiva proveedores: solo Dirección, Finanzas y Cuentas por pagar (Adquisiciones NO). */
export function canDisableProveedor(role) {
  return role === 'admin' || role === 'finanzas' || role === 'cuentas_por_pagar'
}

/**
 * Modifica los datos fiscales y bancarios de un proveedor YA existente (razón social, RFC, CLABE, tipo y forma de pago): solo Cuentas por pagar,
 * Finanzas y Dirección. Adquisiciones (quien compra) NO: separación de funciones — quien compra no toca a quién se le paga.
 */
export function canEditDatosFiscalesProveedor(role) {
  return role === 'cuentas_por_pagar' || role === 'finanzas' || role === 'admin'
}

/** Ve la CLABE completa (con botón copiar): quienes pueden corregirla. Los demás la ven enmascarada (últimos 4 dígitos). */
export function canViewClabe(role) {
  return canEditDatosFiscalesProveedor(role)
}

/**
 * Destino de inventario de una partida de compra (`ti` = Sistemas).
 * @typedef {'ti' | 'sistemas' | 'mantenimiento'} DestinoRecepcion
 */

/** Confirma la recepción de lo comprado en el inventario del custodio (Uriel → TI; Gerente de Mantenimiento → Mantenimiento). */
export function canConfirmRecepcion(role, tipo) {
  if (role === 'admin') return true
  if (role === 'capturista') return tipo === undefined || tipo === 'ti' || tipo === 'sistemas'
  if (role === 'mantenimiento') return tipo === undefined || tipo === 'mantenimiento'
  return false
}

// ---- Directorio, responsivas y bitácora ----

/** Alta/edición/desactivación de colaboradores del directorio (de aquí salen solicitantes, responsables y correos). */
export function canManageDirectorio(role) {
  return role === 'admin' || role === 'talento' || role === 'capturista'
}

/** Ve el directorio (lectura). Quien lo administra más quienes lo consultan al comprar/custodiar. */
export function canViewDirectorio(role) {
  return canManageDirectorio(role) || role === 'adquisiciones' || role === 'mantenimiento' || role === 'finanzas'
}

/** Consulta responsivas y equipos por responsable (solo lectura para Talento). */
export function canViewResponsivas(role) {
  return role === 'admin' || role === 'talento' || role === 'capturista' || role === 'mantenimiento'
}

/** Bitácora inmutable de cambios. */
export function canViewBitacora(role) {
  return role === 'admin' || role === 'finanzas'
}

// =====================================================================================================================
// ALCANCE DE VISTA POR ROL  (qué ve cada perfil: menú, rutas, Inicio, búsqueda, campana, alertas)
// ---------------------------------------------------------------------------------------------------------------------
// Los helpers de arriba deciden qué puede HACER un rol; los de aquí deciden qué puede VER. Menú lateral, guardias de ruta,
// Inicio, buscador global, campana de notificaciones y alertas de control usan SOLO estos helpers, para que ocultar algo
// en un lado nunca lo deje expuesto en otro. Los datos agregados (valores, conteos, alertas) se filtran con el mismo alcance.
//
// LÍMITE: esto es control de VISTA en la app. La lectura en la base (RLS) sigue abierta a cualquier usuario autenticado
// por la API; endurecerla por dominio es una fase posterior (ver DEPLOY.md §7).
// =====================================================================================================================

/**
 * @typedef {'inicio' | 'sistemas' | 'mantenimiento' | 'solicitudes' | 'compras' | 'proveedores' | 'auditorias' | 'directorio' |
 *   'bitacora'} SeccionId
 */

/** Dominios de inventario que el rol puede consultar (admin y los dos operadores como siempre; Adquisiciones en modo existencias). */
export function dominiosVisibles(role) {
  switch (role) {
    case 'admin':
    case 'adquisiciones':
    case 'finanzas':
      return ['sistemas', 'mantenimiento']
    case 'capturista':
    case 'talento':
      return ['sistemas']
    case 'mantenimiento':
      return ['mantenimiento']
    default:
      return [] // tesoreria, cuentas_por_pagar, solicitante
  }
}

/** ¿Puede abrir el inventario de ese dominio? */
export function canViewInventario(role, tipo) {
  return dominiosVisibles(role).includes(tipo)
}

/** Dominios donde el rol OPERA (da de alta/asigna): sobre ellos recibe solicitudes, alertas operativas y avisos. */
export function dominiosOperados(role) {
  if (role === 'admin') return ['sistemas', 'mantenimiento']
  const d = dominioPropio(role)
  return d ? [d] : []
}

/**
 * Inventario SIN dinero: ve existencias, ubicación, estado, responsable (y mínimo/máximo) pero NO costos, valores, gráficas
 * de gasto ni KPIs en pesos. Adquisiciones (trabaja con cantidades) y Talento (trabaja con personas y responsivas).
 */
export function inventarioSinDinero(role) {
  return role === 'adquisiciones' || role === 'talento'
}

/** Ve los cargos por pérdida/robo (descuentos y recuperación de equipo). Adquisiciones no. */
export function canViewCargosPerdida(role) {
  return role !== 'adquisiciones' && dominiosVisibles(role).length > 0
}

/** Mapa/ficha de sucursales y valor de inventario por sucursal: Dirección y los dos operadores (cada uno solo su dominio). */
export function canViewMapa(role) {
  return role === 'admin' || role === 'capturista' || role === 'mantenimiento'
}

/** Dominio al que se limita la información agregada del rol en el mapa/ficha/Inicio (undefined = ambos). */
export function dominioDeVista(role) {
  const d = dominiosVisibles(role)
  return d.length === 1 ? d[0] : undefined
}

/** Solicitudes de equipo/reparación: cola completa de su dominio para operadores; Adquisiciones las ve (para comprar); el solicitante solo las suyas. */
export function canViewSolicitudes(role) {
  return role === 'admin' || role === 'capturista' || role === 'mantenimiento' || role === 'adquisiciones' || role === 'solicitante'
}
export function solicitudesTiposVisibles(role) {
  if (!canViewSolicitudes(role)) return []
  return role === 'capturista' ? ['sistemas'] : role === 'mantenimiento' ? ['mantenimiento'] : ['sistemas', 'mantenimiento']
}
/** El solicitante solo ve las solicitudes que él levantó. */
export function solicitudesSoloPropias(role) {
  return role === 'solicitante'
}

/** Auditorías físicas: Dirección (todas) y cada operador las de su dominio. */
export function canViewAuditorias(role) {
  return role === 'admin' || role === 'capturista' || role === 'mantenimiento'
}
export function auditoriaTiposVisibles(role) {
  if (role === 'admin') return ['sistemas', 'mantenimiento', 'ambos']
  const d = dominioPropio(role)
  return d ? [d] : []
}

/** ¿Ve esta sección del menú / puede entrar a su ruta? (el menú, las guardias y las redirecciones usan SOLO esto). */
export function canViewSeccion(role, id) {
  switch (id) {
    case 'inicio':
      return true
    case 'sistemas':
      return canViewInventario(role, 'sistemas')
    case 'mantenimiento':
      return canViewInventario(role, 'mantenimiento')
    case 'solicitudes':
      return canViewSolicitudes(role)
    case 'compras':
      return canViewCompras(role)
    case 'proveedores':
      return canViewProveedores(role)
    case 'auditorias':
      return canViewAuditorias(role)
    case 'directorio':
      return canViewDirectorio(role)
    case 'bitacora':
      return canViewBitacora(role)
  }
}

// ---- Lecturas que la API NIEGA por rol (403) ----

/**
 * Tablas que la API no deja leer a ciertos roles. El cliente NO las pide (la caché queda vacía): así no hay peticiones 403 que ensucien la red y la
 * consola. Solo se listan los casos confirmados contra el backend; un rol que no aparece aquí sí las pide.
 */
const TABLAS_SIN_LECTURA = {
  cmp_cotizaciones: ['cuentas_por_pagar'],
  cmp_cotizacion_items: ['cuentas_por_pagar'],
  cmp_recepciones: ['cuentas_por_pagar', 'tesoreria'],
  cmp_notificaciones: ['cuentas_por_pagar', 'tesoreria', 'adquisiciones'],
  inv_bitacora: ['cuentas_por_pagar', 'adquisiciones'],
}

/** ¿La API deja leer esta tabla a este rol? (sin sesión, sí: se intenta y el servidor decide). */
export function canReadTabla(role, tabla) {
  return !(role && TABLAS_SIN_LECTURA[tabla]?.includes(role))
}

// ---- Compras: qué parte del módulo ve cada rol ----

/** Custodio de inventario (Uriel / Mantenimiento) en Compras: solo da seguimiento y confirma recepciones, sin dinero. */
export function esCustodioCompras(role) {
  return role === 'capturista' || role === 'mantenimiento'
}

/** Ve montos de cotizaciones, compras, autorizaciones y dinero de CADA requisición (no el custodio). */
export function canViewComprasDinero(role) {
  return canViewCompras(role) && !esCustodioCompras(role)
}

/** Indicadores globales de gasto (monto autorizado/gastado, ahorro) y la pestaña Reportes: solo Dirección y Finanzas. */
export function canViewComprasGlobal(role) {
  return role === 'admin' || role === 'finanzas'
}

/**
 * @typedef {'resumen' | 'cotizaciones' | 'autorizacion' | 'dinero' | 'compra' | 'entrega' | 'historial' |
 *   'correos'} PestanaRequisicion
 */

/** Pestañas del detalle de una requisición que el rol puede abrir (Correos además exige `puedeVerCorreos`). */
export function pestanasRequisicion(role) {
  if (esCustodioCompras(role)) return ['resumen', 'entrega', 'historial']
  if (role === 'tesoreria' || role === 'cuentas_por_pagar') return ['resumen', 'autorizacion', 'dinero', 'compra', 'entrega', 'historial']
  return ['resumen', 'cotizaciones', 'autorizacion', 'dinero', 'compra', 'entrega', 'historial', 'correos']
}

// ---- Inicio ----

/**
 * Qué alertas de control ve el rol: de qué dominio de inventario, si incluye Compras y (opcional) qué reglas.
 * @typedef {object} AlcanceAlertas
 * @property {FamiliaTipo} [dominio]
 * @property {boolean} inventario
 * @property {boolean} compras
 * @property {string[]} [reglas] - Si se indica, solo estas reglas.
 */

/**
 * Qué trae el Inicio de cada rol. HomePage solo lee esto (más los datos ya filtrados por dominio).
 * @typedef {object} VistaInicio
 * @property {FamiliaTipo} [dominio] - Dominio al que se limitan los datos de inventario del Inicio (undefined = ambos).
 * @property {boolean} pendientes - Tarjetas "Tus pendientes".
 * @property {boolean} kpisInventario - Franja de KPIs de inventario (valor, bajo mínimo, solicitudes, pérdidas) con filtro de sucursal.
 * @property {boolean} dineroInventario - Muestra valores en pesos del inventario (valor, balance de inversión, valor por familia, pérdidas, tendencia).
 * @property {boolean} stock - Resumen de existencias sin dinero (totales, bajo mínimo y sobre máximo).
 * @property {boolean} mapa - Mapa y ficha de sucursales.
 * @property {'completa' | 'conteos' | null} compras - Franja de Compras Indirectas: 'completa' (con dinero) o 'conteos' (solo cantidades de requisiciones).
 * @property {boolean} comprasGrafico - Gráfico de requisiciones por estado/área.
 * @property {AlcanceAlertas | null} alertas - Alertas de control (null = no ve alertas).
 * @property {string[]} indicadores - Indicadores de proceso (GV-INF-008 / ADQ-001) visibles.
 * @property {boolean} actividad - Actividad reciente, solicitudes por mes y equipos por estado de su dominio.
 * @property {boolean} accesos - Tarjetas de acceso a Sistemas / Mantenimiento / Solicitudes al final del Inicio.
 * @property {string} subtitulo - Subtítulo del Inicio.
 */

const INDICADORES_TODOS = ['exactitud_inventario', 'responsivas_firmadas', 'sucursales_auditadas', 'materiales_en_rango']

/** Alertas por rol: las de dinero global y las de Compras solo para Dirección y Finanzas; las demás, solo de su dominio/función. */
export function alcanceAlertas(role) {
  switch (role) {
    case 'admin':
      return { inventario: true, compras: true }
    case 'capturista':
      return { dominio: 'sistemas', inventario: true, compras: false }
    case 'mantenimiento':
      return { dominio: 'mantenimiento', inventario: true, compras: false }
    case 'finanzas':
      return { inventario: false, compras: true }
    case 'talento':
      return { dominio: 'sistemas', inventario: true, compras: false, reglas: ['sin_responsiva'] }
    default:
      return null // adquisiciones (ve su resumen de stock), tesoreria, cuentas_por_pagar, solicitante
  }
}

/** Indicadores de proceso por rol (se calculan con el dominio de `dominioDeVista`). */
export function indicadoresVisibles(role) {
  switch (role) {
    case 'admin':
      return INDICADORES_TODOS
    case 'capturista':
      return ['exactitud_inventario', 'responsivas_firmadas', 'sucursales_auditadas']
    case 'mantenimiento':
      return ['exactitud_inventario', 'sucursales_auditadas', 'materiales_en_rango']
    case 'talento':
      return ['responsivas_firmadas']
    default:
      return []
  }
}

export function homeSecciones(role) {
  const base = {
    pendientes: true,
    kpisInventario: false,
    dineroInventario: false,
    stock: false,
    mapa: false,
    compras: null,
    comprasGrafico: false,
    alertas: alcanceAlertas(role),
    indicadores: indicadoresVisibles(role),
    actividad: false,
    accesos: false,
    subtitulo: '',
  }
  switch (role) {
    case 'admin':
      return { ...base, kpisInventario: true, dineroInventario: true, mapa: true, compras: 'completa', comprasGrafico: true, actividad: true, accesos: true, subtitulo: 'Balance general de los inventarios de Sistemas y Mantenimiento.' }
    case 'capturista':
      return { ...base, dominio: 'sistemas', kpisInventario: true, dineroInventario: true, mapa: true, actividad: true, accesos: true, subtitulo: 'Tu inventario de Sistemas: valor, alertas y sucursales.' }
    case 'mantenimiento':
      return { ...base, dominio: 'mantenimiento', kpisInventario: true, dineroInventario: true, mapa: true, actividad: true, accesos: true, subtitulo: 'Tu inventario de Mantenimiento: existencias, alertas y sucursales.' }
    case 'adquisiciones':
      return { ...base, stock: true, compras: 'conteos', subtitulo: 'Tus pendientes de compras y el stock: existencias, mínimos y máximos.' }
    case 'finanzas':
      return { ...base, compras: 'completa', comprasGrafico: true, subtitulo: 'Lo que espera tu decisión y el panorama de Compras Indirectas.' }
    case 'tesoreria':
      return { ...base, subtitulo: 'Lo que espera caja chica: fondeos de efectivo y comprobaciones.' }
    case 'cuentas_por_pagar':
      return { ...base, subtitulo: 'Los pagos por transferencia y tarjeta que esperan a Cuentas por pagar.' }
    case 'talento':
      return { ...base, subtitulo: 'Responsivas de equipo y equipos por responsable.' }
    default:
      return { ...base, pendientes: false, subtitulo: 'Levanta una solicitud y consulta su estado.' }
  }
}
