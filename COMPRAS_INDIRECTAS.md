# Compras Indirectas

Módulo que **reemplaza** el script de Google de Finanzas ("Nueva Requisición" + "Consultar Estatus") respetando sus campos, folio, categorías y estatus, y añade control: **no se borra nada** (todo se cancela/desactiva y queda en historial/bitácora inmutables).

Código: `src/lib/compras/` (importar siempre desde `src/lib/compras/index.js`). Base de datos: `supabase/migrations/012_roles_compras.sql`, `013_compras.sql`, `019_aprobacion_ceo.sql` (cadena de tres niveles, **reemplazada por 022**), `020_cotizador.sql` (criterios de comparación del cotizador) y `022_aprobacion_finanzas.sql` (un solo nivel de decisión, Finanzas, con tope de aprobación por persona). Datos de demo: `sembrarComprasDemo()` (`demoSeedCompras.js`).

## Estados

| Estado | Etiqueta | Quién lo mueve |
|---|---|---|
| `recibida` | 1. Recibida / Por validar | (creación) |
| `en_cotizacion` | En cotización | Adquisiciones (también Finanzas al pedir ajuste) |
| `en_autorizacion` | 2. En firma / autorización | Adquisiciones |
| `autorizada` | Autorizada (por fondear) | Finanzas (un aprobador elegible por tope; basta uno) |
| `fondeada` | Fondeada (dinero entregado o pago registrado) | Tesorería (efectivo) o Cuentas por pagar (transferencia / tarjeta) |
| `comprada` | Comprada | Adquisiciones |
| `entregada` | Comprada y entregada | Solicitante (confirma por liga) |
| `en_espera`, `rechazada`, `cancelada` | laterales; **motivo obligatorio** | Adquisiciones/Finanzas (espera, cancelación), Finanzas (rechazo) |

Transiciones legales: `ESTADOS_TRANSICIONES` (`tipos.js`) = `cmp_transicion_valida` (SQL). `rechazada`, `cancelada` y `entregada` son terminales; `en_espera` se reanuda al estado donde estaba (`reanudarRequisicion`). Cada cambio guarda quién, cuándo y comentario en `cmp_historial` (append-only) y dispara correo(s).

Requisitos de datos para entrar a un estado (en JS y en el trigger de la base): `en_autorizacion` necesita cotización elegida (con precio en todas las partidas); `en_autorizacion` además exige las cotizaciones que pide el monto —1 bajo `umbral_cotizacion_simple`; desde el umbral, `cotizaciones_minimas` completas de proveedores distintos o una excepción documentada válida— (lo hace cumplir el servidor, `Reglas::problemaCotizaciones`); `en_autorizacion` además exige que exista al menos un aprobador elegible para el monto; `autorizada` necesita una aprobación de Finanzas de la ronda vigente por un aprobador cuyo tope cubra el monto; `fondeada` necesita el movimiento de dinero que corresponde a la forma de pago (entrega de efectivo, transferencia o pago con tarjeta); `en_autorizacion` exige además el **proveedor del catálogo** registrado, activo y completo; `comprada` necesita compras registradas.

## Quién hace qué

- **Solicitantes** (sin cuenta): liga pública, eligen su nombre del directorio (se usa el correo registrado). Para tecnología solicita Uriel y aclara "para quién".
- **Adquisiciones** (Mauricio, rol `adquisiciones`): cotiza, elige proveedor, **lo registra en el catálogo antes de pedir la autorización** (solo el proveedor elegido), envía a autorización, compra y registra costos reales y comprobantes. No cambia razón social, RFC, CLABE ni la baja de un proveedor ya registrado.
- **Finanzas** (rol `finanzas`; basta UNO de los aprobadores elegibles por tope): aprueba/rechaza/pide ajuste por liga de correo o en la app (en la app, su usuario debe estar ligado a su participante).
- **Dirección** (Ricardo; rol de participante `direccion`; usuario `admin`): **no aprueba**. Consulta todo y recibe un aviso informativo de las compras de más de $50,000.
- **CEOs**: ya no participan (sin correos ni ligas). El rol `ceo` queda solo por compatibilidad con el historial.
- **Tesorería** (rol `tesoreria`): solo las compras de **efectivo** (proveedor por remisión): al autorizarse recibe la solicitud de fondos y registra la entrega (folio de caja chica, familia/tipo de gasto, quién recibe). Ya no registra transferencias ni pagos con tarjeta.
- **Cuentas por pagar** (rol `cuentas_por_pagar`, nuevo): las compras de **transferencia o tarjeta** (proveedor con factura). Recibe el aviso `pago_pendiente` (sin CLABE ni dirección), ve «Pagos por hacer» y registra el pago con referencia (folio, o solo los últimos 4 dígitos de la tarjeta), fecha y comprobante; la requisición pasa a `fondeada`. Corrige los datos fiscales y bancarios de los proveedores y los da de baja con motivo.
- **Custodios**: Soporte e Infraestructura (`capturista`, TI) y Gerencia de Mantenimiento (`mantenimiento`) confirman recepciones de inventario. Los nombres viven en el directorio, nunca en código.
- **Talento** (`talento`): solo lectura de directorio aquí; sus accesos a responsivas/equipos/cargos están en el módulo de inventario.
- **Auditor**: por liga (la ruta pública de auditoría por token queda como fase siguiente).

Separación de funciones: `avisosSeparacionFunciones(folio)` avisa si quien solicita, cotiza, aprueba o entrega el dinero coincide.

## Autorización en un solo nivel: Finanzas, con tope por aprobador (regla de Ángel, migración 022)

**Reemplaza** la cadena de tres niveles (Finanzas → Dirección → CEOs) de la migración 019. Ángel, Gerente de Finanzas, lo definió y el usuario lo confirmó:

| Quién | Qué hace |
|---|---|
| **Finanzas** (participantes activos con rol `finanzas`) | **Único nivel de decisión.** Cada aprobador tiene un **tope de aprobación** (`cmp_participantes.tope_aprobacion`; vacío/NULL = sin tope = cualquier monto). Ángel no tiene tope; Janeth tiene **$10,000** (inclusive). Los nombres no están en el código: son datos del directorio. |
| **Dirección** (rol `direccion`, Ricardo) | **No aprueba.** Si el monto de la cotización elegida es **mayor a `umbral_direccion` ($50,000)** recibe un **aviso informativo** (correo `aviso_direccion`, sin botones, sin token, sin liga de aprobación): «Para tu conocimiento: esta compra de $X la autoriza Finanzas; no requiere tu autorización», con resumen y comparativo. Una vez por envío a autorización. |
| **CEOs** | **Fuera del flujo**: no reciben nada (Ángel los consulta por fuera). El rol `ceo`, `umbral_ceo`, el nivel `ceo` y `requiere_ceo` siguen en la base por compatibilidad con el historial, pero ningún flujo nuevo los usa y la interfaz ya no los muestra. |

- **Elegibilidad.** Un aprobador es *elegible* para una compra de monto M si `tope_aprobacion is null or M <= tope_aprobacion` (borde exacto: con tope 10,000, $10,000.00 sí y $10,000.01 no). En JS: `topeCubre` / `esAprobadorElegible` (`tipos.js`), `aprobadoresElegibles(monto)` (`aprobaciones.js`); en SQL: `cmp_tope_cubre`, `cmp_participante_elegible`, `cmp_hay_aprobador_elegible` (022).
- **A quién se le manda.** Al enviar a autorización la solicitud (resumen + comparativo + botones) sale a **todos los aprobadores elegibles** (basta UNO; liga de un solo uso por aprobador; al decidir uno, las ligas de los demás quedan consumidas). Hasta $10,000 le llega a Ángel y a Janeth; de más de $10,000, solo a Ángel. Como Ángel no tiene tope, siempre la recibe.
- **Sin aprobador elegible no se puede enviar** («No hay un aprobador de Finanzas activo con tope suficiente para este monto.»): lo valida `solicitarAutorizacion` antes de cambiar de estado y también el trigger de la base (`cmp_requisitos_estado` para `en_autorizacion`).
- **Autorizada** = al menos una aprobación `finanzas` de la ronda vigente por un aprobador elegible (se revalida contra el monto y el tope vigentes). Rechazar o pedir ajuste exige motivo, como siempre.
- **Ligas por correo.** `cmp_ver_para_aprobar` / `cmp_aprobar_por_token` revalidan el tope del dueño de la liga contra el monto vigente (si la cotización cambió y ya no cubre, o la persona se desactivó, la liga se rechaza con un mensaje claro: «Esta liga ya no es válida: el monto … rebasa tu tope de aprobación…»). Las ligas viejas de nivel `direccion` / `ceo` (datos de 019) se rechazan con «Esta liga ya no es válida: la autorización la resuelve Finanzas.».
- **En la app** decide **solo el rol `finanzas`** (Dirección/admin ya no: se quitó de `canApproveFinanzas`, de la política RLS y del trigger de `cmp_aprobaciones`, y de los botones). Además el usuario debe estar **ligado a su participante** (`profiles.participante_id`, que solo asigna Dirección): perfil → participante activo con rol finanzas cuyo tope cubra el monto. **Sin liga no puede aprobar** (default restrictivo). Un usuario con tope insuficiente no ve botones de decisión (la pestaña *Autorización* explica por qué), y la base lo rechaza aunque lo intente por la API. Rechazar directo con `cmp_cambiar_estado` en autorización exige lo mismo. La aprobación de una **diferencia** (lo comprado rebasa lo autorizado) también respeta el tope, medido contra lo realmente comprado.
- **Separación de funciones.** Solo Dirección asigna el rol `finanzas`, el `tope_aprobacion` y `profiles.participante_id` (trigger `cmp_participantes_guard` y `profiles_participante_guard`; cambios en bitácora). Como Dirección ya no vota, tampoco puede **leer** las ligas vivas (`cmp_tokens`: nadie las lee desde la app) ni los correos de autorización (`cmp_notificaciones` tipo `autorizacion_*`: llevan ligas de un solo uso); sí lee el aviso informativo y los demás correos.
- **Banderas.** `requiere_direccion` significa ahora «se avisó a Dirección»; `requiere_ceo` no se usa. Ninguna condiciona una transición.
- Finanzas sigue aprobando todo, sin exención por montos bajos (pregunta abierta a Finanzas: ¿hay un monto mínimo, p. ej. menos de $100, que no requiera aprobación?).

## Cotizador: hoja de comparación, criterios, puntaje y recomendación

Una sola pantalla (pestaña *Cotizaciones*, `components/compras/cotizador/CotizadorHoja.vue`): **columnas = proveedores** (hasta 5, con autocompletado de contacto y teléfono con los proveedores usados antes) y **filas = partidas** (precio unitario en línea; Enter baja, Tab avanza, se puede pegar una columna de Excel) y luego los criterios. Al pie: costo total comparable, puntaje, insignias y alertas, con la mejor celda de cada criterio resaltada. Un botón principal, **«Guardar y enviar a autorización»**, y uno secundario, «Guardar borrador». Corre sobre las funciones de siempre (`addCotizacion`, `actualizarCotizacion`, `elegirProveedor`, `solicitarAutorizacion`; `guardarHoja` guarda todas las columnas de una vez). Nada se borra: descartar una cotización es `activo = false` con motivo, y cada cambio queda en la bitácora.

**Criterios por cotización** (columnas opcionales de `cmp_cotizaciones`, migración 020; sin dato = no cuenta ni perjudica):

| Grupo | Campo | Qué es |
|---|---|---|
| Precio | precio por partida (`cmp_cotizacion_items`) | precio unitario × cantidad |
| | `descuento_monto` | descuento en pesos (volumen / pronto pago) |
| | `flete` | flete / envío en pesos |
| | `iva_incluido` (default sí) | si es **no**, el comparativo suma el IVA (`cmp_config` `iva_pct`, 16 %) para comparar manzanas con manzanas |
| Entrega | `tiempo_entrega_dias` | días |
| Garantía | `garantia_meses`, `garantia_responsable` | meses; `proveedor` / `fabricante` / `ninguna` (ninguna = 0 meses) |
| Pago | `dias_credito` (0 = contado), `anticipo_pct` (0-100) | |
| Respaldo de marca | `distribuidor_autorizado`, `soporte_tecnico` | sí / no / sin dato |
| Condiciones | `vigencia_hasta` (fecha), `acepta_devoluciones` | |
| Historial | `calificacion_proveedor` (1-5) | experiencia previa; se sugiere el promedio de las cotizaciones anteriores del mismo proveedor |
| Notas | `calidad`, `condiciones` (texto libre) | se conservan como notas |

**Costo total comparable** (es el monto que se compara, el que se autoriza y contra el que se miden el umbral de aviso a Dirección y el tope de cada aprobador):

`(Σ precio unitario × cantidad − descuento + flete) × (1 + IVA)`, con IVA solo si `iva_incluido` es falso; a centavos. Un descuento nunca pasa del subtotal. Es la misma fórmula en JS (`totalComparableDe`, `src/lib/compras/analisisCotizaciones.js`) y en SQL (`cmp_monto_cotizacion`, 020); la prueba de la base compara 150 cotizaciones al azar entre ambas. Las cotizaciones anteriores a 020 tienen descuento 0, flete 0 e IVA incluido: su total no cambia.

**Puntaje de 0 a 100** = Σ (peso × puntaje parcial) ÷ Σ (pesos de los criterios con dato). Pesos por defecto, editables en *Directorio → Reglas* (deben sumar 100; `cmp_config` `cotizador_pesos`): **precio 40 · garantía 15 · entrega 10 · crédito 10 · respaldo de marca 15 · condiciones 5 · calificación 5**.

| Criterio | Puntaje parcial (0-100) |
|---|---|
| Precio | precio más bajo del grupo ÷ precio · 100 (solo cotizaciones completas) |
| Garantía | meses ÷ máximo de meses del grupo · 100 (si nadie ofrece garantía no se usa) |
| Entrega | menor plazo del grupo ÷ plazo · 100 (0 días cuenta como 1) |
| Crédito | días (tope 30) ÷ máximo del grupo (tope 30) · 100 (si nadie da crédito no se usa) |
| Respaldo | distribuidor autorizado 60 + soporte técnico 40 (lo no capturado no cuenta) |
| Condiciones | promedio de: vigencia vigente, acepta devoluciones, anticipo bajo (0 % = 100; 50 % o más = 0) |
| Calificación | estrellas ÷ 5 · 100 |

Si a una cotización le falta el dato de un criterio, ese criterio **no la penaliza** (su peso se reparte entre los demás) y se muestra la alerta «Datos incompletos» con lo que falta. Una cotización sin precio en todas las partidas se muestra pero **no puede recomendarse ni elegirse**. Desempates estables: mayor puntaje, menor total comparable, menor plazo de entrega y, al final, el orden de captura.

**Cómo leer la recomendación.** La *recomendada* es la de mayor puntaje; sus *razones* dicen por qué («Más barata», «Mayor garantía: 24 m», «Entrega más rápida: 3 días», «Crédito a 30 días», «Distribuidor autorizado», «Solo 2.6 % más cara que la más barata»). Las *alertas* son: «Cotización vencida», «Pide N% de anticipo» (desde 30 %), «Sin garantía», «Sin distribuidor autorizado», «Faltan precios» y «Datos incompletos». Es una guía, no una orden: Adquisiciones puede elegir otra. **Regla de justificación (un solo aviso):** si la elegida no es la más barata o no es la recomendada, la justificación es obligatoria (si es la recomendada pero cuesta más, el cotizador deja escrito lo que dice el comparativo y basta confirmarlo). Además siguen vigentes las cotizaciones mínimas y la excepción documentada (ver abajo). La función pura `analizarCotizaciones` calcula todo en el cliente; `evaluarEleccion` aplica la regla de justificación en el cotizador y en `elegirProveedor`.

**Quién ve qué.** Aprobadores: el correo de autorización (`plantillaAutorizacion`) y la liga pública (`/compras/aprobar/:token`) muestran la recomendación, un bloque por proveedor con total, puntaje, entrega, garantía, crédito, anticipo y distribuidor, y las alertas, con tablas simples sin JS y diseño que se acomoda al celular. La RPC `cmp_ver_para_aprobar` entrega los datos crudos (criterios, subtotal, tasa de IVA y pesos) y la app calcula el mismo puntaje con `analizarCotizaciones`; los totales coinciden exactamente con los de la app. Los correos que arma la base (el aviso a Dirección y la solicitud por defecto; `cmp_resumen_aprobacion_html`) llevan el mismo comparativo sin puntaje. Solo `canQuote` (adquisiciones, admin) captura; los demás roles ven la hoja en solo lectura. Al salir de «En cotización» las columnas nuevas quedan congeladas igual que el resto de la cotización.

## Reglas y umbrales

`umbral_direccion` = **50,000** (confirmado por Finanzas; desde 022 significa **aviso a Dirección**, ya no aprobación). `umbral_ceo` = 100,000 está **en desuso** (se conserva el valor). El tope de Janeth ($10,000) está confirmado por el usuario y vive en el directorio, no en `cmp_config`. Cotizaciones (decididas por Dirección): `umbral_sin_cotizacion` = 100 (compra menor: solo registro), `umbral_cotizacion_simple` = 1,000 (menos de ese monto basta 1 cotización) y `cotizaciones_minimas` = 3 (desde el umbral, de proveedores distintos, salvo excepción).

Tabla `cmp_config` (editable solo por Dirección): `umbral_cotizacion_simple` = 1,000 · `umbral_sin_cotizacion` = 100 · `umbral_direccion` = 50,000 (aviso) · `umbral_ceo` = 100,000 (en desuso) · `cotizaciones_minimas` = 3 · `copias_respaldo` = [] · `tolerancia_diferencia_pct` = 0 · `dias_expira_token` = 15 · `url_base` (URL pública de la app para las ligas de correo; **configurarla al desplegar**) · `iva_pct` = 16 (IVA para normalizar cotizaciones sin IVA incluido) · `cotizador_pesos` = {precio 40, garantía 15, entrega 10, crédito 10, respaldo 15, condiciones 5, calificación 5} (jsonb; suman 100).

- Menos de `umbral_cotizacion_simple` ($1,000) basta 1 cotización completa. Desde ese monto (`>=`: $1,000.00 ya exige) se exigen `cotizaciones_minimas` (3) cotizaciones completas de **proveedores distintos** (sin distinguir mayúsculas, acentos ni espacios), salvo **excepción documentada** (`excepcion_tipo`: `especializado`, `adjudicacion_directa` instruida por `ceo`|`dga`, o `urgencia`, con justificación de 15 caracteres o más): con excepción basta 1, y Dirección recibe un correo informativo `aviso_excepcion_cotizaciones` (sin token ni botones, una vez por envío). La excepción se congela desde «en autorización»; Finanzas la ve en la app, en la liga y en el correo.
- **Compra menor** (monto estrictamente menor a `umbral_sin_cotizacion`, $100): no requiere cotización, solo el **registro** (cotización `esRegistro` de una sola línea: proveedor y precio por partida, sin criterios, comparativo ni justificación; se elige sola). Sigue requiriendo la autorización de Finanzas, que ve la leyenda «Compra menor (menos de $100): sin cotización, solo registro» en la app, en la liga pública y en el correo. El registro es excluyente (no se mezcla con cotizaciones normales activas; solo uno por requisición) y con monto ≥ umbral no puede enviarse a autorización. Los festivos de las alertas se calculan solos (`festivosOficiales(año)`, LFT art. 74).
- Proveedor elegido que no es el más barato **o no es el recomendado por el comparativo**: justificación obligatoria (un solo aviso; ver «Cotizador»).
- Monto > umbral de aviso: Dirección recibe un correo informativo (no aprueba). La autorización es siempre de Finanzas, según el tope de cada aprobador (ver arriba).
- Real comprado > autorizado (+ tolerancia): exige justificación al cerrar la compra, alerta a Finanzas y queda `pendiente_finanzas` hasta `aprobarDiferencia`.
- Comprobación del gasto: ticket/factura y devolución del cambio; `resumenDinero(folio)` muestra autorizado vs entregado vs gastado vs comprobado vs cambio.
- Antes de comprar: `avisosAntesDeComprar(partidas)` avisa de duplicados en requisiciones abiertas/recientes y de stock disponible en inventario.

## Tablas (`cmp_*`, ids de texto)

`cmp_participantes` (con `tope_aprobacion`; `profiles.participante_id` liga cada usuario con su participante), `cmp_categorias` (8 de Finanzas con `destino_inventario`: TECNOLOGÍA→`ti`; HERRAMIENTA, FERRETERÍA Y PLOMERÍA, MOBILIARIO Y EQUIPO→`mantenimiento`; resto→`ninguno`), `cmp_catalogo` (118 productos del Sheet; costos de referencia vacíos), `cmp_config`, `cmp_requisiciones` (folio `REQ-AAAAMMDD-HHMMSS`), `cmp_partidas`, `cmp_cotizaciones` (con los criterios de comparación de la 020) + `cmp_cotizacion_items`, `cmp_aprobaciones` (**append-only**; desde 022 solo se registra el nivel `finanzas`; `direccion` y `ceo` son historial), `cmp_dinero` (**append-only**), `cmp_compras`, `cmp_recepciones`, `cmp_historial` (**append-only**), `cmp_notificaciones` (bandeja de correos), `cmp_tokens` (ligas de aprobación).

Seguridad: sin políticas ni permiso de DELETE (trigger `BEFORE DELETE` en todas); triggers que rechazan UPDATE/DELETE en las append-only; trigger `BEFORE UPDATE` en `cmp_requisiciones` (transición legal, rol por estado, requisitos de datos, columnas permitidas por rol, monto autorizado = monto de la cotización elegida); partidas/cotizaciones se congelan al salir de cotización; el servidor fija nombre, vía y monto de cada aprobación. El anónimo no lee tablas: solo ejecuta RPC. Las ligas de aprobación (`cmp_tokens`) no las lee nadie desde la app y los correos `autorizacion_*` de `cmp_notificaciones` tampoco (ni Dirección: ya no vota y con la liga de otro podría aprobar); Dirección sí lee el resto de la bandeja, incluido `aviso_direccion`. La migración 014 añade bitácora y el bloqueo de borrado también a estas tablas.

## RPC

Públicas (anon): `cmp_directorio_publico()` (sin correos), `cmp_formulario_publico()` (categorías, catálogo sin costos, sucursales), `cmp_crear_requisicion(payload)` → `{folio, token}`, `cmp_consultar_requisicion(folio, token)` (solo folio, solicitante, área, sucursales, productos, estado e historial de estados; nunca proveedor/precios/montos), `cmp_ver_para_aprobar(token)`, `cmp_aprobar_por_token(token, decision, comentario)` (un solo uso por aprobador; basta UNO; revalida que el dueño de la liga siga siendo elegible para el monto vigente; rechaza las ligas viejas de Dirección/CEOs), `cmp_confirmar_recibido(folio, token)`. `cmp_ver_para_aprobar` (020) incluye, por cotización activa, los criterios, `subtotal`, `completa` y `sinPrecios`, y a nivel general `ivaPct` y `pesos`.
Con sesión: `cmp_cambiar_estado(folio, a, comentario)`, `cmp_solicitar_autorizacion(folio, nivel, asunto, html)` (solo nivel `finanzas`; valida que quien llama sea Adquisiciones o Dirección; emite los tokens **a todos los aprobadores elegibles** dentro de la base y encola los correos —los tokens nunca llegan al navegador— y, si el monto rebasa `umbral_direccion`, encola el `aviso_direccion` una vez por envío —y, si la compra va amparada en una excepción de cotizaciones, el `aviso_excepcion_cotizaciones` a Dirección, también una vez por envío—; si no hay aprobador elegible, error). Funciones internas (022): `cmp_tope_cubre`, `cmp_participante_elegible`, `cmp_hay_aprobador_elegible`, `cmp_usuario_puede_aprobar`, `cmp_aprobacion_valida`, `cmp_avisar_direccion`. `cmp_niveles_para` / `cmp_niveles_de` (019) ahora siempre devuelven `{finanzas}`.

## Rutas (constante `RUTAS_COMPRAS`)

Públicas: `/compras/nueva`, `/compras/estatus/:folio/:token`, `/compras/aprobar/:token?d=aprobada|rechazada|ajuste` (`d` solo preselecciona; **nunca ejecuta al abrir la liga**, para que los antivirus de correo no aprueben). Privadas: `/compras`, `/compras/requisicion/:folio`.

## Correos (bandeja `cmp_notificaciones`)

Plantillas en español en `outbox.js` (misma apariencia que `cmp_html()` en SQL): confirmación al solicitante (folio + liga de seguimiento), aviso de nueva solicitud a Adquisiciones, solicitud de autorización a los aprobadores de Finanzas elegibles (resumen + comparativo + Aprobar / Rechazar / Abrir en la plataforma), **aviso informativo a Dirección** (`aviso_direccion`, sin botones ni liga; solo si el monto rebasa el umbral), **aviso informativo a Dirección por excepción de cotizaciones** (`aviso_excepcion_cotizaciones`, «Para tu conocimiento: excepción de cotizaciones en compra de $… · FOLIO»; sin botones ni liga, «no requiere tu autorización»; solo si se usó una excepción), fondos por entregar a Tesorería, avisos de estado al solicitante (cotizando, autorizada, dinero entregado, comprada, entregada, rechazada, cancelada, en espera), alerta a Finanzas por diferencias y recepción pendiente a custodios. Estados: `pendiente | enviado | error | simulado`. **El modo demo nunca envía correos** (todo es `simulado`, vista previa). Con Supabase un emisor externo (Apps Script o Edge Function + SMTP) envía los `pendiente` y los marca; los correos con ligas de aprobación no se copian a `copias_respaldo`.

## Alimentación del inventario

Al pasar a `comprada`, cada partida cuya categoría tiene destino `ti` o `mantenimiento` genera una **recepción pendiente** con todo precargado (producto, cantidad, proveedor, factura/ticket, costo unitario real, fecha, "para quién", `compraRef` = folio#partida) y se avisa al custodio. `confirmarRecepcion(id, {series, familiaId…})` crea un equipo por unidad en `UBICACION_STOCK_MAESTRO` (familias serializadas, `compraRef` único por unidad: reintentable sin duplicar) o la entrada de material (familias por cantidad). Las categorías `ninguno` no generan inventario.

## Datos de demo

`sembrarComprasDemo()` (solo modo local) crea participantes con correos `@ejemplo.mx` («Aprobador Finanzas 1 (demo)» sin tope, «Aprobador Finanzas 2 (demo)» con tope de $10,000 y «Dirección General (demo)», que recibe avisos; **no hay CEOs**) y 12 requisiciones: una por estado más dos en autorización de ~$61,000 y ~$125,400 que esperan solo a Finanzas 1 (la liga solo le llegó a él) con el aviso a Dirección simulado, y una de ~$7,980 a la que llegaron las ligas de los DOS aprobadores. Los usuarios `finanzas` (sin tope) y `finanzas2` (tope $10,000) están ligados a esos participantes. Las cotizaciones traen **criterios variados** (una con crédito a 30 días, una con anticipo de 50 %, una sin distribuidor autorizado y una vencida; las elegidas no llevan descuento, flete ni IVA aparte, así que sus montos siguen calibrando los umbrales), aprobaciones (por app y por liga), dinero, compras, correos simulados y recepciones pendientes. El orquestador debe llamarla desde `demoSeed.js`.

## Pendiente de confirmar

La tolerancia de sobrecosto con Finanzas (el umbral de aviso a Dirección, el tope de Janeth, las cotizaciones por monto (1 bajo $1,000; 3 de proveedores distintos desde $1,000, salvo excepción documentada) y la compra menor a $100 —sin cotización, solo registro— ya están decididos, y los festivos se calculan solos); si Tesorería registra transferencias excepcionales; `url_base`; correos reales (SQL de semilla aparte); emisor de correos; ruta pública de auditoría por token; costos de referencia del catálogo (el Sheet no trae precios reales).
