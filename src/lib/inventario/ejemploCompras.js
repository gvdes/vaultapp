/**
 * CSV de ejemplo para probar el importador de compras (Inventario → "Importar compras").
 * Imita una bitácora de compras de Adquisiciones: filas separadoras de categoría ("📁 …"), números de serie
 * separados por comas dentro de comillas, costos con símbolo y comas, y una fila repetida a propósito
 * (la importación la marca como duplicada).
 */
export const EJEMPLO_COMPRAS_NOMBRE = 'ejemplo_compras.csv'

export const EJEMPLO_COMPRAS_CSV = [
  'Fecha,Producto,Categoría,Cantidad,Proveedor / Razón Social,Costo Unitario,Factura,Número(s) de serie,Marca,Modelo,Garantía (meses)',
  '📁 TECNOLOGÍA,,,,,,,,,,',
  '2025-03-10,Laptop Dell Latitude 3440,,2,Compu Mayoreo SA de CV,"$18,500.00",FAC-1021,"DL3440-A1B2, DL3440-C3D4",Dell,Latitude 3440,12',
  '2025-03-10,Laptop Lenovo ThinkPad E14,,1,Compu Mayoreo SA de CV,"$21,990.00",FAC-1021,LNV-E14-7788,Lenovo,ThinkPad E14,12',
  '2025-03-12,Mouse inalámbrico Logitech M170,,5,Office Depot México,189.00,A-55120,,Logitech,M170,6',
  '2025-03-12,Teclado USB Teros TE-4027,,3,Office Depot México,249.50,A-55120,,Teros,TE-4027,6',
  '2025-03-14,Monitor LG 24 pulgadas,,2,Cyberpuerta,"2,899.00",CP-88231,,LG,24MK430H,12',
  '2025-03-15,Cable HDMI 2 m,,10,Cyberpuerta,95.00,CP-88231,,,,',
  '📁 PAPELERÍA,,,,,,,,,,',
  '2025-03-18,"Hojas blancas tamaño carta, caja 5000",,4,Papelera del Centro SA,$680.00,PC-3310,,,,',
  '2025-03-18,Folder manila carta (paq. 100),,6,Papelera del Centro SA,125.00,PC-3310,,,,',
  '2025-03-19,Toner HP 105A negro,,2,Cyberpuerta,"1,149.00",CP-88290,,HP,105A,',
  '📁 LIMPIEZA,,,,,,,,,,',
  '2025-03-20,Cloro 20 L,,3,Distribuidora Limpio SA,210.00,DL-771,,,,',
  '2025-03-20,Jabón líquido para manos 5 L,,4,Distribuidora Limpio SA,165.00,DL-771,,,,',
  '📁 HERRAMIENTA,,,,,,,,,,',
  '2025-03-21,Taladro inalámbrico Truper 20V,,1,Ferretería La Central,"1,599.00",FL-0098,TRU-20V-5531,Truper,TALI-20,12',
  '2025-03-12,Mouse inalámbrico Logitech M170,,5,Office Depot México,189.00,A-55120,,Logitech,M170,6',
].join('\n')

/** Dispara la descarga del CSV de ejemplo (en el navegador normal; en una vista previa con sandbox puede estar bloqueado). */
export function descargarEjemploCompras() {
  const blob = new Blob(['﻿', EJEMPLO_COMPRAS_CSV], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = EJEMPLO_COMPRAS_NOMBRE
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
