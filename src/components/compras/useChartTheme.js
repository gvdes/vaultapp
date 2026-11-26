import { nextTick, ref, watch } from 'vue'
import { useQuasar } from 'quasar'

/** Chart.js no resuelve variables CSS: se leen del tema activo y se recalculan al cambiar claro/oscuro (como HomePage). */
export function useChartTheme() {
  const $q = useQuasar()
  const themeRev = ref(0)
  watch(
    () => $q.dark.isActive,
    () => void nextTick(() => themeRev.value++),
  )
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

  function tooltip() {
    return {
      backgroundColor: cssVar('--color-surface'),
      borderColor: cssVar('--color-border'),
      borderWidth: 1,
      titleColor: cssVar('--color-text'),
      bodyColor: cssVar('--color-text'),
      titleFont: { size: 12 },
      bodyFont: { size: 12 },
    }
  }

  /** Barras (vertical u horizontal). `fmt` da formato al valor del tooltip y del eje. */
  function barOptions(o = {}) {
    void themeRev.value
    const muted = cssVar('--color-text-muted')
    const border = cssVar('--color-border')
    const fmt = o.fmt ?? ((n) => String(n))
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: o.horizontal ? 'y' : 'x',
      layout: { padding: { left: 4, right: 12, top: 6 } },
      plugins: {
        legend: { display: !!o.legend, labels: { color: muted, font: { size: 11 } } },
        tooltip: { ...tooltip(), callbacks: { label: (ctx) => `${ctx.dataset.label ?? ''}: ${fmt(Number(o.horizontal ? ctx.parsed.x : ctx.parsed.y))}` } },
      },
      scales: {
        x: { grid: { color: border }, ticks: { color: muted, font: { size: 10 }, ...(o.horizontal ? { callback: (v) => fmt(Number(v)) } : { autoSkip: false, maxRotation: 25, minRotation: 0 }) } },
        y: { grid: { color: border }, ticks: { color: muted, font: { size: 10 }, ...(o.horizontal ? {} : { callback: (v) => fmt(Number(v)) }) } },
      },
    }
  }

  function doughnutOptions(fmt) {
    void themeRev.value
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'right', labels: { color: cssVar('--color-text-muted'), font: { size: 11 }, boxWidth: 10 } },
        tooltip: { ...tooltip(), callbacks: { label: (ctx) => `${ctx.label}: ${fmt(Number(ctx.parsed))}` } },
      },
    }
  }

  return { themeRev, cssVar, barOptions, doughnutOptions }
}
