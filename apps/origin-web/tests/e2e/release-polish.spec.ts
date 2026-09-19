import { test, expect, type Page } from '@playwright/test'

async function localOnly(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
}

test('mobile navigation remains usable when JavaScript is unavailable', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await localOnly(page)
  try {
    await page.goto(`${baseURL}/`)
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.getByRole('link', { name: 'Labs', exact: true })).toBeVisible()
    await nav.getByRole('link', { name: 'Labs', exact: true }).click()
    await expect(page).toHaveURL(/\/labs$/)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Trust', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  } finally {
    await context.close()
  }
})

test('unavailable decorative video leaves its image and removes the unusable play control', async ({ page }) => {
  await localOnly(page)
  await page.route('**/brand/review-loop.mp4', (route) => route.abort('failed'))
  await page.goto('/')
  const film = page.locator('[data-cinematic-film]')
  const control = page.locator('[data-cinematic-toggle]')
  // Reduced-motion browsers only request the video after deliberate interaction.
  if (await control.isVisible()) await control.click()
  await expect(control).toBeHidden()
  await expect(film).toHaveAttribute('poster', '/brand/review.webp')
  await expect(page.getByRole('link', { name: 'Run the synthetic reference check', exact: true })).toBeVisible()
})

test('reduced motion keeps the hero still until the visitor chooses playback', async ({ page }) => {
  await localOnly(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const film = page.locator('[data-cinematic-film]')
  const control = page.locator('[data-cinematic-toggle]')
  await expect(control).toHaveText('Play scene')
  expect(await film.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true)
  await control.click()
  await expect(control).toHaveText('Pause scene')
  await control.click()
  await expect(control).toHaveText('Play scene')
})
