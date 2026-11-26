import { defineBoot } from '#q-app/wrappers'
import { Chart, registerables } from 'chart.js'

export default defineBoot(() => {
  Chart.register(...registerables)
  Chart.defaults.font.family = '"Nunito", ui-sans-serif, system-ui, sans-serif'
  Chart.defaults.maintainAspectRatio = false
})
