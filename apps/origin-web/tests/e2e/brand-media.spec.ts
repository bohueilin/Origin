import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/') ? route.continue() : route.abort('blockedbyclient')
  })
})

test('synthetic gallery preserves selection and accessible enlargement without dataset imagery', async ({ page }) => {
  const retired: string[] = []
  page.on('request', request => { if (/staer-scene|staerrobotics.*thumbnail/i.test(request.url())) retired.push(request.url()) })
  await page.goto('/capture')
  const first = page.locator('.floorlib-card').first()
  await expect(first.locator('.floorlib-provenance')).toContainText('AI-generated illustration')
  const trigger = first.getByRole('button', { name: /^Enlarge / })
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('not a photograph of this floor, sensor data, or an evaluation result')
  await expect(dialog).toContainText('the illustration does not reconstruct this plan')
  const illustration = dialog.getByRole('img', { name: /AI-generated warehouse illustration/ })
  await expect(illustration).toHaveJSProperty('naturalWidth', 1200)
  await expect(dialog.getByRole('button', { name: /Next view|Previous view|Depth|Segmentation/ })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await first.getByRole('button', { name: 'Use this template →', exact: true }).click()
  await expect(first.getByRole('button', { name: '✓ Selected — review the brief below', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(retired).toEqual([])
})

test('gallery dialog reflows at 320px with its provenance readable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 })
  await page.goto('/capture')
  await page.getByRole('button', { name: /^Enlarge / }).first().click()
  const modal = page.locator('.fpv-modal')
  const box = await modal.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await expect(modal.getByText('AI-generated illustration', { exact: true })).toBeVisible()
})

test('verifier recovers from malformed input through its labelled synthetic example', async ({ page }) => {
  await page.goto('/verify')
  await expect(page.getByRole('button', { name: 'Verify', exact: true })).toBeDisabled()
  await page.locator('#vfy-artifact').fill('{ broken json')
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Verification result' })).toContainText(/JSON/i)
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.locator('.workspace-empty')).toContainText('Load an example or paste JSON')
  await page.getByRole('button', { name: 'Signed browser policy evaluation (untrusted)', exact: true }).click()
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Verification result' })).toContainText('UNTRUSTED')
})
