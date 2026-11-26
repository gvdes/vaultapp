# Guía de capacitación — Inventarios DGA

**Preparar la demo (local):** `npm install` → `npm run dev` → abrir `http://localhost:9000`. En el login pulsa **"Cargar datos de ejemplo (capacitación)"**; deja equipos, materiales, solicitudes, una baja por robo y una auditoría en proceso. Entra con `admin`, `soporte` (Uriel, TI), `mantenimiento` (Gerencia de Mantenimiento), `adquisiciones` (opcional) o `solicitante` (la contraseña aparece en pantalla). *Los datos de ejemplo viven solo en ese navegador.*

## La idea en una frase
**Dos operadores, cada uno en lo suyo: Uriel (Líder de TI) lleva Sistemas y el Gerente de Mantenimiento lleva Mantenimiento. Cada uno da de alta, asigna y cuida su propio inventario; Dirección ve y corrige todo.** Las compras (Adquisiciones/Finanzas) no están conectadas a la app: por eso el control es que *quien compra no es quien custodia* y que *la evidencia de compra no se puede cambiar después*. Cada pieza queda ligada a una ubicación, un responsable, un historial y quién la registró.

---

## 0. Quién hace qué
| Persona (usuario demo) | Dominio | Da de alta | Asigna / baja / audita | Solo consulta |
|---|---|---|---|---|
| **Uriel, Líder de TI** (`soporte`) | Sistemas | Equipo de TI | Equipo de TI, auditorías y solicitudes de Sistemas | Mantenimiento |
| **Gerente de Mantenimiento** (`mantenimiento`) | Mantenimiento | Material, herramienta y equipo de valor, entradas, proveedores | Salidas, traslados, calendario preventivo, bajas, auditorías y solicitudes de Mantenimiento | Sistemas |
| **Dirección** (`admin`) | Ambos | Todo | Todo; **único que edita datos de compra** de lo ya registrado (junto con Adquisiciones) y que audita "Sistemas y Mantenimiento" | — |
| Adquisiciones (`adquisiciones`, **opcional**) | Ambos (cargar) | Stock de ambos dominios; puede editar datos de compra | No asigna ni audita | — |
| Solicitante | — | — | — | Sus propias solicitudes |

**Qué ve cada quien en el menú y en el Inicio** (cada perfil ve solo lo suyo; si escribes en la barra una dirección que no te toca, la app te regresa a tu Inicio):

| Usuario demo | Menú lateral | Qué ve en Inicio |
|---|---|---|
| `admin` (Dirección) | Inicio, Sistemas, Mantenimiento, Solicitudes, Compras, Auditorías, Directorio, Bitácora | Todo: valor, mapa de sucursales, gastos de Compras, pérdidas, alertas e indicadores |
| `soporte` (Uriel) | Inicio, Sistemas, Solicitudes, Compras, Auditorías, Directorio | **Solo Sistemas**: su valor, alertas, mapa y ficha de sucursal (sin Mantenimiento ni gastos). En Compras solo ve **lo que llega a TI o pidió él**, sin precios ni aprobaciones, y confirma recepciones |
| `mantenimiento` | Inicio, Mantenimiento, Solicitudes, Compras, Auditorías, Directorio | Lo mismo, pero **solo Mantenimiento** |
| `adquisiciones` (Mauricio) | Inicio, Sistemas, Mantenimiento, Solicitudes, Compras, Proveedores, Directorio | Sus pendientes de compras y el **stock**: existencias, bajo el mínimo, sobre el máximo (solo cantidades, **sin costos ni gastos**). En Compras trabaja completo, pero sin tarjetas de monto autorizado/gastado ni la pestaña *Reportes* |
| `finanzas` (Ángel, Janeth) | Inicio, Sistemas, Mantenimiento, Compras, Proveedores, Directorio, Bitácora | Sus pendientes (por autorizar **solo lo que su tope de aprobación cubre**, diferencias) y los indicadores de Compras **con dinero**; inventario solo lectura, sin mapa |
| `tesoreria` | Inicio, Compras, Proveedores | Sus pendientes (por fondear **efectivo**, comprobaciones); en Compras, solo las compras de efectivo ya autorizadas |
| `cuentas_por_pagar` | Inicio, Compras, Proveedores | **Pagos por hacer** (compras autorizadas por transferencia o tarjeta); registra el pago con referencia, fecha y comprobante y mantiene el catálogo de proveedores |
| `talento` | Inicio, Sistemas, Directorio | Pendientes de responsivas; Sistemas en solo lectura y **sin costos** |
| `solicitante` | Inicio, Solicitudes | Sus solicitudes |

> Esto controla lo que se **ve** en la app. La seguridad de lectura en la base de datos se endurece en una fase posterior.

### Regla de control individual
* **Por pieza** (número de serie, proveedor y factura/OC **obligatorios**): todo lo que cuesta **$1,000 o más** (TI) y, en Mantenimiento, **solo herramienta y equipo caros**: taladros, caladoras, cortadoras, pistolas de clavos, escaleras, máquina de soldar, sierra de mesa, cortadoras de acero, compresoras…
* **Por cantidad**: lo barato y los consumibles (tornillos, focos, cinta, papel, limpieza…) van en **Refacción / Material / Consumible** con existencia, mínimo y entradas/salidas. Si capturas una pieza de menos de $1,000 el formulario te lo recuerda.

### Candados que verás
* **Serie única:** si repites un número de serie (en otro equipo o dentro del mismo lote), la app lo rechaza con el mensaje "ya está registrada". Las series `PENDIENTE-…` de importaciones están exentas hasta que se capturen.
* **Evidencia de compra:** al dar de alta algo de $1,000 o más son obligatorios *Proveedor* y *Factura u orden de compra*.
* **Quién lo registró:** el *Historial* de cada equipo dice "Por: <nombre>"; las entradas de material guardan quién las recibió.
* **Datos de compra inmutables:** después del alta, ni Uriel ni la Gerencia pueden cambiar modelo, serie, proveedor, factura ni costo (la pantalla los muestra de solo lectura y la base de datos lo impide). Si hay un error de captura, lo corrige Dirección.

## 1. Dar de alta el stock de tu dominio (Uriel en Sistemas · Gerencia en Mantenimiento)
0. **Importar compras:** botón *Importar compras* (en tu dominio): sube el CSV/Excel de lo comprado (o pega la dirección del archivo publicado) → vista previa → *Importar*. Solo importa filas de tu dominio (las demás salen como "Fuera de tu área") y marca como duplicadas las series ya registradas. Ver `IMPORTAR_COMPRAS.md`.
1. **Sistemas (Uriel) → Laptops → "+ Nuevo equipo".** Captura modelo, marca, número de serie, proveedor, fecha, **Factura u orden de compra**, costo y garantía. Adjunta factura (PDF) y foto.
   *Lote:* si compraron 10 piezas iguales, pon "Cantidad de piezas" y captura solo el número de serie de cada una.
2. El equipo nace en **"Adquisiciones (stock maestro)"**, estado *Disponible*, y de ahí se asigna a su ubicación.
3. **Mantenimiento (Gerencia) → una familia → "+ Nuevo material"** (la cantidad inicial queda como una *entrada*), y **"+ Entrada"** cuando llega una compra (cantidad, costo unitario, proveedor, factura/OC). Herramienta y equipo caros: **"+ Nuevo artículo"** pieza por pieza.
4. **Proveedores:** catálogo con historial de compras por proveedor (lo gestiona la Gerencia).
5. Botón **Ver QR / Imprimir etiquetas** para etiquetar físicamente cada pieza.
6. **Reporte de altas** (botón junto a *Exportar Excel*, en Sistemas y en Mantenimiento): elige rango de fechas y área; lista cada alta con fecha, familia, modelo, serie, proveedor, factura/OC, cantidad, costo y **quién la registró**, con totales y *Exportar Excel*. **Es lo que se entrega a Finanzas cada mes** para conciliar contra lo pagado: los renglones con "Falta" en proveedor o factura son lo primero a aclarar.

## 2. Asignar y controlar (Uriel en Sistemas · Gerencia en Mantenimiento)
1. Entra a la familia → en la pieza pulsa **"Asignar"**: ubicación (sucursal/área), usuario responsable, puesto, estado, responsiva firmada. En el dominio que no es tuyo solo ves, no operas.
2. **Historial** de cada pieza: alta (con "Por: quién"), reasignaciones, cambios de estado y quién los hizo.
3. **Materiales (Gerencia):** **"− Asignar / salida"** indica cuánto sale y a qué sucursal/área.
4. **Baja** (obsoleto) o **Baja por pérdida/robo**: calcula el **valor depreciado** (no el precio de nuevo) y registra el cargo al colaborador; editable si Dirección ajusta el monto. Se consulta en **Cargos por pérdida**.
5. **Solicitudes:** cada operador resuelve las de su dominio: *Resolver* asigna del stock disponible o la marca *Pendiente de compra*.
6. **Auditorías** (ver abajo) y, para la Gerencia, el **Calendario preventivo**.

## 2.1 Responsivas: cadena de custodia
* Al **Asignar** un equipo a otra persona se captura: el **responsable** (el colaborador que lo recibe, quien responde por el equipo), el **gerente que firma/autoriza**, la **foto del equipo al entregar** (para ver su estado) y, si ya la tienen, la **responsiva firmada** escaneada.
* El sistema genera la **Carta responsiva** (folio RESP-AAAA-NNNN) lista para imprimir con tres firmas: recibe el colaborador, entrega quien asigna (Uriel o la Gerencia), autoriza el gerente.
* Botón **Responsivas** en cada equipo: muestra el responsable actual y toda la cadena (alta → operador → Gerente/Colaborador…), con foto y documento de cada entrega. Los **datos de compra (factura, costo, proveedor) no cambian** con las reasignaciones.

## 2.2 Material por sucursal
* **"− Asignar / salida" → Trasladar a sucursal** (lo hace la Gerencia de Mantenimiento): el material sale del stock maestro y pasa a ser inventario de esa sucursal (cuenta en su valor, en el mapa y en su auditoría). **Consumo / uso** lo descuenta del inventario.

## 3. Auditoría física de una sucursal
1. **Auditorías → "+ Nueva auditoría"** → elige sucursal y qué auditar (cada operador solo ve su tipo: Uriel *Sistemas*, Gerencia *Mantenimiento*; "Sistemas y Mantenimiento" solo Dirección). El sistema lista todo lo que *debería* estar ahí.
2. En sitio, por cada equipo: **Bien / Dañado / No encontrado**; por cada material, la **cantidad contada**.
3. **Cerrar auditoría** → panel de discrepancias con acción directa: *Dar de baja por pérdida* (equipo no encontrado) o *Ajustar a cantidad contada* (material).
4. *Sugerencia de uso:* una sucursal por semana, empezando por donde hay más dudas.

## 4. Solicitantes y líderes de área (sin cuenta)
* Comparte el link **`/solicitar`** (botón *Copiar link para compartir* en Solicitudes). Llenan nombre, sucursal/área y qué necesitan; llega a la cola.
* **QR:** cualquiera que escanee la etiqueta ve qué es, dónde debe estar y quién lo tiene — **sin costos**. Si lo encuentra fuera de lugar, avisa a Soporte.

## 4.1 Compras Indirectas (de la solicitud a la bodega)
Reemplaza el script de Finanzas conservando sus campos, folio (`REQ-AAAAMMDD-HHMMSS`) y categorías. **Nada se borra**: todo se cancela y queda en el historial. Nadie puede borrar nada del inventario ni de Compras (ni Uriel, Mantenimiento, Mauricio o Dirección): si alguien lo intenta, el registro sigue intacto, el intento queda en la Bitácora y Ricardo (Dirección) recibe un aviso de alerta.
1. **Solicita** el líder de área (para tecnología, Uriel, aclarando "para quién") en **`/compras/nueva`**, sin cuenta. Recibe su folio y una liga de seguimiento tipo Amazon (también por correo).
2. **Adquisiciones (Mauricio)** ve la solicitud en **Compras** (tablero por etapa), abre la pestaña **Cotizaciones** y llena **una sola hoja de comparación** (una columna por proveedor, hasta 5; una fila por partida). Es lo que se captura, de arriba abajo, en **unos 5 a 8 minutos para 3 proveedores** (menos si ya los cotizó antes: la hoja completa contacto, teléfono y calificación):
   * **Proveedor y precios (lo mínimo):** escribe el nombre (si ya cotizó antes, lo sugiere y trae contacto y teléfono) y el **precio unitario** de cada partida. **Enter baja** a la siguiente partida, **Tab avanza**, y puedes **pegar una columna de precios desde Excel**. Con esto solo ya hay comparativo.
   * **Lo que cambia la decisión (todo opcional, un clic o un número):** descuento y flete en pesos; si los precios **ya traen IVA** o hay que sumarlo (así se comparan manzanas con manzanas); **días de entrega**; **garantía** (meses y quién responde); **crédito** (Contado / 15 / 30 / 45 días) y **anticipo** (0 / 30 / 50 %); si es **distribuidor autorizado** y da **soporte técnico**; hasta cuándo **respeta el precio**; si **acepta devoluciones**; y su **calificación** de 1 a 5 estrellas (ya viene sugerida si lo has usado antes). El crédito de contado, el anticipo en 0 y el IVA incluido ya vienen puestos.
   * **El comparativo se arma solo** mientras capturas: costo total comparable de cada proveedor, puntaje de 0 a 100, insignias (*Más barata*, *Recomendada*, *Mayor garantía*…) y alertas (*Cotización vencida*, *Pide 50% de anticipo*, *Sin garantía*, *Sin distribuidor autorizado*, *Datos incompletos*). La mejor celda de cada criterio se resalta en verde. Lo que no captures no te perjudica: solo se avisa «Datos incompletos».
   * **Un solo botón: «Guardar y enviar a autorización».** Ya trae elegida la **recomendada**. Si lo elegido **no es la más barata o no es la recomendada**, te pide la **justificación** con un solo aviso (si es la recomendada pero cuesta más, ya te deja escrito lo que dice el comparativo y solo lo confirmas); si la compra es de **$1,000 o más** y no tienes 3 cotizaciones completas de 3 proveedores distintos, te pide la **excepción documentada** (producto o servicio especializado, adjudicación directa instruida por CEO o DGA, o urgencia) con su justificación de al menos 15 caracteres; con excepción basta 1 cotización y Dirección recibe un aviso informativo (no tiene que autorizar nada). Bajo $1,000 basta 1 cotización y nunca se pide la excepción. La excepción solo se cambia en «Recibida» o «En cotización»: al pedir la autorización queda bloqueada. Si todo cuadra, solo confirmas. «Guardar borrador» sirve para seguir después. Descartar una cotización pide un motivo y **no la borra**.
3. **Autorización: un solo nivel, Finanzas, con tope de aprobación por persona** (regla de Ángel, Gerente de Finanzas):
   * Aprueban las personas del directorio con rol **Finanzas**. **Ángel aprueba cualquier monto; Janeth, hasta $10,000** (el tope es un dato de cada persona en el Directorio; vacío = sin tope).
   * Al enviar a autorización, la solicitud (con botones **Aprobar / Rechazar** y la liga a la plataforma) le llega a **todos los aprobadores cuyo tope cubre el monto**: una compra de hasta $10,000 le llega a Ángel y a Janeth; una de más de $10,000, solo a Ángel. **Basta que decida uno**; la liga es personal y de un solo uso. Quien rechaza o pide ajuste debe escribir el motivo.
   * Si ningún aprobador activo cubre el monto, **no se puede enviar a autorización** y la pantalla lo dice con claridad (hay que activar a un aprobador o subirle el tope en el Directorio). Quien envía ve en la pestaña *Autorización* a quién le llegó.
   * **Dirección (Ricardo) ya no aprueba**: si la compra es **mayor a $50,000** recibe un **aviso informativo** (sin botones: «Para tu conocimiento: esta compra la autoriza Finanzas; no requiere tu autorización»), una vez por envío, con el resumen y el comparativo. En la app Dirección consulta todo pero no tiene botones de decisión. **Los CEOs ya no forman parte del flujo** y no reciben nada.
   * **En la app** solo decide un usuario con rol *Finanzas* que esté **ligado a su aprobador del directorio** (Directorio → Accesos); sin esa liga no puede aprobar, y con un tope menor al monto la pantalla se lo explica en lugar de mostrar los botones.
   * **Plazo:** si Finanzas no decide en **más de 3 horas hábiles** (lunes a viernes 9:00–18:00, sábado 9:00–16:00) la plataforma levanta la alerta *Autorizaciones lentas*; el dinero entregado sin comprobar por más de **1 día** también alerta.
   * **Recordatorio (paso 2): antes de pedir la autorización, Mauricio registra al proveedor elegido** en la pestaña *Autorización* («Proveedor para la compra»): lo busca en el catálogo (por nombre o RFC) o lo da de alta como **Remisión (efectivo)** o **Factura** (transferencia o tarjeta, con razón social, RFC, dirección fiscal, CP y CLABE si es transferencia). Sin eso el botón de pedir autorización queda deshabilitado y dice qué falta.
4. **Pago, según la forma de pago:** si es **efectivo (remisión)**, **Tesorería (Omar, caja chica)** ve la solicitud autorizada y registra la **entrega del dinero** con su folio. Si es **transferencia o tarjeta (factura)**, lo hace **Cuentas por pagar**: ve «Pagos por hacer», registra el pago con su referencia (folio de la transferencia o **solo los últimos 4 dígitos** de la tarjeta), la fecha y el comprobante.
5. **Mauricio compra y registra** lo realmente pagado por partida, con factura o foto del ticket (sin comprobante no se cierra). Si gastó más de lo autorizado, debe justificar y Finanzas re-aprueba.
6. **Recepción a inventario:** al marcarse comprada, a Uriel (TI) o a la Gerencia de Mantenimiento les aparece un aviso *"N recepciones pendientes"*. Con un clic confirman (y capturan series si son equipos) y la compra **alimenta el inventario** con costo real, proveedor y factura. Después asignan a sucursal, líder o colaborador.
7. **El solicitante confirma** "Ya recibí mi pedido" desde su liga.
* **Directorio** (Talento, Uriel y Dirección): alta/baja de participantes con correos; dar de baja exige un motivo. Los roles de aprobación, tesorería y dirección, el **tope de aprobación** de cada aprobador de Finanzas, la liga de cada usuario con su aprobador y el rol de compras solo los asigna Dirección. Debe haber al menos un aprobador activo **sin tope** (o con tope suficiente) para que las compras grandes tengan quién las autorice.
* **Reglas** (Dirección): umbrales, cotizaciones mínimas y, para el cotizador, **qué tanto pesa cada criterio en el puntaje** (precio, garantía, entrega, crédito, respaldo de marca, condiciones, calificación; deben sumar 100) y la tasa de IVA. **El umbral de aviso a Dirección (> $50,000) está confirmado; el tope de Janeth ($10,000) está confirmado por el usuario. Cotizaciones (decididas por Dirección): menos de $100 (umbral sin cotización) no lleva cotización, solo el registro del proveedor y el precio, y sigue requiriendo la autorización de Finanzas; de $100 a $999.99 basta 1 cotización; desde $1,000 (umbral de cotización simple) se requieren 3 cotizaciones de proveedores distintos, salvo excepción documentada (producto o servicio especializado, adjudicación directa instruida por CEO/DGA o urgencia, con justificación de 15 caracteres o más): con excepción basta 1, y Dirección recibe un aviso informativo (sin botones). Todo editable aquí.**
* Con los datos de ejemplo no se envía ningún correo real (todo aparece como "vista previa").

## 5. Dirección General — qué mirar (usuario `admin`)
* **Inicio por sucursal:** selector "Sucursal" arriba para ver todo el tablero de una sola sucursal, y el **mapa de sucursales** con el valor de inventario de cada una (filtro **Todo / TI / Mantenimiento**), ranking *Total por sucursal* y detalle al tocar un pin. El admin puede **Ajustar posiciones** arrastrando los pines.
* **Inicio:** valor total del inventario, materiales bajo el mínimo, solicitudes pendientes, pérdidas del año, tendencia y actividad reciente. **Guardar snapshot** cada mes para ver la evolución.
* **Reporte de altas:** revisa lo dado de alta por Uriel y la Gerencia y compáralo con Finanzas; corrige tú los datos de compra si algo se capturó mal.
* **Mantenimiento:** gasto mensual, consumo por sucursal, stock muerto, cumplimiento del preventivo.
* **Búsqueda global** (arriba): por número de serie, usuario o material.
* **Campana:** garantías por vencer, mantenimientos próximos, compras pendientes.

## Ejercicio sugerido (15 min, con los datos de ejemplo)
1. Como `soporte` (Uriel): dar de alta 2 monitores en lote con proveedor y factura; intentar repetir una serie y ver el aviso; abrir **Reporte de altas**.
2. Como `soporte`: asignar un monitor a "Compras" con un responsable y abrir su *Historial* ("Por: …"). Comprobar que en **Inventario de Mantenimiento** no hay botones de alta ni de salida.
3. Como `mantenimiento`: registrar una **Entrada** de *Cable HDMI* con factura/OC y dar salida a 5 piezas hacia una sucursal; comprobar que en Sistemas solo puede consultar.
4. Como `mantenimiento`: abrir la auditoría de **Bolivia** (tipo Mantenimiento), cerrarla y revisar discrepancias.
5. Como `admin`: revisar Inicio, **Cargos por pérdida** y el **Reporte de altas** (exportarlo a Excel); editar el costo de un equipo (solo Dirección puede).
6. Sin sesión: abrir `/solicitar` y levantar una solicitud; verla como `soporte` o `mantenimiento` según su tipo.
