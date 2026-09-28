import { test, expect, type Page } from '@playwright/test'

const ENHANCED_ROUTES = ['/', '/trust', '/labs', '/brief', '/verify', '/over-grant', '/security', '/reference-check', '/simulation', '/operations', '/proving-ground']

async function localOnly(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
}

for (const pathname of ENHANCED_ROUTES) test(`mobile header reserves its enhanced size while the nav module loads: ${pathname}`, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await localOnly(page)
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/src/home/enhance.ts*', async (route) => {
    await pending
    await route.continue()
  })
  try {
    await page.goto(pathname, { waitUntil: 'commit' })
    // Navigation commit can expose an unstyled DOM before the render-blocking
    // stylesheet has parsed. Measure the styled header while enhance.ts is
    // still paused, rather than racing an intermediate DOM that cannot paint.
    await page.waitForFunction(() => Boolean(document.querySelector<HTMLLinkElement>('link[href^="/home.css"]')?.sheet))
    await expect(page.locator('.site-header')).toBeVisible()
    const height = await page.locator('.site-header').evaluate(el => el.getBoundingClientRect().height)
    expect(height).toBeLessThanOrEqual(88)
  } finally {
    release()
  }
  await page.waitForLoadState('load')
  await expect(page.locator('html')).toHaveClass(/nav-bound/)
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Trust', exact: true })).toBeVisible()
})

test('mobile navigation remains usable when JavaScript is unavailable', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await localOnly(page)
  try {
    await page.goto(`${baseURL}/`)
    const nav = page.getByRole('navigation', { name: 'Primary' })
    // Labs left the primary nav (it stays in the footer), so exercise Trust instead.
    await expect(nav.getByRole('link', { name: 'Trust', exact: true })).toBeVisible()
    await nav.getByRole('link', { name: 'Trust', exact: true }).click()
    await expect(page).toHaveURL(/\/trust$/)
    await page.waitForLoadState('load')
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Trust', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const route of [...ENHANCED_ROUTES, '/proof', '/reference-check-vs-runtime']) {
      await page.goto(`${baseURL}${route}`)
      const emptyRoots = page.locator('#sim-root, #pg-root, #ops-root')
      for (const root of await emptyRoots.all()) expect(await root.evaluate(el => el.getBoundingClientRect().height), route).toBeLessThan(100)
      await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Trust', exact: true })).toBeVisible()
    }
  } finally {
    await context.close()
  }
})

test('mobile navigation recovers when the enhancement module is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await localOnly(page)
  await page.route('**/src/home/enhance.ts*', route => route.fulfill({ status: 404, body: '' }))
  for (const route of ENHANCED_ROUTES) {
    await page.goto(route)
    await expect(page.locator('html')).not.toHaveClass(/nav-ready/)
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Trust', exact: true })).toBeVisible()
  }
})

test('Labs stays reachable from the home footer', async ({ page }) => {
  await localOnly(page)
  await page.goto('/')
  await expect(page.locator('.site-footer a[href="/labs"]')).toBeVisible()
})

test('unavailable decorative video leaves its image and removes the unusable play control', async ({ page }) => {
  await localOnly(page)
  await page.route('**/brand/review-loop*', (route) => route.abort('failed'))
  await page.goto('/')
  const film = page.locator('[data-cinematic-film]')
  const control = page.locator('[data-cinematic-toggle]')
  // Reduced-motion browsers only request the video after deliberate interaction.
  if (await control.isVisible()) await control.click()
  await expect(control).toBeHidden()
  await expect(film).toHaveAttribute('poster', '/brand/review-2026-09-28.webp')
  await expect(page.getByRole('link', { name: 'Run the synthetic reference check', exact: true })).toBeVisible()
})

test('a failed first hero source leaves a playable fallback and its control', async ({ page }) => {
  await localOnly(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route('**/brand/review-loop*.av1.mp4', route => route.abort('failed'))
  await page.goto('/')
  const film = page.locator('[data-cinematic-film]')
  // Exercise the skipped/failed-source event even on platforms without AV1 support.
  await film.locator('source').first().dispatchEvent('error', { bubbles: false })
  await expect(page.locator('[data-cinematic-toggle]')).toBeVisible()
  await expect.poll(() => film.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0)
  expect(await film.evaluate((el: HTMLVideoElement) => el.currentSrc)).not.toMatch(/av1\.mp4$/)
})

test('data saver keeps the hero still until playback is requested', async ({ page }) => {
  await localOnly(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }))
  await page.goto('/')
  const film = page.locator('[data-cinematic-film]')
  await expect(page.locator('[data-cinematic-toggle]')).toHaveText('Play scene')
  expect(await film.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true)
  await page.locator('[data-cinematic-toggle]').click()
  await expect.poll(() => film.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0)
})

test('reduced motion keeps the hero still until the visitor chooses playback', async ({ page }) => {
  await localOnly(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const film = page.locator('[data-cinematic-film]')
  const control = page.locator('[data-cinematic-toggle]')
  await expect(control).toHaveText('Play scene')
  expect(await film.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true)
  await control.click()
  await expect(control).toHaveText('Pause scene')
  await control.click()
  await expect(control).toHaveText('Play scene')
})

// W3-1 type floor, measure and targets on `/`. The viewports are set explicitly (375 and
// 1440), so this runs once, in the desktop project.
const INTEGRITY_LABELS = [
  'AI-generated illustration',
  'Not earned yet',
  'No customer validation is claimed',
  'does not contact or execute your named agent',
]
const PROSE = ['.hero__status', '.cin-demo .demo__panel p', '.cin-footnote p', '.cin-small',
  '.gatesfresh', '.demo__cap', '.modal__note', '.site-footer__boundary', '.vband__cap']

test('home type floor: integrity labels at least 12px, prose at least 14px, no text below 11px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await localOnly(page)
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const sizes = await page.evaluate(({ labels, prose }) => {
      const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize)
      const texts: { text: string, size: number, visible: boolean }[] = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement
        const text = node.textContent?.trim() ?? ''
        if (el && text) texts.push({ text, size: px(el), visible: el.checkVisibility({ visibilityProperty: true }) })
      }
      return {
        tooSmall: texts.filter((t) => t.visible && t.size < 11).map((t) => `${t.size}px ${t.text.slice(0, 40)}`),
        labels: labels.map((label) => texts.filter((t) => t.text.includes(label)).map((t) => ({ label, size: t.size, visible: t.visible }))),
        pill: [...document.querySelectorAll('.vband__pill')].map(px),
        prose: prose.map((sel) => ({ sel, sizes: [...document.querySelectorAll(sel)].map(px) })),
      }
    }, { labels: INTEGRITY_LABELS, prose: PROSE })
    expect(sizes.tooSmall, `${width}px`).toEqual([])
    expect(sizes.pill.length).toBeGreaterThan(0)
    for (const size of sizes.pill) expect(size).toBeGreaterThanOrEqual(12)
    for (const found of sizes.labels) {
      expect(found.length, `${width}px ${JSON.stringify(found)}`).toBeGreaterThan(0)
      for (const hit of found) {
        expect(hit.visible, `${width}px ${hit.label}`).toBe(true)
        expect(hit.size, `${width}px ${hit.label}`).toBeGreaterThanOrEqual(12)
      }
    }
    for (const { sel, sizes: found } of sizes.prose) {
      expect(found.length, `${width}px ${sel}`).toBeGreaterThan(0)
      for (const size of found) expect(size, `${width}px ${sel}`).toBeGreaterThanOrEqual(14)
    }
  }
})

test('home measure: boundary, demo and footnote prose stay within 75ch at 1440', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewport is set explicitly')
  await localOnly(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const measures = await page.evaluate(() => {
    const out: { sel: string, width: number, limit: number }[] = []
    for (const sel of ['.hero__status', '.cin-demo .demo__panel.is-on p', '.cin-footnote p']) {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const probe = document.createElement('span')
        probe.style.cssText = 'display:block;width:75ch;height:0;position:absolute;visibility:hidden'
        el.appendChild(probe)
        const limit = probe.getBoundingClientRect().width
        probe.remove()
        const cs = getComputedStyle(el)
        out.push({ sel, width: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), limit })
      }
    }
    return out
  })
  expect(measures.length).toBeGreaterThanOrEqual(5)
  for (const m of measures) expect(m.width, m.sel).toBeLessThanOrEqual(m.limit)
})

test('home mobile targets: arrow links and the Play scene control are at least 44px tall at 375', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewport is set explicitly')
  await localOnly(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(page.locator('[data-cinematic-toggle]')).toBeVisible()
  const heights = await page.locator('.cin-text-link, .cin-motion').evaluateAll((els) =>
    els.filter((el) => el.checkVisibility()).map((el) => ({ text: el.textContent?.trim(), height: el.getBoundingClientRect().height })))
  expect(heights.length).toBeGreaterThanOrEqual(8)
  for (const h of heights) expect(h.height, h.text).toBeGreaterThanOrEqual(44)
})
