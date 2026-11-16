import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Release 7 — sub-page polish
// R08/F15  /trust: from 960 px the hero is two columns, with a static "Release gate receipt" on
//          the right. The card names what `make gates-all` checks and holds no count of its own;
//          the scoreboard script fills "N of M suites passed" from /trust/gates-summary.json.
//          Phones stack it after the copy.
// R09      /foundry: the reading frame says what the sample floor holds and what the oracle and
//          the in-browser single-failure check return for it, re-derived here from the source.
// R12      /proof: "The ladder" says what a reviewer can re-check at each rung, and with what,
//          instead of restating the rung definitions a third time.
// R13      /labs: the spatial research card says what question it studies, and that no input,
//          rule or verdict format is published.
// R14      /verify: the hero specimen report is visible on load, before any paste or click.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim()
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

// Every visible link, button and summary inside the root, with its box (a control wrapped in its
// label is measured by the label, as r6-p4-tap-targets.spec.ts does).
const smallTargets = (page: Page, root: string) => page.evaluate((sel) => {
  const out: string[] = []
  for (const el of document.querySelectorAll(`${sel} :is(a[href], button, summary, input, select, textarea)`)) {
    const target = (el.closest('label') ?? el) as HTMLElement
    if (!target.checkVisibility()) continue
    const b = target.getBoundingClientRect()
    if (b.width < 44 || b.height < 44) out.push(`${squash(target.textContent).slice(0, 40)} ${Math.round(b.width)}x${Math.round(b.height)}`)
  }
  return out
  function squash(t: string | null) { return (t ?? '').replace(/\s+/g, ' ').trim() }
}, root)

// ---------------------------------------------------------------- R08 / F15: /trust
const gates = JSON.parse(source('../../public/trust/gates-summary.json')) as { suites: Array<{ result: string }> }
const RECEIPT = 'Release gate receipt'
const trustBoxes = (page: Page) => page.evaluate(() => {
  const grid = document.querySelector('.editorial-hero__grid')!
  const box = (el: Element) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top + scrollY, bottom: b.bottom + scrollY, width: b.width, height: b.height } }
  return { grid: box(grid), copy: box(grid.children[0]), card: box(grid.children[1]), cardIsReceipt: grid.children[1].id === 'gate-receipt' }
})

test('release 7: /trust opens as two columns from 960 px with the gate receipt filling the right', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  for (const [width, height] of [[1919, 998], [1280, 800]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/trust')
    const card = page.getByRole('region', { name: RECEIPT, exact: true })
    await expect(card).toBeVisible()
    await expect(card).toBeInViewport()
    const { grid, copy, card: right, cardIsReceipt } = await trustBoxes(page)
    const at = `${width}px`
    expect(cardIsReceipt, at).toBe(true)
    // Side by side: the card sits right of the copy, level with it, and takes 35–50% of the row.
    expect(right.left, at).toBeGreaterThan(copy.right + 24)
    expect(right.top, at).toBeLessThan(copy.top + 40)
    expect(right.width / grid.width, at).toBeGreaterThan(0.35)
    expect(right.width / grid.width, at).toBeLessThan(0.5)
    // Filled and balanced: the card is at least 80% of the copy's height and ends within 64 px of it.
    expect(right.height / copy.height, at).toBeGreaterThan(0.8)
    expect(Math.abs(right.bottom - copy.bottom), at).toBeLessThanOrEqual(64)
    expect(await overflow(page), at).toBeLessThanOrEqual(0)
    console.log(`/trust hero ${at}: copy ${JSON.stringify(copy)} card ${JSON.stringify(right)}`)
  }
})

test('release 7: /trust stacks the gate receipt after the copy on a phone, with no sideways scroll and 44 px targets', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/trust')
  await expect(page.getByRole('region', { name: RECEIPT, exact: true })).toBeVisible()
  const { copy, card } = await trustBoxes(page)
  expect(card.top).toBeGreaterThanOrEqual(copy.bottom)
  expect(Math.abs(card.left - copy.left)).toBeLessThanOrEqual(1)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  expect(await smallTargets(page, '.editorial-hero')).toEqual([])
  console.log(`/trust hero 375px: copy ${JSON.stringify(copy)} card ${JSON.stringify(card)}`)
})

test('release 7: the gate receipt takes its count from gates-summary.json and holds none in HTML', async ({ page }) => {
  // The static card states what is checked and where the summary is, never a count.
  const html = source('../../trust.html')
  const card = html.slice(html.indexOf('<section class="gate-receipt"'), html.indexOf('</section>', html.indexOf('<section class="gate-receipt"')))
  expect(card).toContain('make gates-all')
  expect(card).toContain('href="/trust/gates-summary.json"')
  expect(card).not.toMatch(/\d+\s+(of\s+\d+\s+)?(suites|tests|passed)/i)
  for (const check of ['Build', 'Unit tests', 'Evidence', 'Honesty']) expect(card).toContain(`<dt>${check}</dt>`)
  expect(card).toContain('launch contracts')

  await page.goto('/trust')
  const status = page.locator('[data-gate-receipt-status]')
  const passed = gates.suites.filter((s) => s.result === 'PASS').length
  await expect(status).toContainText(`${passed} of ${gates.suites.length} suites passed`)
  // The same summary renders the scoreboard table below: one row per suite.
  await expect(page.locator('#gates-scoreboard tr')).toHaveCount(gates.suites.length)
  await expect(status.getByRole('link', { name: 'summary JSON' })).toHaveAttribute('href', '/trust/gates-summary.json')
})

test('release 7: without JavaScript the gate receipt still says what is checked and links the summary', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/trust`)
    const card = page.getByRole('region', { name: RECEIPT, exact: true })
    await expect(card).toBeVisible()
    await expect(card.locator('dt')).toHaveText(['Build', 'Unit tests', 'Evidence', 'Honesty'])
    await expect(card.locator('[data-gate-receipt-status] a')).toHaveAttribute('href', '/trust/gates-summary.json')
    await expect(card).toContainText('A timestamped snapshot is evidence of that run, not a live assurance.')
  } finally {
    await context.close()
  }
})

// ---------------------------------------------------------------- R09: /foundry
async function sampleFloorFacts() {
  const { sampleFloorMap } = await import('../../src/foundry/sampleFloor')
  const { analyzeFloorMargin } = await import('../../src/floorMargin')
  const { siteMapToWarehouseTask } = await import('../../src/siteEval')
  const { bfsOracle } = await import('../../src/warehouse')
  const map = sampleFloorMap()
  const margin = analyzeFloorMargin(map)
  const oracle = bfsOracle(siteMapToWarehouseTask(map, 'amr'))
  return { map, margin, oracle }
}

test('release 7: the /foundry reading frame describes the sample floor exactly as the source computes it', async ({ browser, baseURL, page }) => {
  const { map, margin, oracle } = await sampleFloorFacts()
  // What the sentence relies on, checked against the source first.
  expect(map.robots).toEqual([])
  expect(map.hazards.every((h) => h.y === map.item.y && h.y === map.drop.y && h.x > map.item.x && h.x < map.drop.x)).toBe(true)
  expect(oracle.label).toBe('finish')
  expect(margin.verdict).toBe('finish')
  expect(margin.singleFailureSafe).toBe(true)
  expect(margin.criticalCells).toEqual([])
  const moves = oracle.optimalPath.filter((a) => a.startsWith('move:')).length
  // The oracle's route steps around the hazard cells.
  const hazards = new Set(map.hazards.map((h) => `${h.x},${h.y}`))
  const at = { ...map.start }
  for (const a of oracle.optimalPath) {
    if (a === 'move:north') at.y -= 1; else if (a === 'move:south') at.y += 1; else if (a === 'move:east') at.x += 1; else if (a === 'move:west') at.x -= 1
    expect(hazards.has(`${at.x},${at.y}`)).toBe(false)
  }

  const expected = `The sample floor. “Use the sample floor” loads one fixed ${map.width} × ${map.height} grid: a dock, a pick cell and a drop cell, ` +
    `${map.obstacles.length} wall cells, ${map.hazards.length} hazard cells on the row between the pick and the drop, and ${map.humanOnly.length} human-only cell. ` +
    `It places no robots, so no fleet runs; the check scores one route for one AMR. The oracle returns ${oracle.label}, with a ${moves}-move route around the hazards. ` +
    `The page shows the grid, labelled as a sample floor, not parsed from an upload, and a single-failure check computed in your browser: ` +
    `no chokepoints in ${margin.sweptCells} swept cells, and a budget-blind disconnection margin of ${margin.disconnectionMargin} free cells. ` +
    'The Quorum loop that would step a proposal across the floor runs only in a separately enabled local/backend demo, not here.'

  // Without JavaScript: the static frame.
  const context = await browser.newContext({ javaScriptEnabled: false })
  const noJs = await context.newPage()
  try {
    await noJs.goto(`${baseURL}/foundry`)
    const frame = noJs.getByRole('region', { name: 'How to read this page' })
    expect(squash(await frame.locator('.lab-frame__sample').textContent())).toBe(expected)
  } finally {
    await context.close()
  }

  // With the app mounted: the app's frame carries the same paragraph, and the sample floor shows
  // what it says.
  await page.goto('/foundry')
  const frame = page.locator('#root').getByRole('region', { name: 'How to read this page' })
  await expect(frame.locator('.lab-frame__sample')).toBeVisible()
  expect(squash(await frame.locator('.lab-frame__sample').textContent())).toBe(expected)
  await page.getByRole('button', { name: 'Use the sample floor' }).click()
  await expect(page.getByText('sample floor — not parsed from an upload', { exact: true })).toBeVisible()
  await expect(page.getByText(`Single-failure analysis: no chokepoints in ${margin.sweptCells} swept cells`)).toBeVisible()
  await expect(page.getByText(`Disconnection margin: ${margin.disconnectionMargin} free cells (exact min cut`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run the Quorum loop' })).toBeDisabled()
})

// ---------------------------------------------------------------- R12: /proof
const trace = JSON.parse(source('../../public/proof/tr-a002.json')) as { final_digest: string }

test('release 7: /proof "The ladder" says what a reviewer can re-check at each rung, not the rung definitions again', async ({ page }) => {
  await page.goto('/proof')
  const section = page.locator('#ladder')
  await expect(section.locator('h2')).toHaveText('What a reviewer can re-check at each rung.')
  const rungs = section.locator('.rung')
  await expect(rungs).toHaveCount(3)
  await expect(rungs.nth(0).locator('dt')).toHaveText(['Re-check', 'With', 'Cannot show'])
  await expect(rungs.nth(1).locator('dt')).toHaveText(['Re-check', 'With', 'Catches', 'Cannot show'])
  await expect(rungs.nth(2).locator('dt')).toHaveText(['Would add', 'Why not held'])

  const text = squash(await section.textContent())
  // The old restatement is gone.
  for (const old of ['Three rungs, labeled for exactly what they are.', 'Each rung is a different kind of evidence.',
    'A hand-authored example of the evidence-package format', 'Evidence from a real external workflow, published only once']) {
    expect(text).not.toContain(old)
  }
  // The mechanics, with the page's own command and digest.
  expect(text).toContain('node scripts/verify-tr-a002.mjs tr-a002.json')
  expect(text).toContain(`${trace.final_digest.slice(0, 12)}…`)
  expect(text).toContain('illustrative_digest')
  // The honesty limits stay.
  expect(text).toContain('That any agent, policy gate, proxy, approver or sandbox ran: the events are typed into the script. The top-level description is outside the chain.')
  expect(text).toContain('A hash chain cannot show that: it re-derives just as well over scripted events.')
  expect(text).toContain('No design partner has run a workflow with Origin, so there are no events to chain.')
  expect(text).not.toMatch(/\bproves?\b/i)
  await expect(rungs.nth(2).locator('.rung__badge')).toHaveText('When earned')
})

// ---------------------------------------------------------------- R13: /labs
test('release 7: the /labs spatial research card says what it studies and what is not published', async ({ page }) => {
  await page.goto('/labs')
  const card = page.locator('.labs-card[data-lab="06"]')
  await expect(card).toContainText('The implementation is private and is not a public product surface.')
  await expect(card.locator('[data-lab-checks]')).toHaveText(
    'The question it studies, given a reconstructed outline and the points it was built from: which edges rest on recorded points (observed) ' +
    'and which were filled in between them (inferred), so that a spatial claim resting on an inferred edge is not reported as observed. ' +
    'No input format, rule set or verdict format for it is published yet.',
  )
})

// ---------------------------------------------------------------- R14: /verify
test('release 7: the /verify specimen report is visible on load, before any paste or click', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  const { buildPolicyEvaluation } = await import('@origin/verifier-core/policyEvaluation')
  const { SUPPORT_PRESETS } = await import('../../src/certify/policySpec')
  const { summary } = buildPolicyEvaluation({ scenario: 'support', parameters: SUPPORT_PRESETS.permissive.spec })
  for (const [width, height] of [[1919, 998], [375, 812]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/verify')
    const spec = page.getByRole('figure', { name: 'What a report shows', exact: true })
    const at = `${width}px`
    await expect(spec, at).toBeVisible()
    // On a wide screen it is in the first viewport; on a phone it follows the copy, unhidden.
    if (width > 960) await expect(spec, at).toBeInViewport()
    expect(squash(await spec.locator('.hero-spec__counts').textContent()), at)
      .toBe(`${summary.matched} of ${summary.total} match · ${summary.over_grants} over-grants · ${summary.misses} misses`)
    await expect(spec.locator('.hero-spec__outcomes b'), at).toHaveText(['UNTRUSTED', 'VOID'])
    for (const label of await spec.locator('.hero-spec__counts, .hero-spec__outcomes li').all()) {
      const box = (await label.boundingBox())!
      expect(box.width * box.height, at).toBeGreaterThan(0)
    }
    // Nothing was pasted or verified: the field is empty.
    await expect(page.locator('#vfy-artifact'), at).toHaveValue('')
    expect(await overflow(page), at).toBeLessThanOrEqual(0)
  }
})
