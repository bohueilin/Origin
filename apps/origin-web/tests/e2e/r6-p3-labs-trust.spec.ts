import { test, expect, type Page } from '@playwright/test'

// Release 6 Phase 3 — Labs reading guides, the /operations target, /trust's read-next link and
// no-JS gate line, and named /labs diagrams
//
// /simulation's "How to read the result" says that a deadlocked run counts every pass of the human
// marker through a stopped robot's cell (countCollisionEvents counts the onset of each contact, and
// the marker separates from the robot between passes). /operations labels its collision target as a
// target and says the wave caption and the tile carry the counts. /trust links the explainer from its
// hero and, without JavaScript, links the gate summary its scoreboard renders; the line states no
// suite count, so it cannot drift from the stamp. Each /labs card diagram is a named image with a
// description of what it draws.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/') ? route.continue() : route.abort('blockedbyclient')
  })
})

const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim()
const occurrences = (text: string, phrase: string) => text.split(phrase).length - 1
const labelled = (page: Page, label: string) => page.locator('b', { hasText: new RegExp(`^${label.replace('.', '\\.')}$`) })

const DEADLOCK = "In a deadlocked run, each repeated pass of the human marker through a stopped robot's cell counts as a new collision event."
const TARGET = 'target: collisions = 0'
const CHIP = `Targets · util ≥ 50% · fulfilment ≥ 95% · ${TARGET}`
const OPS_GUIDE = `In the console, “${TARGET}” states this target, not a count: the caption under the wave playback reports the collision events counted in that wave, and the collision events tile reports their total for the shift.`
const READ_NEXT = 'Read next: what runs in your browser today vs. the proposed pilot architecture →'
const GATES_STATIC = 'The gate summary shipped with this release is at /trust/gates-summary.json; the full per-suite table renders here with JavaScript. Reproduce locally with make gates-all.'

test('release 6 phase 3: without JavaScript, the /simulation guide says a deadlocked run counts each pass of the human marker', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/simulation`)
    const guide = page.locator('main > section[aria-labelledby="sim-read-title"]')
    const collisions = guide.locator('p').filter({ has: labelled(page, 'Collision events.') })
    await expect(collisions).toHaveCount(1)
    await expect(collisions).toContainText(DEADLOCK)
    expect(occurrences(squash(await guide.textContent()), DEADLOCK)).toBe(1)
  } finally {
    await context.close()
  }
})

// The rule the sentence describes, in the running page. Four "New layout" clicks from the default
// seed (20260713) give seed 2722456749 (SimulationPage regenerate). With 4 robots no order is
// delivered: Robot 2 stops on the human marker's patrol row (buildWarehouseScene: row 6), and each
// of the marker's 87 passes through its cell in 713 ticks is a new contact onset, so
// countCollisionEvents counts 87.
test('release 6 phase 3: a deadlocked /simulation run counts every pass of the human marker', async ({ page }) => {
  await page.goto('/simulation')
  const newLayout = page.getByRole('button', { name: 'New layout', exact: true })
  for (let i = 0; i < 4; i += 1) await newLayout.click()
  const tiles = page.locator('#sim-root .sim-scores')
  await expect(page.locator('#sim-verdict b')).toHaveText('ESCALATE')
  await expect(page.locator('#sim-verdict span')).toHaveText('87 collision events counted between robots or with the human marker. A human coordinator is required.')
  await expect(tiles.locator(':scope > div', { hasText: 'collision events (counted)' }).locator('b')).toHaveText('87')
  await expect(tiles.locator(':scope > div', { hasText: 'orders fulfilled' }).locator('b')).toHaveText('0/4')
  await expect(tiles.locator(':scope > div', { hasText: 'ticks' }).locator('b')).toHaveText('713')
})

test('release 6 phase 3: the /operations console labels its collision target as a target', async ({ page }) => {
  await page.goto('/operations')
  const chip = page.locator('#ops-root .ops-targets')
  await expect(chip).toHaveText(CHIP)
  const item = chip.locator('.ops-targets__item')
  await expect(item).toHaveText(TARGET)
  // The guide quotes the console's wording.
  await expect(page.locator('main > section[aria-labelledby="ops-read-title"]')).toContainText(`“${await item.textContent()}”`)
  // The counts sit elsewhere: the caption under the playback and the tile.
  await expect(page.locator('#ops-caption')).toHaveText(/^Wave 1 · \w+ · \d+% utilization · \d+ collision events?$/)
  await expect(page.locator('#ops-root .ops-tiles > div', { hasText: 'collision events' }).locator('b')).toHaveText(/^\d+$/)
})

for (const width of [375, 1280]) {
  test(`release 6 phase 3: "${TARGET}" stays on one line at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/operations')
    const item = page.locator('#ops-root .ops-targets__item')
    await expect(item).toBeVisible()
    // React renders the target value as its own text node, so the span has one box per text
    // node; on one line they all share a top.
    expect(await item.evaluate((el) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size)).toBe(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  })
}

test('release 6 phase 3: without JavaScript, the /operations guide says the console shows the target and the caption the counts', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/operations`)
    const guide = page.locator('main > section[aria-labelledby="ops-read-title"]')
    const targets = guide.locator('p').filter({ has: labelled(page, 'Targets') })
    await expect(targets).toHaveCount(1)
    await expect(targets).toContainText(OPS_GUIDE)
    expect(occurrences(squash(await guide.textContent()), OPS_GUIDE)).toBe(1)
  } finally {
    await context.close()
  }
})

test('release 6 phase 3: the /trust hero links the explainer with a 44px "Read next" link', async ({ page }) => {
  await page.goto('/trust')
  const hero = page.locator('main > section[aria-labelledby="trust-title"]')
  const link = hero.getByRole('link', { name: READ_NEXT, exact: true })
  await expect(link).toHaveCount(1)
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', '/reference-check-vs-runtime')
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  // Near the top: in the hero, before the first section.
  expect(await link.evaluate((el) => !!(el.compareDocumentPosition(document.getElementById('posture')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
  expect((await page.request.get('/reference-check-vs-runtime')).status()).toBe(200)
})

test('release 6 phase 3: without JavaScript, the /trust scoreboard links the gate summary and states no suite count', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/trust`)
    const board = page.locator('#gates-scoreboard')
    await expect(board).toBeVisible()
    await expect(board).toHaveText(GATES_STATIC)
    // A fixed number would drift from the stamp the next release writes.
    await expect(board).not.toContainText(/\d+\s+(test\s+)?suites?/i)
    const link = board.getByRole('link', { name: '/trust/gates-summary.json', exact: true })
    await expect(link).toHaveAttribute('href', '/trust/gates-summary.json')
    const summary = await (await page.request.get(`${baseURL}/trust/gates-summary.json`)).json()
    expect(Array.isArray(summary.suites) && summary.suites.length).toBeGreaterThan(0)
  } finally {
    await context.close()
  }
})

test('release 6 phase 3: with JavaScript, the /trust scoreboard replaces that line with one row per suite in the summary', async ({ page }) => {
  await page.goto('/trust')
  const summary = await (await page.request.get('/trust/gates-summary.json')).json()
  const board = page.locator('#gates-scoreboard')
  await expect(board.locator('tbody tr')).toHaveCount(summary.suites.length)
  await expect(board.locator('.gates-static')).toHaveCount(0)
})

// What each card diagram draws, from the code it pictures:
// 01 src/proving-ground/starterFloor.ts (12 x 9; 8 walls, 3 hazards, 2 human-only cells; AMR x2,
//    humanoid, quadruped; start, item and drop on row 4);
// 02 the /labs card 02 text (one scoped grant, opaque lease handle, tool-call boundary);
// 03 buildWarehouseScene defaults (14 x 12, shelf columns at x = 2, 5, 8, 11 in 3 blocks, human
//    patrol on row 6) and Robot 4's simulated plan;
// 04 src/foundry/sampleFloor.ts (10 x 10; 2 walls, 2 hazards, 1 human-only cell);
// 05 runShift(777, 6, 4) as /operations shows it by default; target DEFAULT_TARGETS.min_utilization;
// 06 a schematic of the research direction, with no data.
const LAB_FIGS: [lab: string, name: string, description: string][] = [
  ['01', "The proving ground's starter floor", 'The 12 by 9 starter floor: 8 wall cells, 3 hazard cells (hatched) across the top, 2 human-only cells (rings) at the top right, four robots of three types near the left edge, and the shortest route (green) along the clear middle row from the start, past the item, to the drop.'],
  ['02', "The credential broker's grant flow", 'Schematic: four requested scopes, one approved as a scoped grant (green), the opaque lease handle the broker mints for that grant (dark pill), and an arrow to the tool-call boundary (dashed line), where the handle resolves to the credential (key) for that call.'],
  ['03', 'The default warehouse scene', "The default 14 by 12 warehouse floor: 4 shelf columns of 3 blocks, four robots starting at the left edge, the human marker (ring) on its patrol row, and robot 4's route (green) around the shelving to its item and on to its dock cell at the right edge."],
  ['04', "Foundry's parse gate and sample floor", 'Schematic: a floor-plan drawing, the deterministic parse gate (two bars) and a grid. The grid is the browser-local 10 by 10 sample floor: 2 walls, 2 hazard cells (hatched), 1 human-only cell (ring) and one shortest route (green) from the start at the bottom to the item, then around the hazards to the drop.'],
  ['05', 'Fleet utilization per wave against the target', 'Six bars, one per wave of the default shift (4 robots, 6 waves), show fleet utilization of 84%, 83%, 83%, 83%, 84% and 84%; the dashed green line marks the 50% utilization target.'],
  ['06', 'Observed and inferred geometry', 'Schematic, not data: an outline drawn two ways, its observed edges solid green with the observed points as dots, and its inferred edges dashed.'],
]

test('release 6 phase 3: each /labs card diagram is a named image that says what it draws', async ({ page }) => {
  await page.goto('/labs')
  await expect(page.locator('.labs-card svg.labs-fig')).toHaveCount(LAB_FIGS.length)
  await expect(page.locator('.labs-card svg.labs-fig[aria-hidden]')).toHaveCount(0)
  for (const [lab, name, description] of LAB_FIGS) {
    const card = page.locator(`.labs-card[data-lab="${lab}"]`)
    const svg = card.locator(`svg.labs-fig[data-lab-fig="${lab}"]`)
    await expect(svg, lab).toHaveAttribute('role', 'img')
    await expect(svg, lab).toHaveAccessibleName(name)
    await expect(svg, lab).toHaveAccessibleDescription(description)
    await expect(card.getByRole('img', { name, exact: true }), lab).toHaveCount(1)
    // The name and description come from the diagram's own title and desc.
    await expect(svg.locator(':scope > title'), lab).toHaveText(name)
    await expect(svg.locator(':scope > desc'), lab).toHaveText(description)
  }
})

test('release 6 phase 3: the /labs utilization diagram describes the default /operations shift', async ({ page }) => {
  await page.goto('/operations')
  const waves = await page.locator('#ops-root .ops-wave__meta').allTextContents()
  expect(waves).toHaveLength(6)
  const shown = waves.map((meta) => meta.match(/· (\d+%) ·/)![1])
  await expect(page.locator('#ops-root .ops-targets')).toContainText('util ≥ 50%')
  await page.goto('/labs')
  const description = LAB_FIGS.find(([lab]) => lab === '05')![2]
  expect(description).toContain(`${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`)
  await expect(page.locator('svg.labs-fig[data-lab-fig="05"]')).toHaveAccessibleDescription(description)
})
