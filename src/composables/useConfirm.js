import { Dialog } from 'quasar'

/**
 * @typedef {object} ConfirmOptions
 * @property {string} [title]
 * @property {string} message
 * @property {string} [confirmLabel]
 * @property {string} [cancelLabel]
 * @property {boolean} [danger]
 */

/** @typedef {(options: ConfirmOptions | string) => Promise<boolean>} ConfirmFn */

/** Misma firma que el useConfirm() de la versión React: `if (!(await confirm({ message, danger: true }))) return`. */
export function useConfirm() {
  return (opts) => {
    const o = typeof opts === 'string' ? { message: opts } : opts
    return new Promise((resolve) => {
      Dialog.create({
        title: o.title ?? 'Confirmar',
        message: o.message,
        persistent: false,
        cancel: { label: o.cancelLabel ?? 'Cancelar', flat: true, noCaps: true },
        ok: { label: o.confirmLabel ?? 'Aceptar', color: o.danger ? 'negative' : 'primary', unelevated: true, noCaps: true },
      })
        .onOk(() => resolve(true))
        .onCancel(() => resolve(false))
        .onDismiss(() => resolve(false))
    })
  }
}
