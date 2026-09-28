import { test, expect } from '@playwright/test'

const routes = ['/clip', '/capture', '/soc', '/foundry', '/passport']
for (const route of routes) for (const scripts of ['disabled', 'failed']) {
  test(`Labs fallback provides a job and recovery path with scripts ${scripts}: ${route}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: scripts !== 'disabled', viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    await page.route('**/*', request => {
      const url = new URL(request.request().url())
      if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/') || (scripts === 'failed' && request.request().resourceType() === 'script')) return request.abort('blockedbyclient')
      return request.continue()
    })
    try {
      await page.goto(`${baseURL}${route}`)
      const fallback = page.locator('main .lab-fallback')
      await expect(fallback.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(fallback).toContainText('JavaScript')
      expect(await page.locator('main').evaluate(el => parseFloat(getComputedStyle(el).minHeight) || 0)).toBe(0)
      const back = fallback.getByRole('link', { name: 'Back to Labs' })
      expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await back.click()
      await expect(page).toHaveURL(/\/labs$/)
    } finally { await context.close() }
  })
}

test('mounted Labs apps replace their fallbacks and retain scoped content', async ({ page }) => {
  await page.route('**/*', request => {
    const url = new URL(request.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/') ? request.continue() : request.abort('blockedbyclient')
  })
  for (const route of routes) {
    await page.goto(route)
    await expect(page.locator('.lab-fallback')).toBeHidden()
    await expect(page.locator('main h1:visible')).toHaveCount(1)
    if (route === '/passport') {
      await expect(page.locator('.pp-static-intro').first()).toBeHidden()
      await expect(page.locator('.pp-hero-pill')).toContainText('Local demo')
    }
  }
})
