import { isComunesCacheReady, loadComunesCache } from '../inventario/comunes'
import {
  addCotizacion,
  addParticipante,
  aprobarPorToken,
  cambiarEstado,
  confirmarRecibido,
  crearProveedor,
  crearRequisicionPublica,
  darDeBajaProveedor,
  comparativo,
  elegirProveedor,
  evaluarEleccion,
  listEnlacesAprobacion,
  loadComprasCaches,
  marcarComprada,
  registrarAprobacion,
  registrarCompra,
  registrarCompraMenor,
  registrarComprobacion,
  registrarDevolucionCambio,
  registrarEntregaEfectivo,
  registrarPagoTarjeta,
  reiniciarComprasLocal,
  setRelojCompras,
  solicitarAutorizacion,
  vincularProveedor,
  comprasModoLocal,
} from './index'

/**
 * Datos de demostración de Compras Indirectas (SOLO modo local; nunca con Supabase). Usa la API real, así que deja
 * historial, correos simulados, aprobaciones, dinero, compras y recepciones coherentes. Los correos son FALSOS (@ejemplo.mx).
 *
 * Autorización en UN solo nivel (Finanzas, migración 022). Aprobadores demo: «Aprobador Finanzas 1» SIN tope (el caso de Ángel: aprueba
 * cualquier monto) y «Aprobador Finanzas 2» con tope de $10,000 (el caso de Janeth); «Dirección General (demo)» solo recibe avisos
 * informativos de las compras de más de $50,000. No hay CEOs. Los usuarios de acceso `finanzas` y `finanzas2` (lib/auth.js) están ligados a
 * estos dos participantes por sus ids fijos (`demo-part-finanzas1` / `demo-part-finanzas2`).
 *
 * Requisiciones sembradas (una por estado): recibida (urgente), en cotización, en autorización de ~$8,000 (las ligas llegaron a LOS DOS
 * aprobadores: basta uno), autorizada de $52,560 (> $50,000: Finanzas la autorizó y Dirección recibió su aviso), fondeada (con excepción
 * de cotizaciones; la aprobó el de tope $10,000), comprada (compra de TI de Uriel con recepciones pendientes y diferencia real >
 * autorizado), entregada (con comprobación y cambio devuelto), rechazada, en espera y cancelada. Además, dos requisiciones más en autorización
 * esperando SOLO a Finanzas 1 (la liga solo le llegó a él porque rebasan el tope de $10,000) y con el aviso a Dirección simulado: una de
 * ~$63,250 y una de ~$125,000. Cotizaciones: < $1,000 basta 1; desde $1,000 se exigen 3 de proveedores distintos (r3, r4, r6, r7, r8, r11, r12) salvo excepción
 * documentada: r5 «producto o servicio especializado» y una requisición más con «adjudicación directa instruida por DGA» (1 cotización; Finanzas ve la excepción), y otra por «urgencia»; en todas Dirección recibe un aviso informativo. Y una COMPRA MENOR (< $100, solo registro, sin cotización) en autorización: Finanzas ve la leyenda de compra menor.
 *
 * CATÁLOGO DE PROVEEDORES Y RUTEO DE PAGOS: se siembran 6 proveedores FICTICIOS (RFC y CLABE con formato y dígito verificador válidos, sin datos reales): Bolsas Roldan Reyes
 * (factura · transferencia), Muebles Ejecutivos MX (factura · transferencia), Dell Store Empresas (factura · tarjeta), Demiluz y Papelería Marchand (remisión · efectivo) y
 * Telefonía Celular (factura · transferencia; dado de baja con motivo para ilustrar la baja). Cada requisición se liga a su proveedor ANTES de pedir la autorización (compuerta):
 * efectivo → Tesorería (r5 fondeada, r7 entregada); transferencia → Cuentas por pagar (r4 autorizada con el pago por hacer, r3 en autorización); tarjeta → Cuentas por pagar
 * (r6 pagada con tarjeta, r11 y r12 en autorización). El usuario de acceso `cuentas` (rol cuentas_por_pagar) ve la cola de Cuentas por pagar.
 *
 * Las cotizaciones traen CRITERIOS de comparación variados (garantía, crédito, anticipo, respaldo de marca, vigencia, calificación) para
 * que se vea el puntaje y la recomendación: una con crédito a 30 días (r3 y r11), una con anticipo (r4, r8 y r12), una sin distribuidor
 * autorizado (r6) y una vencida (r6). Las cotizaciones ELEGIDAS no llevan descuento, flete ni IVA aparte, así que sus montos siguen
 * calibrando los umbrales (Finanzas siempre; Dirección > $50,000; CEOs > $100,000).
 */
const DIA = 86400000
const HORA = 3600000

export async function sembrarComprasDemo() {
  if (!comprasModoLocal()) throw new Error('Los datos de ejemplo de Compras solo se cargan en modo demo local.')
  reiniciarComprasLocal()
  if (!isComunesCacheReady()) await loadComunesCache()
  await loadComprasCaches()

  // Reloj simulado: 14 días atrás, avanzando 1 s por llamada (folios y fechas coherentes) y saltos entre etapas.
  let t = Date.now() - 14 * DIA
  setRelojCompras(() => (t += 1000))
  const avanzar = (ms) => {
    t += ms
  }

  try {
    // ---------------------------------------------------------------------------------------------------------------
    // Directorio (correos falsos)
    // ---------------------------------------------------------------------------------------------------------------
    const P = async (nombre, correo, area, roles, ubicacionId, puesto, extra = {}) =>
      addParticipante({ nombre, correo: `${correo}@ejemplo.mx`, area, ubicacionId, puesto, roles, ...extra })
    const mtto = await P('Líder de Mantenimiento (demo)', 'mantenimiento.demo', 'Mantenimiento', ['solicitante', 'mantenimiento'], 'of-mantenimiento', 'Gerente de Mantenimiento')
    const uriel = await P('Uriel (Infraestructura y Soporte)', 'uriel.demo', 'Infraestructura y Soporte', ['solicitante', 'infraestructura'], 'of-soporte-infraestructura', 'Gerente de Infraestructura y Soporte de Redes')
    const opera = await P('Líder de Operaciones CEDIS (demo)', 'operaciones.demo', 'Operaciones', ['solicitante'], 'cedis-sp-piso-1', 'Líder de Operaciones')
    const ventas = await P('Líder de Ventas Bolivia (demo)', 'ventas.demo', 'Ventas', ['solicitante'], 'suc-bolivia', 'Líder de Sucursal')
    const medios = await P('Líder de Medios Digitales (demo)', 'medios.demo', 'Medios digitales', ['solicitante'], 'of-medios-digitales', 'Líder de Medios')
    const comprador = await P('Mauricio (Adquisiciones)', 'adquisiciones.demo', 'Compras', ['comprador'], 'of-compras', 'Analista de Adquisiciones')
    // Aprobadores de Finanzas: ids fijos para ligarlos con los usuarios demo `finanzas` y `finanzas2` (lib/auth.js).
    const fin1 = await P('Aprobador Finanzas 1 (demo)', 'finanzas1.demo', 'Finanzas', ['finanzas'], undefined, 'Finanzas (sin tope: aprueba cualquier monto)', { id: 'demo-part-finanzas1' })
    const fin2 = await P('Aprobador Finanzas 2 (demo)', 'finanzas2.demo', 'Finanzas', ['finanzas'], undefined, 'Finanzas (tope de aprobación $10,000)', { id: 'demo-part-finanzas2', topeAprobacion: 10000 })
    const tesoreria = await P('Tesorería · caja chica (demo)', 'tesoreria.demo', 'Tesorería', ['tesoreria'], undefined, 'Tesorería')
    const cuentas = await P('Cuentas por pagar (demo)', 'cuentas.demo', 'Cuentas por pagar', ['cuentas_por_pagar'], undefined, 'Cuentas por pagar')
    // Dirección: NO aprueba; recibe un aviso informativo de las compras de más de $50,000.
    await P('Dirección General (demo)', 'direccion.demo', 'Dirección', ['direccion'], 'of-dga', 'Dirección General')
    await P('Talento (demo)', 'talento.demo', 'Talento', ['talento'], 'of-talento', 'Talento')

    const MAU = comprador.nombre
    const aprobFin = { nombre: fin1.nombre, correo: fin1.correo } // sin tope
    const aprobFin2 = { nombre: fin2.nombre, correo: fin2.correo } // tope $10,000
    const TES = tesoreria.nombre
    const CXP = cuentas.nombre

    // ---------------------------------------------------------------------------------------------------------------
    // Catálogo de proveedores (FICTICIOS: razones sociales «DEMO», RFC y CLABE inventados con formato y dígito verificador válidos)
    // ---------------------------------------------------------------------------------------------------------------
    const prov = (datos) => crearProveedor({ direccionFiscal: 'Calle Ejemplo 100, Col. Demo, Ciudad Demo', ...datos }, { usuario: MAU })
    const pRoldan = await prov({ nombreComercial: 'Bolsas Roldan Reyes', razonSocial: 'Bolsas Roldan Reyes DEMO S.A. de C.V.', tipo: 'factura', formaPago: 'transferencia', rfc: 'BRR100101DM1', clabe: '000180000000001013', cp: '01010' })
    const pMuebles = await prov({ nombreComercial: 'Muebles Ejecutivos MX', razonSocial: 'Muebles Ejecutivos MX DEMO S.A. de C.V.', tipo: 'factura', formaPago: 'transferencia', rfc: 'MEM100202DM2', clabe: '000180000000002025', cp: '02020' })
    const pDell = await prov({ nombreComercial: 'Dell Store Empresas', razonSocial: 'Dell Store Empresas DEMO S.A. de C.V.', tipo: 'factura', formaPago: 'tarjeta', rfc: 'DSE100303DM3', cp: '03030', notas: 'Cobra con tarjeta corporativa; sin CLABE.' })
    const pDemiluz = await prov({ nombreComercial: 'Demiluz', tipo: 'remision', formaPago: 'efectivo', direccionFiscal: undefined, notas: 'Proveedor local por remisión: se paga en efectivo.' })
    const pMarchand = await prov({ nombreComercial: 'Papelería Marchand', razonSocial: 'Papelería Marchand DEMO S.A. de C.V.', tipo: 'remision', formaPago: 'efectivo', rfc: 'PMA100404DM4', cp: '04040' })
    const pTelefonia = await prov({ nombreComercial: 'Telefonía Celular', razonSocial: 'Telefonía Celular DEMO S.A. de C.V.', tipo: 'factura', formaPago: 'transferencia', rfc: 'TCE100505DM5', clabe: '000180000000003037', cp: '05050' })
    /** Liga el proveedor elegido (y su forma de pago habitual) a la requisición: sin esto la compuerta no deja pedir la autorización. */
    const ligar = (folio, p) => vincularProveedor(folio, p.id, undefined, { usuario: MAU })

    // ---------------------------------------------------------------------------------------------------------------
    // Utilidades de siembra
    // ---------------------------------------------------------------------------------------------------------------
    const crear = (sol, ubicaciones, partidas, extra = {}) =>
      crearRequisicionPublica({
        solicitanteId: sol.id,
        ubicaciones,
        urgencia: extra.urgente ? 'urgente' : 'normal',
        paraQuien: extra.paraQuien,
        fechaRequerida: extra.fechaRequerida,
        notas: extra.notas,
        proveedoresSugeridos: [],
        partidas,
      })
    /** AAAA-MM-DD a N días de hoy (negativo = ya pasó). */
    const enDias = (n) => new Date(Date.now() + n * DIA).toISOString().slice(0, 10)
    /** precios[i] = precio unitario de la partida i+1; `criterios` = garantía, crédito, anticipo, respaldo de marca, vigencia… */
    const cotizar = (folio, proveedor, precios, dias, calidad, criterios = {}) =>
      addCotizacion({
        folio,
        proveedor,
        tiempoEntregaDias: dias,
        calidad,
        contacto: 'Ventas',
        telefono: '55 0000 0000',
        precios: Object.fromEntries(precios.map((p, i) => [`${folio}-P${i + 1}`, p])),
        registradoPor: MAU,
        ...criterios,
      })
    /** Elige al proveedor; si el comparativo exige justificación y no se dio, usa lo que el propio comparativo sugiere. */
    const elegir = async (folio, proveedor, opts = {}) => {
      const id = await cotizacionId(folio, proveedor)
      const ev = evaluarEleccion(comparativo(folio).analisis, id)
      const justificacion = opts.justificacion ?? (ev.requiereJustificacion ? (ev.sugerencia ?? 'Mejor relación entre precio, garantía y entrega para esta compra.') : undefined)
      await elegirProveedor(folio, id, { usuario: MAU, ...opts, justificacion })
    }
    const cotizacionId = async (folio, proveedor) => {
      const { listCotizaciones } = await import('./index')
      return listCotizaciones(folio).find((c) => c.proveedor === proveedor).id
    }
    /** Liga de aprobación vigente de ese aprobador de Finanzas (solo existe si su tope cubre el monto). */
    const tokenDe = (folio, aprobador) => listEnlacesAprobacion(folio).find((e) => e.nivel === 'finanzas' && !e.usado && e.aprobadorCorreo === aprobador.correo).token

    // ---------------------------------------------------------------------------------------------------------------
    // 1) Recibida (urgente)
    // ---------------------------------------------------------------------------------------------------------------
    const r1 = await crear(ventas, ['suc-bolivia'], [{ categoriaId: 'cat-papeleria', producto: 'Plumones', cantidad: 10 }, { categoriaId: 'cat-papeleria', producto: 'Libreta cuadro chico', cantidad: 6 }], {
      urgente: true,
      fechaRequerida: new Date(Date.now() + 2 * DIA).toISOString().slice(0, 10),
      notas: 'Se acabaron en caja; urge para el cierre de semana.',
    })
    avanzar(5 * HORA)

    // 2) En cotización (1 cotización; monto ≤ umbral simple)
    const r2 = await crear(opera, ['cedis-sp-piso-1', 'cedis-sp-piso-2'], [
      { categoriaId: 'cat-limpieza', producto: 'Trapeador de microfibra', cantidad: 4, distribucion: { 'cedis-sp-piso-1': 2, 'cedis-sp-piso-2': 2 } },
      { categoriaId: 'cat-limpieza', producto: 'Concentrado de fabuloso', cantidad: 4 },
    ])
    avanzar(2 * HORA)
    await cotizar(r2.folio, 'Limpieza Industrial del Centro', [95, 140], 2, 'Buena', { diasCredito: 15, distribuidorAutorizado: true, vigenciaHasta: enDias(10), aceptaDevoluciones: true, calificacionProveedor: 4 })
    avanzar(1 * DIA)

    // 3) En autorización de ~$7,980 (≤ $10,000): las ligas llegaron a LOS DOS aprobadores de Finanzas; basta uno
    const r3 = await crear(opera, ['cedis-sp-piso-3'], [
      { categoriaId: 'cat-empaque', producto: 'Bolsa brisada 60x90', cantidad: 40, comentario: 'Paquete de 1 kg' },
      { categoriaId: 'cat-empaque', producto: 'Cinta de empaque frágil', cantidad: 36 },
      { categoriaId: 'cat-empaque', producto: 'Papel burbuja', cantidad: 6 },
    ])
    avanzar(3 * HORA)
    await cotizar(r3.folio, 'Bolsas Roldan Reyes', [75, 45, 560], 3, 'Buena', { diasCredito: 30, garantiaMeses: 3, garantiaResponsable: 'proveedor', anticipoPct: 0, distribuidorAutorizado: true, vigenciaHasta: enDias(20), aceptaDevoluciones: true, calificacionProveedor: 5 })
    await cotizar(r3.folio, 'Empaques del Norte', [79, 42, 590], 2, 'Excelente', { diasCredito: 0, garantiaMeses: 6, garantiaResponsable: 'fabricante', anticipoPct: 0, distribuidorAutorizado: true, vigenciaHasta: enDias(15), calificacionProveedor: 4 })
    await cotizar(r3.folio, 'Papelería Marchand', [86, 48, 540], 1, 'Buena', { diasCredito: 0, anticipoPct: 0, aceptaDevoluciones: false, vigenciaHasta: enDias(7), calificacionProveedor: 3 })
    await elegir(r3.folio, 'Bolsas Roldan Reyes')
    await ligar(r3.folio, pRoldan) // factura · transferencia → Cuentas por pagar
    await solicitarAutorizacion(r3.folio, { usuario: MAU })
    avanzar(1 * DIA)

    // 4) Autorizada — compra mayor ($52,560 > $50,000): la autorizó Finanzas 1 desde la app (sin tope) y Dirección recibió su aviso informativo;
    //    el proveedor elegido NO es el más barato (justificación obligatoria).
    const r4 = await crear(mtto, ['suc-san-pablo-1', 'suc-san-pablo-2'], [{ categoriaId: 'cat-mobiliario', producto: 'Sillas de oficina', cantidad: 12, distribucion: { 'suc-san-pablo-1': 6, 'suc-san-pablo-2': 6 } }], {
      notas: 'Reposición de sillas dañadas en las dos sucursales.',
    })
    avanzar(4 * HORA)
    await cotizar(r4.folio, 'Office Depot', [4150], 10, 'Buena', { garantiaMeses: 3, garantiaResponsable: 'proveedor', diasCredito: 0, anticipoPct: 0, distribuidorAutorizado: true, vigenciaHasta: enDias(12), aceptaDevoluciones: true, calificacionProveedor: 3 })
    await cotizar(r4.folio, 'Muebles Ejecutivos MX', [4380], 3, 'Excelente', { garantiaMeses: 12, garantiaResponsable: 'fabricante', diasCredito: 15, anticipoPct: 0, distribuidorAutorizado: true, soporteTecnico: true, vigenciaHasta: enDias(30), aceptaDevoluciones: true, calificacionProveedor: 5 }) // 12 × 4,380 = $52,560 (> $50,000: aviso a Dirección)
    await cotizar(r4.folio, 'ULINE', [4520], 7, 'Excelente', { garantiaMeses: 24, garantiaResponsable: 'fabricante', diasCredito: 0, anticipoPct: 50, distribuidorAutorizado: true, vigenciaHasta: enDias(10), aceptaDevoluciones: false, calificacionProveedor: 4 })
    await elegir(r4.folio, 'Muebles Ejecutivos MX', {
      justificacion: 'Entrega en 3 días (el más barato tarda 10) y garantía de 1 año en mecanismo.',
    })
    await ligar(r4.folio, pMuebles) // factura · transferencia → Cuentas por pagar (queda en «Pagos por hacer»)
    await solicitarAutorizacion(r4.folio, { usuario: MAU })
    avanzar(6 * HORA)
    await registrarAprobacion({ folio: r4.folio, nivel: 'finanzas', decision: 'aprobada', comentario: 'Autorizado, procede.', aprobador: aprobFin })
    avanzar(1 * DIA)

    // 5) Fondeada — urgente; con EXCEPCIÓN de cotizaciones «producto o servicio especializado» (monto >= $1,000 con una sola cotización)
    const r5 = await crear(mtto, ['suc-brasil-1'], [{ categoriaId: 'cat-ferreteria', producto: 'Cable 4 AWG Condulac', cantidad: 3, comentario: 'Rollos de 100 m' }], { urgente: true })
    avanzar(2 * HORA)
    await cotizar(r5.folio, 'Demiluz', [1650], 1, 'Buena', { diasCredito: 0, garantiaMeses: 1, garantiaResponsable: 'proveedor', distribuidorAutorizado: true, aceptaDevoluciones: false, vigenciaHasta: enDias(5) })
    await elegir(r5.folio, 'Demiluz', {
      excepcionTipo: 'especializado',
      excepcionCotizaciones: 'Cable de calibre especial: solo este proveedor lo maneja en existencia en la región.',
    })
    await ligar(r5.folio, pDemiluz) // remisión · efectivo → Tesorería
    await solicitarAutorizacion(r5.folio, { usuario: MAU })
    avanzar(2 * HORA)
    await aprobarPorToken(tokenDe(r5.folio, fin2), 'aprobada', 'Por urgencia.') // $4,950: la aprueba el de tope $10,000 con su liga
    avanzar(3 * HORA)
    await registrarEntregaEfectivo({ folio: r5.folio, monto: 4950, folioCajaChica: 'CC-0241', familiaGasto: 'Mantenimiento — material eléctrico', receptor: MAU, usuario: TES })
    avanzar(1 * DIA)

    // 6) Comprada — compra de TI solicitada por Uriel "para quién", con recepciones pendientes y diferencia real > autorizado
    const r6 = await crear(
      uriel,
      ['of-soporte-infraestructura'],
      [
        { categoriaId: 'cat-tecnologia', producto: 'Laptop', cantidad: 2, modeloMarca: 'Dell Latitude 5440', descripcion: '16 GB RAM / 512 GB SSD' },
        { categoriaId: 'cat-tecnologia', producto: 'Mouse inalámbrico', cantidad: 2 },
        { categoriaId: 'cat-herramienta', producto: 'Flexómetro', cantidad: 2, comentario: 'Para el equipo de instalación de redes' },
      ],
      { paraQuien: 'Nuevos ingresos de Ventas y E-commerce (2 laptops)', notas: 'Alta de personal confirmada por Talento.' },
    )
    avanzar(3 * HORA)
    await cotizar(r6.folio, 'Proveedor Cómputo MX', [21500, 330, 145], 5, 'Excelente', { garantiaMeses: 12, garantiaResponsable: 'proveedor', diasCredito: 0, anticipoPct: 0, distribuidorAutorizado: false, soporteTecnico: true, vigenciaHasta: enDias(14), aceptaDevoluciones: true, calificacionProveedor: 4 }) // sin distribuidor autorizado
    await cotizar(r6.folio, 'Dell Store Empresas', [20900, 300, 160], 7, 'Excelente', { garantiaMeses: 12, garantiaResponsable: 'fabricante', diasCredito: 0, anticipoPct: 0, distribuidorAutorizado: true, soporteTecnico: true, vigenciaHasta: enDias(20), aceptaDevoluciones: true, calificacionProveedor: 5 })
    await cotizar(r6.folio, 'Compuservicios del Valle', [22300, 280, 150], 3, 'Buena', { garantiaMeses: 6, garantiaResponsable: 'proveedor', diasCredito: 0, anticipoPct: 30, distribuidorAutorizado: true, vigenciaHasta: enDias(-4), aceptaDevoluciones: false, calificacionProveedor: 3 }) // vencida
    await elegir(r6.folio, 'Dell Store Empresas')
    await ligar(r6.folio, pDell) // factura · tarjeta → Cuentas por pagar
    await solicitarAutorizacion(r6.folio, { usuario: MAU })
    avanzar(4 * HORA)
    // $42,720: rebasa el tope de $10,000, así que solo Finanzas 1 pudo decidir; no rebasa $50,000 (sin aviso a Dirección).
    await registrarAprobacion({ folio: r6.folio, nivel: 'finanzas', decision: 'aprobada', comentario: 'Autorizado: alta de personal.', aprobador: aprobFin })
    avanzar(1 * DIA)
    // Cuentas por pagar paga con la tarjeta corporativa: solo se guardan los últimos 4 dígitos como referencia.
    await registrarPagoTarjeta({ folio: r6.folio, monto: 42720, referencia: '4821', archivoUrl: 'https://ejemplo.mx/comprobantes/demo-pago-tarjeta.pdf', usuario: CXP })
    avanzar(2 * DIA)
    const p6 = (n) => `${r6.folio}-P${n}`
    await registrarCompra({ folio: r6.folio, partidaId: p6(1), cantidadComprada: 2, costoUnitarioReal: 21300, proveedor: 'Dell Store Empresas', numeroFactura: 'DELL-F-88231', registradoPor: MAU })
    await registrarCompra({ folio: r6.folio, partidaId: p6(2), cantidadComprada: 2, costoUnitarioReal: 300, proveedor: 'Dell Store Empresas', numeroFactura: 'DELL-F-88231', registradoPor: MAU })
    await registrarCompra({ folio: r6.folio, partidaId: p6(3), cantidadComprada: 2, costoUnitarioReal: 185, proveedor: 'Ferretería Truper Centro', ticketUrl: 'https://ejemplo.mx/tickets/demo-flexometro.jpg', registradoPor: MAU })
    await marcarComprada(r6.folio, { usuario: MAU, justificacionDiferencia: 'El proveedor ajustó el precio de las laptops el día de la compra (cambio de lista).' })
    avanzar(1 * DIA)

    // 7) Entregada — con comprobación y cambio devuelto (ciclo completo)
    const r7 = await crear(medios, ['of-medios-digitales'], [{ categoriaId: 'cat-papeleria', producto: 'Caja hojas blancas', cantidad: 5 }, { categoriaId: 'cat-papeleria', producto: 'Plumones', cantidad: 6 }])
    avanzar(2 * HORA)
    // $1,637 (>= $1,000): tres cotizaciones de proveedores distintos
    await cotizar(r7.folio, 'Papelería Marchand', [265, 52], 1, 'Buena', { diasCredito: 0, aceptaDevoluciones: true, vigenciaHasta: enDias(30), calificacionProveedor: 3 })
    await cotizar(r7.folio, 'Office Depot', [279, 58], 2, 'Buena', { diasCredito: 0, aceptaDevoluciones: true, vigenciaHasta: enDias(20), calificacionProveedor: 4 })
    await cotizar(r7.folio, 'Papelería Lumen', [272, 55], 3, 'Buena', { diasCredito: 0, aceptaDevoluciones: false, vigenciaHasta: enDias(15), calificacionProveedor: 3 })
    await elegir(r7.folio, 'Papelería Marchand')
    await ligar(r7.folio, pMarchand) // remisión · efectivo → Tesorería
    await solicitarAutorizacion(r7.folio, { usuario: MAU })
    avanzar(2 * HORA)
    await registrarAprobacion({ folio: r7.folio, nivel: 'finanzas', decision: 'aprobada', aprobador: aprobFin2 }) // $1,637: la aprueba el de tope $10,000
    avanzar(2 * HORA)
    await registrarEntregaEfectivo({ folio: r7.folio, monto: 1637, folioCajaChica: 'CC-0238', familiaGasto: 'Papelería', receptor: MAU, usuario: TES })
    avanzar(5 * HORA)
    await registrarCompra({ folio: r7.folio, partidaId: `${r7.folio}-P1`, cantidadComprada: 5, costoUnitarioReal: 260, proveedor: 'Papelería Marchand', numeroFactura: 'M-4471', registradoPor: MAU })
    await registrarCompra({ folio: r7.folio, partidaId: `${r7.folio}-P2`, cantidadComprada: 6, costoUnitarioReal: 50, proveedor: 'Papelería Marchand', numeroFactura: 'M-4471', registradoPor: MAU })
    await marcarComprada(r7.folio, { usuario: MAU })
    await registrarComprobacion({ folio: r7.folio, monto: 1600, archivoUrl: 'https://ejemplo.mx/tickets/demo-papeleria.jpg', usuario: MAU })
    await registrarDevolucionCambio({ folio: r7.folio, monto: 37, usuario: MAU, notas: 'Cambio entregado a Tesorería' })
    avanzar(6 * HORA)
    await confirmarRecibido(r7.folio, r7.token)
    avanzar(1 * DIA)

    // 8) Rechazada por Finanzas 1 ($10,400 rebasa el tope del otro aprobador)
    const r8 = await crear(uriel, ['suc-bolivia', 'suc-brasil-1'], [{ categoriaId: 'cat-tecnologia', producto: 'Celulares motog 35', cantidad: 2 }], { paraQuien: 'Supervisores de ruta (reposición de equipos dañados)' })
    avanzar(2 * HORA)
    await cotizar(r8.folio, 'Telefonía Celular', [5200], 2, 'Buena', { garantiaMeses: 12, garantiaResponsable: 'fabricante', diasCredito: 15, anticipoPct: 0, distribuidorAutorizado: true, soporteTecnico: true, vigenciaHasta: enDias(9), aceptaDevoluciones: true, calificacionProveedor: 5 })
    await cotizar(r8.folio, 'Cel Mayoreo MX', [5390], 1, 'Buena', { garantiaMeses: 6, garantiaResponsable: 'proveedor', diasCredito: 0, anticipoPct: 50, distribuidorAutorizado: false, vigenciaHasta: enDias(6), aceptaDevoluciones: false, calificacionProveedor: 2 })
    await cotizar(r8.folio, 'Tienda Telcel Empresas', [5450], 1, 'Excelente', { garantiaMeses: 12, garantiaResponsable: 'fabricante', diasCredito: 0, anticipoPct: 0, distribuidorAutorizado: true, soporteTecnico: true, vigenciaHasta: enDias(9), aceptaDevoluciones: true, calificacionProveedor: 4 })
    await elegir(r8.folio, 'Telefonía Celular')
    await ligar(r8.folio, pTelefonia)
    await solicitarAutorizacion(r8.folio, { usuario: MAU })
    avanzar(5 * HORA)
    await registrarAprobacion({ folio: r8.folio, nivel: 'finanzas', decision: 'rechazada', comentario: 'Sin presupuesto este trimestre; reprogramar para enero.', aprobador: aprobFin })
    avanzar(1 * DIA)
    // Baja con motivo (nada se borra): el proveedor ya no se puede elegir para compras nuevas.
    await darDeBajaProveedor(pTelefonia.id, 'Sin compras de celulares en el año; se dio de baja del catálogo (demo).', { usuario: CXP })

    // 9) En espera
    const r9 = await crear(medios, ['of-medios-digitales'], [{ categoriaId: 'cat-limpieza', producto: 'Bote de basura', cantidad: 6 }])
    avanzar(1 * HORA)
    await cotizar(r9.folio, 'Limpieza Industrial del Centro', [180], 3, 'Buena', { diasCredito: 15, distribuidorAutorizado: true, vigenciaHasta: enDias(10), calificacionProveedor: 4 })
    await cambiarEstado(r9.folio, 'en_espera', { usuario: MAU, comentario: 'Esperando que la oficina confirme el mobiliario definitivo.' })
    avanzar(6 * HORA)

    // 10) Cancelada
    const r10 = await crear(ventas, ['suc-bolivia'], [{ categoriaId: 'cat-papeleria', producto: 'Plumones', cantidad: 10 }])
    avanzar(1 * HORA)
    await cambiarEstado(r10.folio, 'cancelada', { usuario: MAU, comentario: `Duplicada con ${r1.folio}.` })
    avanzar(2 * HORA)

    // 11) En autorización de ~$63,250: rebasa el tope de $10,000, así que la liga SOLO le llegó a Finanzas 1 (sin tope); Dirección recibió su aviso informativo
    const r11 = await crear(opera, ['cedis-sp-piso-1', 'cedis-sp-piso-2'], [{ categoriaId: 'cat-tecnologia', producto: 'Pc completa', cantidad: 5, distribucion: { 'cedis-sp-piso-1': 3, 'cedis-sp-piso-2': 2 } }], {
      paraQuien: 'Renovación de equipos de Operaciones CEDIS (5 PC)',
      notas: 'Equipos actuales sin soporte; afectan la captura de embarques.',
    })
    avanzar(2 * HORA)
    await cotizar(r11.folio, 'Proveedor Cómputo MX', [12200], 6, 'Excelente', { garantiaMeses: 12, garantiaResponsable: 'proveedor', diasCredito: 30, anticipoPct: 0, distribuidorAutorizado: true, soporteTecnico: true, vigenciaHasta: enDias(18), aceptaDevoluciones: true, calificacionProveedor: 4 }) // 5 × 12,650 (Dell) = $63,250; la cotización de Proveedor Cómputo MX (12,200) queda como la más barata
    await cotizar(r11.folio, 'Dell Store Empresas', [12650], 7, 'Excelente', { garantiaMeses: 12, garantiaResponsable: 'fabricante', diasCredito: 0, anticipoPct: 0, distribuidorAutorizado: true, soporteTecnico: true, vigenciaHasta: enDias(18), aceptaDevoluciones: true, calificacionProveedor: 5 })
    await cotizar(r11.folio, 'Compuservicios del Valle', [12900], 4, 'Buena', { garantiaMeses: 6, garantiaResponsable: 'proveedor', diasCredito: 0, anticipoPct: 0, distribuidorAutorizado: false, vigenciaHasta: enDias(18), aceptaDevoluciones: false, calificacionProveedor: 3 })
    await elegir(r11.folio, 'Dell Store Empresas')
    await ligar(r11.folio, pDell) // factura · tarjeta → Cuentas por pagar
    await solicitarAutorizacion(r11.folio, { usuario: MAU })
    avanzar(4 * HORA)

    // 12) En autorización de ~$125,000: también solo Finanzas 1 (sin tope) puede decidirla; Dirección recibió su aviso (la autoriza Finanzas)
    const r12 = await crear(uriel, ['of-soporte-infraestructura'], [{ categoriaId: 'cat-tecnologia', producto: 'Laptop', cantidad: 6, modeloMarca: 'Dell Latitude 5440', descripcion: '16 GB RAM / 512 GB SSD' }], {
      paraQuien: 'Plan de renovación de equipos 2026 (6 laptops)',
      notas: 'Reposición programada de equipos con más de 5 años.',
    })
    avanzar(2 * HORA)
    await cotizar(r12.folio, 'Dell Store Empresas', [20900], 7, 'Excelente', { garantiaMeses: 12, garantiaResponsable: 'fabricante', diasCredito: 0, anticipoPct: 0, distribuidorAutorizado: true, soporteTecnico: true, vigenciaHasta: enDias(25), aceptaDevoluciones: true, calificacionProveedor: 5 }) // 6 × 20,900 = $125,400
    await cotizar(r12.folio, 'Proveedor Cómputo MX', [21400], 5, 'Excelente', { garantiaMeses: 12, garantiaResponsable: 'proveedor', diasCredito: 0, anticipoPct: 0, distribuidorAutorizado: false, soporteTecnico: true, vigenciaHasta: enDias(25), aceptaDevoluciones: true, calificacionProveedor: 4 })
    await cotizar(r12.folio, 'Compuservicios del Valle', [22100], 3, 'Buena', { garantiaMeses: 6, garantiaResponsable: 'proveedor', diasCredito: 0, anticipoPct: 50, distribuidorAutorizado: true, vigenciaHasta: enDias(25), aceptaDevoluciones: false, calificacionProveedor: 3 })
    await elegir(r12.folio, 'Dell Store Empresas')
    await ligar(r12.folio, pDell) // factura · tarjeta → Cuentas por pagar
    await solicitarAutorizacion(r12.folio, { usuario: MAU })
    avanzar(1 * HORA)

    // 13) COMPRA MENOR (< $100): sin cotización, solo el REGISTRO del proveedor y el precio (3 × $22.50 = $67.50); sigue requiriendo la autorización de Finanzas,
    //     que ve la leyenda «Compra menor (menos de $100): sin cotización, solo registro». Efectivo → Tesorería.
    const r13 = await crear(ventas, ['suc-bolivia'], [{ categoriaId: 'cat-papeleria', producto: 'Cinta adhesiva transparente', cantidad: 3 }], {
      notas: 'Reposición menor de la sucursal; no amerita cotización.',
    })
    avanzar(2 * HORA)
    await registrarCompraMenor({ folio: r13.folio, proveedor: 'Papelería Marchand', precios: { [`${r13.folio}-P1`]: 22.5 }, usuario: MAU })
    await ligar(r13.folio, pMarchand) // remisión · efectivo → Tesorería
    await solicitarAutorizacion(r13.folio, { usuario: MAU })
    avanzar(1 * HORA)

    // 14) EXCEPCIÓN «adjudicación directa instruida por DGA»: monto >= $1,000 con UNA sola cotización; Finanzas ve la excepción. Tarjeta → Cuentas por pagar.
    const r14 = await crear(uriel, ['of-soporte-infraestructura'], [{ categoriaId: 'cat-tecnologia', producto: 'Licencia anual de monitoreo de red', cantidad: 1 }], {
      paraQuien: 'Monitoreo de la red de sucursales',
      notas: 'Renovación de la plataforma ya instalada.',
    })
    avanzar(2 * HORA)
    await cotizar(r14.folio, 'Dell Store Empresas', [18500], 2, 'Excelente', { garantiaMeses: 12, garantiaResponsable: 'fabricante', distribuidorAutorizado: true, soporteTecnico: true, vigenciaHasta: enDias(20), aceptaDevoluciones: false, calificacionProveedor: 5 })
    await elegir(r14.folio, 'Dell Store Empresas', {
      excepcionTipo: 'adjudicacion_directa',
      excepcionInstruidaPor: 'dga',
      excepcionCotizaciones: 'La DGA instruyó renovar con el proveedor de la plataforma ya instalada en todas las sucursales.',
    })
    await ligar(r14.folio, pDell)
    await solicitarAutorizacion(r14.folio, { usuario: MAU })
    avanzar(1 * HORA)

    // 15) EXCEPCIÓN «urgencia»: monto >= $1,000 con UNA sola cotización; Dirección recibe el aviso informativo y Finanzas ve la excepción. Efectivo → Tesorería.
    const r15 = await crear(mtto, ['suc-brasil-1'], [{ categoriaId: 'cat-ferreteria', producto: 'Bomba sumergible para cisterna', cantidad: 1 }], {
      urgente: true,
      notas: 'La cisterna de la sucursal quedó sin bombeo.',
    })
    avanzar(2 * HORA)
    await cotizar(r15.folio, 'Demiluz', [3200], 1, 'Buena', { garantiaMeses: 3, garantiaResponsable: 'proveedor', distribuidorAutorizado: true, vigenciaHasta: enDias(5), aceptaDevoluciones: false, calificacionProveedor: 3 })
    await elegir(r15.folio, 'Demiluz', {
      excepcionTipo: 'urgencia',
      excepcionCotizaciones: 'La sucursal está sin agua por la falla de la bomba; no hay tiempo de cotizar con otros proveedores.',
    })
    await ligar(r15.folio, pDemiluz)
    await solicitarAutorizacion(r15.folio, { usuario: MAU })
    avanzar(1 * HORA)
  } finally {
    setRelojCompras(null)
  }
}
