import { test, expect, type Locator, type Page } from '@playwright/test'

// Release 6 Phase 3 — /proof ladder drawing and /brief print floor
// /proof: the evidence ladder in the hero is a drawn figure. Each rung holds a decorative inline
// SVG (hidden from screen readers, no focus stop, no text): a node, a tie into its card and, from
// the top two rungs, the rail down to the next rung's node. TR-A003, not earned yet, is drawn
// with a dashed rect on its card's edge, a hollow node and a dashed rail and tie; the earned
// rungs' nodes, ties and rail are solid forest green. The rungs' facts stay HTML text. The
// drawing follows the cards as they wrap, with no script: at 1280, 980, 375 and 320 px and in
// print, every node sits on one rail at the card's head line and each rail ends in the next
// rung's node. It prints in black; in forced-colours mode the card's own dashed border stands in
// for the SVG outline. Nothing in it moves.
// /brief: in print the evidence boundary and the contact line rise from 9 px to 10.5 px, so no
// printed text is under 10 px, and the brief still prints on one page at Letter, A4 and its CSS
// page size.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const LADDER_NAME = 'The evidence ladder, highest rung first'
const FOREST = 'rgb(43, 82, 59)' // --signal #2b523b
const INK_SOFT = 'rgb(78, 91, 72)' // --ink-soft #4e5b48
const PAPER = 'rgb(248, 247, 244)' // --paper #f8f7f4
const BLACK = 'rgb(0, 0, 0)'
const WHITE = 'rgb(255, 255, 255)'
const BOUNDARY = 'The public demo is browser-local, synthetic, session-signed, and unpinned (signed with a key your browser makes for that run, with no published key it must match). Execution is not attempted. Not production SaaS or compliance certification.'
const CONTACT = 'Try: originphysicalai.com/reference-check · Evidence: originphysicalai.com/proof · Trust: originphysicalai.com/trust · Contact: bohueilin@originphysicalai.com'

const ladder = (page: Page) => page.getByRole('figure', { name: LADDER_NAME, exact: true })

type Box = { left: number, right: number, top: number, bottom: number, cx: number, cy: number, h: number }
type Rung = { rung: string, card: Box, node: Box, tie: Box, rail: Box | null, outline: Box | null }

// Each rung's card and the drawn parts in it, as laid out (an SVG line's box is its geometry).
const drawing = (figure: Locator) => figure.evaluate((fig): Rung[] => {
  const box = (el: Element | null): Box | null => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, h: r.height }
  }
  return [...fig.querySelectorAll('[data-rung]')].map((li) => ({
    rung: li.getAttribute('data-rung') ?? '',
    card: box(li)!,
    node: box(li.querySelector('.ladderfig__node'))!,
    tie: box(li.querySelector('.ladderfig__tie'))!,
    rail: box(li.querySelector('.ladderfig__rail')),
    outline: box(li.querySelector('.ladderfig__outline rect')),
  }))
})

// Every node on one rail, at its card's head line, tied to its card; each rail runs from its
// node into the next rung's node; TR-A003's dashed stroke (1.5 px, centred 0.75 px inside its
// rect) ends on the card's edge.
function expectDrawnInPlace(rungs: Rung[], at: string) {
  expect(rungs.map((r) => r.rung), at).toEqual(['TR-A003', 'TR-A002', 'TR-A001'])
  rungs.forEach((r, i) => {
    const where = `${at}: ${r.rung}`
    expect(Math.abs(r.node.cx - rungs[0].node.cx), `${where} node on the rail`).toBeLessThanOrEqual(0.5)
    expect(r.node.right, `${where} node in the gutter`).toBeLessThan(r.card.left)
    expect(r.node.cy - r.card.top, `${where} node at the head line`).toBeGreaterThanOrEqual(20)
    expect(r.node.cy - r.card.top, `${where} node at the head line`).toBeLessThanOrEqual(30)
    expect(Math.abs(r.tie.cy - r.node.cy), `${where} tie level with the node`).toBeLessThanOrEqual(0.5)
    expect(r.tie.left, `${where} tie starts at the node`).toBeGreaterThanOrEqual(r.node.right - 0.5)
    expect(Math.abs(r.tie.right - r.card.left), `${where} tie meets the card`).toBeLessThanOrEqual(1)
    const next = rungs[i + 1]
    if (!next) {
      expect(r.rail, `${where} has no rail below it`).toBeNull()
      return
    }
    expect(r.rail, `${where} rail`).not.toBeNull()
    expect(Math.abs(r.rail!.cx - r.node.cx), `${where} rail on the nodes' line`).toBeLessThanOrEqual(0.5)
    expect(Math.abs(r.rail!.top - r.node.cy), `${where} rail starts at its node`).toBeLessThanOrEqual(0.5)
    expect(Math.abs(r.rail!.bottom - next.node.cy), `${where} rail ends in ${next.rung}'s node`).toBeLessThanOrEqual(next.node.h / 2)
  })
  const [a003, ...earned] = rungs
  for (const r of earned) expect(r.outline, `${at}: ${r.rung} has no drawn outline`).toBeNull()
  const o = a003.outline!
  expect(o, `${at}: TR-A003 outline`).not.toBeNull()
  for (const inset of [o.left - a003.card.left, a003.card.right - o.right, o.top - a003.card.top, a003.card.bottom - o.bottom]) {
    expect(Math.abs(inset - 0.75), `${at}: TR-A003 outline on the card's edge`).toBeLessThanOrEqual(0.5)
  }
}

// The painted stroke, fill and dash of each drawn part, per rung.
const paint = (figure: Locator) => figure.locator('[data-rung]').evaluateAll((items) => items.map((li) => {
  const css = (selector: string) => {
    const el = li.querySelector(selector)
    if (!el) return null
    const s = getComputedStyle(el)
    return { stroke: s.stroke, fill: s.fill, dashed: s.strokeDasharray !== 'none' }
  }
  return { rung: li.getAttribute('data-rung'), node: css('.ladderfig__node'), tie: css('.ladderfig__tie'), rail: css('.ladderfig__rail'), outline: css('.ladderfig__outline rect') }
}))

test('release 6 phase 3: the /proof ladder draws its nodes, rail and TR-A003 outline in SVG, and its facts stay text', async ({ page }) => {
  await page.goto('/proof')
  const figure = ladder(page)
  await expect(figure).toBeVisible()

  // Three nodes, three ties, two rail segments and one dashed outline, drawn; no text in them.
  await expect(figure.locator('svg circle.ladderfig__node')).toHaveCount(3)
  await expect(figure.locator('svg line.ladderfig__tie')).toHaveCount(3)
  await expect(figure.locator('svg line.ladderfig__rail')).toHaveCount(2)
  await expect(figure.locator('svg rect')).toHaveCount(1)
  await expect(figure.locator('[data-rung="TR-A003"] svg.ladderfig__outline rect')).toHaveCount(1)
  await expect(figure.locator('[data-rung="TR-A001"] .ladderfig__rail')).toHaveCount(0)
  await expect(figure.locator('svg text, svg foreignObject')).toHaveCount(0)
  expect(await figure.locator('svg').evaluateAll((svgs) => svgs.map((svg) => svg.textContent!.trim()).join(''))).toBe('')

  // Decorative: hidden from screen readers, no focus stop; the figure still reads as a list of
  // three rungs with their facts as HTML text.
  const svgs = figure.locator('svg')
  await expect(svgs).toHaveCount(4)
  for (const svg of await svgs.all()) {
    await expect(svg).toHaveAttribute('aria-hidden', 'true')
    await expect(svg).toHaveAttribute('focusable', 'false')
    expect(await svg.getAttribute('tabindex')).toBeNull()
  }
  await expect(figure.getByRole('img')).toHaveCount(0)
  await expect(figure.getByRole('listitem')).toHaveCount(3)
  const a002 = figure.locator('[data-rung="TR-A002"]')
  await expect(a002.locator('dt')).toHaveText(['Provenance', 'Computed', 'Does not establish'])
  await expect(a002.locator('dd').nth(1)).toContainText('A SHA-256 hash chain over the 12 events')
  await expect(figure.locator('[data-rung="TR-A003"]')).toContainText('Not earned yet')

  // Without colour, dashed means not earned: TR-A003's outline, tie and rail are dashed and its
  // node hollow, in ink-soft; the earned rungs are solid forest green.
  expect(await paint(figure)).toEqual([
    {
      rung: 'TR-A003',
      node: { stroke: INK_SOFT, fill: PAPER, dashed: false },
      tie: { stroke: INK_SOFT, fill: expect.any(String), dashed: true },
      rail: { stroke: INK_SOFT, fill: expect.any(String), dashed: true },
      outline: { stroke: INK_SOFT, fill: 'none', dashed: true },
    },
    {
      rung: 'TR-A002',
      node: { stroke: FOREST, fill: FOREST, dashed: false },
      tie: { stroke: FOREST, fill: expect.any(String), dashed: false },
      rail: { stroke: FOREST, fill: expect.any(String), dashed: false },
      outline: null,
    },
    {
      rung: 'TR-A001',
      node: { stroke: FOREST, fill: FOREST, dashed: false },
      tie: { stroke: FOREST, fill: expect.any(String), dashed: false },
      rail: null,
      outline: null,
    },
  ])
  // The outline is visible; the card's border under it is transparent on screen.
  await expect(figure.locator('.ladderfig__outline')).toBeVisible()
  expect(await figure.locator('[data-rung="TR-A003"]').evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)')

  // Still: no animation, no SMIL.
  expect(await figure.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0)
  await expect(figure.locator('animate, animateMotion, animateTransform, set')).toHaveCount(0)
})

test('release 6 phase 3: the /proof ladder drawing follows its cards at 1280, 980, 375 and 320 px and in print', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  for (const [width, height] of [[1280, 800], [980, 800], [375, 812], [320, 800]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/proof')
    const figure = ladder(page)
    await expect(figure).toBeVisible()
    expectDrawnInPlace(await drawing(figure), `${width}px`)
    // The drawing stays inside the figure and the page.
    const spill = await figure.evaluate((fig) => {
      const f = fig.getBoundingClientRect()
      return [...fig.querySelectorAll('svg')].filter((svg) => {
        const r = svg.getBoundingClientRect()
        return r.left < f.left - 0.5 || r.right > f.right + 0.5
      }).length
    })
    expect(spill, `${width}px`).toBe(0)
    expect(await figure.evaluate((el) => el.scrollWidth - el.clientWidth), `${width}px figure`).toBeLessThanOrEqual(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px page`).toBeLessThanOrEqual(0)
  }

  // In print the same drawing is laid out in place and painted black on white.
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/proof')
  await page.emulateMedia({ media: 'print' })
  const figure = ladder(page)
  await expect(figure.locator('.ladderfig__draw').first()).toBeVisible()
  expectDrawnInPlace(await drawing(figure), 'print')
  const printed = await paint(figure)
  for (const rung of printed) {
    for (const part of [rung.node, rung.tie, rung.rail, rung.outline]) if (part) expect(part.stroke, `print ${rung.rung}`).toBe(BLACK)
  }
  expect(printed.map((rung) => rung.node!.fill)).toEqual([WHITE, BLACK, BLACK])
  expect(printed[0].outline).toEqual({ stroke: BLACK, fill: 'none', dashed: true })
})

test('release 6 phase 3: in forced-colours mode the TR-A003 card shows its own dashed border and the drawing takes system colours', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/proof')
  const figure = ladder(page)
  await expect(figure).toBeVisible()
  await expect(figure.locator('.ladderfig__outline')).toBeHidden()
  const border = await figure.locator('[data-rung="TR-A003"]').evaluate((el) => ({ style: getComputedStyle(el).borderTopStyle, color: getComputedStyle(el).borderTopColor }))
  expect(border.style).toBe('dashed')
  expect(border.color).not.toBe('rgba(0, 0, 0, 0)')
  const parts = await paint(figure)
  for (const rung of parts) {
    for (const part of [rung.node, rung.tie, rung.rail]) if (part) expect([FOREST, INK_SOFT], `forced colours ${rung.rung}`).not.toContain(part.stroke)
  }
  expect(parts[1].node!.fill).not.toBe(FOREST)
})

test('release 6 phase 3: /brief prints its boundary and contact lines at 10.5 px, nothing under 10 px, on one page', async ({ page }, testInfo) => {
  await page.goto('/brief')
  const boundary = page.locator('main .brief__boundary')
  const contact = page.locator('main .brief__print-only')
  await expect(boundary).toHaveText(BOUNDARY)
  await expect(contact).toBeHidden()
  // The screen is unchanged: the boundary stays at 14 px.
  expect(await boundary.evaluate((el) => getComputedStyle(el).fontSize)).toBe('14px')

  await page.emulateMedia({ media: 'print' })
  await expect(contact).toBeVisible()
  await expect(contact).toHaveText(CONTACT)
  await expect(boundary).toBeVisible()
  for (const line of [boundary, contact]) expect(await line.evaluate((el) => getComputedStyle(el).fontSize)).toBe('10.5px')

  // Every visible printed word on the page, the figure, cards and footer included.
  const sizes = await page.locator('body').evaluate((root) => {
    const found: { text: string, px: number }[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement
      const text = node.textContent?.trim()
      if (el && text && el.checkVisibility()) found.push({ text: text.slice(0, 48), px: parseFloat(getComputedStyle(el).fontSize) })
    }
    return found
  })
  expect(sizes.length).toBeGreaterThan(60)
  expect(sizes.filter((s) => s.px < 10)).toEqual([])

  if (testInfo.project.name === 'desktop-chromium') {
    // page.pdf prints with print media; one page at Letter, A4 and the CSS page size.
    await page.emulateMedia({ media: null })
    for (const options of [{ format: 'Letter' }, { format: 'A4' }, { preferCSSPageSize: true }]) {
      const pdf = await page.pdf({ ...options, printBackground: true })
      expect(pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? [], JSON.stringify(options)).toHaveLength(1)
    }
  }
})
