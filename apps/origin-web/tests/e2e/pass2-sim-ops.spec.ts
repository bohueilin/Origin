import { test, expect, type Page } from '@playwright/test'

// Pass 2 Phase 1 — sim-ops
// /operations scopes its L0–L4 tiers to the seeded warehouse shift, in the static reading guide
// and in the app. The /simulation note is short and points to "How to read the result" instead of
// repeating it. On a 375 px phone the "collision events (counted)" tile label wraps inside its
// tile, and every tile in the row keeps one height.

const TIER_SCOPE = 'Tiers L0–L4 score this seeded warehouse shift only; the agent reference check and the robot proving ground do not use tiers.'
const SIM_PHRASES = ['oracle-verified', 'bfsOracle', 'reproducible under this verifier', 'no learned-policy result', 'Synthetic layout; seeded + replayable']

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/') ? route.continue() : route.abort('blockedbyclient')
  })
})

const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim()
const occurrences = (text: string, phrase: string) => text.split(phrase).length - 1
const labelled = (page: Page, label: string) => page.locator('b', { hasText: new RegExp(`^${label.replace('.', '\\.')}$`) })

test('pass 2: without JavaScript, the /operations guide scopes tiers to the seeded shift', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/operations`)
    const guide = page.locator('main > section[aria-labelledby="ops-read-title"]')
    const tier = guide.locator('p').filter({ has: labelled(page, 'Tier.') })
    await expect(tier).toHaveCount(1)
    await expect(tier).toContainText(TIER_SCOPE)
    expect(occurrences(squash(await guide.textContent()), TIER_SCOPE)).toBe(1)
  } finally {
    await context.close()
  }
})

test('pass 2: the /operations app note scopes tiers to the seeded shift', async ({ page }) => {
  await page.goto('/operations')
  const note = page.locator('#ops-root .ops-note')
  await expect(note).toContainText(TIER_SCOPE)
  expect(occurrences(squash(await note.textContent()), TIER_SCOPE)).toBe(1)
})

test('pass 2: the /simulation note points to the reading guide instead of repeating it', async ({ page }) => {
  await page.goto('/simulation')
  const note = page.locator('#sim-root .sim-note')
  const guide = page.locator('main > section[aria-labelledby="sim-read-title"]')
  await expect(note).toBeVisible()
  const noteText = squash(await note.textContent())
  const both = `${noteText} ${squash(await guide.textContent())}`
  for (const phrase of SIM_PHRASES) expect(occurrences(both, phrase), phrase).toBe(1)
  // The coordinator rules are written once, in the guide.
  expect(occurrences(both, 'wait-only coordinator')).toBe(1)
  await expect(note.locator('a[href="#sim-read-title"]')).toHaveText('How to read the result')
  // Shorter than the guide's "What runs." paragraph, which the note used to repeat.
  const whatRuns = squash(await guide.locator('p').filter({ has: labelled(page, 'What runs.') }).textContent())
  expect(noteText.length).toBeLessThan(whatRuns.length)
})

test('pass 2: at 375 px the collision tile label wraps inside its tile and the tiles keep one height', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/simulation')
  const row = page.locator('#sim-root .sim-scores')
  const tiles = row.locator(':scope > div')
  await expect(tiles).toHaveCount(5)
  const label = tiles.filter({ hasText: 'collision events (counted)' }).locator('span')
  await expect(label).toHaveText('collision events (counted)')
  const box = await label.evaluate(el => {
    const style = getComputedStyle(el)
    return { display: style.display, scroll: el.scrollWidth, client: el.clientWidth, height: el.getBoundingClientRect().height, line: parseFloat(style.lineHeight), font: parseFloat(style.fontSize) }
  })
  // An inline label has no client width to compare, so the label must be a box of its own.
  expect(box.display).not.toBe('inline')
  expect(box.client).toBeGreaterThan(0)
  expect(box.scroll).toBeLessThanOrEqual(box.client)
  // Its lines sit close enough to read as one label, and it takes at most two of them.
  expect(box.line).toBeLessThanOrEqual(box.font * 1.5)
  expect(Math.round(box.height / box.line)).toBeLessThanOrEqual(2)
  expect(await row.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
  const heights = () => tiles.evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().height)))
  const before = await heights()
  expect(new Set(before).size, `tile heights ${before.join(', ')}`).toBe(1)
  // Replaying from the first tick changes the counters, not the tile heights.
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  expect(await heights()).toEqual(before)
})
