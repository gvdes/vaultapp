/**
 * Reduce una foto (JPEG, máx. `maxLado` px por lado) y la devuelve como data URL. La evidencia de la auditoría se guarda
 * así porque el conteo público (sin sesión) no puede subir a Storage; una foto de celular pasa de varios MB a ~60-100 KB.
 */
export function comprimirFoto(file, maxLado = 800, calidad = 0.6) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * escala))
      const h = Math.max(1, Math.round(img.height * escala))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen.'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', calidad))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen.'))
    }
    img.src = url
  })
}
