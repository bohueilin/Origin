import { test, expect, type Page } from '@playwright/test'

// Collect console errors + page errors so a "clean console" is a hard assertion, not a hope.
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}
const benign = (e: string) => /devtools|react-refresh|\[vite\]/i.test(e)

test('home renders the control-plane thesis, clean console', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await expect(page).toHaveTitle(/Origin/)
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.locator('#control-plane')).toBeVisible()
  await expect(page.getByText('without ever holding your keys', { exact: false }).first()).toBeVisible()
  await page.waitForTimeout(800)
  expect(errors.filter((e) => !benign(e)), errors.join('\n')).toHaveLength(0)
})

test('social + SEO meta present on the home', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og-cover\.jpg/)
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{50,}/)
  // the social image must actually exist
  const res = await page.request.get('/og-cover.jpg')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('image/jpeg')
})

test('signed-out home makes no auth-refresh calls', async ({ page }) => {
  const auth: string[] = []
  page.on('request', (r) => { if (r.url().includes('/auth/refresh')) auth.push(r.url()) })
  await page.goto('/')
  await page.waitForTimeout(1200)
  expect(auth, auth.join('\n')).toHaveLength(0)
})

test('"Sign in" navigates to the dedicated auth page (Create with Origin)', async ({ page }) => {
  await page.goto('/')
  const signin = page.getByRole('link', { name: 'Sign in' })
  await expect(signin).toHaveAttribute('href', '/auth.html')
  await signin.click()
  await expect(page).toHaveURL(/\/auth\.html$/)
  await expect(page.getByRole('heading', { name: 'Create with Origin' })).toBeVisible()
  await expect(page.getByLabel('First name')).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible() // toggle to sign-in mode
  // legal links present and the pages exist
  const tos = page.getByRole('link', { name: 'Terms of Service' })
  await expect(tos).toHaveAttribute('href', '/legal/terms-of-service.html')
  await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/legal/privacy-policy.html')
  expect((await page.request.get('/legal/terms-of-service.html')).status()).toBe(200)
  expect((await page.request.get('/legal/privacy-policy.html')).status()).toBe(200)
})

test('console app boots with a mounted root, clean console', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/app.html')
  await expect(page.locator('#root')).not.toBeEmpty()
  await page.waitForTimeout(800)
  expect(errors.filter((e) => !benign(e)), errors.join('\n')).toHaveLength(0)
})
