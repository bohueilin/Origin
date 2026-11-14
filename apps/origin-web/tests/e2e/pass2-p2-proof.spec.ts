import { test, expect, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Pass 2 Phase 2 — proof
// /proof explains itself to a visitor who does not click. A static figure in the hero shows
// the evidence ladder, highest rung first: where each trace comes from, what is computed over
// it and what it does not establish; TR-A003 is dashed and carries no data. The TR-A002
// introduction opens with the landing line. Event 11, the scripted block, gets an ink frame
// (not a refuse colour), a tinted ground and a mono badge. Nothing in these figures moves.

const trace = JSON.parse(readFileSync(new URL('../../public/proof/tr-a002.json', import.meta.url), 'utf8')) as { event_count: number; final_digest: string }

const LANDING = 'The hash chain is real; the story it tells is scripted. Here is what each part shows.'
const LADDER_NAME = 'The evidence ladder, highest rung first'
const BADGE = 'Event 11 · turning point (scripted block in chain)'
const BLOCK_LINE = 'Event 11 is the one to inspect: the scripted agent exceeds its scope and the scripted proxy blocks it. The block is an event in the chain: editing it breaks verification or changes the final digest.'
const INK = 'rgb(39, 45, 38)' // --ink #272d26
const PAPER_3 = 'rgb(237, 241, 231)' // --paper-3 #edf1e7
const REFUSE = ['rgb(178, 58, 48)', 'rgb(209, 73, 91)'] // --danger and the old event-row red

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const ladder = (page: Page) => page.getByRole('figure', { name: LADDER_NAME })
const eventEleven = (page: Page) => page.locator('.tr2-flow li[data-seq="11"]')

test('pass 2 phase 2: the TR-A002 introduction opens with the landing line', async ({ page }) => {
  await page.goto('/proof')
  const landing = page.locator('.tr2why > p').first()
  await expect(landing).toHaveText(LANDING)
  await expect(landing).toBeVisible()
  expect(await landing.textContent()).not.toMatch(/\bproves?\b/i)
})

test('pass 2 phase 2: the evidence ladder figure states each rung\'s provenance, computation and limit', async ({ page }) => {
  await page.goto('/proof')
  const figure = ladder(page)
  await expect(figure).toBeVisible()
  const rungs = figure.locator('[data-rung]')
  await expect(rungs).toHaveCount(3)
  expect(await rungs.evaluateAll((els) => els.map((el) => el.getAttribute('data-rung')))).toEqual(['TR-A003', 'TR-A002', 'TR-A001'])

  // TR-A002: the numbers come from public/proof/tr-a002.json.
  const a002 = figure.locator('[data-rung="TR-A002"]')
  await expect(a002.locator('dt')).toHaveText(['Provenance', 'Computed', 'Does not establish'])
  await expect(a002).toContainText('Available now')
  await expect(a002).toContainText('Machine-emitted trace of a scripted scenario')
  await expect(a002).toContainText('scripts/generate-tr-a002.mjs')
  await expect(a002).toContainText(`The ${trace.event_count} events are scripted.`)
  await expect(a002).toContainText(`A SHA-256 hash chain over the ${trace.event_count} events, sealed as final digest ${trace.final_digest.slice(0, 8)}`)
  await expect(a002).toContainText('That any agent, policy gate, proxy, approver or sandbox ran. The top-level description is outside the chain.')

  // TR-A001: authored, nothing computed.
  const a001 = figure.locator('[data-rung="TR-A001"]')
  await expect(a001.locator('dt')).toHaveText(['Provenance', 'Computed', 'Does not establish'])
  await expect(a001).toContainText('Authored format specimen')
  await expect(a001).toContainText('Written by hand to the evidence-package schema.')
  await expect(a001).toContainText('Nothing. Its digest is a placeholder.')
  await expect(a001).toContainText('That anything ran. It shows the shape of a record.')

  // TR-A003: not earned, dashed, no data.
  const a003 = figure.locator('[data-rung="TR-A003"]')
  await expect(a003).toContainText('First external design-partner trace')
  await expect(a003).toContainText('Not earned yet')
  await expect(a003.locator('dl, dt, dd')).toHaveCount(0)
  expect(await a003.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed')
  expect(await figure.textContent()).not.toMatch(/\bproves?\b/i)

  // The existing proof-status ladder and rung cards keep their strings.
  const status = page.locator('.proofladder')
  await expect(status).toHaveAttribute('aria-label', 'Proof-status ladder')
  await expect(status).toContainText('Authored specimen, shows the evidence-package format.')
  await expect(status).toContainText('Machine-emitted from a scripted scenario: a real, re-verifiable SHA-256 hash chain.')
  await expect(status).toContainText('First external design-partner trace.')
  await expect(status.locator('.proofladder__status')).toHaveText(['Available', 'Available', 'Not earned yet'])
  await expect(page.locator('#ladder .rung h3')).toHaveText(['Authored evidence specimen', 'Machine-emitted trace of a scripted scenario', 'First design-partner trace'])
})

test('pass 2 phase 2: the ladder fills the hero\'s right column at 1280 px and follows the hero copy at 375 px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/proof')
  let copy = (await page.locator('.editorial-hero__grid > div').first().boundingBox())!
  let figure = (await ladder(page).boundingBox())!
  expect(figure.x).toBeGreaterThanOrEqual(copy.x + copy.width)
  expect(Math.abs(figure.y - copy.y)).toBeLessThanOrEqual(2)
  expect(figure.x + figure.width).toBeLessThanOrEqual(1280)

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/proof')
  copy = (await page.locator('.editorial-hero__grid > div').first().boundingBox())!
  figure = (await ladder(page).boundingBox())!
  expect(figure.y).toBeGreaterThanOrEqual(copy.y + copy.height)
  expect(figure.x).toBeGreaterThanOrEqual(0)
  expect(figure.x + figure.width).toBeLessThanOrEqual(375)
})

test('pass 2 phase 2: event 11 carries an ink frame, a tinted ground and a mono turning-point badge', async ({ page }) => {
  await page.goto('/proof')
  const row = eventEleven(page)
  const badge = row.locator('.ev__badge')
  await expect(badge).toHaveText(BADGE)
  await expect(badge).toBeVisible()
  expect(await badge.evaluate((el) => (el as HTMLElement).innerText)).toBe('EVENT 11 · TURNING POINT (SCRIPTED BLOCK IN CHAIN)')
  expect(await badge.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono/i)

  const frame = await row.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      widths: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth],
      colors: [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor],
      background: s.backgroundColor,
    }
  })
  expect(frame.widths).toEqual(['2px', '2px', '2px', '2px'])
  expect(frame.colors).toEqual([INK, INK, INK, INK])
  expect(frame.background).toBe(PAPER_3)

  // The block is scripted, so neither it, event 10 nor the block line uses a refuse colour.
  const colours = await page.locator('.tr2-flow li.is-block, .blockline, .blockline__t b').evaluateAll((els) => els.flatMap((el) => {
    const s = getComputedStyle(el)
    return [s.borderLeftColor, s.backgroundColor, s.color]
  }))
  for (const refuse of REFUSE) expect(colours).not.toContain(refuse)

  // The event text and the pinned block line are unchanged.
  await expect(row.locator('.ev__a')).toHaveText('proxy.blocked')
  await expect(row.locator('.ev__d')).toHaveText('Scripted block: the event marks the over-scope refund as blocked and never dispatched.')
  await expect(page.locator('.blockline__t')).toHaveText(BLOCK_LINE)
})

// Scripted events and static labels use ink, its tones, the line tokens, paper grounds and at
// most the one forest green. Off the palette: the old amber held rule (#d9a441), teal-green ok
// rule (#2f9e6f), blue border (#bcccff), red tile tint (#edc6c2 / #fdf5f4), amber label
// (#fbf3e0 / #ecd9ad / #8a5600), event-row red (#d1495b / #fdf1f2) and the status tokens
// --danger, --warn and --verify.
const OFF_PALETTE = ['rgb(217, 164, 65)', 'rgb(47, 158, 111)', 'rgb(188, 204, 255)', 'rgb(237, 198, 194)', 'rgb(253, 245, 244)',
  'rgb(251, 243, 224)', 'rgb(236, 217, 173)', 'rgb(138, 86, 0)', 'rgb(209, 73, 91)', 'rgb(253, 241, 242)',
  'rgb(178, 58, 48)', 'rgb(138, 88, 0)', 'rgb(15, 122, 87)']
const STATIC = '.tr2-flow li, .tr2-flow li *, .tr2-digest, .tr2-digest *, #ladder .rung, #ladder .rung *, .tr2why__tile, .tr2why__tile *, .proof__label'

test('pass 2 phase 2: scripted events and static labels on /proof use no status colour and read without colour', async ({ page }) => {
  await page.goto('/proof')
  await expect(page.locator('.tr2-flow li')).toHaveCount(trace.event_count)
  const painted = async (selector: string) => page.locator(selector).evaluateAll((els) => els.flatMap((el) => {
    const s = getComputedStyle(el)
    return [s.color, s.backgroundColor, s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor, s.fill, s.stroke]
  }))
  const colours = await painted(`${STATIC}, .evidence-diagram svg:visible text, .evidence-diagram svg:visible rect`)
  for (const off of OFF_PALETTE) expect(colours, off).not.toContain(off)

  // Without colour: held rows are dashed, approved and executed rows solid, and each row's words
  // name what the script recorded; the not-proved tile is dashed, and the unearned rung's badge
  // says so in words.
  for (const row of await page.locator('.tr2-flow li.is-held').all()) {
    expect(await row.evaluate((el) => getComputedStyle(el).borderLeftStyle)).toBe('dashed')
    await expect(row.locator('.ev__d')).toContainText(/^Scripted (verdict|hold|request)/)
  }
  for (const row of await page.locator('.tr2-flow li.is-ok').all()) expect(await row.evaluate((el) => getComputedStyle(el).borderLeftStyle)).toBe('solid')
  await expect(page.locator('.tr2-flow li.is-held')).toHaveCount(3)
  await expect(page.locator('.tr2-flow li.is-ok')).toHaveCount(3)
  const notTile = page.locator('.tr2why__tile--no')
  await expect(notTile.locator('.tr2why__q')).toHaveText('What does it not prove?')
  expect(await notTile.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed')
  await expect(page.locator('#ladder .rung').nth(2).locator('.rung__badge')).toHaveText('When earned')

  // Every text in these keeps at least 4.5:1 against the ground it sits on.
  const contrasts = await page.locator(STATIC).evaluateAll((els) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const lum = (c: number[]) => c.slice(0, 3).map((n) => n / 255).map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0)
    const ground = (el: Element | null): number[] => {
      for (let node = el; node; node = node.parentElement) {
        const c = rgb(getComputedStyle(node).backgroundColor)
        if (c.length === 3 || c[3] === 1) return c
      }
      return [248, 247, 244]
    }
    return els.filter((el) => el.getClientRects().length && [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) && !el.closest('.sr-only'))
      .map((el) => {
        const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(ground(el))]
        return { text: el.textContent!.trim().slice(0, 40), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
      })
  })
  expect(contrasts.length).toBeGreaterThan(30)
  for (const { text, ratio } of contrasts) expect(ratio, text).toBeGreaterThanOrEqual(4.5)

  // Stepping through the trace on request outlines scripted events in ink, not status colours.
  const step = page.locator('[data-trace-step]')
  for (let i = 0; i < trace.event_count; i += 1) await step.click()
  await expect(page.locator('[data-diagram="trace"] svg:visible .is-stepped[data-trace-node]')).toHaveCount(trace.event_count)
  await expect(page.locator('[data-trace-block]')).toBeVisible()
  await page.waitForTimeout(300) // the outline colour eases over 200 ms on request
  const stepped = await painted('[data-diagram="trace"] svg:visible [data-trace-node] > rect, [data-trace-block]')
  for (const off of OFF_PALETTE) expect(stepped, off).not.toContain(off)
})

// Every element in the root that renders its own text, with its font size in px.
async function renderedTextSizes(roots: Locator) {
  return roots.evaluateAll((els) => els
    .flatMap((root) => [root, ...root.querySelectorAll('*')])
    .filter((el) => el.getClientRects().length && !el.classList.contains('sr-only'))
    .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()))
    .map((el) => ({ text: el.textContent!.trim().slice(0, 48), size: parseFloat(getComputedStyle(el).fontSize) })))
}

test('pass 2 phase 2: the new figures keep rendered text at 12 px or more, with no sideways scroll at 375, 430, 980 and 1280 px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  for (const [width, height] of [[375, 812], [430, 932], [980, 800], [1280, 800]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/proof')
    await expect(ladder(page)).toBeVisible()
    await expect(eventEleven(page).locator('.ev__badge')).toBeVisible()
    const sizes = await renderedTextSizes(page.locator('.ladderfig, .tr2why__landing, .tr2-flow li[data-seq="11"]'))
    expect(sizes.length, `${width}px`).toBeGreaterThan(20)
    for (const { text, size } of sizes) expect(size, `${width}px: ${text}`).toBeGreaterThanOrEqual(12)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px page`).toBeLessThanOrEqual(0)
    expect(await ladder(page).evaluate((el) => el.scrollWidth - el.clientWidth), `${width}px figure`).toBeLessThanOrEqual(0)
    expect(await eventEleven(page).evaluate((el) => el.scrollWidth - el.clientWidth), `${width}px event 11`).toBeLessThanOrEqual(0)
  }
})

test('pass 2 phase 2: the ladder figure, the landing line and the event 11 frame are static', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/proof')
  await expect(ladder(page)).toBeVisible()
  for (const target of [ladder(page), page.locator('.tr2why__landing'), eventEleven(page)]) {
    await target.scrollIntoViewIfNeeded()
    await target.hover()
    expect(await target.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0)
    expect(await target.evaluate((el) => el.querySelectorAll('animate, animateMotion, animateTransform, set').length)).toBe(0)
    const moving = await target.evaluate((el) => [el, ...el.querySelectorAll('*')].filter((node) => {
      const s = getComputedStyle(node)
      return s.animationName !== 'none' || s.transitionDuration.split(',').some((v) => parseFloat(v) > 0)
    }).length)
    expect(moving).toBe(0)
  }
})

test('pass 2 phase 2: the hero figure loads without layout shift at 375 and 1280 px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.addInitScript(() => {
    const w = window as unknown as { __shift: number }
    w.__shift = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!entry.hadRecentInput) w.__shift += entry.value
    }).observe({ type: 'layout-shift', buffered: true })
  })
  for (const [width, height] of [[375, 812], [1280, 800]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/proof', { waitUntil: 'load' })
    await expect(ladder(page)).toBeVisible()
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => (window as unknown as { __shift: number }).__shift), `${width}px`).toBe(0)
  }
})
