// Investor-ready front-door contract.
//
// This file is the executable specification for the focused cut described in
// docs/superpowers/specs/2026-08-03-origin-investor-ready-design.md: one
// implemented product (the configuration-bound Agent Reference Check), one
// proof path (attestation → offline VALID → changed field VOID), and no
// affordance that looks like it works when it does not.
//
// These assertions are written BEFORE the implementation and are expected to
// fail until Tasks 2–6 land. If one of them ever contradicts the approved
// design, fix the product or raise it — do not weaken the test.

import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const HERO = 'Test the policy. Inspect the evidence.'

// The approved design keeps the existing mobile burger, so on the mobile project
// the primary nav is collapsed until it is opened. Open it before asserting on
// nav contents — the links must be REACHABLE on both viewports, not permanently
// painted on a 390px screen.
async function openPrimaryNav(page: import('@playwright/test').Page) {
  const toggle = page.locator('[data-nav-toggle]')
  if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
}

test('home presents one implemented product and one primary path', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText(HERO)
  await expect(page.getByText('Evidence for agent decisions', { exact: true })).toBeVisible()
  // The hero's maturity boundary and buyer line were merged into one .hero__status line
  // when the hero was cut from seven text blocks to four; the boundary itself is
  // unchanged in substance and must stay visible in the hero, so keep pinning it.
  await expect(page.locator('.hero__status')).toContainText('Origin does not contact or execute your named agent. Browser evidence is untrusted by default.')
  // The maturity boundary is back in the hero (DESIGN_PRINCIPLES.md, Honesty).
  await expect(page.locator('.hero__status')).toContainText('Not production SaaS or compliance certification')

  await openPrimaryNav(page)
  const nav = page.getByRole('navigation', { name: 'Primary' })
  for (const label of ['Product', 'Demo', 'Proving Ground', 'Evidence', 'Trust', 'Run reference check']) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  await expect(nav.getByRole('link', { name: /Foundry|Sign in/i })).toHaveCount(0)

  await expect(page.locator('.hero__actions').getByRole('link', { name: 'Run the reference check', exact: true })).toHaveAttribute('href', '/reference-check')
  await expect(page.getByRole('link', { name: 'Step through the 5-stage demo', exact: true })).toHaveAttribute('href', '#demo')
  // Count AND order. The count-only version passed while the sections sat in the
  // wrong sequence (audit finding M7) — the spec fixes the order, so pin it.
  await expect(page.locator('[data-investor-section]')).toHaveCount(7)
  const ids = await page.locator('[data-investor-section]').evaluateAll((nodes) => nodes.map((n) => n.id))
  expect(ids).toEqual(['product', 'demo', 'problem', 'evidence', 'offer', 'trust', 'contact'])
})

test('primary navigation is consistent across public product and Labs routes', async ({ page }) => {
  for (const route of ['/', '/reference-check', '/verify', '/trust', '/security', '/labs', '/simulation', '/operations', '/proving-ground', '/over-grant', '/brief', '/proof', '/reference-check-vs-runtime', '/app']) {
    await page.goto(route)
    await openPrimaryNav(page)
    const nav = page.getByRole('navigation', { name: 'Primary' })
    for (const label of ['Product', 'Demo', 'Proving Ground', 'Evidence', 'Trust', 'Run reference check']) {
      await expect(nav.getByRole('link', { name: label, exact: true }), route).toBeVisible()
    }
    await expect(nav.getByRole('link', { name: /Foundry|Sign in/i }), route).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Proving Ground', exact: true })).toHaveAttribute('href', '/proving-ground')
    if (route === '/proving-ground') await expect(nav.getByRole('link', { name: 'Proving Ground', exact: true })).toHaveAttribute('aria-current', 'page')
  }
})

test('home demo reflects the implemented reference-check lifecycle', async ({ page }) => {
  await page.goto('/')
  const demo = page.locator('[data-demo]')
  await expect(demo).toBeVisible()
  for (const label of ['Bind', 'Challenge', 'Grade', 'Attest', 'Reverify']) {
    await expect(demo.getByRole('tab', { name: new RegExp(label, 'i') })).toBeVisible()
  }
  await demo.getByRole('tab', { name: /Reverify/i }).click()
  await expect(demo).toContainText('VOID')
  await expect(demo.getByRole('link', { name: /Run the reference check/i })).toHaveAttribute('href', '/reference-check')
  await expect(demo.getByRole('link', { name: /Verify evidence/i })).toHaveAttribute('href', '/verify')
})

test('lead form is a low-friction four-field request', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Book an Agent Evidence Review/i }).first().click()
  const modal = page.getByRole('dialog')
  await expect(modal.locator('.field')).toHaveCount(4)
  for (const label of ['Name', 'Work email', 'Company', 'What is blocking approval?']) {
    await expect(modal.getByLabel(label, { exact: false })).toBeVisible()
  }
  await expect(modal).not.toContainText('No spam. No spam.')
})

test('evidence console does not style simulated states as working buttons', async ({ page }) => {
  await page.goto('/app.html')
  await expect(page.locator('.approvals .btn')).toHaveCount(0)
  await expect(page.getByText(/simulated \/ sandbox data/i).first()).toBeVisible()
  await expect(page.getByText(/Simulated approval state/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Download simulated evidence JSON/i }).first()).toBeVisible()
})

test('the header shows exactly ONE primary CTA at every viewport', async ({ page }) => {
  // Two "Run reference check" buttons shipped once: home.css changed without a
  // ?v= bump, so returning visitors kept CSS that lacked the rule hiding the
  // mobile twin on desktop. scripts/css-version-lint.mjs prevents the cause;
  // this pins the symptom regardless of cause.
  for (const route of ['/', '/reference-check', '/trust', '/labs']) {
    await page.goto(route)
    const visible = page.locator('.site-header a[href="/reference-check"]:visible')
    await expect(visible, route).toHaveCount(1)
  }
})

test('home has no horizontal overflow and keeps the primary action reachable', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await expect(page.locator('.hero__actions').getByRole('link', { name: 'Run the reference check', exact: true })).toBeVisible()
})

test('demo tabs support keyboard navigation', async ({ page }) => {
  await page.goto('/')
  const first = page.getByRole('tab', { name: /Bind/i })
  await first.focus()
  await first.press('ArrowRight')
  await expect(page.getByRole('tab', { name: /Challenge/i })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: /Reverify/i })).toBeFocused()
  await expect(page.getByRole('tabpanel', { name: /Reverify/i })).toBeVisible()
})

test('social card presents the current product at 1200 by 630', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Origin — Move AI forward. With evidence.')
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /working prototypes.*deterministic policy checks/i)

  await page.goto('/og-cover.jpg')
  const dimensions = await page.locator('img').evaluate((image: HTMLImageElement) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))
  expect(dimensions).toEqual({ width: 1200, height: 630 })
})

test('public surfaces agree on the first product and maturity', async ({ page }) => {
  for (const route of ['/', '/brief', '/trust', '/reference-check-vs-runtime', '/llms.txt']) {
    const response = await page.request.get(route)
    expect(response.status(), route).toBe(200)
    const text = await response.text()
    expect(text, route).toMatch(/reference check/i)
    // NOTE: only 'tamper-proof' is banned outright. 'reviewer-accepted' is
    // deliberately NOT matched here — scripts/honesty-lint.mjs:63-69 documents that
    // NEGATED disclaimers ("review-ready, not reviewer-accepted") are the APPROVED
    // phrasing, and a naive token ban trains people to delete the disclaimer.
    expect(text, route).not.toMatch(/tamper-proof/i)
  }

  const home = await (await page.request.get('/')).text()
  expect(home).not.toMatch(/Origin enforces runtime policy|routes tool calls through a controlled proxy/i)

  for (const route of ['/auth', '/legal/privacy-policy.html', '/legal/terms-of-service.html']) {
    const text = await (await page.request.get(route)).text()
    expect(text, route).not.toMatch(/tamper-proof|production-certified/i)
  }
})

test('evidence console downloads the displayed simulated JSON locally', async ({ page }) => {
  await page.goto('/app.html')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download simulated evidence JSON/i }).first().click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/simulated-evidence\.json$/)
  const path = await download.path()
  expect(path).toBeTruthy()
  const artifact = JSON.parse(await readFile(path!, 'utf8'))
  expect(JSON.stringify(artifact)).toMatch(/simulated|sandbox/i)
})

// The gates strip (/) and scoreboard (/trust) render a LOCAL `make gates-all` run.
// They must say so, name the commit only for a clean tracked tree, and never claim
// that CI enforced the result. Served from a fixture so the date never goes stale.
const GATES_SHA = 'abc1234'
function gatesFixture(trackedClean: boolean) {
  return {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    commit: GATES_SHA,
    tracked_clean: trackedClean,
    all_green: true,
    suites: [
      { name: 'ts:origin-web', result: 'PASS', detail: 'Tests  1 passed (1)' },
      { name: 'honesty-lint', result: 'PASS', detail: 'honesty-lint: clean' },
    ],
  }
}

test('home gates strip names a local run and its commit, not CI enforcement', async ({ page }) => {
  await page.route('**/trust/gates-summary.json', (route) => route.fulfill({ json: gatesFixture(true) }))
  await page.goto('/')
  const strip = page.locator('#gates-freshness')
  await expect(strip).toContainText('Local gate run')
  await expect(strip).toContainText(GATES_SHA)
  await expect(strip).toContainText('2/2 suites green')
  await expect(strip).not.toContainText('Verified')
  await expect(strip).not.toContainText('enforced in CI')

  // A run over a dirty tracked tree does not identify the tested code: no sha.
  await page.unroute('**/trust/gates-summary.json')
  await page.route('**/trust/gates-summary.json', (route) => route.fulfill({ json: gatesFixture(false) }))
  await page.reload()
  await expect(strip).toContainText('Local gate run')
  await expect(strip).not.toContainText(GATES_SHA)
})

test('trust scoreboard names a local run and its commit, not CI enforcement', async ({ page }) => {
  await page.route('**/trust/gates-summary.json', (route) => route.fulfill({ json: gatesFixture(true) }))
  await page.goto('/trust')
  const board = page.locator('#gates-scoreboard')
  await expect(board).toContainText('local run of make gates-all at ' + GATES_SHA)
  await expect(board).not.toContainText('enforced in CI')
})

// A release build (deploy-origin-web.yml) runs gates-all at the deployed commit and
// stamps source/commit/built_at/run_url. Both surfaces then name the release and link
// the Actions run; after 14 days the amber note says the results are that release's.
const RELEASE_SHA = 'def5678'
const RUN_URL = 'https://github.com/bohueilin/Origin/actions/runs/123456789'
function releaseFixture(ageDays: number, runUrl = RUN_URL) {
  const at = new Date(Date.now() - ageDays * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  return { ...gatesFixture(true), generated_at: at, commit: RELEASE_SHA, source: 'release', built_at: at, run_url: runUrl }
}

test('home gates strip names the release commit and its Actions run when stamped at release', async ({ page }) => {
  await page.route('**/trust/gates-summary.json', (route) => route.fulfill({ json: releaseFixture(0) }))
  await page.goto('/')
  const strip = page.locator('#gates-freshness')
  await expect(strip).toContainText(`Gates passed at release ${RELEASE_SHA} on`)
  await expect(strip).toContainText('2/2 suites green')
  await expect(strip.getByRole('link', { name: /Actions run/ })).toHaveAttribute('href', RUN_URL)
  await expect(strip).not.toContainText('Local gate run')

  await page.unroute('**/trust/gates-summary.json')
  await page.route('**/trust/gates-summary.json', (route) => route.fulfill({ json: releaseFixture(20) }))
  await page.reload()
  await expect(strip).toContainText(/gate results are from the \d{4}-\d{2}-\d{2} release; not re-run since/)
  await expect(strip).not.toContainText('suites green')
})

test('trust scoreboard names the release commit and its Actions run when stamped at release', async ({ page }) => {
  await page.route('**/trust/gates-summary.json', (route) => route.fulfill({ json: releaseFixture(0) }))
  await page.goto('/trust')
  const board = page.locator('#gates-scoreboard')
  await expect(board).toContainText(`Gates passed at release ${RELEASE_SHA} on`)
  await expect(board.getByRole('link', { name: /Actions run/ })).toHaveAttribute('href', RUN_URL)
  await expect(board).not.toContainText('local run')

  // Only a GitHub Actions run URL is ever linked.
  await page.unroute('**/trust/gates-summary.json')
  await page.route('**/trust/gates-summary.json', (route) => route.fulfill({ json: releaseFixture(20, 'javascript:alert(1)') }))
  await page.reload()
  await expect(board).toContainText(/Gate results are from the \d{4}-\d{2}-\d{2} release; not re-run since/)
  await expect(board.getByRole('link', { name: /Actions run/ })).toHaveCount(0)
})

// PR #65 deleted the limits and the founder; they are restored inside #trust.
test('the trust section states what Origin is not and who builds it', async ({ page }) => {
  await page.goto('/')
  const trust = page.locator('#trust')
  await expect(trust.getByRole('heading', { name: 'What Origin is not.' })).toBeVisible()
  await expect(trust.locator('.notgrid article')).toHaveCount(5)
  await expect(trust.getByText('No design partner, no pilot, no paying user', { exact: false })).toBeVisible()
  await expect(trust.getByRole('heading', { name: 'Who builds Origin.' })).toBeVisible()
  await expect(trust.getByText('Bo-Huei Lin, founder.', { exact: true })).toBeVisible()
})

// One filled (primary) action per section. The sticky header pill is chrome, not a
// section primary, so it is outside every [data-investor-section].
test('each home section has at most one filled action, and the final ask is an evidence review', async ({ page }) => {
  await page.goto('/')
  // Wait for enhance.ts to reveal the Book buttons, so the count sees the final page.
  await expect(page.locator('#offer [data-open-lead]')).toBeVisible()
  const sections = page.locator('[data-investor-section], .cin-labs')
  const count = await sections.count()
  expect(count).toBe(8)
  for (let i = 0; i < count; i += 1) {
    const section = sections.nth(i)
    const id = (await section.getAttribute('id')) ?? 'cin-labs'
    expect(await section.locator('.btn--primary:visible').count(), id).toBeLessThanOrEqual(1)
  }
  await expect(page.locator('.cin-labs .btn--primary')).toHaveCount(0)
  await expect(page.locator('#contact button.btn--primary')).toHaveAttribute('data-intent', 'review')
  await expect(page.locator('#contact button.btn--primary')).toContainText('Book an Agent Evidence Review')
})

test('without JavaScript the hero boundaries show and no dead Book button does', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/`)
    await expect(page.locator('.hero__lede')).toBeVisible()
    await expect(page.locator('.hero__status')).toContainText('Not production SaaS or compliance certification')
    await expect(page.locator('.hero__status')).toContainText('Origin does not contact or execute your named agent.')
    await expect(page.getByText('The public demo is a prototype, not production SaaS or compliance certification.')).toBeVisible()
    // The Book buttons open a JS-only modal; without JS they must not be offered.
    await expect(page.locator('[data-open-lead]:visible')).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('the burger menu is visible at 375px on /, /trust and /brief', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const route of ['/', '/trust', '/brief']) {
    await page.goto(route)
    await expect(page.locator('.site-header__burger'), route).toBeVisible()
  }
})

// Retired clips remain withdrawn; dated recordings carry their own provenance.
test('no retired recording is linked, and the VALID scope line survives', async ({ page }) => {
  const retired = 'video[poster="/video/shot01-tamper.jpg"], source[src="/video/shot01-tamper.mp4"], source[src="/video/shot02-overgrant.mp4"], source[src="/video/shot04-tour.mp4"], source[src*="05-second-reader"], video[poster*="agent-journey"], video[src*="agent-journey"]'
  for (const route of ['/', '/verify', '/over-grant', '/reference-check', '/passport']) {
    await page.goto(route)
    await expect(page.locator(retired), route).toHaveCount(0)
  }
  await page.goto('/')
  await expect(page.locator('.cin-footnote', { hasText: 'not signer identity' })).toHaveCount(1)
})
