<template>
  <!-- Documento imprimible: fondo blanco y colores fijos (no depende del tema claro/oscuro). -->
  <div class="mx-auto w-full" style="max-width: 794px; background: #fff; color: #111827; padding: 32px 40px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.5">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px">
      <Logo size="lg" />
      <div style="text-align: right">
        <p style="font-size: 18px; font-weight: 800; color: #1e3a8a; margin: 0">{{ esDevolucion ? 'Constancia de devolución de equipo' : 'Carta responsiva de equipo' }}</p>
        <p style="margin: 2px 0 0">Folio: <strong>{{ responsiva.folio }}</strong></p>
        <p style="margin: 0">Fecha: <strong>{{ fechaLarga }}</strong></p>
        <p style="margin: 0">Ubicación: <strong>{{ ubicacion?.nombre ?? '—' }}</strong></p>
      </div>
    </div>

    <h3 :style="tituloSeccion">Datos del equipo</h3>
    <div style="display: flex; gap: 16px; align-items: flex-start">
      <table style="flex: 1; border-collapse: collapse; width: 100%">
        <tbody>
          <tr v-for="[k, v] in filasEquipo" :key="k">
            <td :style="celdaClave">{{ k }}</td>
            <td :style="celdaValor">{{ v }}</td>
          </tr>
        </tbody>
      </table>
      <img v-if="responsiva.fotoUrl" :src="responsiva.fotoUrl" alt="Foto del equipo" style="width: 150px; height: 150px; object-fit: cover; border: 1px solid #d1d5db; border-radius: 6px" />
    </div>

    <h3 :style="tituloSeccion">{{ esDevolucion ? 'Datos de quien devuelve' : 'Datos del responsable (colaborador)' }}</h3>
    <table style="border-collapse: collapse; width: 100%">
      <tbody>
        <tr>
          <td :style="celdaClave">Nombre</td>
          <td :style="celdaValor">{{ (esDevolucion ? responsiva.entregadoPor : responsiva.responsable) || '—' }}</td>
        </tr>
        <tr v-if="!esDevolucion">
          <td :style="celdaClave">Puesto</td>
          <td :style="celdaValor">{{ responsiva.puesto || '—' }}</td>
        </tr>
        <tr>
          <td :style="celdaClave">Entregado por</td>
          <td :style="celdaValor">{{ responsiva.entregadoPor || 'Soporte e Infraestructura' }}</td>
        </tr>
        <tr>
          <td :style="celdaClave">Autoriza (gerente)</td>
          <td :style="celdaValor">{{ responsiva.autorizadoPor || '—' }}</td>
        </tr>
      </tbody>
    </table>

    <h3 :style="tituloSeccion">{{ esDevolucion ? 'Devolución' : 'Condiciones de la responsiva' }}</h3>
    <p v-if="esDevolucion" style="margin: 0 0 6px; text-align: justify">
      Se hace constar que el equipo descrito fue devuelto a Soporte e Infraestructura en el estado indicado, quedando sin responsable asignado a partir de esta fecha.
    </p>
    <ol v-else style="margin: 0; padding-left: 18px; text-align: justify">
      <li v-for="(c, i) in clausulas" :key="i" style="margin-bottom: 4px">{{ c }}</li>
    </ol>

    <div v-if="!esDevolucion" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 56px">
      <div v-for="f in firmas" :key="f.rol" style="text-align: center">
        <div style="border-top: 1px solid #111827; padding-top: 4px">
          <p style="margin: 0; font-weight: 700">{{ f.rol }}</p>
          <p style="margin: 2px 0 0; color: #374151; font-size: 11px">{{ f.detalle }}</p>
        </div>
      </div>
    </div>
    <div v-else style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; margin-top: 56px">
      <div v-for="f in firmasDevolucion" :key="f.rol" style="text-align: center">
        <div style="border-top: 1px solid #111827; padding-top: 4px">
          <p style="margin: 0; font-weight: 700">{{ f.rol }}</p>
          <p style="margin: 2px 0 0; color: #374151; font-size: 11px">{{ f.detalle }}</p>
        </div>
      </div>
    </div>

    <p style="margin: 28px 0 0; text-align: center; color: #6b7280; font-size: 10px">Texto sujeto a validación de Jurídico / Recursos Humanos.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Logo from 'components/Logo.vue'
import { getEquipo } from 'src/lib/inventario/sistemas'
import { getFamilia, getUbicacion } from 'src/lib/inventario/comunes'
import { calcularValorDepreciado } from 'src/lib/inventario/depreciacion'
import { parseLocalDate } from 'src/lib/dateUtils'

const props = defineProps({ responsiva: { type: Object, required: true } })

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const ESTADO_LABEL = {
  disponible: 'Disponible',
  asignado: 'Asignado',
  danado: 'Dañado',
  en_reparacion: 'En reparación',
  baja: 'Baja',
}

const tituloSeccion = 'font-size: 13px; font-weight: 800; color: #1e3a8a; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 0.03em'
const celdaClave = 'border: 1px solid #d1d5db; background: #f3f4f6; padding: 4px 8px; width: 32%; font-weight: 700'
const celdaValor = 'border: 1px solid #d1d5db; padding: 4px 8px'

const esDevolucion = computed(() => props.responsiva.tipo === 'devolucion')
const equipo = computed(() => getEquipo(props.responsiva.equipoId))
const familia = computed(() => getFamilia(equipo.value?.familiaId))
const ubicacion = computed(() => getUbicacion(props.responsiva.ubicacionId))
const fechaLarga = computed(() => parseLocalDate(props.responsiva.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }))
const valorActual = computed(() => (equipo.value && familia.value ? currency.format(calcularValorDepreciado(equipo.value, familia.value)) : '—'))

const filasEquipo = computed(() => [
  ['Familia', familia.value?.nombre ?? '—'],
  ['Modelo', equipo.value?.modelo || '—'],
  ['Marca', equipo.value?.marca || '—'],
  ['N° de serie', equipo.value?.numeroSerie || '—'],
  ['Estado al entregar', ESTADO_LABEL[props.responsiva.estadoEquipo ?? equipo.value?.estado ?? ''] ?? '—'],
  ['Valor actual estimado (depreciado)', valorActual.value],
])

const clausulas = [
  'El colaborador que firma recibe el equipo descrito en buen estado de funcionamiento y se hace responsable de su custodia y cuidado mientras permanezca bajo su resguardo.',
  'El equipo es propiedad de la empresa y se destina exclusivamente a fines laborales; no debe utilizarse para actividades personales ni de terceros.',
  'Cualquier falla, daño, extravío o robo deberá reportarse de inmediato a Soporte e Infraestructura.',
  'El colaborador no podrá prestar, transferir ni entregar el equipo a terceros sin que se formalice una nueva responsiva.',
  'En caso de pérdida o daño por negligencia o mal uso, se podrá efectuar el cargo correspondiente al valor actual depreciado del equipo, conforme a la política de la empresa.',
  'Al terminar la relación laboral, o cuando la empresa lo solicite, el colaborador deberá devolver el equipo en buen estado, con sus accesorios.',
]

const firmas = computed(() => [
  { rol: 'Recibe', detalle: `Colaborador – responsable del equipo${props.responsiva.responsable ? `: ${props.responsiva.responsable}` : ''}` },
  { rol: 'Entrega', detalle: `Soporte e Infraestructura / responsable anterior${props.responsiva.entregadoPor ? `: ${props.responsiva.entregadoPor}` : ''}` },
  { rol: 'Autoriza', detalle: `Gerente de área${props.responsiva.autorizadoPor ? `: ${props.responsiva.autorizadoPor}` : ''}` },
])
const firmasDevolucion = computed(() => [
  { rol: 'Devuelve', detalle: props.responsiva.entregadoPor || 'Colaborador' },
  { rol: 'Recibe', detalle: 'Soporte e Infraestructura' },
])
</script>
