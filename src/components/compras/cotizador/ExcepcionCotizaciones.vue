<template>
  <section class="rounded-xl border border-vz-warning/40 bg-vz-warning/8 p-3.5" aria-labelledby="exc-titulo" data-test="bloque-excepcion">
    <h3 id="exc-titulo" class="text-[13px] font-bold text-text">Excepción de cotizaciones</h3>
    <p class="mt-0.5 text-[12px] text-text-muted">
      Para compras de {{ formatoUmbral(umbral) }} o más se piden <strong class="text-text">{{ requeridas }} cotizaciones de proveedores distintos</strong> (hay {{ hay }}).
      Solo se piden menos si es un producto o servicio especializado, una adjudicación directa instruida por CEO o DGA, o una urgencia; con excepción basta <strong class="text-text">1</strong> cotización.
    </p>

    <fieldset class="mt-2.5 flex flex-col gap-1.5" :disabled="disabled">
      <legend class="text-[11.5px] font-bold uppercase tracking-wide text-text-soft">Tipo de excepción</legend>
      <label v-for="(label, k) in EXCEPCION_TIPO_LABEL" :key="k" class="flex cursor-pointer items-center gap-2 text-[12.5px] text-text">
        <input type="radio" name="excepcion-tipo" :value="k" :checked="modelValue.tipo === k" class="h-4 w-4 accent-vz-blue" :data-test="`exc-tipo-${k}`" @change="cambiar({ tipo: k, instruidaPor: k === 'adjudicacion_directa' ? modelValue.instruidaPor : '' })" />
        {{ label }}
      </label>
      <button v-if="modelValue.tipo && !disabled" type="button" class="w-fit text-[11.5px] font-bold text-vz-blue hover:underline" @click="cambiar({ tipo: '', instruidaPor: '' })">Quitar la excepción</button>
    </fieldset>

    <fieldset v-if="modelValue.tipo === 'adjudicacion_directa'" class="mt-2.5 flex flex-wrap items-center gap-3" :disabled="disabled">
      <legend class="sr-only">Instruida por</legend>
      <span class="text-[12.5px] font-bold text-text">Instruida por</span>
      <label v-for="(label, k) in INSTRUIDA_POR_LABEL" :key="k" class="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-text">
        <input type="radio" name="excepcion-instruida" :value="k" :checked="modelValue.instruidaPor === k" class="h-4 w-4 accent-vz-blue" :data-test="`exc-por-${k}`" @change="cambiar({ instruidaPor: k })" />
        {{ label }}
      </label>
    </fieldset>

    <label v-if="modelValue.tipo" class="mt-2.5 flex flex-col gap-1 text-[12px] font-bold text-text-muted">
      Justificación *
      <textarea
        :value="modelValue.justificacion"
        rows="2"
        :disabled="disabled"
        :class="`w-full rounded-md border bg-bg px-2 py-1.5 text-[12.5px] font-normal text-text outline-none placeholder:text-text-soft focus:border-vz-blue focus:ring-2 focus:ring-vz-blue/30 ${largo > 0 && largo < MIN ? 'border-vz-danger' : 'border-border'}`"
        placeholder="p. ej. Solo este proveedor da soporte a la marca instalada."
        data-test="exc-justificacion"
        @input="cambiar({ justificacion: $event.target.value })"
      />
      <span :class="`self-end text-[11px] font-semibold ${largo >= MIN ? 'text-vz-success' : 'text-text-soft'}`" data-test="exc-contador">{{ largo }} / {{ MIN }} caracteres mínimo</span>
    </label>
    <p v-if="mensaje" role="alert" class="mt-2 text-[12px] font-semibold text-vz-warning" data-test="exc-mensaje">{{ mensaje }}</p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { EXCEPCION_JUSTIFICACION_MIN as MIN, EXCEPCION_TIPO_LABEL, INSTRUIDA_POR_LABEL, errorExcepcion, formatoUmbral } from 'src/lib/compras'

/** Bloque «Excepción de cotizaciones»: tipo, «Instruida por» (CEO / DGA, solo adjudicación directa) y justificación con contador. */
const props = defineProps({
  modelValue: { type: Object, required: true },
  umbral: { type: Number, required: true },
  requeridas: { type: Number, required: true },
  hay: { type: Number, required: true },
  disabled: Boolean,
})
const emit = defineEmits(['update:modelValue'])
const cambiar = (parcial) => emit('update:modelValue', { ...props.modelValue, ...parcial })
const largo = computed(() => (props.modelValue.justificacion ?? '').trim().length)
const mensaje = computed(() => (props.modelValue.tipo ? errorExcepcion(props.modelValue) : 'Sin excepción: registra las cotizaciones que faltan o documenta la excepción.'))
</script>
