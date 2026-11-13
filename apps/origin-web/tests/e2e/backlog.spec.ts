import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
})

test('contact dialog traps keyboard focus, closes on Escape and returns focus', async ({ page }) => {
  await page.goto('/')
  const trigger = page.locator('[data-open-lead]').first()
  await trigger.click()
  const dialog = page.locator('#lead-modal')
  await expect(page.locator('#lead-name')).toBeFocused()
  const focusables = dialog.locator('button, input:not([type=hidden]), textarea, select, a[href]').filter({ visible: true })
  await focusables.last().focus()
  await page.keyboard.press('Tab')
  await expect(focusables.first()).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(focusables.last()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('rate-limited contact keeps the form and entered details available', async ({ page }) => {
  let calls = 0
  await page.route('**/api/lead', route => { calls++; return route.fulfill({ status: 429, headers: { 'retry-after': '600' }, json: { ok: false, error: 'rate_limited' } }) })
  await page.goto('/')
  await page.locator('[data-open-lead]').first().click()
  await page.locator('#lead-name').fill('Test Visitor')
  await page.locator('#lead-email').fill('visitor@example.test')
  await page.locator('#lead-submit').click()
  await expect(page.locator('#lead-error')).toContainText('Too many requests')
  await expect(page.locator('#lead-name')).toHaveValue('Test Visitor')
  await expect(page.locator('#lead-submit')).toBeEnabled()
  await expect(page.locator('#lead-success')).not.toBeVisible()
  expect(calls).toBe(1)
})

test('opening the contact dialog never moves focus away from a field the visitor is already in', async ({ page }) => {
  // A delayed focus call used to land on the name field after the visitor (or a test)
  // had moved on, so typed text went into the wrong field. The fake clock fires any
  // pending timers on cue instead of relying on load.
  await page.clock.install()
  await page.goto('/')
  await page.clock.pauseAt(Date.now() + 60_000)
  await page.locator('[data-open-lead]').first().click()
  await page.locator('#lead-email').focus()
  await page.clock.runFor(1000)
  await expect(page.locator('#lead-email')).toBeFocused()
  await page.keyboard.insertText('visitor@example.test')
  await expect(page.locator('#lead-email')).toHaveValue('visitor@example.test')
  await expect(page.locator('#lead-name')).toHaveValue('')
})

// ── Wave 4b: offer terms, contact lines and copy control ──
// The address and its mailto link are plain HTML on /, /trust and /proof. The copy control is
// revealed only by JavaScript where the Clipboard API exists, and its click sends no analytics.
type Page = import('@playwright/test').Page
type Locator = import('@playwright/test').Locator
const CONTACT = 'bohueilin@originphysicalai.com'
const CONTACT_LINES: [route: string, scope: string][] = [['/', '#offer'], ['/', '#contact'], ['/trust', '.editorial-closing'], ['/proof', 'main']]
const ANALYTICS_HOST = /google-analytics\.com|googletagmanager\.com|analytics\.google\.com|doubleclick\.net/
const FAILED = 'Copy unavailable — select the address'

// 'reject' refuses asynchronously, as browsers do; 'throw' refuses synchronously.
async function mockClipboard(page: Page, mode: 'resolve' | 'reject' | 'throw') {
  await page.addInitScript((mode) => {
    const writes: string[] = []
    Object.defineProperty(window, '__clipboardWrites', { value: writes })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          writes.push(text)
          const refused = new DOMException('Clipboard access denied', 'NotAllowedError')
          if (mode === 'throw') throw refused
          return mode === 'reject' ? Promise.reject(refused) : Promise.resolve()
        },
      },
    })
  }, mode)
}
const clipboardWrites = (page: Page) => page.evaluate(() => (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites)
// gtag() pushes its arguments and track() an { event } object, both to window.dataLayer.
const dataLayerEvents = (page: Page) => page.evaluate(() =>
  ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []).map((entry) => JSON.stringify(entry)))
// Scrolling the button into view can add a scroll_depth event a moment later, which is not
// from the click; wait until dataLayer stops changing, so every entry after the click counts.
async function settledDataLayer(page: Page) {
  let before = await dataLayerEvents(page)
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150)
    const now = await dataLayerEvents(page)
    if (now.length === before.length) return now
    before = now
  }
  return before
}
const contactLine = (page: Page, scope: string) => page.locator(scope).locator('p', { hasText: `Or email ${CONTACT}` })
// /proof announces through its page-wide #copy-status; / and /trust through a status in the line.
const copyStatus = (page: Page, route: string, line: Locator) => route === '/proof' ? page.locator('#copy-status') : line.getByRole('status')
async function expectLiveStatus(status: Locator) {
  await expect(status).toHaveAttribute('role', 'status')
  await expect(status).toHaveAttribute('aria-live', 'polite')
}
// Capture before a click; check after it, again once the label has returned.
async function watchAnalytics(page: Page) {
  const eventsBefore = await settledDataLayer(page)
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  return async () => {
    expect(await dataLayerEvents(page)).toEqual(eventsBefore)
    expect(requests.filter((url) => ANALYTICS_HOST.test(url))).toEqual([])
  }
}
// Freeze the page clock after load, so label timers move only with runFor.
async function freezeClock(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 500)
}

test('wave 4b: without JavaScript the contact line shows the address and a mailto on /, /trust and /proof, and no copy control', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  const page = await context.newPage()
  try {
    for (const [route, scope] of CONTACT_LINES) {
      await page.goto(`${baseURL}${route}`)
      const line = page.locator(scope).locator('p', { hasText: `Or email ${CONTACT}` })
      await expect(line, `${route} ${scope}`).toBeVisible()
      const mail = line.locator(`a[href^="mailto:${CONTACT}"]`)
      await expect(mail, `${route} ${scope}`).toBeVisible()
      await expect(mail, `${route} ${scope}`).toHaveText(CONTACT)
      await expect(line.locator('[data-copy]'), `${route} ${scope}`).toBeHidden()
      await expect(page.getByRole('button', { name: 'Copy address' }), route).toHaveCount(0)
    }
    // The #contact primary stays a mailto when JavaScript is off.
    await page.goto(`${baseURL}/`)
    await expect(page.locator(`#contact a.btn--primary[href="mailto:${CONTACT}"]`)).toBeVisible()
  } finally {
    await context.close()
  }
})

for (const clipboard of ['missing', 'without writeText'] as const) {
  test(`wave 4b: with JavaScript on and the Clipboard API ${clipboard}, no copy control appears on /, /trust and /proof`, async ({ page }) => {
    await page.addInitScript((clipboard) => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard === 'missing' ? undefined : {} })
    }, clipboard)
    for (const [route, scope] of CONTACT_LINES) {
      await page.goto(route)
      // enhance.ts has run: it marks the nav before it reaches the copy control.
      await expect(page.locator('html'), route).toHaveClass(/\bnav-bound\b/)
      const line = contactLine(page, scope)
      await expect(line.locator(`a[href^="mailto:${CONTACT}"]`), `${route} ${scope}`).toBeVisible()
      await expect(line.locator('[data-copy-wrap]'), `${route} ${scope}`).toBeHidden()
      await expect(page.getByRole('button', { name: 'Copy address' }), route).toHaveCount(0)
    }
  })
}

for (const [route, scope] of CONTACT_LINES) {
  test(`wave 4b: Copy address writes the address once, announces it and sends no analytics: ${route} ${scope}`, async ({ page }) => {
    await mockClipboard(page, 'resolve')
    await page.goto(route)
    const line = contactLine(page, scope)
    const button = line.locator('button[data-copy]')
    const status = copyStatus(page, route, line)
    await expect(button).toBeVisible()
    await expect(button).toHaveAccessibleName('Copy address')
    await expectLiveStatus(status)
    expect(await button.getAttribute('data-analytics')).toBeNull()
    await button.scrollIntoViewIfNeeded()
    const expectNoAnalytics = await watchAnalytics(page)
    const pagesBefore = page.context().pages().length

    await button.click()
    await expect(button).toHaveText('Copied ✓')
    // The name stays fixed, so a screen reader hears only the status.
    await expect(button).toHaveAccessibleName('Copy address')
    await expect(status).toHaveText('Address copied')
    if (route === '/') await expect(page.locator(scope === '#offer' ? '#contact' : '#offer').getByRole('status')).toHaveText('')
    expect(await clipboardWrites(page)).toEqual([CONTACT])
    await expectNoAnalytics()
    expect(page.context().pages()).toHaveLength(pagesBefore)
    // The label returns after about two seconds, and the status clears with it.
    await expect(button).toHaveText('Copy address', { timeout: 5_000 })
    await expect(status).toHaveText('')
    expect(await clipboardWrites(page)).toEqual([CONTACT])
    await expectNoAnalytics()
  })

  test(`wave 4b: a double click writes twice and Enter on the focused control writes once: ${route} ${scope}`, async ({ page, isMobile }) => {
    await mockClipboard(page, 'resolve')
    await page.goto(route)
    const button = contactLine(page, scope).getByRole('button', { name: 'Copy address' })
    // At 390 px on / the shorter 'Copied ✓' label moves the button up a line, so a second
    // tap at the same point misses it; there the test taps the button twice instead.
    if (isMobile) { await button.click(); await button.click() } else await button.dblclick()
    await expect(button).toHaveText('Copied ✓')
    expect(await clipboardWrites(page)).toEqual([CONTACT, CONTACT])
    await button.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => clipboardWrites(page)).toHaveLength(3)
    expect(await clipboardWrites(page)).toEqual([CONTACT, CONTACT, CONTACT])
  })

  test(`wave 4b: a second click restarts the label timer: ${route} ${scope}`, async ({ page }) => {
    await page.clock.install()
    await mockClipboard(page, 'resolve')
    await page.goto(route)
    await freezeClock(page)
    const button = contactLine(page, scope).getByRole('button', { name: 'Copy address' })
    await button.click()
    await expect(button).toHaveText('Copied ✓')
    await page.clock.runFor(1_500)
    await button.click()
    await page.clock.runFor(1_000) // 2.5 s after the first click, 1 s after the second
    await expect(button).toHaveText('Copied ✓')
    await page.clock.runFor(1_500)
    await expect(button).toHaveText('Copy address')
  })

  for (const mode of ['reject', 'throw'] as const) {
    // /proof's own inline script handles its control; the synchronous case covers enhance.ts.
    if (mode === 'throw' && route === '/proof') continue
    test(`wave 4b: a refused clipboard (${mode}) shows and announces the failure text: ${route} ${scope}`, async ({ page }) => {
      await mockClipboard(page, mode)
      await page.goto(route)
      const line = contactLine(page, scope)
      const button = line.locator('button[data-copy]')
      const status = copyStatus(page, route, line)
      await expect(button).toHaveAccessibleName('Copy address')
      await expectLiveStatus(status)
      await button.scrollIntoViewIfNeeded()
      const expectNoAnalytics = await watchAnalytics(page)
      await button.click()
      await expect(button).toHaveText(FAILED)
      await expect(button).toHaveAccessibleName('Copy address')
      await expect(status).toHaveText(FAILED)
      await expect(status).not.toContainText(/copied/i)
      expect(await clipboardWrites(page)).toEqual([CONTACT])
      await expect(line.locator(`a[href^="mailto:${CONTACT}"]`)).toHaveText(CONTACT)
      await expect(button).toHaveText('Copy address', { timeout: 5_000 })
      await expect(status).toHaveText('')
      await expectNoAnalytics()
    })
  }
}

test('wave 4b: /proof binds its copy controls once, so Copy command still writes the command exactly once', async ({ page }) => {
  await mockClipboard(page, 'resolve')
  await page.goto('/proof')
  const command = page.getByRole('button', { name: 'Copy the verify command' })
  // The page's own script marks every control it binds; enhance.ts skips marked controls.
  await expect(page.locator('[data-copy]:not([data-copy-bound])')).toHaveCount(0)
  await expect(command).toHaveAttribute('data-copy-bound', '')
  await command.click()
  await expect(command).toHaveText('Copied ✓')
  await expect(page.locator('#copy-status')).toHaveText('Copied ✓')
  expect(await clipboardWrites(page)).toEqual(['npm run proof:verify'])
  await page.getByRole('button', { name: 'Copy address' }).click()
  await expect(page.locator('#copy-status')).toHaveText('Address copied')
  expect(await clipboardWrites(page)).toEqual(['npm run proof:verify', CONTACT])
})

test('wave 4b: on /proof the address control clears only its own status message', async ({ page }) => {
  await page.clock.install()
  await mockClipboard(page, 'resolve')
  await page.goto('/proof')
  await freezeClock(page)
  const status = page.locator('#copy-status')
  const address = page.getByRole('button', { name: 'Copy address' })
  await address.click()
  await expect(status).toHaveText('Address copied')
  await page.clock.runFor(1_000)
  await page.getByRole('button', { name: 'Copy the verify command' }).click()
  await expect(status).toHaveText('Copied ✓')
  await page.clock.runFor(3_000) // both labels have returned
  await expect(address).toHaveText('Copy address')
  // The command's message stays, as it did before Wave 4b.
  await expect(status).toHaveText('Copied ✓')
})

test('wave 4b: on the home page the copy button stays where it was when its label changes', async ({ page }) => {
  await mockClipboard(page, 'resolve')
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    for (const scope of ['#offer', '#contact']) {
      const button = contactLine(page, scope).locator('button[data-copy]')
      await button.scrollIntoViewIfNeeded()
      const before = await button.boundingBox()
      await button.click()
      await expect(button).toHaveText('Copied ✓')
      const after = await button.boundingBox()
      expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0)), `${width} ${scope} x`).toBeLessThanOrEqual(1)
      expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0)), `${width} ${scope} y`).toBeLessThanOrEqual(1)
    }
  }
})
