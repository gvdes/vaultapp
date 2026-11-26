import { defineConfig } from '#q-app/wrappers'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(() => ({
  boot: ['theme', 'charts', 'auth'],

  css: ['app.css'],

  extras: ['material-icons'],

  build: {
    target: { browser: ['es2022', 'firefox115', 'chrome115', 'safari14'], node: 'node20' },
    vueRouterMode: 'history',
    // Si la app vive en una subcarpeta del dominio (https://empresa.mx/inventarios/), compilar con PUBLIC_PATH=/inventarios/
    publicPath: process.env.PUBLIC_PATH || '/',
    vitePlugins: [...tailwindcss()],
    // Build de demostración de un solo archivo (npm run build:demo): todo inline, sin chunks ni assets externos.
    extendViteConf(viteConf) {
      if (process.env.SINGLE_FILE !== '1') return
      viteConf.build = viteConf.build ?? {}
      viteConf.build.assetsInlineLimit = 100_000_000
      viteConf.build.cssCodeSplit = false
      viteConf.build.rollupOptions = { ...viteConf.build.rollupOptions, output: { inlineDynamicImports: true } }
    },
  },

  devServer: { open: false, port: 9000 },

  framework: {
    config: { dark: 'auto', brand: { primary: '#1f5fae', secondary: '#0e7490', accent: '#0fa391', positive: '#12a66b', negative: '#b0413f', warning: '#e3a517', info: '#1f5fae' } },
    plugins: ['Notify', 'Dialog', 'Dark', 'LocalStorage'],
    lang: 'es',
  },

  animations: [],
}))
