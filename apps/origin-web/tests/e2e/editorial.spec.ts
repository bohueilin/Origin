import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

test('proof reports clipboard denial without claiming the command was copied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => { throw new DOMException('Clipboard access denied', 'NotAllowedError') },
      },
    })
  })
  await page.goto('/proof')
  await page.getByRole('button', { name: 'Copy the verify command' }).click()

  const status = page.locator('#copy-status')
  await expect(status).toHaveText('Copy unavailable — select the command')
  await expect(status).not.toContainText('Copied')
  // The manual recovery path remains readable after the failed enhancement.
  await expect(page.locator('.tr2-verify')).toContainText('npm run proof:verify')
})

test('brief print layout preserves its full narrative and evidence boundaries', async ({ page }, testInfo) => {
  await page.goto('/brief')
  const content = page.locator('main h1, main h2, main p:not(.brief__print-only), main li')
  const count = await content.count()
  const screenText = await content.allTextContents()
  expect(count).toBeGreaterThan(20)

  await page.emulateMedia({ media: 'print' })
  for (let i = 0; i < count; i += 1) {
    await expect(content.nth(i), `Print must retain: ${screenText[i].trim()}`).toBeVisible()
  }
  await expect(page.locator('main')).toContainText('session-signed, and unpinned')
  await expect(page.locator('main')).toContainText('Execution is not attempted')
  await expect(page.locator('main')).toContainText('not earned yet')
  await expect(page.locator('.brief__print-only')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print / Save PDF' })).toBeHidden()
  if (process.env.ORIGIN_VISUAL_QA === '1' && testInfo.project.name === 'desktop-chromium') {
    await page.pdf({ path: testInfo.outputPath('origin-brief.pdf'), preferCSSPageSize: true, printBackground: true })
  }
})

test('brief shows the founder and a contact on screen, and prints the contact once on one page', async ({ page }, testInfo) => {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/brief')
    await expect(page.locator('main'), `${width}px`).toContainText('Founder: Bo-Huei Lin')
    await expect(page.locator('main a[href="mailto:bohueilin@originphysicalai.com"]'), `${width}px`).toBeVisible()
  }

  await page.emulateMedia({ media: 'print' })
  const printed = await page.locator('main').innerText()
  expect(printed).toContain('Founder: Bo-Huei Lin')
  expect(printed.split('bohueilin@originphysicalai.com').length - 1).toBe(1)
  if (testInfo.project.name === 'desktop-chromium') {
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
    const pages = pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []
    expect(pages).toHaveLength(1)
  }
})

test('trust jump labels match their section kickers and the meta claims no unshown controls', async ({ page }) => {
  await page.goto('/trust')
  await expect(page.locator('.editorial-hero .kicker')).toHaveText('Trust & controls')
  const pairs = await page.locator('.editorial-jumps a').evaluateAll((links) => links.map((a) => {
    const n = a.querySelector('span')?.textContent ?? ''
    const label = (a.textContent ?? '').slice(n.length)
    const kicker = document.querySelector(`${a.getAttribute('href')} .kicker`)?.textContent ?? ''
    return [`${n} / ${label}`, kicker]
  }))
  expect(pairs).toHaveLength(5)
  for (const [jump, kicker] of pairs) expect(kicker).toBe(jump)
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
    await expect(page.locator(selector), selector).not.toHaveAttribute('content', /encryption|audit log/i)
  }
})

// Pass 2 Phase 3 — print
//
// /proof and /trust print in black on white. The header, navigation, buttons, calls to
// action, copy controls, recordings and dialogs are hidden, nothing is filled (pseudo-elements
// included), no text is lighter than near-black, the page does not scroll sideways, and every
// digest prints whole. /proof prints the TR-A002 final digest in full. /trust names TR-A002
// only in its gate scoreboard, as the verifier prints it (the first 12 hex characters, then
// an ellipsis), so there the test checks that line.

const TR_A002_DIGEST = 'ca1d4690206e4dcf3d654b907d02d2bccf9bcdc16ddc555071fec21874578b32'

for (const route of ['/proof', '/trust']) {
  test(`${route} prints in black on white, without interactive chrome, with every digest whole`, async ({ page }) => {
    await page.goto(route)
    const digest = route === '/proof'
      ? page.locator('.tr2-digest .mono')
      : page.locator('#gates-scoreboard tr').filter({ hasText: 'ev:proof:verify' }).locator('.gates-detail')
    const expected = route === '/proof' ? TR_A002_DIGEST : TR_A002_DIGEST.slice(0, 12)
    await expect(digest).toBeVisible()

    await page.emulateMedia({ media: 'print' })
    await expect(digest).toBeVisible()
    if (route === '/proof') await expect(digest).toHaveText(TR_A002_DIGEST)
    else await expect(digest).toContainText(expected)
    expect(await page.locator('main').innerText()).toContain(expected)
    const fit = await digest.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, overflow: getComputedStyle(el).textOverflow }))
    expect(fit.scroll, 'the digest box holds its text').toBeLessThanOrEqual(fit.client)
    expect(fit.overflow).not.toBe('ellipsis')

    const printed = await page.evaluate(() => {
      const shown = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
      const name = (el: Element) => `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''} "${(el.textContent ?? '').trim().slice(0, 40)}"`
      const clear = /^(rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\))$/
      // A box that ellipsizes, or hides or scrolls overflow while narrower than its content, clips it.
      const clips = (el: Element | null) => {
        for (; el && el !== document.body; el = el.parentElement) {
          const css = getComputedStyle(el)
          if (css.textOverflow === 'ellipsis' || (css.overflowX !== 'visible' && el.scrollWidth > el.clientWidth)) return true
        }
        return false
      }
      // The /proof download links print as plain links with their address, so they stay.
      const chrome = [...document.querySelectorAll('header, nav, button, video, dialog, .skip-link, .btn, [data-copy-wrap]')]
        .filter((el) => shown(el) && !el.closest('.tr2-dl')).map(name)
      const fills: string[] = []
      const pale: string[] = []
      for (const el of document.querySelectorAll('body *')) {
        if (!shown(el)) continue
        for (const pseudo of [null, '::before', '::after']) {
          const css = getComputedStyle(el, pseudo)
          if (pseudo && ['none', 'normal'].includes(css.content)) continue
          if (!clear.test(css.backgroundColor) || css.backgroundImage !== 'none') fills.push(`${name(el)}${pseudo ?? ''} ${css.backgroundColor} ${css.backgroundImage}`)
        }
        const ownText = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
        const [r, g, b] = (getComputedStyle(el).color.match(/\d+/g) ?? []).map(Number)
        if (el.closest('main') && ownText && Math.max(r, g, b) > 64) pale.push(`${name(el)} ${getComputedStyle(el).color}`)
      }
      const clipped: string[] = []
      const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement!
        if (/[0-9a-f]{12,}/.test(node.textContent ?? '') && !(el instanceof SVGElement) && shown(el) && clips(el)) clipped.push(name(el))
      }
      return {
        chrome, fills, pale, clipped,
        page: getComputedStyle(document.documentElement).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
        sideScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(printed.chrome, 'interactive chrome shown in print').toEqual([])
    expect(printed.fills, 'background fills in print').toEqual([])
    expect(printed.pale, 'text lighter than near-black in print').toEqual([])
    expect(printed.clipped, 'digests clipped in print').toEqual([])
    expect(printed.page).toMatch(/^(rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\))$/)
    expect(printed.body).toBe('rgb(255, 255, 255)')
    expect(printed.sideScroll, 'print layout scrolls sideways').toBeLessThanOrEqual(0)

    if (route === '/proof') {
      // The printed chain list's numbers sit outside its items; the body clips anything left of
      // its edge, so the list leaves room for the widest number ("12. ").
      const list = await page.locator('.evidence-diagram ol.sr-only').evaluate((ol) => {
        const ctx = document.createElement('canvas').getContext('2d')!
        ctx.font = getComputedStyle(ol.lastElementChild!).font
        return { items: ol.children.length, room: ol.lastElementChild!.getBoundingClientRect().left - document.body.getBoundingClientRect().left, marker: ctx.measureText(`${ol.children.length}. `).width }
      })
      expect(list.items).toBe(12)
      expect(list.room, 'room left of the list for "12. "').toBeGreaterThanOrEqual(list.marker)
      // Each download link prints the file's address after its label.
      for (const link of await page.locator('.tr2-dl a').all()) {
        await expect(link).toBeVisible()
        expect(await link.evaluate((a) => getComputedStyle(a, '::after').content)).toContain(`originphysicalai.com${await link.getAttribute('href')}`)
      }
    } else {
      // An external link prints its address: the CI definition can be found from paper.
      const ci = page.locator('main a[href$="/.github/workflows/ci.yml"]')
      expect(await ci.evaluate((a) => getComputedStyle(a, '::after').content)).toContain(await ci.getAttribute('href') ?? 'missing href')
    }

    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length).toBeGreaterThan(0)
  })
}
