<template>
  <div class="sticky top-0 z-20 -mx-4 border-b border-border bg-surface/95 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-3" role="toolbar" aria-label="Acciones de la requisición">
    <div class="flex flex-wrap items-center gap-2">
      <p class="mr-auto min-w-[180px] flex-1 text-[12px] text-text-muted">
        <span class="font-bold text-text">{{ info.corta }}:</span> {{ info.descripcion }}
      </p>
      <button v-for="a in acciones" :key="a.id" type="button" :class="a.clase" :disabled="ocupado || !!a.bloqueada" :title="a.bloqueada || undefined" @click="ejecutar(a)">{{ a.label }}</button>
      <span v-if="acciones.length === 0 && !info.terminal" class="rounded-lg bg-bg px-2.5 py-1.5 text-[12px] font-semibold text-text-soft">Sin acciones para tu rol en este estado</span>
    </div>
    <ul v-if="ayudas.length" class="mt-2 flex flex-col gap-1">
      <li v-for="h in ayudas" :key="h" class="rounded-md border border-vz-warning/30 bg-vz-warning/10 px-2.5 py-1 text-[11.5px] font-semibold text-vz-warning">{{ h }}</li>
    </ul>

    <MotivoModal v-if="motivo" v-bind="motivo" @close="motivo = null" @done="bump()" />
    <DecisionModal v-if="decision" :folio="folio" :nivel="decision.nivel" :decision="decision.decision" @close="decision = null" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  ESTADOS,
  FORMA_PAGO_LABEL,
  aprobarDiferencia,
  autorizarYaAprobada,
  cambiarEstado,
  destinoDePago,
  estadoAutorizacion,
  estadoDiferencia,
  evaluarCotizaciones,
  formatoMoneda,
  getRequisicion,
  excepcionValida,
  listCotizaciones,
  listRecepciones,
  marcarComprada,
  motivoNoPuedePasarA,
  puedeAprobarDiferencia,
  puedeDecidirFolio,
  puedeTransicionar,
  reanudarRequisicion,
  resumenCompra,
  resumenDinero,
  rolPuedeEstado,
  solicitarAutorizacion,
} from 'src/lib/compras'
import { bump } from 'src/lib/reactive'
import { useToast } from 'src/composables/useToast'
import { useConfirm } from 'src/composables/useConfirm'
import MotivoModal from './MotivoModal.vue'
import DecisionModal from './DecisionModal.vue'
import { useAcceso } from './useAcceso'
import { btn, btnDanger, btnOk, btnPrimary, btnWarn } from './util'

const props = defineProps({ folio: { type: String, required: true } })
const emit = defineEmits(['tab'])

const toast = useToast()
const confirm = useConfirm()
const { role, puedeCotizar, esFinanzas, puedeFondear, puedePagar, destinoCustodio } = useAcceso()

const req = computed(() => getRequisicion(props.folio))
const info = computed(() => ESTADOS[req.value?.estado ?? 'recibida'])
const ocupado = ref(false)

/**
 * @typedef {object} Accion
 * @property {string} id
 * @property {string} label
 * @property {string} clase
 * @property {() => Promise<void> | void} run
 * @property {string} [bloqueada] - Motivo por el que la acción está deshabilitada (se ve como ayuda arriba y al pasar el cursor).
 */
/**
 * @typedef {object} MotivoCfg
 * @property {string} title
 * @property {string} [label]
 * @property {string} [descripcion]
 * @property {string} [placeholder]
 * @property {string} [confirmLabel]
 * @property {boolean} [danger]
 * @property {(texto: string) => Promise<void>} accion
 */
const motivo = ref(null)
const decision = ref(null)

/**
 * Nivel con el que puede decidir el usuario ahora: SOLO Finanzas, y solo si su usuario está ligado a un aprobador del directorio cuyo
 * tope cubre el monto. Dirección (admin) no decide: recibe avisos.
 */
const nivelDecision = computed(() => {
  if (req.value?.estado !== 'en_autorizacion') return undefined
  if (estadoAutorizacion(props.folio).pendiente !== 'finanzas') return undefined
  return puedeDecidirFolio(props.folio).ok ? 'finanzas' : undefined
})

function abrirMotivo(cfg) {
  motivo.value = cfg
}

const acciones = computed(() => {
  const r = req.value
  if (!r || info.value.terminal) return []
  const e = r.estado
  const out = []
  const rol = role.value
  const folio = props.folio

  if (puedeCotizar.value) {
    if (e === 'recibida') {
      out.push({
        id: 'validar',
        label: 'Validar y pasar a cotización',
        clase: btnPrimary,
        run: async () => {
          await cambiarEstado(folio, 'en_cotizacion', { comentario: 'Validada por Adquisiciones' })
          toast('Requisición validada: ya está en cotización.')
          emit('tab', 'cotizaciones')
        },
      })
    }
    if (e === 'en_cotizacion') {
      out.push({ id: 'cotizar', label: 'Capturar cotizaciones', clase: btn, run: () => emit('tab', 'cotizaciones') })
      out.push({
        id: 'enviar',
        label: 'Enviar a autorización',
        clase: btnPrimary,
        // Sin cotización elegida o sin proveedor activo y completo en el catálogo no se puede pedir la autorización (el motivo sale arriba).
        bloqueada: motivoNoPuedePasarA(folio, 'en_autorizacion') || undefined,
        run: async () => {
          const ok = await confirm({ title: 'Enviar a autorización', message: `Se enviará a Finanzas por ${formatoMoneda(resumenElegido())}. Después ya no podrás cambiar partidas ni cotizaciones. ¿Continuar?`, confirmLabel: 'Enviar' })
          if (!ok) return
          const r2 = await solicitarAutorizacion(folio)
          toast(
            r2.correosEnviados > 0
              ? `Enviada a autorización: ${r2.correosEnviados} correo${r2.correosEnviados === 1 ? '' : 's'} a Finanzas (${r2.aprobadores.join(', ')}; basta uno)${r2.avisoDireccion ? '; Dirección recibe un aviso informativo' : ''}${r2.avisosExcepcion ? '; Dirección recibe un aviso por la excepción de cotizaciones' : ''}.`
              : 'Enviada a autorización. Los aprobadores de Finanzas elegibles no tienen correo en el directorio: se decide desde la app.',
            r2.correosEnviados > 0 ? 'success' : 'info',
          )
          emit('tab', 'autorizacion')
        },
      })
    }
    if (e === 'fondeada') {
      out.push({ id: 'registrar-compra', label: 'Registrar compra', clase: btn, run: () => emit('tab', 'compra') })
      out.push({
        id: 'marcar-comprada',
        label: 'Marcar comprada',
        clase: btnPrimary,
        run: async () => {
          const rc = resumenCompra(folio)
          if (rc.excede) {
            emit('tab', 'compra')
            throw new Error('Lo comprado rebasa lo autorizado: escribe la justificación de la diferencia en la pestaña Compra y márcala desde ahí.')
          }
          const ok = await confirm({ title: 'Marcar comprada', message: 'Se cerrará el registro de compras y se avisará a los custodios de inventario. ¿Continuar?', confirmLabel: 'Marcar comprada' })
          if (!ok) return
          await marcarComprada(folio)
          toast('Requisición marcada como comprada.')
          emit('tab', 'entrega')
        },
      })
    }
  }

  if (nivelDecision.value) {
    const nivel = nivelDecision.value
    out.push({ id: 'aprobar', label: 'Aprobar', clase: btnOk, run: () => void (decision.value = { nivel, decision: 'aprobada' }) })
    out.push({ id: 'ajuste', label: 'Pedir ajuste', clase: btnWarn, run: () => void (decision.value = { nivel, decision: 'ajuste' }) })
    out.push({ id: 'rechazar', label: 'Rechazar', clase: btnDanger, run: () => void (decision.value = { nivel, decision: 'rechazada' }) })
  }

  // Ruteo del pago por forma de pago: el efectivo lo entrega Tesorería; la transferencia y la tarjeta las paga Cuentas por pagar.
  const aCxp = destinoDePago(r.formaPago) === 'cuentas_por_pagar'
  if (e === 'autorizada' && puedeFondear.value && !aCxp) {
    out.push({ id: 'entrega', label: 'Registrar entrega de efectivo', clase: btnPrimary, run: () => emit('tab', 'dinero') })
  }
  if (e === 'autorizada' && puedePagar.value && aCxp) {
    out.push({ id: 'pago', label: `Registrar pago (${FORMA_PAGO_LABEL[r.formaPago].toLowerCase()})`, clase: btnPrimary, run: () => emit('tab', 'dinero') })
  }
  if ((e === 'fondeada' || e === 'comprada') && puedeFondear.value && !aCxp) {
    const d = resumenDinero(folio)
    if (e === 'fondeada' || d.pendienteComprobar > 0 || d.pendienteDevolver > 0) out.push({ id: 'comprobar', label: 'Comprobar gasto / cambio', clase: btn, run: () => emit('tab', 'dinero') })
  }
  // Compra que ya tiene la aprobación de Finanzas pero sigue en autorización (cambio de regla a un solo nivel, migración 022).
  if (e === 'en_autorizacion' && esFinanzas.value && estadoAutorizacion(folio).completa) {
    out.push({
      id: 'autorizar-ya-aprobada',
      label: 'Pasar a Autorizada',
      clase: btnOk,
      run: async () => {
        await autorizarYaAprobada(folio)
        toast('Requisición autorizada.')
      },
    })
  }
  if (e === 'comprada' && estadoDiferencia(folio) === 'pendiente_finanzas' && puedeAprobarDiferencia(folio).ok) {
    out.push({
      id: 'diferencia',
      label: 'Aprobar diferencia',
      clase: btnWarn,
      run: () =>
        abrirMotivo({
          title: 'Aprobar diferencia',
          label: 'Justificación',
          descripcion: `Lo comprado rebasa lo autorizado en ${formatoMoneda(resumenCompra(folio).diferencia)}. Tu aprobación queda registrada.`,
          confirmLabel: 'Aprobar diferencia',
          accion: async (t) => {
            await aprobarDiferencia(folio, { comentario: t })
            toast('Diferencia aprobada.')
          },
        }),
    })
  }
  if (e === 'comprada') {
    const pendientes = listRecepciones({ folio, estado: 'pendiente' }).filter((x) => !destinoCustodio.value || x.destino === destinoCustodio.value)
    if (pendientes.length && (rol === 'admin' || rol === 'capturista' || rol === 'mantenimiento')) {
      out.push({ id: 'recepciones', label: `Confirmar recepciones (${pendientes.length})`, clase: btnPrimary, run: () => emit('tab', 'entrega') })
    }
    if (rolPuedeEstado(rol ?? '', 'entregada')) {
      out.push({
        id: 'entregada',
        label: 'Marcar entregada',
        clase: btn,
        run: async () => {
          const ok = await confirm({
            title: 'Marcar como entregada',
            message: 'Normalmente el solicitante confirma con su liga. Hazlo solo si ya te confirmó de otra forma; quedará registrado quién lo marcó.',
            confirmLabel: 'Marcar entregada',
          })
          if (!ok) return
          await cambiarEstado(folio, 'entregada', { comentario: 'Entrega confirmada por personal interno (a nombre del solicitante)' })
          toast('Requisición marcada como entregada.')
        },
      })
    }
  }

  if (e === 'en_espera' && rol && rolPuedeEstado(rol, 'en_espera')) {
    out.push({
      id: 'reanudar',
      label: 'Reanudar',
      clase: btnOk,
      run: () =>
        abrirMotivo({
          title: 'Reanudar requisición',
          label: 'Motivo de la reanudación',
          descripcion: 'Regresará al estado donde se quedó.',
          confirmLabel: 'Reanudar',
          accion: async (t) => {
            await reanudarRequisicion(folio, { comentario: t })
            toast('Requisición reanudada.')
          },
        }),
    })
  }
  if (e !== 'en_espera' && rol && puedeTransicionar(e, 'en_espera') && rolPuedeEstado(rol, 'en_espera')) {
    out.push({
      id: 'espera',
      label: 'Poner en espera',
      clase: btn,
      run: () =>
        abrirMotivo({
          title: 'Poner en espera',
          label: 'Motivo',
          descripcion: 'La requisición se detiene y podrá reanudarse donde se quedó.',
          placeholder: 'p. ej. se espera confirmación del presupuesto',
          confirmLabel: 'Poner en espera',
          accion: async (t) => {
            await cambiarEstado(folio, 'en_espera', { comentario: t })
            toast('Requisición en espera.')
          },
        }),
    })
  }
  if (rol && puedeTransicionar(e, 'cancelada') && rolPuedeEstado(rol, 'cancelada')) {
    out.push({
      id: 'cancelar',
      label: 'Cancelar',
      clase: btnDanger,
      run: () =>
        abrirMotivo({
          title: 'Cancelar requisición',
          label: 'Motivo de la cancelación',
          descripcion: 'No se borra nada: la requisición queda cancelada en el historial con tu motivo.',
          confirmLabel: 'Cancelar requisición',
          danger: true,
          accion: async (t) => {
            await cambiarEstado(folio, 'cancelada', { comentario: t })
            toast('Requisición cancelada.')
          },
        }),
    })
  }
  return out
})

function resumenElegido() {
  return evaluarCotizaciones(props.folio).monto
}

/** Avisos de por qué todavía no se puede avanzar (para no dejar botones "mudos"). */
const ayudas = computed(() => {
  const r = req.value
  if (!r || !puedeCotizar.value) return []
  const out = []
  if (r.estado === 'en_cotizacion') {
    const motivoFalta = motivoNoPuedePasarA(props.folio, 'en_autorizacion')
    if (motivoFalta) out.push(`Para enviar a autorización: ${motivoFalta}`)
    else if (listCotizaciones(props.folio).length > 0) {
      const ev = evaluarCotizaciones(props.folio)
      if (ev.requiereExcepcion && !excepcionValida(r)) out.push(ev.mensajes[0] ?? 'Faltan cotizaciones o documentar la excepción.')
    }
  }
  if (r.estado === 'fondeada') {
    const rc = resumenCompra(props.folio)
    if (rc.partidasSinCompra.length) out.push(`Para marcar comprada faltan partidas por registrar: ${rc.partidasSinCompra.map((p) => p.num).join(', ')}.`)
    else if (rc.comprasSinComprobante.length) out.push('Cada compra necesita factura o ticket para marcarla comprada.')
  }
  return out
})

async function ejecutar(a) {
  ocupado.value = true
  try {
    await a.run()
    bump()
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'No se pudo completar la acción.', 'error')
  } finally {
    ocupado.value = false
  }
}
</script>
