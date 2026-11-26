// Pruebas unitarias del cliente de la API (src/lib/) contra un servidor HTTP falso. Sin dependencias nuevas:
// compila el .js con esbuild (viene con Vite) y lo carga en Node.   Uso:  npm run test:api
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apiclient-test-'))
const salida = path.join(tmp, 'apiClient.mjs')
await build({ entryPoints: [path.join(raiz, 'src/lib/apiClient.js')], bundle: true, format: 'esm', platform: 'node', outfile: salida, logLevel: 'error' })
const { createApiClient, ApiClientError } = await import(pathToFileURL(salida).href)

// ----------------------------------------------------------------------------------------------- mini framework
let total = 0
let fallos = 0
function ok(cond, nombre, extra) {
  total++
  if (!cond) {
    fallos++
    console.log(`  FALLA: ${nombre}`, extra !== undefined ? JSON.stringify(extra) : '')
  }
}
const eq = (a, b, nombre) => ok(JSON.stringify(a) === JSON.stringify(b), nombre, { obtenido: a, esperado: b })
function seccion(t) { console.log(`- ${t}`) }

// ----------------------------------------------------------------------------------------------- servidor falso
const peticiones = []
let manejador = (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('[]') }
const servidor = http.createServer((req, res) => {
  const trozos = []
  req.on('data', (c) => trozos.push(c))
  req.on('end', () => {
    const cuerpo = Buffer.concat(trozos)
    const u = new URL(req.url, 'http://x')
    const registro = { metodo: req.method, ruta: u.pathname, query: u.searchParams, crudo: req.url, headers: req.headers, cuerpo: cuerpo.toString('utf8'), buf: cuerpo }
    peticiones.push(registro)
    manejador(registro, res)
  })
})
await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
const puerto = servidor.address().port
const BASE = `http://127.0.0.1:${puerto}/api`

const json = (res, status, obj, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(obj === undefined ? '' : JSON.stringify(obj)) }
const memoria = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), _m: m } }
const nuevo = (extra = {}) => { const storage = memoria(); const t = { v: 1_700_000_000_000 }; return { api: createApiClient({ baseUrl: BASE, storage, retryDelayMs: 5, timeoutMs: 2000, now: () => t.v, ...extra }), storage, t } }
const ultima = () => peticiones[peticiones.length - 1]
const reset = (h) => { peticiones.length = 0; manejador = h ?? ((_r, res) => json(res, 200, [])) }
const login = async (api, h) => {
  const prev = manejador
  manejador = (r, res) => (r.ruta.endsWith('/auth/login') ? json(res, 200, { access_token: 'TOK123', token_type: 'bearer', expires_in: 28800, user: { id: 'u-1', username: 'admin', display_name: 'Dirección', role: 'admin', participante_id: null } }) : prev(r, res))
  const r = await api.auth.signInWithPassword({ email: 'admin@dga-inventarios.interno', password: 'x' })
  void h
  return r
}

// ================================================================================================ 1. URLs y filtros
seccion('select, filtros, orden y paginación')
{
  const { api } = nuevo()
  reset((_r, res) => json(res, 200, [{ id: 1 }]))
  let r = await api.from('inv_equipos').select('*').eq('id', 5)
  eq(ultima().metodo, 'GET', 'select usa GET')
  eq(ultima().ruta, '/api/rest/inv_equipos', 'ruta /rest/tabla')
  eq(ultima().query.get('id'), 'eq.5', 'eq número')
  ok(!ultima().query.has('select'), 'select(*) no manda select')
  eq(r.data, [{ id: 1 }], 'data es el arreglo')
  eq(r.error, null, 'sin error')
  eq(ultima().headers.accept, 'application/json', 'Accept json')
  ok(!ultima().headers.authorization, 'sin sesión no hay Authorization')

  await api.from('t').select('clave, valor')
  eq(ultima().query.get('select'), 'clave,valor', 'columnas sin espacios')

  await api.from('t').select('*').neq('a', 'x').gt('b', 1).gte('c', 2).lt('d', 3).lte('e', 4)
  const q = ultima().query
  eq([q.get('a'), q.get('b'), q.get('c'), q.get('d'), q.get('e')], ['neq.x', 'gt.1', 'gte.2', 'lt.3', 'lte.4'], 'neq gt gte lt lte')

  await api.from('t').select('*').like('n', 'ab*').ilike('m', '%x%').is('z', null).is('y', true).is('w', false)
  eq([ultima().query.get('n'), ultima().query.get('m'), ultima().query.get('z'), ultima().query.get('y'), ultima().query.get('w')], ['like.ab*', 'ilike.%x%', 'is.null', 'is.true', 'is.false'], 'like ilike is')

  await api.from('t').select('*').in('id', ['a', 'b c', 'd,e', 'f"g', 'h(i)', '']).eq('activo', true).eq('nulo', null)
  eq(ultima().query.get('id'), 'in.(a,b c,"d,e","f\\"g","h(i)","")', 'in con comillas')
  eq(ultima().query.get('activo'), 'eq.true', 'eq booleano')
  eq(ultima().query.get('nulo'), 'eq.null', 'eq null')

  await api.from('t').select('*').contains('tags', ['a', 'b']).containedBy('x', { k: 1 })
  eq(ultima().query.get('tags'), 'cs.["a","b"]', 'contains arreglo -> JSON')
  eq(ultima().query.get('x'), 'cd.{"k":1}', 'containedBy objeto -> JSON')

  await api.from('t').select('*').match({ a: 1, b: 'z' }).not('c', 'eq', 5).not('d', 'in', [1, 2]).or('e.eq.1,f.is.null').filter('g', 'gt', 3)
  const q2 = ultima().query
  eq([q2.get('a'), q2.get('b'), q2.get('c'), q2.get('d'), q2.get('or'), q2.get('g')], ['eq.1', 'eq.z', 'not.eq.5', 'not.in.(1,2)', '(e.eq.1,f.is.null)', 'gt.3'], 'match not or filter')

  await api.from('t').select('*').eq('fecha', new Date('2026-01-02T03:04:05.000Z')).eq('txt', 'a&b+c=d%e ñ')
  eq(ultima().query.get('fecha'), 'eq.2026-01-02T03:04:05.000Z', 'Date -> ISO')
  eq(ultima().query.get('txt'), 'eq.a&b+c=d%e ñ', 'valores con & + = % acentos viajan codificados')
  ok(!/a&b/.test(ultima().crudo), 'el & no queda crudo en la URL')

  await api.from('t').select('*').order('fecha', { ascending: false }).order('id')
  eq(ultima().query.getAll('order'), ['fecha.desc,id.asc'], 'varios order en UN parámetro')
  await api.from('t').select('*').order('a', { nullsFirst: true }).order('b', { ascending: false, nullsFirst: false })
  eq(ultima().query.get('order'), 'a.asc.nullsfirst,b.desc.nullslast', 'nulls first/last')
  await api.from('t').select('*').order('nombre')
  eq(ultima().query.get('order'), 'nombre.asc', 'order por omisión asc')

  await api.from('t').select('*').range(1000, 1999)
  eq([ultima().query.get('offset'), ultima().query.get('limit')], ['1000', '1000'], 'range(1000,1999)')
  await api.from('t').select('*').range(0, 999)
  eq([ultima().query.has('offset'), ultima().query.get('limit')], [false, '1000'], 'range(0,999) sin offset')
  await api.from('t').select('*').limit(7)
  eq(ultima().query.get('limit'), '7', 'limit')

  // consulta que combina: el patrón de leerTodo (orden + id + range)
  await api.from('inv_bitacora').select('*').order('fecha', { ascending: false }).order('id', { ascending: true }).range(2000, 2999)
  eq([ultima().query.get('order'), ultima().query.get('offset'), ultima().query.get('limit')], ['fecha.desc,id.asc', '2000', '1000'], 'patrón de leerTodo')
}

seccion('single, maybeSingle, count, in vacío')
{
  const { api } = nuevo()
  reset((_r, res) => json(res, 200, { id: 'p' }))
  let r = await api.from('profiles').select('*').eq('id', 'p').single()
  eq(ultima().query.get('__single'), '1', 'single manda __single')
  eq(r.data, { id: 'p' }, 'single devuelve el objeto')
  r = await api.from('profiles').select('*').eq('id', 'p').maybeSingle()
  eq(ultima().query.get('__maybe'), '1', 'maybeSingle manda __maybe')
  reset((_r, res) => json(res, 200, null))
  r = await api.from('profiles').select('*').eq('id', 'zz').maybeSingle()
  eq([r.data, r.error], [null, null], 'maybeSingle sin fila -> data null, sin error')
  reset((_r, res) => json(res, 406, { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: 'The result contains 0 rows', hint: null }))
  r = await api.from('profiles').select('*').eq('id', 'zz').single()
  eq([r.data, r.error.code, r.error.message, r.error.details], [null, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', 'The result contains 0 rows'], 'single sin fila -> error PGRST116')

  reset((_r, res) => json(res, 200, [], { 'content-range': '*/118' }))
  r = await api.from('t').select('*', { count: 'exact', head: true })
  eq([ultima().headers.prefer, ultima().query.get('limit')], ['count=exact', '0'], 'count exact + head -> Prefer y limit=0')
  eq([r.count, r.data], [118, null], 'head devuelve count y data null')
  reset((_r, res) => json(res, 200, [{ id: 1 }, { id: 2 }], { 'content-range': '0-1/2' }))
  r = await api.from('t').select('*', { count: 'exact' })
  eq([r.count, r.data.length], [2, 2], 'count con filas')
  reset((_r, res) => json(res, 200, [{ id: 1 }], { 'content-range': '0-0/*' }))
  r = await api.from('t').select('*', { count: 'exact' })
  eq(r.count, null, 'Content-Range con * -> count null')

  reset()
  r = await api.from('t').select('*').in('id', [])
  eq([peticiones.length, r.data, r.error], [0, [], null], 'in([]) no llama a la API y devuelve []')
}

// ================================================================================================ 2. escrituras
seccion('insert / update / upsert')
{
  const { api } = nuevo()
  reset((_r, res) => { res.writeHead(201); res.end() })
  let r = await api.from('inv_proveedores').insert({ id: 'p1', nombre: 'Ñandú', activo: true, monto: 12.5, nota: undefined })
  eq(ultima().metodo, 'POST', 'insert usa POST')
  eq(ultima().ruta, '/api/rest/inv_proveedores', 'insert ruta')
  eq(JSON.parse(ultima().cuerpo), { id: 'p1', nombre: 'Ñandú', activo: true, monto: 12.5 }, 'insert cuerpo JSON (sin undefined, UTF-8)')
  eq(ultima().headers['content-type'], 'application/json', 'insert Content-Type')
  eq(ultima().headers.prefer, 'return=minimal', 'insert sin select -> return=minimal')
  eq([r.data, r.error], [null, null], 'insert OK: data null, error null')

  await api.from('inv_auditoria_items').insert([{ id: 'a' }, { id: 'b' }])
  eq(JSON.parse(ultima().cuerpo), [{ id: 'a' }, { id: 'b' }], 'insert de arreglo')

  reset((_r, res) => json(res, 201, [{ id: 'x', a: 1, b: 2 }]))
  r = await api.from('t').insert({ id: 'x' }).select('id')
  eq(ultima().headers.prefer, 'return=representation', 'insert+select -> return=representation')
  eq(r.data, [{ id: 'x' }], 'insert+select proyecta columnas pedidas')
  reset((_r, res) => json(res, 201, { id: 'x', a: 1 }))
  r = await api.from('t').insert({ id: 'x' }).select().single()
  eq([r.data, ultima().query.get('__single')], [{ id: 'x', a: 1 }, '1'], 'insert+select+single')

  reset((_r, res) => { res.writeHead(204); res.end() })
  r = await api.from('inv_ubicaciones').update({ lat: 1.5, lng: -2 }).eq('id', 'u1')
  eq([ultima().metodo, ultima().ruta, ultima().query.get('id')], ['PATCH', '/api/rest/inv_ubicaciones', 'eq.u1'], 'update PATCH con filtro')
  eq(JSON.parse(ultima().cuerpo), { lat: 1.5, lng: -2 }, 'update cuerpo')
  eq(ultima().headers.prefer, 'return=minimal', 'update minimal')
  eq([r.data, r.error], [null, null], 'update OK')

  reset((_r, res) => json(res, 200, [{ id: 'u1', role: 'admin' }]))
  r = await api.from('profiles').update({ role: 'admin' }).eq('id', 'u1').select('id')
  eq(r.data, [{ id: 'u1' }], 'update+select("id") devuelve filas afectadas')
  reset((_r, res) => json(res, 200, []))
  r = await api.from('profiles').update({ display_name: 'x' }).eq('id', 'nope').select('id')
  eq([r.data, r.error], [[], null], 'update sin coincidencias -> [] (la app lo detecta)')

  reset((_r, res) => { res.writeHead(201); res.end() })
  await api.from('cmp_config').upsert({ clave: 'k', valor: { a: 1 } }, { onConflict: 'clave' })
  eq([ultima().metodo, ultima().query.get('on_conflict'), ultima().headers.prefer], ['POST', 'clave', 'resolution=merge-duplicates,return=minimal'], 'upsert onConflict + merge')
  await api.from('t').upsert({ a: 1, b: 2 }, { onConflict: 'a,b', ignoreDuplicates: true })
  eq([ultima().query.get('on_conflict'), ultima().headers.prefer], ['a,b', 'resolution=ignore-duplicates,return=minimal'], 'upsert ignoreDuplicates')
  eq(JSON.parse(ultima().cuerpo), { a: 1, b: 2 }, 'upsert cuerpo')
  await api.from('cmp_config').upsert({ clave: 'reglas_confirmadas', valor: null }, { onConflict: 'clave' })
  eq(JSON.parse(ultima().cuerpo), { clave: 'reglas_confirmadas', valor: null }, 'upsert conserva null explícito')
}

// ================================================================================================ 3. errores
seccion('errores')
{
  const { api } = nuevo()
  reset((_r, res) => json(res, 400, { message: 'Los operadores no pueden modificar el costo de compra.', code: 'P0001', details: null, hint: null }))
  let r = await api.from('inv_equipos').update({ costo_total: 1 }).eq('id', 'e')
  ok(r.error instanceof Error && r.error instanceof ApiClientError, 'error es Error/ApiClientError')
  eq([r.error.message, r.error.code, r.error.details, r.error.hint, r.error.status, r.data], ['Los operadores no pueden modificar el costo de compra.', 'P0001', null, null, 400, null], 'error 400 conserva forma')

  reset((_r, res) => json(res, 403, { message: 'No tiene permiso.', code: '42501', details: null, hint: null }))
  r = await api.from('t').select('*')
  eq([r.error.status, r.error.code], [403, '42501'], '403')
  reset((_r, res) => json(res, 409, { message: 'Ya existe un registro con ese valor.', code: '23505', details: 'x', hint: 'y' }))
  r = await api.from('t').insert({ a: 1 })
  eq([r.error.code, r.error.details, r.error.hint], ['23505', 'x', 'y'], '409 details y hint')

  reset((_r, res) => { res.writeHead(500, { 'content-type': 'text/html' }); res.end('<h1>Oops</h1>') })
  r = await api.from('t').insert({ a: 1 })
  eq([r.error.status, r.error.code, /interno/.test(r.error.message)], [500, 'HTTP_500', true], '500 no JSON -> mensaje genérico')
  reset((_r, res) => { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<h1>No</h1>') })
  r = await api.from('t').insert({ a: 1 })
  ok(/VITE_API_URL/.test(r.error.message), '404 HTML sugiere revisar VITE_API_URL')
  reset((_r, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html></html>') })
  r = await api.from('t').select('*')
  eq(r.error?.code, 'BAD_RESPONSE', '200 con HTML (SPA capturando /api) -> BAD_RESPONSE')

  reset((_r, res) => json(res, 400, { message: 'x', code: 'P0001' }))
  let lanzo = null
  try { await api.from('t').insert({ a: 1 }).throwOnError() } catch (e) { lanzo = e }
  ok(lanzo instanceof ApiClientError && lanzo.code === 'P0001', 'throwOnError rechaza con el error')
}

// ================================================================================================ 4. reintentos y timeouts
seccion('reintentos y timeouts')
{
  const { api } = nuevo({ retries: 2 })
  let n = 0
  reset((_r, res) => { n++; if (n < 3) { res.writeHead(503); res.end('no') } else json(res, 200, [{ id: 1 }]) })
  let r = await api.from('t').select('*')
  eq([peticiones.length, r.data], [3, [{ id: 1 }]], 'GET reintenta 503 hasta tener éxito')
  n = 0; peticiones.length = 0
  reset((_r, res) => { res.writeHead(503); res.end('no') })
  r = await api.from('t').select('*')
  eq([peticiones.length, r.error.status], [3, 503], 'GET agota reintentos (1 + 2) y devuelve error 503')
  ok(/no está disponible/.test(r.error.message), 'mensaje de 503 en español')
  peticiones.length = 0
  r = await api.from('t').insert({ a: 1 })
  eq(peticiones.length, 1, 'POST NO se reintenta')
  peticiones.length = 0
  r = await api.from('t').update({ a: 1 }).eq('id', 1)
  eq(peticiones.length, 1, 'PATCH NO se reintenta')
  peticiones.length = 0
  r = await api.rpc('cmp_cambiar_estado', { p_folio: 'x' })
  eq(peticiones.length, 1, 'RPC con escritura NO se reintenta')
  peticiones.length = 0
  r = await api.rpc('verificar_equipo', { p_id: 'x' })
  eq(peticiones.length, 3, 'RPC de consulta SÍ se reintenta')
  peticiones.length = 0
  reset((_r, res) => json(res, 400, { message: 'mal', code: 'P0001' }))
  r = await api.from('t').select('*')
  eq(peticiones.length, 1, 'GET con 400 no se reintenta')
}
{
  // timeout: el servidor no responde
  const { api } = nuevo({ timeoutMs: 80, retries: 1 })
  reset(() => { /* cuelga */ })
  const t0 = Date.now()
  let r = await api.from('t').select('*')
  eq([r.error.code, peticiones.length], ['TIMEOUT', 2], 'timeout de lectura (se reintenta una vez)')
  ok(Date.now() - t0 < 2000, 'el timeout corta pronto')
  peticiones.length = 0
  r = await api.from('t').insert({ a: 1 })
  eq([r.error.code, peticiones.length], ['TIMEOUT', 1], 'timeout de escritura (sin reintento)')
  ok(/tardó demasiado/.test(r.error.message), 'mensaje de timeout en español')
}
{
  // sin servidor: error de red
  const api = createApiClient({ baseUrl: 'http://127.0.0.1:9/api', storage: null, retries: 1, retryDelayMs: 1, timeoutMs: 500 })
  const r = await api.from('t').select('*')
  eq(r.error.code, 'NETWORK', 'sin servidor -> NETWORK')
  ok(/No se pudo conectar/.test(r.error.message), 'mensaje de red en español')
  const ctrl = new AbortController()
  reset(() => {})
  const { api: api2 } = nuevo({ timeoutMs: 5000 })
  const p = api2.from('t').select('*').abortSignal(ctrl.signal)
  setTimeout(() => ctrl.abort(), 30)
  const r2 = await p
  eq(r2.error?.code, 'ABORTED', 'abortSignal cancela')
}

// ================================================================================================ 5. auth
seccion('auth')
{
  const { api, storage } = nuevo()
  const eventos = []
  const sub = api.auth.onAuthStateChange((e, s) => eventos.push([e, s?.user?.id ?? null]))
  eq((await api.auth.getSession()).data.session, null, 'sin sesión al inicio')

  reset((_r, res) => json(res, 401, { message: 'Usuario o contraseña incorrectos.', code: 'invalid_credentials', details: null, hint: null }))
  let r = await api.auth.signInWithPassword({ email: 'admin@dga-inventarios.interno', password: 'mala' })
  eq([r.data.user, r.data.session, r.error.status, r.error.message], [null, null, 401, 'Usuario o contraseña incorrectos.'], 'login fallido')
  eq(JSON.parse(ultima().cuerpo), { username: 'admin', password: 'mala' }, 'login manda usuario (antes de la @) y contraseña')
  eq(ultima().ruta, '/api/auth/login', 'login ruta')
  ok(!ultima().headers.authorization, 'login sin Authorization')
  eq(eventos.length, 0, 'login fallido no emite eventos')

  reset((_r, res) => json(res, 429, { message: 'Demasiados intentos fallidos. Espere unos minutos e intente de nuevo.', code: 'too_many_attempts', details: '600', hint: null }, { 'retry-after': '600' }))
  r = await api.auth.signInWithPassword({ email: 'admin@dga-inventarios.interno', password: 'mala' })
  eq([r.error.status, r.error.retryAfter], [429, 600], '429 con Retry-After')
  eq(peticiones.length, 1, 'login 429 no se reintenta')

  reset()
  r = await login(api)
  eq([r.error, r.data.user.id, r.data.user.user_metadata.role, r.data.session.access_token], [null, 'u-1', 'admin', 'TOK123'], 'login correcto')
  eq(eventos, [['SIGNED_IN', 'u-1']], 'login emite SIGNED_IN')
  ok(storage._m.has('dga_api_session'), 'la sesión se guarda en el almacenamiento')
  eq((await api.auth.getSession()).data.session.user.id, 'u-1', 'getSession devuelve la sesión')

  reset((_r, res) => json(res, 200, [{ id: 'u-1' }]))
  await api.from('profiles').select('*').eq('id', 'u-1').single()
  eq(ultima().headers.authorization, 'Bearer TOK123', 'las peticiones llevan Bearer')
  await api.rpc('cmp_cambiar_estado', {})
  eq(ultima().headers.authorization, 'Bearer TOK123', 'las RPC llevan Bearer')

  // persistencia: otro cliente con el mismo almacenamiento recupera la sesión
  const api2 = createApiClient({ baseUrl: BASE, storage, now: () => 1_700_000_000_000 + 1000 })
  eq((await api2.auth.getSession()).data.session?.access_token, 'TOK123', 'sesión persistente al recargar')

  reset((_r, res) => json(res, 200, { ok: true }))
  r = await api.auth.signOut()
  eq([ultima().metodo, ultima().ruta, ultima().headers.authorization], ['POST', '/api/auth/logout', 'Bearer TOK123'], 'signOut llama a /auth/logout con el token')
  eq(r.error, null, 'signOut sin error')
  eq(eventos[eventos.length - 1], ['SIGNED_OUT', null], 'signOut emite SIGNED_OUT')
  ok(!storage._m.has('dga_api_session'), 'signOut limpia el almacenamiento')
  eq((await api.auth.getSession()).data.session, null, 'tras signOut no hay sesión')
  await api.from('t').select('*')
  ok(!ultima().headers.authorization, 'tras signOut no se manda token')

  // signOut sin red nunca falla
  reset((_r, res) => json(res, 200, {}))
  await login(api)
  const roto = createApiClient({ baseUrl: 'http://127.0.0.1:9/api', storage: memoria(), timeoutMs: 300 })
  eq((await roto.auth.signOut()).error, null, 'signOut sin sesión/sin red no falla')

  sub.data.subscription.unsubscribe()
  const n = eventos.length
  await api.auth.signOut()
  eq(eventos.length, n, 'unsubscribe deja de notificar')
}

seccion('sesión: vencimiento y 401')
{
  const { api, storage, t } = nuevo()
  const eventos = []
  api.auth.onAuthStateChange((e) => eventos.push(e))
  reset()
  await login(api)
  eq(eventos, ['SIGNED_IN'], 'SIGNED_IN')

  // vencida: lecturas siguen sin token; escrituras devuelven error de sesión sin llamar
  t.v += 8 * 3600 * 1000 + 60_000
  peticiones.length = 0
  let r = await api.from('t').select('*')
  ok(!ultima().headers.authorization, 'sesión vencida: la lectura va sin token')
  eq(eventos, ['SIGNED_IN', 'SIGNED_OUT'], 'vencimiento emite SIGNED_OUT')
  ok(!storage._m.has('dga_api_session'), 'vencimiento limpia el almacenamiento')

  reset()
  await login(api)
  t.v += 8 * 3600 * 1000 + 60_000
  peticiones.length = 0
  r = await api.from('t').insert({ a: 1 })
  eq([peticiones.length, r.error.code, r.error.status], [0, 'SESSION_EXPIRED', 401], 'escritura con sesión vencida no se envía: SESSION_EXPIRED')
  ok(/sesión expiró/.test(r.error.message), 'mensaje en español')
}
{
  const { api, storage } = nuevo()
  const eventos = []
  api.auth.onAuthStateChange((e) => eventos.push(e))
  reset()
  await login(api)
  // 401 del servidor: lectura -> cierra sesión y reintenta anónima
  peticiones.length = 0
  reset((r, res) => (r.headers.authorization ? json(res, 401, { message: 'Sesión cerrada.', code: 'PGRST301' }) : json(res, 200, [{ id: 'pub' }])))
  let r = await api.from('t').select('*')
  eq(peticiones.map((p) => !!p.headers.authorization), [true, false], '401 en lectura: reintenta sin token')
  eq(r.data, [{ id: 'pub' }], 'la lectura anónima devuelve datos')
  eq(eventos, ['SIGNED_IN', 'SIGNED_OUT'], '401 emite SIGNED_OUT')
  ok(!storage._m.has('dga_api_session'), '401 limpia el almacenamiento')

  reset()
  await login(api)
  peticiones.length = 0
  reset((r2, res) => (r2.headers.authorization ? json(res, 401, { message: 'Usuario inactivo o inexistente.', code: 'PGRST301' }) : json(res, 401, { message: 'Se requiere iniciar sesión.', code: '42501' })))
  r = await api.rpc('cmp_cambiar_estado', { p_folio: 'x' })
  eq(peticiones.length, 2, 'RPC con 401 reintenta anónima una vez')
  r = await api.from('t').update({ a: 1 }).eq('id', 1)
  eq(r.error.status, 401, 'escritura sin sesión: error 401')
  eq(eventos.filter((e) => e === 'SIGNED_OUT').length, 2, 'SIGNED_OUT solo una vez por sesión perdida')
  // 401 sin token no es sesión perdida
  const antes = eventos.length
  await api.from('t').select('*')
  eq(eventos.length, antes, '401 sin token no emite eventos')
}

// ================================================================================================ renovación automática del token
seccion('renovación automática de la sesión (POST /auth/refresh)')
{
  const USUARIO = { id: 'u-1', username: 'admin', display_name: 'Dirección', role: 'admin', participante_id: null }
  const HORA = 3600 * 1000
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
  const refrescos = () => peticiones.filter((p) => p.ruta === '/api/auth/refresh')
  const normales = () => peticiones.filter((p) => !p.ruta.startsWith('/api/auth/'))
  // servidor falso: /auth/refresh responde `refresh(n)`; lo demás, una lista vacía
  const servidorConRefresh = (refresh, demora = 0) => {
    let n = 0
    return (r, res) => {
      if (r.ruta === '/api/auth/refresh') {
        n++
        const salida = () => refresh(n, r, res)
        return demora ? setTimeout(salida, demora) : salida()
      }
      return json(res, 200, [])
    }
  }
  const tokenNuevo = (n, _r, res) => json(res, 200, { access_token: `TOK-R${n}`, token_type: 'bearer', expires_in: 28800, user: { ...USUARIO, display_name: 'Dirección General' } })
  const ok200 = (_n, _r, res) => json(res, 200, { access_token: 'TOK2', token_type: 'bearer', expires_in: 28800, user: { ...USUARIO, display_name: 'Dirección General' } })

  // --- 1) renueva cuando falta menos de 1 h; antes no
  {
    const { api, storage, t } = nuevo()
    const eventos = []
    api.auth.onAuthStateChange((e) => eventos.push(e))
    reset()
    await login(api)
    reset(servidorConRefresh(ok200))
    t.v += 6 * HORA   // faltan 2 h
    await api.from('t').select('*')
    eq([refrescos().length, normales().length], [0, 1], 'con más de 1 h de vigencia NO se renueva')
    t.v += 1.2 * HORA   // faltan 48 min
    reset(servidorConRefresh(ok200))
    const r = await api.from('t').select('*')
    eq(r.error, null, 'la petición original sale bien')
    eq(peticiones.map((p) => `${p.metodo} ${p.ruta}`), ['POST /api/auth/refresh', 'GET /api/rest/t'], 'primero renueva y después hace la petición')
    eq(refrescos()[0].headers.authorization, 'Bearer TOK123', 'la renovación se presenta con el token vigente')
    eq(normales()[0].headers.authorization, 'Bearer TOK2', 'y la petición ya sale con el token NUEVO')
    const s = (await api.auth.getSession()).data.session
    eq([s.access_token, s.expires_at], ['TOK2', Math.floor(t.v / 1000) + 28800], 'la sesión guarda el token nuevo y su nuevo vencimiento (8 h desde ahora)')
    eq(JSON.parse(storage._m.get('dga_api_session')).access_token, 'TOK2', 'y lo persiste en el almacenamiento')
    eq(s.user.user_metadata.display_name, 'Dirección General', 'actualiza los datos del usuario que devuelve el servidor')
    eq(eventos, ['SIGNED_IN'], 'la renovación es silenciosa: no emite eventos')
    // justo después, ya con vigencia completa: no vuelve a renovar
    reset(servidorConRefresh(ok200))
    await api.from('t').select('*')
    eq(refrescos().length, 0, 'con el token recién renovado no se renueva otra vez')
    eq(refrescos().length + normales().length, 1, 'una petición normal, nada más')
  }

  // --- 2) una sola renovación aunque haya muchas peticiones simultáneas
  {
    const { api, t } = nuevo()
    reset()
    await login(api)
    t.v += 7.3 * HORA
    reset(servidorConRefresh(tokenNuevo, 80))
    const rs = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => api.from('t').select('*').eq('i', i)))
    eq(refrescos().length, 1, 'seis peticiones simultáneas -> UNA sola renovación')
    ok(rs.every((x) => x.error === null), 'todas terminan bien')
    ok(normales().length === 6 && normales().every((p) => p.headers.authorization === 'Bearer TOK-R1'), 'todas esperan a la renovación y salen con el token nuevo')
    ok(peticiones.indexOf(refrescos()[0]) === 0, 'la renovación es la primera petición')
  }

  // --- 3) inactividad: sin interacción del usuario más de 30 min no se renueva
  {
    const oyentes = {}
    globalThis.window = { addEventListener: (ev, fn) => { oyentes[ev] = fn } }
    try {
      const { api, t } = nuevo()
      reset()
      await login(api)
      reset(servidorConRefresh(ok200))
      t.v += 7.3 * HORA   // el usuario no ha tocado nada desde el login
      await api.from('t').select('*')
      eq([refrescos().length, normales()[0].headers.authorization], [0, 'Bearer TOK123'], 'usuario inactivo (más de 30 min sin interacción): NO se renueva; sigue con el token actual')
      ok(typeof oyentes.pointerdown === 'function' && typeof oyentes.keydown === 'function', 'escucha pointerdown y keydown para medir la actividad')
      oyentes.pointerdown()
      reset(servidorConRefresh(ok200))
      await api.from('t').select('*')
      eq([refrescos().length, normales()[0].headers.authorization], [1, 'Bearer TOK2'], 'en cuanto el usuario vuelve a interactuar, la siguiente petición renueva')
      // pasan 29 min de inactividad: aún cuenta como activo
      t.v += 7.2 * HORA   // otra vez dentro de la ventana de 1 h
      oyentes.keydown()
      t.v += 29 * 60 * 1000
      reset(servidorConRefresh(tokenNuevo))
      await api.from('t').select('*')
      eq(refrescos().length, 1, '29 min después de la última interacción todavía cuenta como activo')
    } finally {
      delete globalThis.window
    }
  }

  // --- 4) fallos: sin bucles ni reintentos en ráfaga
  {
    const { api, storage, t } = nuevo()
    reset()
    await login(api)
    t.v += 7.3 * HORA
    reset(servidorConRefresh((n, _r, res) => json(res, 503, { message: 'no disponible' })))
    let r = await api.from('t').select('*')
    eq([refrescos().length, r.error, normales()[0].headers.authorization], [1, null, 'Bearer TOK123'], 'la renovación falla (503): la petición sigue con el token actual y no se rompe la sesión')
    ok((await api.auth.getSession()).data.session !== null, 'la sesión se conserva')
    await api.from('t').select('*')
    await api.from('t').select('*')
    eq(refrescos().length, 1, 'tras el fallo NO se insiste en cada petición (espera de 60 s)')
    t.v += 61_000
    reset(servidorConRefresh(tokenNuevo))
    await api.from('t').select('*')
    eq([refrescos().length, normales()[0].headers.authorization], [1, 'Bearer TOK-R1'], 'pasado el tiempo de espera se reintenta y esta vez funciona')
    // error de red en la renovación
    const b = nuevo()
    reset()
    await login(b.api)
    b.t.v += 7.3 * HORA
    reset()
    manejador = (r, res) => (r.ruta === '/api/auth/refresh' ? res.socket.destroy() : json(res, 200, []))
    r = await b.api.from('t').select('*')
    eq([r.error, (await b.api.auth.getSession()).data.session?.access_token], [null, 'TOK123'], 'fallo de red al renovar: la petición sale con el token actual')
    eq(refrescos().length, 1, 'y no hay reintentos en ráfaga (un solo intento)')
    void storage
  }

  // --- 5) 401 en la renovación: no se insiste con ese token y la sesión sigue hasta que el servidor diga lo contrario
  {
    const { api, t } = nuevo()
    reset()
    await login(api)
    t.v += 7.3 * HORA
    reset(servidorConRefresh((n, _r, res) => json(res, 401, { message: 'La sesión llegó a su duración máxima: vuelva a iniciar sesión.', code: 'session_too_old' })))
    await api.from('t').select('*')
    t.v += 10 * 60 * 1000
    await api.from('t').select('*')
    await api.from('t').select('*')
    eq(refrescos().length, 1, '401 al renovar (p. ej. sesión de 7 días): no se vuelve a intentar con ese token (no hay bucle)')
    eq(normales().map((p) => p.headers.authorization), ['Bearer TOK123', 'Bearer TOK123', 'Bearer TOK123'], 'las peticiones siguen con el token actual mientras el servidor lo acepte')
    // cuando el servidor ya rechaza el token (revocado/desactivado), el 401 normal cierra la sesión como siempre
    const eventos = []
    api.auth.onAuthStateChange((e) => eventos.push(e))
    reset((r, res) => (r.ruta.startsWith('/api/rest') && r.headers.authorization ? json(res, 401, { message: 'Sesión cerrada.', code: 'PGRST301' }) : json(res, 200, [])))
    await api.from('t').select('*')
    eq([(await api.auth.getSession()).data.session, eventos], [null, ['SIGNED_OUT']], 'un 401 normal sigue cerrando la sesión')
  }

  // --- 6) respuestas raras no rompen
  {
    const { api, t } = nuevo()
    reset()
    await login(api)
    t.v += 7.3 * HORA
    reset(servidorConRefresh((n, _r, res) => json(res, 200, { ok: true })))   // 200 sin access_token
    const r = await api.from('t').select('*')
    eq([r.error, (await api.auth.getSession()).data.session?.access_token], [null, 'TOK123'], 'refresh 200 sin access_token: se ignora, la sesión no se pierde')
    reset(servidorConRefresh((n, _r, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>') }))
    t.v += 61_000
    const r2 = await api.from('t').select('*')
    eq([r2.error, (await api.auth.getSession()).data.session?.access_token], [null, 'TOK123'], 'refresh que devuelve HTML: se ignora')
  }

  // --- 7) logout/login mientras la renovación está en vuelo
  {
    const { api, storage, t } = nuevo()
    reset()
    await login(api)
    t.v += 7.3 * HORA
    reset(servidorConRefresh(ok200, 150))
    const p = api.from('t').select('*').then((x) => x)   // (la consulta es perezosa: .then la dispara)
    await esperar(30)
    await api.auth.signOut()
    await p
    eq([(await api.auth.getSession()).data.session, storage._m.has('dga_api_session')], [null, false], 'si el usuario cierra sesión durante la renovación, el token renovado se descarta (no resucita la sesión)')
  }

  // --- 8) otra pestaña ya renovó: se adopta su token sin pedir otro
  {
    const { api, storage, t } = nuevo()
    reset()
    await login(api)
    t.v += 7.3 * HORA
    const s = JSON.parse(storage._m.get('dga_api_session'))
    storage.setItem('dga_api_session', JSON.stringify({ ...s, access_token: 'TOK-OTRA-PESTANA', expires_at: Math.floor(t.v / 1000) + 28800 }))
    reset(servidorConRefresh(ok200))
    await api.from('t').select('*')
    eq([refrescos().length, normales()[0].headers.authorization], [0, 'Bearer TOK-OTRA-PESTANA'], 'si otra pestaña ya renovó (almacenamiento), se usa ese token y no se pide otra renovación')
  }

  // --- 9) desactivable
  {
    const { api, t } = nuevo({ refreshWindowMs: 0 })
    reset()
    await login(api)
    t.v += 7.3 * HORA
    reset(servidorConRefresh(ok200))
    await api.from('t').select('*')
    eq(refrescos().length, 0, 'refreshWindowMs: 0 desactiva la renovación')
  }

  // --- 10) un token vencido NO se renueva (se cierra la sesión como siempre)
  {
    const { api, t } = nuevo()
    const eventos = []
    api.auth.onAuthStateChange((e) => eventos.push(e))
    reset()
    await login(api)
    t.v += 8.1 * HORA
    reset(servidorConRefresh(ok200))
    await api.from('t').select('*')
    eq([refrescos().length, eventos], [0, ['SIGNED_IN', 'SIGNED_OUT']], 'con el token ya vencido no se intenta renovar: se cierra la sesión')
  }
}

// ================================================================================================ 6. rpc
seccion('rpc')
{
  const { api } = nuevo()
  reset((_r, res) => json(res, 200, [{ id: 'e1', nombre: 'Laptop' }]))
  let r = await api.rpc('verificar_equipo', { p_id: 'e1' })
  eq([ultima().metodo, ultima().ruta, JSON.parse(ultima().cuerpo)], ['POST', '/api/rpc/verificar_equipo', { p_id: 'e1' }], 'rpc POST con parámetros')
  eq(r.data, [{ id: 'e1', nombre: 'Laptop' }], 'rpc devuelve la lista')
  reset((_r, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('null') })
  r = await api.rpc('cmp_cambiar_estado', { p_folio: 'x', p_a: 'y', p_comentario: null })
  eq([r.data, r.error], [null, null], 'rpc void -> data null')
  eq(JSON.parse(ultima().cuerpo), { p_folio: 'x', p_a: 'y', p_comentario: null }, 'rpc conserva null')
  reset((_r, res) => json(res, 200, { folio: 'REQ-1', solicitanteId: 3 }))
  r = await api.rpc('cmp_crear_requisicion', { payload: { a: 1 } })
  eq(r.data, { folio: 'REQ-1', solicitanteId: 3 }, 'rpc devuelve claves tal cual (camelCase)')
  eq(JSON.parse(ultima().cuerpo), { payload: { a: 1 } }, 'rpc payload anidado')
  reset((_r, res) => json(res, 400, { message: 'No hay aprobador elegible.', code: 'P0001', details: null, hint: null }))
  r = await api.rpc('cmp_solicitar_autorizacion', {})
  eq([r.data, r.error.message, r.error.code], [null, 'No hay aprobador elegible.', 'P0001'], 'rpc con regla de negocio -> error en español')
  reset((_r, res) => json(res, 404, { message: 'No se encontró la función «x».', code: 'PGRST202' }))
  r = await api.rpc('x')
  eq(JSON.stringify(ultima().cuerpo), '"{}"', 'rpc sin argumentos manda {}')
  reset((_r, res) => json(res, 200, [{ a: 1 }]))
  r = await api.rpc('verificar_material', { p_id: 'm' }).single()
  eq(r.data, { a: 1 }, 'rpc.single toma la única fila')
  reset((_r, res) => json(res, 200, []))
  r = await api.rpc('verificar_material', { p_id: 'm' }).maybeSingle()
  eq([r.data, r.error], [null, null], 'rpc.maybeSingle sin filas')
  r = await api.rpc('verificar_material', { p_id: 'm' }).single()
  eq(r.error?.code, 'PGRST116', 'rpc.single sin filas -> error')
}

// ================================================================================================ 7. storage
seccion('storage')
{
  const { api } = nuevo()
  const fotos = api.storage.from('inventario-fotos')
  reset((r, res) => json(res, 201, { bucket: 'inventario-fotos', path: 'EQ-1/1700-foto_1.jpg', size: 4, mime: 'image/jpeg', url: '/api/storage/inventario-fotos/EQ-1/1700-foto_1.jpg', subido_por: 'x', subido_at: 'y' }))
  const archivo = new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
  let r = await fotos.upload('EQ-1/1700-foto_1.jpg', archivo, { upsert: false })
  eq([ultima().metodo, ultima().ruta], ['POST', '/api/storage/inventario-fotos'], 'upload POST /storage/{bucket}')
  ok(/^multipart\/form-data; boundary=/.test(ultima().headers['content-type']), 'upload es multipart')
  const txt = ultima().buf.toString('latin1')
  ok(/name="path"\r\n\r\nEQ-1\/1700-foto_1\.jpg\r\n/.test(txt), 'campo path')
  ok(/name="file"; filename="[^"]+"/.test(txt), 'campo file con nombre')
  eq([r.error, r.data.path], [null, 'EQ-1/1700-foto_1.jpg'], 'upload OK devuelve la ruta')
  eq(fotos.getPublicUrl(r.data.path).data.publicUrl, `http://127.0.0.1:${puerto}/api/storage/inventario-fotos/EQ-1/1700-foto_1.jpg`, 'getPublicUrl tras subir: URL absoluta del servidor')
  eq(fotos.getPublicUrl('a b/ñ.jpg').data.publicUrl, `${BASE}/storage/inventario-fotos/a%20b/%C3%B1.jpg`, 'getPublicUrl codifica segmentos')

  const rutaEnviada = () => /name="path"\r\n\r\n([^\r]*)\r\n/.exec(ultima().buf.toString('latin1'))[1]
  await fotos.upload('Equipo 1/ñandú foto.JPG', archivo)
  eq(rutaEnviada(), 'Equipo_1/_and__foto.JPG', 'la ruta se sanea (espacios y acentos -> _)')
  await fotos.upload('../../x/.oculto.png', archivo)
  eq(rutaEnviada(), '_/_/x/_oculto.png', 'sin .. ni segmentos que empiecen por punto')
  await fotos.upload('1/2/3/4/5/6/7/8/f.png', archivo)
  eq(rutaEnviada(), '4/5/6/7/8/f.png', 'ruta profunda: se conservan los últimos 6 niveles')

  reset((_r, res) => json(res, 409, { message: 'Ya existe un archivo con esa ruta: no se sobrescribe (suba con otro nombre).', code: '23505', details: null, hint: null }))
  r = await fotos.upload('a/b.jpg', archivo, { upsert: false })
  eq([r.data, r.error.status, r.error.code], [null, 409, '23505'], 'upload duplicado -> 409')
  reset((_r, res) => json(res, 415, { message: 'Tipo de archivo no permitido: solo imágenes (jpg, png, webp, gif, heic) y PDF.', code: 'PGRST415', details: null, hint: null }))
  r = await fotos.upload('a/b.exe', archivo)
  eq(r.error.status, 415, 'upload tipo no permitido -> 415 legible')
  ok(/solo imágenes/.test(r.error.message), 'mensaje de tipo legible')
  reset((_r, res) => json(res, 403, { message: 'Su rol no puede subir archivos a este almacenamiento.', code: '42501' }))
  r = await fotos.upload('a/c.jpg', archivo)
  eq(r.error.status, 403, 'upload sin permiso')

  peticiones.length = 0
  const grande = new Blob([new Uint8Array(11 * 1024 * 1024)])
  r = await fotos.upload('a/grande.pdf', grande)
  eq([peticiones.length, r.error.code, r.error.status], [0, 'FILE_TOO_LARGE', 413], 'archivo > máximo se rechaza antes de subir')
  ok(/11\.0 MB.*10 MB/.test(r.error.message), 'mensaje con tamaños')
  r = await fotos.upload('a/vacio.pdf', new Blob([]))
  eq(r.error.code, 'EMPTY_FILE', 'archivo vacío')

  reset((_r, res) => json(res, 201, { path: 'x/y.pdf', url: 'https://cdn.ejemplo.mx/archivos/x/y.pdf' }))
  r = await api.storage.from('inventario-facturas').upload('x/y.pdf', new Blob([Buffer.from('%PDF-1.4')]))
  eq(api.storage.from('inventario-facturas').getPublicUrl('x/y.pdf').data.publicUrl, 'https://cdn.ejemplo.mx/archivos/x/y.pdf', 'respeta la URL pública que devuelve la API')
}
{
  // base relativa: la URL pública se vuelve absoluta con el origen de la página
  globalThis.location = { origin: 'https://inv.ejemplo.mx' }
  const api = createApiClient({ baseUrl: '/api', storage: null })
  eq(api.storage.from('inventario-fotos').getPublicUrl('a/b.jpg').data.publicUrl, 'https://inv.ejemplo.mx/api/storage/inventario-fotos/a/b.jpg', 'base relativa -> URL absoluta con location.origin')
  delete globalThis.location
  const api2 = createApiClient({ baseUrl: 'https://api.ejemplo.mx/api/', storage: null })
  eq(api2.baseUrl, 'https://api.ejemplo.mx/api', 'se normaliza la barra final de la base')
}

// ================================================================================================ cierre
servidor.close()
servidor.closeAllConnections?.()
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${total - fallos}/${total} aserciones OK${fallos ? `, ${fallos} FALLAN` : ''}`)
process.exit(fallos ? 1 : 0)
