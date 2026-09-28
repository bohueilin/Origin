import { test, expect } from '@playwright/test'

async function localOnly(page: import('@playwright/test').Page) {
  await page.route('**/*', request => {
    const url = new URL(request.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/') ? request.continue() : request.abort('blockedbyclient')
  })
}
test('shared footer places brand and navigation side by side only on wide screens', async ({ page }) => {
  await localOnly(page)
  await page.goto('/')
  for (const [width, columns] of [[1440, 2], [375, 1]]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.locator('.site-footer__grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(columns)
  }
})
test('proof carries the shared footer and owner-console return path', async ({ page }) => {
  await localOnly(page)
  await page.goto('/proof')
  for (const destination of ['/labs', '/legal/privacy-policy.html', '/legal/terms-of-service.html', '/auth']) {
    await expect(page.locator(`.site-footer a[href="${destination}"]`)).toBeVisible()
  }
})
for (const route of ['/foundry', '/soc', '/capture', '/clip', '/passport']) test(`Labs has consistent return and legal navigation: ${route}`, async ({ page }) => {
  await localOnly(page)
  await page.goto(route)
  const footer = page.locator('.lab-footer')
  for (const destination of ['/', '/labs', '/legal/privacy-policy.html', '/legal/terms-of-service.html', '/auth']) {
    const link = footer.locator(`a[href="${destination}"]`)
    await expect(link).toBeVisible()
    const box = await link.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
    expect(await link.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14)
  }
  await expect(footer.locator('a[href="/auth"]')).toHaveText('Owner console (restricted)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
})
