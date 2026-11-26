<template>
  <span>{{ texto }}</span>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/** Número con conteo animado (rAF + easing). Se re-anima cuando cambia `value`; con prefers-reduced-motion muestra el valor final al instante. */
const props = defineProps({
  value: { type: Number, required: true },
  format: Function,
  duration: { type: Number, default: 900 },
})

const mostrado = ref(0)
let raf = 0
let asentar = 0
let primeraVez = true

const texto = computed(() => (props.format ? props.format(mostrado.value) : String(Math.round(mostrado.value))))

function reducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function animarA(destino) {
  cancelAnimationFrame(raf)
  clearTimeout(asentar)
  const desde = mostrado.value
  // En segundo plano requestAnimationFrame se pausa: sin animación el número final se muestra de inmediato.
  if (reducedMotion() || document.hidden || props.duration <= 0 || desde === destino) {
    mostrado.value = destino
    return
  }
  const t0 = performance.now()
  const paso = (now) => {
    const p = Math.min(1, (now - t0) / props.duration)
    const eased = 1 - Math.pow(1 - p, 4) // easeOutQuart
    mostrado.value = desde + (destino - desde) * eased
    if (p < 1) raf = requestAnimationFrame(paso)
    else mostrado.value = destino
  }
  raf = requestAnimationFrame(paso)
  // Red de seguridad: pase lo que pase con rAF, el valor real queda asentado al terminar la duración.
  asentar = window.setTimeout(() => {
    cancelAnimationFrame(raf)
    mostrado.value = destino
  }, props.duration + 150)
}

onMounted(() => {
  mostrado.value = 0
  animarA(props.value)
  primeraVez = false
})

watch(
  () => props.value,
  (v) => {
    if (!primeraVez) animarA(v)
  },
)

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearTimeout(asentar)
})
</script>
