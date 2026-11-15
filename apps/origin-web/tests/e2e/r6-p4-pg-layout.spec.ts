import { test, expect, type Locator, type Page } from '@playwright/test'

// Release 6 Phase 4 — proving-ground layout
// The docked editor now starts at 901px. Between 901 and 1023px the editor
// used to keep an older two-column layout: the grid scrolled sideways inside a narrow
// column (180px of it hidden at 901px) and the legend sat above it. Now the legend and
// a new per-fleet count share one column (.pg-floor-side) docked beside the whole grid.
// The floor header spans the top until 1100px and then joins the column; the readout sits
// directly under the grid until 1240px and then comes last in the column. The column spans
// the grid's row, the readout's row and a flexible last row, so however long it runs (six
// fleets, or a shallow 12 × 4 floor) the readout stays under the grid. Beside the grid,
// each fleet's robots are stated in words from the live floor ("Fleet 1 (forest): 2 robots
// — AMR"); on a phone the counts follow the legend, before the grid, in markup order.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
})

async function openEditor(page: Page) {
  await page.goto('/proving-ground')
  await expect(page.locator('.site-grid')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

// Layout shifts inside the build panel that no click or key caused (a hover is not input).
async function watchShifts(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __pgShifts: string[] }
    w.__pgShifts = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { hadRecentInput: boolean; sources?: { node?: Node }[] }[]) {
        if (entry.hadRecentInput) continue
        for (const source of entry.sources ?? []) {
          const el = source.node instanceof Element ? source.node : source.node?.parentElement
          if (el?.closest('.site-map-panel')) w.__pgShifts.push(el.className || el.tagName)
        }
      }
    }).observe({ type: 'layout-shift' })
  })
}
const shifts = (page: Page) => page.evaluate(() => (window as unknown as { __pgShifts: string[] }).__pgShifts)

const STARTER_COUNTS = [
  'Fleet 1 (forest): 2 robots — AMR',
  'Fleet 2 (ochre): 1 robot — humanoid',
  'Fleet 3 (plum): 1 robot — robot dog',
]

type Variant = 'starter' | 'six fleets' | '12 × 4 floor' | 'mixed fleet'
const COUNTS: Record<Variant, string[]> = {
  starter: STARTER_COUNTS,
  'six fleets': [...STARTER_COUNTS, 'Fleet 4 (rose): 1 robot — AMR', 'Fleet 5 (umber): 1 robot — AMR', 'Fleet 6 (olive): 1 robot — AMR'],
  '12 × 4 floor': ['Fleet 1 (forest): 1 robot — AMR', 'Fleet 2 (ochre): 1 robot — humanoid', 'Fleet 3 (plum): no robots, scored as robot dog'],
  'mixed fleet': ['Fleet 1 (forest): 4 robots — 2 AMRs, 1 indoor delivery robot, 1 humanoid', STARTER_COUNTS[1], STARTER_COUNTS[2]],
}

/** Builds the variant's floor from the starter. */
async function arrange(page: Page, variant: Variant) {
  if (variant === 'six fleets') {
    const add = page.getByRole('button', { name: 'Add fleet' })
    while (await add.count()) await add.click()
  }
  if (variant === '12 × 4 floor') {
    // A row that holds placed cells, or moves the scored lane, asks first; the floor keeps an
    // item and a drop, so each is allowed.
    for (let rows = 9; rows > 4; rows -= 1) {
      await page.getByRole('button', { name: 'Fewer rows', exact: true }).click()
      const confirm = page.getByRole('button', { name: /^(Remove \d+ cells? and resize|Resize)$/ })
      if (await confirm.count()) await confirm.click()
      await expect(page.locator('.floor-head-title')).toContainText(`12 wide × ${rows - 1} deep`)
    }
  }
  if (variant === 'mixed fleet') {
    // Fleet 1 and the Robot tool are active from the start.
    await page.locator('.smp-rtype-chip').filter({ hasText: 'Indoor delivery robot' }).click()
    await page.getByRole('button', { name: 'A1, empty', exact: true }).click()
    await page.locator('.smp-rtype-chip').filter({ hasText: 'Humanoid' }).click()
    await page.getByRole('button', { name: 'A2, empty', exact: true }).click()
  }
}

// The cells pointed at: on the starter floor by name, on the others by place (B4, C2, A1, F1, L4).
function hoverTargets(page: Page, variant: Variant): Locator[] {
  if (variant === 'starter') {
    return ['B4, Fleet 1 AMR robot 1', 'C2, Fleet 2 Humanoid robot 1', 'J5, Fleet 1 item I1', 'A1, empty', 'F1, hazard, off-limits to robots']
      .map((name) => page.getByRole('button', { name, exact: true }))
  }
  return [[1, 3], [2, 1], [0, 0], [5, 0], [11, 3]].map(([x, y]) => page.locator(`.site-cell[data-x="${x}"][data-y="${y}"]`))
}

const CASES: [number, Variant][] = [
  ...[901, 960, 1023, 1100, 1239].flatMap((width): [number, Variant][] => [[width, 'starter'], [width, 'six fleets'], [width, '12 × 4 floor']]),
  [901, 'mixed fleet'],
]

for (const [width, variant] of CASES) {
  test(`at ${width}px (${variant}) the legend and fleet counts dock beside the whole grid, the readout sits under it, with 44px cells, nothing overflowing and nothing moving`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openEditor(page)
    await arrange(page, variant)
    const layout = await page.locator('.pg-wrap .flow-shell').evaluate((card) => {
      const s = getComputedStyle(card)
      const outer = card.getBoundingClientRect()
      const left = outer.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft)
      const right = outer.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight)
      const box = (selector: string) => card.querySelector(selector)!.getBoundingClientRect()
      const grid = box('.site-grid')
      const docked = ['.grid-legend', '.grid-fleet-counts'].map((selector) => {
        const b = box(selector)
        return { selector, besideGrid: b.left >= grid.right, sharesGridRows: b.top < grid.bottom && b.bottom > grid.top, insideCard: b.right <= right + 0.5 }
      })
      const head = box('.floor-head')
      const legend = box('.grid-legend')
      const counts = box('.grid-fleet-counts')
      const readout = box('.grid-readout-row')
      const scroller = card.querySelector('.site-grid-scroll')!
      // Everything in the build panel outside the grid stays inside the card's content box.
      const outside = [...card.querySelectorAll('.site-map-panel *')]
        .filter((el) => !el.closest('.site-grid-scroll') && el.getClientRects().length)
        .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.left < left - 0.5 || b.right > right + 0.5) })
        .map((el) => el.className || el.tagName)
      // The docked column: no word may break mid-identifier, so nothing may break a word or
      // spill out of its box, and its text stays at 12px or more.
      const column = [...card.querySelectorAll('.grid-legend, .grid-fleet-counts')]
      const columnText = column.flatMap((root) => [root, ...root.querySelectorAll('*')])
        .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()))
      const breaking = columnText.filter((el) => { const c = getComputedStyle(el); return c.overflowWrap !== 'normal' || c.wordBreak !== 'normal' || c.hyphens === 'auto' }).map((el) => el.className || el.tagName)
      const spills = column.flatMap((root) => {
        const r = root.getBoundingClientRect()
        return [...root.querySelectorAll('*')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.left < r.left - 0.5 || b.right > r.right + 0.5) }).map((el) => el.textContent?.trim().slice(0, 30))
      })
      const smallest = Math.min(...columnText.map((el) => parseFloat(getComputedStyle(el).fontSize)))
      const rightmost = Math.max(grid.right, ...docked.map(({ selector }) => box(selector).right))
      return {
        docked,
        headAboveBoth: head.bottom <= grid.top && head.bottom <= legend.top,
        headBesideGridAboveLegend: head.left >= grid.right && head.top < grid.bottom && head.bottom <= legend.top,
        countsUnderLegend: counts.left === legend.left && counts.top >= legend.bottom && counts.top - legend.bottom <= 24,
        readoutUnderGrid: readout.top >= grid.bottom,
        readoutGap: readout.top - grid.bottom,
        readoutInGridColumn: readout.left < grid.right,
        hiddenSideways: scroller.scrollWidth - scroller.clientWidth,
        emptyBesideGrid: right - rightmost,
        outside, breaking, spills, smallest,
      }
    })
    for (const d of layout.docked) {
      // The legend starts level with the grid; the counts follow it in the same column, so on a
      // short floor or with six fleets they may run on past the grid's last row.
      const expected = d.selector === '.grid-legend' || variant === 'starter'
        ? { selector: d.selector, besideGrid: true, sharesGridRows: true, insideCard: true }
        : { selector: d.selector, besideGrid: true, sharesGridRows: d.sharesGridRows, insideCard: true }
      expect(d, d.selector).toEqual(expected)
    }
    expect(layout.countsUnderLegend).toBe(true)
    // The floor header spans the top below 1100px and joins the column from 1100px; the readout
    // sits directly under the grid below 1240px, however far the column runs past the grid.
    if (width < 1100) expect(layout.headAboveBoth).toBe(true)
    else expect(layout.headBesideGridAboveLegend).toBe(true)
    expect(layout.readoutUnderGrid).toBe(true)
    expect(layout.readoutInGridColumn).toBe(true)
    expect(layout.readoutGap).toBeLessThanOrEqual(24)
    // The whole floor shows: before, 180px (901), 147px (960) and 111px (1023) scrolled out of view.
    expect(layout.hiddenSideways).toBeLessThanOrEqual(0)
    expect(layout.emptyBesideGrid).toBeLessThanOrEqual(48)
    expect(layout.outside).toEqual([])
    expect(layout.breaking).toEqual([])
    expect(layout.spills).toEqual([])
    expect(layout.smallest).toBeGreaterThanOrEqual(12)
    const small = await page.locator('.site-cell').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).filter((b) => b.width < 44 || b.height < 44).length)
    expect(small).toBe(0)
    await expect(page.locator('.grid-fleet-counts li')).toHaveText(COUNTS[variant])
    // The readout changes with every cell pointed at; under the grid it moves nothing: its row
    // keeps its height, and the type panel below the build panel keeps its place on the page.
    await page.locator('.site-grid').scrollIntoViewIfNeeded()
    const place = () => page.evaluate(() => ({
      readoutHeight: document.querySelector('.grid-readout-row')!.getBoundingClientRect().height,
      typesTop: document.querySelector('.pg-types-panel')!.getBoundingClientRect().top + window.scrollY,
    }))
    const before = await place()
    await watchShifts(page)
    for (const cell of hoverTargets(page, variant)) {
      await cell.hover()
      expect(await place(), `after pointing at ${await cell.getAttribute('aria-label')}`).toEqual(before)
    }
    await page.waitForTimeout(300)
    expect(await shifts(page)).toEqual([])
  })
}

test('the fleet counts state the starter floor in words and follow every edit', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 900 })
  await openEditor(page)
  const counts = page.locator('.grid-fleet-counts li')
  await expect(page.locator('.grid-fleet-counts')).toHaveAttribute('aria-label', 'Robots by fleet')
  await expect(counts).toHaveText(STARTER_COUNTS)
  // The Robot tool and Fleet 1 are active from the start: a tap places an AMR in Fleet 1.
  await page.getByRole('button', { name: 'A1, empty', exact: true }).click()
  await expect(counts.first()).toHaveText('Fleet 1 (forest): 3 robots — AMR')
  // A humanoid in the same fleet: the line counts each type.
  await page.locator('.smp-rtype-chip').filter({ hasText: 'Humanoid' }).click()
  await page.getByRole('button', { name: 'A2, empty', exact: true }).click()
  await expect(counts.first()).toHaveText('Fleet 1 (forest): 4 robots — 3 AMRs, 1 humanoid')
  // A fleet with no robots is still scored as its own type, as the type panel says.
  await page.getByRole('button', { name: 'One fewer robot in fleet 3', exact: true }).click()
  await expect(counts.nth(2)).toHaveText('Fleet 3 (plum): no robots, scored as robot dog')
  // The counts add up to the floor total in the editor bar.
  await expect(page.locator('.pg-editbar .count-strip')).toContainText('5 robots')
  // Each swatch is its fleet's colour.
  const dots = await page.locator('.grid-fleet-counts-dot').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))
  expect(dots).toEqual(['rgb(43, 82, 59)', 'rgb(138, 82, 0)', 'rgb(105, 64, 163)'])
})

test('at 1280px the fleet counts dock in the column between the legend and the readout', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await openEditor(page)
  const order = await page.locator('.pg-floor').evaluate((floor) => {
    const box = (selector: string) => floor.querySelector(selector)!.getBoundingClientRect()
    const grid = box('.site-grid')
    return ['.floor-head', '.grid-legend', '.grid-fleet-counts', '.grid-readout-row'].map((selector) => {
      const b = box(selector)
      return { selector, besideGrid: b.left >= grid.right, sharesGridRows: b.top < grid.bottom && b.bottom > grid.top, top: b.top, bottom: b.bottom }
    })
  })
  for (const d of order) expect({ selector: d.selector, besideGrid: d.besideGrid, sharesGridRows: d.sharesGridRows }).toEqual({ selector: d.selector, besideGrid: true, sharesGridRows: true })
  for (let i = 1; i < order.length; i += 1) expect(order[i].top, order[i].selector).toBeGreaterThanOrEqual(order[i - 1].bottom)
  await expect(page.locator('.grid-fleet-counts li')).toHaveText(STARTER_COUNTS)
})

test('at 390px the fleet counts follow the legend, before the grid, its readout and the type panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openEditor(page)
  const tops = await page.locator('.pg-wrap').evaluate((root) => {
    const box = (selector: string) => root.querySelector(selector)!.getBoundingClientRect()
    return ['.grid-legend', '.grid-fleet-counts', '.site-grid-scroll', '.grid-readout-row', '.pg-types-panel'].map((selector) => ({ selector, top: box(selector).top, bottom: box(selector).bottom }))
  })
  for (let i = 1; i < tops.length; i += 1) expect(tops[i].top, tops[i].selector).toBeGreaterThanOrEqual(tops[i - 1].bottom)
  await expect(page.locator('.grid-fleet-counts li')).toHaveText(STARTER_COUNTS)
  const sizes = await page.locator('.grid-fleet-counts li').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)))
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(12)
})
