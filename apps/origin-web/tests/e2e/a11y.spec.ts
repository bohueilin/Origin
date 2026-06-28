import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Measured WCAG 2 A/AA accessibility gate. Fails the build on any serious or critical
// violation — the real "page test validation" the product is held to.
const PAGES: Array<[string, string]> = [
  ['home', '/'],
  ['console', '/app.html'],
  ['auth', '/auth.html'],
]

for (const [name, path] of PAGES) {
  test(`a11y: ${name} has no serious/critical WCAG 2 A/AA violations`, async ({ page }) => {
    await page.goto(path)
    await page.waitForTimeout(600)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    const summary = bad.map((v) => `${v.id} (${v.impact}) x${v.nodes.length} — ${v.help}`).join('\n')
    expect(summary, summary || 'no serious/critical violations').toBe('')
  })
}
