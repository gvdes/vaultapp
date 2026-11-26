<template>
  <q-dialog
    v-model="abierto"
    maximized
    transition-show="slide-up"
    transition-hide="slide-down"
    :transition-duration="reduced ? 0 : 300"
    @hide="emit('close')"
  >
    <div class="flex h-full w-full min-w-0 flex-col bg-bg text-text" role="dialog" aria-modal="true" :aria-label="`Ficha de ${ficha.nombre}`">
      <!-- Encabezado -->
      <header class="shrink-0 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="min-w-0 truncate text-lg font-extrabold text-text sm:text-xl">{{ ficha.nombre }}</h2>
              <span class="shrink-0 rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] font-bold text-text-muted">{{ ficha.tipoLabel }}</span>
              <span v-if="todasUbicaciones.length > 1" class="shrink-0 rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] font-bold text-text-muted">{{ todasUbicaciones.length }} pisos / ubicaciones</span>
            </div>
            <p class="mt-0.5 text-[12px] text-text-muted">Ficha completa de {{ dominioFijo === 'sistemas' ? 'Sistemas' : dominioFijo === 'mantenimiento' ? 'Mantenimiento' : 'Sistemas y Mantenimiento' }} · solo lectura · datos al {{ hoy }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[12px] font-bold text-text hover:bg-surface-hover"
              title="Abrir la pantalla de Auditorías"
              @click="irAuditorias"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.6-1.5A9 9 0 1112 3a9 9 0 018.6 6.5z" /></svg>
              <span class="max-sm:hidden">Ir a Auditorías</span>
            </button>
            <button
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-muted hover:bg-surface-hover hover:text-text"
              aria-label="Cerrar ficha"
              title="Cerrar (Esc)"
              @click="cerrar"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <!-- Selector de piso / ubicación (solo cuando el punto agrupa varias) -->
        <div v-if="todasUbicaciones.length > 1" class="vz-scroll mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Filtrar por piso o ubicación">
          <button
            type="button"
            class="shrink-0 rounded-full border px-3 py-1 text-[12px] font-bold transition-colors"
            :class="sel === 'todas' ? 'border-vz-blue bg-vz-blue text-white' : 'border-border text-text-muted hover:bg-surface-hover'"
            :aria-pressed="sel === 'todas'"
            @click="sel = 'todas'"
          >
            Todos
          </button>
          <button
            v-for="u in todasUbicaciones"
            :key="u.id"
            type="button"
            class="shrink-0 rounded-full border px-3 py-1 text-[12px] font-bold transition-colors"
            :class="sel === u.id ? 'border-vz-blue bg-vz-blue text-white' : 'border-border text-text-muted hover:bg-surface-hover'"
            :aria-pressed="sel === u.id"
            :title="u.nombre"
            @click="sel = u.id"
          >
            {{ u.piso }}
          </button>
        </div>
      </header>

      <!-- Cuerpo con scroll -->
      <div ref="cuerpoEl" class="vz-scroll min-h-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-[1500px] px-4 py-4 sm:px-6">
          <!-- Franja de KPIs -->
          <section aria-label="Indicadores de la sucursal" class="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
            <component
              :is="k.accion ? 'button' : 'div'"
              v-for="k in kpis"
              :key="k.id"
              :type="k.accion ? 'button' : undefined"
              class="relative flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-xl border border-border bg-surface p-3 text-left transition-all duration-200"
              :class="k.accion ? 'hover:-translate-y-0.5 hover:shadow-md' : ''"
              :title="k.accion ? 'Ver el detalle en Inventario' : undefined"
              @click="k.accion?.()"
            >
              <span v-if="k.accent" class="absolute inset-x-0 top-0 h-[3px]" :style="{ background: k.accent }" />
              <span class="truncate text-[11.5px] font-semibold text-text-muted" :title="k.label">{{ k.label }}</span>
              <span class="text-xl font-extrabold leading-tight" :class="TONO_TEXTO[k.tone ?? 'default']">
                <AnimatedNumber v-if="k.amount !== undefined" :value="k.amount" :format="k.format" :duration="700" />
                <template v-else>{{ k.value }}</template>
              </span>
              <span v-if="k.hint" class="truncate text-[11px] text-text-soft" :title="k.hint">{{ k.hint }}</span>
            </component>
          </section>

          <!-- Pestañas -->
          <div class="sticky top-0 z-20 -mx-4 mt-4 border-b border-border bg-bg/95 px-4 backdrop-blur sm:-mx-6 sm:px-6" role="tablist">
            <div class="vz-scroll flex gap-1 overflow-x-auto">
              <button
                v-for="t in TABS"
                :key="t.id"
                type="button"
                role="tab"
                :aria-selected="tab === t.id"
                class="shrink-0 border-b-2 px-4 py-2.5 text-[13px] font-bold transition-colors"
                :class="tab === t.id ? 'border-vz-blue text-vz-blue' : 'border-transparent text-text-muted hover:text-text'"
                @click="tab = t.id"
              >
                {{ t.label }}
                <span v-if="t.id === 'inventario'" class="ml-1 rounded-full bg-surface px-1.5 text-[11px] text-text-soft">{{ ficha.items.length }}</span>
              </button>
            </div>
          </div>

          <!-- ============ RESUMEN ============ -->
          <div v-if="tab === 'resumen'" class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <!-- Valor por familia -->
            <section class="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
              <div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h3 class="text-[13px] font-bold text-text">Valor por familia: inversión vs. valor actual</h3>
                <div class="flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
                  <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full" :style="{ background: colores.invertido }" />Invertido</span>
                  <span v-if="dominioFijo !== 'mantenimiento'" class="flex items-center gap-1"><span class="h-2 w-2 rounded-full" :style="{ background: colores.ti }" />Actual TI</span>
                  <span v-if="dominioFijo !== 'sistemas'" class="flex items-center gap-1"><span class="h-2 w-2 rounded-full" :style="{ background: colores.mtto }" />Actual Mantenimiento</span>
                </div>
              </div>
              <p v-if="ficha.familias.length === 0" class="py-8 text-center text-[12px] text-text-soft">Esta ubicación no tiene equipos ni materiales registrados.</p>
              <template v-else>
                <div :style="{ height: `${alturaGrafica}px` }">
                  <Bar :data="familiaBarData" :options="familiaBarOptions" />
                </div>
                <div class="mt-3 overflow-x-auto">
                  <table class="w-full min-w-[460px] text-[12px]">
                    <thead>
                      <tr class="text-left text-[11px] text-text-muted">
                        <th class="py-1 pr-2 font-semibold">Familia</th>
                        <th class="px-2 py-1 text-right font-semibold">Partidas</th>
                        <th class="px-2 py-1 text-right font-semibold">Piezas</th>
                        <th class="px-2 py-1 text-right font-semibold">Invertido</th>
                        <th class="px-2 py-1 text-right font-semibold">Valor actual</th>
                        <th class="py-1 pl-2 text-right font-semibold">% del total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="fa in ficha.familias"
                        :key="fa.familiaId"
                        class="cursor-pointer border-t border-border hover:bg-surface-hover"
                        title="Ver esta familia en Inventario"
                        @click="irInventario({ familiaId: fa.familiaId })"
                      >
                        <td class="py-1.5 pr-2 font-semibold text-text">
                          <span class="mr-1.5 inline-block h-2 w-2 rounded-full" :style="{ background: fa.dominio === 'ti' ? colores.ti : colores.mtto }" />{{ fa.nombre }}
                        </td>
                        <td class="px-2 py-1.5 text-right text-text-muted">{{ fa.partidas }}</td>
                        <td class="px-2 py-1.5 text-right text-text-muted">{{ fmtNum(fa.unidades) }}</td>
                        <td class="px-2 py-1.5 text-right text-text-muted">{{ fmtMoney(fa.invertido) }}</td>
                        <td class="px-2 py-1.5 text-right font-bold text-text">{{ fmtMoney(fa.valorActual) }}</td>
                        <td class="py-1.5 pl-2 text-right text-text-muted">{{ ficha.kpis.valorActual > 0 ? Math.round((fa.valorActual / ficha.kpis.valorActual) * 100) : 0 }}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
            </section>

            <!-- Conservado + estados -->
            <section class="flex flex-col gap-4">
              <div class="rounded-xl border border-border bg-surface p-4">
                <h3 class="text-[13px] font-bold text-text">Valor actual vs. inversión</h3>
                <p class="mt-2 text-[22px] font-extrabold text-text"><AnimatedNumber :value="ficha.kpis.pctConservado" :format="(n: number) => `${Math.round(n)}%`" :duration="700" /> <span class="text-[12px] font-semibold text-text-muted">conservado</span></p>
                <div class="mt-1.5 h-2.5 overflow-hidden rounded-full bg-bg">
                  <div class="vz-ficha-bar h-full rounded-full bg-vz-success" :style="{ width: `${anim ? ficha.kpis.pctConservado : 0}%` }" />
                </div>
                <p class="mt-2 text-[12px] text-text-muted">
                  Hoy valen <strong class="text-text">{{ fmtMoney(ficha.kpis.valorActual) }}</strong> de <strong class="text-text">{{ fmtMoney(ficha.kpis.valorInvertido) }}</strong> invertidos
                  (<strong class="text-vz-danger">{{ Math.round(ficha.kpis.pctDepreciado) }}%</strong> depreciado).
                </p>
              </div>
              <div class="flex-1 rounded-xl border border-border bg-surface p-4">
                <h3 class="mb-2 text-[13px] font-bold text-text">Equipos por estado</h3>
                <p v-if="porEstado.length === 0" class="py-6 text-center text-[12px] text-text-soft">Sin equipos.</p>
                <template v-else>
                  <div class="h-44"><Doughnut :data="doughnutData" :options="doughnutOptions" /></div>
                  <div class="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]">
                    <button v-for="p in porEstado" :key="p.estado" type="button" class="flex items-center gap-1 text-text-muted hover:text-text" @click="irInventario({ estado: p.estado })">
                      <span class="h-2 w-2 rounded-full" :style="{ background: ESTADO_COLOR[p.estado] ?? '#7C8B96' }" />{{ ESTADO_ITEM_LABEL[p.estado] ?? p.estado }} ({{ p.cantidad }})
                    </button>
                  </div>
                </template>
              </div>
            </section>

            <!-- Quién tiene qué -->
            <section class="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
              <div class="mb-2 flex items-baseline justify-between gap-2">
                <h3 class="text-[13px] font-bold text-text">Quién tiene qué</h3>
                <span class="text-[11px] text-text-soft">{{ ficha.kpis.responsables }} {{ ficha.kpis.responsables === 1 ? 'responsable' : 'responsables' }} · toca una fila para ver su inventario</span>
              </div>
              <p v-if="ficha.responsables.length === 0 && ficha.sinResponsableDetalle.equipos === 0" class="py-6 text-center text-[12px] text-text-soft">No hay equipos con responsable en esta ubicación.</p>
              <div v-else class="vz-scroll max-h-[420px] overflow-auto">
                <table class="w-full min-w-[560px] text-[12px]">
                  <thead class="sticky top-0 bg-surface">
                    <tr class="text-left text-[11px] text-text-muted">
                      <th class="py-1 pr-2 font-semibold">Responsable</th>
                      <th class="px-2 py-1 text-right font-semibold">Equipos</th>
                      <th class="px-2 py-1 text-right font-semibold">Valor actual</th>
                      <th class="px-2 py-1 font-semibold">Responsiva</th>
                      <th class="py-1 pl-2 font-semibold">Qué tiene</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="ficha.sinResponsableDetalle.equipos > 0" class="cursor-pointer border-t border-border bg-vz-danger/5 hover:bg-vz-danger/10" @click="irInventario({ responsable: SIN_RESPONSABLE })">
                      <td class="py-1.5 pr-2 font-bold text-vz-danger">Sin responsable</td>
                      <td class="px-2 py-1.5 text-right font-bold text-vz-danger">{{ ficha.sinResponsableDetalle.equipos }}</td>
                      <td class="px-2 py-1.5 text-right text-text-muted">{{ fmtMoney(ficha.sinResponsableDetalle.valor) }}</td>
                      <td class="px-2 py-1.5 text-text-soft">—</td>
                      <td class="py-1.5 pl-2 text-text-soft">Sin trazabilidad: asigna un responsable.</td>
                    </tr>
                    <tr v-for="r in ficha.responsables" :key="r.nombre" class="cursor-pointer border-t border-border hover:bg-surface-hover" @click="irInventario({ responsable: r.nombre })">
                      <td class="py-1.5 pr-2">
                        <span class="font-semibold text-text">{{ r.nombre }}</span>
                        <span v-if="r.puesto" class="block text-[11px] text-text-soft">{{ r.puesto }}</span>
                      </td>
                      <td class="px-2 py-1.5 text-right font-bold text-text">{{ r.equipos }}</td>
                      <td class="px-2 py-1.5 text-right text-text-muted">{{ fmtMoney(r.valor) }}</td>
                      <td class="px-2 py-1.5">
                        <span v-if="r.conResponsiva + r.sinResponsiva === 0" class="text-text-soft">—</span>
                        <StatusPill v-else-if="r.sinResponsiva === 0" :label="`${r.conResponsiva} firmada${r.conResponsiva === 1 ? '' : 's'}`" tone="success" />
                        <StatusPill v-else :label="`${r.sinResponsiva} sin firmar`" tone="danger" />
                      </td>
                      <td class="py-1.5 pl-2 text-text-muted">{{ r.familias.slice(0, 4).join(', ') }}{{ r.familias.length > 4 ? '…' : '' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <!-- Auditoría -->
            <section class="rounded-xl border border-border bg-surface p-4">
              <h3 class="mb-2 text-[13px] font-bold text-text">Auditoría</h3>
              <div v-for="a in ficha.auditoria.porUbicacion" :key="a.ubicacionId" class="mb-3 rounded-lg border border-border bg-bg/50 p-3 last:mb-0">
                <p v-if="ficha.auditoria.porUbicacion.length > 1" class="mb-1 text-[12px] font-bold text-text">{{ a.nombre }}</p>
                <div class="grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <p class="text-[11px] text-text-muted">Última cerrada</p>
                    <p class="font-bold text-text">{{ a.ultimaFecha ? fmtTs(a.ultimaFecha) : 'Nunca' }}</p>
                    <p v-if="a.ultimaFecha" class="text-[11px] text-text-soft">{{ a.estadoLabel }}</p>
                  </div>
                  <div>
                    <p class="text-[11px] text-text-muted">Exactitud</p>
                    <p class="font-bold" :class="a.exactitud === null ? 'text-text-soft' : a.exactitud >= META_EXACTITUD ? 'text-vz-success' : 'text-vz-danger'">
                      {{ a.exactitud === null ? 'Sin datos' : `${a.exactitud}%` }}
                    </p>
                    <p v-if="a.exactitud !== null" class="text-[11px] text-text-soft">{{ a.partidas }} partidas · meta {{ META_EXACTITUD }}%</p>
                  </div>
                  <div class="col-span-2">
                    <p class="text-[11px] text-text-muted">Próxima (cada {{ FRECUENCIA_AUDITORIA_DIAS }} días)</p>
                    <p class="font-bold" :class="a.vencida ? 'text-vz-danger' : 'text-text'">
                      {{ a.nunca ? 'Pendiente: nunca se ha auditado' : fmtTs(a.proxima) }}
                      <span v-if="!a.nunca" class="text-[11px] font-semibold">· {{ a.dias < 0 ? `vencida hace ${-a.dias} días` : a.dias === 0 ? 'vence hoy' : `en ${a.dias} días` }}</span>
                    </p>
                    <p v-if="a.abiertaEstado" class="mt-0.5 text-[11px] font-semibold text-vz-warning">Hay una auditoría abierta: {{ a.abiertaLabel }}.</p>
                  </div>
                </div>
              </div>
              <button type="button" class="mt-1 h-8 w-full rounded-lg bg-vz-blue text-[12px] font-bold text-white hover:opacity-90" @click="irAuditorias">Ir a Auditorías</button>
            </section>

            <!-- Vida útil / reposición -->
            <section class="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
              <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 class="text-[13px] font-bold text-text">Vida útil y reposición proyectada</h3>
                <button v-if="ficha.kpis.finVida > 0" type="button" class="text-[12px] font-bold text-vz-blue underline" @click="irInventario({ soloFinVida: true })">Ver los {{ ficha.kpis.finVida }} en Inventario</button>
              </div>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div class="rounded-lg border border-border bg-bg/50 p-3">
                  <p class="text-[11px] text-text-muted">Ya rebasaron su vida útil</p>
                  <p class="text-lg font-extrabold" :class="ficha.reposicion.vencidos.n > 0 ? 'text-vz-danger' : 'text-text'">{{ ficha.reposicion.vencidos.n }}</p>
                  <p class="text-[11px] text-text-soft">Reponer ≈ {{ fmtMoney(ficha.reposicion.vencidos.valor) }}</p>
                </div>
                <div class="rounded-lg border border-border bg-bg/50 p-3">
                  <p class="text-[11px] text-text-muted">Entre 85% y 100% de su vida</p>
                  <p class="text-lg font-extrabold" :class="ficha.reposicion.cerca.n > 0 ? 'text-vz-warning' : 'text-text'">{{ ficha.reposicion.cerca.n }}</p>
                  <p class="text-[11px] text-text-soft">Reponer ≈ {{ fmtMoney(ficha.reposicion.cerca.valor) }}</p>
                </div>
                <div class="rounded-lg border border-border bg-bg/50 p-3">
                  <p class="text-[11px] text-text-muted">Terminan su vida en 12 meses</p>
                  <p class="text-lg font-extrabold text-text">{{ ficha.reposicion.proximos12m.n }}</p>
                  <p class="text-[11px] text-text-soft">Presupuesto ≈ {{ fmtMoney(ficha.reposicion.proximos12m.valor) }}</p>
                </div>
              </div>
              <div class="mt-3 flex flex-col gap-1.5">
                <div v-for="t in ficha.reposicion.tramos" :key="t.etiqueta" class="flex items-center gap-2 text-[11.5px]">
                  <span class="w-24 shrink-0 text-text-muted">{{ t.etiqueta }} vida</span>
                  <div class="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-bg">
                    <div class="vz-ficha-bar h-full rounded-full" :class="t.etiqueta === '85-100%' ? 'bg-vz-warning' : t.etiqueta === 'Más del 100%' ? 'bg-vz-danger' : 'bg-vz-blue'" :style="{ width: `${anim ? (t.n / maxTramo) * 100 : 0}%` }" />
                  </div>
                  <span class="w-28 shrink-0 text-right text-text-muted">{{ t.n }} eq. · {{ fmtMoney(t.valor) }}</span>
                </div>
              </div>
              <ul v-if="topFinVida.length > 0" class="mt-3 m-0 list-none divide-y divide-border p-0 text-[12px]">
                <li v-for="i in topFinVida" :key="i.id" class="flex items-center justify-between gap-2 py-1.5">
                  <span class="min-w-0 truncate"><span class="font-semibold text-text">{{ i.nombre }}</span> <span class="text-text-soft">· {{ i.familia }}{{ i.responsable ? ` · ${i.responsable}` : '' }}</span></span>
                  <span class="shrink-0 font-semibold" :class="(i.mesesRestantes ?? 0) <= 0 ? 'text-vz-danger' : 'text-vz-warning'">
                    {{ (i.mesesRestantes ?? 0) <= 0 ? `rebasó hace ${-(i.mesesRestantes ?? 0)} m` : `faltan ${i.mesesRestantes} m` }} · {{ fmtMoney(i.costoOriginal) }}
                  </span>
                </li>
              </ul>
              <p v-else class="mt-3 text-[12px] text-text-soft">Ningún equipo está cerca del fin de su vida útil.</p>
              <p class="mt-2 text-[10.5px] text-text-soft">Reposición estimada al costo de compra de cada equipo. Vida útil según la familia (meses desde la compra).</p>
            </section>

            <!-- Alertas de control -->
            <section id="ficha-alertas" class="rounded-xl border border-border bg-surface p-4 lg:col-span-3">
              <h3 class="mb-3 text-[13px] font-bold text-text">Alertas de control de {{ ficha.nombre }}</h3>
              <p v-if="ficha.alertas.length === 0" class="py-6 text-center text-[13px] font-semibold text-vz-success">Sin alertas de control en esta ubicación.</p>
              <ul v-else class="m-0 grid list-none grid-cols-1 gap-2 p-0 lg:grid-cols-2">
                <li v-for="a in ficha.alertas" :key="a.id" class="rounded-lg border border-border bg-bg/50 p-3">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <StatusPill :label="SEVERIDAD_LABEL[a.severidad]" :tone="SEVERIDAD_TONE[a.severidad]" />
                        <span class="text-[13px] font-bold text-text">{{ a.titulo }}</span>
                      </div>
                      <p class="mt-1 text-[12px] text-text-muted">{{ a.detalle }}</p>
                    </div>
                    <button v-if="a.items.length > 0" type="button" class="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-hover" @click="alertaAbierta = alertaAbierta === a.id ? null : a.id">
                      {{ alertaAbierta === a.id ? 'Ocultar' : `Ver ${a.items.length}` }}
                    </button>
                  </div>
                  <ul v-if="alertaAbierta === a.id" class="mt-2 m-0 flex list-none flex-col gap-1 p-0">
                    <li v-for="(it, idx) in a.items" :key="idx" class="flex items-start justify-between gap-2 rounded-md bg-surface px-2 py-1.5 text-[12px] text-text">
                      <span class="min-w-0">{{ it.texto }}</span>
                      <button v-if="it.ruta" type="button" class="shrink-0 text-[11px] font-bold text-vz-blue underline" @click="irRuta(it.ruta)">Abrir</button>
                    </li>
                  </ul>
                </li>
              </ul>
            </section>
          </div>

          <!-- ============ INVENTARIO ============ -->
          <div v-else-if="tab === 'inventario'" class="mt-4">
            <!-- Filtros -->
            <section class="rounded-xl border border-border bg-surface p-3 sm:p-4">
              <div class="flex flex-wrap items-center gap-2">
                <div v-if="!dominioFijo" class="flex rounded-full border border-border bg-bg p-0.5" role="group" aria-label="Dominio">
                  <button
                    v-for="d in DOMINIOS"
                    :key="d.id"
                    type="button"
                    class="rounded-full px-3 py-1 text-[12px] font-bold transition-all duration-200"
                    :class="f.dominio === d.id ? 'text-white shadow-sm' : 'text-text-muted hover:text-text'"
                    :style="f.dominio === d.id ? { background: d.color } : undefined"
                    :aria-pressed="f.dominio === d.id"
                    @click="f.dominio = d.id"
                  >
                    {{ d.label }}
                  </button>
                </div>
                <select v-model="f.familiaId" class="h-9 max-w-[11rem] rounded-lg border border-border bg-surface px-2 text-[12px] font-semibold text-text outline-none focus:border-vz-blue" aria-label="Familia">
                  <option value="">Todas las familias</option>
                  <option v-for="fa in familiaOpts" :key="fa.familiaId" :value="fa.familiaId">{{ fa.nombre }} ({{ fa.partidas }})</option>
                </select>
                <select v-model="f.estado" class="h-9 max-w-[10rem] rounded-lg border border-border bg-surface px-2 text-[12px] font-semibold text-text outline-none focus:border-vz-blue" aria-label="Estado">
                  <option value="">Todos los estados</option>
                  <option v-for="e in estadoOpts" :key="e.id" :value="e.id">{{ e.label }} ({{ e.n }})</option>
                </select>
                <select v-model="f.responsable" class="h-9 max-w-[12rem] rounded-lg border border-border bg-surface px-2 text-[12px] font-semibold text-text outline-none focus:border-vz-blue" aria-label="Responsable">
                  <option value="">Todos los responsables</option>
                  <option :value="SIN_RESPONSABLE">Sin responsable</option>
                  <option v-for="r in ficha.responsables" :key="r.nombre" :value="r.nombre">{{ r.nombre }} ({{ r.equipos }})</option>
                </select>
                <div class="relative min-w-[11rem] flex-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-soft"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z" /></svg>
                  <input v-model="f.q" type="search" placeholder="Buscar serie, modelo, nombre, marca…" class="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-2 text-[12px] text-text outline-none placeholder:text-text-soft focus:border-vz-blue" aria-label="Buscar" />
                </div>
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  v-for="t in TOGGLES"
                  :key="t.key"
                  type="button"
                  class="rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-colors"
                  :class="f[t.key] ? 'border-vz-blue bg-vz-blue/10 text-vz-blue' : 'border-border text-text-muted hover:bg-surface-hover'"
                  :aria-pressed="f[t.key]"
                  @click="f[t.key] = !f[t.key]"
                >
                  {{ t.label }}<span class="ml-1 text-text-soft">{{ contadores[t.key] }}</span>
                </button>
                <button v-if="hayFiltros" type="button" class="ml-1 text-[11.5px] font-bold text-text-muted underline hover:text-text" @click="limpiarFiltros">Limpiar filtros</button>
              </div>
            </section>

            <!-- Resumen del filtro + exportar -->
            <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px]">
              <p class="text-text-muted">
                <strong class="text-text">{{ filtrados.length }}</strong> de {{ ficha.items.length }} partidas
                <span class="text-text-soft">({{ fmtNum(totales.unidades) }} piezas)</span>
                · Valor actual <strong class="text-text">{{ fmtMoney(totales.valorActual) }}</strong>
                · Invertido <strong class="text-text">{{ fmtMoney(totales.invertido) }}</strong>
              </p>
              <button
                type="button"
                class="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[12px] font-bold text-text hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="filtrados.length === 0"
                @click="exportarExcel"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" /></svg>
                Exportar Excel
              </button>
            </div>

            <!-- Tabla -->
            <div v-if="filtrados.length === 0" class="mt-3 rounded-xl border border-dashed border-border bg-surface p-8 text-center">
              <p class="text-[13px] font-bold text-text">{{ ficha.items.length === 0 ? 'Esta ubicación no tiene inventario registrado.' : 'Ninguna partida coincide con los filtros.' }}</p>
              <button v-if="hayFiltros" type="button" class="mt-3 h-8 rounded-lg bg-vz-blue px-4 text-[12px] font-bold text-white hover:opacity-90" @click="limpiarFiltros">Quitar filtros</button>
            </div>
            <div v-else class="vz-scroll mt-3 max-h-[64vh] overflow-auto rounded-xl border border-border bg-surface">
              <table class="w-full min-w-[1180px] text-left text-[12px]">
                <thead>
                  <tr class="text-[11px] text-text-muted">
                    <th
                      v-for="c in COLUMNAS"
                      :key="c.id"
                      class="sticky top-0 z-10 whitespace-nowrap border-b border-border bg-surface px-3 py-2 font-bold"
                      :class="c.num ? 'text-right' : ''"
                      :aria-sort="orden.col === c.sort ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'"
                    >
                      <button v-if="c.sort" type="button" class="inline-flex items-center gap-1 font-bold hover:text-text" @click="ordenarPor(c.sort)">
                        {{ c.label }}
                        <span class="text-[9px]" :class="orden.col === c.sort ? 'text-vz-blue' : 'text-text-soft'">{{ orden.col === c.sort ? (orden.dir === 'asc' ? '▲' : '▼') : '↕' }}</span>
                      </button>
                      <span v-else>{{ c.label }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="i in visibles" :key="i.id">
                    <tr
                      class="cursor-pointer border-b border-border transition-colors hover:bg-surface-hover"
                      :class="expandido === i.id ? 'bg-surface-hover' : ''"
                      tabindex="0"
                      :aria-expanded="expandido === i.id"
                      @click="alternar(i.id)"
                      @keydown.enter.prevent="alternar(i.id)"
                    >
                      <td class="px-3 py-2">
                        <div class="flex items-start gap-1.5">
                          <span class="mt-0.5 shrink-0 rounded px-1 text-[9.5px] font-extrabold uppercase text-white" :style="{ background: i.dominio === 'ti' ? colores.ti : colores.mtto }">{{ i.dominio === 'ti' ? 'TI' : 'Mtto' }}</span>
                          <div class="min-w-0">
                            <p class="max-w-[16rem] truncate font-bold text-text" :title="i.nombre">{{ i.nombre }}</p>
                            <p class="max-w-[16rem] truncate text-[11px] text-text-soft">{{ i.familia }}{{ i.marca ? ` · ${i.marca}` : '' }}</p>
                          </div>
                          <span v-if="i.nAlertas > 0" class="ml-auto mt-0.5 shrink-0 rounded-full bg-vz-danger/15 px-1.5 text-[10px] font-extrabold text-vz-danger" :title="textoAlertas(i)">{{ i.nAlertas }}!</span>
                        </div>
                      </td>
                      <td class="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-text-muted">{{ i.serie || (i.tipo === 'material' ? '—' : 'sin serie') }}</td>
                      <td v-if="ficha.agrupada" class="whitespace-nowrap px-3 py-2 text-text-muted">{{ i.piso }}</td>
                      <td class="px-3 py-2">
                        <span v-if="i.tipo === 'material'" class="text-text-soft">—</span>
                        <span v-else-if="i.responsable" class="font-semibold text-text">{{ i.responsable }}</span>
                        <span v-else class="font-bold text-vz-danger">Sin responsable</span>
                      </td>
                      <td class="whitespace-nowrap px-3 py-2"><StatusPill :label="i.estadoLabel" :tone="ESTADO_ITEM_TONE[i.estado] ?? 'neutral'" /></td>
                      <td class="whitespace-nowrap px-3 py-2 text-text-muted">{{ i.fechaCompra ? fmtFecha(i.fechaCompra) : '—' }}</td>
                      <td class="whitespace-nowrap px-3 py-2 text-right text-text-muted">{{ fmtMoney(i.costoOriginal) }}</td>
                      <td class="whitespace-nowrap px-3 py-2 text-right font-bold text-text">{{ fmtMoney(i.valorActual) }}</td>
                      <td class="px-3 py-2">
                        <!-- Material: existencia vs mínimo / máximo -->
                        <div v-if="i.tipo === 'material'" class="w-36" :title="`Existencia ${i.cantidad} ${i.unidad}; mínimo ${i.minimo}${i.maximo ? `; máximo ${i.maximo}` : ''}`">
                          <div class="relative h-2 overflow-hidden rounded-full bg-bg">
                            <div class="h-full rounded-full" :class="i.flags.bajoMinimo ? 'bg-vz-danger' : i.flags.sobreMaximo ? 'bg-vz-warning' : 'bg-vz-success'" :style="{ width: `${medidor(i).fill}%` }" />
                            <span v-if="(i.minimo ?? 0) > 0" class="absolute top-0 h-full w-0.5 bg-text/60" :style="{ left: `${medidor(i).min}%` }" />
                            <span v-if="medidor(i).max !== null" class="absolute top-0 h-full w-0.5 bg-text/60" :style="{ left: `${medidor(i).max}%` }" />
                          </div>
                          <p class="mt-0.5 text-[10.5px] text-text-muted">{{ fmtNum(i.cantidad ?? 0) }} {{ i.unidad }} <span class="text-text-soft">(mín {{ i.minimo }}{{ i.maximo ? ` · máx ${i.maximo}` : '' }})</span></p>
                        </div>
                        <!-- Equipo: vida útil consumida -->
                        <div v-else-if="i.vidaPct !== null" class="w-28" :title="`${Math.round(i.vidaPct * 100)}% de la vida útil consumida`">
                          <div class="h-2 overflow-hidden rounded-full bg-bg">
                            <div class="h-full rounded-full" :class="i.vidaPct >= 0.85 ? 'bg-vz-danger' : i.vidaPct >= 0.5 ? 'bg-vz-warning' : 'bg-vz-success'" :style="{ width: `${Math.min(100, i.vidaPct * 100)}%` }" />
                          </div>
                          <p class="mt-0.5 text-[10.5px] text-text-muted">{{ Math.round(i.vidaPct * 100) }}% consumida</p>
                        </div>
                        <span v-else class="text-text-soft">—</span>
                      </td>
                      <td class="whitespace-nowrap px-3 py-2">
                        <span v-if="i.garantiaDias === null" class="text-text-soft">—</span>
                        <span v-else-if="i.garantiaDias < 0" class="text-text-soft">Vencida</span>
                        <span v-else class="font-semibold" :class="i.flags.garantiaPorVencer ? 'text-vz-warning' : 'text-text-muted'">{{ i.garantiaDias }} d</span>
                      </td>
                      <td class="whitespace-nowrap px-3 py-2 text-center">
                        <span v-if="i.responsivaFirmada === null" class="text-text-soft">—</span>
                        <span v-else-if="i.responsivaFirmada" class="font-bold text-vz-success" title="Responsiva firmada">Sí</span>
                        <span v-else class="font-bold text-vz-danger" title="Sin responsiva firmada">No</span>
                      </td>
                      <td class="px-3 py-2 text-right">
                        <button type="button" class="rounded-md border border-border px-2 py-1 text-[11px] font-bold text-vz-blue hover:bg-surface" :title="`Abrir en ${i.dominio === 'ti' ? 'Sistemas' : 'Mantenimiento'}`" @click.stop="irItem(i)">Abrir</button>
                      </td>
                    </tr>
                    <tr v-if="expandido === i.id" class="border-b border-border bg-bg/60">
                      <td :colspan="columnasN" class="px-4 py-3">
                        <div class="grid grid-cols-1 gap-4 text-[12px] md:grid-cols-4">
                          <div>
                            <p class="mb-1 text-[11px] font-bold uppercase text-text-soft">Compra</p>
                            <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                              <dt class="text-text-muted">Fecha</dt><dd class="m-0 text-text">{{ i.fechaCompra ? fmtFecha(i.fechaCompra) : '—' }}</dd>
                              <dt class="text-text-muted">Proveedor</dt><dd class="m-0 text-text">{{ i.proveedor || '—' }}</dd>
                              <dt class="text-text-muted">Factura / OC</dt><dd class="m-0 text-text">{{ i.factura || '—' }}</dd>
                              <dt class="text-text-muted">Costo</dt><dd class="m-0 text-text">{{ fmtMoney(i.costoOriginal) }}</dd>
                              <dt class="text-text-muted">Valor actual</dt><dd class="m-0 font-bold text-text">{{ fmtMoney(i.valorActual) }}<span v-if="i.costoOriginal > 0" class="font-normal text-text-soft"> ({{ Math.round((i.valorActual / i.costoOriginal) * 100) }}%)</span></dd>
                            </dl>
                          </div>
                          <div>
                            <p class="mb-1 text-[11px] font-bold uppercase text-text-soft">{{ i.tipo === 'equipo' ? 'Trazabilidad' : 'Existencia' }}</p>
                            <dl v-if="i.tipo === 'equipo'" class="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                              <dt class="text-text-muted">Responsable</dt><dd class="m-0 text-text">{{ i.responsable || 'Sin responsable' }}</dd>
                              <dt class="text-text-muted">Puesto</dt><dd class="m-0 text-text">{{ i.puesto || '—' }}</dd>
                              <dt class="text-text-muted">Área</dt><dd class="m-0 text-text">{{ i.area || '—' }}</dd>
                              <dt class="text-text-muted">Responsiva</dt><dd class="m-0 text-text">{{ i.responsivaFolio || '—' }}{{ i.responsivaFirmada === null ? '' : i.responsivaFirmada ? ' · firmada' : ' · sin firmar' }}</dd>
                              <dt class="text-text-muted">Ubicación</dt><dd class="m-0 text-text">{{ i.ubicacion }}</dd>
                            </dl>
                            <dl v-else class="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                              <dt class="text-text-muted">Existencia</dt><dd class="m-0 text-text">{{ fmtNum(i.cantidad ?? 0) }} {{ i.unidad }}</dd>
                              <dt class="text-text-muted">Mínimo</dt><dd class="m-0 text-text">{{ i.minimo }}</dd>
                              <dt class="text-text-muted">Máximo</dt><dd class="m-0 text-text">{{ i.maximo || '—' }}</dd>
                              <dt class="text-text-muted">Costo unitario</dt><dd class="m-0 text-text">{{ fmtMoney(i.costoUnitario ?? 0) }}</dd>
                              <dt class="text-text-muted">Ubicación</dt><dd class="m-0 text-text">{{ i.ubicacion }}</dd>
                            </dl>
                            <p v-if="i.notas" class="mt-1 text-[11px] text-text-soft">Notas: {{ i.notas }}</p>
                          </div>
                          <div>
                            <p class="mb-1 text-[11px] font-bold uppercase text-text-soft">Vida útil y garantía</p>
                            <dl v-if="i.tipo === 'equipo'" class="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                              <dt class="text-text-muted">Antigüedad</dt><dd class="m-0 text-text">{{ i.mesesAntiguedad === null ? '—' : fmtMeses(i.mesesAntiguedad) }}</dd>
                              <dt class="text-text-muted">Vida útil</dt><dd class="m-0 text-text">{{ i.vidaPct === null ? '—' : `${Math.round(i.vidaPct * 100)}% consumida` }}</dd>
                              <dt class="text-text-muted">Fin de vida</dt><dd class="m-0 text-text">{{ i.mesesRestantes === null ? '—' : i.mesesRestantes <= 0 ? `rebasada hace ${fmtMeses(-i.mesesRestantes)}` : `en ${fmtMeses(i.mesesRestantes)}` }}</dd>
                              <dt class="text-text-muted">Garantía</dt><dd class="m-0 text-text">{{ i.garantiaFin ? `${fmtFecha(i.garantiaFin)} (${i.garantiaDias < 0 ? 'vencida' : `${i.garantiaDias} d`})` : 'Sin garantía registrada' }}</dd>
                            </dl>
                            <p v-else class="text-text-soft">Los materiales no se deprecian: valen existencia × costo unitario.</p>
                          </div>
                          <div>
                            <p class="mb-1 text-[11px] font-bold uppercase text-text-soft">Historial reciente</p>
                            <ul v-if="(ficha.historialPorItem[i.id] ?? []).length > 0" class="m-0 flex list-none flex-col gap-1 p-0">
                              <li v-for="h in ficha.historialPorItem[i.id]" :key="h.id" class="text-[11.5px]">
                                <span class="font-semibold text-text-muted">{{ fmtTs(h.fecha) }}</span>
                                <span class="text-text"> · {{ h.titulo.split(':')[0] }}</span>
                                <span v-if="h.detalle" class="block truncate text-text-soft" :title="h.detalle">{{ h.detalle }}</span>
                              </li>
                            </ul>
                            <p v-else class="text-text-soft">Sin movimientos registrados.</p>
                            <button type="button" class="mt-2 h-7 rounded-lg bg-vz-blue px-3 text-[11.5px] font-bold text-white hover:opacity-90" @click="irItem(i)">Abrir en {{ i.dominio === 'ti' ? 'Sistemas' : 'Mantenimiento' }}</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
              <div v-if="filtrados.length > visibles.length" class="sticky left-0 border-t border-border bg-surface p-3 text-center">
                <button type="button" class="h-8 rounded-lg border border-border px-4 text-[12px] font-bold text-text hover:bg-surface-hover" @click="limiteFilas += 150">
                  Mostrar más ({{ filtrados.length - visibles.length }} restantes)
                </button>
              </div>
            </div>
          </div>

          <!-- ============ MOVIMIENTOS ============ -->
          <div v-else class="mt-4">
            <section class="rounded-xl border border-border bg-surface p-4">
              <h3 class="mb-3 text-[13px] font-bold text-text">Últimos movimientos</h3>
              <p v-if="ficha.movimientos.length === 0" class="py-8 text-center text-[12px] text-text-soft">Todavía no hay movimientos registrados para esta ubicación.</p>
              <ol v-else class="m-0 list-none p-0">
                <li v-for="(m, idx) in ficha.movimientos" :key="m.id" class="relative flex gap-3 pb-4 last:pb-0">
                  <span v-if="idx < ficha.movimientos.length - 1" class="absolute left-[7px] top-4 h-full w-px bg-border" />
                  <span class="relative z-[1] mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-surface" :style="{ background: colorMov(m.tipo) }" />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span class="text-[12px] font-bold text-text">{{ m.titulo }}</span>
                      <span class="rounded px-1 text-[9.5px] font-extrabold uppercase text-white" :style="{ background: m.dominio === 'ti' ? colores.ti : colores.mtto }">{{ m.dominio === 'ti' ? 'TI' : 'Mtto' }}</span>
                    </div>
                    <p class="text-[11px] text-text-soft">{{ fmtTs(m.fecha) }} · {{ TIPO_MOV_LABEL[m.tipo] }}</p>
                    <p v-if="m.detalle" class="mt-0.5 text-[12px] text-text-muted">{{ m.detalle }}</p>
                  </div>
                </li>
              </ol>
            </section>
          </div>
        </div>
      </div>
    </div>
  </q-dialog>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Bar, Doughnut } from 'vue-chartjs'
import * as XLSX from 'xlsx'
import { useTheme } from 'src/composables/useTheme'
import { getUbicacion } from 'src/lib/inventario/comunes'
import {
  ESTADO_ITEM_LABEL,
  ESTADO_ITEM_TONE,
  SIN_RESPONSABLE,
  filtrarItemsFicha,
  filtrosVacios,
  getFichaSucursal,
  hayFiltrosActivos,
  ordenarItemsFicha,
  totalesItemsFicha,
} from 'src/lib/inventario/fichaSucursal'
import { FRECUENCIA_AUDITORIA_DIAS, META_EXACTITUD_AUDITORIA as META_EXACTITUD } from 'src/lib/inventario/auditorias'
import { parseLocalDate } from 'src/lib/dateUtils'
import AnimatedNumber from './AnimatedNumber.vue'
import StatusPill from './StatusPill.vue'

/**
 * Ficha de sucursal: diálogo a pantalla completa, solo lectura, con todo lo que una ubicación (o los pisos de un mismo
 * punto del mapa) tiene en Sistemas y Mantenimiento. Se monta con v-if en el padre y emite `close`.
 */
const props = defineProps({
  ubicacionIds: { type: Array, required: true },
  /** Piso/ubicación con el que abre cuando el punto agrupa varias. */
  ubicacionInicial: String,
  dominioInicial: String,
  /** Alcance por rol: limita toda la ficha a un dominio (Soporte = sistemas, Mantenimiento = mantenimiento). Sin valor = ambos. */
  dominioFijo: String,
})
const emit = defineEmits(['close'])

const router = useRouter()
const { theme } = useTheme()
const abierto = ref(true)

const reduced = (() => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
})()

// Barras que "crecen" al entrar.
const anim = ref(reduced)
onMounted(() => {
  if (!anim.value) setTimeout(() => (anim.value = true), 350)
})

// ---- Formato ----
const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const compactMoney = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 })
const numFmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 })
const fmtMoney = (n) => currency.format(Math.round(n))
const fmtNum = (n) => numFmt.format(n)
const fmtTs = (ts) => new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtFecha = (iso) => parseLocalDate(iso.slice(0, 10)).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtMeses = (m) => {
  const a = Math.floor(m / 12)
  const r = Math.round(m % 12)
  return a > 0 ? `${a} ${a === 1 ? 'año' : 'años'}${r > 0 ? ` ${r} m` : ''}` : `${r} m`
}
const hoy = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })

// ---- Alcance (piso / ubicación) ----
const pisoDe = (nombre) => {
  const m = /piso\s+(\d+)\s*$/i.exec(nombre)
  return m ? `Piso ${m[1]}` : nombre
}
const todasUbicaciones = computed(() =>
  props.ubicacionIds.map((id) => {
    const nombre = getUbicacion(id)?.nombre ?? id
    return { id, nombre, piso: pisoDe(nombre) }
  }),
)
const sel = ref(props.ubicacionInicial && props.ubicacionIds.includes(props.ubicacionInicial) ? props.ubicacionInicial : 'todas')
const idsActivos = computed(() => (sel.value === 'todas' ? props.ubicacionIds : [sel.value]))
const ficha = computed(() => getFichaSucursal(idsActivos.value, { limiteMovimientos: 30, dominio: props.dominioFijo }))

// ---- Pestañas ----
/** @typedef {'resumen' | 'inventario' | 'movimientos'} TabId */
const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'movimientos', label: 'Movimientos' },
]
const tab = ref('resumen')
const cuerpoEl = ref(null)

// ---- Filtros ----
const f = reactive(filtrosVacios(props.dominioInicial ?? 'todo'))
const hayFiltros = computed(() => hayFiltrosActivos(f, 'todo'))
function limpiarFiltros() {
  Object.assign(f, filtrosVacios('todo'))
}
function irInventario(parcial) {
  Object.assign(f, filtrosVacios('todo'), parcial)
  tab.value = 'inventario'
  limiteFilas.value = 150
  void nextTick(() => cuerpoEl.value?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }))
}

const DOMINIOS = [
  { id: 'todo', label: 'Todo', color: '#0FA391' },
  { id: 'ti', label: 'TI', color: '#1F5FAE' },
  { id: 'mantenimiento', label: 'Mantenimiento', color: '#C8A24B' },
]
/**
 * @typedef {'soloSinResponsable' | 'soloSinResponsiva' | 'soloDanados' | 'soloBajoMinimo' | 'soloGarantia' |
 *   'soloFinVida'} ToggleKey
 */
const TOGGLES = [
  { key: 'soloSinResponsable', label: 'Sin responsable' },
  { key: 'soloSinResponsiva', label: 'Sin responsiva' },
  { key: 'soloDanados', label: 'Dañados' },
  { key: 'soloBajoMinimo', label: 'Bajo mínimo' },
  { key: 'soloGarantia', label: 'Garantía por vencer' },
  { key: 'soloFinVida', label: 'Fin de vida' },
]
const contadores = computed(() => {
  const items = ficha.value.items.filter((i) => f.dominio === 'todo' || i.dominio === f.dominio)
  return {
    soloSinResponsable: items.filter((i) => i.flags.sinResponsable).length,
    soloSinResponsiva: items.filter((i) => i.flags.sinResponsiva).length,
    soloDanados: items.filter((i) => i.flags.danado).length,
    soloBajoMinimo: items.filter((i) => i.flags.bajoMinimo).length,
    soloGarantia: items.filter((i) => i.flags.garantiaPorVencer).length,
    soloFinVida: items.filter((i) => i.flags.finVida).length,
  }
})

const familiaOpts = computed(() => ficha.value.familias.filter((fa) => f.dominio === 'todo' || fa.dominio === f.dominio))
const estadoOpts = computed(() => {
  const m = new Map()
  for (const i of ficha.value.items) {
    if (f.dominio !== 'todo' && i.dominio !== f.dominio) continue
    m.set(i.estado, (m.get(i.estado) ?? 0) + 1)
  }
  return [...m.entries()].map(([id, n]) => ({ id, n, label: ESTADO_ITEM_LABEL[id] ?? id })).sort((a, b) => a.label.localeCompare(b.label, 'es'))
})

// Si al cambiar de piso/dominio el valor elegido deja de existir, se limpia para no mostrar una tabla vacía "fantasma".
watch([ficha, () => f.dominio], () => {
  if (f.familiaId && !familiaOpts.value.some((fa) => fa.familiaId === f.familiaId)) f.familiaId = ''
  if (f.estado && !estadoOpts.value.some((e) => e.id === f.estado)) f.estado = ''
  if (f.responsable && f.responsable !== SIN_RESPONSABLE && !ficha.value.responsables.some((r) => r.nombre === f.responsable)) f.responsable = ''
})
watch(f, () => (limiteFilas.value = 150), { deep: true })

// ---- Orden / tabla ----
const orden = reactive({ col: 'valorActual', dir: 'desc' })
function ordenarPor(col) {
  if (orden.col === col) orden.dir = orden.dir === 'asc' ? 'desc' : 'asc'
  else {
    orden.col = col
    orden.dir = col === 'valorActual' || col === 'costoOriginal' || col === 'vidaPct' || col === 'alertas' ? 'desc' : 'asc'
  }
}
const filtrados = computed(() => ordenarItemsFicha(filtrarItemsFicha(ficha.value.items, f), orden.col, orden.dir))
const totales = computed(() => totalesItemsFicha(filtrados.value))
const limiteFilas = ref(150)
const visibles = computed(() => filtrados.value.slice(0, limiteFilas.value))
const expandido = ref(null)
const alternar = (id) => (expandido.value = expandido.value === id ? null : id)

/**
 * @typedef {object} Col
 * @property {string} id
 * @property {string} label
 * @property {ColumnaFicha} [sort]
 * @property {boolean} [num]
 */
const COLUMNAS = computed(() => {
  const cols = [
    { id: 'nombre', label: 'Partida', sort: 'nombre' },
    { id: 'serie', label: 'Serie' },
  ]
  if (ficha.value.agrupada) cols.push({ id: 'piso', label: 'Piso', sort: 'ubicacion' })
  cols.push(
    { id: 'responsable', label: 'Responsable', sort: 'responsable' },
    { id: 'estado', label: 'Estado', sort: 'estado' },
    { id: 'compra', label: 'Compra', sort: 'fechaCompra' },
    { id: 'costo', label: 'Costo original', sort: 'costoOriginal', num: true },
    { id: 'valor', label: 'Valor actual', sort: 'valorActual', num: true },
    { id: 'vida', label: 'Vida útil / existencia', sort: 'vidaPct' },
    { id: 'garantia', label: 'Garantía', sort: 'garantiaDias' },
    { id: 'resp', label: 'Resp.' },
    { id: 'accion', label: '' },
  )
  return cols
})
const columnasN = computed(() => COLUMNAS.value.length)

function medidor(i) {
  const max = Math.max(i.maximo ?? 0, (i.minimo ?? 0) * 2, i.cantidad ?? 0, 1)
  return {
    fill: Math.min(100, ((i.cantidad ?? 0) / max) * 100),
    min: ((i.minimo ?? 0) / max) * 100,
    max: i.maximo && i.maximo > 0 ? (i.maximo / max) * 100 : null,
  }
}

function textoAlertas(i) {
  const t = []
  if (i.flags.sinResponsable) t.push('Sin responsable')
  if (i.flags.sinResponsiva) t.push('Sin responsiva firmada')
  if (i.flags.danado) t.push('Dañado / en reparación')
  if (i.flags.bajoMinimo) t.push('Bajo el mínimo')
  if (i.flags.sobreMaximo) t.push('Sobre el máximo')
  if (i.flags.garantiaPorVencer) t.push('Garantía por vencer')
  if (i.flags.finVida) t.push('Cerca del fin de vida útil')
  return t.join(' · ')
}

// ---- KPIs ----
/** @typedef {'default' | 'success' | 'warning' | 'danger'} Tono */
const TONO_TEXTO = { default: 'text-text', success: 'text-vz-success', warning: 'text-vz-warning', danger: 'text-vz-danger' }
/**
 * @typedef {object} Kpi
 * @property {string} id
 * @property {string} label
 * @property {number} [amount]
 * @property {(n: number) => string} [format]
 * @property {string} [value]
 * @property {string} [hint]
 * @property {Tono} [tone]
 * @property {string} [accent]
 * @property {() => void} [accion]
 */
const kpis = computed(() => {
  const k = ficha.value.kpis
  const alerta = (n, t = 'danger') => (n > 0 ? t : 'default')
  const todos = [
    { id: 'ti', label: 'Valor actual TI', amount: k.valorTI, format: fmtMoney, hint: `${k.equiposTI} equipos`, accent: '#1F5FAE', accion: () => irInventario({ dominio: 'ti' }) },
    { id: 'mtto', label: 'Valor actual Mantenimiento', amount: k.valorMtto, format: fmtMoney, hint: `${k.equiposMtto} equipos · ${k.materiales} materiales`, accent: '#C8A24B', accion: () => irInventario({ dominio: 'mantenimiento' }) },
    { id: 'inv', label: 'Valor invertido', amount: k.valorInvertido, format: fmtMoney, hint: `Conservado ${Math.round(k.pctConservado)}% · depreciado ${Math.round(k.pctDepreciado)}%`, accent: '#0FA391' },
    { id: 'eq', label: 'Equipos activos', amount: k.equipos, hint: props.dominioFijo === 'sistemas' ? 'Equipos de Sistemas' : props.dominioFijo === 'mantenimiento' ? 'Herramienta y equipo' : `TI ${k.equiposTI} · Mtto ${k.equiposMtto}`, accion: () => irInventario({}) },
    { id: 'mat', label: 'Materiales (renglones)', amount: k.materiales, hint: `${fmtNum(k.unidadesMaterial)} unidades`, accion: () => irInventario({ dominio: 'mantenimiento' }) },
    { id: 'resp', label: 'Responsables', amount: k.responsables, hint: 'Personas con equipo a su cargo' },
    { id: 'sinresp', label: 'Sin responsable', amount: k.sinResponsable, tone: alerta(k.sinResponsable), hint: 'Equipos sin trazabilidad', accion: () => irInventario({ soloSinResponsable: true }) },
    { id: 'sinfirma', label: 'Sin responsiva firmada', amount: k.sinResponsiva, tone: alerta(k.sinResponsiva), hint: `De ${k.asignados} asignados`, accion: () => irInventario({ soloSinResponsiva: true }) },
    { id: 'dan', label: 'Dañados / en reparación', amount: k.danados, tone: alerta(k.danados, 'warning'), hint: 'Equipos fuera de servicio', accion: () => irInventario({ soloDanados: true }) },
    { id: 'min', label: 'Bajo mínimo', amount: k.bajoMinimo, tone: alerta(k.bajoMinimo), hint: k.sobreMaximo > 0 ? `${k.sobreMaximo} sobre máximo` : 'Materiales por reponer', accion: () => irInventario({ soloBajoMinimo: true }) },
    { id: 'gar', label: `Garantías ≤ 90 días`, amount: k.garantiaPorVencer, tone: alerta(k.garantiaPorVencer, 'warning'), hint: k.garantiaVencida > 0 ? `${k.garantiaVencida} ya vencidas` : 'Por vencer', accion: () => irInventario({ soloGarantia: true }) },
    { id: 'vida', label: 'Cerca del fin de vida', amount: k.finVida, tone: alerta(k.finVida, 'warning'), hint: k.finVida > 0 ? `Reponer ≈ ${fmtMoney(k.reposicionFinVida)}` : '≥ 85% de su vida útil', accion: () => irInventario({ soloFinVida: true }) },
    { id: 'antig', label: 'Antigüedad promedio', value: k.antiguedadMeses === null ? '—' : fmtMeses(k.antiguedadMeses), hint: 'Equipos con fecha de compra' },
    { id: 'alertas', label: 'Alertas de control', amount: ficha.value.alertas.length, tone: alerta(ficha.value.alertas.filter((a) => a.severidad === 'alta').length), hint: 'Reglas GV-INF-008 / ADQ-001', accion: irAlertas },
  ]
  // Alcance por rol: Soporte no ve lo de Mantenimiento (ni materiales/mínimos); Mantenimiento no ve lo de TI.
  const ocultos = props.dominioFijo === 'sistemas' ? ['mtto', 'mat', 'min'] : props.dominioFijo === 'mantenimiento' ? ['ti'] : []
  return todos.filter((x) => !ocultos.includes(x.id))
})

// ---- Gráficas (Chart.js no lee variables CSS: se resuelven por tema) ----
const colores = computed(() =>
  theme.value === 'dark'
    ? { ti: '#4B8BD6', mtto: '#D9B65E', invertido: '#35566a', muted: '#9db3bc', border: '#1e3b47', surface: '#102530', text: '#e7eef1' }
    : { ti: '#1F5FAE', mtto: '#C8A24B', invertido: '#cbd6de', muted: '#5b7284', border: '#e2e8ee', surface: '#ffffff', text: '#0a2a35' },
)
const animacion = { duration: reduced ? 0 : 800, easing: 'easeOutQuart' }
const tooltipBase = computed(() => ({
  backgroundColor: colores.value.surface,
  borderColor: colores.value.border,
  borderWidth: 1,
  titleColor: colores.value.text,
  bodyColor: colores.value.text,
  titleFont: { size: 12 },
  bodyFont: { size: 12 },
}))

const alturaGrafica = computed(() => Math.max(190, Math.min(520, ficha.value.familias.length * 46 + 50)))
const familiaBarData = computed(() => ({
  labels: ficha.value.familias.map((fa) => fa.nombre),
  datasets: [
    { label: 'Invertido', data: ficha.value.familias.map((fa) => fa.invertido), backgroundColor: colores.value.invertido, borderRadius: 4, barThickness: 'flex', maxBarThickness: 14 },
    {
      label: 'Valor actual',
      data: ficha.value.familias.map((fa) => fa.valorActual),
      backgroundColor: ficha.value.familias.map((fa) => (fa.dominio === 'ti' ? colores.value.ti : colores.value.mtto)),
      borderRadius: 4,
      barThickness: 'flex',
      maxBarThickness: 14,
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
    tooltip: { ...tooltipBase.value, callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${currency.format(Number(ctx.parsed.x))}` } },
  },
  scales: {
    x: { beginAtZero: true, ticks: { font: { size: 10 }, color: colores.value.muted, callback: (v) => compactMoney.format(Number(v)) }, grid: { color: colores.value.border, borderDash: [3, 3] } },
    y: { ticks: { font: { size: 11 }, color: colores.value.text }, grid: { display: false } },
  },
}))

const ESTADO_COLOR = { disponible: '#12A66B', asignado: '#1F5FAE', danado: '#B0413F', en_reparacion: '#E3A517', baja: '#7C8B96' }
const porEstado = computed(() => {
  const m = new Map()
  for (const i of ficha.value.items) if (i.tipo === 'equipo') m.set(i.estado, (m.get(i.estado) ?? 0) + 1)
  return [...m.entries()].map(([estado, cantidad]) => ({ estado, cantidad })).sort((a, b) => b.cantidad - a.cantidad)
})
const doughnutData = computed(() => ({
  labels: porEstado.value.map((p) => ESTADO_ITEM_LABEL[p.estado] ?? p.estado),
  datasets: [{ data: porEstado.value.map((p) => p.cantidad), backgroundColor: porEstado.value.map((p) => ESTADO_COLOR[p.estado] ?? '#7C8B96'), borderWidth: 0, spacing: 2, hoverOffset: 6 }],
}))
const doughnutOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '58%',
  animation: reduced ? { duration: 0 } : { animateRotate: true, animateScale: true, duration: 900 },
  plugins: { legend: { display: false }, tooltip: { ...tooltipBase.value } },
}))

const maxTramo = computed(() => Math.max(1, ...ficha.value.reposicion.tramos.map((t) => t.n)))
const topFinVida = computed(() =>
  ficha.value.items
    .filter((i) => i.flags.finVida)
    .sort((a, b) => (b.vidaPct ?? 0) - (a.vidaPct ?? 0))
    .slice(0, 8),
)

// ---- Alertas / movimientos ----
const alertaAbierta = ref(null)
function irAlertas() {
  tab.value = 'resumen'
  void nextTick(() => document.getElementById('ficha-alertas')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }))
}
const SEVERIDAD_LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' }
const SEVERIDAD_TONE = { alta: 'danger', media: 'warning', baja: 'info' }

const TIPO_MOV_LABEL = {
  asignacion: 'Alta / asignación',
  reasignacion: 'Reasignación',
  cambio_estado: 'Cambio de estado',
  baja: 'Baja',
  entrada: 'Entrada de material',
  consumo: 'Salida de material',
  traslado_salida: 'Traslado enviado',
  traslado_entrada: 'Traslado recibido',
  responsiva: 'Responsiva',
  devolucion: 'Devolución',
}
function colorMov(t) {
  if (t === 'baja') return '#B0413F'
  if (t === 'entrada' || t === 'traslado_entrada') return '#12A66B'
  if (t === 'consumo' || t === 'traslado_salida') return '#E3A517'
  if (t === 'responsiva' || t === 'devolucion') return '#0E7490'
  return '#1F5FAE'
}

// ---- Navegación (la ficha es de solo lectura) ----
function cerrar() {
  abierto.value = false
}
function irRuta(path) {
  void router.push(path)
  cerrar()
}
function irAuditorias() {
  void router.push('/auditorias')
  cerrar()
}
function irItem(i) {
  void router.push({ path: i.ruta.path, query: i.ruta.query })
  cerrar()
}

// ---- Exportar ----
function exportarExcel() {
  const filas = filtrados.value.map((i) => ({
    Tipo: i.tipo === 'equipo' ? 'Equipo' : 'Material',
    Dominio: i.dominio === 'ti' ? 'TI' : 'Mantenimiento',
    Familia: i.familia,
    'Nombre / modelo': i.nombre,
    Marca: i.marca ?? '',
    'Número de serie': i.serie ?? '',
    Ubicación: i.ubicacion,
    Responsable: i.tipo === 'equipo' ? (i.responsable ?? 'SIN RESPONSABLE') : '',
    Estado: i.estadoLabel,
    'Fecha de compra': i.fechaCompra ?? '',
    'Costo original': Math.round(i.costoOriginal * 100) / 100,
    'Valor actual': Math.round(i.valorActual * 100) / 100,
    '% vida útil consumida': i.vidaPct === null ? '' : Math.round(i.vidaPct * 100),
    'Garantía restante (días)': i.garantiaDias ?? '',
    'Responsiva firmada': i.responsivaFirmada === null ? '' : i.responsivaFirmada ? 'Sí' : 'No',
    Existencia: i.cantidad ?? '',
    Unidad: i.unidad ?? '',
    Mínimo: i.minimo ?? '',
    Máximo: i.maximo ?? '',
    Alertas: textoAlertas(i),
  }))
  const k = ficha.value.kpis
  const filtrosTxt = [
    f.dominio !== 'todo' ? `Dominio: ${f.dominio === 'ti' ? 'TI' : 'Mantenimiento'}` : '',
    f.familiaId ? `Familia: ${ficha.value.familias.find((fa) => fa.familiaId === f.familiaId)?.nombre ?? f.familiaId}` : '',
    f.estado ? `Estado: ${ESTADO_ITEM_LABEL[f.estado] ?? f.estado}` : '',
    f.responsable ? `Responsable: ${f.responsable === SIN_RESPONSABLE ? 'sin responsable' : f.responsable}` : '',
    f.q.trim() ? `Búsqueda: ${f.q.trim()}` : '',
    ...TOGGLES.filter((t) => f[t.key]).map((t) => t.label),
  ].filter(Boolean)
  const resumen = [
    { Concepto: 'Ficha de', Valor: ficha.value.nombre },
    { Concepto: 'Fecha', Valor: hoy },
    { Concepto: 'Filtros aplicados', Valor: filtrosTxt.join(' · ') || 'Ninguno' },
    { Concepto: 'Partidas exportadas', Valor: filtrados.value.length },
    { Concepto: 'Valor actual (exportado)', Valor: Math.round(totales.value.valorActual) },
    { Concepto: 'Invertido (exportado)', Valor: Math.round(totales.value.invertido) },
    { Concepto: 'Valor actual TI (ficha)', Valor: Math.round(k.valorTI) },
    { Concepto: 'Valor actual Mantenimiento (ficha)', Valor: Math.round(k.valorMtto) },
    { Concepto: 'Valor invertido (ficha)', Valor: Math.round(k.valorInvertido) },
    { Concepto: 'Equipos sin responsable (ficha)', Valor: k.sinResponsable },
    { Concepto: 'Sin responsiva firmada (ficha)', Valor: k.sinResponsiva },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Inventario')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen')
  const slug = ficha.value.nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
  XLSX.writeFile(wb, `ficha_${slug || 'sucursal'}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
</script>

<style>
.vz-ficha-bar {
  transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (prefers-reduced-motion: reduce) {
  .vz-ficha-bar {
    transition: none !important;
  }
}
</style>
