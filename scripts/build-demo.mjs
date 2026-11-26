// Genera una demo de UN SOLO ARCHIVO HTML (todo inline: JS, CSS, fuentes e imágenes) para abrirla o publicarla
// sin servidor ni instalación. Modo demo con datos de ejemplo cargados automáticamente.
//   npm run build:demo   →   dist/demo/demo.html
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const env = {
  ...process.env,
  SINGLE_FILE: '1',
  PUBLIC_PATH: './',
  VITE_ALLOW_DEMO: 'true',
  VITE_ROUTER_MODE: 'memory',
  VITE_AUTO_SEED: 'true',
  // Sin backend: la demo es 100 % local aunque el equipo tenga un .env con VITE_API_URL o Supabase.
  VITE_API_URL: '',
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_ANON_KEY: '',
}
const r = spawnSync('npx', ['quasar', 'build'], { stdio: 'inherit', env, shell: true })
if (r.status !== 0) process.exit(r.status ?? 1)

const dist = path.resolve('dist/spa')
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const read = (p) => fs.readFileSync(path.join(dist, p.replace(/^\.?\//, '')), 'utf8')

// <link rel="stylesheet" href="./assets/x.css"> → <style>
html = html.replace(/<link[^>]+rel="stylesheet"[^>]+href="(\.?\/?assets\/[^"]+\.css)"[^>]*>/g, (_m, href) => `<style>${read(href)}</style>`)
html = html.replace(/<link[^>]+href="(\.?\/?assets\/[^"]+\.css)"[^>]+rel="stylesheet"[^>]*>/g, (_m, href) => `<style>${read(href)}</style>`)
// quita precargas de módulos (ya no hay chunks)
html = html.replace(/<link[^>]+rel="modulepreload"[^>]*>/g, '')
// scripts de módulo → inline (sin cerrar el <script> por accidente)
const scripts = []
html = html.replace(/<script[^>]+src="(\.?\/?assets\/[^"]+\.js)"[^>]*><\/script>/g, (_m, src) => {
  scripts.push(read(src).replace(/<\/script/gi, '<\\/script'))
  return '<!--APP_SCRIPT-->'
})
if (scripts.length !== 1) {
  console.error(`Se esperaba 1 script y hay ${scripts.length}: revisa que inlineDynamicImports esté activo.`)
  process.exit(1)
}
// el script va al FINAL del body, después del contenedor #q-app
html = html.replace('<!--APP_SCRIPT-->', '')
// Se usa una FUNCIÓN de reemplazo: con una cadena, los patrones especiales de String.replace que aparecen en el
// JavaScript se expandirían y duplicarían el contenido.
html = html.replace('</body>', () => `<script type="module">${scripts[0]}</script></body>`)

fs.mkdirSync('dist/demo', { recursive: true })
fs.writeFileSync('dist/demo/demo.html', html)
console.log(`\nDemo generada: dist/demo/demo.html (${(html.length / 1024 / 1024).toFixed(2)} MB)`)
