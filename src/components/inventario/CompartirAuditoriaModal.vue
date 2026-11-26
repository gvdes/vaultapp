<template>
  <AppModal title="Compartir liga de conteo" @close="emit('close')">
    <p class="mb-3 text-[12.5px] text-text-muted">
      Quien reciba esta liga puede contar en sitio desde su celular, <b>sin usuario ni contraseña</b>. La liga solo sirve para esta auditoría y deja de
      funcionar cuando el conteo se envía a verificación.
    </p>

    <div class="mb-3 rounded-lg border border-border bg-bg p-3 text-[12.5px]">
      <p class="font-bold text-text">{{ sucursal }}</p>
      <p class="text-text-muted">
        {{ TIPO_AUDITORIA_LABEL[auditoria.tipo] }}<template v-if="auditoria.auditorNombre"> · Para {{ auditoria.auditorNombre }}</template
        ><template v-if="auditoria.fechaProgramada"> · Programada {{ fechaCorta(auditoria.fechaProgramada) }}</template>
      </p>
    </div>

    <div class="flex gap-2">
      <input :value="link" readonly :class="`${inputClass} flex-1`" @focus="$event.target.select()" />
      <button type="button" class="h-9 shrink-0 rounded-lg bg-vz-blue px-3 text-[12.5px] font-bold text-white hover:bg-primary-hover" @click="copiar">
        {{ copiado ? 'Copiada' : 'Copiar liga' }}
      </button>
    </div>

    <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <a
        :href="waUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="flex h-10 items-center justify-center gap-2 rounded-lg border border-vz-success/30 bg-vz-success/10 text-[13px] font-bold text-vz-success hover:bg-vz-success/20"
      >
        Enviar por WhatsApp
      </a>
      <a
        :href="mailUrl"
        class="flex h-10 items-center justify-center gap-2 rounded-lg border border-vz-blue/30 bg-vz-blue/10 text-[13px] font-bold text-vz-blue hover:bg-vz-blue/20"
      >
        Enviar por correo<template v-if="auditoria.auditorCorreo">&nbsp;a {{ auditoria.auditorCorreo }}</template>
      </a>
    </div>

    <div class="mt-4 flex flex-col items-center gap-1 rounded-xl border border-border bg-bg p-3">
      <div class="flex h-44 w-44 items-center justify-center rounded-lg bg-white p-1.5">
        <img v-if="qr" :src="qr" alt="Código QR de la liga de conteo" class="h-full w-full" />
        <div v-else class="h-6 w-6 animate-spin rounded-full border-2 border-vz-blue border-t-transparent" />
      </div>
      <p class="text-[11.5px] text-text-muted">También puedes mostrar este QR para que lo escaneen en sitio.</p>
    </div>

    <details class="mt-3 text-[12px] text-text-muted">
      <summary class="cursor-pointer font-semibold text-text">Ver mensaje que se enviará</summary>
      <pre class="mt-1.5 whitespace-pre-wrap rounded-lg border border-border bg-bg p-2.5 font-sans text-[12px]">{{ mensaje }}</pre>
    </details>

    <button type="button" class="mt-4 h-9 w-full rounded-lg border border-border bg-bg text-[13px] font-bold text-text-muted hover:bg-surface-hover" @click="emit('close')">
      Listo
    </button>
  </AppModal>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import QRCode from 'qrcode'
import AppModal from 'components/AppModal.vue'
import { inputClass } from 'components/formClasses'
import { useToast } from 'src/composables/useToast'
import { getUbicacion } from 'src/lib/inventario/comunes'
import { auditoriaLink, TIPO_AUDITORIA_LABEL } from 'src/lib/inventario/auditorias'

const props = defineProps({ auditoria: { type: Object, required: true } })
const emit = defineEmits(['close'])

const toast = useToast()
const link = computed(() => auditoriaLink(props.auditoria))
const sucursal = computed(() => getUbicacion(props.auditoria.ubicacionId)?.nombre ?? props.auditoria.ubicacionId)
const copiado = ref(false)
const qr = ref(null)

const fechaCorta = (f) => new Date(`${f}T00:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

const asunto = computed(() => `Auditoría física de inventario – ${sucursal.value}`)
const mensaje = computed(() => {
  const a = props.auditoria
  const saludo = a.auditorNombre ? `Hola ${a.auditorNombre},` : 'Hola,'
  const fecha = a.fechaProgramada && !a.sorpresa ? ` Está programada para el ${fechaCorta(a.fechaProgramada)}.` : ''
  const alcance = a.alcance ? `\nAlcance: ${a.alcance}` : ''
  return (
    `${saludo}\n\n` +
    `Te comparto la auditoría física de inventario de ${sucursal.value} (Grupo Vizcarra).${fecha}${alcance}\n\n` +
    `Con esta liga cuentas lo que hay en sitio desde tu celular, sin usuario ni contraseña: marca cada equipo como Bien, Dañado o No encontrado y captura la cantidad de los materiales. Puedes agregar notas y fotos.\n\n` +
    `${link.value}\n\n` +
    `Al terminar, pulsa "Enviar a verificación". Gracias por tu apoyo.`
  )
})
const waUrl = computed(() => `https://wa.me/?text=${encodeURIComponent(mensaje.value)}`)
const mailUrl = computed(
  () => `mailto:${props.auditoria.auditorCorreo ?? ''}?subject=${encodeURIComponent(asunto.value)}&body=${encodeURIComponent(mensaje.value)}`,
)

async function copiar() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link.value)
    } else {
      const ta = document.createElement('textarea')
      ta.value = link.value
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()

      const ok = document.execCommand('copy')
      ta.remove()

      if (!ok) throw new Error('No se pudo copiar')
    }

    copiado.value = true
    toast('Liga copiada.')
    setTimeout(() => (copiado.value = false), 2500)

  } catch (error) {
    console.error('Error al copiar liga:', error)
    toast('No se pudo copiar; selecciona la liga y cópiala manualmente.', 'error')
  }
}

onMounted(async () => {
  try {
    qr.value = await QRCode.toDataURL(link.value, { width: 320, margin: 1, color: { dark: '#101828', light: '#FFFFFF' } })
  } catch {
    qr.value = null
  }
})
</script>
