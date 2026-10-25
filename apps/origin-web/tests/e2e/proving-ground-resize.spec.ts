import { test, expect, type Locator, type Page } from '@playwright/test'

// Acceptance checks for the next P0 of the 2026-10-24 proving-ground re-audit:
// §3.1 resize safety (loss list, confirm, undo, ghost, the visible size range) and
// §3.2 one type hierarchy (placement tool, fleet cards, type panel and result agree).
// Runs in both projects: desktop 1280×720 and mobile 390×844.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
  await page.goto('/proving-ground')
  await expect(page.locator('.site-grid')).toBeVisible()
})

const cell = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const step = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

/** Everything a visitor could compare before and after: every labelled cell, the
 *  floor total, the size, and the oracle's episodes. */
async function floorState(page: Page) {
  return {
    cells: await page.locator('.site-cell').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label'))),
    total: await page.locator('.pg-editbar .count-strip').textContent(),
    size: await page.locator('.floor-head-title').textContent(),
    episodes: await page.locator('.pg-episode').allTextContents(),
  }
}

test('12 → 11: the loss list names each cell; cancel loses nothing; confirm, then Undo restores the exact floor', async ({ page }) => {
  const before = await floorState(page)
  await step(page, 'Fewer columns').click()

  // The loss list, grouped by kind, with coordinates, before anything changes.
  const panel = page.locator('.resize-confirm')
  await expect(panel).toContainText('Making the floor 11 × 9 removes 2 placed cells:')
  await expect(panel.locator('.resize-loss li')).toHaveText(['1 drop: D1 at L5, Fleet 1', '1 human-only cell: H2 at L2'])
  // The lane is defined in plain words where it appears, with the route before and after.
  await expect(panel.locator('.resize-lane')).toHaveText('The oracle scores one lane: the route from the start (not drawn on the grid) to the first item, then the first drop. Now it runs A5 → I1 at J5 → D1 at L5. After this resize it runs A5 → I1 at J5 → D2 at I2, so the result is re-computed.')
  // Before → after floor totals, so the visitor can compare.
  await expect(panel.locator('.resize-totals')).toHaveText('Floor total, now → after: robots 4 → 4 · fleets 3 → 3 · items 3 → 3 · drops 3 → 2 · robot types scored 3 → 3')
  // "Keep the floor as it is" has focus by default, below the site header and the stuck bar.
  const keep = page.getByRole('button', { name: 'Keep the floor as it is', exact: true })
  await expect(keep).toBeFocused()
  const keepBox = (await keep.boundingBox())!
  const bar = (await page.locator('.pg-editbar').boundingBox())!
  expect(keepBox.y).toBeGreaterThanOrEqual(bar.y + bar.height)
  await expect(page.locator('.site-cell.is-ghost-remove')).toHaveCount(9) // every cell of column L
  expect(await floorState(page)).toEqual(before) // a stepper tap alone removes nothing

  // Enter on the default button keeps the floor: Enter never confirms a removal by default.
  await page.keyboard.press('Enter')
  await expect(panel).toHaveCount(0)
  await expect(step(page, 'Fewer columns')).toBeFocused()
  expect(await floorState(page)).toEqual(before)

  // Escape is the same as Keep: nothing lost, focus back on the stepper.
  await step(page, 'Fewer columns').click()
  await expect(keep).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(step(page, 'Fewer columns')).toBeFocused()
  expect(await floorState(page)).toEqual(before)

  // Confirm: exactly those two cells go; every robot keeps its type; D2 and D3 keep their numbers.
  await step(page, 'Fewer columns').click()
  await page.getByRole('button', { name: 'Remove 2 cells and resize', exact: true }).click()
  await expect(page.locator('.floor-head-title')).toContainText('11 wide × 9 deep')
  await expect(cell(page, 'I2, Fleet 2 drop D2')).toBeVisible()
  await expect(cell(page, 'I8, Fleet 3 drop D3')).toBeVisible()
  await expect(cell(page, 'K2, human-only, reserved for people')).toBeVisible()
  for (const robot of ['B4, Fleet 1 AMR robot 1', 'B6, Fleet 1 AMR robot 2', 'C2, Fleet 2 Humanoid robot 1', 'C8, Fleet 3 Robot dog 1']) {
    await expect(cell(page, robot)).toBeVisible()
  }
  await expect(page.locator('.pg-editbar .count-strip')).toContainText('3 robot types scored')
  await expect(page.locator('.pg-episode b')).toHaveText(['AM', 'HU', 'DG'])
  // The closed panel lets the grid slide up under the pointer, and the readout follows
  // whatever the pointer is on; off the grid, it reports the resize.
  await page.mouse.move(0, 0)
  await expect(page.locator('.grid-readout')).toContainText('the resize removed H2 at L2 and D1 at L5')

  // Undo from the keyboard, on the sticky bar: the exact prior floor, including
  // types, numbers and counts, and focus back on the stepper that started it.
  const undo = page.locator('.pg-editbar').getByRole('button', { name: 'Undo resize (back to 12 × 9)', exact: true })
  await expect(undo).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await floorState(page)).toEqual(before)
  await expect(page.getByRole('button', { name: /Undo resize/ })).toHaveCount(0)
  await expect(step(page, 'Fewer columns')).toBeFocused()
  // Back to the untouched template object: Reset has nothing to reset.
  await expect(page.locator('.smp-clear')).toBeDisabled()
})

test('a removed robot is named by type and cell in the summary, so it never clashes with the renumbered fleet', async ({ page }) => {
  await step(page, 'Fewer rows').click() // row 9 is empty: applies at once
  await step(page, 'Fewer rows').click() // row 8 holds DG1, W4 and D3
  await expect(page.locator('.resize-loss li')).toHaveText(['1 robot: Fleet 3 Robot dog 1 (DG1) at C8', '1 drop: D3 at I8, Fleet 3', '1 wall: W4 at D8'])
  await page.getByRole('button', { name: 'Remove 3 cells and resize', exact: true }).click()
  await page.mouse.move(0, 0) // the readout follows a pointer left on the grid
  await expect(page.locator('.grid-readout')).toContainText('the resize removed a Robot dog at C8, W4 at D8 and D3 at I8')
  // Fleet 3 has no robots now, and is still scored as its type: the card and the panel say so.
  await expect(page.locator('.smp-fleet').nth(2).locator('.smp-fleet-types-empty')).toHaveText('No robots. The oracle still scores this fleet as Robot dog, the type this fleet started with.')
  await expect(page.locator('.pg-episode b')).toHaveText(['AM', 'HU', 'DG'])
})

test('a resize never renumbers a surviving robot; Undo restores the removed one exactly; a new robot fills the gap', async ({ page }) => {
  // AM3 at L3; then remove rows 9 down to 6, the last of which holds AM2 at B6.
  await cell(page, 'L3, empty').click()
  await expect(cell(page, 'L3, Fleet 1 AMR robot 3')).toBeVisible()
  await step(page, 'Fewer rows').click() // row 9: empty
  for (const removes of ['Remove 3 cells and resize', 'Remove 3 cells and resize']) { // rows 8 and 7
    await step(page, 'Fewer rows').click()
    await page.getByRole('button', { name: removes, exact: true }).click()
  }
  await step(page, 'Fewer rows').click() // row 6 holds AM2 at B6 and W7 at H6
  await expect(page.locator('.resize-loss li').first()).toHaveText('1 robot: Fleet 1 AMR robot 2 (AM2) at B6')
  await page.getByRole('button', { name: 'Remove 2 cells and resize', exact: true }).click()
  // The survivor keeps its number: L3 is still AM3, with a gap where AM2 was.
  await expect(cell(page, 'L3, Fleet 1 AMR robot 3')).toBeVisible()
  await expect(cell(page, 'B4, Fleet 1 AMR robot 1')).toBeVisible()
  // Undo: AM2 is back at B6, AM3 still at L3, and only one robot is number 2.
  await page.locator('.pg-editbar').getByRole('button', { name: 'Undo resize (back to 12 × 6)', exact: true }).click()
  await expect(cell(page, 'B6, Fleet 1 AMR robot 2')).toBeVisible()
  await expect(cell(page, 'L3, Fleet 1 AMR robot 3')).toBeVisible()
  const robotTwos = () => page.locator('.site-cell').evaluateAll((els) => els.filter((el) => /Fleet 1 AMR robot 2$/.test(el.getAttribute('aria-label') ?? '')).length)
  expect(await robotTwos()).toBe(1)
  // Erase AM2, then place a new robot: it takes the freed number 2, never a duplicate.
  await page.locator('.smp-tool').filter({ hasText: 'Erase' }).click()
  await cell(page, 'B6, Fleet 1 AMR robot 2').click()
  await page.locator('.smp-tool').filter({ hasText: 'Robot' }).first().click()
  await cell(page, 'A1, empty').click()
  await expect(cell(page, 'A1, Fleet 1 AMR robot 2')).toBeVisible()
  await expect(cell(page, 'L3, Fleet 1 AMR robot 3')).toBeVisible()
  expect(await robotTwos()).toBe(1)
})

test('a confirm that was abandoned by another edit never comes back, even when the same floor returns', async ({ page }) => {
  await step(page, 'Fewer columns').click()
  await expect(page.locator('.resize-confirm')).toBeVisible()
  await page.locator('.smp-tool').filter({ hasText: 'Wall' }).click()
  await cell(page, 'A1, empty').click() // any other edit ends the pending resize
  await expect(page.locator('.resize-confirm')).toHaveCount(0)
  await page.locator('.smp-clear').click() // Reset brings back the very same template object
  await expect(page.locator('.resize-confirm')).toHaveCount(0)
  await expect(page.locator('.site-cell.is-ghost-remove')).toHaveCount(0)
})

test('a resize that removes nothing applies at once, keeps every type, and can be undone from the readout', async ({ page }) => {
  const before = await floorState(page)
  await step(page, 'More rows').click()
  await expect(page.locator('.resize-confirm')).toHaveCount(0)
  await expect(page.locator('.floor-head-title')).toContainText('12 wide × 10 deep')
  await expect(page.locator('.pg-episode b')).toHaveText(['AM', 'HU', 'DG']) // a grow collapsed them before
  // The pointer is still on the stepper: its ghost now previews the NEXT step (row 11).
  await expect(page.locator('.site-cell-ghost')).toHaveCount(12)
  await expect(page.locator('.grid-size-preview')).toHaveText('Adds an empty row 11.')
  // The ghost row takes the scale's slot, so Undo below the grid is where it was.
  await page.locator('.grid-readout-row').getByRole('button', { name: 'Undo resize (back to 12 × 9)', exact: true }).click()
  expect(await floorState(page)).toEqual(before)
})

test('the ghost outlines what a stepper would remove or add, on pointer hover and on keyboard focus', async ({ page }) => {
  await step(page, 'Fewer rows').hover()
  await expect(page.locator('.site-cell.is-ghost-remove')).toHaveCount(12) // row 9, empty on the template
  await expect(page.locator('.grid-size-preview')).toHaveText('Removes row 9, which is empty. Nothing placed is removed.')
  await step(page, 'Fewer columns').hover()
  await expect(page.locator('.grid-size-preview')).toHaveText('Removes column L, which holds 2 placed cells (H2 at L2 and D1 at L5). You see the full list and confirm before anything is removed.')
  await page.mouse.move(0, 0)
  // Previewing an added row moves nothing below the grid: it takes the scale row's slot.
  const below = async () => (await page.locator('.grid-readout').boundingBox())!.y + (await page.evaluate(() => window.scrollY))
  const settled = await below()
  await step(page, 'More rows').focus()
  await expect(page.locator('.site-cell.is-ghost-remove')).toHaveCount(0)
  await expect(page.locator('.site-cell-ghost')).toHaveCount(12) // a 10th row of 12 cells
  expect(await below()).toBe(settled)
  await step(page, 'More rows').hover()
  expect(await below()).toBe(settled)
  await expect(page.locator('.grid-size-preview')).toHaveText('Adds an empty row 10.')
  // The ghost is an outline only: neutral ink for removal, never a verdict colour.
  await step(page, 'Fewer columns').focus()
  const dash = await page.locator('.site-cell.is-ghost-remove').first().evaluate((el) => {
    const s = getComputedStyle(el, '::after')
    return { style: s.borderTopStyle, colour: s.borderTopColor }
  })
  expect(dash).toEqual({ style: 'dashed', colour: 'rgb(39, 45, 38)' })
  // The same description reaches a screen reader through the stepper itself.
  await expect(step(page, 'Fewer columns')).toHaveAccessibleDescription(/Removes column L, which holds 2 placed cells/)
})

test('the column cap is explained in visible text, and a shrink that would remove the last drop is refused with its reason', async ({ page }) => {
  await expect(page.locator('.grid-size-range')).toHaveText('This synthetic gym supports 4 to 12 columns (A to L) and 4 to 12 rows.')
  await expect(step(page, 'More columns')).toBeDisabled()
  // 12 → 9 takes three confirms: column L (D1, H2), K (H1), then J (I1, the scored item).
  for (const removes of ['Remove 2 cells and resize', 'Remove 1 cell and resize', 'Remove 1 cell and resize']) {
    await step(page, 'Fewer columns').click()
    await page.getByRole('button', { name: removes, exact: true }).click()
  }
  await expect(page.locator('.floor-head-title')).toContainText('9 wide × 9 deep')
  // Column I holds D2 and D3, the last two drops: refused, nothing removed, reason shown.
  const before = await floorState(page)
  await step(page, 'Fewer columns').click()
  await expect(page.locator('.resize-confirm')).toHaveCount(0)
  await expect(page.locator('.grid-size-refusal')).toHaveText('The floor stays 9 × 9. Making it 8 × 9 would remove every drop, and the floor keeps at least one item and one drop. Place a drop in columns A to H and rows 1 to 9 first, then try again.')
  expect(await floorState(page)).toEqual(before)
  await expect(step(page, 'Fewer columns')).toHaveAccessibleDescription(/^Removes column I: refused, because it would remove every drop/)
  // The refusal belongs to that floor only: once the floor changes, it is gone.
  await page.locator('.pg-editbar').getByRole('button', { name: /Undo resize/ }).click()
  await expect(page.locator('.floor-head-title')).toContainText('10 wide × 9 deep')
  await expect(page.locator('.grid-size-refusal')).toHaveCount(0)
})

test('the refusal says how to get unstuck, and following it works', async ({ page }) => {
  for (const removes of ['Remove 2 cells and resize', 'Remove 1 cell and resize', 'Remove 1 cell and resize']) {
    await step(page, 'Fewer columns').click()
    await page.getByRole('button', { name: removes, exact: true }).click()
  }
  await step(page, 'Fewer columns').click()
  await expect(page.locator('.grid-size-refusal')).toContainText('Place a drop in columns A to H and rows 1 to 9 first')
  // Do what it says: a drop at A1 with the Drop tool, then shrink again.
  await page.locator('.smp-tool').filter({ hasText: 'Drop' }).click()
  await cell(page, 'A1, empty').click()
  await expect(page.locator('.grid-size-refusal')).toHaveCount(0)
  await step(page, 'Fewer columns').click()
  await expect(page.locator('.resize-loss li')).toContainText(['2 drops: D2 at I2, Fleet 2; D3 at I8, Fleet 3'])
  await page.locator('.resize-confirm-go').click()
  await expect(page.locator('.floor-head-title')).toContainText('8 wide × 9 deep')
  await expect(cell(page, 'A1, Fleet 1 drop D4')).toBeVisible()
})

test('one type list: a mixed fleet shows the same types in its fleet card, the type panel and the result', async ({ page }) => {
  // The sticky bar names the placement tool, never the fleet ("Tool" on a narrow bar,
  // read in full to a screen reader).
  const tool = page.getByRole('group', { name: 'Editing now' })
  await expect(tool.locator('.pg-editbar-long')).toHaveText('Placement tool')
  await expect(tool.locator('.pg-editbar-state b').last()).toHaveText('AMR robot')
  await page.locator('.smp-rtype-chip').filter({ hasText: 'Humanoid' }).click()
  await expect(tool.locator('.pg-editbar-state b').last()).toHaveText('Humanoid robot')
  await cell(page, 'B6, Fleet 1 AMR robot 2').click()
  await expect(cell(page, 'B6, Fleet 1 Humanoid robot 2')).toBeVisible()

  await expect(page.locator('.smp-fleet').nth(0).locator('.smp-type-chip')).toHaveText(['AM AMR ×1: 1 robot', 'HU Humanoid ×1: 1 robot'])
  await expect(page.locator('.pg-type-name')).toHaveText(['AM AMR', 'HU Humanoid', 'DG Robot dog'])
  await expect(page.locator('.pg-type-where')).toHaveText(['1 robot in Fleet 1.', '2 robots: 1 in Fleet 1 and 1 in Fleet 2.', '1 robot in Fleet 3.'])
  await expect(page.locator('.pg-episode b')).toHaveText(['AM', 'HU', 'DG'])
  // No single-type selector or picture stands for the whole floor any more.
  await expect(page.getByRole('combobox', { name: 'Robot embodiment' })).toHaveCount(0)
  await expect(page.locator('.embodiment-preview')).toHaveCount(0)
  await expect(page.locator('.pg-types-inputs')).toContainText('What decides the oracle’s verdicts: the floor’s geometry')
  await expect(page.locator('.pg-types-inputs')).toContainText('the one lane it scores: the route from the start, which is not drawn on the grid, to the first item and then the first drop, now A5 → I1 at J5 → D1 at L5')
  await expect(page.locator('.pg-types-inputs')).toContainText('the robot types it scores (each robot’s type, plus the type of any fleet with no robots)')

  // + adds a robot of the placement type, as a grid tap does, and its name says so.
  await page.getByRole('button', { name: 'One more Humanoid robot in fleet 3', exact: true }).click()
  await expect(page.locator('.smp-fleet').nth(2).locator('.smp-type-chip')).toHaveText(['HU Humanoid ×1: 1 robot', 'DG Robot dog ×1: 1 robot'])
  await expect(page.locator('.pg-episode b')).toHaveText(['AM', 'HU', 'DG'])
})

test('an empty fleet says it is still scored as its type, in the card and the panel', async ({ page }) => {
  await page.getByRole('button', { name: 'One fewer robot in fleet 3', exact: true }).click()
  await expect(page.locator('.smp-fleet').nth(2).locator('.smp-fleet-types-empty')).toHaveText('No robots. The oracle still scores this fleet as Robot dog, the type this fleet started with.')
  await expect(page.locator('.pg-type-where').nth(2)).toHaveText('Fleet 3 has no robots and is still scored as this type, the type it started with.')
  await expect(page.locator('.pg-episode b')).toHaveText(['AM', 'HU', 'DG'])
})

/** WCAG contrast of an element's text against the first opaque background behind it. */
async function contrast(target: Locator, pseudo?: string) {
  return target.evaluate((el, pseudo) => {
    const ctx = document.createElement('canvas').getContext('2d')!
    // Normalise any CSS colour (rgb, color(srgb …), color-mix results) through the canvas.
    const rgba = (c: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return { r, g, b, a: c === 'transparent' || /,\s*0\)$|\/\s*0\)$/.test(c) ? 0 : a / 255 }
    }
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const fgCss = pseudo ? getComputedStyle(el, pseudo).borderTopColor : getComputedStyle(el).color
    const fg = rgba(fgCss)
    let node: Element | null = pseudo ? el.parentElement : el
    let bg = { r: 255, g: 255, b: 255, a: 1 }
    while (node) {
      const c = rgba(getComputedStyle(node).backgroundColor)
      if (getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)' && c.a > 0.99) { bg = c; break }
      node = node.parentElement
    }
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
  }, pseudo)
}

test('measured: new text meets 4.5:1, the removal outline 3:1, and every new control is a 44 × 44 px target', async ({ page }, info) => {
  const measured: Record<string, number> = {}
  const text = async (name: string, target: Locator) => {
    measured[name] = await contrast(target)
    expect(measured[name], name).toBeGreaterThanOrEqual(4.5)
  }
  await text('bar: placement tool', page.locator('.pg-editbar-state > span').last())
  const barHeight = Math.round((await page.locator('.pg-editbar').boundingBox())!.height)
  await text('size range line', page.locator('.grid-size-range'))
  await text('fleet card: types label', page.locator('.smp-fleet-types-label').first())
  await text('fleet card: type chip', page.locator('.smp-type-chip').first())
  await text('fleet card: type chip code', page.locator('.smp-type-chip b').first())
  await text('type panel: lead', page.locator('.pg-types-lead'))
  await text('type panel: where', page.locator('.pg-type-where').first())
  await text('type panel: note', page.locator('.pg-type-note').first())
  await text('type panel: scorer inputs', page.locator('.pg-types-inputs'))
  await step(page, 'Fewer rows').hover()
  await text('size preview line', page.locator('.grid-size-preview'))
  await step(page, 'Fewer columns').click()
  await text('confirm: title', page.locator('.resize-confirm-title'))
  await text('confirm: loss list', page.locator('.resize-loss li').first())
  await text('confirm: scored-lane line', page.locator('.resize-lane'))
  await text('confirm: note', page.locator('.resize-confirm-note'))
  await text('confirm: remove button', page.locator('.resize-confirm-go'))
  await text('confirm: keep button', page.locator('.resize-confirm-keep'))
  measured['removal outline (non-text)'] = await contrast(page.locator('.site-cell.is-ghost-remove').first(), '::after')
  expect(measured['removal outline (non-text)']).toBeGreaterThanOrEqual(3)

  const sizes: Record<string, string> = {}
  for (const [name, target] of [
    ['confirm: remove button', page.locator('.resize-confirm-go')],
    ['confirm: keep button', page.locator('.resize-confirm-keep')],
  ] as const) {
    const box = (await target.boundingBox())!
    sizes[name] = `${Math.round(box.width)}×${Math.round(box.height)}`
    expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44)
  }
  await page.locator('.resize-confirm-go').click()
  for (const [name, target] of [
    ['bar: undo', page.locator('.pg-editbar-undo')],
    ['readout: undo', page.locator('.grid-readout-undo')],
    ['stepper: fewer columns', step(page, 'Fewer columns')],
  ] as const) {
    await text(name, target)
    const box = (await target.boundingBox())!
    sizes[name] = `${Math.round(box.width)}×${Math.round(box.height)}`
    expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44)
  }
  const barWithUndo = Math.round((await page.locator('.pg-editbar').boundingBox())!.height)
  // Offering Undo grows the bar by at most one line of text, never a whole row
  // (0 px on a desktop with the site's fonts; CI's fallback fonts can wrap one line).
  expect(barWithUndo - barHeight).toBeLessThanOrEqual(24)
  await info.attach('measurements', { body: JSON.stringify({ project: info.project.name, contrast: measured, sizes, barHeight, barWithUndo }, null, 2), contentType: 'application/json' })
  console.log(`MEASURED ${info.project.name} ${JSON.stringify({ contrast: measured, sizes, barHeight, barWithUndo })}`)
})
