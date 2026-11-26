# Plataforma DGA · Inventarios (Sistemas y Mantenimiento) — versión Quasar

**Vue 3 + Quasar (app-vite) + JavaScript.** Habla con la API Laravel + MySQL (`/api`). Reemplaza a la primera versión en React (archivada, no se entrega), operada por dos personas, cada una en su dominio (TI y Mantenimiento).

* Despliegue en el dominio de la empresa → **[DEPLOY.md](DEPLOY.md)**.
* Roles: `capturista` (Uriel, Líder de TI: opera **Sistemas**), `mantenimiento` (Gerencia de Mantenimiento: opera **Mantenimiento**), `admin` (Dirección: todo), `adquisiciones` (Analista de Adquisiciones: cotiza/compra y carga stock en ambos dominios), `finanzas` (aprueba compras y ve la bitácora; inventario solo lectura), `tesoreria` (entrega el efectivo de caja chica de las compras de efectivo; inventario solo lectura), `cuentas_por_pagar` (paga las compras por transferencia o tarjeta y mantiene el catálogo de proveedores; sin inventario), `talento` (solo lectura: responsivas, equipos por responsable, cargos por pérdida; administra el directorio) y `solicitante` (solo lectura + solicitudes). **Nada se borra:** todo se da de baja, se cancela o se desactiva, y cada cambio queda en una bitácora inmutable (ver DEPLOY.md). Cada operador da de alta su propio stock; los datos de compra de lo ya registrado solo los cambia Dirección/Adquisiciones.

## Arranque en desarrollo
```bash
npm install
npm run dev        # http://localhost:9000  (modo demo, sin backend)
npm run build      # genera dist/spa
npm run test:compras   # reglas de Compras en modo local (325 comprobaciones)
npm run test:api       # cliente de la API (182 comprobaciones)
```
Usuarios demo (solo en `npm run dev`): `admin`, `soporte` (Uriel, TI), `mantenimiento`, `adquisiciones`, `finanzas`, `tesoreria`, `cuentas` (Cuentas por pagar), `talento`, `solicitante` — contraseña visible en la pantalla de login.
# vaultapp
