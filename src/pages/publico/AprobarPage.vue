<template>
  <PublicShell :nav="false" ancho="normal">
    <!-- Cargando -->
    <div v-if="cargando" class="flex flex-col gap-4" role="status" aria-live="polite" aria-label="Cargando la requisición">
      <div :class="`${tarjeta} flex flex-col gap-3`">
        <SkeletonBlock cls="h-5 w-40" />
        <SkeletonBlock cls="h-8 w-80 max-w-full" />
        <SkeletonBlock cls="h-14 w-60 max-w-full" />
      </div>
      <div :class="`${tarjeta} flex flex-col gap-3`">
        <SkeletonBlock v-for="i in 5" :key="i" cls="h-9 w-full" />
      </div>
    </div>

    <!-- Liga inválida -->
    <div v-else-if="invalida" :class="`${tarjeta} mx-auto mt-4 max-w-lg text-center`">
      <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-vz-warning/15 text-vz-warning">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-7 w-7" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <h1 class="text-[19px] font-extrabold text-text">Esta liga no es válida</h1>
      <p class="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-snug text-text-muted">No encontramos ninguna autorización con esta liga. Revisa que esté completa o abre de nuevo el botón desde tu correo. Si el problema sigue, pide a Adquisiciones que te reenvíen la solicitud.</p>
    </div>

    <!-- Error de carga -->
    <div v-else-if="errorCarga" :class="`${tarjeta} mx-auto mt-4 max-w-lg text-center`" role="alert">
      <h1 class="text-[18px] font-extrabold text-text">No pudimos abrir la solicitud</h1>
      <p class="mt-1 text-[13.5px] text-text-muted">{{ errorCarga }}</p>
      <button type="button" :class="`${btnPrimario} mt-4`" @click="cargar">Reintentar</button>
    </div>

    <!-- Resultado -->
    <div v-else-if="resultado" class="mx-auto flex max-w-xl flex-col gap-4">
      <div :class="`${tarjeta} text-center`">
        <div :class="`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${resultadoVisual.fondo}`">
          <svg v-if="resultado.decision === 'aprobada'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="h-7 w-7" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          <svg v-else-if="resultado.decision === 'rechazada'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="h-7 w-7" aria-hidden="true"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-7 w-7" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
        </div>
        <h1 ref="tituloResultado" tabindex="-1" class="text-[21px] font-extrabold leading-tight text-text outline-none">{{ resultadoVisual.titulo }}</h1>
        <p class="mt-1.5 text-[14px] font-semibold text-text">El correo que recibas es tu comprobante.</p>
        <p v-if="resultado.mensaje" class="mx-auto mt-1 max-w-sm text-[13.5px] leading-snug text-text-muted">{{ resultado.mensaje }}</p>
        <p class="mt-4 inline-block rounded-xl bg-bg px-4 py-2 text-[15px] font-extrabold text-text">{{ resultado.folio }}</p>
        <p class="mt-4 text-[12.5px] text-text-soft">Ya puedes cerrar esta ventana. Esta liga es de un solo uso.</p>
      </div>
    </div>

    <!-- Solicitud -->
    <div v-else-if="v" class="flex flex-col gap-4">
      <!-- Encabezado -->
      <section :class="tarjeta" aria-labelledby="ap-titulo">
        <div class="flex flex-wrap items-center gap-2">
          <span :class="`rounded-full px-3 py-1 text-[11.5px] font-extrabold uppercase tracking-wider ${v.nivel === 'finanzas' ? 'bg-vz-blue/12 text-vz-blue' : 'bg-vz-gold/25 text-text'}`">
            {{ v.nivel === 'finanzas' ? 'Autorización de Finanzas' : `Liga anterior de ${NIVEL_LABEL_FRASE[v.nivel]}` }}
          </span>
          <span v-if="v.urgencia === 'urgente'" class="rounded-full bg-vz-danger px-3 py-1 text-[11.5px] font-extrabold uppercase tracking-wider text-white">Urgente</span>
        </div>
        <p class="mt-3 text-[13.5px] text-text-muted">Hola<template v-if="v.aprobador">, <span class="font-bold text-text">{{ v.aprobador }}</span></template>. Revisa la compra y registra tu decisión.</p>
        <h1 id="ap-titulo" class="mt-0.5 break-all text-[22px] font-extrabold leading-tight text-text sm:text-[26px]">{{ v.folio }}</h1>
        <div class="mt-4 rounded-2xl border border-vz-blue/25 bg-vz-blue/8 px-4 py-3.5">
          <p class="text-[11.5px] font-bold uppercase tracking-wider text-text-muted">Monto a autorizar</p>
          <p class="text-[30px] font-extrabold leading-tight tracking-tight text-text sm:text-[36px]">{{ formatoMoneda(v.monto) }}</p>
          <p v-if="v.proveedorElegido" class="mt-0.5 text-[13px] text-text-muted">Proveedor elegido: <span class="font-bold text-text">{{ v.proveedorElegido }}</span></p>
        </div>
        <p v-if="leyendaMenor" class="mt-3 rounded-xl border border-vz-warning/45 bg-vz-warning/10 px-3.5 py-2.5 text-[14px] font-extrabold leading-snug text-text" role="note" data-test="leyenda-compra-menor">{{ leyendaMenor }}</p>
      </section>

      <!-- Estado de la liga -->
      <section v-if="!puedeDecidir" class="flex gap-3 rounded-2xl border border-vz-warning/45 bg-vz-warning/10 p-4" role="status" aria-live="polite">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="mt-0.5 h-6 w-6 shrink-0 text-vz-warning" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
        <div>
          <p class="text-[15px] font-extrabold text-text">{{ bloqueo.titulo }}</p>
          <p class="mt-0.5 text-[13.5px] leading-snug text-text-muted">{{ bloqueo.texto }}</p>
        </div>
      </section>

      <!-- Resumen -->
      <section :class="tarjeta" aria-labelledby="ap-resumen">
        <h2 id="ap-resumen" class="mb-3 text-[16px] font-extrabold text-text">Resumen de la solicitud</h2>
        <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div><dt class="dt">Solicitante</dt><dd class="dd">{{ v.solicitante }}</dd></div>
          <div><dt class="dt">Área</dt><dd class="dd">{{ v.area || '—' }}</dd></div>
          <div v-if="sucursales.length" class="sm:col-span-2">
            <dt class="dt">Sucursal(es)</dt>
            <dd class="mt-1 flex flex-wrap gap-1.5"><span v-for="s in sucursales" :key="s" class="rounded-full border border-border bg-bg px-2.5 py-1 text-[12.5px] font-semibold text-text">{{ s }}</span></dd>
          </div>
          <div><dt class="dt">Para quién es</dt><dd class="dd">{{ v.paraQuien || '—' }}</dd></div>
          <div><dt class="dt">Urgencia</dt><dd :class="`dd ${v.urgencia === 'urgente' ? '!text-vz-danger' : ''}`">{{ v.urgencia === 'urgente' ? 'Urgente' : 'Normal' }}</dd></div>
        </dl>

        <h3 class="mb-2 mt-5 text-[13px] font-extrabold uppercase tracking-wider text-text-soft">Partidas</h3>
        <ul class="divide-y divide-border rounded-xl border border-border">
          <li v-for="p in v.partidas" :key="p.num" class="flex items-center gap-3 px-3.5 py-2.5">
            <span class="flex h-6 min-w-6 items-center justify-center rounded-full bg-vz-blue/12 px-1 text-[11.5px] font-extrabold text-vz-blue" aria-hidden="true">{{ p.num }}</span>
            <span class="min-w-0 flex-1 text-[14px] font-semibold text-text">{{ p.producto }}</span>
            <span class="shrink-0 rounded-lg bg-bg px-2.5 py-1 text-[13px] font-extrabold text-text">× {{ p.cantidad }}</span>
          </li>
        </ul>
      </section>

      <!-- Proveedor elegido (catálogo): SIN CLABE ni dirección fiscal -->
      <section v-if="v.proveedor" :class="tarjeta" aria-labelledby="ap-prov" data-test="tarjeta-proveedor">
        <h2 id="ap-prov" class="mb-3 text-[16px] font-extrabold text-text">Proveedor</h2>
        <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div><dt class="dt">Nombre comercial</dt><dd class="dd">{{ v.proveedor.nombreComercial }}</dd></div>
          <div><dt class="dt">Razón social</dt><dd class="dd">{{ v.proveedor.razonSocial || '—' }}</dd></div>
          <div><dt class="dt">RFC</dt><dd class="dd font-mono">{{ v.proveedor.rfc || '—' }}</dd></div>
          <div><dt class="dt">Tipo</dt><dd class="dd">{{ TIPO_PROVEEDOR_LABEL[v.proveedor.tipo] }}</dd></div>
          <div><dt class="dt">Forma de pago</dt><dd class="dd">{{ FORMA_PAGO_LABEL[v.proveedor.formaPago] }}</dd></div>
          <div><dt class="dt">El pago lo hace</dt><dd class="dd">{{ DESTINO_PAGO_LABEL[v.proveedor.destino] }}</dd></div>
        </dl>
        <p class="mt-3 text-[12px] leading-snug text-text-soft">Por seguridad esta liga no muestra datos bancarios ni la dirección fiscal del proveedor.</p>
      </section>

      <!-- Comparativo -->
      <section :class="tarjeta" aria-labelledby="ap-comp">
        <h2 id="ap-comp" class="text-[16px] font-extrabold text-text">Comparativo de cotizaciones</h2>
        <p v-if="leyendaMenor" class="mt-0.5 text-[12.5px] text-text-muted">Registro de compra menor: una sola línea, sin comparativo.</p>
        <p v-else class="mt-0.5 text-[12.5px] text-text-muted">{{ v.cotizaciones.length }} {{ v.cotizaciones.length === 1 ? 'cotización recibida' : 'cotizaciones recibidas' }}<template v-if="v.cotizacionesRequeridas > 1"> · {{ v.cotizacionesCompletas }} completa{{ v.cotizacionesCompletas === 1 ? '' : 's' }} de proveedores distintos de {{ v.cotizacionesRequeridas }} requeridas<template v-if="v.excepcionCotizaciones && v.cotizacionesCompletas < v.cotizacionesRequeridas"> (con excepción documentada)</template></template>.</p>

        <!-- Recomendación del comparativo -->
        <div v-if="recomendada && cotizacionesOrdenadas.length > 1" class="mt-3 rounded-2xl border border-vz-blue/30 bg-vz-blue/8 px-4 py-3" role="note" aria-labelledby="ap-rec">
          <p id="ap-rec" class="text-[11.5px] font-bold uppercase tracking-wider text-text-muted">Recomendación del comparativo</p>
          <p class="mt-0.5 text-[15px] font-extrabold leading-snug text-text">{{ recomendada.proveedor }} <span class="font-semibold text-text-muted">· puntaje {{ recomendada.puntaje }}/100</span></p>
          <ul v-if="recomendada.razones.length" class="m-0 mt-1.5 flex list-none flex-wrap gap-1.5 p-0" aria-label="Por qué se recomienda">
            <li v-for="r in recomendada.razones" :key="r" class="rounded-full bg-vz-blue/15 px-2.5 py-0.5 text-[12px] font-bold text-text">{{ r }}</li>
          </ul>
          <p class="mt-1.5 text-[12px] leading-snug text-text-soft">El puntaje (0 a 100) pondera precio, garantía, entrega, crédito, respaldo de marca, condiciones y experiencia previa con el proveedor. Es una guía: la decisión es tuya.</p>
        </div>

        <ul v-if="cotizacionesOrdenadas.length" class="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
          <li
            v-for="c in cotizacionesOrdenadas"
            :key="c.id"
            :class="`rounded-xl border-2 p-3 ${c.elegida ? 'border-vz-blue/50 bg-vz-blue/6' : c.esMasBarata ? 'border-vz-success/60 bg-vz-success/8' : 'border-border bg-bg'}`"
          >
            <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p class="min-w-0 text-[14.5px] font-extrabold text-text">{{ c.proveedor }}</p>
              <p class="text-[17px] font-extrabold text-text">{{ formatoMoneda(c.total) }}</p>
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span v-if="c.elegida" class="rounded-full bg-vz-blue px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white">Elegida</span>
              <span v-if="c.esRegistro" class="rounded-full border border-vz-warning/45 bg-vz-warning/10 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-text">Registro de compra menor</span>
              <span v-if="c.analisis?.esRecomendada && cotizacionesOrdenadas.length > 1 && !c.esRegistro" class="rounded-full bg-vz-gold px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-text">Recomendada</span>
              <span v-if="c.esMasBarata && !c.esRegistro" class="rounded-full bg-vz-success px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white">Más barata</span>
              <span v-for="i in c.esRegistro ? [] : insigniasExtra(c)" :key="i" class="rounded-full border border-border px-2.5 py-0.5 text-[11.5px] font-semibold text-text-muted">{{ i }}</span>
              <span v-if="!c.esMasBarata && masBarata && c.total - masBarata.total > 0.004" class="text-[12px] font-semibold text-text-muted">+{{ formatoMoneda(c.total - masBarata.total) }} ({{ porcentaje(c.total, masBarata.total) }})</span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
              <div :class="`h-full rounded-full ${c.esMasBarata ? 'bg-vz-success' : 'bg-vz-steel'}`" :style="{ width: `${anchoBarra(c.total)}%` }" />
            </div>

            <!-- Criterios clave -->
            <dl v-if="!c.esRegistro" class="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px] sm:grid-cols-3">
              <div v-if="cotizacionesOrdenadas.length > 1 && !c.esRegistro"><dt class="dtc">Puntaje</dt><dd class="ddc">{{ c.analisis?.elegible ? `${c.analisis.puntaje}/100` : '—' }}</dd></div>
              <div><dt class="dtc">Entrega</dt><dd class="ddc">{{ textoEntrega(c) }}</dd></div>
              <div><dt class="dtc">Garantía</dt><dd class="ddc">{{ textoGarantia(c) }}</dd></div>
              <div><dt class="dtc">Crédito</dt><dd class="ddc">{{ textoCredito(c) }}</dd></div>
              <div><dt class="dtc">Anticipo</dt><dd class="ddc">{{ textoAnticipo(c) }}</dd></div>
              <div><dt class="dtc">Distribuidor autorizado</dt><dd class="ddc">{{ textoSiNo(c.distribuidorAutorizado) }}</dd></div>
            </dl>
            <details v-if="!c.esRegistro" class="mt-2 text-[12.5px]">
              <summary class="cursor-pointer select-none font-bold text-vz-blue">Más detalle</summary>
              <dl class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
                <div><dt class="dtc">Soporte técnico</dt><dd class="ddc">{{ textoSiNo(c.soporteTecnico) }}</dd></div>
                <div><dt class="dtc">Acepta devoluciones</dt><dd class="ddc">{{ textoSiNo(c.aceptaDevoluciones) }}</dd></div>
                <div><dt class="dtc">Vigencia</dt><dd class="ddc">{{ c.vigenciaHasta ? fechaIso(c.vigenciaHasta) : '—' }}</dd></div>
                <div><dt class="dtc">Calificación del proveedor</dt><dd class="ddc">{{ c.calificacionProveedor ? `${c.calificacionProveedor}/5` : '—' }}</dd></div>
                <div class="col-span-2 sm:col-span-3">
                  <dt class="dtc">Cómo se calcula el total</dt>
                  <dd class="ddc !font-normal">
                    Partidas {{ formatoMoneda(c.analisis?.desglose.subtotal ?? c.subtotal) }}<template v-if="(c.analisis?.desglose.descuento ?? 0) > 0"> − descuento {{ formatoMoneda(c.analisis?.desglose.descuento ?? 0) }}</template><template v-if="(c.analisis?.desglose.flete ?? 0) > 0"> + flete {{ formatoMoneda(c.analisis?.desglose.flete ?? 0) }}</template><template v-if="c.ivaIncluido === false"> + IVA {{ formatoMoneda(c.analisis?.desglose.iva ?? 0) }} (el proveedor cotizó sin IVA)</template> = <b>{{ formatoMoneda(c.total) }}</b>
                  </dd>
                </div>
              </dl>
            </details>

            <!-- Alertas -->
            <ul v-if="!c.esRegistro && c.analisis?.alertas.length" class="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0" aria-label="Alertas de esta cotización">
              <li
                v-for="a in c.analisis.alertas"
                :key="a.id"
                :title="a.detalle"
                :class="`rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold ${a.tono === 'danger' ? 'border-vz-danger/40 bg-vz-danger/10 text-vz-danger' : a.tono === 'warning' ? 'border-vz-warning/45 bg-vz-warning/10 text-vz-warning' : 'border-border bg-surface text-text-muted'}`"
              >{{ a.label }}</li>
            </ul>
          </li>
        </ul>
        <p v-else class="mt-3 rounded-xl border border-border bg-bg px-3 py-3 text-[13px] text-text-muted">No hay cotizaciones registradas para mostrar.</p>

        <div v-if="elegida && avisoEleccion" class="mt-3 flex gap-2.5 rounded-xl border border-vz-warning/50 bg-vz-warning/10 p-3" role="note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="mt-0.5 h-5 w-5 shrink-0 text-vz-warning" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
          <div class="min-w-0">
            <p class="text-[13.5px] font-extrabold text-text">{{ avisoEleccion }}</p>
            <p class="mt-0.5 text-[13px] leading-snug text-text-muted"><span class="font-bold">Justificación de Adquisiciones:</span> {{ elegida.justificacion || 'No se registró una justificación.' }}</p>
          </div>
        </div>
        <p v-else-if="elegida?.justificacion" class="mt-3 rounded-xl border border-border bg-bg px-3 py-2.5 text-[13px] leading-snug text-text-muted"><span class="font-bold text-text">Por qué se eligió:</span> {{ elegida.justificacion }}</p>

        <div v-if="v.excepcionCotizaciones" class="mt-3 flex gap-2.5 rounded-xl border border-vz-gold/60 bg-vz-gold/12 p-3" role="note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="mt-0.5 h-5 w-5 shrink-0 text-vz-gold" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          <div class="min-w-0">
            <p class="text-[13.5px] font-extrabold text-text">Excepción de cotizaciones</p>
            <p class="mt-0.5 text-[13px] leading-snug text-text-muted" data-test="excepcion-cotizaciones">{{ textoExcepcion(v.excepcionCotizaciones) }}</p>
          </div>
        </div>
      </section>

      <!-- Monto vs umbrales -->
      <section :class="tarjeta" aria-labelledby="ap-umbral">
        <h2 id="ap-umbral" class="text-[16px] font-extrabold text-text">Quién autoriza</h2>
        <p class="mt-1 text-[13.5px] leading-snug text-text">
          La decide <span class="font-extrabold">Finanzas</span>: basta que decida <span class="font-extrabold">uno</span> de los aprobadores cuyo tope cubre este monto, y con esa decisión se cierra la autorización.
          <template v-if="v.avisaDireccion"> Por su monto, Dirección recibió un aviso informativo; no tiene que autorizarla.</template>
        </p>
        <div v-if="umbrales" class="mt-3">
          <div class="relative h-2.5 overflow-hidden rounded-full bg-border" role="img" :aria-label="`Monto ${formatoMoneda(v.monto)} frente al umbral de ${umbrales.etiqueta} ${formatoMoneda(umbrales.referencia)}`">
            <div :class="`h-full rounded-full ${v.monto > umbrales.referencia ? 'bg-vz-gold' : 'bg-vz-blue'}`" :style="{ width: `${Math.min(100, (v.monto / Math.max(umbrales.referencia, 1)) * 100)}%` }" />
          </div>
          <div class="mt-1.5 flex justify-between text-[12px] text-text-muted">
            <span>Esta compra: <span class="font-bold text-text">{{ formatoMoneda(v.monto) }}</span></span>
            <span>Umbral de {{ umbrales.etiqueta }}: <span class="font-bold text-text">{{ formatoMoneda(umbrales.referencia) }}</span></span>
          </div>
          <p class="mt-1 text-[11.5px] text-text-soft">Por debajo de {{ formatoMoneda(umbrales.simple) }} basta una cotización; desde ahí se piden {{ umbrales.minimas }} de proveedores distintos o una excepción documentada.</p>
        </div>

        <ul v-if="v.aprobaciones.length" class="mt-4 flex flex-col gap-2">
          <li v-for="(a, i) in v.aprobaciones" :key="i" class="flex items-start gap-2.5 rounded-xl border border-border bg-bg px-3 py-2.5">
            <span :class="`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${a.decision === 'aprobada' ? 'bg-vz-success' : a.decision === 'rechazada' ? 'bg-vz-danger' : 'bg-vz-warning'}`" aria-hidden="true" />
            <div class="min-w-0 text-[13px] leading-snug">
              <p class="font-bold text-text">{{ NIVEL_LABEL[a.nivel] }} · {{ etiquetaDecision(a.decision) }} <span class="font-normal text-text-muted">por {{ a.aprobador }} · {{ fechaHora(a.fecha) }}</span></p>
              <p v-if="a.comentario" class="mt-0.5 text-text-muted">«{{ a.comentario }}»</p>
            </div>
          </li>
        </ul>
      </section>

      <!-- Separación de funciones -->
      <section v-if="avisosSeparacion.length" class="rounded-2xl border border-vz-warning/50 bg-vz-warning/10 p-4" role="note" aria-labelledby="ap-sep">
        <h2 id="ap-sep" class="text-[15px] font-extrabold text-text">Revisa la separación de funciones</h2>
        <ul class="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[13px] leading-snug text-text-muted">
          <li v-for="(a, i) in avisosSeparacion" :key="i">{{ a }}</li>
        </ul>
      </section>

      <!-- Decisión -->
      <section v-if="puedeDecidir" id="ap-decision" ref="seccionDecision" :class="tarjeta" aria-labelledby="ap-dec-t">
        <h2 id="ap-dec-t" class="text-[17px] font-extrabold text-text">Tu decisión</h2>
        <p v-if="vinoPreseleccion" class="mt-1 text-[13px] text-text-muted">Elegiste «{{ etiquetaDecisionAccion(decision) }}» desde el correo. Todavía <span class="font-bold">no se ha registrado nada</span>: revisa y confirma abajo.</p>
        <p v-else class="mt-1 text-[13px] text-text-muted">Elige una opción y confirma. No se registra nada hasta que presiones el botón de confirmar.</p>

        <div role="radiogroup" aria-labelledby="ap-dec-t" class="mt-3 grid gap-2.5 sm:grid-cols-3">
          <label v-for="o in opciones" :key="o.id" class="relative cursor-pointer">
            <input v-model="decision" type="radio" name="decision" :value="o.id" class="peer sr-only" />
            <span :class="`flex h-full flex-col gap-1 rounded-2xl border-2 border-border bg-bg p-3.5 transition-colors hover:bg-surface-hover peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${o.clase}`">
              <span class="flex items-center gap-2 text-[15px] font-extrabold text-text">
                <span :class="`flex h-6 w-6 items-center justify-center rounded-full ${o.icono}`" aria-hidden="true">
                  <svg v-if="o.id === 'aprobada'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="h-3.5 w-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  <svg v-else-if="o.id === 'rechazada'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="h-3.5 w-3.5"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="h-3.5 w-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l3 2" /></svg>
                </span>
                {{ o.titulo }}
              </span>
              <span class="text-[12.5px] leading-snug text-text-muted">{{ o.texto }}</span>
            </span>
          </label>
        </div>

        <CampoForm
          class="mt-4"
          :label="decision === 'aprobada' || !decision ? 'Comentario' : decision === 'rechazada' ? 'Motivo del rechazo' : '¿Qué hay que ajustar?'"
          for-id="ap-comentario"
          :required="comentarioObligatorio"
          :opcional="!comentarioObligatorio"
          :error="intento && comentarioObligatorio && comentario.trim().length < 5 ? 'Escribe el motivo (mínimo 5 letras); queda en el registro.' : undefined"
          :hint="decision === 'ajuste' ? 'Adquisiciones volverá a cotizar con lo que indiques.' : decision === 'rechazada' ? 'El solicitante y Adquisiciones recibirán este motivo.' : 'Opcional. Queda en el registro de la autorización.'"
        >
          <textarea id="ap-comentario" v-model="comentario" rows="3" maxlength="500" :class="`${area} ${intento && comentarioObligatorio && comentario.trim().length < 5 ? inpError : ''}`" placeholder="Escribe aquí tu comentario" />
        </CampoForm>

        <button type="button" :class="`${decision === 'rechazada' ? btnPeligro : btnPrimario} mt-4 w-full`" :disabled="!decision" @click="pedirConfirmacion">
          {{ decision ? textoBoton : 'Elige una opción para continuar' }}
        </button>
        <p class="mt-2 text-center text-[12px] text-text-soft">La decisión queda registrada con tu nombre y la fecha, y es definitiva para esta liga.</p>
      </section>
    </div>

    <!-- Atajo en el celular: la decisión queda al final de la página, así que una barra fija lleva directo a ella -->
    <div v-if="v && puedeDecidir && !decisionVisible && !resultado" class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur sm:hidden" role="region" aria-label="Ir a tu decisión">
      <div class="mx-auto flex max-w-md items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[11px] font-bold uppercase tracking-wider text-text-muted">Monto a autorizar</p>
          <p class="truncate text-[17px] font-extrabold leading-tight text-text">{{ formatoMoneda(v.monto) }}</p>
        </div>
        <button type="button" :class="btnPrimario" @click="irADecision">Ir a mi decisión</button>
      </div>
    </div>

    <!-- Confirmación explícita -->
    <AppModal v-if="confirmando && v" :title="tituloConfirmacion" @close="cerrarConfirmacion">
      <div class="flex flex-col gap-3 text-[13.5px]">
        <p class="leading-snug text-text">
          Vas a <span class="font-extrabold">{{ verbo }}</span> la requisición <span class="font-extrabold">{{ v.folio }}</span> por <span class="font-extrabold">{{ formatoMoneda(v.monto) }}</span><template v-if="v.proveedorElegido"> con {{ v.proveedorElegido }}</template>.
        </p>
        <p v-if="comentario.trim()" class="rounded-xl bg-bg px-3 py-2 text-[13px] leading-snug text-text-muted">«{{ comentario.trim() }}»</p>
        <p class="text-[12.5px] leading-snug text-text-muted">Quedará registrado{{ v.aprobador ? ` a nombre de ${v.aprobador}` : '' }}. Esta acción no se puede deshacer desde aquí.</p>
        <p v-if="errorEnvio" role="alert" class="rounded-xl border border-vz-danger/40 bg-vz-danger/5 px-3 py-2 text-[13px] font-semibold text-vz-danger">{{ errorEnvio }}</p>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" :class="btnSecundario" :disabled="enviando" @click="cerrarConfirmacion">Volver</button>
          <button type="button" :class="decision === 'rechazada' ? btnPeligro : btnPrimario" :disabled="enviando" @click="enviar">{{ enviando ? 'Registrando…' : textoConfirmar }}</button>
        </div>
      </div>
    </AppModal>
  </PublicShell>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppModal from 'components/AppModal.vue'
import PublicShell from 'components/compras/publico/PublicShell.vue'
import SkeletonBlock from 'components/compras/publico/SkeletonBlock.vue'
import CampoForm from 'components/compras/publico/CampoForm.vue'
import { area, btnPeligro, btnPrimario, btnSecundario, fechaHora, fechaIso, inpError, norm, tarjeta } from 'components/compras/publico/estilos'
import { getUbicacion } from 'src/lib/inventario/comunes'
import {
  ESTADOS,
  aprobarPorToken,
  analisisDeVista,
  avisosSeparacionFunciones,
  comprasModoLocal,
  evaluarEleccion,
  textoAnticipo,
  textoCredito,
  textoEntrega,
  textoGarantia,
  textoSiNo,
  formatoMoneda,
  getConfig,
  textoLeyendaCompraMenor,
  textoExcepcion,
  DESTINO_PAGO_LABEL,
  FORMA_PAGO_LABEL,
  TIPO_PROVEEDOR_LABEL,
  NIVEL_LABEL,
  NIVEL_LABEL_FRASE,
  getRequisicion,
  loadComprasCaches,
  verParaAprobar,
} from 'src/lib/compras'

/** @typedef {DecisionAprobacion} Decision */

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

const cargando = ref(true)
const invalida = ref(false)
const errorCarga = ref('')
const v = ref(null)

const decision = ref('')
const vinoPreseleccion = ref(false)
const comentario = ref('')
const intento = ref(false)
const confirmando = ref(false)
const enviando = ref(false)
const errorEnvio = ref('')
const resultado = ref(null)
const tituloResultado = ref(null)
const seccionDecision = ref(null)
const decisionVisible = ref(false)
let observador = null
// La sección de decisión aparece con v-if: se observa cuando existe y se suelta cuando desaparece.
watch(seccionDecision, (el) => {
  observador?.disconnect()
  observador = null
  decisionVisible.value = false
  if (el && typeof IntersectionObserver !== 'undefined') {
    observador = new IntersectionObserver((e) => { decisionVisible.value = e.some((x) => x.isIntersecting) }, { threshold: 0.15 })
    observador.observe(el)
  }
})
onBeforeUnmount(() => observador?.disconnect())
function irADecision() {
  seccionDecision.value?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

// ---------------------------------------------------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------------------------------------------------
async function cargar() {
  cargando.value = true
  invalida.value = false
  errorCarga.value = ''
  try {
    if (comprasModoLocal()) {
      try {
        await loadComprasCaches()
      } catch {
        /* se usan las cachés mínimas que carga verParaAprobar */
      }
    }
    const r = await verParaAprobar(token.value)
    if (!r) {
      v.value = null
      invalida.value = true
    } else {
      v.value = r
      preseleccionar()
    }
  } catch (e) {
    errorCarga.value = e instanceof Error && e.message ? 'Revisa tu conexión e intenta de nuevo.' : 'Intenta de nuevo en unos minutos.'
  } finally {
    cargando.value = false
  }
}

/** `?d=` solo PRESELECCIONA la opción; jamás ejecuta nada al abrir (los antivirus de correo abren las ligas). */
function preseleccionar() {
  const d = String(route.query.d ?? '')
  if (d === 'aprobada' || d === 'rechazada' || d === 'ajuste') {
    decision.value = d
    vinoPreseleccion.value = true
    void nextTick(() => seccionDecision.value?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }))
  }
}

onMounted(cargar)
watch(token, () => {
  v.value = null
  resultado.value = null
  decision.value = ''
  comentario.value = ''
  void cargar()
})

// ---------------------------------------------------------------------------------------------------------------------
// Derivados
// ---------------------------------------------------------------------------------------------------------------------
const puedeDecidir = computed(() => !!v.value && !v.value.usado && !v.value.expirado && v.value.valida && v.value.estado === 'en_autorizacion')

const bloqueo = computed(() => {
  const x = v.value
  if (!x) return { titulo: '', texto: '' }
  if (x.usado)
    return {
      titulo: 'Esta liga ya fue utilizada',
      texto: `La decisión ya quedó registrada. Si fuiste tú, el correo que recibiste es tu comprobante. Estatus actual: ${ESTADOS[x.estado].label}.`,
    }
  if (x.expirado)
    return {
      titulo: 'Esta liga venció',
      texto: 'Por seguridad las ligas de autorización tienen una vigencia limitada. Pide a Adquisiciones que te reenvíen la solicitud.',
    }
  if (!x.valida)
    return {
      titulo: 'Esta liga ya no es válida',
      texto: (x.motivoNoValida ?? 'La autorización la resuelve Finanzas.').replace(/^Esta liga ya no es válida:\s*/i, '').replace(/^./, (c) => c.toUpperCase()),
    }
  return {
    titulo: 'Esta requisición ya no espera tu decisión',
    texto: `Su estatus actual es «${ESTADOS[x.estado].label}». Puede que otra persona ya la haya resuelto o que se haya enviado a ajuste.`,
  }
})

const sucursales = computed(() => {
  try {
    const r = v.value ? getRequisicion(v.value.folio) : undefined
    return r ? r.ubicaciones.map((u) => getUbicacion(u)?.nombre ?? u) : []
  } catch {
    return []
  }
})

/** Puntaje, recomendación y alertas: misma función pura que usa el cotizador, alimentada con los datos crudos de la liga. */
const analisis = computed(() => (v.value ? analisisDeVista(v.value) : null))
const cotizacionesOrdenadas = computed(() => {
  const x = v.value
  if (!x) return []
  const a = analisis.value
  const lista = [...x.cotizaciones].sort((p, q) => p.total - q.total)
  return lista.map((c) => {
    const fila = a?.filas.find((f) => f.id === c.id)
    return { ...c, analisis: fila, esMasBarata: !!fila?.esMasBarata && lista.length > 1 }
  })
})
const recomendada = computed(() => analisis.value?.filas.find((f) => f.id === analisis.value?.recomendadaId))
/** Insignias adicionales (Mayor garantía, Entrega más rápida…); Recomendada y Más barata ya llevan su propia etiqueta. */
const insigniasExtra = (c) =>
  (c.analisis?.insignias ?? []).filter((i) => i.id !== 'recomendada' && i.id !== 'mas_barata' && i.id !== 'distribuidor').map((i) => i.label)
const masBarata = computed(() => cotizacionesOrdenadas.value.find((c) => c.total > 0 && c.analisis?.elegible))
const elegida = computed(() => cotizacionesOrdenadas.value.find((c) => c.elegida))
/** Compra menor: Finanzas ve que NO hay cotización, solo el registro (umbral real: el de la liga o, en demo, el de la configuración). */
const leyendaMenor = computed(() => (elegida.value?.esRegistro && v.value ? textoLeyendaCompraMenor(v.value.umbralSinCotizacion) : ''))
/** UN solo aviso: la elegida no es la más barata y/o no es la recomendada. */
const avisoEleccion = computed(() => {
  const e = elegida.value
  const a = analisis.value
  if (!e || !a || e.esRegistro) return ''
  const ev = evaluarEleccion(a, e.id)
  const dif = masBarata.value ? formatoMoneda(e.total - masBarata.value.total) : ''
  if (!ev.esMasBarata && !ev.esRecomendada) return `La opción elegida no es la más barata (+${dif}) ni la recomendada por el comparativo`
  if (!ev.esMasBarata) return `La opción elegida no es la más barata (+${dif}), aunque es la recomendada por el comparativo`
  if (!ev.esRecomendada) return 'La opción elegida es la más barata, pero no la recomendada por el comparativo'
  return ''
})
const maxTotal = computed(() => Math.max(1, ...cotizacionesOrdenadas.value.map((c) => c.total)))
const anchoBarra = (total) => Math.max(4, (total / maxTotal.value) * 100)
const porcentaje = (total, base) => (base > 0 ? `${Math.round(((total - base) / base) * 100)}%` : '')

/** En demo local se leen los umbrales vigentes; con Supabase el anónimo no lee la configuración, así que solo se muestra el nivel. */
const umbrales = computed(() => {
  if (!comprasModoLocal()) return null
  const c = getConfig()
  // La barra se mide contra el umbral de aviso a Dirección (Dirección no aprueba: solo se entera).
  return { referencia: c.umbralDireccion, etiqueta: 'aviso a Dirección', simple: c.umbralCotizacionSimple, minimas: c.cotizacionesMinimas }
})


const avisosSeparacion = computed(() => {
  const x = v.value
  if (!x) return []
  const out = []
  if (x.aprobador && norm(x.aprobador) === norm(x.solicitante)) out.push('Quien solicitó esta compra y quien la autoriza es la misma persona. Debe autorizarla alguien más.')
  try {
    out.push(...avisosSeparacionFunciones(x.folio))
  } catch {
    /* sin datos locales */
  }
  return [...new Set(out)]
})

const etiquetaDecision = (d) => (d === 'aprobada' ? 'Aprobó' : d === 'rechazada' ? 'Rechazó' : 'Pidió ajuste')
const etiquetaDecisionAccion = (d) => (d === 'aprobada' ? 'Aprobar' : d === 'rechazada' ? 'Rechazar' : 'Pedir ajuste')

// ---------------------------------------------------------------------------------------------------------------------
// Decisión
// ---------------------------------------------------------------------------------------------------------------------
const opciones = [
  {
    id: 'aprobada',
    titulo: 'Aprobar',
    texto: 'Autorizas la compra por el monto indicado.',
    clase: 'peer-checked:border-vz-success peer-checked:bg-vz-success/10 peer-focus-visible:outline-vz-success',
    icono: 'bg-vz-success text-white',
  },
  {
    id: 'ajuste',
    titulo: 'Pedir ajuste',
    texto: 'Regresa a cotización con tus indicaciones.',
    clase: 'peer-checked:border-vz-warning peer-checked:bg-vz-warning/10 peer-focus-visible:outline-vz-warning',
    icono: 'bg-vz-warning text-white',
  },
  {
    id: 'rechazada',
    titulo: 'Rechazar',
    texto: 'No se compra. Queda el motivo en el registro.',
    clase: 'peer-checked:border-vz-danger peer-checked:bg-vz-danger/10 peer-focus-visible:outline-vz-danger',
    icono: 'bg-vz-danger text-white',
  },
]

const comentarioObligatorio = computed(() => decision.value === 'rechazada' || decision.value === 'ajuste')
const textoBoton = computed(() => (decision.value === 'aprobada' ? 'Confirmar aprobación' : decision.value === 'rechazada' ? 'Confirmar rechazo' : 'Confirmar solicitud de ajuste'))
const textoConfirmar = computed(() => (decision.value === 'aprobada' ? 'Sí, aprobar' : decision.value === 'rechazada' ? 'Sí, rechazar' : 'Sí, pedir ajuste'))
const tituloConfirmacion = computed(() => (decision.value === 'aprobada' ? 'Confirmar aprobación' : decision.value === 'rechazada' ? 'Confirmar rechazo' : 'Confirmar ajuste'))
const verbo = computed(() => (decision.value === 'aprobada' ? 'APROBAR' : decision.value === 'rechazada' ? 'RECHAZAR' : 'PEDIR AJUSTE EN'))

function pedirConfirmacion() {
  if (!decision.value || !puedeDecidir.value) return
  intento.value = true
  if (comentarioObligatorio.value && comentario.value.trim().length < 5) {
    document.getElementById('ap-comentario')?.focus()
    return
  }
  errorEnvio.value = ''
  confirmando.value = true
}
function cerrarConfirmacion() {
  if (!enviando.value) confirmando.value = false
}

async function enviar() {
  if (enviando.value || !decision.value || !v.value) return
  enviando.value = true
  errorEnvio.value = ''
  const d = decision.value
  try {
    const r = await aprobarPorToken(token.value, d, comentario.value.trim() || undefined)
    resultado.value = { decision: d, folio: r.folio || v.value.folio, mensaje: r.mensaje }
    confirmando.value = false
    void nextTick(() => {
      window.scrollTo({ top: 0 })
      tituloResultado.value?.focus({ preventScroll: true })
    })
  } catch (e) {
    errorEnvio.value = e instanceof Error && e.message ? e.message : 'No pudimos registrar tu decisión. Intenta de nuevo.'
    // Si la liga ya se usó o venció, se refresca el estado para explicarlo.
    try {
      const r = await verParaAprobar(token.value)
      if (r) {
        v.value = r
        if (!puedeDecidir.value) confirmando.value = false
      }
    } catch {
      /* se deja el mensaje de error */
    }
  } finally {
    enviando.value = false
  }
}

const resultadoVisual = computed(() => {
  const d = resultado.value?.decision
  if (d === 'aprobada') return { titulo: 'Quedó registrada tu aprobación', fondo: 'bg-vz-success/15 text-vz-success' }
  if (d === 'rechazada') return { titulo: 'Quedó registrado tu rechazo', fondo: 'bg-vz-danger/15 text-vz-danger' }
  return { titulo: 'Quedó registrada tu solicitud de ajuste', fondo: 'bg-vz-warning/20 text-vz-warning' }
})
</script>

<style scoped>
.dt {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-soft);
}
.dtc {
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-soft);
}
.ddc {
  margin: 1px 0 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
}
.dd {
  margin: 2px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}
</style>
