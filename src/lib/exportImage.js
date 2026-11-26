export function exportSvgAsPng(container, filename, background = '#ffffff') {
  const svg = container.querySelector('svg')
  if (!svg) return

  const width = svg.clientWidth || 640
  const height = svg.clientHeight || 360
  const clone = svg.cloneNode(true)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const svgString = new XMLSerializer().serializeToString(clone)
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  const img = new Image()
  img.onload = () => {
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(scale, scale)
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    URL.revokeObjectURL(url)
    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename.endsWith('.png') ? filename : `${filename}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    })
  }
  img.src = url
}
