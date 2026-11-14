import { test, expect, type Page } from '@playwright/test'

// Pass 2 Phase 1 — /app, /foundry, /brief, /llms.txt and the explainer
// /app's three scenarios are scripted: a "How to read these scenarios" frame sits under the
// lede, the scripted proxy marks each block (Origin blocks nothing) and the labels say
// scripted scenario data, not sandbox data. /foundry shows one "How to read this page"
// frame after the page H1 with and without JavaScript: the no-JS fallback carries a static
// copy and the app renders the same frame after its hero, so nothing on screen moves when
// the app mounts. /llms.txt puts the four-beat maxim on the
// implemented flow and states the offer limit. /brief states the home offer terms, the
// confidentiality line and the TR-A002 landing line. The explainer links /app.

async function localOnly(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
}

test.beforeEach(async ({ page }) => { await localOnly(page) })

const SCRIPTED_BLOCK = /In this simulated scenario,\s+the scripted proxy marks it blocked\s+—\s+and the block is recorded in this scenario's audit chain\./

test('pass 2: /app speaks in the scripted voice in every scenario and in its head meta', async ({ page }) => {
  await page.goto('/app')
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(3)
  // Only the selected scenario is visible with JavaScript, so read each one in turn.
  for (let i = 0; i < 3; i += 1) {
    await tabs.nth(i).click()
    const visible = await page.locator('body').innerText()
    expect(visible, `tab ${i + 1}`).not.toMatch(/Origin\s+blocked\s+it/i)
    expect(visible, `tab ${i + 1}`).not.toMatch(/Simulated\s+\/\s+sandbox\s+data/i)
    expect(visible, `tab ${i + 1}`).not.toMatch(/Side-effect log · sandbox|executed via the proxy in sandbox|sandbox stand-in|sandbox fixtures/i)
    await expect(page.locator('.scen-climax:visible')).toHaveText(SCRIPTED_BLOCK)
  }
  // Three scripted-proxy sentences, one per scenario.
  const climaxes = page.locator('.scen-climax')
  await expect(climaxes).toHaveCount(3)
  for (let i = 0; i < 3; i += 1) await expect(climaxes.nth(i)).toContainText(SCRIPTED_BLOCK)
  await expect(page.locator('.scen-climax b')).toHaveText(Array(3).fill('the scripted proxy marks it blocked'))

  await expect(page.locator('.ec__pilot')).toHaveText('Illustrative console · simulated scenario data (scripted)')
  await expect(page.locator('.ec__note')).toContainText('Simulated scenario data (scripted)')
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
    const content = (await page.locator(selector).getAttribute('content')) ?? ''
    expect(content, selector).toContain('(scripted)')
    expect(content, selector).not.toMatch(/sandbox|prove it/i)
  }
})

test('pass 2: /app frames its scenarios under the lede before the first scenario', async ({ page }) => {
  await page.goto('/app')
  const frame = page.locator('section.ec__read')
  await expect(frame.getByRole('heading', { level: 2, name: 'How to read these scenarios' })).toBeVisible()
  await expect(frame).toContainText('All three scenarios are scripted, interactive walkthroughs.')
  await expect(frame).toContainText('No agent, proxy, approver or sandbox ran.')
  await expect(frame).toContainText('evidence JSON illustrate the evidence format')
  // Right under the H1 and its lede, above the scenario switcher.
  const lede = (await page.locator('.ec__lede').boundingBox())!
  const box = (await frame.boundingBox())!
  const tablist = (await page.getByRole('tablist').boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(lede.y + lede.height - 1)
  expect(box.y + box.height).toBeLessThanOrEqual(tablist.y)
  expect(await frame.locator('li').evaluateAll((items) => items.map((li) => parseFloat(getComputedStyle(li).fontSize)))).toEqual([14, 14, 14])
})

test('pass 2: the /app evidence JSON note says scripted and that no sandbox ran', async ({ page }) => {
  await page.goto('/app')
  for (const pre of await page.locator('details.json pre').all()) {
    const json = JSON.parse((await pre.textContent()) ?? '{}') as { note?: string }
    expect(json.note).toBe('simulated, scripted scenario - no sandbox ran; not a customer run')
  }
})

const FOUNDRY_LINKS = ['/labs', '/proving-ground', '/reference-check']

const FOUNDRY_LINES = [
  'What it is. A browser-local sample floor and a deterministic simulated evaluation, not robot training, deployment, or execution.',
  "What the result means. The oracle's verdict (finish, escalate or refuse) says whether a route on this grid fits its declared rules and budgets.",
  'Its limits. The verdict describes this grid model only, not any physical site or robot.',
]

// Exactly one frame is visible: a region named by its own H2, after the visible page H1,
// with the same three lines and the same cross-links in both modes.
async function expectFoundryFrame(page: Page) {
  const frame = page.getByRole('region', { name: 'How to read this page' })
  await expect(frame).toHaveCount(1)
  await expect(frame).toBeVisible()
  await expect(page.locator('h2', { hasText: 'How to read this page' }).filter({ visible: true })).toHaveCount(1)
  await expect(frame.getByRole('heading', { level: 2, name: 'How to read this page' })).toBeVisible()
  await expect(frame.locator('li')).toHaveText(FOUNDRY_LINES)
  const h1 = (await page.locator('main h1:visible').boundingBox())!
  expect((await frame.boundingBox())!.y).toBeGreaterThanOrEqual(h1.y + h1.height)
  await expect(frame.locator('a')).toHaveCount(FOUNDRY_LINKS.length)
  for (const href of FOUNDRY_LINKS) {
    const link = frame.locator(`a[href="${href}"]`)
    await expect(link, href).toBeVisible()
    expect((await link.boundingBox())!.height, href).toBeGreaterThanOrEqual(44)
  }
}

test('pass 2: /foundry keeps its H1, the reading frame and its cross-links without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/foundry`)
    await expect(page.getByRole('heading', { level: 1, name: 'Origin Foundry' })).toBeVisible()
    await expectFoundryFrame(page)
    // The static frame sits inside the fallback, which hides as a whole once the app mounts.
    await expect(page.locator('.lab-fallback').getByRole('region', { name: 'How to read this page' })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('pass 2: /foundry keeps the reading frame and its cross-links once the app mounts', async ({ page }) => {
  await page.goto('/foundry')
  await expect(page.locator('#root')).not.toBeEmpty()
  await expect(page.locator('.lab-fallback')).toBeHidden()
  await expect(page.locator('main h1:visible')).toHaveCount(1)
  // The static H1 stays in the document for readers without JavaScript.
  await expect(page.locator('main .lab-fallback h1')).toHaveText('Origin Foundry')
  await expectFoundryFrame(page)
  // The app's own frame is the visible one; the fallback's copy stays in the DOM, hidden.
  await expect(page.locator('#root').getByRole('region', { name: 'How to read this page' })).toBeVisible()
  await expect(page.locator('.lab-fallback .lab-frame')).toBeHidden()
})

// The fallback, frame included, hides when the app mounts and the app's frame is new
// content, so nothing that was on screen moves (origin/main measured 0).
for (const [width, height] of [[375, 812], [1280, 720]]) {
  test(`pass 2: /foundry mounts without a layout shift at ${width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
    await page.setViewportSize({ width, height })
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number }
      w.__cls = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as { value: number, hadRecentInput: boolean }[]) if (!entry.hadRecentInput) w.__cls += entry.value
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto('/foundry')
    await expect(page.locator('#root').getByRole('region', { name: 'How to read this page' })).toBeVisible()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0)
  })
}

test('pass 2: /llms.txt puts the four-beat maxim on the implemented flow and states the offer limit', async ({ page }) => {
  const response = await page.request.get('/llms.txt')
  expect(response.status()).toBe(200)
  const text = await response.text()
  expect(text).not.toMatch(/Environment executes/i)
  const maxim = 'Model proposes. Environment verifies. Gate decides. Trace proves. Capability is not permission.'
  expect(text.split(maxim)).toHaveLength(2)
  const sections = text.split(/^## /m)
  const holder = sections.find((section) => section.includes(maxim)) ?? ''
  expect(holder.split('\n')[0]).toBe('Implemented public workflow')
  const engagement = sections.find((section) => section.startsWith('Audience and engagement')) ?? ''
  expect(engagement).toContain("No record of your agent's decisions can be produced today; any record attached is a browser reference check of a selected example policy and rates UNTRUSTED.")
})

test('pass 2: /brief states the offer terms, the confidentiality line and the TR-A002 landing line', async ({ page }) => {
  await page.goto('/brief')
  const main = page.locator('main')
  await expect(page.locator('.brief__top p')).toContainText('September 2026 (revised November 2026) · Working prototype. Seeking design partners.')
  await expect(main).toContainText('45-minute review session · no charge · reply within 2 working days. Not a guarantee of approval.')
  await expect(main).toContainText('you receive a short written report')
  await expect(main).toContainText('Send nothing confidential: no data agreement is in place yet.')
  await expect(main).toContainText("No record of your agent's decisions can be produced today")
  await expect(page.locator('.brief__rung', { hasText: 'TR-A002' })).toContainText('The hash chain is real; the story it tells is scripted.')
})

test('pass 2: the explainer links the three scripted scenarios on /app', async ({ page }) => {
  await page.goto('/reference-check-vs-runtime')
  const link = page.locator('#runtime-enforcement a[href="/app"]')
  await expect(link).toHaveText('Walk three scripted agent scenarios (/app) →')
  await expect(link).toBeVisible()
  expect((await page.request.get('/app')).status()).toBe(200)
})
