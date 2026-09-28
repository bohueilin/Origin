import { test, expect } from '@playwright/test'

const cases: [string, string, number][] = [
  ['/brief', '.brief__boundary, .brief__step p, .brief__rung p', 14],
  ['/labs', 'p.editorial-caption, .labs-verifier', 14],
  ['/trust', 'p.editorial-caption', 14],
  ['/operations', '.ops-note', 14],
  ['/simulation', '.sim-note', 14],
  ['/404.html', '.nf__visual figcaption', 12],
  ['/reference-check', '.product-hero__scope', 14],
  ['/legal/privacy-policy.html', 'main p:not(.updated), main li', 14],
  ['/legal/terms-of-service.html', 'main p:not(.updated), main li', 14],
]
for (const [route, selector, minimum] of cases) test(`static explanatory copy has readable size and measure: ${route}`, async ({ page }) => {
  await page.route('**/*', request => {
    const url = new URL(request.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/') ? request.continue() : request.abort('blockedbyclient')
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(route)
  await expect(page.locator(selector).first()).toBeVisible()
  const metrics = await page.locator(selector).evaluateAll(elements => elements.map(el => {
    const s = getComputedStyle(el), context = document.createElement('canvas').getContext('2d')!
    context.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
    const width = el.getBoundingClientRect().width - [s.paddingLeft, s.paddingRight, s.borderLeftWidth, s.borderRightWidth].map(parseFloat).reduce((a,b) => a+b, 0)
    return { size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight), ch: width / context.measureText('0').width }
  }))
  for (const m of metrics) {
    expect(m.size).toBeGreaterThanOrEqual(minimum)
    expect(m.line).toBeGreaterThanOrEqual(minimum * 1.5)
    expect(m.ch).toBeLessThanOrEqual(75.1)
  }
})
