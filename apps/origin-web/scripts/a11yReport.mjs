// One-off a11y reporter: prints each serious/critical axe violation with node selectors
// and (for contrast) the actual fg/bg colors + ratio, so fixes are precise. Points at a
// running dev/preview server (default :5275).
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const base = process.env.BASE || 'http://localhost:5275'
const browser = await chromium.launch()
for (const [name, path] of [['home', '/'], ['console', '/app.html']]) {
  const page = await (await browser.newContext()).newPage()
  await page.goto(base + path, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(700)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  console.log(`\n========== ${name} (${path}) ==========`)
  for (const v of bad) {
    console.log(`\n[${v.impact}] ${v.id} x${v.nodes.length} — ${v.help}`)
    v.nodes.slice(0, 12).forEach((n) => {
      const d = (n.any && n.any[0] && n.any[0].data) || {}
      const c = d.contrastRatio != null ? ` | fg ${d.fgColor} bg ${d.bgColor} ratio ${d.contrastRatio} (need ${d.expectedContrastRatio})` : ''
      console.log('   •', n.target.join(' '), c)
    })
  }
  await page.close()
}
await browser.close()
