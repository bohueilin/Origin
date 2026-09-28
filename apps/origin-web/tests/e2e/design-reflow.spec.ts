import { test, expect } from '@playwright/test'

for (const route of ['/', '/app', '/brief', '/trust', '/operations']) {
  test(`narrow reading layout fits without document scrolling: ${route}`, async ({ page }) => {
    await page.route('**/*', request => {
      const url = new URL(request.request().url())
      return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
        ? request.continue() : request.abort('blockedbyclient')
    })
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 812 })
      await page.goto(route)
      if (route === '/operations') await expect(page.locator('.ops-controls')).toBeVisible()
      await expect(page.locator('h1')).toBeVisible()
      const measure = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
      expect(measure.document, `${route} at ${width}px`).toBeLessThanOrEqual(measure.viewport)
      // A wider fallback font must fit too (Linux/Windows do not have Avenir).
      await page.addStyleTag({ content: ':root { --font-sans: monospace; }' })
      for (const control of await page.locator('main .btn').all()) {
        if (!await control.isVisible()) continue
        const box = await control.boundingBox()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width, await control.innerText()).toBeLessThanOrEqual(width + 1)
        expect(box!.height).toBeGreaterThanOrEqual(44)
      }
    }
  })
}
