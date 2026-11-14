import { test, expect, type Locator, type Page } from '@playwright/test'

// Pass 2 Phase 2 — blast-radius figures and experiment claims
// /over-grant draws its recorded run before any click: the seeded fleet's granted scopes
// split into exercised and never exercised, and the root agent-000's reach over the nine
// sensitive resources before and after one widened edge, with the planted-edge result.
// /security experiment 05 draws its six-identity tree's reach in both states, 06 draws the
// held-versus-exercised split, and every experiment states how it works and what it shows,
// with and without JavaScript. The figures are static: ink and one green, nothing animates,
// every rendered letter is 12 px or larger, and nothing scrolls sideways.

test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

async function localOnly(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
}

const HELD = 'Granted scopes held at window start, split by whether they were exercised'
const RECORDED_REACH = "Root agent-000's reach over 9 sensitive resources, before and after one widened edge"
const PANEL_REACH = "Two fixed states: the root's reach before and after payroll-bot gains hr-records:read, a scope its parent ops never held"
const FLEET_HELD = 'Granted scopes held at window start in the synthetic fleet (seed 20260818, 400 roots), split by whether they were exercised'
const SENSITIVE = ['payroll', 'customer-pii', 'ledger', 'wire-transfer', 'source-secrets', 'hr-records', 'prod-db', 'audit-log', 'object-store-public']
const CARDS = ['signatures', 'batches', 'policy-history', 'config-binding', 'delegation', 'fleet-analysis']

// Each resource node's name and mark, in catalogue order: reached, new or none.
async function nodes(list: Locator) {
  return list.locator('li').evaluateAll(items => items.map(li => [
    li.firstChild?.textContent ?? '',
    li.classList.contains('is-new') ? 'new' : li.classList.contains('is-reached') ? 'reached' : 'none',
  ]))
}
const marks = (reached: string[], fresh = '') => SENSITIVE.map(id => [id, id === fresh ? 'new' : reached.includes(id) ? 'reached' : 'none'])

// Every visible text node under the roots: its rendered font size, plus page overflow,
// running animations and SMIL elements.
async function audit(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const roots = [...document.querySelectorAll(sel)].filter(el => el.getClientRects().length)
    const sizes: { text: string, size: number }[] = []
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        const el = node.parentElement!
        if (!node.textContent!.trim() || el.closest('.sr-only') || !el.getClientRects().length) continue
        sizes.push({ text: node.textContent!.trim(), size: parseFloat(getComputedStyle(el).fontSize) })
      }
    }
    return {
      roots: roots.length,
      small: sizes.filter(s => s.size < 12),
      texts: sizes.length,
      overflow: document.documentElement.scrollWidth > innerWidth,
      animations: roots.flatMap(root => root.getAnimations({ subtree: true })).length,
      smil: roots.reduce((n, root) => n + root.querySelectorAll('animate, animateTransform, animateMotion, set').length, 0),
    }
  }, selector)
}

const FIGURES = '.og-figs, .reach-fig, .sec-claim, .og-fig, .sec-static-claim'

test('pass 2 phase 2: /over-grant draws the recorded run before any click', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/over-grant')
  const section = page.locator('section.og-figs')
  await expect(section).toContainText('seed 20260818, 400 roots, 2,074 synthetic identities, a 30-day window')
  await expect(section).toContainText('not a customer deployment')

  const held = page.getByRole('figure', { name: HELD, exact: true })
  await expect(held).toBeVisible()
  await expect(held).toContainText('8,675 granted scopes')
  await expect(held.locator('dd').nth(0)).toHaveText('3,194 · 36.8%')
  await expect(held.locator('dd').nth(1)).toHaveText('5,481 · 63.2%')
  const bar = await held.locator('.og-bar').boundingBox()
  const used = await held.locator('.og-bar__used').boundingBox()
  expect(used!.width / bar!.width).toBeGreaterThan(0.36)
  expect(used!.width / bar!.width).toBeLessThan(0.375)

  const reach = page.getByRole('figure', { name: RECORDED_REACH, exact: true })
  await expect(reach).toBeVisible()
  await expect(reach.getByRole('list', { name: 'The delegation path that changed' }).locator('li')).toHaveText([
    'agent-000 root; its own grant does not change',
    'agent-000.0 holds no payroll scope',
    'agent-000.0.0 gains payroll:read, two hops below the root',
  ])
  await expect(reach).toContainText('Before · agent-000 reaches 5 of 9 (55.6%).')
  await expect(reach).toContainText('After · agent-000 reaches 6 of 9 (66.7%).')
  const before = ['customer-pii', 'ledger', 'source-secrets', 'prod-db', 'object-store-public']
  expect(await nodes(reach.getByRole('list', { name: 'Before: sensitive resources' }))).toEqual(marks(before))
  expect(await nodes(reach.getByRole('list', { name: 'After: sensitive resources' }))).toEqual(marks(before, 'payroll'))
  await expect(reach.getByRole('list', { name: 'After: sensitive resources' }).locator('li').first()).toContainText('payroll, newly reachable')
  await expect(reach).toContainText('the analyzer caught 90 of 90, with 0 false positives, against synthetic ground truth')

  // The figures sit between the hero and the interactive panel, and hold no focus stop,
  // so the keyboard still reaches the panel's first control straight from the hero.
  const hero = (await page.locator('.product-hero').boundingBox())!
  const figures = (await section.boundingBox())!
  expect(figures.y).toBeGreaterThanOrEqual(hero.y + hero.height)
  expect(figures.y + figures.height).toBeLessThanOrEqual((await page.locator('#delegation').boundingBox())!.y)
  await expect(section.locator('a, button, [tabindex]')).toHaveCount(0)
  // The 05 panel's own fixed figure would repeat these here; /security shows it.
  await expect(page.locator('#delegation .reach-fig')).toBeHidden()
  await expect(page.locator('#fleet-analysis')).toBeVisible()
  await expect(page.locator('#fleet-analysis .og-fig')).toHaveCount(0)
})

test('pass 2 phase 2: /security 05 shows both states and 06 the held split without a click', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/security')
  const panel = page.locator('#delegation')
  const reach = panel.getByRole('figure', { name: PANEL_REACH, exact: true })
  await expect(reach).toBeVisible()
  await expect(reach).toContainText('Before · platform reaches 5 of 9 sensitive resources.')
  await expect(reach).toContainText('After · platform reaches 6 of 9 sensitive resources.')
  const before = ['payroll', 'customer-pii', 'ledger', 'wire-transfer', 'source-secrets']
  expect(await nodes(reach.getByRole('list', { name: 'Before: sensitive resources' }))).toEqual(marks(before))
  expect(await nodes(reach.getByRole('list', { name: 'After: sensitive resources' }))).toEqual(marks(before, 'hr-records'))
  // The figure is fixed: widening an edge changes the live tree, not the figure.
  await panel.getByRole('button', { name: 'Widen pii-bot', exact: true }).click()
  await expect(panel.locator('.sec-log')).toContainText('6 / 9 sensitive resources reachable')
  expect(await nodes(reach.getByRole('list', { name: 'After: sensitive resources' }))).toEqual(marks(before, 'hr-records'))

  const held = page.locator('#fleet-analysis').getByRole('figure', { name: FLEET_HELD, exact: true })
  await expect(held).toBeVisible()
  await expect(held).toContainText('8,675 granted scopes')
  await expect(held.locator('dd').nth(0)).toHaveText('3,194 · 36.8%')
  await expect(held.locator('dd').nth(1)).toHaveText('5,481 · 63.2%')
})

test('pass 2 phase 2: every /security experiment states how it works and what it shows, with and without JavaScript', async ({ browser, baseURL, page }) => {
  await page.goto('/security')
  const mounted: string[][] = []
  for (const id of CARDS) {
    const claim = page.locator(`#${id} > .sec-claim`)
    await expect(claim.locator('dt'), id).toHaveText(['How it works', 'What it shows'])
    mounted.push(await claim.locator('dd').allTextContents())
  }
  expect(mounted.every(([how, shows]) => how.length > 40 && shows.length > 40)).toBe(true)
  expect(mounted[0][1]).toContain('It does not show whose key it is.')
  expect(mounted[1][1]).toContain('It does not show that what a receipt says is true.')
  expect(mounted[2][1]).toContain('Nothing signs the chain here')
  expect(mounted[3][1]).toContain('No agent is contacted or run, and the credential is unsigned.')
  expect(mounted[4][1]).toContain('the root reaches 5 of 9; one widened edge lifts it to 6 of 9')
  expect(mounted[5][1]).toContain('not a real fleet')

  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const noJs = await context.newPage()
    await localOnly(noJs)
    await noJs.goto(`${baseURL}/security`)
    const statics = noJs.locator('#security-root .sec-static-claim')
    await expect(statics.locator(':scope > p')).toHaveText(['01 · Signature integrity', '02 · Batch inclusion', '03 · Policy history', '04 · Configuration binding', '06 · Authority analysis'])
    const texts = await statics.evaluateAll(blocks => blocks.map(b => [...b.querySelectorAll('dd')].map(dd => dd.textContent)))
    const prerendered = await noJs.locator('#delegation > .sec-claim dd').allTextContents()
    expect([...texts.slice(0, 4), prerendered, texts[4]]).toEqual(mounted)
    await expect(noJs.getByRole('figure', { name: PANEL_REACH, exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
})

for (const route of ['/over-grant', '/security']) {
  test(`pass 2 phase 2: the ${route} figures stay legible, still and inside the page at 375 and 1280`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(route)
      await expect(page.locator(route === '/security' ? '#fleet-analysis .og-fig' : 'section.og-figs')).toBeVisible()
      const result = await audit(page, FIGURES)
      const at = `${route} at ${width}px`
      expect(result.roots, at).toBeGreaterThanOrEqual(route === '/security' ? 8 : 5)
      expect(result.texts, at).toBeGreaterThan(40)
      expect(result.small, at).toEqual([])
      expect(result.overflow, at).toBe(false)
      expect(result.animations, at).toBe(0)
      expect(result.smil, at).toBe(0)
      // On a phone the before and after states stack instead of shrinking side by side.
      const reach = page.locator('.reach-fig__states:visible').first()
      const [first, second] = await reach.locator('> div').evaluateAll(states => states.map(s => s.getBoundingClientRect().toJSON()))
      if (width === 375) expect(second.y, at).toBeGreaterThanOrEqual(first.y + first.height)
      else expect(second.y, at).toBe(first.y)
    }
  })
}
