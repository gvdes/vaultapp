/** @typedef {'success' | 'info' | 'warning' | 'danger' | 'neutral'} PillTone */

export const TONE_STYLES = {
  success: 'bg-vz-success/10 text-vz-success border-vz-success/30',
  info: 'bg-vz-blue/10 text-vz-blue border-vz-blue/30',
  warning: 'bg-vz-warning/10 text-vz-warning border-vz-warning/30',
  danger: 'bg-vz-danger/10 text-vz-danger border-vz-danger/30',
  neutral: 'bg-bg text-text-soft border-border',
}

export const ESTADO_EQUIPO_LABEL = {
  disponible: 'Disponible',
  asignado: 'Asignado',
  danado: 'Dañado',
  en_reparacion: 'En reparación',
  baja: 'Baja',
}
export const ESTADO_EQUIPO_TONE = {
  disponible: 'success',
  asignado: 'info',
  danado: 'danger',
  en_reparacion: 'warning',
  baja: 'neutral',
}

export const ESTADO_SOLICITUD_LABEL = {
  pendiente: 'Pendiente',
  asignado: 'Asignado',
  pendiente_compra: 'Pendiente de compra',
  completada: 'Completada',
  cancelada: 'Cancelada',
}
export const ESTADO_SOLICITUD_TONE = {
  pendiente: 'warning',
  asignado: 'info',
  pendiente_compra: 'danger',
  completada: 'success',
  cancelada: 'neutral',
}
