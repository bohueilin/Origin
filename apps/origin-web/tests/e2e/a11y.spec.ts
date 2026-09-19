import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Measured WCAG 2 A/AA accessibility gate. Fails the build on any serious or critical
// violation — the real "page test validation" the product is held to.
const PAGES: Array<[string, string]> = [
  ['home', '/'],
  ['reference-check', '/reference-check'],
  ['verify', '/verify'],
  ['console', '/app.html'],
  ['proof', '/proof.html'],
  ['brief', '/brief.html'],
  ['trust', '/trust.html'],
  ['security', '/security.html'],
  ['labs', '/labs.html'],
  ['auth', '/auth.html'],
  ['reference-check-vs-runtime', '/reference-check-vs-runtime'],
  ['over-grant', '/over-grant'],
  ['proving-ground', '/proving-ground'],
  ['simulation', '/simulation'],
  ['operations', '/operations'],
  ['capture', '/capture'],
  ['passport', '/passport'],
  ['foundry', '/foundry'],
  ['soc', '/soc'],
  ['clip', '/clip'],
  ['admin-gate', '/admin'],
  ['privacy', '/legal/privacy-policy.html'],
  ['terms', '/legal/terms-of-service.html'],
  ['not-found', '/404.html'],
  ['research-report', '/rsi/rsi_dashboard.html'],
]

for (const [name, path] of PAGES) {
  test(`a11y: ${name} has no serious/critical WCAG 2 A/AA violations`, async ({ page }, testInfo) => {
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
      return route.continue()
    })
    await page.goto(path)
    await page.waitForTimeout(600)
    if (process.env.ORIGIN_VISUAL_QA === '1') {
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true })
      if (['home', 'proving-ground', 'reference-check'].includes(name)) {
        await page.screenshot({ path: testInfo.outputPath(`${name}-viewport.png`), fullPage: false })
      }
    }
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    const summary = bad.map((v) => `${v.id} (${v.impact}) x${v.nodes.length} — ${v.help}\n${v.nodes.map(n => `${n.target.join(', ')}: ${n.failureSummary}`).join('\n')}`).join('\n')
    expect(summary, summary || 'no serious/critical violations').toBe('')
    await expect(page.locator('h1')).toHaveCount(1)
    const size = await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth}))
    expect(size.scroll, `${path}: horizontal overflow`).toBeLessThanOrEqual(size.width + 1)
  })
}
