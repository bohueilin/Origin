import { test, expect, type Page } from '@playwright/test'

// These flows exercise the real browser state and deterministic engines. A result
// must never keep describing an input the visitor has already changed.
test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (['localhost', '127.0.0.1'].includes(url.hostname)) await route.continue()
    else await route.abort('blockedbyclient')
  })
})

async function referenceCheck(page: Page) {
  await page.goto('/reference-check')
  await page.getByRole('button', { name: 'Run the reference check', exact: true }).click()
  await expect(page.locator('.rc-verdict')).toBeVisible()
}

test('reference-check removes a result and download when its declared model changes', async ({ page }) => {
  await referenceCheck(page)
  await page.getByLabel('Model', { exact: true }).fill('changed-agent-v2')
  await expect(page.locator('.rc-verdict')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download signed policy-evaluation evidence' })).toHaveCount(0)
})

test('reference-check removes a result when its selected policy changes', async ({ page }) => {
  await referenceCheck(page)
  await page.getByLabel('Refuse to disclose personal data (PII)').uncheck()
  await expect(page.locator('.rc-verdict')).toHaveCount(0)
})

test('returning to a scenario restores the policy represented by its selected preset', async ({ page }) => {
  await page.goto('/reference-check')
  await page.getByRole('button', { name: /Permissive \(the dangerous baseline\)/ }).click()
  await expect(page.getByLabel('Refuse to disclose personal data (PII)')).not.toBeChecked()
  await page.getByRole('button', { name: /IAM least-privilege/ }).click()
  await page.getByRole('button', { name: /Customer-support agent/ }).click()
  await expect(page.getByRole('button', { name: /Least-privilege \(recommended\)/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Refuse to disclose personal data (PII)')).toBeChecked()
  await expect(page.getByLabel('Refund cap (auto-approve up to)')).toHaveValue('100')
})

async function verifiedExample(page: Page) {
  await page.goto('/verify')
  await page.getByRole('button', { name: 'Synthetic sandbox reference check', exact: true }).click()
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(page.getByRole('status').locator('.vfy-verdict b')).toHaveText(/^VALID$/)
}

test('verify removes its prior verdict when artifact bytes change', async ({ page }) => {
  await verifiedExample(page)
  const artifact = page.getByLabel('Artifact JSON', { exact: true })
  await artifact.fill(`${await artifact.inputValue()} `)
  await expect(page.locator('.vfy-verdict')).toHaveCount(0)
})

test('verify removes its prior verdict when the expected issuer changes', async ({ page }) => {
  await verifiedExample(page)
  await page.getByLabel(/Pin issuer thumbprint/).fill('a'.repeat(64))
  await expect(page.locator('.vfy-verdict')).toHaveCount(0)
})

test('proving-ground removes signed evidence when the evaluated fleet changes', async ({ page }) => {
  await page.goto('/proving-ground')
  await page.getByRole('button', { name: /Sign synthetic floor evidence/ }).click()
  await expect(page.getByRole('button', { name: 'Download signed floor evidence' })).toBeVisible()
  await page.getByRole('button', { name: 'One more AMR robot in fleet 1', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Download signed floor evidence' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Sign synthetic floor evidence/ })).toBeEnabled()
})

test('clip waits for an explicit run and distinguishes measured from illustrative lanes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let requests = 0
  await page.route('**/api/foundry/latency', async (route) => {
    requests += 1
    expect(route.request().method()).toBe('POST')
    await route.fulfill({ json: {
      ok: true, attackText: 'Synthetic fixture: disable the firewall.',
      cerebras: { ok: true, totalMs: 90, ttftMs: 12, verdict: 'veto', reason: 'Destructive action in the fixture.' },
      gpu: { ok: false, label: 'GPU baseline', totalMs: 2400 },
    } })
  })
  await page.goto('/clip')
  await page.waitForTimeout(350)
  expect(requests).toBe(0)
  await expect(page.getByRole('navigation', { name: 'Clip navigation' }).getByRole('link', { name: /Back to Labs/ })).toBeVisible()
  await expect(page.locator('.clip')).toContainText(/external.*provider/i)
  await page.getByRole('button', { name: 'Run latency comparison', exact: true }).click()
  await expect.poll(() => requests).toBe(1)
  await expect(page.locator('.clip__lane--cb')).toContainText(/measured/i)
  await expect(page.locator('.clip__lane--gpu')).toContainText(/illustrative/i)
  await expect(page.locator('.clip')).not.toContainText(/× faster|verification is free/i)
})

test('clip reports a returned ratify decision without presenting it as a blocked action', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/foundry/latency', async (route) => {
    await route.fulfill({ json: {
      ok: true, attackText: 'Synthetic fixture.',
      cerebras: { ok: true, totalMs: 100, ttftMs: 15, verdict: 'ratify', reason: 'Fixture response.' },
      gpu: { ok: true, label: 'GPU baseline', totalMs: 200 },
    } })
  })
  await page.goto('/clip')
  await page.getByRole('button', { name: 'Run latency comparison', exact: true }).click()
  await expect(page.locator('.clip__lane--cb')).toContainText(/RATIFY/)
  await expect(page.locator('.clip__lane--cb')).not.toContainText(/BLOCKED/)
})

// ── Wave 2: evidence record and verifier ────────────────────────────────────
// /verify checks freshness against this device's clock. A record past its window is VOID
// for freshness only: its digest and signature lines still pass, and a 1.1.0 record's
// replayed counts show under the outside-its-window label.

const logPill = (page: Page, text: string) => page.locator('.vfy-log li').filter({ hasText: text }).locator('.vfy-pill')

test('wave 2: a 1.1.0 record 31 days after issue is VOID for freshness; its digest and signature still check', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T00:00:00.000Z'))
  await page.goto('/verify')
  await page.getByRole('button', { name: 'Signed browser policy evaluation (untrusted)', exact: true }).click()
  await expect(page.getByLabel('Artifact JSON', { exact: true })).toHaveValue(/"schema_version": "1\.1\.0"/)
  const verify = page.getByRole('button', { name: 'Verify', exact: true })
  const verdict = page.getByRole('status').locator('.vfy-verdict b')
  await verify.click()
  await expect(verdict).toHaveText(/^UNTRUSTED$/)
  await expect(logPill(page, "made 2026-11-20T00:00:00.000Z; the 30-day window ends 2026-12-20T00:00:00.000Z; checked against this device's clock")).toHaveText('pass')

  await page.clock.setFixedTime(new Date('2026-12-21T00:00:00.000Z'))
  await verify.click()
  await expect(verdict).toHaveText(/^VOID$/)
  await expect(page.locator('.vfy-result')).toContainText('Action/Run Evidence is void: its 30-day freshness window ended 2026-12-20T00:00:00.000Z. The digest and signature still check.')
  await expect(logPill(page, "the 30-day window ended 2026-12-20T00:00:00.000Z by this device's clock")).toHaveText('void')
  await expect(logPill(page, 'the unsigned envelope content-address recomputes')).toHaveText('pass')
  await expect(logPill(page, 'the signed Action/Run statement matches this envelope')).toHaveText('pass')
  const stated = page.locator('.vfy-stated--outside')
  await expect(stated).toContainText('Stated in this record (outside its freshness window):')
  await expect(stated).toContainText("4 of 12 synthetic decisions match the oracle (Origin's answer key)")
})

test('wave 2: a 1.0.0 record states no result, is UNTRUSTED inside its 24-hour window and VOID for freshness after it', async ({ page }) => {
  const { readFileSync } = await import('node:fs')
  const fixture = readFileSync(new URL('../../src/verify/fixtures/action-run-1.0.0.json', import.meta.url), 'utf8')
  const { issued_at: issued, completeness } = JSON.parse(fixture) as { issued_at: string; completeness: { freshness: { observed_at: string; max_age_ms: number } } }
  expect(completeness.freshness.max_age_ms).toBe(24 * 60 * 60 * 1000)
  const end = new Date(Date.parse(completeness.freshness.observed_at) + completeness.freshness.max_age_ms).toISOString()
  const notStated = 'Result: not stated in this record. Records made before this format was added carry only digests of their decisions. Run the reference check again for a readable result.'

  await page.clock.setFixedTime(new Date(Date.parse(issued) + 60_000))
  await page.goto('/verify')
  await page.getByLabel('Artifact JSON', { exact: true }).fill(fixture)
  const verify = page.getByRole('button', { name: 'Verify', exact: true })
  const verdict = page.getByRole('status').locator('.vfy-verdict b')
  await verify.click()
  await expect(verdict).toHaveText(/^UNTRUSTED$/)
  await expect(page.locator('.vfy-stated--absent')).toHaveText(notStated)
  await expect(page.locator('.vfy-result')).toContainText('Intact under this verifier; no result was replayed (this record states none).')
  await expect(logPill(page, `the 24-hour window ends ${end}`)).toHaveText('pass')

  await page.clock.setFixedTime(new Date(Date.parse(issued) + 25 * 60 * 60 * 1000))
  await verify.click()
  await expect(verdict).toHaveText(/^VOID$/)
  await expect(page.locator('.vfy-result')).toContainText(`Action/Run Evidence is void: its 24-hour freshness window ended ${end}. The digest and signature still check.`)
  await expect(logPill(page, 'the unsigned envelope content-address recomputes')).toHaveText('pass')
  await expect(logPill(page, 'the signed Action/Run statement matches this envelope')).toHaveText('pass')
  await expect(page.locator('.vfy-stated--absent')).toHaveText(notStated)
})
