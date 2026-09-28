import { test, expect } from '@playwright/test'
for (const route of ['/proof', '/trust', '/reference-check-vs-runtime']) test(`computed diagram remains readable without JavaScript on ${route}`, async ({ browser, baseURL }) => {
  for (const width of [320, 1440]) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } })
    const page = await context.newPage()
    await page.route('**/*', r => ['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort())
    await page.goto(`${baseURL}${route}`)
    const svg = page.locator('.evidence-diagram svg:visible')
    await expect(svg).toHaveCount(1)
    await expect(svg.locator('title')).toHaveCount(1)
    await expect(svg.locator('desc')).toHaveCount(1)
    if (route === '/proof') {
      await expect(svg).toContainText('Machine-emitted')
      await expect(svg).toContainText('not a customer deployment')
      await expect(svg.locator('[data-trace-node]')).toHaveCount(12)
      await expect(page.locator('.evidence-diagram ol li')).toHaveCount(12)
    } else {
      await expect(svg).toContainText('Runs today, in your browser')
      await expect(svg.locator('[data-proposed]')).toContainText('Proposed — not built')
      expect(await svg.locator('[data-proposed]').textContent()).not.toMatch(/\b(live|active|running)\b/i)
      const contrast = await svg.locator('[data-proposed] .diagram-lane').evaluate(el => {
        const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
        const fg = rgb(getComputedStyle(el).fill), bg = [248, 247, 244]
        let opacity = 1
        for (let node: Element | null = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity)
        const lum = (c: number[]) => c.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((s,n,i) => s + n * [.2126,.7152,.0722][i], 0)
        return (lum(bg) + .05) / (lum(fg.map((n,i) => n * opacity + bg[i] * (1-opacity))) + .05)
      })
      expect(contrast).toBeGreaterThanOrEqual(4.5)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await context.close()
  }
})
