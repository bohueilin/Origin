import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
})

test('contact dialog traps keyboard focus, closes on Escape and returns focus', async ({ page }) => {
  await page.goto('/')
  const trigger = page.locator('[data-open-lead]').first()
  await trigger.click()
  const dialog = page.locator('#lead-modal')
  await expect(page.locator('#lead-name')).toBeFocused()
  const focusables = dialog.locator('button, input:not([type=hidden]), textarea, select, a[href]').filter({ visible: true })
  await focusables.last().focus()
  await page.keyboard.press('Tab')
  await expect(focusables.first()).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(focusables.last()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('rate-limited contact keeps the form and entered details available', async ({ page }) => {
  let calls = 0
  await page.route('**/api/lead', route => { calls++; return route.fulfill({ status: 429, headers: { 'retry-after': '600' }, json: { ok: false, error: 'rate_limited' } }) })
  await page.goto('/')
  await page.locator('[data-open-lead]').first().click()
  await page.locator('#lead-name').fill('Test Visitor')
  await page.locator('#lead-email').fill('visitor@example.test')
  await page.locator('#lead-submit').click()
  await expect(page.locator('#lead-error')).toContainText('Too many requests')
  await expect(page.locator('#lead-name')).toHaveValue('Test Visitor')
  await expect(page.locator('#lead-submit')).toBeEnabled()
  await expect(page.locator('#lead-success')).not.toBeVisible()
  expect(calls).toBe(1)
})
