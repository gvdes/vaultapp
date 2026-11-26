import { loadAllCaches } from './dataSync'
import { bump } from './reactive'
import { getFamilia, UBICACION_STOCK_MAESTRO } from './inventario/comunes'
import { addEquipo, getEquipo, listEquipos, loadSistemasCache, updateEquipo } from './inventario/sistemas'
import { addMaterial, listMateriales, registrarEntrada, registrarSalida, trasladarMaterial } from './inventario/mantenimiento'
import { crearSolicitud, marcarPendienteCompra } from './inventario/solicitudes'
import { registrarCargoPerdida } from './inventario/cargosPerdida'
import { calcularValorDepreciado } from './inventario/depreciacion'
import { sembrarAuditoriasDemo } from './demoSeedAuditorias'
import { sembrarComprasDemo } from './compras/demoSeedCompras'
import { registrarResponsiva } from './inventario/responsivas'
import { toLocalDateString } from './dateUtils'
import { registrarIntentoBorrado } from './bitacora'

/** Foto de ejemplo (dibujo SVG de una laptop) como data URI, con una leyenda de condición distinta por entrega. */
function fotoLaptopSvg(leyenda, rayon) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220" width="320" height="220">
<rect width="320" height="220" fill="#e8eef7"/>
<rect x="70" y="30" width="180" height="112" rx="8" fill="#1f2937"/>
<rect x="78" y="38" width="164" height="96" rx="3" fill="#60a5fa"/>
<path d="M78 134 L150 38 L242 38 L242 60 L170 134 Z" fill="#93c5fd" opacity="0.5"/>
<path d="M40 150 H280 L296 172 Q298 178 290 178 H30 Q22 178 24 172 Z" fill="#9ca3af"/>
<rect x="132" y="156" width="56" height="8" rx="3" fill="#6b7280"/>
${rayon ? '<path d="M190 52 L214 96" stroke="#fff" stroke-width="1.5" opacity="0.8"/><path d="M196 50 L212 80" stroke="#fff" stroke-width="1" opacity="0.6"/>' : ''}
<text x="160" y="205" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#1f2937">${leyenda}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Responsiva firmada de ejemplo (escaneo simulado) como data URI. */
function documentoFirmadoSvg(texto) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220" width="320" height="220"><rect width="320" height="220" fill="#fff"/><text x="160" y="60" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#1f2937">Responsiva firmada</text><text x="160" y="90" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#4b5563">${texto}</text><path d="M80 160 C110 120 130 190 160 150 S210 140 240 160" stroke="#1f5fae" stroke-width="2" fill="none"/><line x1="70" y1="175" x2="250" y2="175" stroke="#9ca3af"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Datos de ejemplo para capacitar (solo modo demo local, nunca con Supabase): reproduce el flujo completo
 * Adquisiciones (carga stock maestro) → Soporte (asigna, baja, salidas) → solicitudes y una auditoría en proceso.
 */
export async function cargarDatosDeEjemplo() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('dga_inv_') && k !== 'dga_inv_theme' && k !== 'dga_inv_auth_username')
    .forEach((k) => localStorage.removeItem(k))
  await loadAllCaches()

  const hoy = toLocalDateString(new Date())
  const mesesAtras = (m) => toLocalDateString(new Date(new Date().getFullYear(), new Date().getMonth() - m, 10))
  const diasAtras = (d) => toLocalDateString(new Date(Date.now() - d * 86400000))
  const adq = 'Adquisiciones'
  const soporte = 'Soporte e Infraestructura'

  // 1) Adquisiciones carga el stock maestro: equipos (con costo y factura)…
  const equipos = [
    ['fam-laptops', 'Dell Latitude 5440', 'Dell', 'DL-5440-001', 21500, 6, 'Proveedor Cómputo MX', 'FAC-1021'],
    ['fam-laptops', 'Dell Latitude 5440', 'Dell', 'DL-5440-002', 21500, 6, 'Proveedor Cómputo MX', 'FAC-1021'],
    ['fam-laptops', 'HP ProBook 440', 'HP', 'HP-440-007', 18900, 14, 'Proveedor Cómputo MX', 'FAC-0877'],
    ['fam-celulares', 'Samsung Galaxy A54', 'Samsung', 'CEL-A54-011', 7800, 3, 'Telecom Express', 'FAC-2210'],
    ['fam-celulares', 'Samsung Galaxy A54', 'Samsung', 'CEL-A54-012', 7800, 3, 'Telecom Express', 'FAC-2210'],
    ['fam-radios', 'Motorola DEP450', 'Motorola', 'RAD-450-021', 4200, 10, 'Radiocomunicación SA', 'FAC-0455'],
    ['fam-radios', 'Motorola DEP450', 'Motorola', 'RAD-450-022', 4200, 10, 'Radiocomunicación SA', 'FAC-0455'],
    ['fam-radios', 'Motorola DEP450', 'Motorola', 'RAD-450-023', 4200, 10, 'Radiocomunicación SA', 'FAC-0455'],
    ['fam-monitores', 'Monitor LG 24"', 'LG', 'MON-LG24-031', 3100, 8, 'Proveedor Cómputo MX', 'FAC-0990'],
    ['fam-camaras', 'Cámara Hikvision 4MP', 'Hikvision', 'CAM-HK-005', 2600, 5, 'Seguridad Total', 'FAC-1544'],
    ['fam-impresoras-tickets', 'Epson TM-T20III', 'Epson', 'TKT-EP-003', 3400, 9, 'Punto de Venta MX', 'FAC-0612'],
  ]
  for (const [familiaId, modelo, marca, numeroSerie, costoTotal, meses, proveedor, numeroFactura] of equipos) {
    await addEquipo({ familiaId, modelo, marca, numeroSerie, ubicacionId: UBICACION_STOCK_MAESTRO, proveedor, fechaCompra: mesesAtras(meses), numeroFactura, costoTotal, garantiaMeses: 12, estado: 'disponible' })
  }

  // …y materiales con su compra (entrada)
  // [familia, nombre, unidad, cantidad, mínimo, costo unitario, máximo (opcional)]
  const materiales = [
    ['fam-refaccion', 'Chapa de seguridad', 'pieza', 12, 4, 320],
    ['fam-material', 'Cinta aislante', 'pieza', 60, 20, 18],
    ['fam-material', 'Foco LED 12W', 'pieza', 45, 15, 42],
    ['fam-consumible', 'Desengrasante 1L', 'litro', 8, 10, 95],
    ['fam-consumible', 'Papel bond carta (caja)', 'caja', 30, 10, 540],
    ['fam-consumible', 'Cable HDMI 2m', 'pieza', 25, 8, 85],
    // Compra por encima de su máximo (alerta de sobre-compra)
    ['fam-material', 'Cinta de empaque', 'pieza', 90, 20, 25, 60],
  ]
  // Detalle de cada material: qué es, presentación y para qué se usa (obligatorio en consumibles).
  const detalle = {
    'Chapa de seguridad': 'Chapa de sobreponer de doble perno para puertas de bodega y oficinas; incluye 3 llaves.',
    'Cinta aislante': 'Cinta aislante negra de 19 mm x 18 m, para empalmes y reparaciones eléctricas.',
    'Foco LED 12W': 'Foco LED luz blanca fría de 12 W, base E27, para reposición de iluminación en sucursales y bodegas.',
    'Desengrasante 1L': 'Desengrasante industrial concentrado, botella de 1 L; se diluye 1:10 para limpiar cocina, pisos y maquinaria.',
    'Papel bond carta (caja)': 'Caja con 5,000 hojas blancas tamaño carta, 75 g; para impresión y copias de oficina.',
    'Cable HDMI 2m': 'Cable HDMI 2 m de alta velocidad; conecta pantallas, proyectores y equipos en salas de juntas.',
    'Cinta de empaque': 'Cinta transparente de 48 mm x 150 m para sellar cajas de envío en almacén.',
  }
  for (const [familiaId, nombre, unidadMedida, cantidad, minimo, costoUnitario, maximo] of materiales) {
    const m = await addMaterial({ familiaId, nombre, descripcion: detalle[nombre], unidadMedida, cantidadActual: 0, minimo, maximo, costoUnitario, ubicacionId: UBICACION_STOCK_MAESTRO })
    await registrarEntrada({ materialId: m.id, fecha: mesesAtras(1), cantidad, costoUnitario, proveedor: 'Proveedor General', quienRecibio: adq })
  }

  // 2) Soporte asigna: ubicación y responsable, un equipo dañado y una baja por robo con cargo depreciado
  const porSerie = (s) => listEquipos().find((e) => e.numeroSerie === s)
  const asignar = (serie, ubicacionId, usuarioAsignado, puesto, estado = 'asignado') =>
    updateEquipo(porSerie(serie).id, { ubicacionId, usuarioAsignado, puesto, estado, fechaAsignacion: usuarioAsignado ? hoy : undefined }, soporte)
  // Cadena de responsivas del DL-5440-001: Adquisiciones → Soporte (Uriel) → Laura Méndez (Bolivia).
  // Los datos de compra del equipo no cambian en ninguna reasignación.
  const dell1 = porSerie('DL-5440-001')
  await asignar('DL-5440-001', 'of-soporte-infraestructura', 'Uriel', 'Técnico de Soporte')
  await registrarResponsiva({
    equipoId: dell1.id,
    fecha: mesesAtras(2),
    tipo: 'entrega',
    responsable: 'Uriel',
    puesto: 'Técnico de Soporte',
    ubicacionId: 'of-soporte-infraestructura',
    entregadoPor: adq,
    autorizadoPor: 'Dirección General',
    estadoEquipo: 'asignado',
    fotoUrl: fotoLaptopSvg('Nuevo, sellado de fábrica', false),
    notas: 'Entrega de stock a Soporte para configuración y resguardo',
  })
  await asignar('DL-5440-001', 'suc-bolivia', 'Laura Méndez', 'Gerente de sucursal')
  await registrarResponsiva({
    equipoId: dell1.id,
    fecha: mesesAtras(1),
    tipo: 'entrega',
    responsable: 'Laura Méndez',
    puesto: 'Gerente de sucursal',
    ubicacionId: 'suc-bolivia',
    entregadoPor: 'Uriel',
    autorizadoPor: 'Gerente de Bolivia',
    estadoEquipo: 'asignado',
    fotoUrl: fotoLaptopSvg('Buen estado, rayón leve en tapa', true),
    notas: 'Reasignación a colaboradora de sucursal',
  })
  await asignar('DL-5440-002', 'of-compras', 'Carlos Ruiz', 'Analista de Compras')
  // Esta responsiva sí tiene el documento firmado; la del celular de Ana Torres lleva 20 días sin firma (alerta de control).
  await registrarResponsiva({
    equipoId: porSerie('DL-5440-002').id,
    fecha: diasAtras(40),
    tipo: 'entrega',
    responsable: 'Carlos Ruiz',
    puesto: 'Analista de Compras',
    ubicacionId: 'of-compras',
    entregadoPor: soporte,
    autorizadoPor: 'Dirección General',
    estadoEquipo: 'asignado',
    documentoUrl: documentoFirmadoSvg('Dell Latitude 5440 · Carlos Ruiz'),
  })
  await asignar('CEL-A54-011', 'suc-brasil-1', 'Ana Torres', 'Supervisora')
  await registrarResponsiva({
    equipoId: porSerie('CEL-A54-011').id,
    fecha: diasAtras(20),
    tipo: 'entrega',
    responsable: 'Ana Torres',
    puesto: 'Supervisora',
    ubicacionId: 'suc-brasil-1',
    entregadoPor: soporte,
    autorizadoPor: 'Gerente de Brasil 1',
    estadoEquipo: 'asignado',
    notas: 'Pendiente de recabar la firma de la colaboradora',
  })
  await asignar('RAD-450-021', 'cedis-sp-piso-2', 'Jorge Salas', 'Almacenista')
  await asignar('RAD-450-022', 'cedis-sp-piso-2', undefined, undefined, 'danado')
  await asignar('MON-LG24-031', 'suc-corregidora', undefined, undefined, 'disponible')
  await asignar('TKT-EP-003', 'suc-bolivia', 'Caja 1')

  const hp = porSerie('HP-440-007')
  await asignar('HP-440-007', 'suc-san-pablo-1', 'Mario Díaz', 'Cajero')
  const hpActual = getEquipo(hp.id)
  const valor = calcularValorDepreciado(hpActual, getFamilia(hpActual.familiaId))
  await registrarCargoPerdida({ equipoId: hp.id, usuarioAfectado: 'Mario Díaz', valorCalculado: valor, valorCobrado: valor, motivo: 'robo', autorizadoPor: 'Dirección General', notas: 'Acta administrativa 2026-041' })
  await updateEquipo(hp.id, { estado: 'baja' }, soporte)

  // Segunda pérdida del mismo usuario (alerta de pérdidas repetidas)
  const radio = porSerie('RAD-450-023')
  await asignar('RAD-450-023', 'suc-san-pablo-1', 'Mario Díaz', 'Cajero')
  const radioActual = getEquipo(radio.id)
  const valorRadio = calcularValorDepreciado(radioActual, getFamilia(radioActual.familiaId))
  await registrarCargoPerdida({ equipoId: radio.id, usuarioAfectado: 'Mario Díaz', valorCalculado: valorRadio, valorCobrado: valorRadio, motivo: 'extravío', autorizadoPor: 'Dirección General', notas: 'Acta administrativa 2026-052' })
  await updateEquipo(radio.id, { estado: 'baja' }, soporte)

  // Material: Soporte TRASLADA a sucursales (pasa a ser inventario de esa sucursal) y registra un consumo real
  const material = (n) => listMateriales().find((m) => m.nombre === n)
  const traslada = (nombre, cantidad, destinoId, motivo, quienSolicito) =>
    trasladarMaterial({ materialId: material(nombre).id, destinoId, cantidad, fecha: hoy, motivo, quienSolicito, quienEntrego: soporte })
  await traslada('Cinta aislante', 25, 'suc-bolivia', 'Mantenimiento de sucursal', 'Laura Méndez')
  await traslada('Foco LED 12W', 12, 'cedis-sp-piso-1', 'Reposición de iluminación', 'Jorge Salas')
  await traslada('Cable HDMI 2m', 4, 'of-dga', 'Sala de juntas', 'Recepción DGA')
  await traslada('Papel bond carta (caja)', 10, 'of-compras', 'Consumo de oficina', 'Carlos Ruiz')
  await traslada('Chapa de seguridad', 3, 'suc-corregidora', 'Cambio de chapas', 'Luis Ortega')
  await registrarSalida({ materialId: material('Cinta aislante').id, fecha: hoy, cantidad: 2, motivo: 'Uso en reparación', quienSolicito: 'Soporte', quienEntrego: soporte, tipo: 'consumo' })

  // Consumos con fecha propia (controles de robo hormiga): papel bond a Corregidora con poco historial y un pico
  // en los últimos 30 días, y una salida de focos sin registrar quién la solicitó.
  const papel = material('Papel bond carta (caja)').id
  for (const [dias, cantidad] of [[105, 1], [75, 1], [45, 1], [12, 2], [4, 1]]) {
    await registrarSalida({ materialId: papel, fecha: diasAtras(dias), cantidad, motivo: 'Consumo de oficina', ubicacionDestinoId: 'suc-corregidora', quienSolicito: 'Luis Ortega', quienEntrego: soporte, tipo: 'consumo' })
  }
  await registrarSalida({ materialId: material('Foco LED 12W').id, fecha: diasAtras(3), cantidad: 3, motivo: 'Reposición de iluminación', ubicacionDestinoId: 'cedis-sp-piso-1', quienEntrego: soporte, tipo: 'consumo' })

  // 3) Solicitudes en distintos estados
  const tablet = await crearSolicitud({ tipo: 'sistemas', subtipo: 'equipo_nuevo', familiaId: 'fam-tablets', ubicacionId: 'suc-brasil-3', solicitanteNombre: 'Patricia Vega', descripcion: 'Tablet para toma de inventario en sucursal', cantidad: 1 })
  await marcarPendienteCompra(tablet.id, toLocalDateString(new Date(Date.now() + 14 * 86400000)), soporte)
  await crearSolicitud({ tipo: 'sistemas', subtipo: 'equipo_nuevo', familiaId: 'fam-laptops', ubicacionId: 'of-talento', solicitanteNombre: 'Rosa Herrera', descripcion: 'Laptop para nuevo ingreso de Talento', cantidad: 1 })
  await crearSolicitud({ tipo: 'mantenimiento', subtipo: 'material', familiaId: 'fam-consumible', ubicacionId: 'suc-corregidora', solicitanteNombre: 'Luis Ortega', descripcion: 'Desengrasante para cocina', cantidad: 3 })

  // 4) Auditorías: la demo completa (por verificar, en conteo por liga, cerrada con historial y programada vencida) vive en demoSeedAuditorias.js

  // 6) El radio RAD-450-022 lleva ~3 semanas dañado: se retrocede la fecha de su movimiento (alerta de equipo dañado).
  // Solo modo demo local: se edita el almacenamiento y se recarga la caché de equipos.
  try {
    const clave = 'dga_inv_equipos_movimientos'
    const radioDanado = porSerie('RAD-450-022').id
    const movs = JSON.parse(localStorage.getItem(clave) ?? '[]')
    const idx = movs.findIndex((m) => m.equipoId === radioDanado && m.estadoNuevo === 'danado')
    if (idx >= 0) {
      movs[idx].fecha = Date.now() - 21 * 86400000
      localStorage.setItem(clave, JSON.stringify(movs))
      await loadSistemasCache()
    }
  } catch {
    /* sin almacenamiento: el equipo dañado simplemente no mostrará antigüedad */
  }

  await sembrarAuditoriasDemo()

  // 7) Regla de oro (migración 021): Mauricio intentó borrar un equipo que él mismo dio de alta; la base lo cancela, lo anota y avisa a Dirección.
  const equipoAlta = porSerie('DL-5440-001')
  registrarIntentoBorrado('inv_equipos', equipoAlta.id, 'Mauricio (demo) intentó borrar una laptop dada de alta: no se borró.', {
    usuario: 'Mauricio (demo)',
    rol: 'adquisiciones',
    fecha: Date.now() - 3 * 3600000,
    antes: { modelo: equipoAlta.modelo, numero_serie: equipoAlta.numeroSerie, estado: equipoAlta.estado },
  })

  await sembrarComprasDemo()

  bump()
}
