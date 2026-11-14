import { test, expect, type Page } from '@playwright/test'

// Pass 2 Phase 3 — proving-ground playback
// The 2D playback carries the editor's axes (columns A–L, rows 1–9) and names each robot
// beside its glyph on a paper backing, or inside the glyph when no side is free; the 2D and
// 3D views give each fleet the same colour, and the retired teal and blue fleet tones are
// gone. Runs in both projects.

// The six fleet colours: #2b523b, #8a5200, #6940a3, #9d2e68, #4a4238, #525e2c.
const ALL_FLEET_RGB = ['rgb(43, 82, 59)', 'rgb(138, 82, 0)', 'rgb(105, 64, 163)', 'rgb(157, 46, 104)', 'rgb(74, 66, 56)', 'rgb(82, 94, 44)']
// Fleets 1–3 of the starter floor.
const FLEET_RGB = ALL_FLEET_RGB.slice(0, 3)
const RETIRED = ['#1e6a52', '#0b637a', '#2f6df6', '#2f9e8f']
const PAPER = 'rgb(248, 247, 244)'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
})

async function open2D(page: Page) {
  await page.goto('/proving-ground')
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await page.locator('.sim-grid').scrollIntoViewIfNeeded()
}

/** Every retired tone used by an element under `selector`, in its computed colours or inline style. */
function retiredTones(page: Page, selector: string) {
  return page.locator(selector).evaluate((root, retired) => {
    const rgbOf = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
    const banned = retired.flatMap((hex) => [hex, rgbOf(hex)])
    return [root, ...root.querySelectorAll('*')].flatMap((el) => {
      const s = getComputedStyle(el)
      const used = [s.color, s.backgroundColor, s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor, s.outlineColor, el.getAttribute('style') ?? ''].join(' ').toLowerCase()
      return banned.filter((tone) => used.includes(tone)).map((tone) => `${el.className}: ${tone}`)
    })
  }, RETIRED)
}

test('the 2D playback carries the editor axes, aligned with its cells and reachable on a phone', async ({ page }) => {
  await open2D(page)
  const cols = page.locator('.sim-axis--cols > span')
  const rows = page.locator('.sim-axis--rows > span')
  await expect(cols).toHaveCount(12)
  await expect(rows).toHaveCount(9)
  await expect(cols.first()).toHaveText('A')
  await expect(cols.last()).toHaveText('L')
  await expect(rows.first()).toHaveText('1')
  await expect(rows.last()).toHaveText('9')
  const cells = page.locator('.sim-grid > .sim-cell')
  const pairs = [[cols.first(), cells.nth(0), 'x'], [cols.last(), cells.nth(11), 'x'], [rows.first(), cells.nth(0), 'y'], [rows.last(), cells.nth(12 * 8), 'y']] as const
  for (const [axis, cell, along] of pairs) {
    await cell.scrollIntoViewIfNeeded()
    await expect(axis).toBeInViewport()
    await expect(cell).toBeInViewport()
    const a = (await axis.boundingBox())!
    const c = (await cell.boundingBox())!
    const centre = (b: typeof a) => (along === 'x' ? b.x + b.width / 2 : b.y + b.height / 2)
    expect(Math.abs(centre(a) - centre(c)), `${await axis.textContent()} lines up with its cells`).toBeLessThanOrEqual(1)
  }
  for (const size of await page.locator('.sim-axis > span').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)))) {
    expect(size).toBeGreaterThanOrEqual(12)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
})

test('robot names sit beside their glyphs on a paper backing, never on a robot or another name', async ({ page }) => {
  test.setTimeout(60_000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()
  await open2D(page)
  const play = page.getByRole('button', { name: 'Play', exact: true })
  // Check every frame of the starter plan until playback stops on its last frame.
  for (let frame = 0; frame < 150; frame++) {
    const seen = await page.locator('.sim-grid').evaluate((grid) => {
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const robots = [...grid.querySelectorAll('.sim-cell.robot')]
      const glyphs = robots.map((robot) => robot.getBoundingClientRect())
      const labels = robots.map((robot) => robot.querySelector('.sim-robot-label')).filter((label): label is Element => label !== null)
      const boxes = labels.map((label) => label.getBoundingClientRect())
      return {
        robots: robots.length,
        texts: labels.map((label) => label.textContent ?? ''),
        backgrounds: labels.map((label) => getComputedStyle(label).backgroundColor),
        coveredCentres: boxes.filter((box) => glyphs.some((g) => {
          const x = g.left + g.width / 2, y = g.top + g.height / 2
          return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
        })).length,
        onRobot: boxes.filter((box) => glyphs.some((g) => hit(box, g))).length,
        onLabel: boxes.filter((box, i) => boxes.some((other, j) => j !== i && hit(box, other))).length,
      }
    })
    expect(seen.robots, `frame ${frame}`).toBe(4)
    expect(seen.texts, `frame ${frame}`).toHaveLength(4)
    for (const text of seen.texts) expect(text).toMatch(/^(AM|HU|DG)\dF\d$/)
    expect(seen.backgrounds, `frame ${frame}`).toEqual([PAPER, PAPER, PAPER, PAPER])
    expect(seen.coveredCentres, `frame ${frame}: a name covers a glyph's centre`).toBe(0)
    expect(seen.onRobot, `frame ${frame}: a name overlaps a robot`).toBe(0)
    expect(seen.onLabel, `frame ${frame}: two names overlap`).toBe(0)
    if (await play.isVisible()) break
    await page.clock.runFor(500)
  }
  await expect(play).toBeVisible()
})

test('2D and 3D give each fleet one colour, and no retired teal or blue tone remains', async ({ page }) => {
  await open2D(page)
  const chips = page.locator('.sim-legend .lg-robot')
  await expect(chips).toHaveCount(3)
  expect(await chips.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))).toEqual(FLEET_RGB)
  const glyphs = await page.locator('.sim-grid .sim-cell.robot').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))
  expect(glyphs.length).toBe(4)
  for (const colour of glyphs) expect(FLEET_RGB).toContain(colour)
  expect(await retiredTones(page, '#pg-playback')).toEqual([])

  await page.getByRole('button', { name: '3D', exact: true }).click()
  const legend = page.locator('.pg3d-legend')
  await expect(legend).toBeVisible()
  const fleets = legend.locator('span').filter({ hasText: /Fleet \d/ })
  await expect(fleets).toHaveText(['Fleet 1', 'Fleet 2', 'Fleet 3'])
  expect(await fleets.locator('i').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))).toEqual(FLEET_RGB)
  expect(await retiredTones(page, '.pg3d-legend')).toEqual([])
})

test('every robot keeps its name in a packed corner: beside it when a side is free, else inside its cell', async ({ page }) => {
  test.setTimeout(90_000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  // A paused clock moves the playback one step per runFor, so every frame is checked.
  await page.clock.install()
  await page.clock.pauseAt(Date.now() + 1000)
  await page.goto('/proving-ground')
  // Fleet 1 already has two robots; four more fill its six and pack the top-right corner.
  await page.locator('.smp-tool').filter({ hasText: 'Robot' }).first().click()
  for (const cell of ['K1', 'L1', 'K2', 'L2']) await page.getByRole('button', { name: new RegExp(`^${cell}, `) }).click()
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await page.locator('.sim-grid').scrollIntoViewIfNeeded()
  const play = page.getByRole('button', { name: 'Play', exact: true })
  let inCell = 0
  let frames = 0
  for (let frame = 0; frame < 150; frame++) {
    frames += 1
    const seen = await page.locator('.sim-grid').evaluate((grid) => {
      const cells = [...grid.children]
      const width = getComputedStyle(grid).gridTemplateColumns.split(' ').length
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const robots = cells.filter((cell) => cell.classList.contains('robot'))
      const glyphs = robots.map((robot) => robot.getBoundingClientRect())
      const sideOf = (a: number, b: number) => (Math.abs(a - b) === 1 && Math.floor(a / width) === Math.floor(b / width)) || Math.abs(a - b) === width
      const named = robots.map((robot) => {
        const labels = [...robot.querySelectorAll('.sim-robot-label')]
        const own = [...robot.childNodes].filter((node) => !labels.includes(node as Element)).map((node) => node.textContent).join('')
        const box = labels[0]?.getBoundingClientRect()
        const under = box && cells.findIndex((cell) => {
          const c = cell.getBoundingClientRect()
          return box.left + box.width / 2 >= c.left && box.left + box.width / 2 <= c.right && box.top + box.height / 2 >= c.top && box.top + box.height / 2 <= c.bottom
        })
        const at = cells.indexOf(robot)
        return {
          at, own, labels: labels.map((label) => label.textContent ?? ''), box,
          ownFits: robot.scrollWidth <= robot.clientWidth && robot.scrollHeight <= robot.clientHeight,
          ownColour: getComputedStyle(robot).color,
          // The cell the name sits in: beside its own robot, holding no mark, and beside no other robot.
          slot: under === undefined ? null : {
            besideOwn: sideOf(under, at),
            marked: ['robot', 'wall', 'hazard', 'human', 'cell-I', 'cell-drop'].filter((cls) => cells[under].classList.contains(cls)),
            besideOther: robots.some((other) => other !== robot && sideOf(under, cells.indexOf(other))),
          },
        }
      })
      const boxes = named.flatMap((n) => (n.box ? [n.box] : []))
      return {
        named: named.map(({ box: _box, ...rest }) => rest),
        onRobot: boxes.filter((box) => glyphs.some((g) => hit(box, g))).length,
        onLabel: boxes.filter((box, i) => boxes.some((other, j) => j !== i && hit(box, other))).length,
      }
    })
    expect(seen.named, `frame ${frame}`).toHaveLength(8)
    const names = seen.named.map((n) => n.labels[0] ?? n.own)
    for (const n of seen.named) {
      // Exactly one place holds the name: one label beside the robot, or the robot's own cell.
      expect(n.labels.length + (n.own ? 1 : 0), `frame ${frame}: cell ${n.at} ${JSON.stringify(n)}`).toBe(1)
      if (n.own) {
        inCell += 1
        expect(n.ownFits, `frame ${frame}: the name fits cell ${n.at}`).toBe(true)
        expect(n.ownColour).toBe('rgb(255, 255, 255)')
      } else {
        expect(n.slot, `frame ${frame}: cell ${n.at}`).toEqual({ besideOwn: true, marked: [], besideOther: false })
      }
    }
    for (const name of names) expect(name).toMatch(/^(AM|HU|DG)\dF\d$/)
    expect(new Set(names).size, `frame ${frame}: each robot has its own name`).toBe(8)
    expect(seen.onRobot, `frame ${frame}: a name overlaps a robot`).toBe(0)
    expect(seen.onLabel, `frame ${frame}: two names overlap`).toBe(0)
    if (frame === 0) {
      // L1 has no free side, so its name is printed in its own cell, as text a screen reader reads.
      expect(seen.named.find((n) => n.at === 11)?.own).toMatch(/^AM\dF1$/)
      const tree = await page.getByRole('region', { name: '2D playback (scrollable)' }).ariaSnapshot()
      for (const name of names) expect(tree.replace(/\s/g, '')).toContain(name)
    }
    if (await play.isVisible()) break
    await page.clock.runFor(500)
  }
  await expect(play).toBeVisible()
  expect(frames, 'the playback ran from its first frame to its last').toBeGreaterThan(10)
  expect(inCell, 'the packed corner used the in-cell name').toBeGreaterThan(0)
})

test('in forced colours each robot keeps its fleet fill, so it never reads as empty floor', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  await open2D(page)
  const robots = page.locator('.sim-grid .sim-cell.robot')
  await expect(robots).toHaveCount(4)
  for (const robot of await robots.all()) {
    const shot = await robot.screenshot({ scale: 'css' })
    // The painted pixel at the glyph's left middle, clear of any carried-box mark.
    const painted = await page.evaluate(async (src) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const ctx = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }).getContext('2d')!
      ctx.drawImage(img, 0, 0)
      return `rgb(${[...ctx.getImageData(6, Math.floor(img.height / 2), 1, 1).data.slice(0, 3)].join(', ')})`
    }, `data:image/png;base64,${shot.toString('base64')}`)
    expect(FLEET_RGB, `robot ${await robot.textContent()} paints ${painted}`).toContain(painted)
  }
})

test('six fleets take the six palette colours, in order, in the 2D and 3D legends and on every robot', async ({ page }) => {
  await page.goto('/proving-ground')
  const addFleet = page.getByRole('button', { name: 'Add fleet' })
  while (await addFleet.count()) await addFleet.click()
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await page.locator('.sim-grid').scrollIntoViewIfNeeded()
  const chips = page.locator('.sim-legend .lg-robot')
  await expect(chips).toHaveCount(6)
  expect(await chips.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))).toEqual(ALL_FLEET_RGB)
  // Each robot's fill is its own fleet's colour, read from its F-number.
  const robots = await page.locator('.sim-grid .sim-cell.robot').evaluateAll((els) => els.map((el) => ({
    fleet: Number((el.textContent ?? '').match(/F(\d)$/)?.[1]),
    fill: getComputedStyle(el).backgroundColor,
  })))
  expect(new Set(robots.map((r) => r.fleet))).toEqual(new Set([1, 2, 3, 4, 5, 6]))
  for (const r of robots) expect(r.fill, `a fleet ${r.fleet} robot`).toBe(ALL_FLEET_RGB[r.fleet - 1])
  expect(await retiredTones(page, '#pg-playback')).toEqual([])

  await page.getByRole('button', { name: '3D', exact: true }).click()
  const fleets = page.locator('.pg3d-legend span').filter({ hasText: /Fleet \d/ })
  await expect(fleets).toHaveText(['Fleet 1', 'Fleet 2', 'Fleet 3', 'Fleet 4', 'Fleet 5', 'Fleet 6'])
  expect(await fleets.locator('i').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))).toEqual(ALL_FLEET_RGB)
})
