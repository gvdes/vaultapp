import { ref } from 'vue'

/**
 * Las cachés de lib/inventario/*.js son variables de módulo normales (no reactivas). Para que las
 * plantillas Vue se vuelvan a pintar cuando cambian los datos:
 *  - todo getter síncrono (listX/getX/...) llama a track() al entrar → la plantilla/computed que lo
 *    use queda suscrita al contador;
 *  - las pantallas llaman a bump() (alias: refresh) después de cualquier operación que modifique datos,
 *    y los cargadores de caché lo llaman al terminar.
 */
const rev = ref(0)

export function track() {
  return rev.value
}

export function bump() {
  rev.value++
}
