import { test, expect, type Page } from '@playwright/test'

// Release 7 — the home walkthrough, rendered
// R11/N3: pressing Next (or a stage tab) never leaves the tab strip or the new stage's heading under
// the sticky header. Checked from two reading positions at 1280 × 800 and 1919 × 998: the strip
// just under the header, and the section scrolled up so the strip is already under it.
// R03/N6: from 900 to 1099 px the stage strip is a one-column list, so it has no connectors to
// squeeze; from 1100 px every connector is at least 16 px, with Avenir or a wider fallback font. No record identifier
// (subject.environment_digest and the rest) breaks anywhere but at its dot, and nothing scrolls
// sideways, at 900, 960, 1024, 1099 and 1100 px.
// R04/N2: the hero card is the one place sup-02, the $450 refund, is told. The walkthrough
// follows sup-10 and names the $450 refund once, as the same kind of miss.
// R07/N5: the hero caption calls the result "output from the live demo", not "real".

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
})

const positions = (page: Page) => page.evaluate(() => {
  const headerBottom = document.querySelector('.site-header')!.getBoundingClientRect().bottom
  const rail = document.querySelector('.demo__rail')!.getBoundingClientRect().top
  const heading = document.querySelector('.demo__panel.is-on h3')!.getBoundingClientRect().top
  return { headerBottom, rail, heading }
})

for (const [width, height] of [[1280, 800], [1919, 998]] as const) {
  for (const start of ['strip under the header', 'strip scrolled under the header'] as const) {
    test(`release 7: at ${width} px, from the ${start}, Next never clips a stage under the sticky header`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await expect(page.locator('[data-demo]')).toHaveClass(/is-enhanced/)
      await page.evaluate((start) => {
        const headerBottom = document.querySelector('.site-header')!.getBoundingClientRect().bottom
        const rail = document.querySelector('.demo__rail')!.getBoundingClientRect().top
        // 16 px below the header, or 150 px up under it.
        const offset = start === 'strip under the header' ? 16 : -150
        window.scrollTo({ top: window.scrollY + rail - headerBottom - offset, behavior: 'instant' })
      }, start)
      for (const step of [2, 3, 4, 5]) {
        await page.locator('[data-demo-next]').click()
        await expect(page.locator(`#demo-tab-${step}`)).toHaveAttribute('aria-selected', 'true')
        await expect.poll(async () => {
          const p = await positions(page)
          return Math.min(p.rail, p.heading) - p.headerBottom
        }, { message: `stage ${step}: strip and heading below the header` }).toBeGreaterThanOrEqual(8)
      }
    })
  }
}

for (const width of [900, 960, 1024, 1099, 1100]) {
  test(`release 7: at ${width} px the stage strip fits, no identifier breaks inside itself and nothing scrolls sideways`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('[data-demo]')).toHaveClass(/is-enhanced/)
    const strip = await page.evaluate(() => ({
      columns: getComputedStyle(document.querySelector('.demo__rail')!).gridTemplateColumns.split(' ').length,
      connectors: [...document.querySelectorAll<HTMLElement>('.demo__dot:not(:last-child) > i')].map((i) => getComputedStyle(i).display === 'none' ? null : i.getBoundingClientRect().width),
    }))
    if (width < 1100) {
      expect(strip.columns, 'a one-column list').toBe(1)
      expect(strip.connectors, 'no connectors drawn').toEqual([null, null, null, null])
    } else {
      expect(strip.columns).toBe(5)
      for (const w of strip.connectors) expect(w, 'connector width').toBeGreaterThanOrEqual(16)
    }
    for (let step = 1; step <= 5; step++) {
      await page.locator(`#demo-tab-${step}`).click()
      const breaks = await page.evaluate(() => {
        const out: string[] = []
        for (const el of document.querySelectorAll<HTMLElement>('.demo__dot > code, .demo__panel.is-on code, .demo__panel.is-on dt, .demo__panel.is-on dd')) {
          if (!el.getClientRects().length || getComputedStyle(el).display === 'none') continue
          const text = el.textContent ?? ''
          if (!/[._]/.test(text) || /\s/.test(text)) continue
          const range = document.createRange()
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
          let prevTop: number | null = null, prev = ''
          for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
            for (let i = 0; i < node.data.length; i++) {
              range.setStart(node, i); range.setEnd(node, i + 1)
              const t = range.getBoundingClientRect().top
              if (prevTop !== null && t > prevTop + 4 && prev !== '.') out.push(`${text} breaks after "${prev}"`)
              prevTop = t; prev = node.data[i]
            }
          }
        }
        return out
      })
      expect(breaks, `stage ${step}`).toEqual([])
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  })
}

test('release 7: the hero tells sup-02 once; the walkthrough extends it with sup-10', async ({ page }) => {
  await page.goto('/')
  const hero = page.locator('.receipt')
  await expect(hero.locator('.receipt__req')).toContainText('sup-02')
  await expect(hero.locator('.receipt__req')).toContainText('$450')
  const panels = await page.locator('[data-demo-panel]').evaluateAll((els) => els.map((el) => el.textContent ?? ''))
  const all = panels.join(' ')
  // sup-02 appears in the walkthrough only as one cell of the 12-request battery grid.
  expect(all.match(/sup-02/g) ?? []).toHaveLength(1)
  await expect(page.locator('#demo-panel-2 .panelfig__cells li:has(code:text-is("sup-02"))')).toHaveCount(1)
  // The $450 refund is named once, as the same kind of miss as the walkthrough's case.
  expect(all.match(/\$450/g) ?? []).toHaveLength(1)
  expect(panels[2]).toContain('a looser miss, the same kind as the $450 refund at the top of the page.')
  for (const i of [0, 1]) expect(panels[i]).toContain('sup-10')
})

test('release 7: the hero caption says "output from the live demo", not "real"', async ({ page }) => {
  await page.goto('/')
  const caption = page.locator('.cin-hero__bottom > span')
  await expect(caption).toHaveText('AI-generated illustration · fictional people and setting. Unlike the scene, the graded result below is output from the live demo, re-checkable in your browser.')
  await expect(caption).not.toContainText(/\breal\b/)
})
