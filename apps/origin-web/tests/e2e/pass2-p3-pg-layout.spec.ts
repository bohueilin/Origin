import { test, expect, type Page } from '@playwright/test'

// Pass 2 Phase 3 — proving-ground editor layout
// From 1024px the floor header, legend and readout dock beside the grid, so the editor
// card no longer leaves a half-empty column; a phone keeps the stacked layout. The
// primary "Inspect the result" control follows the playback (draw, watch, inspect), and
// the fleet colours come from the shared palette, which has no teal or blue.

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
}

for (const [width, height] of [[1280, 720], [1919, 998]]) {
  test(`at ${width}×${height} the floor header, legend and readout dock beside the grid`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await openEditor(page)
    const layout = await page.locator('.pg-wrap .flow-shell').evaluate((card) => {
      const s = getComputedStyle(card)
      const outer = card.getBoundingClientRect()
      const left = outer.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft)
      const right = outer.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight)
      const box = (selector: string) => card.querySelector(selector)!.getBoundingClientRect()
      const grid = box('.site-grid')
      const docked = ['.floor-head', '.grid-legend', '.grid-readout-row'].map((selector) => {
        const b = box(selector)
        return { selector, besideGrid: b.left >= grid.right, sharesGridRows: b.top < grid.bottom && b.bottom > grid.top, right: b.right }
      })
      const used = Math.max(grid.right, ...docked.map((d) => d.right)) - left
      return { docked: docked.map(({ selector, besideGrid, sharesGridRows }) => ({ selector, besideGrid, sharesGridRows })), share: used / (right - left), emptyBesideGrid: right - Math.max(grid.right, ...docked.map((d) => d.right)) }
    })
    for (const d of layout.docked) expect(d, d.selector).toEqual({ selector: d.selector, besideGrid: true, sharesGridRows: true })
    // The grid and its docked column fill the card; before, the grid's row used 56%.
    expect(layout.share).toBeGreaterThanOrEqual(0.85)
    expect(layout.emptyBesideGrid).toBeLessThanOrEqual(48)
    // Docking changes no target: every cell stays 44 × 44.
    const cells = await page.locator('.site-cell').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).filter((b) => b.width < 44 || b.height < 44).length)
    expect(cells).toBe(0)
  })
}

test('at 390px the phone keeps the stacked floor: header, legend, grid, readout, then the type panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openEditor(page)
  const tops = await page.locator('.pg-wrap').evaluate((root) => {
    const box = (selector: string) => root.querySelector(selector)!.getBoundingClientRect()
    return ['.floor-head', '.grid-legend', '.site-grid-scroll', '.grid-readout-row', '.pg-types-panel'].map((selector) => ({ top: box(selector).top, bottom: box(selector).bottom }))
  })
  for (let i = 1; i < tops.length; i += 1) expect(tops[i].top).toBeGreaterThanOrEqual(tops[i - 1].bottom)
  const box = (await page.locator('.site-cell').first().boundingBox())!
  expect(Math.round(box.width)).toBe(44)
  expect(Math.round(box.height)).toBe(44)
})

test('the inspect control comes after the playback, in the markup and on screen', async ({ page }) => {
  await openEditor(page)
  const inspect = page.getByRole('button', { name: 'Inspect the result', exact: true })
  await expect(inspect).toHaveCount(1)
  const order = await inspect.evaluate((button) => {
    const playback = document.getElementById('pg-playback')!
    const results = document.getElementById('pg-results')!
    const b = button.getBoundingClientRect()
    return {
      inEditor: !!button.closest('#pg-editor'),
      inPlayback: playback.contains(button),
      afterPlayback: !!(playback.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING),
      beforeResults: !!(results.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_PRECEDING),
      belowPlayback: b.top >= playback.getBoundingClientRect().bottom,
      aboveResults: b.bottom <= results.getBoundingClientRect().top,
    }
  })
  expect(order).toEqual({ inEditor: false, inPlayback: false, afterPlayback: true, beforeResults: true, belowPlayback: true, aboveResults: true })
  const box = (await inspect.boundingBox())!
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
  // With the button in view the results card already starts just below it, so being in view
  // proves nothing: the click itself must bring the card up the window.
  await inspect.scrollIntoViewIfNeeded()
  const resultsTop = () => page.locator('#pg-results').evaluate((el) => el.getBoundingClientRect().top)
  const before = await resultsTop()
  await inspect.click()
  await expect.poll(resultsTop).toBeLessThan(before - 100)
  await expect(page.locator('#pg-results')).toBeInViewport()
})

test('no fleet swatch uses the retired teal #1e6a52 or blue #0b637a, and the six swatches are the palette', async ({ page }) => {
  await openEditor(page)
  const addFleet = page.getByRole('button', { name: 'Add fleet' })
  while (await addFleet.count()) await addFleet.click()
  await expect(page.locator('.smp-fleet')).toHaveCount(6)
  const retired = ['rgb(30, 106, 82)', 'rgb(11, 99, 122)']
  const seen = new Set<string>()
  for (let fleet = 1; fleet <= 6; fleet += 1) {
    await page.getByRole('button', { name: `Select fleet ${fleet}`, exact: true }).click()
    const colours = await page.locator('.pg-wrap').evaluate((root) =>
      [...root.querySelectorAll('.smp-fleet, .smp-fleet-dot, .pg-editbar-dot, .smp-glyph, .smp-tool, .lg-cell, .site-cell')].flatMap((el) => {
        const s = getComputedStyle(el)
        return [s.backgroundColor, s.color, s.borderTopColor, s.getPropertyValue('--smp-c').trim()]
      }))
    for (const colour of colours) seen.add(colour.toLowerCase())
  }
  for (const colour of retired) expect(seen.has(colour), colour).toBe(false)
  expect([...seen].filter((c) => /^#(1e6a52|0b637a)$/.test(c))).toEqual([])
  // Six fleets, six different swatches: the palette's six colours, in fleet order.
  const dots = await page.locator('.smp-fleet-dot').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))
  expect(new Set(dots).size).toBe(6)
  expect(dots).toEqual(['rgb(43, 82, 59)', 'rgb(138, 82, 0)', 'rgb(105, 64, 163)', 'rgb(157, 46, 104)', 'rgb(74, 66, 56)', 'rgb(82, 94, 44)'])
})
