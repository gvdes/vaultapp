<template>
  <div v-if="visible" class="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-vz-warning/40 bg-vz-warning/10 px-4 py-3" role="status">
    <div class="flex min-w-0 items-center gap-3">
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vz-warning/20 text-vz-warning">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      </span>
      <div class="min-w-0">
        <p class="text-[13px] font-extrabold text-text">{{ n }} recepci{{ n === 1 ? 'ón pendiente' : 'ones pendientes' }} de compras</p>
        <p class="text-[12px] text-text-muted">Adquisiciones ya compró {{ n === 1 ? 'este artículo' : 'estos artículos' }}: confirma que llegaron para darlos de alta en el inventario con todo precargado.</p>
      </div>
    </div>
    <button type="button" :class="btnPrimary" @click="abierto = true">Revisar y confirmar</button>

    <AppModal v-if="abierto" title="Recepciones pendientes de compras" wide @close="abierto = false">
      <RecepcionesPendientes :destino="destino" @changed="emit('changed')" />
    </AppModal>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { recepcionesPendientes } from 'src/lib/compras'
import { canConfirmRecepcion } from 'src/lib/access'
import { useAuth } from 'src/lib/auth'
import AppModal from 'components/AppModal.vue'
import { btnPrimary } from 'components/compras/util'
import RecepcionesPendientes from './RecepcionesPendientes.vue'

/** Aviso "N recepciones pendientes de compras" para la vista principal de Sistemas (`ti`) o Mantenimiento. */
const props = defineProps({ destino: { type: String, required: true } })
const emit = defineEmits(['changed'])

const { user } = useAuth()
const abierto = ref(false)
const n = computed(() => recepcionesPendientes(props.destino).length)
// Solo quien puede confirmar en ese dominio ve el aviso (Dirección y el custodio); el resto no necesita la alerta.
const visible = computed(() => !!user.value && canConfirmRecepcion(user.value.role, props.destino) && (n.value > 0 || abierto.value))
</script>
