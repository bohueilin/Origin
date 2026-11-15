import { test, expect, type Locator, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'

// Release 6 Phase 2 — tool heroes: /over-grant, /security, /proof
// From 960 px each hero is a two-column poster: copy on the left (about 55%), a specimen on the
// right (about 45%) beside the H1; phones keep one column with the specimen after the copy.
// /over-grant's specimen is a drawn meter of the recorded run's granted versus exercised scopes,
// to scale, with its numbers recomputed here from @origin/verifier-core. /security's is an index
// card of its six experiments, named as the mounted cards name them, that says to start at 04 or
// 05. /proof keeps its ladder on the right and gains a compact TR-A002 card under the hero
// buttons, with facts from public/proof/tr-a002.json and the page's own re-check commands
// (download the published JSON, then verify it). The /over-grant meter's names and numbers are
// HTML rows that wrap rather than collide at 320, 375 and 430 px, with WCAG text spacing too.
// The specimens are still, hold no focus stop, render text at 12 px or more, and nothing shifts
// as the page loads.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const trace = JSON.parse(readFileSync(new URL('../../public/proof/tr-a002.json', import.meta.url), 'utf8')) as { event_count: number; final_digest: string }
const VERIFY_COMMAND = 'node scripts/verify-tr-a002.mjs tr-a002.json'
// The script reads the file it is given, so the published JSON is downloaded first.
const DOWNLOAD_COMMAND = 'curl -sO https://originphysicalai.com/proof/tr-a002.json'
const METER = 'Authority held versus exercised, the recorded run'
const FOREST = 'rgb(43, 82, 59)' // --signal #2b523b

const HEROES = [
  { route: '/over-grant', h1: '#og-title', specimen: '.product-hero .og-meter', container: '.product-hero > .shell', copyEnd: '.product-hero__links' },
  { route: '/security', h1: '#security-title', specimen: '.product-hero .sec-index', container: '.product-hero > .shell', copyEnd: '.product-hero__scope' },
  { route: '/proof', h1: '#proof-title', specimen: '.editorial-hero .ladderfig', container: '.editorial-hero__grid', copyEnd: '.editorial-hero__grid > div' },
] as const

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  expect(found, 'element is laid out').not.toBeNull()
  return found!
}

// The container's width inside its padding.
const contentWidth = (locator: Locator) => locator.evaluate((el) => {
  const s = getComputedStyle(el)
  return el.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
})

// Every visible text node under the root (SVG text included): its rendered size, plus running
// animations, SMIL elements and focus stops.
async function audit(root: Locator) {
  return root.evaluate((el) => {
    const small: string[] = []
    let texts = 0
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const parent = node.parentElement!
      if (!node.textContent!.trim() || parent.closest('.sr-only') || !parent.getClientRects().length) continue
      texts++
      if (parseFloat(getComputedStyle(parent).fontSize) < 12) small.push(node.textContent!.trim())
    }
    return {
      texts,
      small,
      animations: el.getAnimations({ subtree: true }).length,
      smil: el.querySelectorAll('animate, animateTransform, animateMotion, set').length,
      focusable: el.querySelectorAll('a, button, input, select, textarea, summary, [tabindex]').length,
    }
  })
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)

// The /over-grant meter's words as drawn: each row's name and number, and the never-exercised
// line, measured as rendered text (a Range), with the chart's box they must stay inside.
const meterWords = (meter: Locator) => meter.evaluate((el) => {
  const box = (node: Element) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    const r = range.getBoundingClientRect()
    return { text: node.textContent!.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  }
  const c = el.querySelector('.og-meter__chart')!.getBoundingClientRect()
  const rows = [...el.querySelectorAll('.og-meter__row')].map((row) => ({ name: box(row.querySelector('span')!), number: box(row.querySelector('[data-meter]')!) }))
  return { chart: { left: c.left, right: c.right }, rows, never: box(el.querySelector('[data-meter="never"]')!) }
})

// No name runs into its number, and no word leaves the chart.
async function expectMeterLegible(meter: Locator, at: string) {
  const { chart, rows, never } = await meterWords(meter)
  expect(rows.map((row) => row.name.text), at).toEqual(['Granted at window start', 'Exercised in the window'])
  for (const { name, number } of rows) {
    const apart = name.right <= number.left || name.bottom <= number.top
    expect(apart, `${at}: "${name.text}" and "${number.text}" do not overlap`).toBe(true)
  }
  for (const word of [...rows.flatMap((row) => [row.name, row.number]), never]) {
    expect(word.left, `${at}: "${word.text}" inside the chart`).toBeGreaterThanOrEqual(chart.left - 0.5)
    expect(word.right, `${at}: "${word.text}" inside the chart`).toBeLessThanOrEqual(chart.right + 0.5)
  }
}

for (const hero of HEROES) {
  test(`release 6 phase 2: the ${hero.route} hero is two columns from 960 px and one column at 375 px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
    for (const [width, height] of [[1919, 998], [1280, 720], [960, 800]]) {
      await page.setViewportSize({ width, height })
      await page.goto(hero.route)
      const at = `${hero.route} at ${width}px`
      const h1 = await box(page.locator(hero.h1))
      const specimen = await box(page.locator(hero.specimen))
      // Right of the H1 box and beside it, not under it.
      expect(specimen.x, at).toBeGreaterThanOrEqual(h1.x + h1.width)
      expect(specimen.y, at).toBeLessThan(h1.y + h1.height)
      expect(specimen.x + specimen.width, at).toBeLessThanOrEqual(width)
      // The right column takes about 45% of the hero's width (the gap takes the rest).
      const share = specimen.width / await contentWidth(page.locator(hero.container))
      expect(share, at).toBeGreaterThan(0.38)
      expect(share, at).toBeLessThan(0.48)
      expect(await overflow(page), at).toBe(false)
    }
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(hero.route)
    const copyEnd = await box(page.locator(hero.copyEnd).first())
    const specimen = await box(page.locator(hero.specimen))
    expect(specimen.y, `${hero.route} at 375px`).toBeGreaterThanOrEqual(copyEnd.y + copyEnd.height)
    expect(specimen.x).toBeGreaterThanOrEqual(0)
    expect(specimen.x + specimen.width).toBeLessThanOrEqual(375)
    expect(await overflow(page), `${hero.route} at 375px`).toBe(false)
    const result = await audit(page.locator(hero.specimen))
    expect(result.texts).toBeGreaterThan(5)
    expect(result.small, `${hero.route} at 375px`).toEqual([])
    expect(result.animations).toBe(0)
    expect(result.smil).toBe(0)
  })
}

test('release 6 phase 2: the /over-grant meter draws the recorded run to scale, in real text', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  // The recorded run's clean fleet, as src/overgrant/recordedFigures.test.ts recomputes it.
  const { analyzeOverGrant, generateCorpus } = await import('@origin/verifier-core/overGrant')
  const clean = generateCorpus({ seed: 20260818, roots: 400, depth: 4, violationRate: 0 })
  const { gur } = analyzeOverGrant(clean).metrics
  const never = gur.scopesGranted - gur.scopesExercised
  expect([gur.scopesGranted, gur.scopesExercised, never]).toEqual([8675, 3194, 5481])
  const fmt = (n: number) => n.toLocaleString('en-US')
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  expect(pct(gur.overGrantSurface)).toBe('63.2%')

  for (const [width, height] of [[1919, 998], [1280, 720], [430, 932], [375, 812], [320, 800]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/over-grant')
    const at = `/over-grant at ${width}px`
    const meter = page.locator('.product-hero').getByRole('figure', { name: METER, exact: true })
    await expect(meter).toBeVisible()
    await expect(meter.locator('[data-meter="never-share"]')).toHaveText(pct(gur.overGrantSurface))
    await expect(meter).toContainText(`${pct(gur.overGrantSurface)} of granted scopes were never exercised in the ${clean.windowDays}-day window.`)
    await expect(meter.locator('[data-meter="granted"]')).toHaveText(fmt(gur.scopesGranted))
    await expect(meter.locator('[data-meter="exercised"]')).toHaveText(`${fmt(gur.scopesExercised)} · ${pct(gur.fleetGur)}`)
    await expect(meter.locator('[data-meter="never"]')).toHaveText(`${fmt(never)} never exercised · ${pct(gur.overGrantSurface)}`)
    await expect(meter).toContainText(`Seed 20260818 · 400 roots · ${fmt(clean.identities.length)} synthetic identities.`)
    await expect(meter).toContainText('not a customer deployment')
    await expect(meter.getByRole('img')).toHaveAccessibleName(
      `Granted at window start: ${fmt(gur.scopesGranted)} scopes. Exercised in the window: ${fmt(gur.scopesExercised)}, ${pct(gur.fleetGur)}. Never exercised: ${fmt(never)}, ${pct(gur.overGrantSurface)}.`)

    // Proportional geometry: both bars share one scale and the remainder closes the granted bar.
    const granted = await box(meter.locator('[data-meter-bar="granted"]'))
    const used = await box(meter.locator('[data-meter-bar="exercised"]'))
    const rest = await box(meter.locator('[data-meter-bar="never"]'))
    expect(Math.abs(used.width / granted.width - gur.fleetGur), at).toBeLessThanOrEqual(0.01)
    expect(Math.abs(rest.width / granted.width - gur.overGrantSurface), at).toBeLessThanOrEqual(0.01)
    expect(Math.abs(used.x - granted.x), at).toBeLessThanOrEqual(1)
    expect(Math.abs(rest.x - (used.x + used.width)), at).toBeLessThanOrEqual(1)
    expect(Math.abs(rest.x + rest.width - (granted.x + granted.width)), at).toBeLessThanOrEqual(1)
    // The bars are drawn in CSS pixels (no viewBox). The labels are HTML rows above the bars, so
    // a name and its number wrap rather than collide (at 320 px the number drops under its name).
    const drawings = meter.locator('svg')
    await expect(drawings).toHaveCount(2)
    for (const svg of await drawings.all()) {
      expect(await svg.getAttribute('viewBox')).toBeNull()
      await expect(svg).toHaveAttribute('aria-hidden', 'true')
    }
    await expect(meter.locator('svg text')).toHaveCount(0)
    await expectMeterLegible(meter, at)
    const result = await audit(meter)
    expect(result.small, at).toEqual([])
    expect(result.animations, at).toBe(0)
    expect(result.smil, at).toBe(0)
    // No focus stop: the keyboard still goes from the hero links straight to the 05 panel.
    expect(result.focusable, at).toBe(0)
  }

  // WCAG 1.4.12 text spacing on the narrow widths: the words still do not collide or spill.
  for (const [width, height] of [[375, 812], [320, 800]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/over-grant')
    await page.addStyleTag({ content: '.og-meter * { letter-spacing: .12em !important; word-spacing: .16em !important; line-height: 1.5 !important; }' })
    await expectMeterLegible(page.locator('.product-hero .og-meter'), `/over-grant at ${width}px, text spacing`)
  }
})

test('release 6 phase 2: the /security hero card indexes the six experiments and says where to start', async ({ browser, baseURL, page }) => {
  await page.goto('/security')
  const card = page.locator('.product-hero .sec-index')
  await expect(card).toBeVisible()
  await expect(card.locator('.sec-index__cap')).toHaveText('Six experiments on this page')
  await expect(card.locator('.sec-index__start')).toHaveText('Start here: 04 · Configuration binding or 05 · Delegated authority.')
  await expect(card.getByRole('list', { name: 'Six experiments on this page' }).locator('li')).toHaveCount(6)

  // Numbers, names and order are the mounted experiment cards' own kickers.
  await expect(page.locator('#signatures')).toBeVisible()
  const kickers = await page.locator('article.sec-card').evaluateAll((cards) => cards.map((c) => c.querySelector('.kicker')!.textContent!.trim()))
  expect(kickers).toHaveLength(6)
  const rows = card.locator('ol > li')
  const named = await rows.evaluateAll((items) => items.map((li) => `${li.querySelector('.sec-index__n')!.textContent} · ${li.querySelector('.sec-index__name')!.textContent}`))
  expect(named).toEqual(kickers)

  // 04 and 05 are marked by words, weight and a green rule; each gives its card's title.
  const start = card.locator('li.is-start')
  expect(await start.evaluateAll((items) => items.map((li) => li.querySelector('.sec-index__n')!.textContent))).toEqual(['04', '05'])
  await expect(start.locator('.sec-index__why')).toHaveText([
    (await page.locator('#config-binding h2').textContent())!,
    (await page.locator('#delegation h2').textContent())!,
  ])
  const look = await rows.evaluateAll((items) => items.map((li) => ({
    start: li.classList.contains('is-start'),
    weight: getComputedStyle(li.querySelector('.sec-index__name')!).fontWeight,
    rule: `${getComputedStyle(li).borderLeftWidth} ${getComputedStyle(li).borderLeftColor}`,
  })))
  for (const row of look) {
    if (row.start) expect(row).toEqual({ start: true, weight: '700', rule: `3px ${FOREST}` })
    else expect(row.weight).not.toBe('700')
  }
  const result = await audit(card)
  expect(result.focusable).toBe(0)
  expect(result.animations).toBe(0)

  // The card is static: it reads the same without JavaScript.
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const noJs = await context.newPage()
    await noJs.route('**/*', (route) => {
      const url = new URL(route.request().url())
      return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort('blockedbyclient')
    })
    await noJs.goto(`${baseURL}/security`)
    await expect(noJs.locator('.product-hero .sec-index .sec-index__start')).toHaveText('Start here: 04 · Configuration binding or 05 · Delegated authority.')
    expect(await noJs.locator('.product-hero .sec-index ol > li').evaluateAll((items) => items.map((li) => `${li.querySelector('.sec-index__n')!.textContent} · ${li.querySelector('.sec-index__name')!.textContent}`))).toEqual(kickers)
  } finally {
    await context.close()
  }
})

test('release 6 phase 2: a TR-A002 card under the /proof hero buttons balances the ladder', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  // The commands it gives are the page's own full block: a download of the published JSON, then
  // a real script in this app that reads the file it is given (no tr-a002.json sits in the app).
  expect(existsSync(new URL('../../scripts/verify-tr-a002.mjs', import.meta.url))).toBe(true)
  expect(readFileSync(new URL('../../scripts/verify-tr-a002.mjs', import.meta.url), 'utf8')).toContain('const FILE = process.argv[2] ||')
  expect(existsSync(new URL('../../tr-a002.json', import.meta.url))).toBe(false)
  expect(existsSync(new URL('../../public/proof/tr-a002.json', import.meta.url))).toBe(true)
  const facts = `${trace.event_count} scripted events · SHA-256 hash chain · final_digest ${trace.final_digest.slice(0, 12)}…`
  expect(facts).toBe('12 scripted events · SHA-256 hash chain · final_digest ca1d4690206e…')

  for (const [width, height] of [[1919, 998], [1280, 720], [375, 812]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/proof')
    const at = `/proof at ${width}px`
    const copy = page.locator('.editorial-hero__grid > div').first()
    const card = copy.getByRole('group', { name: 'TR-A002 · trace of a scripted scenario', exact: true })
    await expect(card).toBeVisible()
    await expect(card.locator('.tr2-card__facts')).toHaveText(facts)
    await expect(card.locator('.tr2-card__lbl')).toHaveText("Re-check the chain in the public repository's apps/origin-web folder:")
    await expect(card.locator('.tr2-card__cmd code')).toHaveText([DOWNLOAD_COMMAND, VERIFY_COMMAND])
    await expect(page.locator('.tr2why__a code', { hasText: VERIFY_COMMAND })).toHaveCount(1)
    // The same two lines, in the same order, as the page's full verify block.
    const block = (await page.locator('.tr2-verify pre').textContent())!.split('\n')
    expect(block.indexOf(VERIFY_COMMAND) - block.indexOf(DOWNLOAD_COMMAND), at).toBe(1)

    // Directly under the buttons, inside the left column.
    const actions = await box(copy.locator('.editorial-actions'))
    const column = await box(copy)
    const placed = await box(card)
    expect(placed.y, at).toBeGreaterThanOrEqual(actions.y + actions.height)
    expect(placed.y - (actions.y + actions.height), at).toBeLessThanOrEqual(40)
    expect(Math.abs(placed.x - column.x), at).toBeLessThanOrEqual(1)
    expect(placed.x + placed.width, at).toBeLessThanOrEqual(column.x + column.width + 1)
    if (width >= 960) {
      // The left column now ends level with the ladder on the right (it used to stop ~150 px short).
      const ladder = await box(page.locator('.editorial-hero .ladderfig'))
      expect(Math.abs(column.y + column.height - (ladder.y + ladder.height)), at).toBeLessThanOrEqual(48)
    }
    const result = await audit(card)
    expect(result.small, at).toEqual([])
    expect(result.focusable, at).toBe(0)
    expect(result.animations, at).toBe(0)
    expect(await overflow(page), at).toBe(false)
  }
})

test('release 6 phase 2: the three tool heroes load without layout shift', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.addInitScript(() => {
    const w = window as unknown as { __shift: number }
    w.__shift = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number, hadRecentInput: boolean }[]) if (!entry.hadRecentInput) w.__shift += entry.value
    }).observe({ type: 'layout-shift', buffered: true })
  })
  const mounted: Record<string, string> = { '/over-grant': '#fleet-analysis', '/security': '#signatures', '/proof': '.editorial-hero .ladderfig' }
  for (const hero of HEROES) {
    for (const [width, height] of [[1919, 998], [1280, 720], [375, 812]]) {
      await page.setViewportSize({ width, height })
      await page.goto(hero.route, { waitUntil: 'load' })
      await expect(page.locator(hero.specimen)).toBeVisible()
      await expect(page.locator(mounted[hero.route])).toBeAttached()
      await page.waitForTimeout(500)
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      expect(await page.evaluate(() => (window as unknown as { __shift: number }).__shift), `${hero.route} at ${width}px`).toBe(0)
    }
  }
})
