
// Debe mantenerse en sincronía con el seed de supabase/migrations/001_init.sql —
// esta copia es la que usa el modo local (sin Supabase configurado).

export const UBICACIONES_SEED = [
  { id: 'suc-apartado-1', nombre: 'Apartado 1', tipo: 'sucursal', activo: true, lat: 19.4382, lng: -99.1298 },
  { id: 'suc-apartado-2', nombre: 'Apartado 2', tipo: 'sucursal', activo: true, lat: 19.4379, lng: -99.1301 },
  { id: 'suc-bolivia', nombre: 'Bolivia', tipo: 'sucursal', activo: true, lat: 19.4379, lng: -99.1325 },
  { id: 'suc-brasil-1', nombre: 'Brasil 1', tipo: 'sucursal', activo: true, lat: 19.4394, lng: -99.1330 },
  { id: 'suc-brasil-3', nombre: 'Brasil 3', tipo: 'sucursal', activo: true, lat: 19.4389, lng: -99.1332 },
  { id: 'suc-corregidora', nombre: 'Corregidora', tipo: 'sucursal', activo: true, lat: 19.4318, lng: -99.1288 },
  { id: 'suc-correo-mayor-1', nombre: 'Correo Mayor 1', tipo: 'sucursal', activo: true, lat: 19.4335, lng: -99.1297 },
  { id: 'suc-correo-mayor-2', nombre: 'Correo Mayor 2', tipo: 'sucursal', activo: true, lat: 19.4328, lng: -99.1296 },
  { id: 'suc-ramon-corona-1', nombre: 'Ramón Corona 1', tipo: 'sucursal', activo: true, lat: 19.4260, lng: -99.1306 },
  { id: 'suc-ramon-corona-2', nombre: 'Ramón Corona 2', tipo: 'sucursal', activo: true, lat: 19.4257, lng: -99.1308 },
  { id: 'suc-san-pablo-1', nombre: 'San Pablo 1', tipo: 'sucursal', activo: true, lat: 19.4266, lng: -99.1281 },
  { id: 'suc-san-pablo-2', nombre: 'San Pablo 2', tipo: 'sucursal', activo: true, lat: 19.4263, lng: -99.1277 },
  { id: 'cedis-sp-piso-1', nombre: 'Cedis San Pablo piso 1', tipo: 'cedis', activo: true, lat: 19.4264, lng: -99.1272 },
  { id: 'cedis-sp-piso-2', nombre: 'Cedis San Pablo piso 2', tipo: 'cedis', activo: true, lat: 19.4264, lng: -99.1272 },
  { id: 'cedis-sp-piso-3', nombre: 'Cedis San Pablo piso 3', tipo: 'cedis', activo: true, lat: 19.4264, lng: -99.1272 },
  { id: 'cedis-sp-piso-4', nombre: 'Cedis San Pablo piso 4', tipo: 'cedis', activo: true, lat: 19.4264, lng: -99.1272 },
  { id: 'cedis-texcoco', nombre: 'Cedis Texcoco', tipo: 'cedis', activo: true, lat: 19.5160, lng: -98.8830 },
  { id: 'of-medios-digitales', nombre: 'Medios digitales', tipo: 'oficina', activo: true },
  { id: 'of-talento', nombre: 'Talento', tipo: 'oficina', activo: true },
  { id: 'of-compras', nombre: 'Compras', tipo: 'oficina', activo: true },
  { id: 'of-ecommerce', nombre: 'E-commerce', tipo: 'oficina', activo: true },
  { id: 'of-imagen-marca', nombre: 'Imagen y Marca', tipo: 'oficina', activo: true },
  { id: 'of-desarrollo-ti', nombre: 'Desarrollo TI', tipo: 'oficina', activo: true },
  { id: 'of-soporte-infraestructura', nombre: 'Soporte e infraestructura de redes', tipo: 'oficina', activo: true },
  { id: 'of-mantenimiento', nombre: 'Mantenimiento', tipo: 'oficina', activo: true },
  { id: 'of-operaciones-oficina', nombre: 'Operaciones oficina', tipo: 'oficina', activo: true },
  { id: 'of-dga', nombre: 'Dirección General Adjunta', tipo: 'oficina', activo: true },
  { id: 'of-ceos', nombre: 'CEOs', tipo: 'oficina', activo: true },
  { id: 'of-adquisiciones', nombre: 'Adquisiciones (stock maestro)', tipo: 'oficina', activo: true },
]

// Parámetros de depreciación por familia — deben coincidir con los UPDATE de
// supabase/migrations/002_enriquecimiento.sql y 004_serializado_mantenimiento.sql
// (ver lib/inventario/depreciacion.js).
const DEP_CORTA = { depreciacionInicialPct: 0.2, vidaUtilMeses: 36, valorResidualPct: 0.1 } // celulares/tablets
const DEP_MEDIA = { depreciacionInicialPct: 0.15, vidaUtilMeses: 48, valorResidualPct: 0.1 } // laptops/pc/monitores/impresoras
const DEP_LARGA = { depreciacionInicialPct: 0.15, vidaUtilMeses: 60, valorResidualPct: 0.1 } // radios/cámaras
const DEP_ACCESORIO = { depreciacionInicialPct: 0.25, vidaUtilMeses: 24, valorResidualPct: 0.1 } // audífonos/mouse/teclado/cable
const DEP_HERRAMIENTA = { depreciacionInicialPct: 0.1, vidaUtilMeses: 60, valorResidualPct: 0.15 } // herramienta/equipo de mantenimiento (serializados)
const DEP_NA = { depreciacionInicialPct: 0.15, vidaUtilMeses: 48, valorResidualPct: 0.1 } // no aplica (por cantidad), valor por defecto sin uso

export const FAMILIAS_SEED = [
  { id: 'fam-celulares', tipo: 'sistemas', nombre: 'Celulares', icono: 'celular', orden: 1, modoInventario: 'serializado', ...DEP_CORTA },
  { id: 'fam-radios', tipo: 'sistemas', nombre: 'Radios', icono: 'radio', orden: 2, modoInventario: 'serializado', ...DEP_LARGA },
  { id: 'fam-laptops', tipo: 'sistemas', nombre: 'Laptops', icono: 'laptop', orden: 3, modoInventario: 'serializado', ...DEP_MEDIA },
  { id: 'fam-pc', tipo: 'sistemas', nombre: 'PC de escritorio', icono: 'pc', orden: 4, modoInventario: 'serializado', ...DEP_MEDIA },
  { id: 'fam-monitores', tipo: 'sistemas', nombre: 'Monitores / Pantallas', icono: 'monitor', orden: 5, modoInventario: 'serializado', ...DEP_MEDIA },
  { id: 'fam-impresoras', tipo: 'sistemas', nombre: 'Impresoras', icono: 'impresora', orden: 6, modoInventario: 'serializado', ...DEP_MEDIA },
  { id: 'fam-impresoras-tickets', tipo: 'sistemas', nombre: 'Impresoras de tickets', icono: 'impresora-tickets', orden: 7, modoInventario: 'serializado', ...DEP_MEDIA },
  { id: 'fam-camaras', tipo: 'sistemas', nombre: 'Cámaras', icono: 'camara', orden: 8, modoInventario: 'serializado', ...DEP_LARGA },
  { id: 'fam-audifonos', tipo: 'sistemas', nombre: 'Audífonos', icono: 'audifono', orden: 9, modoInventario: 'serializado', ...DEP_ACCESORIO },
  { id: 'fam-mouse', tipo: 'sistemas', nombre: 'Mouse', icono: 'mouse', orden: 10, modoInventario: 'serializado', ...DEP_ACCESORIO },
  { id: 'fam-teclados', tipo: 'sistemas', nombre: 'Teclados', icono: 'teclado', orden: 11, modoInventario: 'serializado', ...DEP_ACCESORIO },
  { id: 'fam-cables', tipo: 'sistemas', nombre: 'Cables y accesorios', icono: 'cable', orden: 12, modoInventario: 'serializado', ...DEP_ACCESORIO },
  { id: 'fam-tablets', tipo: 'sistemas', nombre: 'Tablets', icono: 'tablet', orden: 13, modoInventario: 'serializado', ...DEP_CORTA },
  { id: 'fam-herramienta', tipo: 'mantenimiento', nombre: 'Herramienta', icono: 'herramienta', orden: 1, modoInventario: 'serializado', ...DEP_HERRAMIENTA },
  { id: 'fam-equipo-mtto', tipo: 'mantenimiento', nombre: 'Equipo', icono: 'equipo', orden: 2, modoInventario: 'serializado', ...DEP_HERRAMIENTA },
  { id: 'fam-refaccion', tipo: 'mantenimiento', nombre: 'Refacción', icono: 'refaccion', orden: 3, modoInventario: 'cantidad', ...DEP_NA },
  { id: 'fam-material', tipo: 'mantenimiento', nombre: 'Material', icono: 'material', orden: 4, modoInventario: 'cantidad', ...DEP_NA },
  { id: 'fam-consumible', tipo: 'mantenimiento', nombre: 'Consumible', icono: 'consumible', orden: 5, modoInventario: 'cantidad', ...DEP_NA },
]
