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

const HERO = 'Get your agent through security review — and prove what it did.'

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
  await expect(page.getByText('The evidence layer for high-consequence AI agents', { exact: true })).toBeVisible()
  await expect(page.getByText('Prototype in private pilot. Synthetic sandbox evidence; not compliance certification.', { exact: true })).toBeVisible()

  await openPrimaryNav(page)
  const nav = page.getByRole('navigation', { name: 'Primary' })
  for (const label of ['Product', 'Demo', 'Evidence', 'Trust', 'Labs', 'Run reference check']) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  await expect(nav.getByRole('link', { name: /Foundry|Proving ground|Sign in/i })).toHaveCount(0)

  await expect(page.getByRole('link', { name: 'Run the synthetic reference check', exact: true })).toHaveAttribute('href', '/reference-check')
  await expect(page.getByRole('link', { name: 'Step through the 5-stage demo', exact: true })).toHaveAttribute('href', '#demo')
  // Count AND order. The count-only version passed while the sections sat in the
  // wrong sequence (audit finding M7) — the spec fixes the order, so pin it.
  await expect(page.locator('[data-investor-section]')).toHaveCount(7)
  const ids = await page.locator('[data-investor-section]').evaluateAll((nodes) => nodes.map((n) => n.id))
  expect(ids).toEqual(['product', 'demo', 'problem', 'evidence', 'offer', 'trust', 'contact'])
})

test('primary navigation is consistent across public product and Labs routes', async ({ page }) => {
  for (const route of ['/', '/reference-check', '/verify', '/trust', '/security', '/labs', '/simulation', '/operations', '/proving-ground']) {
    await page.goto(route)
    await openPrimaryNav(page)
    const nav = page.getByRole('navigation', { name: 'Primary' })
    for (const label of ['Product', 'Demo', 'Evidence', 'Trust', 'Labs', 'Run reference check']) {
      await expect(nav.getByRole('link', { name: label, exact: true }), route).toBeVisible()
    }
    await expect(nav.getByRole('link', { name: /Foundry|Proving ground|Sign in/i }), route).toHaveCount(0)
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
  await expect(demo.getByRole('link', { name: /Verify an attestation/i })).toHaveAttribute('href', '/verify')
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
  await expect(page.getByRole('link', { name: 'Run the synthetic reference check' })).toBeVisible()
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
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Agent Reference Check|evidence layer/i)
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /configuration-bound|reference check/i)

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
