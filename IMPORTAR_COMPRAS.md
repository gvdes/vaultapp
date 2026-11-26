# Importar compras (Compras/Adquisiciones → stock maestro)

Botón **Importar compras** en *Inventario de Sistemas* y *Inventario de Mantenimiento* (solo roles `adquisiciones` y `admin`). Lee una bitácora de compras, la muestra en una vista previa editable y, al confirmar, carga el stock maestro (ubicación «Adquisiciones (stock maestro)»).

## Cómo funciona
1. **Origen:** archivo CSV / XLSX / JSON, o una dirección web (CSV publicado o endpoint JSON). La última dirección se recuerda (`localStorage`, clave `dga_inv_import_url`) y el botón **Sincronizar ahora** la vuelve a leer.
2. **Vista previa:** por fila se ve tipo, familia, cantidad, costo, proveedor, factura y estado (*Nuevo*, *Duplicado*, *Sin serie*, *Error*). Tipo, familia, cantidad y costo se pueden corregir; cada fila tiene casilla.
3. **Importar N filas:**
   * **Equipo** (laptop, PC, monitor, mouse, teclado, cable, celular, tablet, radio, audífonos, impresora, cámara, switch/router, herramienta…): un registro **por unidad** (cantidad 3 → 3 equipos). Usa la lista de series si viene; si no, `PENDIENTE-<ref>-<n>` y lo anota en *notas* («Serie pendiente de captura»). Estado *disponible*; proveedor, factura, costo y fecha de compra se llenan.
   * **Material** (papelería, limpieza, consumibles, refacciones, resto): busca el material por nombre + familia o lo crea (existencia 0, mínimo 0) y registra una **entrada** con costo y proveedor. Las familias son `fam-consumible`, `fam-refaccion` o `fam-material`.
   * El proveedor se crea en el catálogo si no existe.
   * Herramienta se carga como **equipo por pieza** (`fam-herramienta` es serializada en el catálogo), no como material.

Las filas separadoras de categoría (`📁 TECNOLOGÍA`) no son datos: su texto se arrastra como categoría a las filas siguientes.

## Columnas esperadas
Se reconocen por alias, sin importar mayúsculas ni acentos. Solo **Producto** es obligatoria.

| Dato | Encabezados aceptados (ejemplos) |
|---|---|
| Fecha | Fecha, Fecha de compra, Marca temporal |
| Producto | Producto, Artículo, Descripción, Concepto |
| Cantidad | Cantidad, Cant., Piezas, Unidades (si falta: 1, o el número de series) |
| Proveedor | Proveedor, Razón Social, Proveedor Sugerido |
| Costo unitario | Costo/Precio unitario, Costo, Precio; si no hay: Mejor Menudeo / Costo Menudeo |
| Factura | Factura, Folio, No. factura, Orden de compra |
| Series | Número(s) de serie, Serie, Serial (varias separadas por coma, `;` o salto de línea) |
| Categoría | Categoría, Familia, Clasificación |
| Marca / Modelo / Garantía | Marca, Modelo, Garantía (meses; «2 años» = 24) |
| Destino / Unidad | Destino, Ubicación; Unidad, Presentación |

Fechas: `2025-03-10` o `10/03/2025` (día/mes/año). Importes: `$1,234.50` o `1.234,50`. Hay un CSV de ejemplo en el propio panel («Descargar CSV de ejemplo» / «Usar datos de ejemplo»).

> La ubicación siempre es el stock maestro; si la compra trae *Destino*, solo se anota en *notas*. Las entradas de material no guardan el folio de factura (el modelo no tiene ese campo); sí entra en la referencia anti-duplicados.

## Conectar el Google Sheet
**Opción A, CSV publicado:** en el Sheet, *Archivo → Compartir → Publicar en la web* → elegir la hoja y formato **CSV** → *Publicar* → copiar el enlace (`…/pub?output=csv`) y pegarlo en el panel. Los datos quedan públicos para quien tenga el enlace.

**Opción B, Apps Script (`doGet` devolviendo JSON):** en el proyecto de Apps Script (por ejemplo el de «Requisición de Compra Digital») añade:

```js
function doGet() {
  const hoja = SpreadsheetApp.getActive().getSheetByName('Requisiciones');
  const [encabezados, ...filas] = hoja.getDataRange().getValues();
  const rows = filas.map(f => Object.fromEntries(encabezados.map((h, i) => [h, f[i]])));
  return ContentService.createTextOutput(JSON.stringify({ rows }))
    .setMimeType(ContentService.MimeType.JSON);
}
```
*Implementar → Nueva implementación → Aplicación web* (acceso: cualquiera con el enlace) y pega la URL `/exec`. El JSON puede ser un arreglo de objetos o `{ "rows": [...] }`.

**Si sale «el servidor no permite leerlo desde el navegador» (CORS):** descarga el CSV (*Archivo → Descargar → CSV*) y súbelo como archivo.

## Anti-duplicados
Cada equipo y cada entrada de material guarda `compraRef` = hash estable de `fecha | producto | proveedor | factura | índice de unidad` (normalizado, sin acentos ni mayúsculas). Al importar se omiten las filas cuya referencia ya existe, así que se puede sincronizar las veces que se quiera. Consecuencias:
* Dos líneas **idénticas** en esos cuatro campos cuentan como la misma compra (la segunda sale como *Duplicado*). Si de verdad son dos compras, distíngalas con otro folio/factura.
* Cambiar la fecha, el producto, el proveedor o la factura en el origen genera una compra «nueva».
* La base lo refuerza con índices únicos parciales en `compra_ref` (migración `008`).

## Sincronización automática
No incluida. Una sincronización programada (sin abrir la app) requeriría una **Supabase Edge Function + cron** que lea el origen y aplique las mismas reglas con una clave de servicio.
