import { test, expect } from '@playwright/test'

test('a rejected rename preserves the saved floor and explains the failure', async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
  await page.goto('/proving-ground')
  await expect(page.locator('.smp-plans-notice')).toBeAttached()
  await expect(page.locator('.smp-plans-notice')).toBeEmpty()
  page.once('dialog', (dialog) => dialog.accept('Original floor'))
  await page.getByRole('button', { name: 'Save current' }).click()
  const plans = page.locator('.smp-plans-select')
  await expect(plans.locator('option', { hasText: 'Original floor' })).toHaveCount(1)
  await plans.selectOption({ label: 'Original floor' })
  const before = await page.evaluate(() => localStorage.getItem('origin.floorplans.v1'))
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'origin.floorplans.v1') {
        // Reject only the replacement write; a following delete could land.
        Storage.prototype.setItem = setItem
        throw new DOMException('Storage is full', 'QuotaExceededError')
      }
      return setItem.call(this, key, value)
    }
  })
  page.once('dialog', (dialog) => dialog.accept('Renamed floor'))
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('origin.floorplans.v1'))).toBe(before)
  await expect(page.locator('.smp-plans-notice')).toContainText('your plan is unchanged')
  await expect(plans.locator('option:checked')).toHaveText('Original floor')
  await plans.selectOption('')
  await expect(page.locator('.smp-plans-notice')).toBeEmpty()
})
