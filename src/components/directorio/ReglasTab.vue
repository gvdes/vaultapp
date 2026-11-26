<template>
  <div class="flex flex-col gap-3 pb-2">
    <!-- Estado de las reglas -->
    <div v-if="!confirmadas" class="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-vz-warning/40 bg-vz-warning/10 p-3 text-[12.5px] text-text">
      <p class="min-w-0 flex-1">
        <span class="mr-1 rounded-full bg-vz-warning px-2 py-0.5 text-[11px] font-extrabold text-white">Parte de las reglas sigue por confirmar con Finanzas</span>
        Regla vigente: <b>un solo nivel de decisión, Finanzas</b> (con tope de aprobación por persona); Dirección solo recibe un aviso de las compras de <b>más de $50,000</b>. Cotizaciones decididas por Dirección: las compras de <b>menos de {{ formatoUmbral(cfg.umbralSinCotizacion) }}</b> no llevan cotización, solo el registro (siguen requiriendo autorización de Finanzas); de ahí a <b>menos de {{ formatoUmbral(cfg.umbralCotizacionSimple) }}</b> basta <b>1 cotización</b>; desde {{ formatoUmbral(cfg.umbralCotizacionSimple) }} se requieren <b>{{ cfg.cotizacionesMinimas }} cotizaciones de proveedores distintos</b>, salvo excepción documentada (producto o servicio especializado, adjudicación directa de CEO/DGA o urgencia: basta 1). Cuando los acuerden, Dirección los marca como confirmados; cambiar cualquier regla vuelve a pedir la confirmación.
      </p>
      <button
        v-if="puedeEditar"
        type="button"
        :disabled="guardando || cambios.length > 0"
        :title="cambios.length > 0 ? 'Guarda o descarta primero los cambios pendientes' : ''"
        class="h-9 rounded-lg bg-vz-blue px-3 text-[13px] font-bold text-white hover:bg-primary-hover disabled:opacity-50"
        @click="confirmarConFinanzas"
      >
        Marcar como confirmadas con Finanzas
      </button>
    </div>
    <div v-else class="flex gap-2.5 rounded-xl border border-vz-success/30 bg-vz-success/10 p-3 text-[12.5px] text-text">
      <p>
        <span class="mr-1 rounded-full bg-vz-success px-2 py-0.5 text-[11px] font-extrabold text-white">Confirmadas con Finanzas</span>
        el {{ fechaCorta(confirmadas.fecha) }} por <b>{{ confirmadas.por }}</b>. Si se cambia cualquier regla, habrá que volver a confirmarlas.
      </p>
    </div>

    <p v-if="!puedeEditar" class="rounded-lg border border-border bg-bg px-3 py-2 text-[12.5px] text-text-muted">
      Vista de consulta: solo Dirección General puede modificar las reglas. Todo cambio queda registrado en la bitácora.
    </p>
    <p v-if="ultimoGlobal" class="text-[12px] text-text-muted">
      Último cambio de reglas: <b class="text-text">{{ ultimoGlobal.usuario }}</b> · {{ fechaCorta(ultimoGlobal.fecha) }}
    </p>

    <!-- Reglas -->
    <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <!-- Umbral sin cotización (compra menor) -->
      <section class="rounded-xl border border-border bg-surface p-4" data-test="regla-sin-cotizacion">
        <h3 class="text-[13.5px] font-extrabold text-text">Umbral sin cotización (compra menor)</h3>
        <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
          Una compra con monto <b>menor a este valor</b> no requiere cotización: solo el <b>registro</b> del proveedor y el monto. <b>Sigue requiriendo la autorización de Finanzas.</b>
          «Menor a» es estricto: una compra de exactamente este monto ya necesita cotización.
        </p>
        <div class="flex items-center gap-2">
          <span class="text-[13px] font-bold text-text-muted">$</span>
          <input v-model="fSinCot" type="number" min="0" step="10" inputmode="decimal" :disabled="!puedeEditar" :class="inputClass" aria-label="Umbral sin cotización en pesos" />
          <span class="text-[12px] text-text-soft">MXN</span>
        </div>
        <p v-if="errores.sinCot" class="mt-1 text-[11.5px] font-semibold text-vz-danger">{{ errores.sinCot }}</p>
        <p v-if="ultimo('umbral_sin_cotizacion')" class="mt-1.5 text-[11.5px] text-text-soft">{{ textoUltimo('umbral_sin_cotizacion') }}</p>
      </section>

      <!-- Umbral cotización simple -->
      <section class="rounded-xl border border-border bg-surface p-4">
        <h3 class="text-[13.5px] font-extrabold text-text">Umbral de cotización simple</h3>
        <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
          <b>Compras menores a este monto: basta 1 cotización.</b> A partir de ese monto (inclusive: una compra de exactamente este monto ya lo exige) se requieren las cotizaciones mínimas de
          <b>proveedores distintos</b>, salvo excepción documentada.
        </p>
        <div class="flex items-center gap-2">
          <span class="text-[13px] font-bold text-text-muted">$</span>
          <input v-model="fSimple" type="number" min="0" step="100" inputmode="decimal" :disabled="!puedeEditar" :class="inputClass" aria-label="Umbral de cotización simple en pesos" />
          <span class="text-[12px] text-text-soft">MXN</span>
        </div>
        <p v-if="errores.simple" class="mt-1 text-[11.5px] font-semibold text-vz-danger">{{ errores.simple }}</p>
        <p v-if="ultimo('umbral_cotizacion_simple')" class="mt-1.5 text-[11.5px] text-text-soft">{{ textoUltimo('umbral_cotizacion_simple') }}</p>
      </section>

      <!-- Umbral de aviso a Dirección -->
      <section class="rounded-xl border border-border bg-surface p-4">
        <h3 class="text-[13.5px] font-extrabold text-text">Umbral de aviso a Dirección <span v-if="cfg.umbralDireccion === 50000" class="ml-1 rounded-full bg-vz-success/15 px-2 py-0.5 align-middle text-[10.5px] font-extrabold text-vz-success">Confirmado por Finanzas</span></h3>
        <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
          Finanzas decide siempre. Por encima de este monto, <b>Dirección recibe un correo informativo</b> (sin botones: no aprueba ni tiene que autorizar), una vez por envío a autorización. Más de $50,000.
        </p>
        <div class="flex items-center gap-2">
          <span class="text-[13px] font-bold text-text-muted">$</span>
          <input v-model="fDir" type="number" min="0" step="500" inputmode="decimal" :disabled="!puedeEditar" :class="inputClass" aria-label="Umbral de aviso a Dirección en pesos" />
          <span class="text-[12px] text-text-soft">MXN</span>
        </div>
        <p v-if="errores.dir" class="mt-1 text-[11.5px] font-semibold text-vz-danger">{{ errores.dir }}</p>
        <p v-else-if="avisos.dir" class="mt-1 text-[11.5px] font-semibold text-vz-warning">{{ avisos.dir }}</p>
        <p v-if="ultimo('umbral_direccion')" class="mt-1.5 text-[11.5px] text-text-soft">{{ textoUltimo('umbral_direccion') }}</p>
      </section>

      <!-- Aprobadores de Finanzas y sus topes (se editan en la pestaña Personas) -->
      <section class="rounded-xl border border-border bg-surface p-4">
        <h3 class="text-[13.5px] font-extrabold text-text">Aprobadores de Finanzas y sus topes</h3>
        <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
          Una compra le llega a <b>todos los aprobadores cuyo tope cubre su monto</b> y basta uno. Sin tope = cualquier monto. Los topes los asigna Dirección en la pestaña de personas.
        </p>
        <ul v-if="aprobadores.length" class="flex flex-col gap-1">
          <li v-for="p in aprobadores" :key="p.id" class="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-[12.5px]">
            <span class="min-w-0 break-words font-bold text-text">{{ p.nombre }}</span>
            <span class="shrink-0 text-text-muted">{{ p.topeAprobacion === undefined || p.topeAprobacion === null ? 'sin tope' : `hasta ${formatoMoneda(p.topeAprobacion)}` }}</span>
          </li>
        </ul>
        <p v-else class="rounded-lg border border-vz-danger/40 bg-vz-danger/10 px-3 py-2 text-[12.5px] font-semibold text-vz-danger">No hay aprobadores de Finanzas activos: ninguna compra se podría enviar a autorización.</p>
      </section>

      <!-- Cotizaciones mínimas -->
      <section class="rounded-xl border border-border bg-surface p-4">
        <h3 class="text-[13.5px] font-extrabold text-text">Cotizaciones mínimas</h3>
        <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
          <b>A partir del umbral de cotización simple se requieren N cotizaciones de proveedores distintos</b>, salvo excepción documentada (producto o servicio especializado, adjudicación directa
          instruida por CEO/DGA o urgencia, con justificación): con excepción basta 1. No aplica a las compras menores (solo registro).
        </p>
        <div class="flex items-center gap-2">
          <input v-model="fMinimas" type="number" min="1" max="10" step="1" inputmode="numeric" :disabled="!puedeEditar" :class="inputClass" aria-label="Cotizaciones mínimas" />
          <span class="whitespace-nowrap text-[12px] text-text-soft">cotizaciones</span>
        </div>
        <p v-if="errores.minimas" class="mt-1 text-[11.5px] font-semibold text-vz-danger">{{ errores.minimas }}</p>
        <p v-if="ultimo('cotizaciones_minimas')" class="mt-1.5 text-[11.5px] text-text-soft">{{ textoUltimo('cotizaciones_minimas') }}</p>
      </section>

      <!-- Tolerancia -->
      <section class="rounded-xl border border-border bg-surface p-4">
        <h3 class="text-[13.5px] font-extrabold text-text">Tolerancia de diferencia</h3>
        <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
          Cuánto puede exceder lo comprado a lo autorizado antes de exigir justificación y nueva aprobación de Finanzas. <b>0 %</b> = cualquier excedente se revisa.
        </p>
        <div class="flex items-center gap-2">
          <input v-model="fTol" type="number" min="0" max="100" step="0.5" inputmode="decimal" :disabled="!puedeEditar" :class="inputClass" aria-label="Tolerancia en porcentaje" />
          <span class="text-[12px] text-text-soft">%</span>
        </div>
        <p v-if="errores.tol" class="mt-1 text-[11.5px] font-semibold text-vz-danger">{{ errores.tol }}</p>
        <p v-if="ultimo('tolerancia_diferencia_pct')" class="mt-1.5 text-[11.5px] text-text-soft">{{ textoUltimo('tolerancia_diferencia_pct') }}</p>
      </section>

      <!-- Vigencia ligas -->
      <section class="rounded-xl border border-border bg-surface p-4">
        <h3 class="text-[13.5px] font-extrabold text-text">Vigencia de las ligas de aprobación</h3>
        <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
          Días que sirve la liga del correo para aprobar o rechazar. Pasado ese plazo, hay que aprobar desde la plataforma.
        </p>
        <div class="flex items-center gap-2">
          <input v-model="fDias" type="number" min="1" max="90" step="1" inputmode="numeric" :disabled="!puedeEditar" :class="inputClass" aria-label="Días de vigencia de las ligas" />
          <span class="text-[12px] text-text-soft">días</span>
        </div>
        <p v-if="errores.dias" class="mt-1 text-[11.5px] font-semibold text-vz-danger">{{ errores.dias }}</p>
        <p v-if="ultimo('dias_expira_token')" class="mt-1.5 text-[11.5px] text-text-soft">{{ textoUltimo('dias_expira_token') }}</p>
      </section>

      <!-- Cotizador: pesos del puntaje -->
      <section class="rounded-xl border border-border bg-surface p-4 lg:col-span-2" aria-labelledby="reg-pesos">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <h3 id="reg-pesos" class="text-[13.5px] font-extrabold text-text">Cotizador: qué tanto pesa cada criterio</h3>
            <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
              Al comparar cotizaciones, la plataforma da a cada una un puntaje de 0 a 100 y <b>recomienda la de mayor puntaje</b>. Aquí decides cuánto vale cada criterio; los
              pesos deben <b>sumar 100</b>. Lo que una cotización no trae capturado no la perjudica (su peso se reparte entre los demás criterios).
            </p>
          </div>
          <button v-if="puedeEditar" type="button" class="h-8 rounded-lg border border-border bg-surface px-2.5 text-[12px] font-bold text-text hover:bg-surface-hover" @click="restablecerPesos">Valores de fábrica</button>
        </div>
        <div class="flex h-3 overflow-hidden rounded-full bg-border" role="img" :aria-label="`Reparto de pesos: ${resumenPesos}`">
          <div v-for="c in CRITERIOS_ORDEN" :key="c" :class="COLOR_PESO[c]" :style="{ width: `${((numPeso(c) || 0) / Math.max(sumaBorrador, 100)) * 100}%` }" :title="`${CRITERIOS_INFO[c].label}: ${numPeso(c) || 0}`" />
        </div>
        <ul class="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <li v-for="c in CRITERIOS_ORDEN" :key="c" class="rounded-lg border border-border bg-bg p-2.5">
            <div class="flex items-center justify-between gap-2">
              <label :for="`peso-${c}`" class="flex min-w-0 items-center gap-1.5 text-[12.5px] font-bold text-text"><span :class="`h-2.5 w-2.5 shrink-0 rounded-full ${COLOR_PESO[c]}`" aria-hidden="true" />{{ CRITERIOS_INFO[c].label }}</label>
              <div class="flex w-24 items-center gap-1">
                <input :id="`peso-${c}`" v-model="fPesos[c]" type="number" min="0" max="100" step="1" inputmode="numeric" :disabled="!puedeEditar" :class="`${inputClass} text-right`" />
                <span class="text-[12px] text-text-soft">%</span>
              </div>
            </div>
            <input v-model="fPesos[c]" type="range" min="0" max="100" step="1" :disabled="!puedeEditar" class="mt-1.5 w-full accent-vz-blue" :aria-label="`Peso de ${CRITERIOS_INFO[c].label}`" />
            <p class="mt-0.5 text-[11.5px] leading-snug text-text-muted">{{ CRITERIOS_INFO[c].explicacion }}</p>
          </li>
        </ul>
        <p :class="`mt-2 text-[12.5px] font-bold ${errores.pesos ? 'text-vz-danger' : 'text-vz-success'}`" role="status">
          Suma: {{ sumaBorrador }} de 100 <template v-if="errores.pesos">· {{ errores.pesos }}</template><template v-else>· listo</template>
        </p>
        <p v-if="ultimo('cotizador_pesos')" class="mt-1 text-[11.5px] text-text-soft">{{ textoUltimo('cotizador_pesos') }}</p>
      </section>

      <!-- IVA -->
      <section class="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
        <h3 class="text-[13.5px] font-extrabold text-text">Tasa de IVA del cotizador</h3>
        <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
          Si una cotización dice que sus precios <b>no incluyen IVA</b>, el comparativo le suma esta tasa para compararla con las que sí lo incluyen (y ese total es el que se autoriza).
        </p>
        <div class="flex max-w-xs items-center gap-2">
          <input v-model="fIva" type="number" min="0" max="100" step="0.5" inputmode="decimal" :disabled="!puedeEditar" :class="inputClass" aria-label="Tasa de IVA en porcentaje" />
          <span class="text-[12px] text-text-soft">%</span>
        </div>
        <p v-if="errores.iva" class="mt-1 text-[11.5px] font-semibold text-vz-danger">{{ errores.iva }}</p>
        <p v-if="ultimo('iva_pct')" class="mt-1.5 text-[11.5px] text-text-soft">{{ textoUltimo('iva_pct') }}</p>
      </section>

      <!-- URL base -->
      <section class="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
        <h3 class="text-[13.5px] font-extrabold text-text">Dirección pública de la app</h3>
        <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
          Con ella se arman las ligas de los correos (seguimiento, aprobar). Escríbela completa y sin diagonal final. Ej. <code class="rounded bg-bg px-1">https://inventarios.empresa.mx</code>
        </p>
        <input v-model="fUrl" type="url" inputmode="url" placeholder="https://…" :disabled="!puedeEditar" :class="inputClass" aria-label="Dirección pública de la app" />
        <p v-if="errores.url" class="mt-1 text-[11.5px] font-semibold text-vz-danger">{{ errores.url }}</p>
        <p v-else-if="avisos.url" class="mt-1 text-[11.5px] font-semibold text-vz-warning">{{ avisos.url }}</p>
        <p v-if="ultimo('url_base')" class="mt-1.5 text-[11.5px] text-text-soft">{{ textoUltimo('url_base') }}</p>
      </section>

      <!-- Copias -->
      <section class="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
        <h3 class="text-[13.5px] font-extrabold text-text">Copias de respaldo de los correos</h3>
        <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
          Estas direcciones reciben copia de los avisos (no de los correos con ligas de aprobación). Útil para Auditoría o Dirección. Una por línea.
        </p>
        <textarea v-model="fCopias" rows="3" placeholder="auditoria@empresa.mx" :disabled="!puedeEditar" :class="textareaClass" aria-label="Correos de copia de respaldo" />
        <p v-if="errores.copias" class="mt-1 text-[11.5px] font-semibold text-vz-danger">{{ errores.copias }}</p>
        <p v-else class="mt-1 text-[11.5px] text-text-soft">{{ copiasParseadas.length === 0 ? 'Sin copias configuradas.' : `${copiasParseadas.length} dirección(es) en copia.` }}</p>
        <p v-if="ultimo('copias_respaldo')" class="mt-1 text-[11.5px] text-text-soft">{{ textoUltimo('copias_respaldo') }}</p>
      </section>
    </div>

    <!-- Barra de guardado -->
    <div
      v-if="puedeEditar && cambios.length > 0"
      class="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-vz-blue/40 bg-surface p-3 shadow-lg"
    >
      <p class="text-[12.5px] text-text"><b>{{ cambios.length }}</b> cambio(s) sin guardar<template v-if="hayErrores"> · corrige los errores marcados</template></p>
      <div class="flex gap-2">
        <button type="button" class="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-bold text-text hover:bg-surface-hover" :disabled="guardando" @click="descartar">Descartar</button>
        <button type="button" :disabled="guardando || hayErrores" class="h-9 rounded-lg bg-vz-blue px-4 text-[13px] font-bold text-white hover:bg-primary-hover disabled:opacity-50" @click="guardar">
          {{ guardando ? 'Guardando…' : 'Guardar cambios' }}
        </button>
      </div>
    </div>

    <!-- Simulador -->
    <section class="rounded-xl border border-border bg-surface p-4">
      <h3 class="text-[13.5px] font-extrabold text-text">¿Qué pasa con una compra de…?</h3>
      <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
        Prueba un monto para ver qué exigiría el sistema. <template v-if="cambios.length > 0">Usa los valores que estás editando (aún sin guardar).</template>
      </p>
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <div class="flex w-44 items-center gap-1.5">
          <span class="text-[13px] font-bold text-text-muted">$</span>
          <input v-model="fMonto" type="number" min="0" step="100" inputmode="decimal" :class="inputClass" aria-label="Monto de ejemplo" />
        </div>
        <button v-for="m in montosEjemplo" :key="m.etiqueta" type="button" class="rounded-full border border-border bg-bg px-2.5 py-1 text-[11.5px] font-bold text-text-muted hover:border-vz-blue/50 hover:text-text" @click="fMonto = String(m.monto)">
          {{ m.etiqueta }}
        </button>
      </div>
      <div class="rounded-lg border border-border bg-bg p-3">
        <p class="text-[13px] font-bold text-text">Una compra de {{ formatoMoneda(montoEjemplo) }} necesitará:</p>
        <ul class="mt-1.5 list-disc space-y-1 pl-5 text-[12.5px] text-text-muted">
          <li v-for="l in impacto" :key="l">{{ l }}</li>
        </ul>
      </div>
    </section>

    <!-- Categorías -->
    <section class="rounded-xl border border-border bg-surface p-4">
      <h3 class="text-[13.5px] font-extrabold text-text">Categorías de compra y destino de inventario</h3>
      <p class="mb-2 mt-0.5 text-[12px] text-text-muted">
        Al comprar, lo de cada categoría se convierte en una recepción pendiente para el custodio indicado (o se cierra sin inventario). Solo consulta.
      </p>
      <p v-if="categorias.length === 0" class="rounded-lg border border-dashed border-border p-4 text-center text-[12.5px] text-text-soft">Aún no hay categorías cargadas.</p>
      <div v-else class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <div v-for="c in categorias" :key="c.id" class="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2">
          <p class="min-w-0 break-words text-[12.5px] font-bold text-text">{{ c.nombre }}</p>
          <StatusPill :label="DESTINO[c.destinoInventario].label" :tone="DESTINO[c.destinoInventario].tono" />
        </div>
      </div>
      <p class="mt-2 text-[11.5px] text-text-soft">
        Custodio de TI: {{ custodios.ti || 'sin titular en el directorio' }} · Custodio de Mantenimiento: {{ custodios.mantenimiento || 'sin titular en el directorio' }}
      </p>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import StatusPill from 'components/StatusPill.vue'
import { inputClass, textareaClass } from 'components/formClasses'
import { useConfirm } from 'src/composables/useConfirm'
import { useToast } from 'src/composables/useToast'
import { bump } from 'src/lib/reactive'
import { listBitacora, loadBitacoraCache } from 'src/lib/bitacora'
import {
  confirmarReglas,
  getReglasConfirmadas,
  formatoMoneda,
  getConfig,
  aprobadoresElegibles,
  listCategorias,
  participantesPorRol,
  setConfig,
  CRITERIOS_INFO,
  CRITERIOS_ORDEN,
  PESOS_DEFAULT,
  formatoUmbral,
} from 'src/lib/compras'
import { correoValido, fechaCorta } from './directorioUtils'

defineProps({ puedeEditar: { type: Boolean, required: true } })

const confirmar = useConfirm()
const toast = useToast()

const DESTINO = {
  ti: { label: 'Inventario de TI', tono: 'info' },
  mantenimiento: { label: 'Inventario de Mantenimiento', tono: 'warning' },
  ninguno: { label: 'Sin inventario', tono: 'neutral' },
}

/** Clave de cada regla en `cmp_config` (para localizar su último cambio en la bitácora). */
const CLAVE = {
  umbralCotizacionSimple: 'umbral_cotizacion_simple',
  umbralSinCotizacion: 'umbral_sin_cotizacion',
  umbralDireccion: 'umbral_direccion',
  umbralCeo: 'umbral_ceo',
  cotizacionesMinimas: 'cotizaciones_minimas',
  copiasRespaldo: 'copias_respaldo',
  toleranciaDiferenciaPct: 'tolerancia_diferencia_pct',
  diasExpiraToken: 'dias_expira_token',
  urlBase: 'url_base',
  ivaPct: 'iva_pct',
  cotizadorPesos: 'cotizador_pesos',
}

const COLOR_PESO = {
  precio: 'bg-vz-blue',
  garantia: 'bg-vz-success',
  entrega: 'bg-vz-warning',
  credito: 'bg-vz-gold',
  respaldo: 'bg-vz-steel',
  condiciones: 'bg-vz-danger',
  calificacion: 'bg-text-soft',
}

const cfg = computed(() => getConfig())
const aprobadores = computed(() => participantesPorRol('finanzas'))

// ---- Borrador editable (texto) ----
const fSimple = ref('')
const fSinCot = ref('')
const fDir = ref('')
const fMinimas = ref('')
const fTol = ref('')
const fDias = ref('')
const fUrl = ref('')
const fCopias = ref('')
const fIva = ref('')
const fPesos = reactive({ precio: 40, garantia: 15, entrega: 10, credito: 10, respaldo: 15, condiciones: 5, calificacion: 5 })
const fMonto = ref('1500')
const guardando = ref(false)

function cargarBorrador() {
  const c = cfg.value
  fSimple.value = String(c.umbralCotizacionSimple)
  fSinCot.value = String(c.umbralSinCotizacion)
  fDir.value = String(c.umbralDireccion)
  fMinimas.value = String(c.cotizacionesMinimas)
  fTol.value = String(c.toleranciaDiferenciaPct)
  fDias.value = String(c.diasExpiraToken)
  fUrl.value = c.urlBase
  fCopias.value = c.copiasRespaldo.join('\n')
  fIva.value = String(c.ivaPct)
  for (const k of CRITERIOS_ORDEN) fPesos[k] = c.cotizadorPesos[k]
}
cargarBorrador()

/** Los inputs type="number" con v-model entregan un número (o '' vacío): se normaliza a texto antes de recortar. */
function num(s) {
  return String(s ?? '').trim() === '' ? NaN : Number(s)
}

const numPeso = (k) => (String(fPesos[k]).trim() === '' ? NaN : Number(fPesos[k]))
const sumaBorrador = computed(() => CRITERIOS_ORDEN.reduce((s, k) => s + (Number.isFinite(numPeso(k)) ? numPeso(k) : 0), 0))
const resumenPesos = computed(() => CRITERIOS_ORDEN.map((k) => `${CRITERIOS_INFO[k].label} ${Number.isFinite(numPeso(k)) ? numPeso(k) : 0}`).join(', '))
function restablecerPesos() {
  for (const k of CRITERIOS_ORDEN) fPesos[k] = PESOS_DEFAULT[k]
}

const copiasParseadas = computed(() => [...new Set(fCopias.value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))])

// ---- Validación ----
const errores = computed(() => {
  const e = {}
  const malPeso = CRITERIOS_ORDEN.find((k) => !Number.isFinite(numPeso(k)) || numPeso(k) < 0 || numPeso(k) > 100)
  if (malPeso) e.pesos = `El peso de «${CRITERIOS_INFO[malPeso].label}» debe estar entre 0 y 100.`
  else if (Math.abs(sumaBorrador.value - 100) > 1e-9) e.pesos = sumaBorrador.value > 100 ? `Se pasa por ${sumaBorrador.value - 100}: baja algún criterio.` : `Faltan ${100 - sumaBorrador.value} para llegar a 100.`
  const iva = num(fIva.value)
  if (!Number.isFinite(iva) || iva < 0 || iva > 100) e.iva = 'Debe estar entre 0 y 100.'
  const s = num(fSimple.value)
  if (!Number.isFinite(s) || s < 0) e.simple = 'Escribe un monto de 0 o más.'
  const sc = num(fSinCot.value)
  if (!Number.isFinite(sc) || sc < 0) e.sinCot = 'Escribe un monto de 0 o más.'
  const d = num(fDir.value)
  if (!Number.isFinite(d) || d < 0) e.dir = 'Escribe un monto de 0 o más.'
  const m = num(fMinimas.value)
  if (!Number.isInteger(m) || m < 1 || m > 10) e.minimas = 'Debe ser un número entero entre 1 y 10.'
  const t = num(fTol.value)
  if (!Number.isFinite(t) || t < 0 || t > 100) e.tol = 'Debe estar entre 0 y 100.'
  const dias = num(fDias.value)
  if (!Number.isInteger(dias) || dias < 1 || dias > 90) e.dias = 'Debe ser un número entero de días entre 1 y 90.'
  const u = fUrl.value.trim()
  if (u) {
    try {
      const url = new URL(u)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') e.url = 'Debe empezar con https:// (o http://).'
      else if (url.search || url.hash) e.url = 'No lleva parámetros ni #; solo la dirección base.'
    } catch {
      e.url = 'No es una dirección válida (ej. https://inventarios.empresa.mx).'
    }
  }
  const malas = copiasParseadas.value.filter((c) => !correoValido(c))
  if (malas.length > 0) e.copias = `Correo(s) no válido(s): ${malas.join(', ')}`
  return e
})
const avisos = computed(() => {
  const a = {}
  if (!errores.value.simple && !errores.value.dir && num(fDir.value) < num(fSimple.value)) a.dir = 'Es menor que el umbral de cotización simple: revisa que sea lo que quieres.'
  const u = fUrl.value.trim()
  if (!errores.value.url) {
    if (!u) a.url = 'Vacía: los correos usarán la dirección con la que se abra la app, que puede no ser la pública.'
    else if (u.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(u)) a.url = 'Conviene https:// para que las ligas de los correos sean seguras.'
  }
  return a
})
const hayErrores = computed(() => Object.keys(errores.value).length > 0)

// ---- Cambios pendientes ----
/**
 * @typedef {object} Cambio
 * @property {keyof ConfigCompras} campo
 * @property {string} etiqueta
 * @property {string} antes
 * @property {string} despues
 * @property {ConfigCompras[keyof ConfigCompras]} valor
 */
const cambios = computed(() => {
  const c = cfg.value
  const out = []
  const add = (campo, etiqueta, antes, despues, valor) => {
    if (antes !== despues) out.push({ campo, etiqueta, antes, despues, valor })
  }
  const s = num(fSimple.value)
  if (Number.isFinite(s)) add('umbralCotizacionSimple', 'Umbral de cotización simple', formatoMoneda(c.umbralCotizacionSimple), formatoMoneda(s), s)
  const sc = num(fSinCot.value)
  if (Number.isFinite(sc)) add('umbralSinCotizacion', 'Umbral sin cotización', formatoMoneda(c.umbralSinCotizacion), formatoMoneda(sc), sc)
  const d = num(fDir.value)
  if (Number.isFinite(d)) add('umbralDireccion', 'Umbral de aviso a Dirección', formatoMoneda(c.umbralDireccion), formatoMoneda(d), d)
  const m = num(fMinimas.value)
  if (Number.isFinite(m)) add('cotizacionesMinimas', 'Cotizaciones mínimas', String(c.cotizacionesMinimas), String(m), m)
  const t = num(fTol.value)
  if (Number.isFinite(t)) add('toleranciaDiferenciaPct', 'Tolerancia de diferencia', `${c.toleranciaDiferenciaPct} %`, `${t} %`, t)
  const dias = num(fDias.value)
  if (Number.isFinite(dias)) add('diasExpiraToken', 'Vigencia de ligas', `${c.diasExpiraToken} días`, `${dias} días`, dias)
  const url = fUrl.value.trim().replace(/\/+$/, '')
  add('urlBase', 'Dirección pública de la app', c.urlBase || '(vacía)', url || '(vacía)', url)
  const iva = num(fIva.value)
  if (Number.isFinite(iva)) add('ivaPct', 'Tasa de IVA del cotizador', `${c.ivaPct} %`, `${iva} %`, iva)
  if (!errores.value.pesos) {
    const nuevos = Object.fromEntries(CRITERIOS_ORDEN.map((k) => [k, numPeso(k)]))
    const texto = (p) => CRITERIOS_ORDEN.map((k) => `${CRITERIOS_INFO[k].label} ${p[k]}`).join(' · ')
    add('cotizadorPesos', 'Pesos del cotizador', texto(c.cotizadorPesos), texto(nuevos), nuevos)
  }
  const copias = copiasParseadas.value
  add('copiasRespaldo', 'Copias de respaldo', c.copiasRespaldo.join(', ') || '(ninguna)', copias.join(', ') || '(ninguna)', copias)
  return out
})

function descartar() {
  cargarBorrador()
}

async function guardar() {
  if (hayErrores.value || cambios.value.length === 0) return
  const resumen = cambios.value.map((c) => `${c.etiqueta}: ${c.antes} → ${c.despues}`).join(' · ')
  const ok = await confirmar({
    title: 'Guardar reglas de compras',
    message: `Se aplicarán a las requisiciones nuevas y quedará en la bitácora. ${resumen}`,
    confirmLabel: 'Guardar',
  })
  if (!ok) return
  guardando.value = true
  let guardados = 0
  try {
    for (const c of cambios.value) {
      await setConfig(c.campo, c.valor)
      guardados++
    }
    toast('Reglas guardadas.')
  } catch (e) {
    toast(`${guardados > 0 ? `Se guardaron ${guardados} cambio(s) y ` : ''}falló uno: ${e instanceof Error ? e.message : String(e)}`, 'error')
  } finally {
    guardando.value = false
    bump()
    cargarBorrador()
    void loadBitacoraCache().then(bump)
  }
}

// ---- Último cambio (bitácora) ----
function claveDe(e) {
  if (e.registroId) return e.registroId
  const d = e.despues
  return d && typeof d === 'object' && 'clave' in d ? String(d.clave) : ''
}
const entradasConfig = computed(() => listBitacora({ tabla: 'cmp_config' }).filter((e) => claveDe(e) !== 'reglas_confirmadas'))
const ultimoGlobal = computed(() => entradasConfig.value[0])
function ultimo(clave) {
  return entradasConfig.value.find((e) => claveDe(e) === clave)
}
function textoUltimo(clave) {
  const e = ultimo(clave)
  return e ? `Último cambio: ${e.usuario} · ${fechaCorta(e.fecha)}` : ''
}
const confirmadas = computed(() => getReglasConfirmadas())

async function confirmarConFinanzas() {
  const ok = await confirmar({
    title: 'Confirmar reglas',
    message: 'Se registrará que Finanzas confirmó los valores actuales de las reglas (quién y cuándo). Si después se cambia cualquier regla, habrá que confirmarlas de nuevo.',
    confirmLabel: 'Marcar como confirmadas',
  })
  if (!ok) return
  guardando.value = true
  try {
    await confirmarReglas()
    toast('Reglas marcadas como confirmadas con Finanzas.')
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error')
  } finally {
    guardando.value = false
    bump()
    void loadBitacoraCache().then(bump)
  }
}

// ---- Simulador ----
const montoEjemplo = computed(() => {
  const m = num(fMonto.value)
  return Number.isFinite(m) && m >= 0 ? m : 0
})
/** Valores del borrador si son válidos; si no, los vigentes. */
const efectivo = computed(() => {
  const c = cfg.value
  const s = num(fSimple.value)
  const sc = num(fSinCot.value)
  const d = num(fDir.value)
  const m = num(fMinimas.value)
  const t = num(fTol.value)
  return {
    sinCot: Number.isFinite(sc) && sc >= 0 ? sc : c.umbralSinCotizacion,
    simple: Number.isFinite(s) && s >= 0 ? s : c.umbralCotizacionSimple,
    dir: Number.isFinite(d) && d >= 0 ? d : c.umbralDireccion,
    minimas: Number.isInteger(m) && m >= 1 ? m : c.cotizacionesMinimas,
    tol: Number.isFinite(t) && t >= 0 ? t : c.toleranciaDiferenciaPct,
  }
})
const montosEjemplo = computed(() => {
  const { simple, dir, sinCot } = efectivo.value
  const lista = [
    ...(sinCot > 0 ? [{ etiqueta: `${formatoMoneda(Math.max(0, Math.round((sinCot - 0.01) * 100) / 100))} (justo debajo del umbral sin cotización)`, monto: Math.max(0, Math.round((sinCot - 0.01) * 100) / 100) }, { etiqueta: `${formatoMoneda(sinCot)} (umbral sin cotización)`, monto: sinCot }] : []),
    { etiqueta: formatoMoneda(Math.max(0, Math.round(simple / 2))), monto: Math.max(0, Math.round(simple / 2)) },
    ...(simple > 0 ? [{ etiqueta: `${formatoMoneda(Math.max(0, Math.round((simple - 0.01) * 100) / 100))} (justo debajo del umbral simple)`, monto: Math.max(0, Math.round((simple - 0.01) * 100) / 100) }] : []),
    { etiqueta: `${formatoMoneda(simple)} (umbral simple)`, monto: simple },
    { etiqueta: `${formatoMoneda(simple + 1)}`, monto: simple + 1 },
    { etiqueta: `${formatoMoneda(dir)} (umbral de aviso)`, monto: dir },
    { etiqueta: `${formatoMoneda(dir + 1)}`, monto: dir + 1 },
    ...[...new Set(aprobadores.value.map((p) => p.topeAprobacion).filter((t) => typeof t === 'number'))].flatMap((t) => [
      { etiqueta: `${formatoMoneda(t)} (tope de un aprobador)`, monto: t },
      { etiqueta: `${formatoMoneda(t + 0.01)}`, monto: Math.round((t + 0.01) * 100) / 100 },
    ]),
  ]
  return lista.filter((m, i) => lista.findIndex((x) => x.monto === m.monto) === i)
})
const impacto = computed(() => {
  const m = montoEjemplo.value
  const { simple, dir, minimas, tol, sinCot } = efectivo.value
  const out = []
  if (m < sinCot) {
    out.push(`Compra menor (menos de ${formatoUmbral(sinCot)}): NO requiere cotización, solo el registro del proveedor y el precio. Sigue requiriendo la autorización de Finanzas.`)
  } else {
    const req = m >= simple ? minimas : 1
    out.push(
      req === 1
        ? 'Una cotización basta (puede registrar más para comparar).'
        : `${req} cotizaciones completas de proveedores distintos, o una excepción documentada (producto o servicio especializado, adjudicación directa instruida por CEO/DGA o urgencia, con justificación de 15 caracteres o más): con excepción basta 1.`,
    )
    out.push('Elegir al proveedor más barato; si se elige otro, justificarlo.')
  }
  const elegibles = aprobadoresElegibles(m)
  out.push(
    elegibles.length
      ? `La autoriza Finanzas (un solo nivel): la solicitud le llega a ${elegibles.map((p) => p.nombre).join(' y ')} y basta uno.`
      : 'NO se podría enviar a autorización: ningún aprobador activo de Finanzas tiene un tope que cubra este monto.',
  )
  out.push(m > dir ? 'Dirección recibe un correo informativo (sin botones); no requiere su autorización.' : 'Dirección no recibe aviso (no rebasa el umbral).')
  out.push('Que Tesorería entregue el dinero por el monto aprobado, y comprobar el gasto con ticket o factura y el cambio devuelto.')
  const tope = Math.round(m * (1 + tol / 100) * 100) / 100
  out.push(
    tol === 0
      ? 'Si lo comprado sale por más de lo autorizado, se exige justificación y revisión de Finanzas (tolerancia 0 %).'
      : `Si lo comprado pasa de ${formatoMoneda(tope)} (autorizado + ${tol} %), se exige justificación y revisión de Finanzas.`,
  )
  return out
})

// ---- Categorías ----
const categorias = computed(() => listCategorias())
const custodios = computed(() => ({
  ti: participantesPorRol('infraestructura').map((p) => p.nombre).join(', '),
  mantenimiento: participantesPorRol('mantenimiento').map((p) => p.nombre).join(', '),
}))

</script>
