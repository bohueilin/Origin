import { test, expect, type Page } from '@playwright/test'

// Release 7 — R10: nothing starts on scroll
// Each Labs playback (/operations, the /proving-ground 2D and 3D views, /simulation) opens on
// its first frame, paused, with its primary control reading Play. Scrolling it into view draws
// that frame but never starts motion; only a click on Play does. Runs at 1280 × 800 in both
// projects, with motion allowed, so a still frame is the product's choice, not the runner's.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1280, height: 800 })
})

/** Scrolls `scroll` into view, then checks `read` holds for two seconds and Play is offered; a click on Play must change it. */
async function stillUntilPlay(page: Page, scroll: string, read: () => Promise<string>, play: () => ReturnType<Page['getByRole']>) {
  await page.locator(scroll).scrollIntoViewIfNeeded()
  await expect(page.locator(scroll)).toBeInViewport()
  await page.waitForTimeout(300)
  const first = await read()
  await page.waitForTimeout(2000)
  expect(await read(), 'nothing advanced after scrolling into view').toBe(first)
  await expect(play()).toHaveText('Play')
  await play().click()
  // The click can scroll the control's row to the top, leaving the playback below the fold.
  await page.locator(scroll).scrollIntoViewIfNeeded()
  // 20 s: with software WebGL on a loaded CI runner, the 3D view draws few frames, and each
  // frame advances the playback by at most 0.05 s (seen in CI: still unchanged at 8 s).
  await expect.poll(read, { message: 'Play starts the playback', timeout: 20_000 }).not.toBe(first)
}

test('/operations opens paused on its first frame and plays only on Play', async ({ page }) => {
  await page.goto('/operations')
  const canvas = page.locator('.ops-canvas')
  await stillUntilPlay(page, '.ops-canvas',
    () => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL()),
    () => page.locator('.ops-stage').getByRole('button', { name: 'Play', exact: true }))
})

test('/proving-ground 2D opens paused on its first frame and plays only on Play', async ({ page }) => {
  await page.goto('/proving-ground')
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect(page.locator('.sim-grid .sim-cell.robot')).toHaveCount(4)
  await stillUntilPlay(page, '.sim-grid', () => page.locator('.sim-grid').innerHTML(),
    () => page.locator('#pg-playback').getByRole('button', { name: 'Play', exact: true }))
})

test('/proving-ground 3D opens paused on its first frame and plays only on Play', async ({ page }) => {
  await page.goto('/proving-ground')
  const webgl = await page.evaluate(() => {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')) } catch { return false }
  })
  test.skip(!webgl, 'This runner has no WebGL, so the proving ground cannot draw its 3D scene here.')
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await page.locator('.pg3d-canvas').scrollIntoViewIfNeeded()
  // The first frame is drawn once the canvas is visible: every fleet placed, nothing delivered.
  await expect(page.locator('.pg3d-prog-txt')).toHaveText(/^0 of \d+ items delivered$/)
  const progress = async () => `${await page.locator('.pg3d-prog-fill').evaluate((el) => (el as HTMLElement).style.transform)} ${await page.locator('.pg3d-prog-txt').textContent()}`
  expect(await progress()).toMatch(/^scaleX\(0\) /)
  await stillUntilPlay(page, '.pg3d-canvas', progress,
    () => page.locator('.pg3d-controls').getByRole('button', { name: 'Play', exact: true }))
})

test('/simulation opens paused on its first frame and plays only on Play', async ({ page }) => {
  await page.goto('/simulation')
  const ticks = page.locator('.sim-scores').getByText(/ticks · t=/)
  await expect(ticks).toContainText('t=0')
  await stillUntilPlay(page, '.sim-canvas', async () => (await ticks.textContent()) ?? '',
    () => page.locator('.sim-btns').getByRole('button', { name: 'Play', exact: true }))
})
