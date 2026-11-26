# Auditoría física de inventario

Módulo **Auditorías** (proceso GV-INF-008, *Inventario y Control de Equipo Informático*): compara el registro contra lo que realmente hay en cada sucursal, con apoyo de los Gerentes. Meta: **exactitud ≥ 98 %** cada trimestre.

Principio de la plataforma: **no se borra nada**. Una auditoría cerrada es inmutable; todo lo demás queda en bitácora.

## Modalidades

Se elige al crear la auditoría (`Auditorías → + Nueva auditoría`):

| Modalidad | Quién cuenta | Cómo |
|---|---|---|
| `interna` | Uriel (Sistemas) o el Gerente de Mantenimiento (su dominio); Dirección para "ambos" | Cuenta desde la misma pantalla de la app |
| `auditor` | Un auditor asignado (puede **no** tener cuenta) | Por liga con token, desde su celular |
| `gerente_sucursal` | El Gerente de la sucursal, con apoyo de su equipo | Por liga con token, desde su celular |

Además: auditor (nombre y correo), fecha programada, nota de alcance y la marca **auditoría sorpresa** (sin aviso previo; se comparte la liga solo el día de la visita).

Quien **verifica** en la app es siempre Uriel (o el Gerente de Mantenimiento en su dominio; Dirección en "ambos"), según `canRunAudit`.

## Estados

```
en_conteo ──(el contador envía)──► por_verificar ──(el verificador cierra)──► completada ("Cerrada")
    ▲                                   │
    └──────── pedir reconteo ───────────┘   (solo esos ítems quedan pendientes)
```

- `en_conteo`: se está contando. Las auditorías guardadas con el modelo anterior (`en_proceso`) se leen como `en_conteo`.
- `por_verificar`: el contador envió su conteo; el verificador revisa lo contado contra lo esperado, agrupado por estado (no encontrados, dañados, con diferencia, sin contar, bien), con fotos y notas, y el filtro **Solo discrepancias**.
- **Pedir reconteo**: marca un ítem individual (con motivo) y la auditoría regresa a `en_conteo`; en la liga del contador solo aparecen como pendientes esos ítems. El valor anterior se conserva hasta que se vuelva a contar.
- `completada` (se muestra **Cerrada**): estado final. El valor interno sigue siendo `completada` porque las alertas de control (`alertasControl.js`) cuentan auditorías en ese estado.

## Enlaces de conteo

Cada auditoría tiene un `token` (192 bits). La liga pública es `/auditar/<token>`:

- Pensada para celular, **sin usuario ni contraseña**: busca por serie/modelo, barra de avance, equipos *Bien / Dañado / No encontrado* con nota y foto opcionales, materiales con cantidad contada **a ciegas** (no se muestra la existencia del sistema), confirmación antes de enviar y estado final claro.
- Lectura de QR con la cámara si el navegador soporta `BarcodeDetector` (el QR de cada etiqueta codifica `/verificar/equipo/<id>`; se empareja por id). Si no hay soporte, se busca por serie.
- Con Supabase, el anónimo no lee tablas: usa las funciones `auditoria_publica_obtener`, `auditoria_publica_marcar` y `auditoria_publica_enviar` (migración `015_auditoria_mejorada.sql`, `SECURITY DEFINER`), que validan token y estado y solo permiten tocar los ítems de esa auditoría mientras está `en_conteo`. Las fotos se comprimen en el navegador y viajan como data URL porque el anónimo no puede subir a Storage.
- Para compartir: panel **Compartir liga** (aparece al crear una auditoría con auditor o gerente, y en el detalle mientras está en conteo): copiar liga, **WhatsApp** (`wa.me`), **correo** (`mailto:`) y QR de la liga.

## Acta de auditoría

Desde el detalle (`Ver acta` / `Vista previa del acta`; al cerrar se abre sola) y con **Imprimir / PDF**: sucursal, fechas, alcance, auditor, resumen de exactitud, lista de discrepancias y resoluciones, observaciones y tres firmas (Auditor, Gerente de la sucursal, Verifica Infraestructura / Mantenimiento). Antes del cierre se imprime como *borrador*.

Las resoluciones de cada discrepancia (baja por pérdida con cargo, existencia ajustada, "se conserva en inventario") se registran **antes de cerrar** y quedan en el acta. Lo que no se resuelva consta como "sin resolver al cierre".

## Inmutabilidad

- En la app: una auditoría cerrada no se puede reabrir, editar ni borrar; ninguna pantalla ofrece esas acciones y las funciones de `auditorias.js` lo rechazan.
- En la base de datos: triggers rechazan cualquier `UPDATE` de una auditoría `completada` y de sus ítems (y altas de ítems nuevos). No hay políticas ni botones de borrado.

## KPI GV-INF-008

- **Exactitud** = partidas contadas que coinciden con el registro ÷ partidas contadas. Equipo: encontrado y en buen estado; material: cantidad contada = esperada. Es el mismo criterio del indicador "Exactitud del inventario" de alertas de control.
- Pestaña **Exactitud**: % por auditoría, tendencia por sucursal (sube / baja) y exactitud trimestral global contra la meta de 98 %.
- Pestaña **Programación**: próxima auditoría por sucursal = último cierre + **90 días** (nunca auditada = ya toca); las vencidas se ven en rojo, también las que tienen fecha programada pasada sin contar; desde ahí se programa una auditoría normal o una **sorpresa**.

## Migración y demo

- Base de datos: ejecutar `supabase/migrations/015_auditoria_mejorada.sql` (solo altera `inv_auditorias` / `inv_auditoria_items`, crea triggers y las tres funciones públicas).
- Modo demo local: `sembrarAuditoriasDemo()` (`src/lib/demoSeedAuditorias.js`) crea una auditoría por verificar, una en conteo compartida por liga, tres cerradas con historial de exactitud y una programada vencida. En modo local la liga solo funciona en el mismo navegador (los datos viven en `localStorage`).
