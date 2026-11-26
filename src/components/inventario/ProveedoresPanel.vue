<template>
  <AppModal title="Proveedores de mantenimiento" wide @close="emit('close')">
    <div v-if="puedeEditar" class="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <input v-model="nombre" placeholder="Nombre del proveedor" :class="inputClass" />
      <input v-model="contacto" placeholder="Contacto" :class="inputClass" />
      <div class="flex gap-2">
        <input v-model="telefono" placeholder="Teléfono" :class="`${inputClass} flex-1`" />
        <button type="button" :disabled="saving" class="h-9 shrink-0 rounded-lg bg-vz-blue px-3 text-[12px] font-bold text-white hover:bg-primary-hover disabled:opacity-60" @click="handleAdd">+ Agregar</button>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <p v-if="proveedores.length === 0" class="text-[12px] text-text-soft">Sin proveedores activos todavía.</p>
      <div v-for="p in proveedores" :key="p.id" class="rounded-lg border border-border bg-bg p-3 text-[12.5px]">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="font-bold text-text">{{ p.nombre }}</p>
            <p class="text-text-muted">{{ p.contacto || '—' }} {{ p.telefono ? `· ${p.telefono}` : '' }}</p>
          </div>
          <button v-if="puedeEditar" type="button" class="shrink-0 rounded-md border border-vz-danger/30 bg-vz-danger/10 px-2 py-1 text-[11px] font-semibold text-vz-danger hover:bg-vz-danger/20" @click="handleDesactivar(p.id, p.nombre)">
            Desactivar
          </button>
        </div>
        <div v-if="historicoDe(p.id).length > 0" class="mt-2 border-t border-border pt-2">
          <p class="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-text-soft">Historial de compras ({{ historicoDe(p.id).length }})</p>
          <div class="flex flex-col gap-1">
            <p v-for="e in historicoDe(p.id).slice(0, 5)" :key="e.id" class="text-text-muted">
              {{ e.fecha }} · {{ e.cantidad }} pzas · {{ e.costoUnitario != null ? currency.format(e.costoUnitario) : '—' }} c/u
            </p>
          </div>
        </div>
      </div>

      <details v-if="inactivos.length > 0" class="rounded-lg border border-border bg-bg p-3 text-[12.5px]">
        <summary class="cursor-pointer text-[12px] font-bold text-text-muted">Desactivados ({{ inactivos.length }})</summary>
        <div class="mt-2 flex flex-col gap-2">
          <div v-for="p in inactivos" :key="p.id" class="flex items-start justify-between gap-2 rounded-md border border-border bg-surface p-2.5">
            <div>
              <p class="font-bold text-text-muted">{{ p.nombre }}</p>
              <p class="text-text-soft">{{ p.contacto || '—' }} {{ p.telefono ? `· ${p.telefono}` : '' }} · {{ historicoDe(p.id).length }} compra(s) en historial</p>
            </div>
            <button v-if="puedeEditar" type="button" class="shrink-0 rounded-md border border-vz-success/30 bg-vz-success/10 px-2 py-1 text-[11px] font-semibold text-vz-success hover:bg-vz-success/20" @click="handleReactivar(p.id, p.nombre)">
              Reactivar
            </button>
          </div>
        </div>
      </details>
    </div>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppModal from 'components/AppModal.vue'
import { inputClass } from 'components/formClasses'
import { listProveedores, listProveedoresInactivos, addProveedor, desactivarProveedor, reactivarProveedor } from 'src/lib/inventario/proveedores'
import { listEntradas } from 'src/lib/inventario/mantenimiento'
import { bump } from 'src/lib/reactive'
import { useConfirm } from 'src/composables/useConfirm'
import { useToast } from 'src/composables/useToast'

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

defineProps({ puedeEditar: { type: Boolean, required: true } })
const emit = defineEmits(['close'])

const toast = useToast()
const confirm = useConfirm()
const refresh = () => bump()

const nombre = ref('')
const contacto = ref('')
const telefono = ref('')
const saving = ref(false)

const proveedores = computed(() => listProveedores())
const inactivos = computed(() => listProveedoresInactivos())
const entradas = computed(() => listEntradas())

function historicoDe(id) {
  return entradas.value.filter((e) => e.proveedorId === id)
}

async function handleAdd() {
  if (!nombre.value.trim()) {
    toast('El nombre es obligatorio.', 'error')
    return
  }
  saving.value = true
  try {
    await addProveedor({ nombre: nombre.value.trim(), contacto: contacto.value || undefined, telefono: telefono.value || undefined })
    nombre.value = ''
    contacto.value = ''
    telefono.value = ''
    toast('Proveedor agregado.')
    refresh()
  } finally {
    saving.value = false
  }
}

async function handleDesactivar(id, nombreP) {
  const ok = await confirm({
    title: 'Desactivar proveedor',
    message: `¿Desactivar al proveedor "${nombreP}"? Dejará de ofrecerse al registrar compras; su historial se conserva y puedes reactivarlo cuando quieras.`,
    confirmLabel: 'Desactivar',
    danger: true,
  })
  if (!ok) return
  await desactivarProveedor(id)
  toast('Proveedor desactivado.')
  refresh()
}

async function handleReactivar(id, nombreP) {
  const ok = await confirm({ message: `¿Reactivar al proveedor "${nombreP}"?`, confirmLabel: 'Reactivar' })
  if (!ok) return
  await reactivarProveedor(id)
  toast('Proveedor reactivado.')
  refresh()
}
</script>
