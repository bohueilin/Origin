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
  await expect(page.getByRole('status').filter({ hasText: 'VALID' })).toBeVisible()
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
  await page.getByRole('button', { name: /Sign this floor/ }).click()
  await expect(page.getByRole('button', { name: 'Download the credential' })).toBeVisible()
  await page.getByRole('button', { name: 'One more robot in fleet 1', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Download the credential' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Sign this floor/ })).toBeEnabled()
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
  await expect(page.getByRole('link', { name: /Back to Labs/ })).toBeVisible()
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
