import { computed } from 'vue'
import { useAuth } from 'src/lib/auth'
import { canApproveFinanzas, canConfirmRecepcion, canFundCaja, canQuote, canRegistrarPago, canViewClabe, canViewCompras, canViewComprasDinero, canViewComprasGlobal, pestanasRequisicion } from 'src/lib/access'

/** Permisos de Compras Indirectas para el usuario con sesión (todo sale de `src/lib/access.js`). */
export function useAcceso() {
  const { user } = useAuth()
  const role = computed(() => user.value?.role)
  const nombre = computed(() => user.value?.displayName ?? '')
  const puedeVer = computed(() => !!role.value && canViewCompras(role.value))
  /** Cotiza, elige proveedor, envía a autorización y registra la compra. */
  const puedeCotizar = computed(() => !!role.value && canQuote(role.value))
  /** Rol que decide la autorización desde la app: SOLO finanzas (además debe estar ligado a un aprobador con tope suficiente: `puedeDecidirFolio`). */
  const puedeAprobar = computed(() => !!role.value && canApproveFinanzas(role.value))
  const esFinanzas = computed(() => role.value === 'finanzas')
  /** Dirección (admin): consulta todo y recibe avisos, pero NO aprueba. */
  const esDireccion = computed(() => role.value === 'admin')
  const esAdmin = esDireccion
  const puedeFondear = computed(() => !!role.value && canFundCaja(role.value))
  /** Cuentas por pagar: registra el pago de las compras por transferencia o tarjeta. */
  const puedePagar = computed(() => !!role.value && canRegistrarPago(role.value))
  /** Ve la CLABE completa de un proveedor (Cuentas por pagar, Finanzas y Dirección). */
  const verClabe = computed(() => !!role.value && canViewClabe(role.value))
  const puedeConfirmarRecepcion = computed(() => !!role.value && canConfirmRecepcion(role.value))
  /** Correos: Dirección, Finanzas y Adquisiciones. */
  const puedeVerCorreos = computed(() => role.value === 'admin' || role.value === 'finanzas' || role.value === 'adquisiciones')
  /** Puede levantar una requisición desde la app. */
  const puedeCrear = computed(() => role.value === 'admin' || role.value === 'adquisiciones' || role.value === 'capturista' || role.value === 'mantenimiento')
  /** Dominio de inventario del custodio (admin: todos). */
  const destinoCustodio = computed(() => (role.value === 'capturista' ? 'ti' : role.value === 'mantenimiento' ? 'mantenimiento' : undefined))
  /** Ve montos de cotizaciones/compras/autorizaciones de cada requisición (el custodio no). */
  const verDinero = computed(() => !!role.value && canViewComprasDinero(role.value))
  /** Ve los indicadores globales de gasto (monto autorizado/gastado, ahorro) y Reportes: Dirección y Finanzas. */
  const verGlobal = computed(() => !!role.value && canViewComprasGlobal(role.value))
  /** Pestañas del detalle de una requisición que el rol puede abrir. */
  const pestanas = computed(() => (role.value ? pestanasRequisicion(role.value) : []))
  return { verDinero, verGlobal, pestanas, user, role, nombre, puedeVer, puedeCotizar, puedeAprobar, esFinanzas, esDireccion, esAdmin, puedeFondear, puedePagar, verClabe, puedeConfirmarRecepcion, puedeVerCorreos, puedeCrear, destinoCustodio }
}
