<template>
  <div class="flex min-h-screen flex-col bg-bg text-text">
    <a
      href="#contenido-principal"
      class="absolute left-2 top-2 z-50 -translate-y-20 rounded-lg bg-vz-gold px-3 py-2 text-[13px] font-extrabold text-vz-ink focus:translate-y-0"
      >Saltar al contenido</a
    >

    <header class="sticky top-0 z-30 border-b border-vz-ink-2 bg-vz-ink text-white shadow-md">
      <div :class="`mx-auto flex w-full ${maxW} flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5`">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <Logo size="sm" />
          <div class="min-w-0 leading-tight">
            <p class="truncate text-[10.5px] font-bold uppercase tracking-[0.14em] text-vz-gold">Grupo Vizcarra</p>
            <p class="truncate text-[15px] font-extrabold sm:text-[16px]">Compras Indirectas</p>
          </div>
        </div>
        <nav v-if="nav" aria-label="Compras Indirectas" class="order-3 flex w-full gap-1 rounded-xl bg-white/10 p-1 sm:order-none sm:w-auto">
          <RouterLink v-for="n in enlaces" :key="n.id" :to="n.to" :class="claseNav(n.id)" :aria-current="activo === n.id ? 'page' : undefined">
            {{ n.texto }}
          </RouterLink>
        </nav>
        <ThemeToggle />
      </div>
    </header>

    <main id="contenido-principal" tabindex="-1" :class="`mx-auto w-full ${maxW} flex-1 px-4 py-5 outline-none sm:py-8 ${conBarraInferior ? 'pb-32' : ''}`">
      <slot />
    </main>

    <footer class="border-t border-border px-4 py-4 text-center text-[11.5px] text-text-soft">
      Documento interno · Grupo Vizcarra
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Logo from 'components/Logo.vue'
import ThemeToggle from 'components/ThemeToggle.vue'
import { RUTAS_COMPRAS } from 'src/lib/compras'

const props = defineProps({
  /** Pestaña activa del menú superior. */
  activo: { type: String, default: '' },
  /** Muestra el menú Nueva requisición / Consultar estatus. */
  nav: { type: Boolean, default: true },
  /** Ancho máximo del contenido. */
  ancho: { type: String, default: 'normal' },
  /** Deja espacio para una barra fija inferior. */
  conBarraInferior: { type: Boolean, default: false },
})

const maxW = computed(() => (props.ancho === 'angosto' ? 'max-w-xl' : props.ancho === 'amplio' ? 'max-w-5xl' : 'max-w-3xl'))

const enlaces = [
  { id: 'nueva', texto: 'Nueva requisición', to: RUTAS_COMPRAS.nueva },
  { id: 'estatus', texto: 'Consultar estatus', to: RUTAS_COMPRAS.estatus('buscar', 'buscar') },
]

function claseNav(id) {
  const base =
    'flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 text-[13px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vz-gold sm:flex-none'
  return `${base} ${props.activo === id ? 'bg-white text-vz-ink shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'}`
}
</script>
