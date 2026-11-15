import { test, expect, type Page } from '@playwright/test'

// Release 6 Phase 3 — /capture reading frame and the four-beat maxim
// /capture has one visible H1, the same text with and without JavaScript, and one "How to read
// this page" frame after it: what the page is, what its result means and its limits, each in
// one sentence drawn from the Site-to-Gym pipeline's code (the grid oracle labels the tasks,
// the metrics replay the oracle and two fixed baselines, the floor-plan parser route needs a
// service token on the public site, the sample package and its panels are synthetic). The
// fallback carries a static copy and the app renders the same frame after its H1, with links
// to /labs, /proving-ground and /reference-check. The page states its flow as the settled
// four-beat maxim ("Model proposes. Environment verifies. Gate decides. Trace proves."), not
// the three-beat form that dropped the gate. The reference-floor library reserves its space
// while its catalogue loads, so nothing on screen moves when the app mounts (origin/main
// measured 0.044 at 1919 x 1080 and 0.124 at 2560 x 1440). /foundry's RSI card and the RSI
// dashboard keep their Gemma line as a lab caption ("In this lab: …"), not as a second maxim.

async function localOnly(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
}

test.beforeEach(async ({ page }) => { await localOnly(page) })

const CAPTURE_H1 = 'Create your site before the robot ever steps on it.'
const CAPTURE_LINES = [
  'What it is. A page that turns your site notes and the files or links you add, or a synthetic sample package, into a small grid map, a set of robot tasks and a trace; no robot is connected.',
  'What the result means. The deterministic grid oracle labels each task finish, escalate or refuse; the metrics replay the oracle and two fixed baselines on those tasks, and the score out of 100 weights map confidence at 45%, label coverage (how many of the three labels the tasks use) at 35% and trace completeness (the run has tasks and at least one input) at 20%, so none of it measures a real site, robot or learned policy.',
  'Its limits. On the public site the model-backed floor-plan parser is restricted, so the map is a template sized by the kinds of input you add and marked from words in your notes and file names; the sample package is synthetic, and the panels it opens show fixed demo numbers.',
]
const CAPTURE_LINKS = ['/labs', '/proving-ground', '/reference-check']
const BEATS = ['Model proposes.', 'Environment verifies.', 'Gate decides.', 'Trace proves.']
const MAXIM = BEATS.join(' ')
const LAB_CAPTION = "In this lab: Gemma proposes; Origin's verifier checks"
const OLD_MAXIM = /Gemma proposes\W+Origin verifies/i
const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim()

// Exactly one frame is visible: a region named by its own H2, after the one visible H1,
// with the three lines, readable type and the three cross-links as 44 x 44 targets.
async function expectCaptureFrame(page: Page) {
  await expect(page.locator('main h1:visible')).toHaveCount(1)
  await expect(page.locator('main h1:visible')).toHaveText(CAPTURE_H1)
  const frame = page.getByRole('region', { name: 'How to read this page' })
  await expect(frame).toHaveCount(1)
  await expect(frame).toBeVisible()
  await expect(page.locator('h2', { hasText: 'How to read this page' }).filter({ visible: true })).toHaveCount(1)
  await expect(frame.locator('li')).toHaveText(CAPTURE_LINES)
  const h1 = (await page.locator('main h1:visible').boundingBox())!
  expect((await frame.boundingBox())!.y).toBeGreaterThanOrEqual(h1.y + h1.height)
  const sizes = await frame.locator('h2, li, b, a').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)))
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(12)
  await expect(frame.locator('a')).toHaveCount(CAPTURE_LINKS.length)
  for (const href of CAPTURE_LINKS) {
    const link = frame.locator(`a[href="${href}"]`)
    await expect(link, href).toBeVisible()
    const box = (await link.boundingBox())!
    expect(box.height, href).toBeGreaterThanOrEqual(44)
    expect(box.width, href).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
}

test('r6 p3: /capture shows its H1 and the reading frame without JavaScript', async ({ browser, baseURL }) => {
  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 720 }]) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport })
    const page = await context.newPage()
    try {
      await page.goto(`${baseURL}/capture`)
      await expectCaptureFrame(page)
      const fallback = page.locator('main .lab-fallback')
      await expect(fallback.getByRole('region', { name: 'How to read this page' })).toBeVisible()
      // The fallback still says what it needs and offers the way back.
      await expect(fallback).toContainText('JavaScript')
      await expect(fallback.getByRole('link', { name: 'Back to Labs' })).toBeVisible()
    } finally {
      await context.close()
    }
  }
})

test('r6 p3: /capture keeps the same H1 and the reading frame once the app mounts', async ({ page }) => {
  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/capture')
    await expect(page.locator('#capture-root')).not.toBeEmpty()
    await expect(page.locator('.lab-fallback')).toBeHidden()
    // The static H1 stays in the document for readers without JavaScript, with the app's words.
    await expect(page.locator('main .lab-fallback h1')).toHaveText(CAPTURE_H1)
    await expectCaptureFrame(page)
    await expect(page.locator('#capture-root').getByRole('region', { name: 'How to read this page' })).toBeVisible()
    await expect(page.locator('.lab-fallback .lab-frame')).toBeHidden()
  }
})

test('r6 p3: /capture states its flow as the four-beat maxim', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/capture')
  const proof = page.locator('.rsi-proof')
  await expect(proof).toBeVisible()
  await expect(proof.locator('strong')).toHaveText(BEATS)
  expect(squash(await proof.locator('strong').evaluateAll((els) => els.map((el) => el.textContent).join(' ')))).toBe(MAXIM)
  // The gate is the human map review the page records; no beat claims more than the code does.
  await expect(proof.locator('div').nth(2)).toContainText('A person approves the map or marks it for correction')
  await expect(proof.locator('div').nth(3)).toContainText('not a signature')
  // The four beats sit in one row on wide screens and stay readable on phones.
  const row = await proof.locator('div').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
  expect(new Set(row).size).toBe(1)
  // The summary strip no longer gives the deciding role to verification.
  await expect(page.locator('.site-thesis')).not.toContainText('Verification decides')
  await expect(page.locator('.site-thesis')).toContainText('Verification labels')
  await page.setViewportSize({ width: 375, height: 812 })
  const sizes = await page.locator('.rsi-proof :is(strong, span), .site-thesis :is(strong, span)').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)))
  expect(sizes).toHaveLength(16)
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(12)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
})

// The fallback hides as a whole when the app mounts and the app's frame is new content. The
// floor library holds a viewport of space while its catalogue loads, so the content after it
// never moves in view when the cards arrive.
for (const [width, height] of [[375, 812], [1280, 720], [1919, 1080], [2560, 1440], [1280, 1600]]) {
  test(`r6 p3: /capture mounts without a layout shift at ${width} x ${height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
    await page.setViewportSize({ width, height })
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number }
      w.__cls = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as { value: number, hadRecentInput: boolean }[]) if (!entry.hadRecentInput) w.__cls += entry.value
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto('/capture')
    await expect(page.locator('#capture-root').getByRole('region', { name: 'How to read this page' })).toBeVisible()
    await expect(page.locator('.floorlib-grid')).toBeVisible()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0)
  })
}

// Only the loading state holds that space. When the catalogue cannot load, the "No reference
// floors available." line keeps its natural height instead of a viewport of blank space.
test('r6 p3: /capture holds the floor-library space only while the catalogue loads', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'the viewport is set explicitly')
  await page.setViewportSize({ width: 375, height: 812 })
  let release = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/factoryceo/library.json', async (route) => { await held; await route.abort('failed') })
  await page.goto('/capture')
  const library = page.locator('.capture .floorlib')
  await expect(library.locator('> .floorlib-loading')).toHaveText('Loading reference floors…')
  expect((await library.boundingBox())!.height).toBeGreaterThanOrEqual(812)
  release()
  const empty = library.locator('> .floorlib-empty')
  await expect(empty).toHaveText('No reference floors available.')
  await expect(library.locator('> .floorlib-loading')).toHaveCount(0)
  const [libraryBox, emptyBox] = [(await library.boundingBox())!, (await empty.boundingBox())!]
  expect(libraryBox.height).toBeLessThanOrEqual(emptyBox.height + 1)
})

test('r6 p3: /foundry and the RSI dashboard keep the Gemma line as a lab caption, not a maxim', async ({ page }) => {
  await page.goto('/foundry')
  const card = page.locator('.fdy-rsi-card')
  await expect(card.getByRole('heading', { level: 2 })).toHaveText(LAB_CAPTION)
  expect(await page.locator('main').innerText()).not.toMatch(OLD_MAXIM)

  await page.goto('/rsi/rsi_dashboard.html')
  const claim = page.locator('header.hero .claim')
  await expect(claim).toBeVisible()
  expect(squash(await claim.textContent())).toMatch(/^In this lab: Gemma proposes; Origin's verifier checks; the oracle is the judge/)
  expect(await page.locator('main').innerText()).not.toMatch(OLD_MAXIM)
})
