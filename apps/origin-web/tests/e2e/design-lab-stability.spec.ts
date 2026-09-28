import { test, expect } from '@playwright/test'

const paths = [
  ['/passport', '/src/passport/main.tsx', '#passport-root'],
  ['/clip', '/src/foundry/clip/main.tsx', '#root'],
  ['/foundry', '/src/foundry/main.tsx', '#root'],
  ['/soc', '/src/foundry/soc/main.tsx', '#root'],
  ['/capture', '/src/captureMain.tsx', '#capture-root'],
]
for (const [route, module, root] of paths) test(`Labs reserves loading space and releases it on failure: ${route}`, async ({ page }) => {
  let release!: () => void
  const paused = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*', request => {
    const url = new URL(request.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/') ? request.continue() : request.abort('blockedbyclient')
  })
  await page.route(`**${module}*`, async request => { await paused; await request.abort('failed') })
  try {
    await page.goto(route, { waitUntil: 'commit' })
    await expect(page.locator('.lab-fallback')).toBeVisible()
    const before = await page.locator('main').evaluate(el => ({ reserve: parseFloat(getComputedStyle(el).minHeight), viewport: innerHeight, margin: getComputedStyle(document.body).margin }))
    expect(before.reserve).toBeGreaterThanOrEqual(before.viewport)
    expect(before.margin).toBe('0px')
  } finally { release() }
  await page.waitForLoadState('load')
  await expect(page.locator('.lab-fallback')).toBeVisible()
  await expect(page.locator(root)).toBeEmpty()
  await expect.poll(() => page.locator('main').evaluate(el => parseFloat(getComputedStyle(el).minHeight) || 0)).toBe(0)
  // React can schedule its first commit after the load event. A loaded module
  // with a pending render must retain the reservation until its content arrives.
  await page.unroute(`**${module}*`)
  await page.route(`**${module}*`, request => request.fulfill({ contentType: 'application/javascript', body: '/* first render is pending */' }))
  await page.goto(route)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await page.locator('main').evaluate(el => parseFloat(getComputedStyle(el).minHeight))).toBeGreaterThanOrEqual(await page.evaluate(() => innerHeight))
  await page.locator(root).evaluate(el => { el.innerHTML = '<p>Rendered content</p>' })
  await expect(page.locator('.lab-fallback')).toBeHidden()
})
for (const route of ['/foundry', '/soc']) test(`Labs reduced-motion hover gives feedback without movement: ${route}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/*', request => {
    const url = new URL(request.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/') ? request.continue() : request.abort('blockedbyclient')
  })
  await page.goto(route)
  const button = page.locator('.fdy-btn:not(:disabled)').first()
  await button.hover()
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).transform)).toBe('none')
  const style = await button.evaluate(el => ({ property: getComputedStyle(el).transitionProperty, duration: getComputedStyle(el).transitionDuration }))
  expect(style.property).toBe('color, background-color, border-color, opacity')
  expect(style.duration.split(', ').every(value => value === '0.12s')).toBe(true)
})
