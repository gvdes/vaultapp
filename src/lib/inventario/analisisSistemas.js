import { track } from '../reactive'
import { listEquipos } from './sistemas'
import { getFamilia } from './comunes'
import { calcularValorDepreciado } from './depreciacion'

function equiposDeSistemas() {
  return listEquipos().filter((e) => getFamilia(e.familiaId)?.tipo === 'sistemas')
}

/** Total histórico invertido en equipo de Sistemas (incluye los ya dados de baja — es lo que costó adquirirlos). */
export function valorOriginalSistemas() {
  track()
  return equiposDeSistemas().reduce((s, e) => s + (e.costoTotal || 0), 0)
}

/** Valor actual estimado (depreciado) de los equipos de Sistemas que siguen en uso (excluye bajas, que ya valen $0). */
export function valorActualSistemas() {
  track()
  return equiposDeSistemas()
    .filter((e) => e.estado !== 'baja')
    .reduce((s, e) => {
      const familia = getFamilia(e.familiaId)
      return s + (familia ? calcularValorDepreciado(e, familia) : e.costoTotal)
    }, 0)
}
