import { supabase } from './supabase'

/**
 * Lee TODAS las filas de una tabla. Supabase corta cada consulta en 1,000 filas sin avisar: en una plataforma de control,
 * perder en silencio el equipo 1,001 falsea totales y deja pasar series repetidas. Se pagina en bloques de 1,000 con un
 * orden estable (columna pedida + `id`) para que ninguna fila se repita ni se salte entre páginas.
 * Devuelve `{ data }` como una consulta normal; si una página falla, conserva lo ya leído y avisa en consola.
 */
const PAGINA = 1000

export async function leerTodo(
  tabla,
  opts = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas = []
  const tope = opts.maxFilas ?? Infinity
  for (let desde = 0; filas.length < tope; desde += PAGINA) {
    let q = supabase.from(tabla).select('*')
    if (opts.orden) q = q.order(opts.orden, { ascending: opts.ascendente ?? true })
    q = q.order('id', { ascending: true })
    const { data, error } = await q.range(desde, desde + PAGINA - 1)
    if (error) {
      console.warn(`[inventario] no se pudo leer ${tabla}:`, error.message)
      break
    }
    filas.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
  }
  return { data: filas.length > tope ? filas.slice(0, tope) : filas }
}
