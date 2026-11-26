import { user } from '../lib/auth'
import { canViewSeccion } from '../lib/access'

/** Guarda por rol (además de ocultar el ítem del menú): quien no puede usar la pantalla vuelve a su Inicio ('/'). */
const soloRol = (puede) => () => (user.value && puede(user.value.role) ? true : '/')
/** Guarda por sección: usa el MISMO helper que el menú lateral (`canViewSeccion` en lib/access.js). */
const seccion = (id) => soloRol((role) => canViewSeccion(role, id))

const routes = [
  // Públicas (sin sesión)
  { path: '/login', component: () => import('pages/LoginPage.vue') },
  { path: '/solicitar', component: () => import('pages/publico/SolicitarPage.vue') },
  // Compras Indirectas (rutas = RUTAS_COMPRAS de src/lib/compras/tipos.js)
  { path: '/compras/nueva', component: () => import('pages/publico/SolicitarCompraPage.vue') },
  { path: '/compras/estatus/:folio/:token', component: () => import('pages/publico/SeguimientoPage.vue') },
  { path: '/compras/aprobar/:token', component: () => import('pages/publico/AprobarPage.vue') },
  { path: '/auditar/:token', component: () => import('pages/publico/AuditarPage.vue') },
  { path: '/verificar/equipo/:id', component: () => import('pages/publico/VerificarEquipoPage.vue') },
  { path: '/verificar/material/:id', component: () => import('pages/publico/VerificarMaterialPage.vue') },

  // Privadas (requieren sesión; el guard de router/index.js también carga las cachés de datos)
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('pages/HomePage.vue') },
      { path: 'sistemas', component: () => import('pages/SistemasPage.vue'), beforeEnter: seccion('sistemas') },
      { path: 'mantenimiento', component: () => import('pages/MantenimientoPage.vue'), beforeEnter: seccion('mantenimiento') },
      { path: 'solicitudes', component: () => import('pages/SolicitudesPage.vue'), beforeEnter: seccion('solicitudes') },
      { path: 'compras', component: () => import('pages/ComprasPage.vue'), beforeEnter: seccion('compras') },
      { path: 'compras/requisicion/:folio', component: () => import('pages/RequisicionPage.vue'), beforeEnter: seccion('compras') },
      // Catálogo de proveedores: Adquisiciones, Finanzas, Tesorería, Cuentas por pagar y Dirección (los demás vuelven a su Inicio, también por URL).
      { path: 'proveedores', component: () => import('pages/ProveedoresPage.vue'), beforeEnter: seccion('proveedores') },
      { path: 'auditorias', component: () => import('pages/AuditoriasPage.vue'), beforeEnter: seccion('auditorias') },
      { path: 'directorio', component: () => import('pages/DirectorioPage.vue'), beforeEnter: seccion('directorio') },
      { path: 'bitacora', component: () => import('pages/BitacoraPage.vue'), beforeEnter: seccion('bitacora') },
    ],
  },

  { path: '/:catchAll(.*)*', redirect: '/' },
]

export default routes
