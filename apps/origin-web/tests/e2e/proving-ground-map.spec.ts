import { test, expect, type Page } from '@playwright/test'

// Acceptance checks for the P0 floor-editor pass (2026-10-24 proving-ground audit,
// §9): the grid reads as a map, the editor state stays in view, every editor
// control is a 44px target, notes never truncate, and counts read the same
// everywhere. Runs in both projects: desktop 1280×720 and mobile 390×844.

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

test('the grid carries axes, coordinate names and per-fleet robot numbers', async ({ page }) => {
  const cols = await page.locator('.grid-axis--col').allTextContents()
  expect(cols).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'])
  expect(await page.locator('.grid-axis--row').allTextContents()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  for (const axis of await page.locator('.grid-axis').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)))) {
    expect(axis).toBeGreaterThanOrEqual(12)
  }
  // Each fleet numbers its own robots from 1; the fleet is the F# mark.
  await expect(cell(page, 'B4, Fleet 1 AMR robot 1')).toContainText('AM1')
  await expect(cell(page, 'B6, Fleet 1 AMR robot 2')).toContainText('AM2')
  await expect(cell(page, 'C2, Fleet 2 Humanoid robot 1')).toContainText('HU1')
  await expect(cell(page, 'C8, Fleet 3 Robot dog 1')).toContainText('DG1')
  await expect(page.locator('.grid-legend')).toContainText('Tap a tool, then tap the floor.')
  await expect(page.locator('.floor-head')).toContainText('12 wide × 9 deep · 108 cells')
  await expect(page.locator('.floor-head')).toContainText('not a real facility')
  await expect(page.locator('.grid-scale-label')).toHaveText('3 cells ≈ 3 m in this synthetic scale')
})

test('the grid is one Tab stop; arrows move focus, Enter places, the readout and live region follow', async ({ page }) => {
  await page.locator('.smp-tool').filter({ hasText: 'Wall' }).click()
  expect(await page.locator('.site-cell[tabindex="0"]').count()).toBe(1)
  await cell(page, 'A1, empty').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expect(cell(page, 'B2, empty')).toBeFocused()
  await expect(page.locator('.grid-readout')).toHaveText('B2: empty. A tap with the Wall tool places a wall here.')
  await page.keyboard.press('Enter')
  await expect(cell(page, 'B2, wall W9')).toBeFocused()
  await expect(page.locator('.site-map-panel [aria-live="polite"]').last()).toHaveText('Placed a wall at B2.')
  expect(await page.locator('.site-cell[tabindex="0"]').count()).toBe(1)
})

test('the readout never claims a change a tap would not make', async ({ page }) => {
  // Robot tool with the template's own type: a tap removes that robot.
  await cell(page, 'B4, Fleet 1 AMR robot 1').focus()
  await expect(page.locator('.grid-readout')).toHaveText('B4: Fleet 1 AMR robot 1. A tap with the Robot tool (AMR) removes the Fleet 1 AMR robot 1 (AM1).')
  // Erase on an anchor the floor must keep: the readout says nothing changes, and why.
  await page.locator('.smp-tool').filter({ hasText: 'Erase' }).click()
  await page.getByRole('button', { name: 'One fewer item in fleet 2', exact: true }).click()
  await page.getByRole('button', { name: 'One fewer item in fleet 3', exact: true }).click()
  await page.locator('.smp-tool').filter({ hasText: 'Erase' }).click()
  await cell(page, 'J5, Fleet 1 item I1').focus()
  await expect(page.locator('.grid-readout')).toHaveText('J5: Fleet 1 item I1. A tap with the Erase tool leaves J5 as it is, because the floor keeps at least one item.')
})

test('every editor control and grid cell is at least 44 × 44px', async ({ page }) => {
  const small = await page.locator('.pg-wrap').evaluate((root) =>
    [...root.querySelectorAll('.reflect button, .reflect select')]
      .filter((el) => el.getClientRects().length)
      .map((el) => ({ name: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30), box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(({ name, box }) => `${name}: ${Math.round(box.width)}×${Math.round(box.height)}`))
  expect(small).toEqual([])
})

test('plan and boundary notes show their full default text without scrolling', async ({ page }) => {
  const notes = await page.locator('.reflect textarea').evaluateAll((els) =>
    els.map((el) => ({ name: el.getAttribute('aria-label'), clipped: el.scrollHeight > el.clientHeight + 1, size: parseFloat(getComputedStyle(el).fontSize) })))
  expect(notes).toHaveLength(5)
  for (const note of notes) {
    expect(note.clipped, `${note.name} is truncated`).toBe(false)
    expect(note.size).toBeGreaterThanOrEqual(16)
  }
  await expect(page.locator('.notes-status').first()).toHaveText('These notes describe intent only. They do not change the scored result, which comes from floor geometry and robot types.')
})

test('one floor total reads the same in the editor bar, the plan and the oracle record', async ({ page }) => {
  const strips = await page.locator('.count-strip').allTextContents()
  expect(strips.length).toBeGreaterThanOrEqual(3)
  for (const strip of strips) expect(strip).toBe('Floor total4 robots·3 fleets·3 items to deliver·3 robot types scored')
  const types = await page.locator('.pg-episode').count()
  await expect(page.locator('.pg-results .count-strip')).toContainText(`${types} robot types scored`)
})

test('a fleet card stepper keeps its 44px buttons inside its own box at two-column widths', async ({ page }) => {
  for (const width of [901, 960, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    const spills = await page.locator('.smp-stepper').evaluateAll((steppers) => steppers.flatMap((stepper) => {
      const box = stepper.getBoundingClientRect()
      return [...stepper.querySelectorAll('.smp-step-btn')]
        .map((b) => b.getBoundingClientRect())
        .filter((b) => b.left < box.left - 0.5 || b.right > box.right + 0.5)
        .map(() => stepper.textContent?.trim())
    }))
    expect(spills, `${width}px`).toEqual([])
  }
})

test('"Change fleet or tool" lands the fleet cards below the stuck bar', async ({ page }) => {
  await page.locator('.site-grid').scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Change fleet or tool', exact: true }).click()
  const focused = page.getByRole('button', { name: 'Select fleet 1', exact: true })
  await expect(focused).toBeFocused()
  const bar = await page.locator('.pg-editbar').boundingBox()
  const target = await focused.boundingBox()
  expect(target!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height)
})

test('the editor bar sticks under the site header while the grid is in use', async ({ page }) => {
  await page.locator('.site-grid').scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, 200))
  const header = await page.locator('.site-header').boundingBox()
  const bar = await page.locator('.pg-editbar').boundingBox()
  expect(header!.y).toBe(0)
  expect(Math.abs(bar!.y - (header!.y + header!.height))).toBeLessThanOrEqual(1)
  await expect(page.locator('.pg-editbar')).toContainText('Fleet 1')
  // Between the header's two heights (681–720px) the bar must still clear it.
  await page.setViewportSize({ width: 700, height: 900 })
  await page.locator('.site-grid').evaluate((grid) => grid.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const header700 = await page.locator('.site-header').boundingBox()
  const bar700 = await page.locator('.pg-editbar').boundingBox()
  expect(bar700!.y).toBeGreaterThanOrEqual(header700!.y + header700!.height - 1)
})

test('the evaluation button is flat forest green with no gradient or shadow', async ({ page }) => {
  const button = page.getByRole('button', { name: 'Inspect the result', exact: true })
  const style = await button.evaluate((el) => {
    const s = getComputedStyle(el)
    return { image: s.backgroundImage, color: s.backgroundColor, shadow: s.boxShadow, height: el.getBoundingClientRect().height }
  })
  expect(style).toMatchObject({ image: 'none', color: 'rgb(43, 82, 59)', shadow: 'none' })
  expect(style.height).toBeGreaterThanOrEqual(44)
})
