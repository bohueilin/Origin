import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/') ? route.continue() : route.abort('blockedbyclient')
  })
})

for (const [ok, verdict] of [[false, 'veto'], [true, 'ratify'], [true, 'veto']] as const) {
  test(`SOC latency preserves response and provenance: ${ok ? 'backend' : 'fallback'} ${verdict}`, async ({ page }) => {
    await page.route('**/api/foundry/latency', route => route.fulfill({ json: {
      ok: true, attackText: 'Synthetic instruction',
      cerebras: { ok, verdict, totalMs: 70, ttftMs: 6, reason: 'Fixture response' },
      gpu: { ok: false, label: 'Comparison fixture', totalMs: 2400 },
    } }))
    await page.goto('/soc')
    await page.getByRole('button', { name: 'Send the attack', exact: true }).click()
    const results = page.locator('.soc-lat__rows')
    await expect(results).toContainText(`${ok ? 'Backend response' : 'Illustrative fallback'} · returned decision ${verdict} · 70 ms`)
    await expect(results).toContainText('Illustrative fallback · response time 2400 ms')
    await expect(page.locator('.fdy-race__verdict')).not.toContainText(/blocked the injection|defense reacts/i)
  })
}

test('Labs claims stay within the prototype and local-demo boundaries', async ({ page }) => {
  await page.goto('/soc')
  await expect(page.getByRole('heading', { name: 'Accuracy within a time budget' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Run the synthetic incident workflow' })).toBeVisible()
  expect(await page.locator('main').innerText()).not.toMatch(/roadmap, shipped|Speed buys correctness|earning a guarantee/)
  await page.goto('/passport')
  await expect(page.locator('.pp-readonly')).toContainText('owner sign-in enables the local demo')
  await expect(page.locator('.pp-usecase-badge').filter({ hasText: 'Demo scenario' }).first()).toBeVisible()
})

for (const route of ['/auth', '/admin']) test(`account illustration is visibly and accessibly labeled: ${route}`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(route)
  const caption = page.getByText('AI-generated illustration · fictional people and setting', { exact: true })
  await expect(caption).toBeVisible()
  expect(await caption.evaluate(el => Boolean(el.closest('[aria-hidden="true"]')))).toBe(false)
  expect(await caption.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
})
