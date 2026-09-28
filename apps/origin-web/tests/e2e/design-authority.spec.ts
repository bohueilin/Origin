import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/') ? route.continue() : route.abort('blockedbyclient')
  })
})

test('floor outcome headline counts terminal finish outcomes', async ({ page }) => {
  await page.goto('/proving-ground')
  await expect(page.locator('.pg-episode__verdict').first()).toBeVisible()
  const verdicts = await page.locator('.pg-episode__verdict').allTextContents()
  const finished = verdicts.filter(value => value === 'finish').length
  await expect(page.locator('.pg-verdict')).toContainText(`${finished} of ${verdicts.length} synthetic robot-type evaluations finish under the fixed oracle`)
  await expect(page.locator('.pg-ladder')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign synthetic floor evidence', exact: true })).toBeVisible()
  await expect(page.locator('.pg-verdict')).toContainText('no deployment permission')
})

test('operations outcome leads with synthetic targets and a scoped tier', async ({ page }) => {
  await page.goto('/operations')
  await expect(page.locator('.ops-verdict')).toContainText(/Synthetic shift targets (met|not met)/)
  await expect(page.locator('.ops-verdict')).toContainText(/Tier L[0-4] on this seeded simulated shift only/)
  await expect(page.getByRole('button', { name: 'Sign synthetic shift evidence', exact: true })).toBeVisible()
})

test('Capture names the sample as synthetic at the action and result', async ({ page }) => {
  await page.goto('/capture')
  await page.getByRole('button', { name: 'Run synthetic site evaluation', exact: true }).click()
  await expect(page.locator('.customer-readiness-demo .panel-kicker').filter({ hasText: 'Synthetic site evaluation' })).toBeVisible()
  await expect(page.locator('.rsi-copy')).toContainText('operating authority requires separate approval')
})

test('home evaluation stage describes outcomes without readiness authority', async ({ page }) => {
  await page.goto('/')
  await page.locator('#demo-tab-3').click()
  const panel = page.locator('#demo-panel-3')
  await expect(panel).toContainText('scored outcomes under the fixed oracle')
  await expect(panel.locator('.rd-state')).toHaveText('EVALUATION RESULT')
})
