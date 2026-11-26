// Pruebas de la lógica de Compras del front (modo demo local, sin servidor): se compila src/lib/compras con esbuild (viene con Vite) y se carga en Node
// con un localStorage falso. Cubre (a) los correos que dispara el front al cambiar de estado (modo demo local) y (b) la carga inicial contra una API
// falsa (qué columnas/tablas se piden: sin fotos en línea de las partidas y sin leer cmp_tokens).   Uso:  npm run test:compras
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compras-test-'))
const ENTRADA = [
  "export * from 'src/lib/compras/index'",
  "export { sembrarComprasDemo } from 'src/lib/compras/demoSeedCompras'",
  "export { user, logout } from 'src/lib/auth'",
  "export * as sync from 'src/lib/dataSync'",
  "export { listBitacora } from 'src/lib/bitacora'",
  "export * as access from 'src/lib/access'",
  "export * as vista from 'src/lib/vistaRol'",
  "export * as pend from 'src/lib/misPendientes'",
  "export * as alertas from 'src/lib/inventario/alertasControl'",
  '',
].join('\n')
/** Compila la lógica de Compras; con `apiUrl` el cliente de datos es la API (modoLocal = false), sin él es el modo demo local. */
async function compilar(nombre, apiUrl) {
  const salida = path.join(tmp, nombre)
  await build({
    stdin: { contents: ENTRADA, resolveDir: raiz, sourcefile: 'entrada-prueba.js', loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: salida,
    logLevel: 'error',
    alias: { src: path.join(raiz, 'src'), components: path.join(raiz, 'src/components'), app: raiz },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl ?? ''),
      'import.meta.env.DEV': 'true',
      'import.meta.env.VITE_ALLOW_DEMO': '"true"',
      'import.meta.env.BASE_URL': '"/"',
      'import.meta.env.VITE_SUPABASE_URL': 'undefined',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': 'undefined',
      'process.env.SERVER': 'undefined',
    },
  })
  return import(pathToFileURL(salida).href)
}
const memoria = new Map()
globalThis.localStorage = { getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => void memoria.set(k, String(v)), removeItem: (k) => void memoria.delete(k) }
const C = await compilar('compras-local.mjs')

let total = 0
let fallos = 0
function ok(cond, nombre, extra) {
  total++
  if (!cond) {
    fallos++
    console.log(`  FALLA: ${nombre}`, extra !== undefined ? JSON.stringify(extra) : '')
  }
}
const seccion = (t) => console.log(`- ${t}`)

try {
  await C.sembrarComprasDemo()

  // ------------------------------------------------------------------------------------------------ pedir ajuste desde la app
  seccion('Finanzas pide un ajuste desde la app: Adquisiciones recibe el correo (igual que cuando lo pide por la liga)')
  const req = C.listRequisiciones().find((r) => r.estado === 'en_autorizacion' && C.aprobadoresElegibles(C.montoElegido(r.folio)).length > 0 && !C.listCotizaciones(r.folio).some((c) => c.esRegistro) && !r.excepcionTipo)
  ok(!!req, 'hay una requisición en autorización con un aprobador elegible (datos de demostración)')
  if (req) {
    const aprobador = C.aprobadoresElegibles(C.montoElegido(req.folio))[0]
    const antes = C.listNotificaciones().filter((n) => n.requisicionId === req.folio && n.tipo === 'estado_comprador').length
    const r = await C.registrarAprobacion({ folio: req.folio, nivel: 'finanzas', decision: 'ajuste', comentario: 'Pide cotización con garantía de 36 meses', aprobador: { nombre: aprobador.nombre, correo: aprobador.correo } })
    ok(r.estado === 'en_cotizacion', 'el ajuste regresa la requisición a cotización', r.estado)
    const nuevos = C.listNotificaciones().filter((n) => n.requisicionId === req.folio && n.tipo === 'estado_comprador').slice(antes)
    ok(nuevos.length >= 1, 'se encoló un correo a Adquisiciones (estado_comprador)', nuevos.length)
    const c = nuevos.find((n) => /ajuste/i.test(n.asunto))
    ok(!!c, 'el asunto dice que se pidió un ajuste', nuevos.map((n) => n.asunto))
    ok(!!c && /36 meses/.test(c.cuerpoHtml), 'el correo lleva el comentario de Finanzas')
    ok(!!c && /Abrir en la plataforma/.test(c.cuerpoHtml) && !/\/compras\/aprobar\//.test(c.cuerpoHtml), 'trae la liga a la plataforma y ninguna liga de aprobación')
    const dest = nuevos.map((n) => n.paraCorreo)
    ok(dest.every((d) => /@ejemplo\.mx$/.test(d)), 'solo a correos de ejemplo', dest)
    ok(!C.listNotificaciones().some((n) => n.requisicionId === req.folio && n.tipo === 'estado_solicitante' && /ajuste/i.test(n.asunto)), 'el solicitante NO recibe aviso de ajustes internos')
  }
  // ------------------------------------------------------------------------------------------------ catálogo de proveedores: validadores
  seccion('Validadores: RFC, CLABE con dígito verificador y CP (idénticos a los del servidor)')
  for (const rfc of ['XAXX010101000', 'XEXX010101000', 'BRR100101DM1', 'GOMA800101AB1', 'Ñu&010101AB9', 'bar 100101 dm1']) ok(C.rfcValido(rfc), `RFC válido: ${rfc}`)
  for (const rfc of ['', 'ABC', 'ABCD12345', '1234567890123', 'BRR100101DM', 'BRR100101DM12XX', 'B1R100101DM1', 'BRR1001O1DM1']) ok(!C.rfcValido(rfc), `RFC inválido: «${rfc}»`)
  ok(C.normalizarRfc(' bar 100101 dm1 ') === 'BAR100101DM1', 'el RFC se normaliza a mayúsculas y sin espacios')
  ok(C.errorRfc('ABC') !== '' && C.errorRfc('BRR100101DM1') === '' && C.errorRfc('') === '', 'mensaje de error del RFC (vacío si es válido o si no se capturó)')
  const clabes = ['000180000000001013', '000180000000002025', '000180000000003037', '000180000000004049', '002010000000000008'.slice(0, 17) + C.digitoVerificadorClabe('00201000000000000')]
  for (const c of clabes) ok(C.clabeValida(c), `CLABE válida: ${c}`)
  ok(C.digitoVerificadorClabe('00018000000000101') === 3, 'dígito verificador de 00018000000000101 = 3 (pesos 3, 7, 1)')
  ok(C.clabeValida('000 180 00000000101 3') && C.clabeValida('000-180-00000000101-3'), 'la CLABE acepta espacios y guiones al capturarla')
  ok(!C.clabeValida('000180000000001014') && !C.clabeValida('000180000000001010'), 'CLABE con el dígito verificador equivocado: inválida')
  ok(!C.clabeValida('00018000000000101') && !C.clabeValida('0001800000000010133') && !C.clabeValida('00018000000000101A') && !C.clabeValida(''), 'CLABE de 17 o 19 dígitos, con letras o vacía: inválida')
  ok(/dígito verificador/.test(C.errorClabe('000180000000001014')) && /18 dígitos/.test(C.errorClabe('0001800000')), 'mensajes de error de la CLABE')
  ok(C.cpValido('01010') && C.cpValido('99999') && !C.cpValido('1234') && !C.cpValido('123456') && !C.cpValido('1234A') && !C.cpValido(''), 'CP: exactamente 5 dígitos')
  ok(C.clabeEnmascarada('000180000000001013') === '•••• •••• •••• 1013' && C.clabeConEspacios('000180000000001013') === '000 180 00000000101 3', 'enmascarado y agrupado de la CLABE')

  // ------------------------------------------------------------------------------------------------ catálogo: semilla demo y reglas de alta
  seccion('Catálogo: semilla demo (datos ficticios válidos) y reglas de alta, duplicados y baja')
  const todosProv = C.listProveedores()
  ok(todosProv.length === 6 && todosProv.filter((p) => p.activo).length === 5, 'la semilla trae 6 proveedores (5 activos y 1 dado de baja con motivo)', todosProv.length)
  ok(todosProv.every((p) => !p.clabe || C.clabeValida(p.clabe)) && todosProv.every((p) => !p.rfc || C.rfcValido(p.rfc)) && todosProv.every((p) => !p.cp || C.cpValido(p.cp)), 'todos los datos sembrados pasan los validadores')
  ok(new Set(todosProv.map((p) => p.rfc).filter(Boolean)).size === todosProv.filter((p) => p.rfc).length, 'los RFC sembrados no se repiten')
  ok(todosProv.every((p) => p.formaPago === (p.tipo === 'remision' ? 'efectivo' : p.formaPago) && (p.tipo === 'remision' || ['transferencia', 'tarjeta'].includes(p.formaPago))), 'remisión ⇒ efectivo; factura ⇒ transferencia o tarjeta')
  const baja = todosProv.find((p) => !p.activo)
  ok(!!baja && !!baja.motivoBaja, 'el proveedor dado de baja guarda su motivo (nada se borra)', baja)
  ok(C.listProveedores({ activo: true }).length === 5 && C.buscarProveedores('telefonía').length === 0, 'un proveedor dado de baja no aparece al elegir proveedor')
  ok(C.buscarProveedores('MUEBLES')[0]?.nombreComercial === 'Muebles Ejecutivos MX' && C.buscarProveedores('mem100202')[0]?.nombreComercial === 'Muebles Ejecutivos MX', 'búsqueda por nombre (sin acentos ni mayúsculas) y por RFC')
  const rechaza = async (fn, re, nombre) => {
    try {
      await fn()
      ok(false, `${nombre}: debía rechazarse`)
    } catch (e) {
      ok(re.test(e instanceof Error ? e.message : String(e)), nombre, e instanceof Error ? e.message : e)
    }
  }
  await rechaza(() => C.crearProveedor({ nombreComercial: 'Otro con RFC repetido', tipo: 'factura', formaPago: 'tarjeta', razonSocial: 'Otro SA', rfc: 'dse100303dm3', direccionFiscal: 'Calle 1', cp: '01000' }), /Ya existe un proveedor con el RFC DSE100303DM3/, 'RFC repetido (aunque venga en minúsculas): no se duplica')
  await rechaza(() => C.crearProveedor({ nombreComercial: 'dell store empresas', tipo: 'remision', formaPago: 'efectivo' }), /Ya existe un proveedor con el nombre/, 'nombre repetido: no se duplica')
  await rechaza(() => C.crearProveedor({ nombreComercial: 'Fact sin datos', tipo: 'factura', formaPago: 'tarjeta' }), /razón social/, 'factura sin razón social: rechazada')
  await rechaza(() => C.crearProveedor({ nombreComercial: 'Fact sin clabe', tipo: 'factura', formaPago: 'transferencia', razonSocial: 'X SA', rfc: 'XYZ100101AB1', direccionFiscal: 'Calle 1', cp: '01000' }), /CLABE es obligatoria/, 'factura con transferencia exige CLABE')
  await rechaza(() => C.crearProveedor({ nombreComercial: 'Fact clabe mala', tipo: 'factura', formaPago: 'transferencia', razonSocial: 'X SA', rfc: 'XYZ100101AB1', direccionFiscal: 'Calle 1', cp: '01000', clabe: '000180000000001014' }), /dígito verificador/, 'CLABE con dígito verificador mal: rechazada')
  await rechaza(() => C.crearProveedor({ nombreComercial: 'Rem rfc malo', tipo: 'remision', formaPago: 'efectivo', rfc: 'MAL' }), /RFC no es válido/, 'remisión: lo opcional se valida si se captura')
  await rechaza(() => C.crearProveedor({ nombreComercial: 'Fact cp malo', tipo: 'factura', formaPago: 'tarjeta', razonSocial: 'X SA', rfc: 'XYZ100101AB1', direccionFiscal: 'Calle 1', cp: '123' }), /código postal/, 'CP de 3 dígitos: rechazado')
  // Normalización ANTES de enviar: el servidor solo pasa el RFC a mayúsculas y valida la longitud antes de normalizar
  const norm = await C.crearProveedor({ nombreComercial: 'Normalización de prueba', tipo: 'factura', formaPago: 'transferencia', razonSocial: 'Norm DEMO SA', rfc: ' nor-100101 dm1 ', clabe: '000-180 00000000101-3', direccionFiscal: 'Calle N 1', cp: ' 01 010 ' })
  ok(norm.rfc === 'NOR100101DM1' && norm.clabe === '000180000000001013' && norm.cp === '01010', 'RFC (sin espacios ni guiones, en mayúsculas), CLABE (solo dígitos) y CP (sin espacios) se normalizan antes de guardar/enviar', norm)
  ok(C.normalizarRfc('abc-123 456') === 'ABC123456', 'normalizarRfc quita espacios y guiones')
  await C.crearProveedor({ nombreComercial: 'Público en general (prueba)', tipo: 'remision', formaPago: 'efectivo', rfc: 'XAXX010101000' })
  await rechaza(() => C.crearProveedor({ nombreComercial: 'Otro público en general', tipo: 'remision', formaPago: 'efectivo', rfc: 'xaxx 010101 000' }), /Ya existe un proveedor con el RFC XAXX010101000/, 'el RFC genérico también es único: solo un proveedor puede usarlo')
  const remMin = await C.crearProveedor({ nombreComercial: 'Taller de prueba (remisión)', tipo: 'remision', formaPago: 'tarjeta' })
  ok(remMin.formaPago === 'efectivo' && remMin.activo === true && remMin.id.startsWith('prv-'), 'remisión: solo el nombre alcanza y la forma de pago es siempre efectivo', remMin)
  await rechaza(() => C.darDeBajaProveedor(remMin.id, ''), /motivo/i, 'la baja exige motivo')

  // ------------------------------------------------------------------------------------------------ catálogo: permisos por rol y bitácora
  seccion('Catálogo: quién ve, crea y modifica (Adquisiciones NO toca datos fiscales ni bancarios de un proveedor existente)')
  const A_ = C.access
  for (const r of ['admin', 'adquisiciones', 'finanzas', 'tesoreria', 'cuentas_por_pagar']) ok(A_.canViewProveedores(r) && A_.canViewSeccion(r, 'proveedores'), `${r} ve el catálogo (menú y ruta)`)
  for (const r of ['capturista', 'mantenimiento', 'talento', 'solicitante', undefined]) ok(!A_.canViewProveedores(r) && !A_.canViewSeccion(r, 'proveedores'), `${r} NO ve el catálogo`)
  ok(A_.canCreateProveedor('adquisiciones') && A_.canCreateProveedor('admin') && A_.canCreateProveedor('cuentas_por_pagar') && !A_.canCreateProveedor('finanzas') && !A_.canCreateProveedor('tesoreria'), 'crean proveedores: Adquisiciones, Dirección y Cuentas por pagar')
  ok(A_.canEditDatosFiscalesProveedor('cuentas_por_pagar') && A_.canEditDatosFiscalesProveedor('finanzas') && A_.canEditDatosFiscalesProveedor('admin') && !A_.canEditDatosFiscalesProveedor('adquisiciones') && !A_.canEditDatosFiscalesProveedor('tesoreria'), 'datos fiscales/bancarios: Cuentas por pagar, Finanzas y Dirección (no Adquisiciones)')
  ok(A_.canViewClabe('cuentas_por_pagar') && A_.canViewClabe('finanzas') && A_.canViewClabe('admin') && !A_.canViewClabe('adquisiciones') && !A_.canViewClabe('tesoreria'), 'la CLABE completa solo la ven quienes pueden corregirla')
  const marchand = C.listProveedores().find((p) => p.nombreComercial === 'Papelería Marchand')
  const roldan = C.listProveedores().find((p) => p.nombreComercial === 'Bolsas Roldan Reyes')
  C.user.value = { id: 'u-adq', username: 'adquisiciones', displayName: 'Adquisiciones (prueba)', role: 'adquisiciones' }
  await rechaza(() => C.actualizarProveedor(roldan.id, { razonSocial: 'Otra razón SA' }), /Quien compra no cambia datos fiscales/, 'Adquisiciones no cambia la razón social de un proveedor existente')
  await rechaza(() => C.actualizarProveedor(roldan.id, { rfc: 'ZZZ100101AB1' }), /Quien compra no cambia datos fiscales/, 'Adquisiciones no cambia el RFC')
  await rechaza(() => C.actualizarProveedor(roldan.id, { clabe: '000180000000002025' }), /Quien compra no cambia datos fiscales/, 'Adquisiciones no cambia la CLABE')
  await rechaza(() => C.actualizarProveedor(roldan.id, { tipo: 'remision' }), /Quien compra no cambia datos fiscales/, 'Adquisiciones no cambia el tipo')
  await C.actualizarProveedor(roldan.id, { notas: 'Entrega en 48 h', cp: '01011' })
  ok(C.getProveedor(roldan.id).notas === 'Entrega en 48 h' && C.getProveedor(roldan.id).cp === '01011', 'Adquisiciones sí edita notas, dirección y CP')
  const nuevoAdq = await C.crearProveedor({ nombreComercial: 'Proveedor alta Adquisiciones', tipo: 'factura', formaPago: 'tarjeta', razonSocial: 'Alta Adq DEMO SA', rfc: 'AAD100606DM6', direccionFiscal: 'Calle Alta 1', cp: '06060' })
  ok(nuevoAdq.creadoPor === 'Adquisiciones (prueba)', 'Adquisiciones sí da de alta proveedores (queda el actor)', nuevoAdq.creadoPor)
  await rechaza(() => C.darDeBajaProveedor(nuevoAdq.id, 'Intento de Adquisiciones'), /Adquisiciones no/, 'Adquisiciones NO da de baja proveedores')
  ok(!A_.canDisableProveedor('adquisiciones') && !A_.canDisableProveedor('tesoreria') && A_.canDisableProveedor('admin') && A_.canDisableProveedor('finanzas') && A_.canDisableProveedor('cuentas_por_pagar'), 'baja y reactivación: solo Dirección, Finanzas y Cuentas por pagar')
  C.user.value = { id: 'u-fin', username: 'finanzas', displayName: 'Finanzas (prueba)', role: 'finanzas' }
  await C.darDeBajaProveedor(nuevoAdq.id, 'Baja por Finanzas')
  C.user.value = { id: 'u-adq', username: 'adquisiciones', displayName: 'Adquisiciones (prueba)', role: 'adquisiciones' }
  await rechaza(() => C.reactivarProveedor(nuevoAdq.id), /Adquisiciones no/, 'Adquisiciones NO reactiva proveedores')
  C.user.value = { id: 'u-fin', username: 'finanzas', displayName: 'Finanzas (prueba)', role: 'finanzas' }
  await C.reactivarProveedor(nuevoAdq.id)
  ok(C.getProveedor(nuevoAdq.id).activo === true, 'Finanzas sí da de baja y reactiva')
  C.user.value = { id: 'u-tes', username: 'tesoreria', displayName: 'Tesorería (prueba)', role: 'tesoreria' }
  await rechaza(() => C.crearProveedor({ nombreComercial: 'Alta de Tesorería', tipo: 'remision', formaPago: 'efectivo' }), /no da de alta/, 'Tesorería no da de alta proveedores')
  await rechaza(() => C.actualizarProveedor(marchand.id, { notas: 'x' }), /no modifica/, 'Tesorería no modifica proveedores')
  C.user.value = { id: 'u-cxp', username: 'cuentas', displayName: 'Cuentas por pagar (prueba)', role: 'cuentas_por_pagar' }
  const clabeAntes = C.getProveedor(roldan.id).clabe
  await C.actualizarProveedor(roldan.id, { clabe: '000180000000004049', rfc: 'brr100101dm9' })
  const rolNuevo = C.getProveedor(roldan.id)
  ok(rolNuevo.clabe === '000180000000004049' && rolNuevo.rfc === 'BRR100101DM9', 'Cuentas por pagar corrige CLABE y RFC (el RFC se normaliza a mayúsculas)', rolNuevo)
  const bit = C.listBitacora({ tabla: 'cmp_proveedores' }).find((b) => b.registroId === roldan.id && b.accion === 'cambio' && b.despues && 'clabe' in b.despues)
  ok(!!bit && bit.antes.clabe === clabeAntes && bit.despues.clabe === '000180000000004049' && bit.usuario === 'Cuentas por pagar (prueba)', 'el cambio de CLABE/RFC queda en la bitácora con actor y valores antes/después', bit)
  ok(!!bit && bit.antes.rfc === 'BRR100101DM1' && bit.despues.rfc === 'BRR100101DM9', 'el cambio de RFC también deja antes/después', bit)
  await rechaza(() => C.actualizarProveedor(roldan.id, { rfc: 'DSE100303DM3' }), /otro proveedor con el RFC/, 'no se puede repetir el RFC de otro proveedor al editar')
  await C.actualizarProveedor(roldan.id, { clabe: clabeAntes, rfc: 'BRR100101DM1' })
  await C.darDeBajaProveedor(remMin.id, 'Prueba de baja con motivo')
  ok(!C.getProveedor(remMin.id).activo && C.getProveedor(remMin.id).motivoBaja === 'Prueba de baja con motivo', 'baja con motivo: queda inactivo y NO se borra')
  ok(C.listBitacora({ tabla: 'cmp_proveedores' }).some((b) => b.registroId === remMin.id && b.accion === 'desactivación'), 'la baja queda en la bitácora')
  await C.reactivarProveedor(remMin.id)
  ok(C.getProveedor(remMin.id).activo === true && C.getProveedor(remMin.id).motivoBaja === undefined, 'reactivar limpia el motivo de la baja')
  C.user.value = null

  // ------------------------------------------------------------------------------------------------ compuerta de la autorización
  seccion('Compuerta: sin proveedor activo y completo no se puede pedir la autorización; desde «autorizada» ya no cambia')
  const MSG = 'Registra al proveedor elegido en el catálogo (razón social, RFC, dirección fiscal, CP y CLABE si es transferencia) antes de pedir la autorización.'
  ok(C.MSG_PROVEEDOR_INCOMPLETO === MSG, 'el mensaje de la compuerta es el del SPEC')
  const solic = C.listParticipantes({ rol: 'solicitante' })[0]
  let seq = 0
  /** Requisición nueva hasta «en cotización» con la cotización ganadora elegida (aún SIN proveedor del catálogo). */
  const nuevaCotizada = async (proveedorCotizado, precio = 100) => {
    const r = await C.crearRequisicionPublica({ solicitanteId: solic.id, ubicaciones: ['suc-bolivia'], partidas: [{ categoriaId: 'cat-papeleria', producto: `Producto de prueba ${++seq}`, cantidad: 2 }] })
    await C.addCotizacion({ folio: r.folio, proveedor: proveedorCotizado, precios: { [`${r.folio}-P1`]: precio }, tiempoEntregaDias: 2, registradoPor: 'Prueba' })
    await C.elegirProveedor(r.folio, C.listCotizaciones(r.folio)[0].id, { usuario: 'Prueba' })
    return r
  }
  const aprobador = () => C.aprobadoresElegibles(200)[0]
  const aAutorizada = async (r) => {
    await C.solicitarAutorizacion(r.folio, { usuario: 'Prueba' })
    const ap = aprobador()
    await C.registrarAprobacion({ folio: r.folio, nivel: 'finanzas', decision: 'aprobada', aprobador: { nombre: ap.nombre, correo: ap.correo } })
    return C.getRequisicion(r.folio)
  }
  const g1 = await nuevaCotizada('Proveedor de prueba sin catálogo')
  ok(C.motivoNoPuedePasarA(g1.folio, 'en_autorizacion') === MSG, 'sin proveedor ligado: motivoNoPuedePasarA devuelve el mensaje del SPEC', C.motivoNoPuedePasarA(g1.folio, 'en_autorizacion'))
  await rechaza(() => C.solicitarAutorizacion(g1.folio, { usuario: 'Prueba' }), /Registra al proveedor elegido en el catálogo/, 'solicitarAutorizacion sin proveedor: rechazada')
  ok(C.getRequisicion(g1.folio).estado === 'en_cotizacion', 'la requisición se queda en cotización')
  await rechaza(() => C.vincularProveedor(g1.folio, 'prv-no-existe'), /no está en el catálogo/, 'no se liga un proveedor que no existe')
  await rechaza(() => C.vincularProveedor(g1.folio, baja.id), /dado de baja/, 'no se liga un proveedor dado de baja')
  const dell = C.listProveedores().find((p) => p.nombreComercial === 'Dell Store Empresas')
  await rechaza(() => C.vincularProveedor(g1.folio, dell.id, 'efectivo'), /Con factura/, 'factura no admite efectivo')
  await C.vincularProveedor(g1.folio, dell.id, 'transferencia')
  ok(C.getRequisicion(g1.folio).formaPago === 'transferencia' && C.getRequisicion(g1.folio).proveedorId === dell.id && C.getRequisicion(g1.folio).proveedorElegido === 'Dell Store Empresas', 'al ligar: proveedorId, formaPago de la compra (puede diferir de la habitual) y nombre sincronizado')
  ok(/Falta o está mal: CLABE/.test(C.motivoNoPuedePasarA(g1.folio, 'en_autorizacion') ?? ''), 'Dell (sin CLABE) con transferencia: la compuerta pide la CLABE', C.motivoNoPuedePasarA(g1.folio, 'en_autorizacion'))
  await C.vincularProveedor(g1.folio, dell.id, 'tarjeta')
  ok(C.motivoNoPuedePasarA(g1.folio, 'en_autorizacion') === null, 'Dell con tarjeta (sin CLABE) está completo: la compuerta se abre')
  const g2 = await nuevaCotizada('Remisión de prueba')
  await C.vincularProveedor(g2.folio, remMin.id)
  ok(C.getRequisicion(g2.folio).formaPago === 'efectivo' && C.motivoNoPuedePasarA(g2.folio, 'en_autorizacion') === null, 'remisión (solo nombre) con efectivo: la compuerta se abre')
  await C.darDeBajaProveedor(remMin.id, 'Se dio de baja antes de pedir la autorización')
  ok(/dado de baja/.test(C.motivoNoPuedePasarA(g2.folio, 'en_autorizacion') ?? ''), 'si el proveedor ligado se da de baja, la compuerta se cierra', C.motivoNoPuedePasarA(g2.folio, 'en_autorizacion'))
  await C.reactivarProveedor(remMin.id)
  await rechaza(() => C.actualizarProveedor(remMin.id, { tipo: 'factura', formaPago: 'tarjeta' }), /razón social/, 'cambiar una remisión a factura exige los datos de factura')
  // Forma de pago incoherente con el tipo (requisición heredada con efectivo y un proveedor de factura)
  const g3 = await nuevaCotizada('Proveedor incoherente')
  await C.actualizarRequisicion(g3.folio, { proveedorId: dell.id })
  ok(/no corresponde al proveedor/.test(C.motivoNoPuedePasarA(g3.folio, 'en_autorizacion') ?? ''), 'efectivo con un proveedor de factura: la compuerta lo señala', C.motivoNoPuedePasarA(g3.folio, 'en_autorizacion'))
  // Inmutabilidad desde «autorizada»
  const prov2 = await C.crearProveedor({ nombreComercial: 'Proveedor prueba transferencia', tipo: 'factura', formaPago: 'transferencia', razonSocial: 'Prueba Transf DEMO SA', rfc: 'PTR100707DM7', clabe: '000180000000004049', direccionFiscal: 'Calle Prueba 7', cp: '07070' })
  const gT = await nuevaCotizada('Proveedor prueba transferencia')
  await C.vincularProveedor(gT.folio, prov2.id)
  const gTaut = await aAutorizada(gT)
  ok(gTaut.estado === 'autorizada' && gTaut.formaPago === 'transferencia', 'con proveedor completo la requisición se autoriza y conserva transferencia')
  await rechaza(() => C.actualizarRequisicion(gT.folio, { formaPago: 'efectivo' }), /quedan bloqueados/, 'desde «autorizada» tampoco cambia la forma de pago')
  await rechaza(() => C.actualizarRequisicion(gT.folio, { proveedorId: dell.id }), /quedan bloqueados/, 'desde «autorizada» no cambia el proveedor')
  await rechaza(() => C.vincularProveedor(gT.folio, dell.id), /quedan bloqueados/, 'vincularProveedor tampoco funciona desde «autorizada»')
  await C.actualizarRequisicion(gT.folio, { formaPago: 'transferencia' })
  ok(true, 'reescribir el mismo valor no es un cambio (el flujo de dinero no se bloquea)')
  // El servidor bloquea el proveedor y la forma de pago DESDE «en autorización» (y en espera): solo se cambian en recibida y en_cotizacion.
  await C.vincularProveedor(g1.folio, dell.id, 'tarjeta')
  await C.solicitarAutorizacion(g1.folio, { usuario: 'Prueba' })
  ok(C.getRequisicion(g1.folio).estado === 'en_autorizacion' && C.proveedorCongelado(g1.folio), 'en autorización el proveedor ya está bloqueado')
  await rechaza(() => C.actualizarRequisicion(g1.folio, { formaPago: 'transferencia' }), /quedan bloqueados/, 'en autorización no cambia la forma de pago')
  await rechaza(() => C.actualizarRequisicion(g1.folio, { proveedorId: prov2.id }), /quedan bloqueados/, 'en autorización no cambia el proveedor')
  await rechaza(() => C.vincularProveedor(g1.folio, prov2.id), /quedan bloqueados/, 'vincularProveedor tampoco funciona en autorización')
  await C.cambiarEstado(g1.folio, 'en_espera', { usuario: 'Prueba', comentario: 'Prueba de espera' })
  await rechaza(() => C.actualizarRequisicion(g1.folio, { formaPago: 'transferencia' }), /quedan bloqueados/, 'en espera el proveedor sigue bloqueado')
  await C.reanudarRequisicion(g1.folio, { usuario: 'Prueba' })
  const apr1 = aprobador()
  await C.registrarAprobacion({ folio: g1.folio, nivel: 'finanzas', decision: 'ajuste', comentario: 'Cambiar proveedor', aprobador: { nombre: apr1.nombre, correo: apr1.correo } })
  ok(C.getRequisicion(g1.folio).estado === 'en_cotizacion' && !C.proveedorCongelado(g1.folio), 'si regresa a cotización (ajuste) se vuelve a permitir cambiar el proveedor')
  await C.vincularProveedor(g1.folio, prov2.id, 'transferencia')
  ok(C.getRequisicion(g1.folio).proveedorId === prov2.id, 'tras el ajuste sí se cambia el proveedor')

  // ------------------------------------------------------------------------------------------------ ruteo por forma de pago
  seccion('Ruteo: efectivo → Tesorería; transferencia y tarjeta → Cuentas por pagar (avisos, movimientos y roles)')
  const correosDe = (folio, tipo) => C.listNotificaciones({ folio, tipo })
  const CXP_MAIL = 'cuentas.demo@ejemplo.mx'
  const TES_MAIL = 'tesoreria.demo@ejemplo.mx'
  const pagoT = correosDe(gT.folio, 'pago_pendiente')
  ok(pagoT.some((n) => n.paraCorreo === CXP_MAIL) && !pagoT.some((n) => n.paraCorreo === TES_MAIL), 'transferencia autorizada: el aviso pago_pendiente va a Cuentas por pagar y no a Tesorería', pagoT.map((n) => n.paraCorreo))
  ok(correosDe(gT.folio, 'tesoreria_fondos').length === 0, 'transferencia: NO sale el aviso tesoreria_fondos')
  const html = pagoT.find((n) => n.paraCorreo === CXP_MAIL)?.cuerpoHtml ?? ''
  ok(/Prueba Transf DEMO SA/.test(html) && /PTR100707DM7/.test(html) && /Transferencia/.test(html), 'el aviso de pago lleva proveedor, razón social, RFC y forma de pago')
  ok(pagoT.every((n) => n.asunto === `Pago pendiente · ${gT.folio}` && n.tipo === 'pago_pendiente' && n.requisicionId === gT.folio), 'asunto del aviso: «Pago pendiente · <folio>»', pagoT.map((n) => n.asunto))
  ok(!/000180000000004049/.test(html) && !/Calle Prueba 7/.test(html) && !/clabe/i.test(html), 'el aviso de pago NO lleva CLABE ni dirección fiscal')
  const nPendiente = pagoT.find((n) => n.paraCorreo === CXP_MAIL)
  ok(nPendiente.tipo === 'pago_pendiente' && !!nPendiente.paraNombre && !!nPendiente.asunto && !!nPendiente.cuerpoHtml && nPendiente.requisicionId === gT.folio, 'la fila del aviso trae para, nombre, asunto, cuerpo_html, tipo y requisicion_id (como tesoreria_fondos)', nPendiente)
  // efectivo
  const gE = await nuevaCotizada('Remisión efectivo')
  await C.vincularProveedor(gE.folio, marchand.id)
  await aAutorizada(gE)
  ok(correosDe(gE.folio, 'tesoreria_fondos').some((n) => n.paraCorreo === TES_MAIL) && correosDe(gE.folio, 'pago_pendiente').length === 0, 'efectivo autorizado: aviso tesoreria_fondos a Tesorería y ningún pago_pendiente')
  // tarjeta
  const gK = await nuevaCotizada('Dell Store Empresas')
  await C.vincularProveedor(gK.folio, dell.id, 'tarjeta')
  await aAutorizada(gK)
  ok(correosDe(gK.folio, 'pago_pendiente').some((n) => n.paraCorreo === CXP_MAIL) && correosDe(gK.folio, 'tesoreria_fondos').length === 0, 'tarjeta autorizada: pago_pendiente a Cuentas por pagar')
  // las requisiciones sembradas
  const r4 = C.listRequisiciones().find((r) => r.proveedorElegido === 'Muebles Ejecutivos MX')
  ok(r4.estado === 'autorizada' && r4.formaPago === 'transferencia' && correosDe(r4.folio, 'pago_pendiente').length >= 1, 'la autorizada sembrada (Muebles Ejecutivos MX) espera el pago de Cuentas por pagar')
  // Movimientos: roles y reglas
  C.user.value = { id: 'u-tes', username: 'tesoreria', displayName: 'Tesorería (prueba)', role: 'tesoreria' }
  await rechaza(() => C.registrarTransferencia({ folio: gT.folio, monto: 200, referencia: 'TRF-1', archivoUrl: 'data:image/png;base64,AAAA' }), /Solo Cuentas por pagar/, 'Tesorería NO registra transferencias')
  await rechaza(() => C.registrarPagoTarjeta({ folio: gK.folio, monto: 200, referencia: '1234', archivoUrl: 'data:image/png;base64,AAAA' }), /Solo Cuentas por pagar/, 'Tesorería NO registra pagos con tarjeta')
  await rechaza(() => C.registrarEntregaEfectivo({ folio: gT.folio, monto: 200, folioCajaChica: 'CC-1', familiaGasto: 'X', receptor: 'Y' }), /Cuentas por pagar, no Tesorería/, 'Tesorería no entrega efectivo de una compra por transferencia')
  C.user.value = { id: 'u-cxp', username: 'cuentas', displayName: 'Cuentas por pagar (prueba)', role: 'cuentas_por_pagar' }
  await rechaza(() => C.registrarEntregaEfectivo({ folio: gE.folio, monto: 200, folioCajaChica: 'CC-1', familiaGasto: 'X', receptor: 'Y' }), /Solo Tesorería registra la entrega de efectivo/, 'Cuentas por pagar NO entrega efectivo')
  await rechaza(() => C.registrarTransferencia({ folio: gE.folio, monto: 200, referencia: 'TRF-1', archivoUrl: 'data:image/png;base64,AAAA' }), /se paga en efectivo/, 'no se registra una transferencia en una compra de efectivo')
  await rechaza(() => C.registrarTransferencia({ folio: gK.folio, monto: 200, referencia: 'TRF-1', archivoUrl: 'data:image/png;base64,AAAA' }), /se paga por tarjeta/, 'no se registra una transferencia en una compra con tarjeta')
  await rechaza(() => C.registrarPagoTarjeta({ folio: gK.folio, monto: 200, referencia: '4111111111111111', archivoUrl: 'data:image/png;base64,AAAA' }), /ÚLTIMOS 4 dígitos/, 'el número completo de la tarjeta se rechaza')
  await rechaza(() => C.registrarPagoTarjeta({ folio: gK.folio, monto: 200, referencia: '12A4', archivoUrl: 'data:image/png;base64,AAAA' }), /ÚLTIMOS 4 dígitos/, 'la tarjeta solo admite 4 dígitos')
  await rechaza(() => C.registrarPagoTarjeta({ folio: gK.folio, monto: 200, referencia: '1234' }), /comprobante/, 'el pago exige comprobante')
  await rechaza(() => C.registrarTransferencia({ folio: gT.folio, monto: 200, referencia: '', archivoUrl: 'data:image/png;base64,AAAA' }), /folio o la clave de rastreo/, 'la transferencia exige referencia')
  await rechaza(() => C.registrarTransferencia({ folio: gT.folio, monto: 200, referencia: 'TRF-1', archivoUrl: 'data:image/png;base64,AAAA', fechaPago: '2999-01-01' }), /futura/, 'la fecha de pago no puede ser futura')
  await rechaza(() => C.registrarTransferencia({ folio: gT.folio, monto: 99999, referencia: 'TRF-1', archivoUrl: 'data:image/png;base64,AAAA' }), /rebasa lo autorizado/, 'no se paga más de lo autorizado')
  ok(C.listMovimientosDinero(gK.folio).every((m) => m.tipo === 'solicitud'), 'los intentos rechazados no dejan movimientos (solo la solicitud automática)')
  const movT = await C.registrarTransferencia({ folio: gT.folio, monto: 200, referencia: 'TRF-0099', archivoUrl: 'data:image/png;base64,AAAA', fechaPago: '2020-01-15' })
  ok(movT.tipo === 'transferencia' && movT.referencia === 'TRF-0099' && movT.folioCajaChica === undefined && movT.registradoPor === 'Cuentas por pagar (prueba)' && movT.receptor === 'Proveedor prueba transferencia' && new Date(movT.fecha).getFullYear() === 2020, 'transferencia: referencia, fecha de pago, comprobante, beneficiario y actor', movT)
  ok(C.getRequisicion(gT.folio).estado === 'fondeada', 'al registrar el pago la requisición pasa a «Fondeada»')
  ok(correosDe(gT.folio, 'estado_comprador').some((n) => /Cuentas por pagar registró el pago/.test(n.cuerpoHtml)), 'Adquisiciones recibe «Cuentas por pagar registró el pago»')
  const movK = await C.registrarPagoTarjeta({ folio: gK.folio, monto: 200, referencia: '1234', archivoUrl: 'data:image/png;base64,AAAA' })
  ok(movK.tipo === 'pago_tarjeta' && movK.referencia === '1234' && movK.folioCajaChica === undefined && /terminación 1234/.test(movK.notas) && C.getRequisicion(gK.folio).estado === 'fondeada', 'tarjeta: movimiento pago_tarjeta con SOLO los últimos 4 dígitos en `referencia` (folio_caja_chica queda para efectivo)', movK)
  ok(!/\d{13,19}/.test(JSON.stringify({ ...movK, id: '', fecha: 0 })), 'no queda ningún número de tarjeta completo en el movimiento')
  const dK = C.resumenDinero(gK.folio)
  ok(dK.entregado === 200 && dK.cambioEsperado === 0, 'el pago con tarjeta cuenta como dinero entregado y no deja «cambio por devolver»', dK)
  C.user.value = { id: 'u-tes', username: 'tesoreria', displayName: 'Tesorería (prueba)', role: 'tesoreria' }
  const movE = await C.registrarEntregaEfectivo({ folio: gE.folio, monto: 200, folioCajaChica: 'CC-0777', familiaGasto: 'Papelería', receptor: 'Adquisiciones (prueba)' })
  ok(movE.folioCajaChica === 'CC-0777' && movE.referencia === undefined, 'el efectivo conserva folio_caja_chica y no usa `referencia`')
  ok(movE.tipo === 'entrega_efectivo' && C.getRequisicion(gE.folio).estado === 'fondeada', 'Tesorería sí entrega el efectivo de una compra en efectivo (flujo de caja chica intacto)')
  // cancelación con dinero entregado: el aviso va a quien corresponde
  C.user.value = null
  await C.cambiarEstado(gT.folio, 'cancelada', { usuario: 'Prueba', comentario: 'Prueba de cancelación' })
  const canT = correosDe(gT.folio, 'estado_comprador').filter((n) => /cancelada con pago registrado/i.test(n.asunto))
  ok(canT.some((n) => n.paraCorreo === CXP_MAIL) && !canT.some((n) => n.paraCorreo === TES_MAIL), 'cancelar con pago por transferencia: el aviso va a Cuentas por pagar (no a Tesorería)', canT.map((n) => n.paraCorreo))
  await C.cambiarEstado(gE.folio, 'cancelada', { usuario: 'Prueba', comentario: 'Prueba de cancelación' })
  const canE = correosDe(gE.folio, 'estado_comprador').filter((n) => /cancelada con dinero entregado/i.test(n.asunto))
  ok(canE.some((n) => n.paraCorreo === TES_MAIL) && !canE.some((n) => n.paraCorreo === CXP_MAIL), 'cancelar con efectivo entregado: el aviso va a Tesorería (no a Cuentas por pagar)', canE.map((n) => n.paraCorreo))

  // ------------------------------------------------------------------------------------------------ rol cuentas_por_pagar: vistas y pendientes
  seccion('Rol Cuentas por pagar: qué ve, su cola «Pagos por hacer» y que Tesorería solo ve el efectivo')
  ok(A_.canViewCompras('cuentas_por_pagar') && A_.canViewComprasDinero('cuentas_por_pagar') && !A_.canViewComprasGlobal('cuentas_por_pagar') && A_.canRegistrarPago('cuentas_por_pagar') && !A_.canRegistrarPago('tesoreria') && !A_.canRegistrarPago('admin'), 'Cuentas por pagar: ve Compras con dinero, sin reportes globales, y es el único que registra pagos')
  ok(A_.dominiosVisibles('cuentas_por_pagar').length === 0 && !A_.canViewSeccion('cuentas_por_pagar', 'sistemas') && !A_.canViewSeccion('cuentas_por_pagar', 'solicitudes') && !A_.canViewSeccion('cuentas_por_pagar', 'directorio') && A_.canViewSeccion('cuentas_por_pagar', 'compras') && A_.canViewSeccion('cuentas_por_pagar', 'inicio'), 'Cuentas por pagar no ve inventario, solicitudes ni directorio')
  ok(A_.homeSecciones('cuentas_por_pagar').pendientes === true && A_.homeSecciones('cuentas_por_pagar').compras === null, 'Inicio de Cuentas por pagar: sus pendientes, sin franja de gasto')
  ok(!A_.pestanasRequisicion('cuentas_por_pagar').includes('cotizaciones') && A_.pestanasRequisicion('cuentas_por_pagar').includes('dinero'), 'pestañas de la requisición para Cuentas por pagar: sin cotizaciones, con dinero')
  const todasReq = C.listRequisiciones()
  const visTes = todasReq.filter((r) => C.vista.requisicionVisible('tesoreria', r))
  const visCxp = todasReq.filter((r) => C.vista.requisicionVisible('cuentas_por_pagar', r))
  ok(visTes.length > 0 && visTes.every((r) => r.formaPago === 'efectivo'), 'Tesorería solo ve requisiciones de efectivo', visTes.map((r) => r.formaPago))
  ok(visCxp.length > 0 && visCxp.every((r) => r.formaPago !== 'efectivo' && ['autorizada', 'fondeada', 'comprada', 'entregada'].includes(r.estado)), 'Cuentas por pagar solo ve las de transferencia o tarjeta ya autorizadas', visCxp.map((r) => `${r.formaPago}/${r.estado}`))
  const porPagar = todasReq.filter((r) => r.estado === 'autorizada' && r.formaPago !== 'efectivo')
  const pCxp = C.pend.getMisPendientes('cuentas_por_pagar').find((p) => p.id === 'pagos-por-hacer')
  ok(!!pCxp && pCxp.conteo === porPagar.length && /La más antigua/.test(pCxp.detalle) && porPagar.length >= 1, '«Pagos por hacer»: las autorizadas de transferencia/tarjeta sin pago, con la más antigua', pCxp)
  ok(C.pend.getMisPendientes('cuentas_por_pagar').every((p) => !/fondear/i.test(p.titulo)), 'Cuentas por pagar no recibe pendientes de fondeo de efectivo')
  const pTes = C.pend.getMisPendientes('tesoreria')
  const porFondear = todasReq.filter((r) => r.estado === 'autorizada' && r.formaPago === 'efectivo')
  ok((pTes.find((p) => p.id === 'autorizadas-por-fondear')?.conteo ?? 0) === porFondear.length, 'Tesorería: «Autorizadas por fondear» cuenta solo las de efectivo', { esperado: porFondear.length, pTes })
  ok(C.pend.rolTienePendientes('cuentas_por_pagar'), 'el rol tiene pendientes (Inicio y campana)')
  ok(C.pend.getMisPendientes('tesoreria').every((p) => p.id !== 'pagos-por-hacer'), 'Tesorería no ve «Pagos por hacer»')

  // ------------------------------------------------------------------------------------------------ liga pública: proveedor sin datos bancarios
  seccion('Liga pública de aprobación: el proveedor sin CLABE ni dirección fiscal')
  const r3 = C.listRequisiciones().find((r) => r.proveedorElegido === 'Bolsas Roldan Reyes')
  const enlace = C.listEnlacesAprobacion(r3.folio).find((e) => !e.usado)
  const vista = await C.verParaAprobar(enlace.token)
  ok(vista?.proveedor?.nombreComercial === 'Bolsas Roldan Reyes' && /DEMO S\.A\./.test(vista.proveedor.razonSocial) && vista.proveedor.rfc === 'BRR100101DM1' && vista.proveedor.tipo === 'factura' && vista.proveedor.formaPago === 'transferencia' && vista.proveedor.destino === 'cuentas_por_pagar', 'la liga trae nombre comercial, razón social, RFC, tipo, forma de pago y destino', vista?.proveedor)
  const json = JSON.stringify(vista)
  ok(!/000180000000/.test(json) && !/clabe/i.test(json) && !/Calle Ejemplo/.test(json) && !/direccion/i.test(Object.keys(vista.proveedor).join(',')), 'la liga NO expone CLABE ni dirección fiscal')
  ok(!/000180000000/.test(C.listNotificaciones().map((n) => n.cuerpoHtml).join('')), 'ningún correo (de ninguna requisición) lleva una CLABE')
  const antesRech = (await C.verParaAprobar(enlace.token)).proveedor.destino
  ok(antesRech === 'cuentas_por_pagar', 'el destino de la liga es Cuentas por pagar para una transferencia')
  const rE = C.listRequisiciones().find((r) => r.proveedorElegido === 'Demiluz')
  ok(C.motivoProveedorIncompleto(rE) === null && C.destinoPagoDe(rE) === 'tesoreria', 'Demiluz (remisión, solo nombre) está completo y va a Tesorería')
  const seg = await C.consultarRequisicionPublica(r3.folio, r3.token)
  ok(!/proveedor|rfc|clabe|Roldan/i.test(JSON.stringify(seg)), 'el seguimiento público del solicitante NO expone nada del proveedor')
  ok(C.destinoDePago('efectivo') === 'tesoreria' && C.destinoDePago('transferencia') === 'cuentas_por_pagar' && C.destinoDePago('tarjeta') === 'cuentas_por_pagar', 'destinoDePago: efectivo → Tesorería; transferencia y tarjeta → Cuentas por pagar')
  ok(C.ROLES_PARTICIPANTE.some((r) => r.id === 'cuentas_por_pagar') && C.participantesPorRol('cuentas_por_pagar').length === 1 && C.rolPuedeEstado('cuentas_por_pagar', 'fondeada') && !C.rolPuedeEstado('cuentas_por_pagar', 'autorizada'), 'rol de participante cuentas_por_pagar (recibe avisos) y puede llevar a «Fondeada»')

  // ------------------------------------------------------------------------------------------------ reglas de cotización: mínimo 1 y compra menor
  seccion('Reglas de cotización: < $1,000 basta 1, desde $1,000 tres de proveedores distintos o excepción, compra menor (< $100) solo registro, exclusión mutua y leyenda para Finanzas')
  const cfg0 = C.getConfig()
  ok(cfg0.umbralSinCotizacion === 100 && C.CONFIG_DEFAULT.umbralSinCotizacion === 100, 'config por defecto: umbralSinCotizacion = 100')
  ok(/MENOR/.test(C.CONFIG_DESCRIPCIONES.umbralSinCotizacion) && /autorización de Finanzas/.test(C.CONFIG_DESCRIPCIONES.umbralSinCotizacion), 'el umbral nuevo trae su descripción (como las demás reglas)')
  const nueva = (cantidad = 1, producto = 'Producto menor') => C.crearRequisicionPublica({ solicitanteId: solic.id, ubicaciones: ['suc-bolivia'], partidas: [{ categoriaId: 'cat-papeleria', producto, cantidad }] })
  const pid = (r, n = 1) => `${r.folio}-P${n}`
  const marchandProv = C.listProveedores().find((p) => p.nombreComercial === 'Papelería Marchand')

  // Regla de cotizaciones (SPEC 3): < $1,000 basta 1; >= $1,000 tres de proveedores DISTINTOS salvo excepción (especializado / adjudicación directa CEO|DGA)
  const cot = (r, proveedor, precio) => C.addCotizacion({ folio: r.folio, proveedor, precios: { [pid(r)]: precio }, registradoPor: 'Prueba' })
  const elegirPrimera = (r, opts = {}) => C.elegirProveedor(r.folio, C.listCotizaciones(r.folio)[0].id, { usuario: 'Prueba', ...opts })
  const IDX = (r, prov) => C.listCotizaciones(r.folio).find((c) => c.proveedor === prov).id
  ok(cfg0.umbralCotizacionSimple === 1000 && cfg0.cotizacionesMinimas === 3 && C.CONFIG_DEFAULT.umbralCotizacionSimple === 1000 && C.CONFIG_DEFAULT.cotizacionesMinimas === 3, 'config por defecto: umbralCotizacionSimple = 1000 y cotizacionesMinimas = 3', { s: cfg0.umbralCotizacionSimple, m: cfg0.cotizacionesMinimas })
  ok(/Compras menores a este monto: basta 1 cotización/.test(C.CONFIG_DESCRIPCIONES.umbralCotizacionSimple) && !/EJEMPLO/i.test(C.CONFIG_DESCRIPCIONES.umbralCotizacionSimple + C.CONFIG_DESCRIPCIONES.cotizacionesMinimas), 'las descripciones nuevas (sin «EJEMPLO»)')
  ok(C.cotizacionesRequeridas(999.99) === 1 && C.cotizacionesRequeridas(1000) === 3 && C.cotizacionesRequeridas(1000.01) === 3 && C.cotizacionesRequeridas(50) === 1 && C.cotizacionesRequeridas(50, true) === 0 && C.cotizacionesRequeridas(5000, true) === 3, 'requeridas: 999.99 → 1; 1,000.00 y más → 3 (comparación >=); registro < $100 → 0')

  // 999.99 con UNA cotización pasa; 1,000.00 con 1 no
  const m999 = await nueva(1, 'Equipo de $999.99')
  await cot(m999, 'Proveedor único de prueba', 999.99)
  ok(!C.evaluarCotizaciones(m999.folio).requiereExcepcion && C.evaluarCotizaciones(m999.folio).requeridas === 1, '$999.99 con 1 cotización: sin excepción')
  await elegirPrimera(m999)
  ok(C.cotizacionElegida(m999.folio)?.elegida === true && !C.getRequisicion(m999.folio).excepcionTipo, '$999.99 se elige con UNA cotización')
  const m1000 = await nueva(1, 'Equipo de $1,000')
  await cot(m1000, 'Proveedor A', 1000)
  const eMil = C.evaluarCotizaciones(m1000.folio)
  ok(eMil.requeridas === 3 && eMil.completas === 1 && eMil.requiereExcepcion && eMil.mensajes[0] === 'Para compras de $1,000 o más se requieren 3 cotizaciones de proveedores distintos (hay 1). Registra las faltantes o documenta la excepción (producto especializado, adjudicación directa de CEO/DGA o urgencia).', '$1,000.00 con 1 cotización: exige 3 (mensaje del SPEC)', eMil)
  await rechaza(() => elegirPrimera(m1000), /se requieren 3 cotizaciones de proveedores distintos \(hay 1\)/, '$1,000.00 con 1 cotización: no se puede elegir')
  await cot(m1000, 'Proveedor B', 1010)
  ok(C.evaluarCotizaciones(m1000.folio).completas === 2 && C.evaluarCotizaciones(m1000.folio).requiereExcepcion, '$1,000.00 con 2: sigue faltando')
  await rechaza(() => elegirPrimera(m1000), /hay 2/, '$1,000.00 con 2 cotizaciones: tampoco')
  await cot(m1000, 'Proveedor C', 1020)
  ok(!C.evaluarCotizaciones(m1000.folio).requiereExcepcion && C.completasDistintas(m1000.folio) === 3, '3 cotizaciones de 3 proveedores distintos: cumple')
  await elegirPrimera(m1000)
  ok(C.cotizacionElegida(m1000.folio)?.proveedor === 'Proveedor A' && !C.getRequisicion(m1000.folio).excepcionTipo && !C.getRequisicion(m1000.folio).excepcionCotizaciones, 'con 3 distintas se elige sin excepción')

  // Mismo proveedor con variantes NO cuenta como distinto (mayúsculas, acentos, espacios) — se prueba con la función pura y con datos locales
  ok(C.contarProveedoresDistintos(['Papelería Marchand', 'PAPELERIA  MARCHAND ', 'papelería marchand', 'Otro']) === 2, 'variantes de mayúsculas, acentos y espacios cuentan como UN proveedor')
  const mDup = await nueva(1, 'Equipo con variantes')
  await cot(mDup, 'Dell Store', 2000)
  await cot(mDup, 'DELL  STORE', 2050)
  await cot(mDup, 'dell store ', 2100)
  ok(C.listCotizaciones(mDup.folio).length === 3 && C.completasDistintas(mDup.folio) === 1 && C.evaluarCotizaciones(mDup.folio).completas === 1, 'tres cotizaciones del «mismo» proveedor (variantes) cuentan como 1', C.completasDistintas(mDup.folio))
  await rechaza(() => C.elegirProveedor(mDup.folio, C.listCotizaciones(mDup.folio)[0].id, { usuario: 'Prueba' }), /\(hay 1\)/, 'variantes del mismo proveedor no cumplen las 3 cotizaciones')
  await cot(mDup, 'Proveedor B', 2200)
  await rechaza(() => C.elegirProveedor(mDup.folio, C.listCotizaciones(mDup.folio)[0].id, { usuario: 'Prueba' }), /\(hay 2\)/, 'con otro distinto son 2: sigue faltando')
  await rechaza(() => C.guardarHoja(mDup.folio, [{ datos: { proveedor: 'Dell Store' }, precios: { [pid(mDup)]: 2000 } }, { datos: { proveedor: 'DELL  STORE' }, precios: { [pid(mDup)]: 2050 } }]), /dos veces en la hoja/, 'la hoja del cotizador no admite el mismo proveedor con variantes')

  // Excepciones: cada una pasa con UNA cotización
  const mEsp = await nueva(1, 'Equipo especializado')
  await cot(mEsp, 'Proveedor único', 5000)
  await rechaza(() => elegirPrimera(mEsp, { excepcionCotizaciones: 'Producto especializado único en el mercado' }), /Elige el tipo de excepción/, 'la excepción sin tipo se rechaza')
  await rechaza(() => elegirPrimera(mEsp, { excepcionTipo: 'preferencia', excepcionCotizaciones: 'Prefiero a este proveedor siempre' }), /tipo de excepción no es válido/, 'un tipo inventado se rechaza')
  await rechaza(() => elegirPrimera(mEsp, { excepcionTipo: 'urgencia', excepcionCotizaciones: 'Urgente' }), /mínimo 15 caracteres/, 'urgencia: la justificación de 15 o más caracteres sigue siendo obligatoria')
  await rechaza(() => elegirPrimera(mEsp, { excepcionTipo: 'urgencia', excepcionInstruidaPor: 'dga', excepcionCotizaciones: 'Urgente por falla de la bomba' }), /no lleva «instruida por»/, '«instruida por» solo aplica a la adjudicación directa')
  await rechaza(() => elegirPrimera(mEsp, { excepcionTipo: 'especializado', excepcionCotizaciones: 'Muy corta' }), /mínimo 15 caracteres/, 'justificación de menos de 15 caracteres: rechazada')
  await rechaza(() => elegirPrimera(mEsp, { excepcionTipo: 'adjudicacion_directa', excepcionCotizaciones: 'Instrucción de la dirección general' }), /Indica quién instruyó la adjudicación directa: CEO o DGA/, 'la adjudicación directa exige «instruida por»')
  await rechaza(() => elegirPrimera(mEsp, { excepcionTipo: 'adjudicacion_directa', excepcionInstruidaPor: 'gerente', excepcionCotizaciones: 'Instrucción de la dirección general' }), /Indica quién instruyó/, '«instruida por» solo CEO o DGA')
  ok(C.getRequisicion(mEsp.folio).estado === 'en_cotizacion' && !C.cotizacionElegida(mEsp.folio), 'las excepciones inválidas no dejan nada elegido')
  await elegirPrimera(mEsp, { excepcionTipo: 'especializado', excepcionCotizaciones: 'Equipo especializado: proveedor único del fabricante' })
  const rEsp = C.getRequisicion(mEsp.folio)
  ok(rEsp.excepcionTipo === 'especializado' && !rEsp.excepcionInstruidaPor && C.excepcionValida(rEsp) && C.motivoNoPuedePasarA(mEsp.folio, 'en_autorizacion') === C.MSG_PROVEEDOR_INCOMPLETO, 'especializado con 1 cotización: elegida; solo falta la compuerta del proveedor', rEsp)
  const mAdj = await nueva(1, 'Adjudicación directa')
  await cot(mAdj, 'Proveedor de la DGA', 8000)
  await elegirPrimera(mAdj, { excepcionTipo: 'adjudicacion_directa', excepcionInstruidaPor: 'dga', excepcionCotizaciones: 'La DGA instruyó contratar a este proveedor' })
  const rAdj = C.getRequisicion(mAdj.folio)
  ok(rAdj.excepcionTipo === 'adjudicacion_directa' && rAdj.excepcionInstruidaPor === 'dga', 'adjudicación directa instruida por DGA con 1 cotización: pasa', rAdj)
  const mCeo = await nueva(1, 'Adjudicación del CEO')
  await cot(mCeo, 'Proveedor del CEO', 9000)
  await elegirPrimera(mCeo, { excepcionTipo: 'adjudicacion_directa', excepcionInstruidaPor: 'ceo', excepcionCotizaciones: 'Instrucción directa del CEO por convenio' })
  ok(C.getRequisicion(mCeo.folio).excepcionInstruidaPor === 'ceo', 'adjudicación directa instruida por CEO con 1 cotización: pasa')
  ok(C.textoExcepcion(rEsp) === 'Producto o servicio especializado — Equipo especializado: proveedor único del fabricante' && C.textoExcepcion(rAdj) === 'Adjudicación directa instruida por DGA — La DGA instruyó contratar a este proveedor' && C.textoExcepcion(C.getRequisicion(mCeo.folio)).startsWith('Adjudicación directa instruida por CEO — '), 'textos de la excepción para Finanzas')
  const mUrg = await nueva(1, 'Refacción urgente')
  await cot(mUrg, 'Proveedor local', 4000)
  await elegirPrimera(mUrg, { excepcionTipo: 'urgencia', excepcionCotizaciones: 'Falla de la bomba: la sucursal está sin agua' })
  const rUrg = C.getRequisicion(mUrg.folio)
  ok(rUrg.excepcionTipo === 'urgencia' && !rUrg.excepcionInstruidaPor && C.excepcionValida(rUrg) && C.textoExcepcion(rUrg) === 'Urgencia — Falla de la bomba: la sucursal está sin agua', 'urgencia con 1 cotización y justificación: pasa; texto «Urgencia — …»', C.textoExcepcion(rUrg))
  ok(C.EXCEPCION_TIPO_LABEL.urgencia === 'Urgencia' && Object.keys(C.EXCEPCION_TIPO_LABEL).join() === 'especializado,adjudicacion_directa,urgencia', 'catálogo de tipos: especializado, adjudicación directa y urgencia')
  // Excepción guardada en borrador y validador de transición
  const mBor = await nueva(1, 'Refacción con borrador')
  await cot(mBor, 'Proveedor único', 3000)
  await C.elegirProveedor(mBor.folio, C.listCotizaciones(mBor.folio)[0].id, { excepcionTipo: 'especializado', excepcionCotizaciones: 'Proveedor único con la refacción original' })
  await C.vincularProveedor(mBor.folio, marchandProv.id)
  ok(C.motivoNoPuedePasarA(mBor.folio, 'en_autorizacion') === null, 'con excepción válida y proveedor del catálogo se puede enviar a autorización')
  await C.guardarExcepcion(mBor.folio, { tipo: 'adjudicacion_directa', instruidaPor: 'ceo', justificacion: 'Cambio a adjudicación del CEO ahora' })
  ok(C.getRequisicion(mBor.folio).excepcionInstruidaPor === 'ceo', 'guardarExcepcion cambia la excepción mientras se cotiza')
  await rechaza(() => C.guardarExcepcion(mBor.folio, { tipo: 'especializado', justificacion: 'corta' }), /mínimo 15 caracteres/, 'guardarExcepcion valida')
  await C.guardarExcepcion(mBor.folio, { tipo: '', justificacion: '' })
  ok(C.motivoNoPuedePasarA(mBor.folio, 'en_autorizacion') === 'Para compras de $1,000 o más se requieren 3 cotizaciones de proveedores distintos (hay 1). Registra las faltantes o documenta la excepción (producto especializado, adjudicación directa de CEO/DGA o urgencia).', 'sin excepción el validador de transición bloquea con el mensaje del SPEC (espejo del servidor)', C.motivoNoPuedePasarA(mBor.folio, 'en_autorizacion'))
  await C.guardarExcepcion(mBor.folio, { tipo: 'especializado', justificacion: 'Proveedor único con la refacción original' })
  await C.solicitarAutorizacion(mBor.folio, { usuario: 'Prueba' })
  ok(C.getRequisicion(mBor.folio).estado === 'en_autorizacion', 'se envía a autorización con la excepción')
  // Aviso informativo a Dirección (aviso_excepcion_cotizaciones): solo con excepción, una vez por envío, sin token ni botones, solo rol «direccion»
  const direccion = C.participantesPorRol('direccion').filter((d) => d.correo?.trim())
  const avisosDe = (folio) => C.listNotificaciones().filter((n) => n.requisicionId === folio && n.tipo === 'aviso_excepcion_cotizaciones')
  const avisosBor = avisosDe(mBor.folio)
  ok(direccion.length >= 1 && avisosBor.length === direccion.length && direccion.every((d) => avisosBor.filter((n) => n.paraCorreo === d.correo).length === 1), 'enviar con excepción encola UN aviso a cada participante activo con rol dirección (una sola vez por envío)', { avisos: avisosBor.length, dir: direccion.length })
  const todosCorreos = new Set(C.participantesPorRol('direccion').map((d) => d.correo))
  ok(avisosBor.every((n) => todosCorreos.has(n.paraCorreo) && /@ejemplo\.mx$/.test(n.paraCorreo)), 'el aviso solo va a participantes con rol dirección (correos de ejemplo)')
  ok(avisosBor.every((n) => n.asunto === `Aviso: excepción de cotizaciones · ${mBor.folio}` && n.estado === 'simulado'), 'asunto «Aviso: excepción de cotizaciones · <folio>»', avisosBor[0]?.asunto)
  ok(avisosBor.every((n) => /no requiere tu autorización/.test(n.cuerpoHtml) && /Producto o servicio especializado/.test(n.cuerpoHtml) && /Proveedor único con la refacción original/.test(n.cuerpoHtml) && new RegExp(mBor.folio).test(n.cuerpoHtml) && /Monto/.test(n.cuerpoHtml) && /Papelería Marchand/.test(n.cuerpoHtml)), 'el aviso trae folio, monto, proveedor, tipo de excepción y justificación y dice que no requiere autorización')
  ok(avisosBor.every((n) => !/\/compras\/aprobar\//.test(n.cuerpoHtml) && !/Aprobar|Rechazar/.test(n.cuerpoHtml) && !/\{\{/.test(n.cuerpoHtml) && !/000180000000|Calle Ejemplo/.test(n.cuerpoHtml)), 'el aviso no lleva token, botones, marcadores sin sustituir, CLABE ni dirección fiscal')
  ok(!C.listEnlacesAprobacion(mBor.folio).some((e) => avisosBor.some((n) => n.cuerpoHtml.includes(e.token))), 'ninguna liga de aprobación viaja en el aviso')
  ok(avisosDe(m1000.folio).length === 0 && avisosDe(m999.folio).length === 0, 'sin excepción (3 cotizaciones o < $1,000) no hay aviso: aún no enviadas')
  await C.vincularProveedor(m1000.folio, marchandProv.id)
  await C.solicitarAutorizacion(m1000.folio, { usuario: 'Prueba' })
  await C.vincularProveedor(m999.folio, marchandProv.id)
  await C.solicitarAutorizacion(m999.folio, { usuario: 'Prueba' })
  ok(avisosDe(m1000.folio).length === 0 && avisosDe(m999.folio).length === 0, 'enviadas con 3 cotizaciones o < $1,000: NO se encola aviso de excepción')
  await C.vincularProveedor(mUrg.folio, marchandProv.id)
  const envioUrg = await C.solicitarAutorizacion(mUrg.folio, { usuario: 'Prueba' })
  ok(envioUrg.avisosExcepcion === direccion.length && avisosDe(mUrg.folio).length === direccion.length && avisosDe(mUrg.folio).every((n) => /Urgencia/.test(n.cuerpoHtml) && /Falla de la bomba/.test(n.cuerpoHtml)), 'la urgencia también avisa a Dirección (y el resultado del envío lo informa)', envioUrg.avisosExcepcion)
  ok(avisosDe(mBor.folio).length === direccion.length, 'el aviso de otra requisición no se duplica')
  // Congelado desde «en autorización»
  await rechaza(() => C.guardarExcepcion(mBor.folio, { tipo: 'especializado', justificacion: 'Otra justificación distinta aquí' }), /recibida o en cotización/, 'la excepción no se cambia en «en autorización»')
  await rechaza(() => C.actualizarRequisicion(mBor.folio, { excepcionTipo: 'adjudicacion_directa', excepcionInstruidaPor: 'dga' }), /queda bloqueada/, 'actualizarRequisicion tampoco la toca (congelada)')
  await C.actualizarRequisicion(mBor.folio, { notas: 'Nota libre sí se puede editar' })
  // Finanzas ve la excepción: correo, liga pública y estado local
  const correoExc = C.listNotificaciones().filter((n) => n.requisicionId === mBor.folio && n.tipo === 'autorizacion_finanzas')
  ok(correoExc.length >= 1 && correoExc.every((n) => /Excepción de cotizaciones:<\/b> Producto o servicio especializado — Proveedor único con la refacción original/.test(n.cuerpoHtml)), 'el correo de autorización muestra «Excepción de cotizaciones: Producto o servicio especializado — …»', correoExc.length)
  const vExc = await C.verParaAprobar(C.listEnlacesAprobacion(mBor.folio).find((e) => !e.usado).token)
  ok(vExc.excepcionCotizaciones?.tipo === 'especializado' && vExc.excepcionCotizaciones.justificacion === 'Proveedor único con la refacción original' && vExc.cotizacionesCompletas === 1 && vExc.cotizacionesRequeridas === 3 && vExc.umbralCotizacionSimple === 1000, 'la liga pública trae excepcionCotizaciones {tipo, instruidaPor, justificacion}, cotizacionesCompletas/Requeridas y el umbral', vExc)
  const segExc = await C.consultarRequisicionPublica(mBor.folio, mBor.token)
  ok(!/excepci|especializad|adjudicaci/i.test(JSON.stringify(segExc)), 'el seguimiento público del solicitante NO muestra la excepción', JSON.stringify(segExc).match(/.{40}(excepci|especializad|adjudicaci).{40}/i)?.[0])
  const rDemoAdj = C.listRequisiciones().find((r) => r.excepcionTipo === 'adjudicacion_directa' && r.excepcionInstruidaPor === 'dga' && r.estado !== 'recibida' && r.proveedorElegido === 'Dell Store Empresas')
  ok(!!rDemoAdj && C.listNotificaciones().some((n) => n.requisicionId === rDemoAdj.folio && n.tipo === 'autorizacion_finanzas' && /Adjudicación directa instruida por DGA — /.test(n.cuerpoHtml)), 'la demo trae una adjudicación directa instruida por DGA con su correo', rDemoAdj?.folio)
  const rDemoUrg = C.listRequisiciones().find((r) => r.excepcionTipo === 'urgencia' && r.estado === 'en_autorizacion' && r.proveedorElegido === 'Demiluz')
  ok(!!rDemoUrg && C.listNotificaciones().some((n) => n.requisicionId === rDemoUrg.folio && n.tipo === 'autorizacion_finanzas' && /Urgencia — /.test(n.cuerpoHtml)) && C.listNotificaciones().some((n) => n.requisicionId === rDemoUrg.folio && n.tipo === 'aviso_excepcion_cotizaciones'), 'la demo trae una urgencia en autorización: correo a Finanzas con la excepción y aviso a Dirección', rDemoUrg?.folio)
  const rDemoEsp = C.listRequisiciones().find((r) => r.excepcionTipo === 'especializado' && r.estado === 'fondeada')
  ok(!!rDemoEsp, 'la demo trae una excepción de producto especializado')
  ok(C.listRequisiciones().filter((r) => C.completasDistintas(r.folio) >= 3).length >= 7, 'la demo trae varios casos con 3 cotizaciones de proveedores distintos')
  ok(C.listRequisiciones().every((r) => !['en_autorizacion', 'autorizada', 'fondeada', 'comprada', 'entregada'].includes(r.estado) || C.listCotizaciones(r.folio).some((c) => c.esRegistro) || C.montoElegido(r.folio) < 1000 || C.completasDistintas(r.folio) >= 3 || C.excepcionValida(r)), 'toda requisición de la demo que avanzó cumple la regla (< $1,000, 3 distintas o excepción válida)')
  // Los registros < $100 siguen exentos de todo esto
  await C.setConfig('cotizacionesMinimas', 5)
  ok(C.cotizacionesRequeridas(5000) === 5 && C.cotizacionesRequeridas(99, true) === 0 && C.evaluarMinimas(50, 1, true).requeridas === 0, 'cambiar el mínimo a 5 se refleja; los registros < $100 siguen exentos')
  await C.setConfig('cotizacionesMinimas', 3)
  await C.setConfig('umbralCotizacionSimple', 2000)
  ok(C.cotizacionesRequeridas(1500) === 1 && C.cotizacionesRequeridas(2000) === 3 && JSON.parse(memoria.get('dga_cmp_config')).umbral_cotizacion_simple === 2000, 'cambiar el umbral simple a 2,000 mueve la frontera (>=)')
  await C.setConfig('umbralCotizacionSimple', 1000)

  // evaluarMinimas con un registro de compra menor
  ok(C.evaluarMinimas(99.99, 1, true).requeridas === 0 && !C.evaluarMinimas(99.99, 1, true).requiereExcepcion && !C.evaluarMinimas(99.99, 1, true).registroExcedido, 'registro de $99.99: 0 cotizaciones requeridas, sin excepción ni mensajes')
  for (const monto of [100, 100.01, 2500]) {
    const e = C.evaluarMinimas(monto, 1, true)
    ok(e.registroExcedido && e.mensajes[0] === 'Una compra menor (solo registro) aplica únicamente por debajo de $100; para este monto registra una cotización completa.', `registro de ${monto}: excedido con el mensaje del SPEC`, e.mensajes)
  }

  // Registro de compra menor: 99.99 pasa; 100.00 y más, no
  const c99 = await nueva(1, 'Cinta')
  const reg = await C.registrarCompraMenor({ folio: c99.folio, proveedor: 'Papelería Marchand', precios: { [pid(c99)]: 99.99 }, usuario: 'Prueba' })
  ok(reg.esRegistro === true && reg.elegida === true && C.listCotizaciones(c99.folio).length === 1, 'registro de $99.99: queda como cotización esRegistro, elegida sola', reg)
  ok(C.getRequisicion(c99.folio).estado === 'en_cotizacion' && C.getRequisicion(c99.folio).proveedorElegido === 'Papelería Marchand' && !reg.justificacion, 'la requisición pasa a «En cotización» con el proveedor elegido y SIN justificación')
  ok(C.totalCotizacion(reg.id) === 99.99 && C.montoElegido(c99.folio) === 99.99, 'el monto elegido es el del registro')
  ok(Object.keys(C.criteriosDe(reg)).filter((k) => k !== 'ivaIncluido').length === 0, 'el registro no lleva criterios (sin entrega, garantía, crédito, calificación…)', C.criteriosDe(reg))
  ok(C.motivoNoPuedePasarA(c99.folio, 'en_autorizacion') === C.MSG_PROVEEDOR_INCOMPLETO, 'la compuerta del proveedor sigue igual: sin proveedor del catálogo no se envía')
  await C.vincularProveedor(c99.folio, marchandProv.id)
  ok(C.motivoNoPuedePasarA(c99.folio, 'en_autorizacion') === null, 'con el proveedor del catálogo (remisión) el registro puede pasar a autorización')

  const c100 = await nueva(1, 'Cinta de $100')
  await rechaza(() => C.registrarCompraMenor({ folio: c100.folio, proveedor: 'Papelería Marchand', precios: { [pid(c100)]: 100 } }), /aplica únicamente por debajo de \$100; para este monto registra una cotización completa/, 'registro de $100.00: bloqueado (menor a = estrictamente menor)')
  await rechaza(() => C.registrarCompraMenor({ folio: c100.folio, proveedor: 'Papelería Marchand', precios: { [pid(c100)]: 100.01 } }), /por debajo de \$100/, 'registro de $100.01: bloqueado')
  await rechaza(() => C.registrarCompraMenor({ folio: c100.folio, proveedor: 'Papelería Marchand', precios: { [pid(c100)]: 450 } }), /registra una cotización completa/, 'registro de $450: bloqueado e invita al cotizador completo')
  ok(C.listCotizaciones(c100.folio).length === 0 && C.getRequisicion(c100.folio).estado === 'recibida', 'los bloqueos no dejan nada a medias')
  const cDos = await nueva(2, 'Dos piezas')
  await C.registrarCompraMenor({ folio: cDos.folio, proveedor: 'Papelería Marchand', precios: { [pid(cDos)]: 49.99 } })
  ok(C.montoElegido(cDos.folio) === 99.98, 'el monto cuenta la cantidad: 2 × $49.99 = $99.98 pasa')
  const cDos2 = await nueva(2, 'Dos piezas de 50')
  await rechaza(() => C.registrarCompraMenor({ folio: cDos2.folio, proveedor: 'Papelería Marchand', precios: { [pid(cDos2)]: 50 } }), /por debajo de \$100/, '2 × $50 = $100: bloqueado')
  const cMulti = await C.crearRequisicionPublica({ solicitanteId: solic.id, ubicaciones: ['suc-bolivia'], partidas: [{ categoriaId: 'cat-papeleria', producto: 'A', cantidad: 1 }, { categoriaId: 'cat-papeleria', producto: 'B', cantidad: 1 }] })
  await rechaza(() => C.registrarCompraMenor({ folio: cMulti.folio, proveedor: 'Marchand', precios: { [pid(cMulti, 1)]: 10 } }), /precio de todas las partidas/, 'el registro exige precio en todas las partidas')
  // Edición del registro: no puede subir al umbral
  await rechaza(() => C.actualizarCotizacion(reg.id, {}, { [pid(c99)]: 100 }), /por debajo de \$100/, 'editar el registro a $100 se bloquea')
  await C.actualizarCotizacion(reg.id, { proveedor: 'Papelería Marchand', garantiaMeses: 12, flete: 500 }, { [pid(c99)]: 80 })
  ok(C.montoElegido(c99.folio) === 80 && C.getCotizacion(reg.id).garantiaMeses === undefined && !C.getCotizacion(reg.id).flete, 'editar el registro cambia el precio y descarta cualquier criterio (solo proveedor y precios)')
  await C.actualizarCotizacion(reg.id, {}, { [pid(c99)]: 99.99 })

  // Exclusión mutua
  await rechaza(() => C.addCotizacion({ folio: c99.folio, proveedor: 'Otro proveedor', precios: { [pid(c99)]: 90 } }), /registro de compra menor activo: es excluyente/, 'con un registro activo no se agrega una cotización normal')
  await rechaza(() => C.guardarHoja(c99.folio, [{ datos: { proveedor: 'Otro' }, precios: { [pid(c99)]: 90 } }]), /excluyente/, 'ni desde la hoja del cotizador')
  await rechaza(() => C.addCotizacion({ folio: c99.folio, proveedor: 'Otro registro', precios: { [pid(c99)]: 50 }, esRegistro: true }), /ya tiene un registro de compra menor activo/, 'tampoco dos registros activos')
  const cNormal = await nueva(1, 'Con cotización normal')
  await C.addCotizacion({ folio: cNormal.folio, proveedor: 'Proveedor normal', precios: { [pid(cNormal)]: 60 }, registradoPor: 'Prueba' })
  await rechaza(() => C.registrarCompraMenor({ folio: cNormal.folio, proveedor: 'Papelería Marchand', precios: { [pid(cNormal)]: 60 } }), /cotizaciones normales activas: una compra menor \(solo registro\) es excluyente/, 'con cotizaciones normales activas no se registra una compra menor')
  ok(C.registroActivo(c99.folio)?.id === reg.id && C.registroActivo(cNormal.folio) === undefined && C.cotizacionesNormales(cNormal.folio).length === 1 && C.cotizacionesNormales(c99.folio).length === 0, 'registroActivo y cotizacionesNormales distinguen los dos modos')
  await C.descartarCotizacion(C.listCotizaciones(cNormal.folio)[0].id, { motivo: 'Mejor registrar como compra menor' })
  await C.registrarCompraMenor({ folio: cNormal.folio, proveedor: 'Papelería Marchand', precios: { [pid(cNormal)]: 60 } })
  ok(C.registroActivo(cNormal.folio)?.elegida === true, 'al descartar la cotización normal (con motivo) sí se puede registrar la compra menor')
  const cDesc = await nueva(1, 'Registro descartado')
  const regD = await C.registrarCompraMenor({ folio: cDesc.folio, proveedor: 'Papelería Marchand', precios: { [pid(cDesc)]: 40 } })
  await C.descartarCotizacion(regD.id, { motivo: 'Resultó mayor' })
  ok(C.registroActivo(cDesc.folio) === undefined && !C.getRequisicion(cDesc.folio).proveedorElegido, 'descartar el registro (con motivo) lo des-elige y no se borra', C.getCotizacion(regD.id))
  await C.addCotizacion({ folio: cDesc.folio, proveedor: 'Proveedor normal', precios: { [pid(cDesc)]: 300 }, registradoPor: 'Prueba' })
  ok(C.cotizacionesNormales(cDesc.folio).length === 1, 'sin registro activo se cotiza normal otra vez')

  // Validador de transición (espejo del servidor): un registro solo vale por debajo del umbral
  await C.setConfig('umbralSinCotizacion', 50)
  ok(C.motivoNoPuedePasarA(c99.folio, 'en_autorizacion') === 'Una compra menor (solo registro) aplica únicamente por debajo de $50; para este monto registra una cotización completa.', 'si el umbral baja a $50 y el registro es de $99.99: no pasa a autorización (mensaje con el umbral real)', C.motivoNoPuedePasarA(c99.folio, 'en_autorizacion'))
  await rechaza(() => C.solicitarAutorizacion(c99.folio, { usuario: 'Prueba' }), /por debajo de \$50/, 'solicitarAutorizacion lo rechaza')
  ok(C.getRequisicion(c99.folio).estado === 'en_cotizacion', 'la requisición sigue en cotización')
  await C.setConfig('umbralSinCotizacion', 100)

  // Edición del umbral desde Reglas (setConfig) con historial
  await C.setConfig('umbralSinCotizacion', 250)
  ok(C.getConfig().umbralSinCotizacion === 250 && C.evaluarMinimas(200, 1, true).requeridas === 0 && C.leyendaCompraMenor() === 'Compra menor (menos de $250): sin cotización, solo registro', 'editar el umbral: cambia la regla y la leyenda usa el valor real')
  ok(JSON.parse(memoria.get('dga_cmp_config')).umbral_sin_cotizacion === 250, 'el umbral queda guardado con su clave umbral_sin_cotizacion')
  const bitU = C.listBitacora({ tabla: 'cmp_config' }).find((b) => b.registroId === 'umbral_sin_cotizacion' && b.despues?.valor === 250)
  ok(!!bitU && bitU.antes.valor === 100, 'el cambio del umbral queda en la bitácora (antes 100, después 250)', bitU)
  await C.setConfig('umbralSinCotizacion', 100)
  ok(C.leyendaCompraMenor() === 'Compra menor (menos de $100): sin cotización, solo registro' && C.textoLeyendaCompraMenor(99.5) === 'Compra menor (menos de $99.50): sin cotización, solo registro', 'leyenda con el umbral formateado ($100 y $99.50)')

  // Finanzas VE la leyenda: correo, liga pública y panel; el solicitante no
  const envio = await C.solicitarAutorizacion(c99.folio, { usuario: 'Prueba' })
  const correosAut = C.listNotificaciones().filter((n) => n.requisicionId === c99.folio && n.tipo === 'autorizacion_finanzas')
  ok(envio.correosEnviados >= 1 && correosAut.length >= 1 && correosAut.every((n) => /Compra menor \(menos de \$100\): sin cotización, solo registro/.test(n.cuerpoHtml)), 'el correo de solicitud de autorización lleva la leyenda de compra menor', correosAut.length)
  ok(correosAut.every((n) => /Registro de compra menor/.test(n.cuerpoHtml) && !/Entrega:/.test(n.cuerpoHtml) && !/Recomendada por el comparativo/.test(n.cuerpoHtml)), 'el comparativo del correo trae una sola línea, sin criterios ni recomendación')
  const lMenor = C.listEnlacesAprobacion(c99.folio).find((e) => !e.usado)
  const vMenor = await C.verParaAprobar(lMenor.token)
  ok(vMenor.cotizaciones.length === 1 && vMenor.cotizaciones[0].esRegistro === true && vMenor.cotizaciones[0].elegida && vMenor.umbralSinCotizacion === 100, 'la liga pública trae esRegistro de la cotización y el umbral vigente', vMenor.cotizaciones)
  const rNormalLiga = C.listRequisiciones().find((r) => r.proveedorElegido === 'Bolsas Roldan Reyes')
  const vNormal = await C.verParaAprobar(C.listEnlacesAprobacion(rNormalLiga.folio).find((e) => !e.usado).token)
  ok(vNormal.cotizaciones.every((c) => c.esRegistro === false), 'en una compra con cotizaciones normales esRegistro = false')
  ok(!C.listNotificaciones().filter((n) => n.requisicionId === rNormalLiga.folio && n.tipo === 'autorizacion_finanzas').some((n) => /Compra menor/.test(n.cuerpoHtml)), 'el correo de una compra normal NO lleva la leyenda')
  const segMenor = await C.consultarRequisicionPublica(c99.folio, c99.token)
  ok(!/compra menor|registro|Marchand|sin cotización/i.test(JSON.stringify(segMenor)), 'el seguimiento público del solicitante NO muestra nada de la compra menor')
  const rDemoMenor = C.listRequisiciones().find((r) => C.listCotizaciones(r.folio).some((c) => c.esRegistro) && r.estado === 'en_autorizacion' && r.folio !== c99.folio)
  ok(!!rDemoMenor && C.montoElegido(rDemoMenor.folio) < 100 && C.montoElegido(rDemoMenor.folio) > 0, 'la demo trae una compra menor (< $100) ya en autorización', rDemoMenor?.folio)
  ok(C.listNotificaciones().some((n) => n.requisicionId === rDemoMenor?.folio && n.tipo === 'autorizacion_finanzas' && /Compra menor \(menos de \$100\)/.test(n.cuerpoHtml)), 'el correo simulado de la demo trae la leyenda')
  ok(C.listRequisiciones().filter((r) => C.listCotizaciones(r.folio).filter((c) => !c.esRegistro).length >= 1).length >= 10, 'la demo conserva sus requisiciones con cotizaciones normales')

  // ------------------------------------------------------------------------------------------------ festivos oficiales calculados
  seccion('Festivos oficiales (LFT art. 74) calculados: 2026 y 2027 idénticos a la lista fija, 1 de octubre cada seis años, lunes y horas hábiles')
  const F = C.alertas
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  ok(igual(F.festivosOficiales(2026), ['2026-01-01', '2026-02-02', '2026-03-16', '2026-05-01', '2026-09-16', '2026-11-16', '2026-12-25']), '2026: 01-01, 02-02, 03-16, 05-01, 09-16, 11-16, 12-25', F.festivosOficiales(2026))
  ok(igual(F.festivosOficiales(2027), ['2027-01-01', '2027-02-01', '2027-03-15', '2027-05-01', '2027-09-16', '2027-11-15', '2027-12-25']), '2027: 01-01, 02-01, 03-15, 05-01, 09-16, 11-15, 12-25', F.festivosOficiales(2027))
  ok(F.festivosOficiales(2030).includes('2030-10-01') && F.festivosOficiales(2024).includes('2024-10-01') && F.festivosOficiales(2036).includes('2036-10-01') && F.festivosOficiales(2030).length === 8, '1 de octubre incluido en 2024, 2030 y 2036 (transmisión del Poder Ejecutivo)')
  ok([2025, 2026, 2027, 2028, 2029, 2031, 2032, 2033, 2034, 2035].every((a) => !F.festivosOficiales(a).includes(`${a}-10-01`) && F.festivosOficiales(a).length === 7), '1 de octubre NO en los demás años (2029 incluido)')
  ok(igual(F.festivosOficiales(2028), ['2028-01-01', '2028-02-07', '2028-03-20', '2028-05-01', '2028-09-16', '2028-11-20', '2028-12-25']), '2028 (bisiesto): 02-07, 03-20, 11-20', F.festivosOficiales(2028))
  ok(igual(F.festivosOficiales(2031), ['2031-01-01', '2031-02-03', '2031-03-17', '2031-05-01', '2031-09-16', '2031-11-17', '2031-12-25']), '2031: 02-03, 03-17, 11-17', F.festivosOficiales(2031))
  ok(igual(F.festivosOficiales(2029).filter((f) => /-(02|03|11)-/.test(f)), ['2029-02-05', '2029-03-19', '2029-11-19']) && igual(F.festivosOficiales(2024).filter((f) => /-(02|03|11)-/.test(f)), ['2024-02-05', '2024-03-18', '2024-11-18']), '2029 y 2024: lunes correctos')
  ok([2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040].every((a) => F.festivosOficiales(a).every((f, i, l) => /^\d{4}-\d{2}-\d{2}$/.test(f) && (i === 0 || l[i - 1] < f))), 'formato AAAA-MM-DD y orden ascendente en 2024–2040')
  ok([2024, 2025, 2026, 2027, 2028, 2029, 2030, 2040].every((a) => F.festivosOficiales(a).filter((f) => ['02', '03', '11'].includes(f.slice(5, 7))).every((f) => new Date(`${f}T12:00:00`).getDay() === 1)), 'los festivos de febrero, marzo y noviembre siempre caen en lunes')
  ok(F.FESTIVOS.length === 17 * 7 + 3 && F.FESTIVOS.includes('2026-02-02') && F.FESTIVOS.includes('2027-11-15') && F.FESTIVOS.includes('2030-10-01') && !F.FESTIVOS.includes('2029-10-01') && F.FESTIVOS.includes('2040-12-25') && !F.FESTIVOS.includes('2041-01-01'), 'FESTIVOS se deriva de la función (2024–2040: 17 años × 7 + 3 de octubre)', F.FESTIVOS.length)
  ok(igual(F.FESTIVOS.filter((f) => f.startsWith('2026') || f.startsWith('2027')), [...F.festivosOficiales(2026), ...F.festivosOficiales(2027)]), '2026–2027 en FESTIVOS son idénticos a la lista fija de antes')
  const local = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime()
  // 2027-05-01 y 2027-12-25 son sábado festivo: no se labora
  ok(new Date(2027, 4, 1).getDay() === 6 && new Date(2027, 11, 25).getDay() === 6, 'premisa: 2027-05-01 y 2027-12-25 son sábado')
  ok(F.horasHabilesEntre(local(2027, 5, 1, 9), local(2027, 5, 1, 16)) === 0, 'el sábado 2027-05-01 (festivo) no cuenta horas hábiles')
  ok(F.horasHabilesEntre(local(2027, 12, 25, 9), local(2027, 12, 25, 16)) === 0, 'el sábado 2027-12-25 (festivo) no cuenta horas hábiles')
  ok(F.horasHabilesEntre(local(2027, 4, 30, 17), local(2027, 5, 3, 10)) === 2, 'viernes 17:00 → lunes 10:00 con sábado festivo = 1 h (vie 17–18) + 1 h (lun 9–10)', F.horasHabilesEntre(local(2027, 4, 30, 17), local(2027, 5, 3, 10)))
  ok(F.horasHabilesEntre(local(2027, 5, 8, 9), local(2027, 5, 8, 16)) === 7, 'un sábado normal sí cuenta (9–16 = 7 h)')
  ok(F.horasHabilesEntre(local(2026, 2, 2, 9), local(2026, 2, 2, 18)) === 0 && F.horasHabilesEntre(local(2026, 2, 3, 9), local(2026, 2, 3, 18)) === 9, 'lunes 2026-02-02 (festivo): 0 h; el martes siguiente: 9 h')
  ok(F.horasHabilesEntre(local(2030, 10, 1, 9), local(2030, 10, 1, 18)) === 0 && F.horasHabilesEntre(local(2029, 10, 1, 9), local(2029, 10, 1, 18)) === 9, '1 de octubre: 2030 no se labora (martes festivo) y 2029 sí (lunes normal)')

  // ------------------------------------------------------------------------------------------------ carga inicial contra una API falsa
  seccion('Carga inicial con la API: las partidas llegan SIN fotos en línea, las fotos se piden por requisición, y cmp_tokens no se lee')
  const FOTO = 'data:image/jpeg;base64,' + 'A'.repeat(5000)
  const peticiones = []
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    peticiones.push(`${req.method} ${url.pathname}${url.search}`)
    res.setHeader('content-type', 'application/json')
    res.setHeader('access-control-allow-origin', '*')
    const tabla = url.pathname.replace(/^\/api\/rest\//, '')
    if (url.pathname.endsWith('/rpc/cmp_ver_para_aprobar')) {
      // Payload de la RPC pública (camelCase), con esRegistro por cotización (SPEC 2).
      res.end(JSON.stringify({ folio: 'REQ-A', nivel: 'finanzas', aprobador: 'Aprobador', usado: false, expirado: false, valida: true, estado: 'en_autorizacion', solicitante: 'Solicitante', urgencia: 'normal', avisaDireccion: false, monto: 67.5, partidas: [{ num: 1, producto: 'Papel', cantidad: 3 }], ivaPct: 16, umbralSinCotizacion: 150, umbralCotizacionSimple: 1500, cotizacionesCompletas: 1, cotizacionesRequeridas: 3, excepcionCotizaciones: { tipo: 'adjudicacion_directa', instruidaPor: 'dga', justificacion: 'La DGA instruyó este proveedor' }, cotizaciones: [{ proveedor: 'Papelería Marchand', total: 67.5, subtotal: 67.5, completa: true, sinPrecios: false, elegida: true, esRegistro: true }, { proveedor: 'Otra', total: 70, subtotal: 70, completa: true, sinPrecios: false, elegida: false, esRegistro: false }], aprobaciones: [] }))
      return
    }
    const filas = {
      cmp_cotizaciones: [
        { id: 'cot-1', folio: 'REQ-A', proveedor: 'Papelería Marchand', es_registro: 1, elegida: true, activo: true, created_at: '2026-11-01T10:00:00Z' },
        { id: 'cot-2', folio: 'REQ-B', proveedor: 'Normal SA', es_registro: '0', elegida: false, activo: true, created_at: '2026-11-01T11:00:00Z' },
        { id: 'cot-3', folio: 'REQ-B', proveedor: 'Otro SA', elegida: false, activo: true, created_at: '2026-11-01T12:00:00Z' },
      ],
      cmp_config: [
        { clave: 'umbral_sin_cotizacion', valor: 250 },
        { clave: 'cotizaciones_minimas', valor: 1 },
      ],
      cmp_partidas: [
        { id: 'REQ-A-P1', folio: 'REQ-A', num: 1, categoria_id: 'cat-papeleria', producto: 'Papel', cantidad: '3.0000', distribucion: {}, imagen_url: FOTO },
        { id: 'REQ-B-P1', folio: 'REQ-B', num: 1, categoria_id: 'cat-papeleria', producto: 'Tinta', cantidad: '1.0000', distribucion: {}, imagen_url: FOTO },
      ],
    }[tabla]
    const cols = url.searchParams.get('select')
    let salida = filas ?? []
    const folio = url.searchParams.get('folio')
    if (folio) salida = salida.filter((f) => `eq.${f.folio}` === folio)
    if (filas && cols && cols !== '*') {
      const pedidas = cols.split(',')
      salida = salida.map((f) => Object.fromEntries(pedidas.filter((c) => c in f).map((c) => [c, f[c]])))
    }
    res.end(JSON.stringify(salida))
  })
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
  const A = await compilar('compras-api.mjs', `http://127.0.0.1:${servidor.address().port}/api`)
  await A.loadRequisicionesCache()
  await A.loadAprobacionesCache()
  await A.loadCotizacionesCache()
  await A.loadConfigCache()
  ok(A.listCotizaciones('REQ-A')[0]?.esRegistro === true && A.listCotizaciones('REQ-B').every((c) => c.esRegistro === false), 'API: es_registro (1, "0" o ausente) llega como esRegistro boolean', A.listCotizaciones())
  ok(A.registroActivo('REQ-A')?.proveedor === 'Papelería Marchand' && A.registroActivo('REQ-B') === undefined, 'API: registroActivo lo detecta')
  ok(A.getConfig().umbralSinCotizacion === 250 && A.getConfig().cotizacionesMinimas === 1, 'API: cmp_config trae umbral_sin_cotizacion → umbralSinCotizacion', A.getConfig())
  const vApi = await A.verParaAprobar('tok-prueba')
  ok(vApi?.cotizaciones[0].esRegistro === true && vApi.cotizaciones[1].esRegistro === false && vApi.umbralSinCotizacion === 150, 'API: cmp_ver_para_aprobar → esRegistro por cotización (camelCase) y el umbral', vApi?.cotizaciones)
  ok(vApi?.excepcionCotizaciones?.tipo === 'adjudicacion_directa' && vApi.excepcionCotizaciones.instruidaPor === 'dga' && vApi.excepcionCotizaciones.justificacion === 'La DGA instruyó este proveedor' && vApi.cotizacionesCompletas === 1 && vApi.cotizacionesRequeridas === 3 && vApi.umbralCotizacionSimple === 1500, 'API: cmp_ver_para_aprobar → excepcionCotizaciones {tipo, instruidaPor, justificacion}, cotizacionesCompletas/Requeridas y umbralCotizacionSimple', vApi)
  const pPartidas = peticiones.find((p) => /\/rest\/cmp_partidas\?/.test(p)) ?? ''
  ok(/select=/.test(pPartidas), 'la caché de partidas pide columnas explícitas (no `*`)', pPartidas)
  ok(!/imagen_url/.test(decodeURIComponent(pPartidas)), 'no pide imagen_url en la carga inicial', pPartidas)
  ok(A.listPartidas('REQ-A').length === 1 && A.listPartidas('REQ-A')[0].imagenUrl === undefined, 'las partidas cargadas no traen la foto')
  ok(!peticiones.some((p) => /cmp_tokens/.test(p)), 'no se lee cmp_tokens (la API la niega a todos los roles)', peticiones)
  const antes = peticiones.length
  await A.cargarImagenesPartidas('REQ-A')
  const pFoto = peticiones.slice(antes).join(' | ')
  ok(/select=id(,|%2C)imagen_url/.test(pFoto) && /folio=eq\.REQ-A/.test(pFoto), 'al abrir una requisición se piden solo las fotos de esa requisición', pFoto)
  ok(A.listPartidas('REQ-A')[0].imagenUrl === FOTO, 'la foto de la requisición abierta queda en la partida')
  ok(A.listPartidas('REQ-B')[0].imagenUrl === undefined, 'las fotos de las demás requisiciones NO se bajaron')
  servidor.closeAllConnections?.()
  servidor.close()

  // ------------------------------------------------------------------------------------------------ catálogo con la API
  seccion('Catálogo con la API: se lee cmp_proveedores (snake_case → camelCase) solo si el rol lo ve, y el alta viaja con las columnas del SPEC')
  const reqsProv = []
  const servidorProv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const trozos = []
    req.on('data', (c) => trozos.push(c))
    req.on('end', () => {
      reqsProv.push({ metodo: req.method, ruta: url.pathname, query: url.searchParams, cuerpo: Buffer.concat(trozos).toString('utf8') })
      res.setHeader('content-type', 'application/json')
      res.setHeader('access-control-allow-origin', '*')
      if (req.method === 'GET' && url.pathname.endsWith('/cmp_requisiciones')) {
        res.end(JSON.stringify([{ folio: 'REQ-API-1', solicitante_id: 's1', solicitante_nombre: 'Solicitante API', solicitante_correo: 's@ejemplo.mx', ubicaciones: [], urgencia: 'normal', estado: 'autorizada', token: 't', proveedores_sugeridos: [], forma_pago: 'transferencia', monto_autorizado: '200.00', proveedor_elegido: 'Proveedor API uno', proveedor_id: 'prv-api-1', requiere_direccion: 0, requiere_ceo: 0, created_at: '2026-01-01T10:00:00.000Z', updated_at: '2026-01-02T10:00:00.000Z' }]))
      } else if (req.method === 'GET' && url.pathname.endsWith('/cmp_proveedores')) {
        res.end(
          JSON.stringify([
            { id: 'prv-api-1', nombre_comercial: 'Proveedor API uno', razon_social: 'Uno SA de CV', tipo: 'factura', forma_pago: 'transferencia', rfc: 'UNO100101AB1', clabe: '000180000000001013', direccion_fiscal: 'Calle 1', cp: '01010', notas: null, activo: 1, motivo_baja: null, creado_por: 'Alguien', actualizado_por: null, created_at: '2026-01-01T10:00:00.000Z', updated_at: '2026-01-02T10:00:00.000Z' },
            { id: 'prv-api-2', nombre_comercial: 'Proveedor API dos', tipo: 'remision', forma_pago: 'efectivo', activo: 0, motivo_baja: 'Ya no se usa', created_at: '2026-01-01T10:00:00.000Z', updated_at: '2026-01-03T10:00:00.000Z' },
          ]),
        )
      } else res.end('[]')
    })
  })
  await new Promise((r) => servidorProv.listen(0, '127.0.0.1', r))
  const P = await compilar('compras-api-prov.mjs', `http://127.0.0.1:${servidorProv.address().port}/api`)
  await P.loadProveedoresCatalogoCache()
  const lecturas = reqsProv.filter((p) => p.metodo === 'GET' && /cmp_proveedores/.test(p.ruta))
  ok(lecturas.length === 1 && /nombre_comercial/.test(lecturas[0].query.get('order') ?? ''), 'se pide cmp_proveedores ordenada por nombre_comercial', lecturas.map((l) => l.query.toString()))
  const l1 = P.getProveedor('prv-api-1')
  ok(l1?.nombreComercial === 'Proveedor API uno' && l1.razonSocial === 'Uno SA de CV' && l1.formaPago === 'transferencia' && l1.direccionFiscal === 'Calle 1' && l1.creadoPor === 'Alguien' && typeof l1.createdAt === 'number', 'las columnas snake_case llegan en camelCase (y las fechas como número)', l1)
  ok(l1.activo === true && P.getProveedor('prv-api-2').activo === false && P.getProveedor('prv-api-2').motivoBaja === 'Ya no se usa', 'activo (TINYINT 1/0) llega como booleano y el motivo de baja se conserva')
  ok(P.listProveedores({ activo: true }).length === 1 && P.buscarProveedores('api uno').length === 1, 'listado y búsqueda sobre lo cargado con la API')
  const nuevo = await P.crearProveedor({ nombreComercial: 'Alta por API', tipo: 'factura', formaPago: 'tarjeta', razonSocial: 'Alta API SA', rfc: 'alt100101ab1', direccionFiscal: 'Calle API 5', cp: '05050', notas: '' })
  const post = reqsProv.find((p) => p.metodo === 'POST' && /cmp_proveedores/.test(p.ruta))
  const fila = post ? JSON.parse(post.cuerpo) : {}
  ok(!!post && fila.nombre_comercial === 'Alta por API' && fila.razon_social === 'Alta API SA' && fila.forma_pago === 'tarjeta' && fila.tipo === 'factura' && fila.rfc === 'ALT100101AB1' && fila.direccion_fiscal === 'Calle API 5' && fila.cp === '05050' && fila.activo === true && /^prv-/.test(fila.id), 'el alta viaja con las columnas del SPEC (RFC en mayúsculas, activo, id prv-…)', fila)
  ok(!('clabe' in fila) && !('notas' in fila) && typeof fila.created_at === 'string', 'los campos vacíos no viajan; las fechas van en ISO')
  ok(nuevo.id === fila.id, 'el proveedor creado queda en la caché con el mismo id')
  P.user.value = { id: 'x', username: 'soporte', displayName: 'Soporte', role: 'capturista' }
  const antesGets = reqsProv.length
  await P.loadProveedoresCatalogoCache()
  ok(reqsProv.length === antesGets && P.listProveedores().length === 0, 'un rol que no ve el catálogo (Soporte) no lo pide a la API (evita un 403) y queda vacío')
  P.user.value = { id: 'y', username: 'cuentas', displayName: 'Cuentas por pagar', role: 'cuentas_por_pagar' }
  await P.loadProveedoresCatalogoCache()
  ok(P.listProveedores().length === 2, 'Cuentas por pagar sí lo carga')
  // Cuentas por pagar no lee cmp_cotizaciones (la API responde 403): no se pide, para no ensuciar la consola
  const antesCot = reqsProv.length
  await P.loadCotizacionesCache()
  ok(!reqsProv.slice(antesCot).some((r) => /cmp_cotizacion/.test(r.ruta)) && P.listCotizaciones('REQ-API-1').length === 0, 'Cuentas por pagar NO pide cmp_cotizaciones ni cmp_cotizacion_items', reqsProv.slice(antesCot).map((r) => r.ruta))
  // Pago por transferencia: la referencia viaja en su columna propia (`referencia`), no en folio_caja_chica; fecha y comprobante se persisten
  await P.loadRequisicionesCache()
  const movApi = await P.registrarTransferencia({ folio: 'REQ-API-1', monto: 200, referencia: 'TRF-API-1', archivoUrl: 'https://ejemplo.mx/c.pdf', fechaPago: '2026-01-02' })
  const postMov = reqsProv.filter((r) => r.metodo === 'POST' && /cmp_dinero/.test(r.ruta)).map((r) => JSON.parse(r.cuerpo)).find((f) => f.tipo === 'transferencia') ?? {}
  ok(postMov.referencia === 'TRF-API-1' && postMov.archivo_url === 'https://ejemplo.mx/c.pdf' && !('folio_caja_chica' in postMov) && /^2026-01-02T/.test(postMov.fecha ?? ''), 'transferencia por la API: columnas referencia, archivo_url y fecha (sin folio_caja_chica)', postMov)
  ok(movApi.referencia === 'TRF-API-1', 'el movimiento queda en la caché con referencia')
  P.user.value = { id: 'z', username: 'cuentas', displayName: 'Cuentas por pagar', role: 'cuentas_por_pagar' }
  // Normalización antes de enviar (el servidor valida la longitud de columna antes del guard)
  const nrm = await P.crearProveedor({ nombreComercial: 'Normaliza por API', tipo: 'factura', formaPago: 'transferencia', razonSocial: 'Norm API SA', rfc: ' nor-100101 dm1 ', clabe: '000-180 00000000101-3', direccionFiscal: 'Calle N 1', cp: ' 01 010 ' })
  const postN = reqsProv.filter((r) => r.metodo === 'POST' && /cmp_proveedores/.test(r.ruta)).map((r) => JSON.parse(r.cuerpo)).find((f) => f.id === nrm.id) ?? {}
  ok(postN.rfc === 'NOR100101DM1' && postN.clabe === '000180000000001013' && postN.cp === '01010', 'el alta por la API viaja con RFC, CLABE y CP ya normalizados (sin espacios ni guiones)', postN)
  // ---- Cerrar sesión e iniciar con OTRO usuario en la misma pestaña: las cachés se recargan y no queda nada del anterior (H3) ----
  seccion('Logout → login de otro rol en la misma pestaña: se recargan las cachés y no queda nada del usuario anterior; no se piden tablas vetadas al rol')
  const pidio = async (rol, nombre) => {
    P.user.value = { id: `u-${rol}`, username: rol, displayName: rol, role: rol }
    const antes = reqsProv.length
    await P.sync.loadAllCaches()
    const rutas = reqsProv.slice(antes).filter((r) => r.metodo === 'GET').map((r) => r.ruta.replace(/^.*\/rest\//, ''))
    return { rutas, nombre }
  }
  const cxp = await pidio('cuentas_por_pagar', 'cxp')
  ok(P.sync.areAllCachesReady() && P.listProveedores().length === 2 && !!P.getProveedor('prv-api-1')?.clabe, 'Cuentas por pagar: cachés cargadas con el catálogo (incluida la CLABE)')
  for (const t of ['cmp_cotizaciones', 'cmp_cotizacion_items', 'cmp_recepciones', 'cmp_notificaciones', 'inv_bitacora', 'cmp_tokens']) ok(!cxp.rutas.includes(t), `Cuentas por pagar NO pide ${t}`, cxp.rutas)
  ok(cxp.rutas.includes('cmp_proveedores') && cxp.rutas.includes('cmp_requisiciones') && cxp.rutas.includes('cmp_dinero'), 'Cuentas por pagar sí pide lo suyo (proveedores, requisiciones, dinero)')
  await P.logout()
  ok(P.user.value === null && !P.sync.areAllCachesReady(), 'al cerrar sesión las cachés quedan obsoletas (el guard del router las recarga)')
  const sop = await pidio('capturista', 'soporte')
  ok(P.sync.areAllCachesReady() && P.listProveedores().length === 0 && P.getProveedor('prv-api-1') === undefined && !sop.rutas.includes('cmp_proveedores'), 'el siguiente usuario (Soporte) NO ve el catálogo ni la CLABE del anterior: la caché se vació y ni siquiera se pidió')
  ok(sop.rutas.includes('cmp_notificaciones') && sop.rutas.includes('cmp_recepciones'), 'Soporte sí pide recepciones y notificaciones (su rol las lee)')
  const adq = await pidio('adquisiciones', 'adq')
  ok(!adq.rutas.includes('cmp_notificaciones') && !adq.rutas.includes('inv_bitacora') && adq.rutas.includes('cmp_cotizaciones') && adq.rutas.includes('cmp_proveedores'), 'Adquisiciones no pide cmp_notificaciones ni inv_bitacora, pero sí cotizaciones y catálogo', adq.rutas)
  ok(P.listProveedores().length === 2, 'Adquisiciones recarga el catálogo (datos del servidor, no los del usuario previo)')
  const tes = await pidio('tesoreria', 'tes')
  ok(!tes.rutas.includes('cmp_recepciones') && !tes.rutas.includes('cmp_notificaciones') && tes.rutas.includes('cmp_dinero'), 'Tesorería no pide cmp_recepciones ni cmp_notificaciones', tes.rutas)
  ok(P.access.canReadTabla('admin', 'cmp_notificaciones') && P.access.canReadTabla(undefined, 'inv_bitacora') && !P.access.canReadTabla('cuentas_por_pagar', 'cmp_cotizaciones'), 'matriz canReadTabla: admin y sin sesión sí; Cuentas por pagar no lee cotizaciones')
  P.user.value = null
  servidorProv.closeAllConnections?.()
  servidorProv.close()

  // ------------------------------------------------------------------------------------------------ estilos
  seccion('Estilos: Quasar define `.flex { flex-wrap: wrap }`; una columna de alto fijo no debe partirse en varias columnas')
  const css = fs.readFileSync(path.join(raiz, 'src/css/app.css'), 'utf8')
  ok(/\.flex\.flex-col[^{]*\{[^}]*flex-wrap:\s*nowrap/.test(css), 'app.css fuerza flex-wrap: nowrap en `.flex.flex-col` (sin esto Inicio/Sistemas/Compras se desbordan hacia la derecha)')
} catch (e) {
  fallos++
  total++
  console.log('  FALLA inesperada:', e instanceof Error ? e.stack : e)
}

console.log(fallos === 0 ? `\nOK: ${total} comprobaciones, 0 fallos` : `\nFALLARON ${fallos} de ${total}`)
fs.rmSync(tmp, { recursive: true, force: true })
process.exitCode = fallos === 0 ? 0 : 1
