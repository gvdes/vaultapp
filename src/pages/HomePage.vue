<template>
  <div class="mx-auto flex h-full max-w-6xl flex-col px-4 py-6 sm:px-6">
    <div class="animate-fade-in-up mb-1 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 class="text-lg font-extrabold text-text">Hola, {{ user?.displayName }}</h1>
        <p class="text-[13px] text-text-muted">{{ vista.subtitulo }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label v-if="vista.kpisInventario" class="flex items-center gap-2 text-[12px] font-semibold text-text-muted">
          <span>Sucursal</span>
          <select
            v-model="scope"
            class="h-9 max-w-[16rem] rounded-lg border border-border bg-surface px-3 text-[12px] font-bold text-text outline-none transition-colors hover:bg-surface-hover focus:border-vz-blue"
            aria-label="Filtrar tablero por sucursal"
          >
            <option value="todas">Todas las sucursales</option>
            <optgroup v-for="g in gruposUbicacion" :key="g.label" :label="g.label">
              <option v-for="u in g.items" :key="u.id" :value="u.id">{{ u.nombre }}</option>
            </optgroup>
          </select>
        </label>
        <button
          v-if="enSucursal"
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-lg bg-vz-blue px-3 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
          :title="`Todo lo que tiene esta sucursal en ${nombreDominio}, con filtros`"
          @click="verFicha = true"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.6a2 2 0 011.4.6l4.8 4.8a2 2 0 01.6 1.4V19a2 2 0 01-2 2z" /></svg>
          Ver ficha completa
        </button>
        <button
          v-if="puedeSnapshot"
          type="button"
          class="h-9 rounded-lg border border-border bg-surface px-3 text-[12px] font-bold text-text hover:bg-surface-hover"
          @click="handleSnapshot"
        >
          Guardar snapshot de hoy
        </button>
      </div>
    </div>
    <p v-if="enSucursal" class="animate-fade-in-scale mt-1 text-[12px] font-semibold text-vz-blue">
      Mostrando solo: {{ nombreScope }}
      <button type="button" class="ml-2 underline" @click="scope = 'todas'">Ver todas</button>
    </p>
    <SucursalFicha v-if="verFicha && enSucursal && vista.mapa" :ubicacion-ids="[scope]" :dominio-fijo="vista.dominio" @close="verFicha = false" />

    <MisPendientes v-if="vista.pendientes" />

    <StockResumen v-if="vista.stock" />

    <div v-if="vista.kpisInventario" class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="animate-fade-in-up">
        <KpiCard
          :label="vista.dominio ? `Valor de inventario de ${nombreDominio}` : 'Valor total de inventario'"
          :amount="totalValor"
          :format="fmtMoney"
          :hint="enSucursal ? `${nombreDominio} de la sucursal` : nombreDominio"
          accent="linear-gradient(90deg, #1F5FAE, #0FA391)"
        />
      </div>
      <div class="animate-fade-in-up" style="animation-delay: 60ms">
        <KpiCard v-if="vista.dominio === 'sistemas'" label="Equipos dañados o en reparación" :amount="danados" :tone="danados > 0 ? 'warning' : 'success'" hint="Fuera de servicio" />
        <KpiCard v-else label="Materiales bajo el mínimo" :amount="bajoMinimo" :tone="bajoMinimo > 0 ? 'danger' : 'success'" hint="Alertas de reposición" />
      </div>
      <div class="animate-fade-in-up" style="animation-delay: 120ms">
        <KpiCard label="Solicitudes pendientes" :amount="pendientes" :tone="pendientes > 0 ? 'warning' : 'success'" :hint="`${pendientesCompra} en espera de compra`" />
      </div>
      <div class="animate-fade-in-up" style="animation-delay: 180ms">
        <KpiCard
          :label="`Pérdidas ${anioActual}`"
          :amount="perdidasAnio"
          :format="fmtMoney"
          :tone="perdidasAnio > 0 ? 'warning' : 'success'"
          hint="Cobrado por baja de pérdida/robo"
        />
      </div>
    </div>

    <section v-if="vista.compras" class="animate-fade-in-up mt-4" style="animation-delay: 190ms" aria-labelledby="compras-franja-titulo">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="compras-franja-titulo" class="text-[14px] font-extrabold text-text">Compras Indirectas</h2>
          <p class="text-[11.5px] text-text-muted">{{ vista.compras === 'completa' ? 'Requisiciones en curso, dinero del mes y ahorro por cotización (global, no cambia con la sucursal).' : 'Requisiciones en curso por etapa.' }}</p>
        </div>
        <router-link to="/compras" class="flex h-8 items-center gap-1 rounded-lg bg-vz-blue px-3 text-[12px] font-bold text-white no-underline transition-opacity hover:opacity-90">
          Ir a Compras
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </router-link>
      </div>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <router-link
          v-for="(t, i) in tilesCompras"
          :key="t.id"
          :to="t.to"
          class="animate-fade-in-up flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-surface p-3 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-hover hover:shadow-md"
          :style="{ animationDelay: `${220 + i * 50}ms` }"
        >
          <span class="truncate text-[11.5px] font-semibold text-text-muted" :title="t.label">{{ t.label }}</span>
          <span :class="`text-xl font-extrabold ${t.clase}`"><AnimatedNumber :value="t.valor" :format="t.formato" /></span>
          <span class="truncate text-[10.5px] text-text-soft" :title="t.hint">{{ t.hint }}</span>
        </router-link>
        <router-link
          v-if="vista.compras === 'completa'"
          to="/compras"
          class="animate-fade-in-up col-span-2 flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface p-3 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-hover hover:shadow-md"
          :style="{ animationDelay: `${220 + tilesCompras.length * 50}ms` }"
        >
          <span class="text-[11.5px] font-semibold text-text-muted">Autorizado vs. gastado · este mes</span>
          <div class="flex items-end justify-between gap-2">
            <span class="text-xl font-extrabold text-text"><AnimatedNumber :value="resumenCompras.autorizadoMes" :format="fmtMoney" /></span>
            <span class="text-[13px] font-extrabold" :class="gastoSobreAutorizado ? 'text-vz-danger' : 'text-vz-teal-2'"><AnimatedNumber :value="resumenCompras.gastadoMes" :format="fmtMoney" /></span>
          </div>
          <div
            class="h-2 overflow-hidden rounded-full bg-bg"
            role="progressbar"
            aria-label="Gastado del mes contra autorizado del mes"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="pctGastado"
          >
            <div class="h-full rounded-full transition-[width] duration-1000 ease-out motion-reduce:transition-none" :class="gastoSobreAutorizado ? 'bg-vz-danger' : 'bg-vz-teal-2'" :style="{ width: `${barsOn ? pctGastado : 0}%` }" />
          </div>
          <span class="truncate text-[10.5px] text-text-soft">Autorizado (izq.) · gastado (der.){{ resumenCompras.autorizadoMes > 0 ? ` · ${pctGastadoReal}%` : '' }}</span>
        </router-link>
      </div>
    </section>

    <section v-if="vista.alertas" class="animate-fade-in-up mt-4" style="animation-delay: 200ms" aria-labelledby="alertas-control-titulo">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="alertas-control-titulo" class="text-[14px] font-extrabold text-text">Alertas de control</h2>
          <p class="text-[11.5px] text-text-muted">
            {{ alertasSubtitulo }}{{ enSucursal ? ` · ${nombreScope}` : '' }}.
          </p>
        </div>
        <div v-if="alertas.length > 0" class="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
          <span v-for="g in gruposAlerta" :key="g.severidad" :class="`rounded-full border px-2 py-0.5 ${ALERTA_ESTILO[g.severidad].chip}`">
            {{ g.label }} · {{ g.alertas.length }}
          </span>
        </div>
      </div>

      <div v-if="alertas.length === 0" class="animate-fade-in-scale flex items-center gap-2 rounded-xl border border-vz-success/30 bg-vz-success/5 px-4 py-3 text-[13px] font-semibold text-vz-success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5 shrink-0" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Sin alertas: todo en orden
      </div>

      <div v-else class="flex flex-col gap-3">
        <div v-for="g in gruposAlerta" :key="g.severidad">
          <p :class="`mb-1.5 text-[11px] font-extrabold uppercase tracking-wide ${ALERTA_ESTILO[g.severidad].titulo}`">{{ g.label }} · {{ g.alertas.length }}</p>
          <div class="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <div
              v-for="a in g.alertas"
              :key="a.id"
              :class="`self-start rounded-xl border p-3 transition-shadow duration-200 hover:shadow-md ${ALERTA_ESTILO[a.severidad].card}`"
            >
              <button
                type="button"
                class="flex w-full items-start gap-3 text-left"
                :aria-expanded="alertaAbierta(a.id)"
                :aria-controls="`alerta-${a.id}`"
                @click="toggleAlerta(a.id)"
              >
                <span :class="`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-[13px] font-extrabold ${ALERTA_ESTILO[a.severidad].badge}`">{{ a.conteo }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[13px] font-bold text-text">
                    <span v-if="a.origen === 'compras'" class="mr-1.5 rounded bg-vz-gold/20 px-1.5 py-px align-middle text-[9.5px] font-extrabold uppercase tracking-wide text-vz-gold">Compras</span>{{ a.titulo }}
                  </span>
                  <span class="mt-0.5 block text-[12px] text-text-muted">{{ a.detalle }}</span>
                  <span v-if="a.valor" class="mt-1 block text-[11px] font-semibold text-text-soft">Monto involucrado: {{ fmtMoney(a.valor) }}</span>
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  :class="`mt-1 h-4 w-4 shrink-0 text-text-soft transition-transform duration-200 ${alertaAbierta(a.id) ? 'rotate-180' : ''}`"
                  aria-hidden="true"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              <ul v-if="alertaAbierta(a.id)" :id="`alerta-${a.id}`" class="animate-fade-in-scale mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto border-t border-border/60 pt-2">
                <li v-for="(it, i) in a.items" :key="i" class="text-[12px] text-text-muted">
                  <router-link v-if="it.ruta" :to="it.ruta" class="text-text-muted underline decoration-border underline-offset-2 hover:text-vz-blue">{{ it.texto }}</router-link>
                  <template v-else>{{ it.texto }}</template>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="indicadores.length > 0" class="animate-fade-in-up mt-4" style="animation-delay: 240ms" aria-labelledby="indicadores-proceso-titulo">
      <div class="mb-2">
        <h2 id="indicadores-proceso-titulo" class="text-[14px] font-extrabold text-text">Indicadores del proceso</h2>
        <p class="text-[11.5px] text-text-muted">
          GV-INF-008 Inventario y Control de Equipo Informático · GV-FIN-ADQ-001 Adquisiciones{{ enSucursal ? ' · globales (no cambian con la sucursal)' : '' }}.
        </p>
      </div>
      <div class="rounded-xl border border-border bg-surface px-4">
        <div v-for="ind in indicadores" :key="ind.id" class="border-b border-border/60 py-3 last:border-0">
          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p class="text-[13px] font-bold text-text">{{ ind.nombre }}</p>
            <div class="flex items-center gap-2">
              <span :class="`text-[15px] font-extrabold ${INDICADOR_ESTILO[estadoIndicador(ind)].texto}`">{{ ind.valor === null ? 'Sin datos' : `${ind.valor}${ind.unidad}` }}</span>
              <span :class="`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${INDICADOR_ESTILO[estadoIndicador(ind)].pill}`">{{ INDICADOR_ESTILO[estadoIndicador(ind)].etiqueta }}</span>
            </div>
          </div>
          <div
            class="relative mt-2 h-2.5 rounded-full bg-bg"
            role="progressbar"
            :aria-label="ind.nombre"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="ind.valor ?? undefined"
            :aria-valuetext="ind.valor === null ? 'Sin datos' : `${ind.valor}${ind.unidad} de meta ${ind.meta}${ind.unidad}`"
          >
            <div
              v-if="ind.valor !== null"
              :class="`h-full rounded-full transition-[width] duration-1000 ease-out motion-reduce:transition-none ${INDICADOR_ESTILO[estadoIndicador(ind)].barra}`"
              :style="{ width: `${barsOn ? Math.max(0, Math.min(100, ind.valor)) : 0}%` }"
            />
            <span class="absolute -top-0.5 h-3.5 w-0.5 rounded bg-text/60" :style="{ left: `${Math.min(100, ind.meta)}%` }" :title="`Meta ${ind.meta}${ind.unidad}`" />
          </div>
          <p class="mt-1.5 text-[11px] text-text-soft">Meta {{ ind.meta }}{{ ind.unidad }} · {{ ind.detalle }}</p>
        </div>
      </div>
    </section>

    <div v-if="vista.mapa" class="animate-fade-in-up mt-4" style="animation-delay: 280ms">
      <SucursalesMapa :dominio-fijo="vista.dominio" />
    </div>

    <div
      v-if="vista.dineroInventario && invertidoTotal > 0"
      class="animate-fade-in-up mt-3 rounded-xl border border-border bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      style="animation-delay: 260ms"
    >
      <h3 class="mb-3 text-[13px] font-bold text-text">Balance de inversión</h3>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p class="text-[11px] text-text-muted">Invertido originalmente</p>
          <p class="text-xl font-extrabold text-text"><AnimatedNumber :value="invertidoTotal" :format="fmtMoney" /></p>
        </div>
        <div>
          <p class="text-[11px] text-text-muted">Valor actual</p>
          <p class="text-xl font-extrabold text-vz-teal-2"><AnimatedNumber :value="totalValor" :format="fmtMoney" /></p>
        </div>
        <div class="col-span-2 sm:col-span-1">
          <p class="text-[11px] text-text-muted">Depreciado / consumido</p>
          <p class="text-xl font-extrabold text-vz-warning"><AnimatedNumber :value="Math.max(0, invertidoTotal - totalValor)" :format="fmtMoney" /></p>
        </div>
      </div>
      <div class="mt-3 h-2.5 overflow-hidden rounded-full bg-bg">
        <div class="h-full bg-vz-teal-2 transition-[width] duration-1000 ease-out motion-reduce:transition-none" :style="{ width: `${barsOn ? Math.min(100, pctRetenido) : 0}%` }" />
      </div>
      <p class="mt-1.5 text-[11px] text-text-soft">Se conserva el {{ pctRetenido }}% del valor invertido a la fecha.</p>
    </div>

    <div
      v-if="vista.dineroInventario && !vista.dominio && totalValor > 0"
      class="animate-fade-in-up mt-3 rounded-xl border border-border bg-surface p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      style="animation-delay: 300ms"
    >
      <div class="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-text-muted">
        <span>Sistemas · {{ pctSistemas }}%</span>
        <span>Mantenimiento · {{ 100 - pctSistemas }}%</span>
      </div>
      <div class="flex h-2.5 overflow-hidden rounded-full bg-bg">
        <div class="h-full bg-vz-blue transition-[width] duration-1000 ease-out motion-reduce:transition-none" :style="{ width: `${barsOn ? pctSistemas : 0}%` }" />
        <div class="h-full bg-vz-gold transition-[width] duration-1000 ease-out motion-reduce:transition-none" :style="{ width: `${barsOn ? 100 - pctSistemas : 0}%` }" />
      </div>
    </div>

    <div v-if="vista.accesos" class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <router-link
        v-if="verSistemas"
        to="/sistemas"
        class="animate-fade-in-up group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-6 no-underline shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
        style="animation-delay: 340ms"
      >
        <span class="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-vz-blue to-vz-teal-2" />
        <div class="flex h-12 w-12 items-center justify-center rounded-xl text-white transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3" style="background: linear-gradient(135deg, #1f5fae 0%, #0fa391 100%)">
          <InventarioIcon id="pc" class="h-7 w-7" />
        </div>
        <div>
          <h2 class="text-[16px] font-extrabold text-text">Inventario de Sistemas</h2>
          <p class="mt-1 text-[13px] text-text-muted">Celulares, radios, laptops, PC, monitores, cámaras y más.</p>
        </div>
        <div class="mt-1 text-[14px] font-extrabold text-vz-blue">{{ equiposSistemasCount }} equipos · {{ currency.format(valorSistemas) }}</div>
      </router-link>

      <router-link
        v-if="verMantenimiento"
        to="/mantenimiento"
        class="animate-fade-in-up group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-6 no-underline shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
        style="animation-delay: 380ms"
      >
        <span class="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-vz-gold to-vz-warning" />
        <div class="flex h-12 w-12 items-center justify-center rounded-xl text-white transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" style="background: linear-gradient(135deg, #c8a24b 0%, #e3a517 100%)">
          <InventarioIcon id="herramienta" class="h-7 w-7" />
        </div>
        <div>
          <h2 class="text-[16px] font-extrabold text-text">Inventario de Mantenimiento</h2>
          <p class="mt-1 text-[13px] text-text-muted">Herramienta, refacciones, materiales y consumibles.</p>
        </div>
        <div class="mt-1 text-[14px] font-extrabold text-vz-gold">{{ currency.format(valorMantenimiento) }}</div>
      </router-link>
    </div>

    <router-link
      v-if="verSolicitudes"
      to="/solicitudes"
      class="animate-fade-in-up mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5 no-underline shadow-sm transition-all hover:-translate-y-0.5 hover:bg-surface-hover hover:shadow-md"
      style="animation-delay: 420ms"
    >
      <div>
        <h2 class="text-[14px] font-extrabold text-text">Solicitudes de equipo y reparación</h2>
        <p class="mt-0.5 text-[12px] text-text-muted">Ver la cola de solicitudes o levantar una nueva.</p>
      </div>
      <span class="flex h-8 items-center rounded-full bg-vz-blue px-3 text-[12px] font-bold text-white">Ver solicitudes</span>
    </router-link>

    <div v-if="vista.actividad || vista.comprasGrafico" class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div v-if="mostrarTendencia" class="animate-fade-in-up transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" style="animation-delay: 460ms">
        <ChartCard title="Tendencia de valor total" filename="tendencia-valor">
          <Line :data="lineData" :options="lineOptions" />
        </ChartCard>
      </div>

      <div v-if="vista.actividad && porEstado.length > 0" class="animate-fade-in-up transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" style="animation-delay: 500ms">
        <ChartCard title="Equipos por estado" filename="equipos-por-estado">
          <div class="flex h-full flex-col">
            <div class="min-h-0 flex-1">
              <Doughnut :data="doughnutData" :options="doughnutOptions" />
            </div>
            <div class="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]">
              <span v-for="p in porEstado" :key="p.estado" class="flex items-center gap-1 text-text-muted">
                <span class="h-2 w-2 rounded-full" :style="{ background: ESTADO_COLOR[p.estado] }" />
                {{ ESTADO_LABEL[p.estado] ?? p.estado }} ({{ p.cantidad }})
              </span>
            </div>
          </div>
        </ChartCard>
      </div>

      <div v-if="vista.dineroInventario && valorPorFamilia.length > 0" class="animate-fade-in-up transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" style="animation-delay: 540ms">
        <ChartCard :title="enSucursal ? `Valor por familia · ${nombreScope}` : 'Valor por familia'" filename="valor-por-familia">
          <div class="flex h-full flex-col">
            <div class="min-h-0 flex-1">
              <Bar :data="familiaBarData" :options="familiaBarOptions" />
            </div>
            <div class="mt-2 flex justify-center gap-4 text-[11px] text-text-muted">
              <span v-if="dom !== 'mantenimiento'" class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-vz-blue" />Sistemas</span>
              <span v-if="dom !== 'sistemas'" class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-vz-gold" />Mantenimiento</span>
            </div>
          </div>
        </ChartCard>
      </div>

      <div v-if="vista.comprasGrafico && comprasGrafico.labels.length > 0" class="animate-fade-in-up transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" style="animation-delay: 560ms">
        <ChartCard :title="`Requisiciones de compras por ${vistaCompras === 'estado' ? 'estado' : 'área'}`" filename="requisiciones-compras">
          <div class="flex h-full flex-col">
            <div class="mb-1 flex justify-end gap-1" role="group" aria-label="Agrupar requisiciones por">
              <button
                v-for="v in ['estado', 'area']"
                :key="v"
                type="button"
                :aria-pressed="vistaCompras === v"
                :class="`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${vistaCompras === v ? 'border-vz-blue bg-vz-blue text-white' : 'border-border text-text-muted hover:bg-surface-hover'}`"
                @click="vistaCompras = v"
              >
                {{ v === 'estado' ? 'Por estado' : 'Por área' }}
              </button>
            </div>
            <div class="min-h-0 flex-1">
              <Bar :data="comprasBarData" :options="comprasBarOptions" />
            </div>
          </div>
        </ChartCard>
      </div>

      <div v-if="vista.actividad && solicitudesPorMes.some((s) => s.cantidad > 0)" class="animate-fade-in-up transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" style="animation-delay: 580ms">
        <ChartCard title="Solicitudes creadas por mes" filename="solicitudes-por-mes">
          <Bar :data="barData" :options="barOptions" />
        </ChartCard>
      </div>
    </div>

    <div v-if="vista.actividad" class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div
        v-if="vista.dineroInventario && !enSucursal && valorPorUbicacion.length > 0"
        class="animate-fade-in-up rounded-xl border border-border bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
        style="animation-delay: 620ms"
      >
        <h3 class="mb-3 text-[13px] font-bold text-text">Top 5 ubicaciones por valor actual</h3>
        <div class="flex flex-col gap-2">
          <div v-for="(u, i) in valorPorUbicacion" :key="u.nombre" class="flex items-center justify-between gap-2 text-[12.5px]">
            <span class="flex min-w-0 items-center gap-2 text-text-muted">
              <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg text-[10px] font-bold text-text-soft">{{ i + 1 }}</span>
              <span class="truncate">{{ u.nombre }}</span>
            </span>
            <span class="shrink-0 font-bold text-text">{{ currency.format(u.valor) }}</span>
          </div>
        </div>
      </div>

      <div
        class="animate-fade-in-up rounded-xl border border-border bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
        :class="enSucursal || !vista.dineroInventario || valorPorUbicacion.length === 0 ? 'lg:col-span-2' : ''"
        style="animation-delay: 660ms"
      >
        <h3 class="mb-3 text-[13px] font-bold text-text">Actividad reciente{{ enSucursal ? ` · ${nombreScope}` : '' }}</h3>
        <div class="flex flex-col gap-2">
          <p v-if="actividad.length === 0" class="text-[12px] text-text-soft">Sin actividad todavía.</p>
          <div v-for="a in actividad" :key="a.id" class="flex items-start justify-between gap-2 border-b border-border/60 pb-2 text-[12px] last:border-0 last:pb-0">
            <span class="text-text-muted">{{ a.texto }}</span>
            <span class="shrink-0 text-text-soft">{{ new Date(a.fecha).toLocaleDateString('es-MX') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Bar, Doughnut, Line } from 'vue-chartjs'
import { bump } from 'src/lib/reactive'
import { useAuth } from 'src/lib/auth'
import { canViewInventario, canViewSolicitudes, homeSecciones } from 'src/lib/access'
import { useToast } from 'src/composables/useToast'
import { useTheme } from 'src/composables/useTheme'
import KpiCard from 'components/KpiCard.vue'
import ChartCard from 'components/ChartCard.vue'
import InventarioIcon from 'components/InventarioIcon.vue'
import AnimatedNumber from 'components/AnimatedNumber.vue'
import SucursalesMapa from 'components/SucursalesMapa.vue'
import SucursalFicha from 'components/SucursalFicha.vue'
import MisPendientes from 'components/MisPendientes.vue'
import StockResumen from 'components/StockResumen.vue'
import { getResumenCompras, requisicionesPorArea, requisicionesPorEstado } from 'src/lib/misPendientes'
import { getUbicacion, getFamilia, listUbicaciones } from 'src/lib/inventario/comunes'
import { listEquipos, getEquipo, listMovimientos } from 'src/lib/inventario/sistemas'
import { materialesBajoMinimo, listMateriales, listEntradas, listSalidas, listConsumos, getMaterial } from 'src/lib/inventario/mantenimiento'
import { valorOriginalSistemas, valorActualSistemas } from 'src/lib/inventario/analisisSistemas'
import { calcularValorDepreciado } from 'src/lib/inventario/depreciacion'
import { valorOriginalMantenimiento, valorTotalMantenimiento } from 'src/lib/inventario/analisisMantenimiento'
import { listSolicitudes } from 'src/lib/inventario/solicitudes'
import { listValuacionSnapshots, guardarValuacionSnapshot } from 'src/lib/inventario/valuacionSnapshots'
import { listCargosPerdida } from 'src/lib/inventario/cargosPerdida'
import { getActividadReciente } from 'src/lib/actividadReciente'
import { getAlertasRol, getIndicadoresRol } from 'src/lib/alertasRol'

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const fmtMoney = (n) => currency.format(Math.round(n))
const compactMoney = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 })

const ESTADO_LABEL = {
  disponible: 'Disponible',
  asignado: 'Asignado',
  danado: 'Dañado',
  en_reparacion: 'En reparación',
  baja: 'Baja',
}
const ESTADO_COLOR = {
  disponible: '#12A66B',
  asignado: '#1F5FAE',
  danado: '#B0413F',
  en_reparacion: '#E3A517',
  baja: '#7C8B96',
}

const { user } = useAuth()
const toast = useToast()
const { theme } = useTheme()
// Qué trae el Inicio de cada rol (secciones y dominio): todo sale de homeSecciones() en lib/access.js. Los datos de abajo
// se filtran con ese mismo alcance (`dom`), no solo se oculta la tarjeta.
const rol = computed(() => user.value?.role ?? 'solicitante')
const vista = computed(() => homeSecciones(rol.value))
const dom = computed(() => vista.value.dominio)
const enDom = (familiaId) => !dom.value || getFamilia(familiaId)?.tipo === dom.value
const nombreDominio = computed(() => (dom.value === 'sistemas' ? 'Sistemas' : dom.value === 'mantenimiento' ? 'Mantenimiento' : 'Sistemas + Mantenimiento'))
const verSistemas = computed(() => canViewInventario(rol.value, 'sistemas'))
const verMantenimiento = computed(() => canViewInventario(rol.value, 'mantenimiento'))
const verSolicitudes = computed(() => canViewSolicitudes(rol.value))
// El snapshot guarda el valor TOTAL global (ambos dominios): solo lo guarda Dirección.
const puedeSnapshot = computed(() => rol.value === 'admin')
const refresh = () => bump()

const reducedMotion = (() => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
})()

// Barras que "crecen" al entrar: arrancan en 0 y pasan a su valor tras el primer pintado.
const barsOn = ref(reducedMotion)
onMounted(() => {
  if (!barsOn.value) requestAnimationFrame(() => requestAnimationFrame(() => (barsOn.value = true)))
})

// ---- Compras Indirectas: franja de resumen (roles con acceso al módulo) y gráfico de Dirección ----
const resumenCompras = computed(() => getResumenCompras())
const tilesCompras = computed(() => {
  const r = resumenCompras.value
  const n = (v) => String(Math.round(v))
  const tiles = [
    { id: 'abiertas', label: 'Abiertas', valor: r.abiertas, formato: n, clase: 'text-text', hint: 'Requisiciones en curso', to: '/compras?abiertas=1' },
    { id: 'por-autorizar', label: 'Por autorizar', valor: r.porAutorizar, formato: n, clase: r.porAutorizar > 0 ? 'text-vz-warning' : 'text-text', hint: 'Esperan a Finanzas', to: '/compras?estado=en_autorizacion' },
    { id: 'por-fondear', label: 'Por fondear', valor: r.porFondear, formato: n, clase: r.porFondear > 0 ? 'text-vz-warning' : 'text-text', hint: 'Esperan a Tesorería', to: '/compras?estado=autorizada' },
    { id: 'semana', label: 'Compradas esta semana', valor: r.compradasSemana, formato: n, clase: 'text-vz-success', hint: 'Desde el lunes', to: '/compras?estado=comprada' },
    { id: 'ahorro', label: 'Ahorro por cotización', valor: r.ahorroMes, formato: fmtMoney, clase: r.ahorroMes > 0 ? 'text-vz-success' : 'text-text', hint: 'Este mes vs. promedio cotizado', to: '/compras' },
  ]
  // Adquisiciones ve cantidades de requisiciones, no indicadores de gasto/ahorro.
  return vista.value.compras === 'completa' ? tiles : tiles.filter((t) => t.id !== 'ahorro')
})
const pctGastadoReal = computed(() => (resumenCompras.value.autorizadoMes > 0 ? Math.round((resumenCompras.value.gastadoMes / resumenCompras.value.autorizadoMes) * 100) : 0))
const pctGastado = computed(() => Math.max(0, Math.min(100, pctGastadoReal.value)))
const gastoSobreAutorizado = computed(() => resumenCompras.value.autorizadoMes > 0 && resumenCompras.value.gastadoMes > resumenCompras.value.autorizadoMes + 0.5)
const vistaCompras = ref('estado')

// ---- Selector de sucursal ("todas" = números globales) ----
const scope = ref('todas')
const enSucursal = computed(() => scope.value !== 'todas')
const verFicha = ref(false)
const nombreScope = computed(() => getUbicacion(scope.value)?.nombre ?? scope.value)
const enScope = (ubicacionId) => !enSucursal.value || ubicacionId === scope.value

const gruposUbicacion = computed(() => {
  const ubis = [...listUbicaciones()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return [
    { label: 'Sucursales', items: ubis.filter((u) => u.tipo === 'sucursal') },
    { label: 'Cedis', items: ubis.filter((u) => u.tipo === 'cedis') },
    { label: 'Oficinas', items: ubis.filter((u) => u.tipo === 'oficina') },
  ].filter((g) => g.items.length > 0)
})

function valorEquipo(e) {
  const familia = getFamilia(e.familiaId)
  return familia ? calcularValorDepreciado(e, familia) : e.costoTotal
}

const equipos = computed(() => listEquipos().filter((e) => enDom(e.familiaId)))
const equiposScope = computed(() => equipos.value.filter((e) => enScope(e.ubicacionId)))
const equiposActivosScope = computed(() => equiposScope.value.filter((e) => e.estado !== 'baja'))
const materialesDominio = computed(() => listMateriales().filter((m) => enDom(m.familiaId)))
const materialesScope = computed(() => materialesDominio.value.filter((m) => enScope(m.ubicacionId)))

const valorSistemas = computed(() =>
  dom.value === 'mantenimiento' ? 0 :
  enSucursal.value
    ? equiposActivosScope.value.filter((e) => getFamilia(e.familiaId)?.tipo === 'sistemas').reduce((s, e) => s + valorEquipo(e), 0)
    : valorActualSistemas(),
)
const valorMantenimiento = computed(() =>
  dom.value === 'sistemas' ? 0 :
  enSucursal.value
    ? equiposActivosScope.value.filter((e) => getFamilia(e.familiaId)?.tipo === 'mantenimiento').reduce((s, e) => s + valorEquipo(e), 0) +
      materialesScope.value.reduce((s, m) => s + m.cantidadActual * (m.costoUnitario || 0), 0)
    : valorTotalMantenimiento(),
)
const equiposSistemasCount = computed(() => equiposActivosScope.value.filter((e) => getFamilia(e.familiaId)?.tipo === 'sistemas').length)

// Invertido: global = lo que ya calcula la lib. Por sucursal = costo de sus equipos (incluye bajas) + existencia actual
// de sus materiales + lo consumido (salidas) con destino a esa sucursal.
const invertidoTotal = computed(() => {
  if (!enSucursal.value) return (dom.value === 'mantenimiento' ? 0 : valorOriginalSistemas()) + (dom.value === 'sistemas' ? 0 : valorOriginalMantenimiento())
  const eq = equiposScope.value.reduce((s, e) => s + (e.costoTotal || 0), 0)
  const existencia = materialesScope.value.reduce((s, m) => s + m.cantidadActual * (m.costoUnitario || 0), 0)
  const consumido = dom.value === 'sistemas' ? 0 : listConsumos()
    .filter((s) => s.ubicacionDestinoId === scope.value)
    .reduce((s, sal) => s + sal.cantidad * (getMaterial(sal.materialId)?.costoUnitario ?? 0), 0)
  return eq + existencia + consumido
})

const bajoMinimo = computed(() => materialesBajoMinimo().filter((m) => enScope(m.ubicacionId) && enDom(m.familiaId)).length)
const danados = computed(() => equiposScope.value.filter((e) => e.estado === 'danado' || e.estado === 'en_reparacion').length)
const solicitudesScope = computed(() => listSolicitudes().filter((s) => enScope(s.ubicacionId) && (!dom.value || s.tipo === dom.value)))
const pendientesCompra = computed(() => solicitudesScope.value.filter((s) => s.estado === 'pendiente_compra').length)
const pendientes = computed(() => solicitudesScope.value.filter((s) => s.estado === 'pendiente' || s.estado === 'pendiente_compra').length)

const porEstado = computed(() =>
  Object.entries(
    equiposScope.value.reduce((acc, e) => {
      acc[e.estado] = (acc[e.estado] ?? 0) + 1
      return acc
    }, {}),
  ).map(([estado, cantidad]) => ({ estado, cantidad })),
)

const valorPorUbicacion = computed(() => {
  const valorPorUbicacionMap = new Map()
  equipos.value
    .filter((e) => e.estado !== 'baja')
    .forEach((e) => {
      if (!e.ubicacionId) return
      valorPorUbicacionMap.set(e.ubicacionId, (valorPorUbicacionMap.get(e.ubicacionId) ?? 0) + valorEquipo(e))
    })
  materialesDominio.value.forEach((m) => {
    if (!m.ubicacionId) return
    valorPorUbicacionMap.set(m.ubicacionId, (valorPorUbicacionMap.get(m.ubicacionId) ?? 0) + m.cantidadActual * m.costoUnitario)
  })
  return Array.from(valorPorUbicacionMap.entries())
    .map(([ubicacionId, valor]) => ({ nombre: getUbicacion(ubicacionId)?.nombre ?? ubicacionId, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5)
})

/** Valor actual por familia (equipos depreciados + materiales) en el alcance elegido, de mayor a menor. */
const valorPorFamilia = computed(() => {
  const mapa = new Map()
  equiposActivosScope.value.forEach((e) => mapa.set(e.familiaId, (mapa.get(e.familiaId) ?? 0) + valorEquipo(e)))
  materialesScope.value.forEach((m) => mapa.set(m.familiaId, (mapa.get(m.familiaId) ?? 0) + m.cantidadActual * (m.costoUnitario || 0)))
  return Array.from(mapa.entries())
    .map(([familiaId, valor]) => {
      const f = getFamilia(familiaId)
      return { nombre: f?.nombre ?? familiaId, tipo: f?.tipo ?? 'sistemas', valor }
    })
    .filter((x) => x.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 12)
})

const anioActual = new Date().getFullYear()
const perdidasAnio = computed(() =>
  listCargosPerdida()
    .filter((c) => new Date(c.fecha).getFullYear() === anioActual)
    .filter((c) => !dom.value || enDom(getEquipo(c.equipoId)?.familiaId))
    .filter((c) => !enSucursal.value || getEquipo(c.equipoId)?.ubicacionId === scope.value)
    .reduce((s, c) => s + c.valorCobrado, 0),
)

const solicitudesPorMes = computed(() => {
  const ahora = new Date()
  const buckets = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }), cantidad: 0 })
  }
  const porClave = new Map(buckets.map((b) => [b.key, b]))
  solicitudesScope.value.forEach((s) => {
    const d = new Date(s.createdAt)
    const bucket = porClave.get(`${d.getFullYear()}-${d.getMonth()}`)
    if (bucket) bucket.cantidad += 1
  })
  return buckets.map((b) => ({ mes: b.label, cantidad: b.cantidad }))
})

const snapshots = computed(() => listValuacionSnapshots('total'))
// Los snapshots guardan el total global, así que la tendencia solo aplica a "Todas".
const mostrarTendencia = computed(() => puedeSnapshot.value && !enSucursal.value && snapshots.value.length >= 2)

const actividad = computed(() => {
  if (!enSucursal.value) return getActividadReciente(8, dom.value)
  const id = scope.value
  const items = []
  listMovimientos().forEach((m) => {
    if (dom.value && !enDom(getEquipo(m.equipoId)?.familiaId)) return
    if (getEquipo(m.equipoId)?.ubicacionId !== id && m.ubicacionNuevaId !== id && m.ubicacionAnteriorId !== id) return
    const equipo = getEquipo(m.equipoId)
    items.push({ id: `mov-${m.id}`, fecha: m.fecha, texto: `${equipo?.modelo || equipo?.numeroSerie || 'Equipo'}: ${m.tipo.replace('_', ' ')}` })
  })
  listEntradas().forEach((e) => {
    const material = getMaterial(e.materialId)
    if (material?.ubicacionId !== id || !enDom(material.familiaId)) return
    items.push({ id: `ent-${e.id}`, fecha: e.createdAt, texto: `Entrada de ${material.nombre}: +${e.cantidad}` })
  })
  listSalidas().forEach((s) => {
    const material = getMaterial(s.materialId)
    if ((s.ubicacionDestinoId !== id && material?.ubicacionId !== id) || !enDom(material?.familiaId)) return
    items.push({ id: `sal-${s.id}`, fecha: s.createdAt, texto: `${s.tipo === 'traslado' ? 'Traslado' : 'Salida'} de ${material?.nombre ?? 'material'}: -${s.cantidad}` })
  })
  solicitudesScope.value.forEach((s) => {
    items.push({ id: `sol-${s.id}`, fecha: s.createdAt, texto: `Solicitud: ${s.descripcion} (${s.estado.replace('_', ' ')})` })
  })
  return items.sort((a, b) => b.fecha - a.fecha).slice(0, 8)
})

// ---- Alertas de control e indicadores del proceso ----
const ALERTA_ESTILO = {
  alta: { card: 'border-vz-danger/30 bg-vz-danger/5', badge: 'bg-vz-danger text-white', chip: 'border-vz-danger/30 bg-vz-danger/10 text-vz-danger', titulo: 'text-vz-danger' },
  media: { card: 'border-vz-warning/40 bg-vz-warning/5', badge: 'bg-vz-warning text-[#1a1300]', chip: 'border-vz-warning/40 bg-vz-warning/10 text-vz-warning', titulo: 'text-vz-warning' },
  baja: { card: 'border-vz-blue/25 bg-vz-blue/5', badge: 'bg-vz-blue text-white', chip: 'border-vz-blue/30 bg-vz-blue/10 text-vz-blue', titulo: 'text-vz-blue' },
}
const SEVERIDAD_LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' }

// Con una sucursal elegida, las alertas se calculan solo para esa ubicación (los indicadores siguen siendo globales).
// Cada rol ve solo alertas de su dominio o función; las de Compras y dinero global, Dirección y Finanzas (lib/access.js → alcanceAlertas).
const alertasSubtitulo = computed(() => (rol.value === 'admin' || rol.value === 'finanzas' ? 'Fugas de dinero, malas prácticas, robo hormiga y compras innecesarias' : 'Riesgos y faltas de control de tu inventario'))
const alertas = computed(() => (vista.value.alertas ? getAlertasRol(rol.value, enSucursal.value ? scope.value : undefined) : []))
const gruposAlerta = computed(() =>
  ['alta', 'media', 'baja']
    .map((severidad) => ({ severidad, label: SEVERIDAD_LABEL[severidad], alertas: alertas.value.filter((a) => a.severidad === severidad) }))
    .filter((g) => g.alertas.length > 0),
)
const alertasAbiertas = ref([])
const alertaAbierta = (id) => alertasAbiertas.value.includes(id)
function toggleAlerta(id) {
  alertasAbiertas.value = alertaAbierta(id) ? alertasAbiertas.value.filter((x) => x !== id) : [...alertasAbiertas.value, id]
}

/** @typedef {'ok' | 'warn' | 'bad' | 'sin'} EstadoIndicador */
const INDICADOR_ESTILO = {
  ok: { texto: 'text-vz-success', pill: 'bg-vz-success/15 text-vz-success', barra: 'bg-vz-success', etiqueta: 'Cumple' },
  warn: { texto: 'text-vz-warning', pill: 'bg-vz-warning/20 text-vz-warning', barra: 'bg-vz-warning', etiqueta: 'Cerca de la meta' },
  bad: { texto: 'text-vz-danger', pill: 'bg-vz-danger/15 text-vz-danger', barra: 'bg-vz-danger', etiqueta: 'Fuera de meta' },
  sin: { texto: 'text-text-soft', pill: 'bg-bg text-text-soft', barra: 'bg-border', etiqueta: 'Sin datos' },
}
/** Verde = cumple la meta; ámbar = a menos de 10 puntos; rojo = más lejos. */
function estadoIndicador(ind) {
  if (ind.valor === null || ind.cumple === null) return 'sin'
  if (ind.cumple) return 'ok'
  return ind.valor >= ind.meta - 10 ? 'warn' : 'bad'
}
const indicadores = computed(() => getIndicadoresRol(rol.value))

const totalValor = computed(() => valorSistemas.value + valorMantenimiento.value)
const pctSistemas = computed(() => (totalValor.value > 0 ? Math.round((valorSistemas.value / totalValor.value) * 100) : 0))
const pctRetenido = computed(() => (invertidoTotal.value > 0 ? Math.round((totalValor.value / invertidoTotal.value) * 100) : 100))

async function handleSnapshot() {
  // El snapshot siempre es del total global, aunque se esté viendo una sucursal.
  await guardarValuacionSnapshot(new Date().toLocaleDateString('es-MX'), 'total', valorActualSistemas() + valorTotalMantenimiento())
  toast('Snapshot de valuación guardado.')
  refresh()
}

// ---- Gráficos (Chart.js no lee variables CSS: se resuelven por tema) ----
const palette = computed(() =>
  theme.value === 'dark'
    ? { muted: '#9db3bc', border: '#1e3b47', surface: '#102530', text: '#e7eef1' }
    : { muted: '#5b7284', border: '#e2e8ee', surface: '#ffffff', text: '#0a2a35' },
)

const animacion = { duration: reducedMotion ? 0 : 900, easing: 'easeOutQuart' }

const tooltipBase = computed(() => ({
  backgroundColor: palette.value.surface,
  borderColor: palette.value.border,
  borderWidth: 1,
  titleColor: palette.value.text,
  bodyColor: palette.value.text,
  titleFont: { size: 12 },
  bodyFont: { size: 12 },
}))

const lineData = computed(() => ({
  labels: snapshots.value.map((s) => s.label),
  datasets: [
    {
      label: 'Valor total',
      data: snapshots.value.map((s) => s.valorTotal),
      borderColor: '#1F5FAE',
      backgroundColor: '#1F5FAE',
      borderWidth: 2,
      tension: 0.4,
      pointRadius: 3,
    },
  ],
}))

const lineOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: animacion,
  plugins: {
    legend: { display: false },
    tooltip: { ...tooltipBase.value, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${currency.format(Number(ctx.parsed.y))}` } },
  },
  scales: {
    x: { ticks: { font: { size: 11 }, color: palette.value.muted }, grid: { color: palette.value.border, borderDash: [3, 3] } },
    y: { ticks: { font: { size: 11 }, color: palette.value.muted }, grid: { color: palette.value.border, borderDash: [3, 3] } },
  },
}))

const doughnutData = computed(() => ({
  labels: porEstado.value.map((p) => ESTADO_LABEL[p.estado] ?? p.estado),
  datasets: [
    {
      data: porEstado.value.map((p) => p.cantidad),
      backgroundColor: porEstado.value.map((p) => ESTADO_COLOR[p.estado] ?? '#7C8B96'),
      borderWidth: 0,
      spacing: 2,
      hoverOffset: 8,
    },
  ],
}))

const doughnutOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '56%',
  animation: reducedMotion ? { duration: 0 } : { animateRotate: true, animateScale: true, duration: 1000 },
  plugins: {
    legend: { display: false },
    tooltip: { ...tooltipBase.value },
  },
}))

const barData = computed(() => ({
  labels: solicitudesPorMes.value.map((s) => s.mes),
  datasets: [
    {
      label: 'Solicitudes',
      data: solicitudesPorMes.value.map((s) => s.cantidad),
      backgroundColor: '#0E7490',
      borderRadius: { topLeft: 4, topRight: 4 },
    },
  ],
}))

const barOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: animacion,
  plugins: {
    legend: { display: false },
    tooltip: { ...tooltipBase.value },
  },
  scales: {
    x: { ticks: { font: { size: 11 }, color: palette.value.muted }, grid: { color: palette.value.border, borderDash: [3, 3] } },
    y: {
      beginAtZero: true,
      ticks: { font: { size: 11 }, color: palette.value.muted, precision: 0 },
      grid: { color: palette.value.border, borderDash: [3, 3] },
    },
  },
}))

const familiaBarData = computed(() => ({
  labels: valorPorFamilia.value.map((f) => f.nombre),
  datasets: [
    {
      label: 'Valor actual',
      data: valorPorFamilia.value.map((f) => f.valor),
      backgroundColor: valorPorFamilia.value.map((f) => (f.tipo === 'sistemas' ? '#1F5FAE' : '#C8A24B')),
      borderRadius: 4,
      barThickness: 'flex',
      maxBarThickness: 22,
    },
  ],
}))

const familiaBarOptions = computed(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  animation: animacion,
  plugins: {
    legend: { display: false },
    tooltip: { ...tooltipBase.value, callbacks: { label: (ctx) => ` ${currency.format(Number(ctx.parsed.x))}` } },
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: { font: { size: 10 }, color: palette.value.muted, callback: (v) => compactMoney.format(Number(v)) },
      grid: { color: palette.value.border, borderDash: [3, 3] },
    },
    y: { ticks: { font: { size: 11 }, color: palette.value.text }, grid: { display: false } },
  },
}))
// Gráfico de requisiciones (Dirección): por estado (colores del flujo, aclarados en tema oscuro) o por área.
function aclarar(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const c = (v) => Math.round(v + (255 - v) * k)
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`
}
const comprasGrafico = computed(() => {
  if (vistaCompras.value === 'estado') {
    const filas = requisicionesPorEstado()
    return { labels: filas.map((f) => f.label), datos: filas.map((f) => f.cantidad), colores: filas.map((f) => (theme.value === 'dark' ? aclarar(f.color, 0.4) : f.color)) }
  }
  const filas = requisicionesPorArea()
  const color = theme.value === 'dark' ? '#2FB6CF' : '#0E7490'
  return { labels: filas.map((f) => f.area), datos: filas.map((f) => f.cantidad), colores: filas.map(() => color) }
})
const comprasBarData = computed(() => ({
  labels: comprasGrafico.value.labels,
  datasets: [{ label: 'Requisiciones', data: comprasGrafico.value.datos, backgroundColor: comprasGrafico.value.colores, borderRadius: 4, barThickness: 'flex', maxBarThickness: 22 }],
}))
const comprasBarOptions = computed(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  animation: animacion,
  plugins: { legend: { display: false }, tooltip: { ...tooltipBase.value, callbacks: { label: (ctx) => ` ${ctx.parsed.x} ${ctx.parsed.x === 1 ? 'requisición' : 'requisiciones'}` } } },
  scales: {
    x: { beginAtZero: true, ticks: { font: { size: 10 }, color: palette.value.muted, precision: 0 }, grid: { color: palette.value.border, borderDash: [3, 3] } },
    y: { ticks: { font: { size: 11 }, color: palette.value.text }, grid: { display: false } },
  },
}))
</script>
