import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort('blockedbyclient')
  })
})

for (const width of [320, 375]) test(`research snapshot fits ${width}px with readable source notes`, async ({ page }) => {
  await page.setViewportSize({ width, height: 812 })
  await page.goto('/rsi/rsi_dashboard.html')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  const notes = await page.locator('.card .sub').evaluateAll(elements => elements.map(el => ({ size: parseFloat(getComputedStyle(el).fontSize), line: parseFloat(getComputedStyle(el).lineHeight) })))
  expect(notes.length).toBeGreaterThan(10)
  for (const note of notes) { expect(note.size).toBeGreaterThanOrEqual(14); expect(note.line).toBeGreaterThanOrEqual(23) }
})

test('research snapshot exposes synthetic provenance and a coherent heading hierarchy', async ({ page }) => {
  await page.goto('/rsi/rsi_dashboard.html')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow')
  await expect(page.getByRole('heading', { name: 'Synthetic policy evaluation', exact: true })).toBeVisible()
  await expect(page.getByText('Synthetic demo rows', { exact: true })).toBeVisible()
  await expect(page.getByText('Synthetic held-out thresholds passed', { exact: true })).toBeVisible()
  expect(await page.locator('main').innerText()).not.toMatch(/READY FOR LIMITED|limited pilot evidence|Robot-Readiness Gym/)
  const results = await new AxeBuilder({ page }).withRules(['heading-order']).analyze()
  expect(results.violations).toEqual([])
})
