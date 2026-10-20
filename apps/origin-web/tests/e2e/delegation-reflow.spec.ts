import { test, expect } from '@playwright/test'

// Removing the narrow layout, its first-paint styles, or the /security static
// panel must fail these checks before browser code can mask the regression.
for (const route of ['/over-grant', '/security']) {
  for (const width of [320, 375, 1440]) {
    for (const mode of ['mounted', 'blocked-module', 'no-js'] as const) {
      test(`delegation is readable on ${route} at ${width}px (${mode})`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({ javaScriptEnabled: mode !== 'no-js', viewport: { width, height: 900 } })
        const page = await context.newPage()
        await page.route('**/*', r => {
          const url = new URL(r.request().url())
          if (!['localhost', '127.0.0.1'].includes(url.hostname)) return r.abort()
          if (mode === 'blocked-module' && r.request().resourceType() === 'script') return r.abort()
          return r.continue()
        })
        await page.goto(`${baseURL}${route}`)
        const panel = page.locator('#delegation')
        await expect(panel).toBeVisible()
        if (mode === 'mounted') await expect(panel.getByRole('button')).toHaveCount(3)
        const tree = panel.locator('svg:visible')
        await expect(tree).toHaveCount(1)
        await expect(tree).toHaveAccessibleName('Delegation tree. Root reaches 5 of 9 sensitive resources.')
        expect(await tree.locator('text').allTextContents()).toEqual(expect.arrayContaining(['platform', 'ops', 'finance', 'payroll-bot', 'pii-bot', 'ledger-bot']))
        await expect(tree.locator('text')).toHaveCount(6)
        const metrics = await tree.evaluate(el => {
          const svg = el as SVGSVGElement
          const labels = [...svg.querySelectorAll('text')].map(label => {
            const box = label.getBoundingClientRect()
            return { text: label.textContent, x: box.x, y: box.y, right: box.right, bottom: box.bottom,
              font: Number.parseFloat(getComputedStyle(label).fontSize) * Math.hypot(label.getScreenCTM()!.a, label.getScreenCTM()!.b) }
          })
          const bounds = svg.getBoundingClientRect()
          return { labels, left: bounds.left, right: bounds.right,
            pageOverflow: document.documentElement.scrollWidth > innerWidth }
        })
        expect(metrics.pageOverflow).toBe(false)
        for (const label of metrics.labels) {
          expect(label.x).toBeGreaterThanOrEqual(metrics.left)
          expect(label.right).toBeLessThanOrEqual(metrics.right)
          if (width < 700) expect(label.font).toBeGreaterThanOrEqual(12)
        }
        for (let i = 0; i < metrics.labels.length; i++) for (let j = i + 1; j < metrics.labels.length; j++) {
          const a = metrics.labels[i], b = metrics.labels[j]
          expect(a.right + 8 <= b.x || b.right + 8 <= a.x || a.bottom + 8 <= b.y || b.bottom + 8 <= a.y).toBe(true)
        }
        await expect(panel.locator('.sec-log')).toContainText('5 / 9 sensitive resources reachable — BRI 55.6%')
        if (width === 1440) {
          await expect(tree).toHaveAttribute('viewBox', '0 0 600 300')
          expect(await tree.locator('g > circle').evaluateAll(nodes => nodes.map(n => [n.getAttribute('cx'), n.getAttribute('cy'), n.getAttribute('r')]))).toEqual([
            ['300', '46', '18'], ['168', '150', '18'], ['432', '150', '18'],
            ['96', '254', '18'], ['240', '254', '18'], ['432', '254', '18'],
          ])
        }
        if (mode !== 'mounted') await expect(panel.getByRole('button')).toHaveCount(0)
        await context.close()
      })
    }
  }

  test(`delegation keyboard controls retain grants and feedback on ${route}`, async ({ page }) => {
    await page.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort())
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto(route)
    const panel = page.locator('#delegation')
    const labels = ['payroll-bot', 'pii-bot', 'ledger-bot']
    await panel.getByRole('button', { name: 'Widen payroll-bot', exact: true }).focus()
    for (let i = 0; i < labels.length; i++) {
      const button = panel.getByRole('button', { name: new RegExp(`^(Widen|Narrow) ${labels[i]}$`) })
      await expect(button).toBeFocused()
      await expect(button).toHaveAttribute('aria-pressed', 'false')
      await page.keyboard.press(i % 2 ? 'Space' : 'Enter')
      await expect(button).toHaveAttribute('aria-pressed', 'true')
      await expect(button).toHaveText(`Narrow ${labels[i]}`)
      await expect(panel.locator('.sec-log')).toContainText(`${6 + i} / 9 sensitive resources reachable`)
      await expect(panel.locator('svg:visible .deleg__inheritance')).toHaveCount(i + 2)
      if (i < labels.length - 1) await page.keyboard.press('Tab')
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(panel.locator('svg:visible')).toHaveAttribute('viewBox', '0 0 600 300')
    await expect(panel.locator('.sec-log')).toContainText('8 / 9 sensitive resources reachable')
    await page.setViewportSize({ width: 320, height: 900 })
    await expect(panel.locator('svg:visible')).toHaveAttribute('viewBox', '0 0 220 365')
    for (const label of labels) await panel.getByRole('button', { name: `Narrow ${label}`, exact: true }).click()
    await expect(panel.locator('.sec-log')).toContainText('5 / 9 sensitive resources reachable — BRI 55.6%')
    await expect(panel.locator('svg:visible .deleg__inheritance')).toHaveCount(0)
  })
}
