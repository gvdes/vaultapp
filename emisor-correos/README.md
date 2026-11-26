# Emisor de correos de Compras Indirectas

Esta carpeta contiene el **emisor beta**: un script de Google (Apps Script) que toma los correos que la plataforma deja en su bandeja de salida (`cmp_notificaciones`, estado `pendiente`) y los envía desde una cuenta de la empresa. No necesita servidores nuevos.

> **Regla de oro:** el **modo demo nunca envía correos** (las filas quedan `simulado`, como vista previa). Este emisor solo trabaja con una base **Supabase de producción o de pruebas** y solo con filas `pendiente`.

```
emisor-correos/
├── README.md                  <- esta guía
└── apps-script/
    ├── Code.gs                <- el script (se pega en script.google.com)
    └── appsscript.json        <- permisos mínimos del script
```

Para Desarrollo existe la **Opción B** (producción): `supabase/functions/enviar-correos/` (ver su `README.md`). Las dos opciones usan las mismas funciones de la base (migración `017`).

---

## 1. Cómo funciona (en corto)

1. La plataforma escribe cada correo en la bandeja (`pendiente`).
2. Cada 1–2 minutos el script le pide a Supabase los pendientes. Supabase **los reserva** (`enviando`) para que nadie más los tome: así no hay envíos dobles.
3. El script envía cada correo (HTML + versión en texto) con el nombre de remitente y la dirección de respuesta configurados.
4. Avisa a Supabase: `enviado` o `error` (con el motivo, nunca con el contenido del correo).

Reglas de seguridad que ya trae:

* Solo envía a **dominios permitidos** (lista en la app + opcional local). Si no hay lista, **no envía nada**.
* **Nunca usa CC ni CCO.** Las copias de respaldo (`copias_respaldo`) son correos separados que crea la propia plataforma, y **jamás** se copian los correos con ligas de aprobación (el script además bloquea cualquier copia que traiga una).
* Tope diario propio (300 por defecto) y respeto a la cuota de Google (deja 50 de reserva). La base tiene otro tope diario (`correo_limite_diario`, 400 de ejemplo).
* Modo **PRUEBA** por defecto: todo va a una sola dirección de prueba, con el asunto marcado.
* No escribe en el registro de ejecución el cuerpo, las ligas ni el secreto.

---

## 2. Por qué NO se usa la llave `service_role` (explicación de seguridad)

Supabase tiene una llave maestra (`service_role`) que **se salta todas las protecciones**: con ella se puede leer o cambiar cualquier tabla, incluidas las **ligas de aprobación vivas** (`cmp_tokens`) y los perfiles. Un proyecto de Apps Script lo pueden ver sus editores, se puede exportar y vive en una cuenta de Google: si algo de eso se compromete, se pierde toda la base.

Por eso la migración `017_emisor_correos.sql` crea un acceso **mínimo**:

| | `service_role` (descartada) | Secreto del emisor (el que usamos) |
|---|---|---|
| Qué abre | Toda la base | **4 funciones**: pedir pendientes, marcar resultado, ver atascados, leer la política |
| Puede leer correos ya enviados | Sí | **No** (cada correo se entrega una sola vez) |
| Puede leer tokens / perfiles / inventario | Sí | **No** |
| Cómo se guarda en la base | n/a | Solo su **hash** (nadie, ni Dirección, puede verlo) |
| Cómo se apaga | Rotando la llave de TODO el proyecto | Una línea de SQL (`cmp_emisor_revocar`) |
| Límite de uso | Ninguno | 30 llamadas por minuto, tope diario, correos de más de 72 h no se envían |

Con ese secreto, el peor caso si se filtra es que alguien pueda **recibir los correos aún pendientes** (con sus ligas) o marcarlos como enviados, hasta que se revoque. Es un riesgo acotado y reversible. El script usa además `MailApp` (permiso mínimo "enviar correo": **no puede leer el buzón**).

---

## 3. Instalación paso a paso (Opción A, beta)

**Antes de empezar**, pide a quien administre Supabase (Desarrollo) que:

1. Haya ejecutado las migraciones `001`…`017` (ver `DEPLOY.md`, sección *Correos*).
2. Configure en la base: `url_base` (la dirección pública de la app, sin diagonal final), `correo_dominios_permitidos`, `correo_remitente_nombre` y `correo_responder_a` (ejemplos en `DEPLOY.md`).
3. Te entregue **por un canal privado** (no por correo ni chat de grupo): la **URL del proyecto**, la **anon key** (Supabase → *Project Settings → API*) y el **secreto del emisor**, generado así en el *SQL Editor*:
   ```sql
   select public.cmp_emisor_nuevo_secreto('apps-script', 'Emisor beta Apps Script');
   ```
   El secreto se muestra **una sola vez**.

**Quién debe ser dueño del script.** Lo ideal es una cuenta de Google Workspace **dedicada** para compras (por ejemplo `compras@su-dominio.mx`, un usuario compartido), no la cuenta personal de nadie. Motivo: la carpeta *Enviados* de la cuenta que envía guardará **copia de todos los correos, con sus ligas de aprobación**. Si es una cuenta personal, esa persona los verá (ver sección *Privacidad*).

### Paso a paso

1. Entra con esa cuenta a <https://script.google.com> → **Nuevo proyecto**. Ponle el nombre `Emisor de correos Compras`.
2. **Configuración del proyecto** (engrane) → activa **"Mostrar el archivo de manifiesto appsscript.json en el editor"**.
3. Vuelve al **Editor**. Abre `appsscript.json` y **reemplaza todo su contenido** con el de `apps-script/appsscript.json` de esta carpeta.
4. Abre `Código.gs` y **reemplaza todo** con el contenido de `apps-script/Code.gs`. Guarda (Ctrl+S).
5. **Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad.** Crea estas (el nombre exactamente así):

   | Propiedad | Valor | ¿Obligatoria? |
   |---|---|---|
   | `SUPABASE_URL` | `https://<tu-proyecto>.supabase.co` (sin `/` al final) | Sí |
   | `SUPABASE_ANON_KEY` | la anon key (pública) | Sí |
   | `EMISOR_SECRET` | el secreto del emisor | Sí |
   | `MODO` | `PRUEBA` (déjalo así hasta terminar las pruebas) | Sí (si falta, es PRUEBA) |
   | `CORREO_PRUEBA` | tu correo, para recibir las pruebas | Sí en modo PRUEBA |
   | `DOMINIOS_PERMITIDOS` | `su-dominio.mx` (varios separados por coma; se suman a los de la app) | Opcional* |
   | `REMITENTE_NOMBRE` | `Compras Grupo Vizcarra` | Opcional |
   | `RESPONDER_A` | `compras@su-dominio.mx` | Opcional |
   | `LIMITE_DIARIO` | `300` | Opcional |
   | `INTERVALO_MIN` | `1` (también 5, 10, 15, 30) | Opcional |
   | `ALERTA_CORREO` | a quién avisar si algo falla (si falta, al dueño del script) | Opcional |

   \* Si ni la app ni esta propiedad tienen dominios permitidos, el script **no envía nada** (a propósito).

   > Nunca pegues la anon key ni el secreto dentro de `Code.gs`: solo en propiedades.
6. En el menú de funciones (arriba) elige **`probar`** y pulsa **Ejecutar**.
   * Google pedirá **autorizar**: *Revisar permisos* → elige la cuenta → si aparece "Google no verificó esta aplicación", es normal en scripts propios: **Configuración avanzada → Ir a "Emisor de correos Compras" (no seguro)** → *Permitir*. Los permisos son solo: enviar correo, conectarse a un servicio externo y administrar sus propios disparadores.
   * `probar()` valida el secreto contra Supabase y te envía **un correo de prueba**. Revisa el *Registro de ejecución* (abajo) y tu bandeja.
7. Elige **`instalar`** → **Ejecutar**. Valida todo otra vez y crea el disparador de tiempo (cada 1–2 minutos). El registro debe decir `INSTALADO`.
8. Elige **`estado`** → **Ejecutar** para ver el resumen (disparadores, modo, cuota restante, última ejecución).

### Variante con alias de remitente (opcional)

Si quieres que el correo salga como `compras@…` desde una cuenta personal que tiene ese alias ("Enviar como" en Gmail): agrega la propiedad `REMITENTE_ALIAS` y, **en `appsscript.json`, agrega el permiso** `"https://mail.google.com/"`. Ese permiso es **amplio** (permite leer todo el buzón de la cuenta): por eso **no se recomienda**; es preferible que el dueño del script sea directamente la cuenta `compras@`.

---

## 4. Cómo ver qué se envió y qué falló

* **En la plataforma:** pantalla de **Correos / vista previa de correos** de Compras (Dirección), columna *Estado*: `pendiente`, `enviando`, `enviado`, `error`, `simulado`.
* **En Supabase (SQL Editor):**
  ```sql
  select estado, count(*) from public.cmp_notificaciones group by estado;
  select id, para_correo, asunto, estado, intentos, error, created_at
    from public.cmp_notificaciones where estado in ('error', 'enviando') order by created_at desc;
  ```
* **En Apps Script:** menú **Ejecuciones** (reloj) → cada corrida con su registro (`ENVIADO`, `ERROR`, `REINTENTO`, `RECONCILIADO`). Los destinatarios salen enmascarados (`m***@dominio`).
* **En Gmail:** carpeta *Enviados* de la cuenta dueña.
* **Si un correo quedó en `error`:** lee el motivo, corrige la causa (p. ej. dirección mal escrita en el Directorio) y pide a Desarrollo reenviarlo:
  ```sql
  update public.cmp_notificaciones set estado = 'pendiente', intentos = 0, error = null, reclamado_at = null where id = '<id>';
  ```
* **Correos que rebotan:** llegan al buzón de la cuenta que envía como "Delivery Status Notification". Revísalos; el error casi siempre es un correo mal capturado en el directorio de participantes.

## 5. Cómo detenerlo

| Quiero… | Qué hago |
|---|---|
| Pausar un rato (sin perder nada) | Ejecutar **`pausar`** (o poner `PAUSA = SI`). Los correos siguen `pendiente`. **`reanudar`** para continuar. |
| Apagar el emisor | Ejecutar **`desinstalar`** (quita el disparador). |
| Cortar el acceso a la base ya | Pedir a Desarrollo: `select public.cmp_emisor_revocar('apps-script');` |
| Cambiar el secreto (sospecha de filtración, o cambió quien administra) | Pedir otro `cmp_emisor_nuevo_secreto('apps-script')` y actualizar `EMISOR_SECRET`. |

---

## 6. Cuotas y límites

Valores de Google a la fecha de escribir esto (**verifícalos** en <https://developers.google.com/apps-script/guides/services/quotas>, cambian):

* Destinatarios por día: **1,500** en Workspace de pago (≈100 en cuentas gratuitas). El script lee la cuota real (`MailApp.getRemainingDailyQuota`) y deja 50 de reserva.
* Una ejecución dura máximo 6 min (el script se detiene a los 4); el tiempo total de disparadores por día es de varias horas en Workspace.
* Consultas externas (`UrlFetch`): decenas de miles por día; el script usa ~1 por minuto (la política se guarda 5 minutos en caché).
* Si se agota la cuota: los correos quedan `pendiente` y salen al día siguiente; llega un aviso (máx. 1 por hora) al administrador. Los correos con más de 72 h sin enviar pasan a `error` ("Vencido") para no mandar avisos viejos.
* Para volúmenes mayores o producción formal: **Opción B**.

## 7. Qué decirle a Desarrollo para pasar a la Opción B

> "La beta de correos funciona con Apps Script y el secreto `apps-script`. Para producción queremos la Edge Function `supabase/functions/enviar-correos/` (ya escrita, **sin probar contra un proyecto vivo**). Necesitamos: (1) un buzón/SMTP corporativo o cuenta Resend; (2) SPF, DKIM y DMARC del dominio (lista en el README de la función); (3) probarla en un proyecto de pruebas con `MODO=PRUEBA`; (4) programar el cron (`pg_cron` + `pg_net`); (5) al pasar a producción, apagar el Apps Script (`desinstalar()`) y revocar su secreto. No hay que cambiar nada en la app ni en las tablas: las dos opciones usan las mismas funciones de la migración 017."

## 8. Privacidad: quién puede ver las ligas de aprobación

Los correos de autorización llevan **ligas personales de un solo uso**: quien abra la liga puede aprobar o rechazar **como esa persona**. Tratarlas como contraseñas. Pueden verlas:

* **El destinatario** y quien tenga acceso a su buzón (delegados, asistentes, buzones compartidos, reenvíos automáticos).
* **La cuenta que envía:** su carpeta *Enviados* conserva una copia completa. Por eso conviene una cuenta dedicada con acceso restringido a 1–2 personas y sin delegados.
* **Administradores de Google Workspace** (pueden auditar buzones, según la política de TI).
* **Dirección en la plataforma:** el rol `admin` puede leer la bandeja `cmp_notificaciones` y `cmp_tokens`.
* **Quien administre Supabase** (SQL Editor, copias de seguridad).
* **No las ve** el Apps Script en su registro (nunca escribe cuerpos), ni quien edita el script (con `MailApp` no puede leer el buzón).

Mitigaciones ya incluidas: cada liga sirve **una vez** por aprobador y expira (15 días); abrirla **no ejecuta** la decisión (solo la preselecciona, así los antivirus de correo no aprueban solos); las copias de respaldo **no** incluyen correos de autorización. Si una liga se filtra: **cancelar la requisición** y emitir una nueva.

## 9. Lista de seguridad

- [ ] El script es de una cuenta **dedicada** (no personal), con acceso a 1–2 personas y verificación en 2 pasos.
- [ ] Solo hay **editores** del proyecto de Apps Script que realmente lo necesitan (Compartir → revisar).
- [ ] `SUPABASE_ANON_KEY` y `EMISOR_SECRET` están solo en *Propiedades de la secuencia de comandos* (buscar en `Code.gs`: no debe haber ninguna llave pegada).
- [ ] Se **descartó** la `service_role`: no aparece en el script, ni en chats, ni en correos.
- [ ] El secreto se entregó por canal privado y el mensaje se borró.
- [ ] `correo_dominios_permitidos` tiene solo los dominios de la empresa.
- [ ] `MODO = PRUEBA` hasta terminar la sección *Pruebas*; luego `PRODUCCION`.
- [ ] `url_base` configurada con HTTPS (las ligas de los correos salen de ahí).
- [ ] `ALERTA_CORREO` apunta a alguien que sí lee los avisos.
- [ ] Se revisó que la carpeta *Enviados* de la cuenta no esté delegada ni reenviada.
- [ ] Quien dejó el área ya no es editor, y se rotó el secreto si tenía acceso.
- [ ] SPF/DKIM/DMARC del dominio revisados con TI (lista en `supabase/functions/enviar-correos/README.md`).

---

## 10. Pruebas (verificación de punta a punta con una requisición de prueba)

> Hazlo primero en un proyecto Supabase de **pruebas**. Si solo existe producción, las requisiciones de prueba **no se pueden borrar** (regla de oro): se cancelan con el comentario "PRUEBA" y quedan en el historial. **No se ha probado contra un proyecto vivo**: esta lista es la forma de comprobarlo.

**Preparación.** `MODO = PRUEBA` y `CORREO_PRUEBA` con tu dirección. En el directorio de participantes existe una persona **de prueba** (solicitante) con un correo tuyo, y las personas de Adquisiciones, Finanzas y Tesorería tienen correos que **tú controlas o que de todos modos serán redirigidos** por el modo PRUEBA (en ese modo nadie recibe nada real).

1. **Sin secreto o con secreto malo no pasa nada.** Pon un `EMISOR_SECRET` incorrecto → ejecuta `probar`: debe fallar con "no_autorizado". Restaura el correcto.
2. **Prueba de conexión.** Ejecuta `probar`: registro con *Conexión … CORRECTOS* y te llega el correo `[PRUEBA] Emisor de correos de Compras`.
3. **Nueva requisición.** En una ventana de incógnito abre `https://<tu-app>/compras/nueva`, elige a la persona de prueba, agrega una partida (p. ej. "1 × Prueba de correos") y envía. Anota el **folio** `REQ-AAAAMMDD-HHMMSS`.
4. **La bandeja se llena.** En Supabase: `select estado, count(*) from cmp_notificaciones where requisicion_id = '<folio>' group by estado;` → filas `pendiente` (confirmación al solicitante y aviso a Adquisiciones, más copias si hay `copias_respaldo`).
5. **Esperar 1–2 minutos** (o ejecutar `procesar` a mano). Las filas deben pasar a `enviado` y a ti te llegan los correos **con asunto `[PRUEBA → x***@dominio]`**, remitente "Compras Grupo Vizcarra" y la dirección de respuesta correcta.
6. **Revisar el contenido.** Que el botón *Ver seguimiento* apunte a tu `url_base` (HTTPS) y abra el estatus **sin** mostrar proveedor ni montos. Que la versión en texto plano (en "Mostrar original") tenga las ligas.
7. **Cadena de autorización.** Como Adquisiciones: cotiza, elige proveedor y **envía a autorización**. Llegan los correos de *Autorización requerida* (a tu dirección de prueba). Verifica: tienen botones *Aprobar / Rechazar*; **ninguna copia de respaldo** de este correo existe en la bandeja (`select count(*) from cmp_notificaciones where requisicion_id='<folio>' and tipo like 'autorizacion%' and para_nombre = 'Copia de respaldo';` → 0).
8. **La liga no ejecuta al abrirla.** Abre la liga de *Aprobar*: debe mostrar el detalle y pedir **confirmación**; recargar o abrirla desde otro navegador sin confirmar no cambia el estado. Confirma la aprobación y comprueba el correo siguiente (aviso a Tesorería y al solicitante). Abre la misma liga otra vez: debe decir que ya fue usada.
9. **Lista permitida.** Cambia temporalmente un correo de participante a un dominio no permitido (por ejemplo `prueba@dominio-no-permitido.invalid`) y genera un correo hacia él: la fila debe quedar `error` con "fuera de la lista de dominios permitidos".
10. **Pausa.** Ejecuta `pausar`, genera otro correo y comprueba que sigue `pendiente`; `reanudar` y se envía.
11. **Tope y vencimiento (opcional).** Pon `LIMITE_DIARIO = 1` y confirma que solo sale uno; restaura el valor.
12. **Cierre.** Cancela la requisición de prueba con el comentario "PRUEBA" (queda en historial). Corrige el correo que alteraste en el paso 9.
13. **Paso a producción** (solo si todo salió bien y SPF/DKIM/DMARC están listos): cambia `MODO` a `PRODUCCION`, genera **una** requisición donde el solicitante seas tú, y verifica que **solo a ti** llegan los correos reales. Antes de encender en producción revisa cuántos pendientes viejos hay (`select count(*) from cmp_notificaciones where estado='pendiente';`): los de más de 72 horas no se enviarán, pero los recientes sí.
