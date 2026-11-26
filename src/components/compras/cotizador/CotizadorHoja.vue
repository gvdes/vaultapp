<template>
  <div ref="raiz" class="flex min-w-0 max-w-full flex-col gap-4">
    <!-- Modo de la hoja -->
    <p v-if="!editable" class="rounded-lg border border-border bg-bg px-3 py-2 text-[12.5px] text-text-muted">
      {{ puedeCotizar ? 'La requisición ya no admite cambios en las cotizaciones (la autorización está en curso o terminó).' : 'Vista de consulta: solo Adquisiciones captura las cotizaciones.' }}
    </p>

    <!-- Recomendación y reglas -->
    <section v-if="hayAnalisis" class="rounded-xl border border-border bg-surface p-3.5" aria-labelledby="hoja-resumen">
      <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div class="min-w-0 flex-1">
          <h3 id="hoja-resumen" class="text-[11px] font-bold uppercase tracking-wide text-text-soft">Recomendación del comparativo</h3>
          <template v-if="recomendada">
            <p class="text-[15px] font-extrabold leading-snug text-text">
              {{ recomendada.proveedor }} <span class="font-semibold text-text-muted">· {{ formatoMoneda(recomendada.total) }}<template v-if="entradas.length > 1"> · puntaje {{ recomendada.puntaje }}/100</template></span>
            </p>
            <ul v-if="recomendada.razones.length" class="m-0 mt-1 flex list-none flex-wrap gap-1.5 p-0" aria-label="Por qué se recomienda">
              <li v-for="r in recomendada.razones" :key="r" class="rounded-full bg-vz-blue/12 px-2 py-0.5 text-[11.5px] font-bold text-text">{{ r }}</li>
            </ul>
            <p v-if="recomendada.alertas.length" class="mt-1 text-[12px] font-semibold text-vz-warning">Ojo: {{ recomendada.alertas.map((a) => a.label).join(' · ') }}.</p>
          </template>
          <p v-else class="text-[13px] text-text-muted">Aún no hay una cotización completa (con precio en todas las partidas) para recomendar.</p>
        </div>
        <dl v-if="ahorro > 0" class="text-right">
          <dt class="text-[11px] text-text-soft">Ahorro vs. la más cara</dt>
          <dd class="m-0 text-[16px] font-extrabold text-vz-success">{{ formatoMoneda(ahorro) }}</dd>
        </dl>
      </div>
      <p
        v-if="minimas.mensajes.length"
        class="mt-2 rounded-lg border border-vz-warning/30 bg-vz-warning/10 px-3 py-1.5 text-[12px] text-text"
      >{{ minimas.mensajes[0] }}</p>
      <p v-else-if="completasN > 0" class="mt-2 rounded-lg border border-vz-success/30 bg-vz-success/10 px-3 py-1.5 text-[12px] text-text">
        Cumple la regla de cotizaciones: {{ minimas.completas }} completa{{ minimas.completas === 1 ? '' : 's' }} de {{ minimas.requeridas }} requerida{{ minimas.requeridas === 1 ? '' : 's' }} para {{ formatoMoneda(minimas.monto) }}.
      </p>
      <!-- Progreso de cotizaciones de proveedores distintos (solo para montos desde el umbral) -->
      <div v-if="enUmbral" class="mt-2 text-[12px] text-text-muted" data-test="progreso-cotizaciones">
        <p>
          <span class="font-bold text-text">{{ completasN }} de {{ minimas.requeridas }} cotizaciones</span> de proveedores distintos
          <template v-if="completasN >= minimas.requeridas"> · completo.</template>
          <template v-else-if="excepcionLista"> · con excepción documentada basta 1.</template>
          <template v-else> · faltan {{ minimas.requeridas - completasN }} o documentar la excepción.</template>
        </p>
        <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true"><div :class="`h-full rounded-full ${completasN >= minimas.requeridas ? 'bg-vz-success' : 'bg-vz-warning'}`" :style="{ width: `${Math.min(100, (completasN / minimas.requeridas) * 100)}%` }" /></div>
      </div>
      <p v-if="!editable && (req?.excepcionCotizaciones || req?.excepcionTipo)" class="mt-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-[12px]">
        <span class="font-bold text-text">Excepción de cotizaciones:</span> <span class="text-text-muted">{{ textoExcepcion(req) }}</span>
      </p>

      <!-- Comparación resumida (útil en el celular, donde la hoja se desplaza) -->
      <ol v-if="ranking.length > 1" class="m-0 mt-3 flex list-none flex-col gap-1.5 p-0" aria-label="Comparación resumida, de la mejor a la menos conveniente">
        <li v-for="f in ranking" :key="f.id" :class="`flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border px-2.5 py-1.5 text-[12.5px] ${f.id === seleccionEfectiva ? 'border-vz-blue/50 bg-vz-blue/8' : 'border-border bg-bg'}`">
          <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-border text-[11px] font-extrabold text-text" aria-hidden="true">{{ f.posicion }}</span>
          <span class="min-w-0 flex-1 font-bold text-text">{{ f.proveedor }}</span>
          <span class="font-extrabold text-text">{{ formatoMoneda(f.total) }}</span>
          <span class="flex w-24 items-center gap-1.5" :title="`Puntaje ${f.puntaje} de 100`">
            <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-border" aria-hidden="true"><span class="block h-full rounded-full bg-vz-blue" :style="{ width: `${f.puntaje}%` }" /></span>
            <span class="w-7 text-right font-bold text-text-muted">{{ f.puntaje }}</span>
          </span>
          <span class="flex flex-wrap gap-1">
            <span v-for="i in f.insignias" :key="i.id" :class="`rounded-full px-1.5 py-px text-[10.5px] font-bold ${claseInsignia(i.id)}`">{{ i.label }}</span>
          </span>
        </li>
      </ol>
      <details class="mt-2 text-[12px] text-text-muted">
        <summary class="cursor-pointer select-none font-bold text-vz-blue">Cómo se calcula el puntaje</summary>
        <p class="mt-1 leading-snug">
          Cada cotización recibe de 0 a 100 en cada criterio y se combinan con estos pesos (se editan en Directorio → Reglas):
          <template v-for="(c, i) in CRITERIOS_ORDEN" :key="c"><b class="text-text">{{ CRITERIOS_INFO[c].label }} {{ cfg.cotizadorPesos[c] }}%</b>{{ i < CRITERIOS_ORDEN.length - 1 ? ' · ' : '.' }}</template>
          Lo que no se captura no perjudica a la cotización (su peso se reparte entre los demás criterios). Si empatan, gana la de menor costo. El total comparable es
          (partidas − descuento + flete) y, si el proveedor cotizó sin IVA, se le suma el {{ cfg.ivaPct }}%.
        </p>
      </details>
    </section>

    <!-- Excepción de cotizaciones: solo cuando el monto llega al umbral y faltan cotizaciones de proveedores distintos -->
    <ExcepcionCotizaciones v-if="editable && mostrarExc" v-model="exc" :umbral="cfg.umbralCotizacionSimple" :requeridas="minimas.requeridas" :hay="completasN" />

    <!-- Proveedores sugeridos por el solicitante -->
    <div v-if="editable && sugeridosPendientes.length" class="flex flex-wrap items-center gap-1.5 text-[12px]">
      <span class="text-text-muted">Sugeridos por el solicitante:</span>
      <button v-for="s in sugeridosPendientes" :key="s" type="button" :class="chip" :disabled="cols.length >= MAX_COLUMNAS && !hayColumnaEnBlanco" @click="agregarSugerido(s)">+ {{ s }}</button>
    </div>

    <!-- Hoja -->
    <div class="min-w-0 max-w-full overflow-x-auto rounded-xl border border-border bg-surface" role="region" aria-label="Hoja de comparación de cotizaciones: en pantallas chicas se desplaza hacia los lados" tabindex="0">
      <table class="w-full border-collapse text-[12.5px]">
        <caption class="sr-only">Una columna por proveedor y una fila por partida o criterio de comparación</caption>
        <thead>
          <tr class="align-top">
            <th scope="col" :class="`${thEtiqueta} bg-bg`">
              <span class="block text-[12px] font-extrabold text-text">Proveedores</span>
              <span class="block font-normal text-text-soft">{{ cols.length }} de {{ MAX_COLUMNAS }}</span>
              <button v-if="editable" type="button" :class="`${chip} mt-1`" :disabled="cols.length >= MAX_COLUMNAS" @click="agregarColumna()">+ Proveedor</button>
            </th>
            <th v-for="(col, j) in cols" :key="col.key" scope="col" :class="`${tdColumna} bg-bg ${col.key === seleccionEfectiva ? '!bg-vz-blue/10' : ''}`">
              <input
                v-model="col.proveedor"
                :list="listaId"
                :class="`${campo} font-bold`"
                :placeholder="`Proveedor ${j + 1} *`"
                :disabled="!editable"
                :aria-label="`Nombre del proveedor ${j + 1}`"
                autocomplete="off"
                @change="alCambiarProveedor(col)"
              />
              <div class="mt-1 grid grid-cols-2 gap-1">
                <input v-model="col.contacto" :class="campo" placeholder="Contacto" :disabled="!editable" :aria-label="`Contacto de ${nombreCol(col, j)}`" />
                <input v-model="col.telefono" :class="campo" placeholder="Teléfono" inputmode="tel" :disabled="!editable" :aria-label="`Teléfono de ${nombreCol(col, j)}`" />
              </div>
              <p v-if="col.previo" class="mt-1 text-[10.5px] font-normal leading-tight text-text-soft">
                Antes: {{ col.previo.cotizaciones }} cotizaci{{ col.previo.cotizaciones === 1 ? 'ón' : 'ones' }}<template v-if="col.previo.compras"> · {{ col.previo.compras }} compra{{ col.previo.compras === 1 ? '' : 's' }}</template><template v-if="col.previo.calificacionPromedio"> · {{ col.previo.calificacionPromedio }}/5</template>
              </p>
              <p v-if="duplicados.has(norm(col.proveedor))" class="mt-1 text-[10.5px] font-semibold text-vz-warning">Este proveedor está dos veces en la hoja.</p>
              <p v-if="col.id && cotGuardada(col)?.registradoPor" class="mt-1 text-[10.5px] font-normal text-text-soft">Registró {{ cotGuardada(col)?.registradoPor }}</p>
              <button v-if="editable" type="button" :class="`${btnMini} mt-1`" @click="quitar(col)">{{ col.id ? 'Descartar cotización' : 'Quitar columna' }}</button>
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- Precios por partida -->
          <tr><th :colspan="cols.length + 1" scope="colgroup" :class="seccion">Precio unitario por partida <span class="font-normal normal-case text-text-soft">(MXN) · Enter baja, Tab avanza; pega una columna de Excel en cualquier celda</span></th></tr>
          <tr v-for="(p, i) in partidas" :key="p.id">
            <th scope="row" :class="thEtiqueta">
              <span class="block font-semibold text-text">{{ p.num }}. {{ p.producto }}</span>
              <span class="block font-normal text-text-soft">Cantidad {{ p.cantidad }}</span>
            </th>
            <td v-for="(col, j) in cols" :key="col.key" :class="`${tdCelda} ${mejorPrecio(p.id, col) ? 'bg-vz-success/12' : ''}`">
              <input
                v-model="col.precios[p.id]"
                :data-celda="`p-${i}-${j}`"
                :class="`${campoNum} ${precioInvalido(col, p.id) ? '!border-vz-danger' : ''}`"
                inputmode="decimal"
                placeholder="0.00"
                :disabled="!editable"
                :aria-label="`Precio unitario de ${p.producto} · ${nombreCol(col, j)}`"
                @keydown.enter.prevent="enter($event, i, j)"
                @paste="pegar($event, i, j)"
              />
              <span v-if="importe(col, p.id) !== undefined" class="mt-0.5 block text-right text-[10.5px] text-text-soft">= {{ formatoMoneda(importe(col, p.id)) }}</span>
            </td>
          </tr>

          <!-- Precio: descuento, flete, IVA -->
          <tr><th :colspan="cols.length + 1" scope="colgroup" :class="seccion">Precio final</th></tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Descuento <span class="block font-normal text-text-soft">volumen / pronto pago ($)</span></th>
            <td v-for="(col, j) in cols" :key="col.key" :class="tdCelda"><input v-model="col.descuento" :class="campoNum" inputmode="decimal" placeholder="$ 0" :disabled="!editable" :aria-label="`Descuento · ${nombreCol(col, j)}`" /></td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Flete / envío <span class="block font-normal text-text-soft">($)</span></th>
            <td v-for="(col, j) in cols" :key="col.key" :class="tdCelda"><input v-model="col.flete" :class="campoNum" inputmode="decimal" placeholder="$ 0" :disabled="!editable" :aria-label="`Flete · ${nombreCol(col, j)}`" /></td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">IVA <span class="block font-normal text-text-soft">¿los precios lo traen?</span></th>
            <td v-for="(col, j) in cols" :key="col.key" :class="tdCelda">
              <Segmentado v-model="col.ivaIncluido" :opciones="OPC_IVA" :label="`IVA · ${nombreCol(col, j)}`" :disabled="!editable" />
              <p v-if="col.ivaIncluido === 'mas'" class="mt-0.5 text-[10.5px] text-text-soft">Se suma {{ cfg.ivaPct }}% para comparar.</p>
            </td>
          </tr>

          <!-- Entrega, garantía, pago -->
          <tr><th :colspan="cols.length + 1" scope="colgroup" :class="seccion">Entrega, garantía y pago</th></tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Entrega <span class="block font-normal text-text-soft">días</span></th>
            <td v-for="(col, j) in cols" :key="col.key" :class="`${tdCelda} ${mejorCls('entrega', col)}`"><input v-model="col.entrega" :class="campoNum" inputmode="numeric" placeholder="días" :disabled="!editable" :aria-label="`Tiempo de entrega en días · ${nombreCol(col, j)}`" /></td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Garantía <span class="block font-normal text-text-soft">meses y quién responde</span></th>
            <td v-for="(col, j) in cols" :key="col.key" :class="`${tdCelda} ${mejorCls('garantia', col)}`">
              <input v-model="col.garantiaMeses" :class="campoNum" inputmode="numeric" placeholder="meses" :disabled="!editable || col.garantiaResp === 'ninguna'" :aria-label="`Meses de garantía · ${nombreCol(col, j)}`" />
              <Segmentado class="mt-1" :model-value="col.garantiaResp" :opciones="OPC_GARANTIA" :label="`Quién responde por la garantía · ${nombreCol(col, j)}`" :disabled="!editable" limpiable @update:model-value="(v) => cambiarGarantia(col, v)" />
            </td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Crédito <span class="block font-normal text-text-soft">días para pagar</span></th>
            <td v-for="(col, j) in cols" :key="col.key" :class="`${tdCelda} ${mejorCls('credito', col)}`">
              <input v-model="col.credito" :class="campoNum" inputmode="numeric" placeholder="0 = contado" :disabled="!editable" :aria-label="`Días de crédito · ${nombreCol(col, j)}`" />
              <div v-if="editable" class="mt-1 flex flex-wrap gap-1">
                <button v-for="d in ATAJOS_CREDITO" :key="d" type="button" :class="`${chip} ${col.credito === String(d) ? '!border-vz-blue !bg-vz-blue/15 !text-text' : ''}`" @click="col.credito = String(d)">{{ d === 0 ? 'Contado' : d }}</button>
              </div>
            </td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Anticipo <span class="block font-normal text-text-soft">% que pide</span></th>
            <td v-for="(col, j) in cols" :key="col.key" :class="`${tdCelda} ${mejorCls('anticipo', col)}`">
              <input v-model="col.anticipo" :class="campoNum" inputmode="decimal" placeholder="0" :disabled="!editable" :aria-label="`Anticipo en porcentaje · ${nombreCol(col, j)}`" />
              <div v-if="editable" class="mt-1 flex flex-wrap gap-1">
                <button v-for="d in ATAJOS_ANTICIPO" :key="d" type="button" :class="`${chip} ${col.anticipo === String(d) ? '!border-vz-blue !bg-vz-blue/15 !text-text' : ''}`" @click="col.anticipo = String(d)">{{ d }}%</button>
              </div>
            </td>
          </tr>

          <!-- Respaldo de marca -->
          <tr><th :colspan="cols.length + 1" scope="colgroup" :class="seccion">Respaldo de marca y condiciones</th></tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Distribuidor autorizado</th>
            <td v-for="(col, j) in cols" :key="col.key" :class="tdCelda"><Segmentado v-model="col.distribuidor" :opciones="OPC_TRI" :label="`Distribuidor autorizado · ${nombreCol(col, j)}`" :disabled="!editable" /></td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Soporte técnico</th>
            <td v-for="(col, j) in cols" :key="col.key" :class="tdCelda"><Segmentado v-model="col.soporte" :opciones="OPC_TRI" :label="`Soporte técnico · ${nombreCol(col, j)}`" :disabled="!editable" /></td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Vigencia <span class="block font-normal text-text-soft">hasta cuándo respeta el precio</span></th>
            <td v-for="(col, j) in cols" :key="col.key" :class="tdCelda">
              <input v-model="col.vigencia" type="date" :class="campo" :disabled="!editable" :aria-label="`Vigencia de la cotización · ${nombreCol(col, j)}`" />
            </td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Acepta devoluciones</th>
            <td v-for="(col, j) in cols" :key="col.key" :class="tdCelda"><Segmentado v-model="col.devoluciones" :opciones="OPC_TRI" :label="`Acepta devoluciones · ${nombreCol(col, j)}`" :disabled="!editable" /></td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Calificación del proveedor <span class="block font-normal text-text-soft">experiencia previa</span></th>
            <td v-for="(col, j) in cols" :key="col.key" :class="`${tdCelda} ${mejorCls('calificacion', col)}`">
              <Estrellas v-model="col.calificacion" :label="`Calificación del proveedor · ${nombreCol(col, j)}`" :disabled="!editable" />
              <p v-if="col.previo?.calificacionPromedio && col.calificacion !== col.previo.calificacionPromedio && editable" class="mt-0.5 text-[10.5px] text-text-soft">
                Sugerida: {{ col.previo.calificacionPromedio }}/5 <button type="button" class="font-bold text-vz-blue hover:underline" @click="col.calificacion = col.previo.calificacionPromedio ?? 0">usar</button>
              </p>
            </td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Notas <span class="block font-normal text-text-soft">marca, condiciones…</span></th>
            <td v-for="(col, j) in cols" :key="col.key" :class="tdCelda">
              <input v-model="col.notas" :class="campo" placeholder="Marca / calidad" :disabled="!editable" :aria-label="`Notas de marca o calidad · ${nombreCol(col, j)}`" />
              <input v-model="col.condiciones" :class="`${campo} mt-1`" placeholder="Pago / envío" :disabled="!editable" :aria-label="`Notas de condiciones de pago o envío · ${nombreCol(col, j)}`" />
            </td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Archivo de la cotización <span class="block font-normal text-text-soft">PDF o imagen</span></th>
            <td v-for="(col, j) in cols" :key="col.key" :class="tdCelda">
              <div class="flex flex-wrap items-center gap-1">
                <button v-if="col.archivoUrl" type="button" :class="btnMini" @click="archivo = { url: col.archivoUrl, titulo: `Cotización ${col.proveedor}` }">Ver archivo</button>
                <button v-if="col.archivoUrl && editable" type="button" :class="btnMini" @click="col.archivoUrl = ''">Quitar</button>
                <label v-if="editable && !col.archivoUrl" :class="`${btnMini} cursor-pointer`">
                  {{ col.subiendo ? 'Subiendo…' : 'Adjuntar' }}
                  <input type="file" accept="application/pdf,image/*" class="sr-only" :aria-label="`Adjuntar archivo de ${nombreCol(col, j)}`" :disabled="col.subiendo" @change="subirArchivo(col, $event)" />
                </label>
                <span v-if="!col.archivoUrl && !editable" class="text-text-soft">—</span>
              </div>
            </td>
          </tr>

          <!-- Resultados -->
          <tr><th :colspan="cols.length + 1" scope="colgroup" :class="`${seccion} !bg-vz-blue/10`">Resultado</th></tr>
          <tr>
            <th scope="row" :class="`${thEtiqueta} !text-text`">Costo total comparable <span class="block font-normal text-text-soft">lo que se paga de verdad</span></th>
            <td v-for="col in cols" :key="col.key" :class="`${tdCelda} ${res_(col)?.esMasBarata && entradas.length > 1 ? 'bg-vz-success/12' : ''}`">
              <template v-if="res_(col)">
                <p class="text-right text-[15px] font-extrabold tabular-nums text-text">{{ formatoMoneda(res_(col).total) }}<span v-if="!res_(col).completa" title="Total parcial: faltan precios">*</span></p>
                <p v-if="res_(col).desglose.descuento > 0 || res_(col).desglose.flete > 0 || !res_(col).desglose.ivaIncluido" class="mt-0.5 text-right text-[10.5px] leading-snug text-text-soft">
                  Partidas {{ formatoMoneda(res_(col).desglose.subtotal) }}<template v-if="res_(col).desglose.descuento > 0"> − {{ formatoMoneda(res_(col).desglose.descuento) }}</template><template v-if="res_(col).desglose.flete > 0"> + flete {{ formatoMoneda(res_(col).desglose.flete) }}</template><template v-if="!res_(col).desglose.ivaIncluido"> + IVA {{ formatoMoneda(res_(col).desglose.iva) }}</template>
                </p>
                <p v-if="res_(col).elegible && res_(col).diferencia > 0" class="text-right text-[10.5px] font-semibold text-vz-warning">+{{ formatoMoneda(res_(col).diferencia) }} vs. la más barata</p>
                <p v-if="!res_(col).completa" class="text-right text-[10.5px] font-semibold text-vz-warning">* Faltan precios</p>
              </template>
              <p v-else class="text-right text-text-soft">—</p>
            </td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Puntaje <span class="block font-normal text-text-soft">0 a 100</span></th>
            <td v-for="col in cols" :key="col.key" :class="`${tdCelda} ${mejorCls('puntaje', col)}`">
              <template v-if="res_(col) && entradas.length > 1 && res_(col).elegible">
                <p class="text-right text-[15px] font-extrabold tabular-nums text-text">{{ res_(col).puntaje }}</p>
                <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true"><div class="h-full rounded-full bg-vz-blue" :style="{ width: `${res_(col).puntaje}%` }" /></div>
              </template>
              <p v-else class="text-right text-text-soft">—</p>
            </td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Insignias</th>
            <td v-for="col in cols" :key="col.key" :class="tdCelda">
              <div class="flex flex-wrap gap-1">
                <span v-for="i in res_(col)?.insignias ?? []" :key="i.id" :class="`rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${claseInsignia(i.id)}`">{{ i.label }}</span>
                <span v-if="!(res_(col)?.insignias.length)" class="text-text-soft">—</span>
              </div>
            </td>
          </tr>
          <tr>
            <th scope="row" :class="thEtiqueta">Alertas</th>
            <td v-for="col in cols" :key="col.key" :class="tdCelda">
              <ul class="m-0 flex list-none flex-wrap gap-1 p-0" aria-label="Alertas">
                <li
                  v-for="a in res_(col)?.alertas ?? []"
                  :key="a.id"
                  :title="a.detalle"
                  :class="`rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold ${a.tono === 'danger' ? 'border-vz-danger/40 bg-vz-danger/10 text-vz-danger' : a.tono === 'warning' ? 'border-vz-warning/45 bg-vz-warning/10 text-vz-warning' : 'border-border bg-bg text-text-muted'}`"
                >{{ a.label }}</li>
                <li v-if="!(res_(col)?.alertas.length)" class="text-text-soft">Sin alertas</li>
              </ul>
            </td>
          </tr>
          <tr>
            <th scope="row" :class="`${thEtiqueta} !border-b-0`">Proveedor elegido</th>
            <td v-for="col in cols" :key="col.key" :class="`${tdCelda} !border-b-0`">
              <template v-if="editable">
                <label :class="`flex items-center gap-1.5 text-[12.5px] font-bold ${res_(col)?.elegible ? 'cursor-pointer text-text' : 'text-text-soft'}`">
                  <input type="radio" name="eleccion-proveedor" :value="col.key" :checked="seleccionEfectiva === col.key" :disabled="!res_(col)?.elegible" class="h-4 w-4 accent-vz-blue" @change="seleccion = col.key" />
                  {{ seleccionEfectiva === col.key ? 'Elegida' : res_(col)?.elegible ? 'Elegir esta' : 'Incompleta' }}
                </label>
              </template>
              <span v-else-if="col.id && cotGuardada(col)?.elegida" class="rounded-full bg-vz-blue px-2 py-0.5 text-[11px] font-bold text-white">Elegida</span>
              <span v-else class="text-text-soft">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <datalist :id="listaId">
      <option v-for="p in previos" :key="p.proveedor" :value="p.proveedor">{{ p.cotizaciones }} cotizaci{{ p.cotizaciones === 1 ? 'ón' : 'ones' }} anteriores</option>
    </datalist>

    <!-- Justificación vigente de la elegida (consulta) -->
    <p v-if="!editable && elegidaGuardada?.justificacion" class="rounded-lg border border-border bg-bg px-3 py-2 text-[12.5px]">
      <span class="font-bold text-text">Justificación de la elección:</span> <span class="text-text-muted">{{ elegidaGuardada.justificacion }}</span>
    </p>

    <!-- Descartadas -->
    <div v-if="descartadas.length" class="rounded-xl border border-border bg-surface p-3">
      <p class="mb-1 text-[12px] font-bold text-text-muted">Cotizaciones descartadas (no se borran)</p>
      <ul class="m-0 flex list-none flex-col gap-1 p-0 text-[12px] text-text-muted">
        <li v-for="c in descartadas" :key="c.id">{{ c.proveedor }} — {{ c.justificacion }}</li>
      </ul>
    </div>

    <!-- Acciones -->
    <div v-if="editable" class="sticky bottom-0 z-10 -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
      <p v-if="errorHoja" role="alert" class="mb-2 rounded-lg border border-vz-danger/30 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">{{ errorHoja }}</p>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <p class="mr-auto text-[12px] text-text-muted">
          <span v-if="sucia" class="font-bold text-vz-warning">Cambios sin guardar.</span>
          <span v-else-if="!entradas.length">Captura al menos un proveedor con sus precios.</span>
          <span v-else>Todo guardado.</span>
        </p>
        <button type="button" :class="btn" :disabled="ocupado !== '' || !entradas.length" @click="guardarBorrador">{{ ocupado === 'borrador' ? 'Guardando…' : 'Guardar borrador' }}</button>
        <button type="button" :class="btnPrimary" :disabled="ocupado !== ''" @click="abrirEnvio">Guardar y enviar a autorización</button>
      </div>
    </div>

    <EnvioModal
      v-if="envio && datosEnvio"
      :proveedor="datosEnvio.proveedor"
      :total="datosEnvio.total"
      :aprobadores="datosEnvio.aprobadores"
      :avisa-direccion="datosEnvio.avisaDireccion"
      :evaluacion="datosEnvio.evaluacion"
      :minimas="minimas"
      :excepcion-texto="minimas.requiereExcepcion ? textoExcepcion({ tipo: exc.tipo, instruidaPor: exc.instruidaPor, justificacion: exc.justificacion }) : ''"
      :accion="ejecutarEnvio"
      @close="envio = null"
    />
    <ArchivoModal v-if="archivo" :url="archivo.url" :titulo="archivo.titulo" @close="archivo = null" />
    <MotivoModal
      v-if="descartar"
      title="Descartar cotización"
      label="Motivo del descarte"
      :descripcion="`Se descarta la cotización de ${descartar.proveedor}. No se borra: queda registrada como descartada.`"
      confirm-label="Descartar"
      danger
      :accion="accionDescartar"
      @close="descartar = null"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  CRITERIOS_INFO,
  CRITERIOS_ORDEN,
  analizarConConfig,
  descartarCotizacion,
  elegirProveedor,
  evaluarEleccion,
  contarProveedoresDistintos,
  errorExcepcion,
  evaluarMinimas,
  formatoMoneda,
  getConfig,
  getCotizacion,
  getRequisicion,
  guardarExcepcion,
  guardarHoja,
  listCotizaciones,
  motivoProveedorIncompleto,
  listPartidas,
  aprobadoresElegibles,
  avisoDireccion,
  preciosDe,
  proveedoresPrevios,
  solicitarAutorizacion,
  textoExcepcion,
} from 'src/lib/compras'
import { uploadFactura } from 'src/lib/inventario/storage'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'
import ArchivoModal from '../ArchivoModal.vue'
import MotivoModal from '../MotivoModal.vue'
import { useAcceso } from '../useAcceso'
import { btn, btnMini, btnPrimary } from '../util'
import Segmentado from './Segmentado.vue'
import Estrellas from './Estrellas.vue'
import EnvioModal from './EnvioModal.vue'
import ExcepcionCotizaciones from './ExcepcionCotizaciones.vue'
import {
  MAX_COLUMNAS,
  aColumnaHoja,
  aEntrada,
  colDesdeCotizacion,
  colEnBlanco,
  colVacia,
  firmaCol,
  limpiarNumPegado,
  numTxt,
  problemaCol,
} from './hoja'

const props = defineProps({ folio: { type: String, required: true } })
const emit = defineEmits(['enviada'])
const toast = useToast()
const { puedeCotizar } = useAcceso()

const req = computed(() => getRequisicion(props.folio))
const cfg = computed(() => getConfig())
const partidas = computed(() => listPartidas(props.folio))
const editable = computed(() => puedeCotizar.value && (req.value?.estado === 'recibida' || req.value?.estado === 'en_cotizacion'))
const listaId = computed(() => `cot-proveedores-${props.folio}`)

// ---- Estilos ----------------------------------------------------------------------------------------------------------------
const campo =
  'h-8 w-full min-w-0 rounded-md border border-border bg-bg px-2 text-[12.5px] text-text outline-none placeholder:text-text-soft focus:border-vz-blue focus:ring-2 focus:ring-vz-blue/30 disabled:border-transparent disabled:bg-transparent disabled:opacity-100'
const campoNum = `${campo} text-right tabular-nums`
const chip = 'rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] font-bold text-text-muted hover:bg-surface-hover disabled:opacity-50'
const thEtiqueta = 'sticky left-0 z-[2] w-[108px] min-w-[108px] border-b border-r border-border bg-surface px-2 py-1.5 text-left align-top text-[11.5px] font-bold text-text-muted sm:w-[176px] sm:min-w-[176px] sm:px-3'
const tdColumna = 'w-[188px] min-w-[188px] border-b border-l border-border px-2 py-2 text-left align-top font-normal'
const tdCelda = 'w-[188px] min-w-[188px] border-b border-l border-border px-2 py-1.5 align-top'
const seccion = 'sticky left-0 border-b border-border bg-bg px-3 py-1 text-left text-[11px] font-extrabold uppercase tracking-wide text-text-muted'

const OPC_TRI = [
  { value: '', label: '—', title: 'Sin dato (no cuenta en el puntaje)', tono: 'neutro' },
  { value: 'si', label: 'Sí', tono: 'ok' },
  { value: 'no', label: 'No', tono: 'peligro' },
]
const OPC_IVA = [
  { value: 'incluido', label: 'IVA incluido', title: 'Los precios ya traen IVA', tono: 'azul' },
  { value: 'mas', label: '+ IVA', title: 'Los precios NO traen IVA: se suma para comparar', tono: 'azul' },
]
const OPC_GARANTIA = [
  { value: 'proveedor', label: 'Proveedor', title: 'La garantía la da el proveedor', tono: 'azul' },
  { value: 'fabricante', label: 'Fabricante', title: 'La garantía la da el fabricante', tono: 'azul' },
  { value: 'ninguna', label: 'Ninguna', title: 'Sin garantía', tono: 'peligro' },
]
const ATAJOS_CREDITO = [0, 15, 30, 45]
const ATAJOS_ANTICIPO = [0, 30, 50]

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const nombreCol = (c, j) => c.proveedor.trim() || `Proveedor ${j + 1}`

// ---- Borrador de la hoja ----------------------------------------------------------------------------------------------------
const raiz = ref(null)
const cols = ref([])
const base = ref({})
const seleccion = ref('')
const errorHoja = ref('')
const ocupado = ref('')
const archivo = ref(null)
const descartar = ref(null)
const envio = ref(null)
/** Excepción de cotizaciones en captura (se guarda en la requisición al guardar o enviar). */
const exc = ref({ tipo: '', instruidaPor: '', justificacion: '' })

const previos = computed(() => proveedoresPrevios({ excluirFolio: props.folio }))
const buscarPrevio = (nombre) => (nombre.trim() ? previos.value.find((p) => norm(p.proveedor) === norm(nombre)) : undefined)

function marcarBase() {
  base.value = Object.fromEntries(cols.value.map((c) => [c.key, firmaCol(c)]))
}

function cargar(idSeleccionado) {
  const guardadas = listCotizaciones(props.folio)
  const nuevas = guardadas.map((c) => ({ ...colDesdeCotizacion(c, preciosDe(c.id)), previo: buscarPrevio(c.proveedor) }))
  cols.value = nuevas
  if (editable.value && nuevas.length === 0) cols.value = [colVacia(), colVacia(), colVacia()]
  marcarBase()
  exc.value = { tipo: req.value?.excepcionTipo ?? '', instruidaPor: req.value?.excepcionInstruidaPor ?? '', justificacion: req.value?.excepcionCotizaciones ?? '' }
  seleccion.value = idSeleccionado ? (nuevas.find((c) => c.id === idSeleccionado)?.key ?? '') : ''
  errorHoja.value = ''
}

onMounted(() => cargar())
watch(() => props.folio, () => cargar())

const sucia = computed(() => cols.value.some((c) => !colEnBlanco(c) && base.value[c.key] !== firmaCol(c)))
/** Si cambian las cotizaciones guardadas desde fuera (p. ej. Finanzas pide un ajuste), la hoja se refresca mientras no haya captura sin guardar. */
const firmaStore = computed(() => JSON.stringify(listCotizaciones(props.folio).map((c) => [c, preciosDe(c.id)])))
watch(firmaStore, () => {
  if (!sucia.value) cargar(seleccionGuardada())
})
watch(editable, () => {
  if (!sucia.value) cargar(seleccionGuardada())
})
function seleccionGuardada() {
  return cols.value.find((c) => c.key === seleccionEfectiva.value)?.id
}

const cotGuardada = (c) => (c.id ? getCotizacion(c.id) : undefined)
const elegidaGuardada = computed(() => listCotizaciones(props.folio).find((c) => c.elegida))
const descartadas = computed(() => listCotizaciones(props.folio, { incluirDescartadas: true }).filter((c) => !c.activo))
const hayColumnaEnBlanco = computed(() => cols.value.some(colEnBlanco))

// ---- Análisis en vivo (antes de guardar) --------------------------------------------------------------------------------------
const entradas = computed(() => cols.value.filter((c) => !colEnBlanco(c)).map((c) => aEntrada(c, partidas.value)))
const resultado = computed(() => analizarConConfig(entradas.value))
const hayAnalisis = computed(() => entradas.value.length > 0)
const res_ = (c) => resultado.value.filas.find((f) => f.id === c.key)
const recomendada = computed(() => resultado.value.filas.find((f) => f.id === resultado.value.recomendadaId))
const ranking = computed(() => [...resultado.value.filas].filter((f) => f.elegible).sort((a, b) => a.posicion - b.posicion))
/** Cotizaciones completas de proveedores DISTINTOS (sin distinguir mayúsculas, acentos ni espacios). */
const completasN = computed(() => contarProveedoresDistintos(resultado.value.filas.filter((f) => f.completa).map((f) => f.proveedor)))
const ahorro = computed(() => {
  const el = resultado.value.filas.find((f) => f.id === seleccionEfectiva.value)
  const comp = resultado.value.filas.filter((f) => f.elegible)
  return el && comp.length > 1 ? Math.max(0, Math.max(...comp.map((f) => f.total)) - el.total) : 0
})

/** Elegida: la que marcó el usuario; si no, la que ya estaba guardada como elegida; si no, la recomendada. */
const seleccionEfectiva = computed(() => {
  const ok = (k) => !!k && !!resultado.value.filas.find((f) => f.id === k)?.elegible
  if (ok(seleccion.value)) return seleccion.value
  const guardada = cols.value.find((c) => c.id && c.id === elegidaGuardada.value?.id)?.key
  if (ok(guardada)) return guardada
  return resultado.value.recomendadaId ?? ''
})
const montoReferencia = computed(() => resultado.value.filas.find((f) => f.id === seleccionEfectiva.value)?.total ?? resultado.value.filas.find((f) => f.esMasBarata)?.total ?? 0)
const minimas = computed(() => evaluarMinimas(montoReferencia.value, completasN.value))
/** El monto de referencia llega al umbral simple (>=): se exigen N cotizaciones de proveedores distintos o excepción. */
const enUmbral = computed(() => minimas.value.requeridas > 1 && completasN.value > 0 && !minimas.value.registroExcedido)
const mostrarExc = computed(() => minimas.value.requiereExcepcion && completasN.value > 0)
const excepcionLista = computed(() => errorExcepcion(exc.value) === '')
const duplicados = computed(() => {
  const vistos = new Set()
  const dup = new Set()
  for (const c of cols.value) {
    const n = norm(c.proveedor)
    if (!n) continue
    if (vistos.has(n)) dup.add(n)
    vistos.add(n)
  }
  return dup
})

// ---- Resaltado de la mejor celda ------------------------------------------------------------------------------------------------
function mejorCls(crit, c) {
  return resultado.value.mejores[crit]?.includes(c.key) ? 'bg-vz-success/12' : ''
}
function precioDe(c, pid) {
  const n = numTxt(c.precios[pid])
  return typeof n === 'number' && n >= 0 ? n : undefined
}
function mejorPrecio(pid, c) {
  const p = precioDe(c, pid)
  if (p === undefined) return false
  const todos = cols.value.map((x) => precioDe(x, pid)).filter((x) => x !== undefined)
  return todos.length > 1 && Math.min(...todos) === p && Math.max(...todos) !== p
}
function importe(c, pid) {
  const p = precioDe(c, pid)
  const cant = partidas.value.find((x) => x.id === pid)?.cantidad
  return p !== undefined && cant !== undefined ? Math.round(p * cant * 100) / 100 : undefined
}
const precioInvalido = (c, pid) => numTxt(c.precios[pid]) === null || (precioDe(c, pid) === undefined && (numTxt(c.precios[pid]) ?? 0) < 0)

const CLASE_INSIGNIA = {
  recomendada: 'bg-vz-gold text-text',
  mas_barata: 'bg-vz-success text-white',
  mayor_garantia: 'bg-vz-blue/15 text-text',
  entrega_rapida: 'bg-vz-blue/15 text-text',
  mejor_credito: 'bg-vz-blue/15 text-text',
  distribuidor: 'bg-vz-blue/15 text-text',
  mejor_calificacion: 'bg-vz-blue/15 text-text',
}
const claseInsignia = (id) => CLASE_INSIGNIA[id]

// ---- Columnas -----------------------------------------------------------------------------------------------------------------
function agregarColumna(nombre = '') {
  if (cols.value.length >= MAX_COLUMNAS) return undefined
  const c = colVacia(nombre)
  cols.value = [...cols.value, c]
  const j = cols.value.length - 1
  void nextTick(() => raiz.value?.querySelectorAll('thead input')[j * 3]?.focus())
  return c
}

const sugeridosPendientes = computed(() => {
  const usados = new Set(cols.value.map((c) => norm(c.proveedor)))
  return (req.value?.proveedoresSugeridos ?? []).map((p) => p.empresa).filter((e) => e && !usados.has(norm(e)))
})
function agregarSugerido(nombre) {
  const libre = cols.value.find(colEnBlanco)
  const col = libre ?? agregarColumna()
  if (!col) return
  col.proveedor = nombre
  alCambiarProveedor(col)
}

/** Al escribir/elegir un proveedor conocido se completan contacto, teléfono y la calificación sugerida (solo si estaban vacíos). */
function alCambiarProveedor(col) {
  const p = buscarPrevio(col.proveedor)
  col.previo = p
  if (!p) return
  col.proveedor = p.proveedor
  if (col.id) return
  if (!col.contacto) col.contacto = p.contacto ?? ''
  if (!col.telefono) col.telefono = p.telefono ?? ''
  if (!col.direccion) col.direccion = p.direccion ?? ''
  if (!col.calificacion && p.calificacionPromedio) col.calificacion = p.calificacionPromedio
}

function cambiarGarantia(col, v) {
  col.garantiaResp = v
  if (v === 'ninguna') col.garantiaMeses = '0'
  else if (col.garantiaMeses === '0') col.garantiaMeses = ''
}

function quitar(col) {
  if (col.id) {
    descartar.value = col
    return
  }
  cols.value = cols.value.filter((c) => c !== col)
  if (cols.value.length === 0 && editable.value) cols.value = [colVacia()]
}
async function accionDescartar(motivo) {
  const col = descartar.value
  if (!col?.id) return
  await descartarCotizacion(col.id, { motivo })
  bump()
  toast('Cotización descartada.')
  cols.value = cols.value.filter((c) => c !== col)
  delete base.value[col.key]
  if (cols.value.length === 0) cols.value = [colVacia()]
}

async function subirArchivo(col, ev) {
  const input = ev.target
  const f = input.files?.[0]
  if (!f) return
  col.subiendo = true
  try {
    col.archivoUrl = await uploadFactura(`compras/${props.folio}`, f)
  } catch {
    toast('No se pudo subir el archivo. Intenta de nuevo.', 'error')
  } finally {
    col.subiendo = false
    input.value = ''
  }
}

// ---- Teclado y pegado ---------------------------------------------------------------------------------------------------------
function celda(i, j) {
  return raiz.value?.querySelector(`[data-celda="p-${i}-${j}"]`) ?? null
}
/** Enter baja a la siguiente partida; en la última pasa a la primera de la columna siguiente (Shift+Enter sube). */
function enter(e, i, j) {
  const n = partidas.value.length
  const destino = e.shiftKey ? (celda(i - 1, j) ?? celda(n - 1, j - 1)) : (celda(i + 1, j) ?? celda(0, j + 1))
  destino?.focus()
  destino?.select()
}
/** Pegar varias líneas (una columna de Excel) o un bloque (varias columnas separadas por tab) reparte los precios desde la celda actual. */
function pegar(e, i, j) {
  const txt = e.clipboardData?.getData('text') ?? ''
  if (!/[\n\t]/.test(txt.trim())) return
  e.preventDefault()
  const lineas = txt.replace(/\r/g, '').split('\n')
  while (lineas.length && lineas[lineas.length - 1].trim() === '') lineas.pop()
  let n = 0
  lineas.forEach((linea, di) => {
    linea.split('\t').forEach((valor, dj) => {
      const p = partidas.value[i + di]
      const c = cols.value[j + dj]
      const limpio = limpiarNumPegado(valor)
      if (p && c && limpio !== '') {
        c.precios[p.id] = limpio
        n++
      }
    })
  })
  toast(n ? `Pegaste ${n} precio${n === 1 ? '' : 's'}.` : 'No encontré precios en lo que pegaste.', n ? 'success' : 'info')
}

// ---- Guardar ------------------------------------------------------------------------------------------------------------------
/** Guarda las columnas (altas y cambios) y devuelve { llave de columna → id guardado }. */
async function persistir() {
  const llenas = cols.value.filter((c) => !colEnBlanco(c))
  if (llenas.length === 0) throw new Error('Captura al menos un proveedor con sus precios.')
  for (const c of llenas) {
    if (!c.proveedor.trim()) throw new Error('Cada columna con precios necesita el nombre del proveedor.')
    const problema = problemaCol(c, partidas.value)
    if (problema) throw new Error(problema)
    if (!partidas.value.some((p) => precioDe(c, p.id) !== undefined)) throw new Error(`«${c.proveedor.trim()}» no tiene ningún precio: captura al menos uno o quita la columna.`)
  }
  const ids = await guardarHoja(props.folio, llenas.map((c) => aColumnaHoja(c, partidas.value)))
  llenas.forEach((c, i) => (c.id = ids[i])) // así un reintento no duplica la cotización
  // La excepción se guarda en la requisición solo si está completa (en un borrador a medias no estorba).
  if (mostrarExc.value && exc.value.tipo && excepcionLista.value) await guardarExcepcion(props.folio, exc.value)
  return new Map(llenas.map((c, i) => [c.key, ids[i]]))
}

async function guardarBorrador() {
  errorHoja.value = ''
  ocupado.value = 'borrador'
  try {
    const ids = await persistir()
    const sel = ids.get(seleccionEfectiva.value)
    bump()
    cargar(sel)
    toast(`Borrador guardado (${ids.size} cotización${ids.size === 1 ? '' : 'es'}).`)
  } catch (e) {
    errorHoja.value = e instanceof Error && e.message ? e.message : 'No se pudo guardar la hoja.'
  } finally {
    ocupado.value = ''
  }
}

const datosEnvio = computed(() => {
  const f = resultado.value.filas.find((x) => x.id === envio.value?.key)
  if (!f) return null
  return {
    proveedor: f.proveedor,
    total: f.total,
    evaluacion: evaluarEleccion(resultado.value, f.id),
    aprobadores: aprobadoresElegibles(f.total).map((p) => p.nombre),
    avisaDireccion: avisoDireccion(f.total).avisa,
  }
})

function abrirEnvio() {
  errorHoja.value = ''
  const llenas = cols.value.filter((c) => !colEnBlanco(c))
  if (llenas.length === 0) {
    errorHoja.value = 'Captura al menos un proveedor con sus precios.'
    return
  }
  for (const c of llenas) {
    const problema = problemaCol(c, partidas.value)
    if (problema) {
      errorHoja.value = problema
      return
    }
  }
  if (minimas.value.requiereExcepcion && completasN.value > 0 && !excepcionLista.value) {
    errorHoja.value = exc.value.tipo || exc.value.justificacion ? errorExcepcion(exc.value) : minimas.value.mensajes[0]
    return
  }
  const key = seleccionEfectiva.value
  if (!key || !resultado.value.filas.find((f) => f.id === key)?.elegible) {
    errorHoja.value = 'Ninguna cotización trae precio en todas las partidas: completa al menos una para poder enviarla a autorización.'
    return
  }
  envio.value = { key }
}

async function ejecutarEnvio(v) {
  const key = envio.value?.key
  if (!key) return
  ocupado.value = 'envio'
  try {
    const ids = await persistir()
    const id = ids.get(key)
    if (!id) throw new Error('No se encontró la cotización elegida.')
    await elegirProveedor(props.folio, id, {
      justificacion: v.justificacion || undefined,
      ...(minimas.value.requiereExcepcion
        ? { excepcionTipo: exc.value.tipo, excepcionInstruidaPor: exc.value.instruidaPor, excepcionCotizaciones: exc.value.justificacion }
        : {}),
    })
    // Catálogo de proveedores: antes de pedir la autorización hay que registrar al proveedor elegido (razón social, RFC, dirección, CP y CLABE si es
    // transferencia). La cotización ya quedó elegida: se lleva a Adquisiciones a la pestaña Autorización, donde está el bloque «Proveedor para la compra».
    const faltaProveedor = motivoProveedorIncompleto(getRequisicion(props.folio))
    if (faltaProveedor) {
      bump()
      cargar(id)
      toast('Quedó elegida la cotización. Antes de enviarla a autorización registra al proveedor en el catálogo (bloque «Proveedor para la compra»).', 'info')
      emit('enviada')
      return
    }
    const r = await solicitarAutorizacion(props.folio)
    bump()
    cargar(id) // la hoja queda en solo lectura con lo guardado
    toast(
      r.correosEnviados > 0
        ? `Enviada a autorización: ${r.correosEnviados} correo${r.correosEnviados === 1 ? '' : 's'} a Finanzas (${r.aprobadores.join(', ')}; basta uno)${r.avisoDireccion ? '; Dirección recibe un aviso informativo' : ''}${r.avisosExcepcion ? '; Dirección recibe un aviso por la excepción de cotizaciones' : ''}.`
        : 'Enviada a autorización. Los aprobadores de Finanzas elegibles no tienen correo en el directorio: se decide desde la app.',
      'success',
    )
    emit('enviada')
  } finally {
    ocupado.value = ''
  }
}
</script>
