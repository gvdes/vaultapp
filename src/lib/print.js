/**
 * Sustituto de react-to-print: imprime solo el elemento dado (clon en un iframe oculto con los estilos de la página).
 */
export function printElement(el, documentTitle) {
  if (!el) return
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  if (!doc) return
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((n) => n.outerHTML).join('\n')
  doc.open()
  doc.write(`<!doctype html><html class="${document.documentElement.className}"><head><title>${documentTitle}</title>${styles}</head><body style="background:#fff">${el.outerHTML}</body></html>`)
  doc.close()
  const go = () => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => iframe.remove(), 1000)
  }
  setTimeout(go, 400)
}
