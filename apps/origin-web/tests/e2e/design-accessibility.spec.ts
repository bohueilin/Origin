import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', request => {
    const url = new URL(request.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? request.continue() : request.abort('blockedbyclient')
  })
})

function contrast(a: string, b: string) {
  const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
    const n = value / 255
    return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4
  }).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0)
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05)
}

test('Foundry benchmark sources have usable touch targets', async ({ page }) => {
  await page.goto('/foundry')
  const links = page.locator('.fdy-benchstrip a')
  await expect(links).toHaveCount(5)
  for (const link of await links.all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
})

for (const route of ['privacy-policy', 'terms-of-service']) test(`legal skip link remains legible when focused: ${route}`, async ({ page }) => {
  await page.goto(`/legal/${route}.html`)
  await page.keyboard.press('Tab')
  const link = page.getByRole('link', { name: 'Skip to main content' })
  await expect(link).toBeFocused()
  const colors = await link.evaluate(el => { const s = getComputedStyle(el); return { text: s.color, background: s.backgroundColor } })
  expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5)
})

test('SOC sequence arrows are visible decorative separators', async ({ page }) => {
  await page.goto('/soc')
  const arrows = page.locator('.cpt__arrow')
  await expect(arrows).toHaveCount(4)
  for (const arrow of await arrows.all()) {
    const colors = await arrow.evaluate(el => {
      const chain: Element[] = []
      for (let node = el.parentElement; node; node = node.parentElement) chain.unshift(node)
      let rgb = [255, 255, 255]
      for (const node of chain) {
        const [r, g, b, alpha = 1] = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)!.map(Number)
        rgb = [r, g, b].map((n, i) => n * alpha + rgb[i] * (1 - alpha))
      }
      return { text: getComputedStyle(el).color, background: `rgb(${rgb.join(',')})` }
    })
    expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(3)
    await expect(arrow).toHaveAttribute('aria-hidden', 'true')
  }
})

test('gate freshness is available through landmark navigation', async ({ page }) => {
  await page.goto('/')
  expect(await page.locator('#gates-freshness').evaluate(el => Boolean(el.closest('main, footer')))).toBe(true)
})
