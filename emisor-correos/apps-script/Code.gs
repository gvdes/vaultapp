/**
 * EMISOR DE CORREOS (BETA) · Compras Indirectas · Grupo Vizcarra
 * ======================================================================================================================
 * Qué hace: cada 1-2 minutos pide a Supabase los correos "pendientes" de la bandeja de Compras (tabla cmp_notificaciones),
 * los envía con la cuenta de Google Workspace dueña de este script y le avisa a Supabase si salieron o fallaron.
 *
 * SEGURIDAD (léelo, es la parte importante)
 * -----------------------------------------
 * 1) NO usa la llave "service_role" de Supabase. Esa llave se salta todas las protecciones: quien la tenga puede leer o
 *    cambiar CUALQUIER tabla (incluidas las ligas de aprobación vivas). Si este proyecto de Apps Script se filtra (otro
 *    editor, una exportación, una cuenta de Google comprometida) se perdería toda la base.
 * 2) En su lugar usa:
 *      - SUPABASE_ANON_KEY : la llave pública de la app (ya está en el navegador de todos; por sí sola no da acceso a nada).
 *      - EMISOR_SECRET     : un secreto propio, generado con la migración 017, que solo funciona con 4 funciones de la
 *                            base: pedir correos pendientes, marcar su resultado, ver los atascados y leer la política de
 *                            envío. No puede leer ninguna otra tabla, ni correos ya enviados, ni tokens. En la base solo
 *                            se guarda su hash, y se apaga con una línea de SQL (cmp_emisor_revocar).
 * 3) Ambos valores viven en "Propiedades de la secuencia de comandos" (Script Properties), NUNCA en este código.
 * 4) Este script usa MailApp (permiso mínimo "enviar correo"): no puede leer el buzón. Solo si pones un alias de remitente
 *    (REMITENTE_ALIAS) se necesita GmailApp y el permiso amplio de Gmail; ver README.
 * 5) Nunca escribe en el registro el cuerpo del correo, las ligas ni el secreto: solo id, tipo y destinatario enmascarado.
 * 6) Fail-closed: si no hay una lista de dominios permitidos, no envía nada. Un correo con ligas de aprobación nunca se
 *    envía como "copia de respaldo", y jamás se usa CC ni CCO.
 *
 * SIN DOBLE ENVÍO
 * ---------------
 * Supabase "reclama" cada correo en forma atómica (pendiente -> enviando) al entregarlo: dos ejecuciones simultáneas nunca
 * reciben el mismo correo. Después de enviar, este script anota el id en una bitácora local (LEDGER) y marca "enviado". Si
 * se cae a medias, un correo que lleve más de 10 minutos en "enviando" se reconcilia: si está en la bitácora local se
 * marca enviado; si no, se libera para reintentar.
 *
 * FUNCIONES PARA EL USUARIO:  instalar()  probar()  estado()  pausar()  reanudar()  desinstalar()
 * FUNCIÓN DEL DISPARADOR:     procesar()
 */

// ---------------------------------------------------------------------------------------------------------------------
// Constantes (no son secretos)
// ---------------------------------------------------------------------------------------------------------------------
var LOTE_MAXIMO = 10; // correos por ejecución
var MINUTOS_ATASCADO = 10; // un correo "enviando" más de esto se reconcilia
var RESERVA_CUOTA = 50; // correos que se dejan sin usar de la cuota diaria de Google
var LIMITE_DIARIO_DEFECTO = 300; // tope propio por día si no se define LIMITE_DIARIO
var MAX_MS_EJECUCION = 4 * 60 * 1000; // Apps Script corta a los 6 min; paramos antes
var TTL_CONFIG_SEG = 300; // la política de Supabase se guarda 5 min en caché
var LEDGER_MAX_ENTRADAS = 120; // la propiedad admite ~9 KB: 120 ids caben de sobra
var LEDGER_MAX_HORAS = 6;
var FALLOS_PARA_ALERTA = 3;
var ALERTA_CADA_MS = 60 * 60 * 1000; // máximo un aviso por hora

// ---------------------------------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------------------------------
function log_(mensaje) {
  console.log(mensaje);
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function leerJson_(clave, porDefecto) {
  try {
    var v = props_().getProperty(clave);
    return v ? JSON.parse(v) : porDefecto;
  } catch (e) {
    return porDefecto;
  }
}

function guardarJson_(clave, valor) {
  props_().setProperty(clave, JSON.stringify(valor));
}

/** Quita de un texto cualquier cosa que parezca secreto/llave/token antes de registrarlo o guardarlo en la base. */
function limpiar_(texto) {
  var t = String(texto == null ? '' : texto);
  var p = props_().getProperties();
  ['EMISOR_SECRET', 'SUPABASE_ANON_KEY'].forEach(function (k) {
    if (p[k] && p[k].length >= 8) t = t.split(p[k]).join('***');
  });
  t = t.replace(/[A-Za-z0-9_\-\.]{28,}/g, '***'); // tokens / JWT / secretos largos
  t = t.replace(/[\r\n\t]+/g, ' ');
  return t.length > 200 ? t.slice(0, 200) + '…' : t;
}

function enmascarar_(correo) {
  var s = String(correo || '');
  var i = s.indexOf('@');
  if (i < 1) return '***';
  return s.charAt(0) + '***' + s.slice(i);
}

function lineaSegura_(texto, max) {
  return String(texto == null ? '' : texto)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max || 200);
}

function csv_(texto) {
  return String(texto || '')
    .split(/[,;\n]/)
    .map(function (x) {
      return x.trim().toLowerCase();
    })
    .filter(function (x) {
      return x;
    });
}

var RE_CORREO = /^[^\s@,;<>"'()\[\]\\]+@[^\s@,;<>"'()\[\]\\]+\.[^\s@,;<>"'()\[\]\\]+$/;
function correoValido_(c) {
  var s = String(c || '').trim();
  return s.length > 0 && s.length <= 254 && RE_CORREO.test(s);
}

function hoy_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ---------------------------------------------------------------------------------------------------------------------
// Configuración (Script Properties)
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Propiedades:
 *   SUPABASE_URL        (obligatoria)  https://<proyecto>.supabase.co  (sin diagonal final)
 *   SUPABASE_ANON_KEY   (obligatoria)  llave pública "anon"/"publishable" del proyecto
 *   EMISOR_SECRET       (obligatoria)  el secreto que devolvió cmp_emisor_nuevo_secreto()
 *   MODO                (opcional)     PRUEBA (por defecto) o PRODUCCION
 *   CORREO_PRUEBA       (si MODO=PRUEBA) todo se envía a esta dirección con el asunto marcado [PRUEBA]
 *   DOMINIOS_PERMITIDOS (opcional)     dominios/correos extra permitidos, separados por coma (se suman a los de la app)
 *   LIMITE_DIARIO       (opcional)     tope propio de correos por día (por defecto 300)
 *   REMITENTE_NOMBRE    (opcional)     sustituye al nombre de remitente configurado en la app
 *   RESPONDER_A         (opcional)     sustituye al Reply-To configurado en la app
 *   REMITENTE_ALIAS     (opcional)     alias "Enviar como" de Gmail (exige el permiso amplio de Gmail; ver README)
 *   ALERTA_CORREO       (opcional)     a quién avisar si algo falla (por defecto, el dueño del script)
 *   INTERVALO_MIN       (opcional)     1 (defecto), 5, 10, 15 o 30 minutos entre ejecuciones
 *   PAUSA               (opcional)     SI = no envía nada (sin quitar el disparador)
 */
function leerConfig_() {
  var p = props_().getProperties();
  var faltan = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'EMISOR_SECRET'].filter(function (k) {
    return !p[k] || !String(p[k]).trim();
  });
  if (faltan.length) {
    throw errorConfig_('Faltan propiedades del script: ' + faltan.join(', ') + '. Ver Configuración del proyecto > Propiedades del script.');
  }
  var url = String(p.SUPABASE_URL).trim().replace(/\/+$/, '');
  if (!/^https:\/\/[A-Za-z0-9.\-]+(:\d+)?$/.test(url)) {
    throw errorConfig_('SUPABASE_URL debe ser https://<proyecto>.supabase.co (sin ruta ni diagonal final).');
  }
  var modo = String(p.MODO || 'PRUEBA').trim().toUpperCase();
  if (modo !== 'PRUEBA' && modo !== 'PRODUCCION') {
    throw errorConfig_('MODO debe ser PRUEBA o PRODUCCION.');
  }
  var correoPrueba = String(p.CORREO_PRUEBA || '').trim();
  if (modo === 'PRUEBA' && !correoValido_(correoPrueba)) {
    throw errorConfig_('MODO=PRUEBA requiere CORREO_PRUEBA con una dirección válida (todos los correos irán ahí).');
  }
  var alias = String(p.REMITENTE_ALIAS || '').trim();
  if (alias && !correoValido_(alias)) throw errorConfig_('REMITENTE_ALIAS no es una dirección válida.');
  var responder = String(p.RESPONDER_A || '').trim();
  if (responder && !correoValido_(responder)) throw errorConfig_('RESPONDER_A no es una dirección válida.');
  var limite = parseInt(p.LIMITE_DIARIO, 10);
  var intervalo = parseInt(p.INTERVALO_MIN, 10);
  return {
    url: url,
    anonKey: String(p.SUPABASE_ANON_KEY).trim(),
    secreto: String(p.EMISOR_SECRET).trim(),
    modo: modo,
    prueba: modo === 'PRUEBA',
    correoPrueba: correoPrueba,
    dominiosExtra: csv_(p.DOMINIOS_PERMITIDOS),
    limiteDiario: limite > 0 ? limite : LIMITE_DIARIO_DEFECTO,
    remitenteNombre: lineaSegura_(p.REMITENTE_NOMBRE, 80),
    responderA: responder,
    alias: alias,
    alertaCorreo: String(p.ALERTA_CORREO || '').trim() || Session.getEffectiveUser().getEmail(),
    intervalo: [1, 5, 10, 15, 30].indexOf(intervalo) >= 0 ? intervalo : 1,
    pausa: String(p.PAUSA || '').trim().toUpperCase() === 'SI',
  };
}

function errorConfig_(mensaje) {
  var e = new Error(mensaje);
  e.esConfig = true;
  return e;
}

// ---------------------------------------------------------------------------------------------------------------------
// Llamadas a Supabase (solo las 4 funciones del emisor; POST con el secreto en el cuerpo, nunca en la URL)
// ---------------------------------------------------------------------------------------------------------------------
function rpc_(cfg, nombre, args) {
  var headers = { apikey: cfg.anonKey };
  if (/^eyJ/.test(cfg.anonKey)) headers.Authorization = 'Bearer ' + cfg.anonKey; // las llaves "sb_publishable_" van solo en apikey
  var resp = UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/' + nombre, {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(args),
    muteHttpExceptions: true,
    followRedirects: false,
  });
  var codigo = resp.getResponseCode();
  var texto = resp.getContentText();
  if (codigo === 404) {
    throw errorConfig_('La función ' + nombre + ' no existe en Supabase: ¿ya se ejecutó la migración 017_emisor_correos.sql?');
  }
  if (codigo === 401 || codigo === 403) {
    throw errorConfig_('Supabase rechazó la llave anon (HTTP ' + codigo + '). Revisa SUPABASE_ANON_KEY.');
  }
  if (codigo < 200 || codigo >= 300) {
    throw new Error('HTTP ' + codigo + ' en ' + nombre + ': ' + limpiar_(texto));
  }
  var data;
  try {
    data = JSON.parse(texto);
  } catch (e) {
    throw new Error('Respuesta no válida de ' + nombre);
  }
  if (data && data.ok === false) {
    var err = new Error('Supabase respondió "' + limpiar_(data.error) + '" en ' + nombre);
    err.codigo = String(data.error || '');
    if (err.codigo === 'no_autorizado') err.esConfig = true;
    throw err;
  }
  return data;
}

function politicaServidor_(cfg) {
  var cache = CacheService.getScriptCache();
  var guardada = cache.get('POLITICA');
  if (guardada) {
    try {
      return JSON.parse(guardada);
    } catch (e) {
      /* se vuelve a pedir */
    }
  }
  var r = rpc_(cfg, 'cmp_correos_config', { p_secreto: cfg.secreto });
  var pol = {
    remitente_nombre: r.remitente_nombre || 'Compras',
    responder_a: r.responder_a || '',
    dominios_permitidos: r.dominios_permitidos || [],
    copias_respaldo: r.copias_respaldo || [],
  };
  cache.put('POLITICA', JSON.stringify(pol), TTL_CONFIG_SEG);
  return pol;
}

function marcar_(cfg, id, estado, nota) {
  return rpc_(cfg, 'cmp_correo_marcar', { p_secreto: cfg.secreto, p_id: id, p_estado: estado, p_error: nota ? limpiar_(nota) : null });
}

// ---------------------------------------------------------------------------------------------------------------------
// Lista de destinatarios permitidos
// ---------------------------------------------------------------------------------------------------------------------
/** Reglas efectivas = dominios de la app + DOMINIOS_PERMITIDOS local + copias de respaldo de la app. */
function reglasPermitidas_(cfg, pol) {
  var todas = []
    .concat(pol.dominios_permitidos || [], cfg.dominiosExtra || [], pol.copias_respaldo || [])
    .map(function (x) {
      return String(x || '').trim().toLowerCase();
    })
    .filter(function (x) {
      return x;
    });
  return todas;
}

/** Regla con "@" en medio = dirección exacta; "dominio.mx" o "@dominio.mx" = todo ese dominio (no subdominios). */
function destinoPermitido_(correo, reglas) {
  var c = String(correo).trim().toLowerCase();
  var dominio = c.slice(c.indexOf('@') + 1);
  return reglas.some(function (r) {
    return r.indexOf('@') > 0 ? r === c : r.replace(/^@/, '') === dominio;
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Texto plano a partir del HTML (respaldo para clientes que no muestran HTML)
// ---------------------------------------------------------------------------------------------------------------------
function decodificar_(t) {
  return t
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function htmlATexto_(html) {
  var t = String(html || '');
  t = t.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '');
  t = t.replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, function (m, href, interior) {
    var etiqueta = interior.replace(/<[^>]+>/g, '').trim();
    var url = decodificar_(href);
    return etiqueta ? etiqueta + ' (' + url + ')' : url;
  });
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<li[^>]*>/gi, '• ');
  t = t.replace(/<\/(p|div|h[1-6]|tr|li|ul|table)>/gi, '\n');
  t = t.replace(/<\/t[dh]>/gi, '  ');
  t = t.replace(/<[^>]+>/g, '');
  t = decodificar_(t);
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

// ---------------------------------------------------------------------------------------------------------------------
// Bitácora local (anti doble envío) y contador diario
// ---------------------------------------------------------------------------------------------------------------------
function ledger_() {
  var l = leerJson_('LEDGER', {});
  var corte = Date.now() - LEDGER_MAX_HORAS * 3600 * 1000;
  Object.keys(l).forEach(function (id) {
    if (!l[id] || l[id].t < corte) delete l[id];
  });
  var ids = Object.keys(l).sort(function (a, b) {
    return l[a].t - l[b].t;
  });
  while (ids.length > LEDGER_MAX_ENTRADAS) delete l[ids.shift()];
  return l;
}

function ledgerAnotar_(id, marcado) {
  var l = ledger_();
  l[id] = { t: Date.now(), m: marcado ? 1 : 0 };
  guardarJson_('LEDGER', l);
}

function contadorDiario_() {
  var c = leerJson_('CONTADOR', { f: '', n: 0 });
  return c.f === hoy_() ? c.n : 0;
}

function contadorSumar_() {
  guardarJson_('CONTADOR', { f: hoy_(), n: contadorDiario_() + 1 });
}

/** Cuántos correos se pueden enviar ahora: lo menor entre mi tope diario y la cuota real de Google menos la reserva. */
function cupoDisponible_(cfg) {
  var propio = cfg.limiteDiario - contadorDiario_();
  var google = MailApp.getRemainingDailyQuota() - RESERVA_CUOTA;
  return Math.max(0, Math.min(propio, google));
}

// ---------------------------------------------------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------------------------------------------------
function enviar_(cfg, para, asunto, html, texto, nombre, responderA) {
  if (cfg.alias) {
    // Con alias hace falta GmailApp (permiso amplio de Gmail). Sin CC ni CCO.
    var op = { htmlBody: html, name: nombre };
    if (responderA) op.replyTo = responderA;
    op.from = cfg.alias;
    GmailApp.sendEmail(para, asunto, texto, op);
    return;
  }
  var msg = { to: para, subject: asunto, body: texto, htmlBody: html, name: nombre };
  if (responderA) msg.replyTo = responderA;
  MailApp.sendEmail(msg);
}

function esErrorDeCuota_(e) {
  return /too many times|quota|limit exceeded|service invoked too many/i.test(String(e && e.message));
}

function esDestinatarioInvalido_(e) {
  return /invalid (email|argument)|invalid recipient|no recipient/i.test(String(e && e.message));
}

/** Procesa UN correo ya reclamado. Devuelve 'enviado' | 'error' | 'reintento' | 'cuota'. */
function procesarCorreo_(cfg, pol, reglas, c) {
  var id = String(c.id);
  var tag = id + ' [' + lineaSegura_(c.tipo, 40) + '] -> ' + enmascarar_(c.para_correo);

  // 1) Validaciones ANTES de enviar
  if (!correoValido_(c.para_correo)) {
    marcar_(cfg, id, 'error', 'Destinatario con formato no válido.');
    log_('ERROR ' + tag + ': destinatario no válido');
    return 'error';
  }
  var destino = String(c.para_correo).trim();
  if (!destinoPermitido_(destino, reglas)) {
    marcar_(cfg, id, 'error', 'Destinatario fuera de la lista de dominios permitidos.');
    log_('ERROR ' + tag + ': fuera de la lista permitida');
    return 'error';
  }
  if (c.es_copia && c.lleva_liga_aprobacion) {
    marcar_(cfg, id, 'error', 'Bloqueado: una copia de respaldo no puede llevar ligas de aprobación.');
    log_('ERROR ' + tag + ': copia con liga de aprobación bloqueada');
    return 'error';
  }
  if (!String(c.asunto || '').trim() || !String(c.cuerpo_html || '').trim()) {
    marcar_(cfg, id, 'error', 'Correo sin asunto o sin cuerpo.');
    log_('ERROR ' + tag + ': vacío');
    return 'error';
  }

  // 2) Armado (en modo PRUEBA todo va a CORREO_PRUEBA, con el destinatario real en el asunto)
  var para = cfg.prueba ? cfg.correoPrueba : destino;
  var asunto = lineaSegura_(c.asunto, 180);
  if (cfg.prueba) asunto = '[PRUEBA → ' + enmascarar_(destino) + '] ' + asunto;
  var html = String(c.cuerpo_html);
  var texto = htmlATexto_(html);
  var nombre = cfg.remitenteNombre || lineaSegura_(pol.remitente_nombre, 80) || 'Compras';
  var responder = cfg.responderA || (correoValido_(pol.responder_a) ? pol.responder_a : '');

  // 3) Envío
  try {
    enviar_(cfg, para, asunto, html, texto, nombre, responder);
  } catch (e) {
    var motivo = limpiar_(e && e.message);
    if (esErrorDeCuota_(e)) {
      marcar_(cfg, id, 'pendiente', 'Cuota diaria de Google agotada; se reintentará.');
      log_('CUOTA ' + tag);
      return 'cuota';
    }
    if (esDestinatarioInvalido_(e)) {
      marcar_(cfg, id, 'error', 'Google rechazó el destinatario: ' + motivo);
      log_('ERROR ' + tag + ': ' + motivo);
      return 'error';
    }
    marcar_(cfg, id, 'pendiente', 'Fallo al enviar: ' + motivo);
    log_('REINTENTO ' + tag + ': ' + motivo);
    return 'reintento';
  }

  // 4) Ya salió: anotar localmente ANTES de avisar a Supabase (si el aviso falla, se reintenta sin reenviar)
  ledgerAnotar_(id, false);
  contadorSumar_();
  log_('ENVIADO ' + tag);
  try {
    marcar_(cfg, id, 'enviado', cfg.prueba ? '[PRUEBA] enviado a la dirección de prueba, no al destinatario real.' : null);
    ledgerAnotar_(id, true);
  } catch (e) {
    log_('AVISO ' + id + ': se envió pero no se pudo marcar; se reintentará (' + limpiar_(e && e.message) + ')');
  }
  return 'enviado';
}

/** Reintenta avisar a Supabase de los correos que sí salieron pero cuyo aviso falló. */
function reintentarMarcas_(cfg) {
  var l = ledger_();
  Object.keys(l).forEach(function (id) {
    if (l[id].m) return;
    try {
      marcar_(cfg, id, 'enviado', cfg.prueba ? '[PRUEBA] enviado a la dirección de prueba, no al destinatario real.' : null);
      ledgerAnotar_(id, true);
    } catch (e) {
      if (String(e.codigo || '').indexOf('estado_actual_') === 0 || e.codigo === 'no_existe') {
        ledgerAnotar_(id, true); // ya no hay nada que marcar
      } else if (e.esConfig) {
        throw e;
      } else {
        log_('AVISO ' + id + ': marca pendiente (' + limpiar_(e && e.message) + ')');
      }
    }
  });
}

/** Correos que llevan demasiado en "enviando": si están en la bitácora local salieron; si no, se liberan para reintentar. */
function reconciliarAtascados_(cfg) {
  var cache = CacheService.getScriptCache();
  if (cache.get('ATASCADOS_REVISADOS')) return; // se revisa cada ~5 minutos
  var r = rpc_(cfg, 'cmp_correos_atascados', { p_secreto: cfg.secreto, p_minutos: MINUTOS_ATASCADO });
  var l = ledger_();
  (r.atascados || []).forEach(function (a) {
    var id = String(a.id);
    try {
      if (l[id]) {
        marcar_(cfg, id, 'enviado', 'Reconciliado: el correo sí había salido.');
        ledgerAnotar_(id, true);
        log_('RECONCILIADO ' + id + ' -> enviado');
      } else {
        marcar_(cfg, id, 'pendiente', 'Liberado: el envío anterior no se completó.');
        log_('RECONCILIADO ' + id + ' -> pendiente (se reintenta)');
      }
    } catch (e) {
      log_('AVISO reconciliando ' + id + ': ' + limpiar_(e && e.message));
    }
  });
  cache.put('ATASCADOS_REVISADOS', '1', 300);
}

// ---------------------------------------------------------------------------------------------------------------------
// Avisos al administrador (máximo uno por hora; sin cuerpos, ligas ni secretos)
// ---------------------------------------------------------------------------------------------------------------------
function avisarAdmin_(destino, asunto, texto) {
  try {
    var ult = parseInt(props_().getProperty('ULTIMA_ALERTA') || '0', 10);
    if (Date.now() - ult < ALERTA_CADA_MS) return;
    if (!correoValido_(destino)) return;
    props_().setProperty('ULTIMA_ALERTA', String(Date.now()));
    MailApp.sendEmail({ to: destino, subject: '[Emisor de correos Compras] ' + lineaSegura_(asunto, 120), body: limpiar_(texto) });
  } catch (e) {
    log_('No se pudo enviar el aviso al administrador: ' + limpiar_(e && e.message));
  }
}

function registrarFallo_(e, cfgParcial) {
  var n = parseInt(props_().getProperty('FALLOS_SEGUIDOS') || '0', 10) + 1;
  props_().setProperty('FALLOS_SEGUIDOS', String(n));
  log_('FALLO (' + n + ' seguidos): ' + limpiar_(e && e.message));
  var destino = (cfgParcial && cfgParcial.alertaCorreo) || Session.getEffectiveUser().getEmail();
  if (e && e.esConfig) {
    avisarAdmin_(destino, 'Problema de configuración', 'El emisor se detuvo por un problema de configuración: ' + limpiar_(e.message));
  } else if (n >= FALLOS_PARA_ALERTA) {
    avisarAdmin_(destino, 'Fallos repetidos', 'El emisor lleva ' + n + ' ejecuciones seguidas con error. Último: ' + limpiar_(e && e.message));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Ejecución principal (la llama el disparador de tiempo)
// ---------------------------------------------------------------------------------------------------------------------
function procesar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    log_('Hay otra ejecución en curso; se omite.');
    return;
  }
  var inicio = Date.now();
  var cfg = null;
  try {
    cfg = leerConfig_();
    if (cfg.pausa) {
      log_('PAUSA=SI: no se envía nada.');
      return;
    }
    if (cfg.alias && GmailApp.getAliases().indexOf(cfg.alias) < 0) {
      throw errorConfig_('REMITENTE_ALIAS no está dado de alta como "Enviar como" en la cuenta de Gmail dueña del script.');
    }

    reintentarMarcas_(cfg);
    reconciliarAtascados_(cfg);

    var pol = politicaServidor_(cfg);
    var reglas = reglasPermitidas_(cfg, pol);
    if (!reglas.length) {
      throw errorConfig_('No hay dominios permitidos (cmp_config.correo_dominios_permitidos vacío y DOMINIOS_PERMITIDOS sin definir): no se envía nada.');
    }

    var cupo = cupoDisponible_(cfg);
    if (cupo <= 0) {
      log_('Sin cupo diario disponible (tope propio o cuota de Google). No se piden correos.');
      avisarAdmin_(cfg.alertaCorreo, 'Cupo diario agotado', 'Se alcanzó el tope diario de correos; los pendientes esperarán a mañana.');
      return;
    }

    var r = rpc_(cfg, 'cmp_correos_pendientes', { p_secreto: cfg.secreto, p_limite: Math.min(LOTE_MAXIMO, cupo) });
    var correos = r.correos || [];
    var resumen = { enviado: 0, error: 0, reintento: 0, cuota: 0 };
    var cuotaAgotada = false;
    for (var i = 0; i < correos.length; i++) {
      var c = correos[i];
      if (cuotaAgotada || Date.now() - inicio > MAX_MS_EJECUCION) {
        try {
          marcar_(cfg, String(c.id), 'pendiente', 'Liberado: sin cuota o sin tiempo en esta ejecución.');
        } catch (e) {
          log_('AVISO liberando ' + c.id + ': ' + limpiar_(e && e.message));
        }
        continue;
      }
      var res = procesarCorreo_(cfg, pol, reglas, c);
      resumen[res] = (resumen[res] || 0) + 1;
      if (res === 'cuota') cuotaAgotada = true;
    }
    props_().setProperty('FALLOS_SEGUIDOS', '0');
    guardarJson_('ULTIMA_EJECUCION', { fecha: new Date().toISOString(), modo: cfg.modo, reclamados: correos.length, resumen: resumen });
    if (resumen.error > 0) {
      avisarAdmin_(cfg.alertaCorreo, 'Correos con error', resumen.error + ' correo(s) quedaron en estado "error". Revísalos en la bandeja de correos de la plataforma.');
    }
    if (correos.length) log_('Listo: ' + JSON.stringify(resumen) + ' (modo ' + cfg.modo + ').');
  } catch (e) {
    if (e && e.codigo === 'limite') {
      log_('Supabase pidió esperar (límite de llamadas por minuto). Se reintenta en la siguiente ejecución.');
    } else {
      registrarFallo_(e, cfg);
    }
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Funciones que ejecuta la persona (menú "Ejecutar" del editor de Apps Script)
// ---------------------------------------------------------------------------------------------------------------------
/** Valida la configuración, prueba la conexión con Supabase y crea el disparador de tiempo. */
function instalar() {
  var cfg = leerConfig_();
  var pol = rpc_(cfg, 'cmp_correos_config', { p_secreto: cfg.secreto }); // si el secreto es incorrecto, falla aquí
  var reglas = reglasPermitidas_(cfg, pol);
  if (!reglas.length) {
    throw errorConfig_('Antes de instalar define los dominios permitidos: en la app (cmp_config.correo_dominios_permitidos) o en la propiedad DOMINIOS_PERMITIDOS.');
  }
  if (cfg.alias && GmailApp.getAliases().indexOf(cfg.alias) < 0) {
    throw errorConfig_('REMITENTE_ALIAS no está dado de alta como "Enviar como" en esta cuenta.');
  }
  quitarDisparadores_();
  ScriptApp.newTrigger('procesar').timeBased().everyMinutes(cfg.intervalo).create();
  props_().setProperty('FALLOS_SEGUIDOS', '0');
  log_('INSTALADO. Conexión con Supabase correcta. Se ejecutará cada ' + cfg.intervalo + ' minuto(s) en modo ' + cfg.modo + '.');
  if (cfg.prueba) {
    log_('OJO: MODO=PRUEBA. Todos los correos se enviarán a la dirección de prueba. Cambia MODO a PRODUCCION cuando termines de probar.');
  }
  estado();
}

/**
 * Prueba sin tocar la bandeja: valida el secreto contra Supabase y envía UN correo de prueba al dueño del script
 * (o a CORREO_PRUEBA) con el mismo remitente, Reply-To y formato que los correos reales.
 */
function probar() {
  var cfg = leerConfig_();
  var pol = rpc_(cfg, 'cmp_correos_config', { p_secreto: cfg.secreto });
  log_('Conexión con Supabase y secreto: CORRECTOS.');
  var para = cfg.correoPrueba || Session.getEffectiveUser().getEmail();
  var html =
    '<div style="font-family:Segoe UI,Arial,sans-serif;padding:16px"><h3>Prueba del emisor de correos</h3>' +
    '<p>Si estás leyendo esto, el emisor de <b>Compras Indirectas</b> puede enviar correos con tu cuenta.</p>' +
    '<p><a href="https://example.com/prueba" style="background:#1f5fae;color:#ffffff;padding:8px 14px;text-decoration:none;border-radius:6px">Botón de prueba</a></p>' +
    '<p style="color:#6b7280;font-size:12px">Este mensaje no contiene ligas de aprobación ni datos de ninguna requisición.</p></div>';
  var nombre = cfg.remitenteNombre || lineaSegura_(pol.remitente_nombre, 80) || 'Compras';
  var responder = cfg.responderA || (correoValido_(pol.responder_a) ? pol.responder_a : '');
  enviar_(cfg, para, '[PRUEBA] Emisor de correos de Compras', html, htmlATexto_(html), nombre, responder);
  log_('Correo de prueba enviado a ' + enmascarar_(para) + ' (remitente "' + nombre + '"' + (responder ? ', responder a ' + enmascarar_(responder) : '') + ').');
  log_('Cuota restante de Google hoy: ' + MailApp.getRemainingDailyQuota() + '.');
  var reglas = reglasPermitidas_(cfg, pol);
  log_(reglas.length ? 'Destinatarios permitidos: ' + reglas.length + ' regla(s).' : 'ATENCIÓN: no hay dominios permitidos; el emisor no enviará nada hasta definirlos.');
}

/** Muestra en el registro cómo está el emisor (sin secretos). */
function estado() {
  var p = props_().getProperties();
  var disparadores = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'procesar';
  }).length;
  var ult = leerJson_('ULTIMA_EJECUCION', null);
  log_('--- ESTADO DEL EMISOR ---');
  log_('Disparadores activos: ' + disparadores + (disparadores ? '' : ' (corre instalar())'));
  log_('Modo: ' + String(p.MODO || 'PRUEBA').toUpperCase() + ' | Pausa: ' + (String(p.PAUSA || '').toUpperCase() === 'SI' ? 'SI' : 'no'));
  log_('Propiedades: SUPABASE_URL ' + (p.SUPABASE_URL ? 'ok' : 'FALTA') + ', SUPABASE_ANON_KEY ' + (p.SUPABASE_ANON_KEY ? 'ok' : 'FALTA') + ', EMISOR_SECRET ' + (p.EMISOR_SECRET ? 'ok' : 'FALTA'));
  log_('Enviados hoy por este script: ' + contadorDiario_() + ' | Cuota restante de Google: ' + MailApp.getRemainingDailyQuota());
  log_('Fallos seguidos: ' + (p.FALLOS_SEGUIDOS || '0') + ' | Ledger local: ' + Object.keys(ledger_()).length + ' id(s)');
  log_('Última ejecución con correos: ' + (ult ? ult.fecha + ' · reclamados ' + ult.reclamados + ' · ' + JSON.stringify(ult.resumen) : 'ninguna'));
}

/** Detiene el envío sin quitar el disparador. */
function pausar() {
  props_().setProperty('PAUSA', 'SI');
  log_('PAUSADO. Los correos seguirán como "pendiente" en la base. Para continuar: reanudar().');
}

function reanudar() {
  props_().deleteProperty('PAUSA');
  log_('REANUDADO.');
}

function quitarDisparadores_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'procesar') ScriptApp.deleteTrigger(t);
  });
}

/** Quita el disparador: el emisor deja de correr (los correos quedan "pendiente" en la base). */
function desinstalar() {
  quitarDisparadores_();
  log_('DESINSTALADO: ya no hay disparador de tiempo. Para apagar también el acceso a la base, revoca el secreto en Supabase.');
}
