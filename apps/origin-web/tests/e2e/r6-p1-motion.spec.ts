import { test, expect, type Page } from '@playwright/test'

// Release 6 Phase 1 — motion
// The owner's rule: nothing moves unless the visitor asks. The home five-stage walkthrough (#demo)
// advances only on Play, Prev/Next or a tab, never because it scrolled into view. enhance.ts no
// longer holds the scroll-started walk autoplay, the scroll-started .loop__step highlight, the
// [data-video] block that called play() on load, or the video band module that played a
// video[data-band] on scroll. No served page renders those hooks, so the third test injects them
// into the home page before enhance.ts runs: with the removed code present, the walk advances,
// the step lights up and both fixture videos are asked to play, and that test fails.
// The hero film keeps its own script (cinematic.ts): it stays paused until "Play scene" is pressed.

const VIEWPORTS = [[1280, 800], [375, 812]] as const

// Markup the removed code reacted to. None of it appears on a served page.
const FIXTURES = `
<section id="r6-motion-fixtures" style="padding:40px 16px">
  <div id="r6-walk" data-walk style="min-height:300px">
    <div class="walk__mode-block is-active" data-walk-mode="normal">
      <button type="button" class="walk__tab">One</button><button type="button" class="walk__tab">Two</button>
      <div class="walk__panel">one</div><div class="walk__panel">two</div>
    </div>
  </div>
  <div id="r6-loop" class="loop__step" style="height:60px">Observe</div>
  <figure id="r6-vfig" data-video style="margin:0;min-height:200px">
    <video id="r6-video" width="320" height="180" muted playsinline preload="none"></video>
    <button type="button" data-video-play>Play</button>
  </figure>
  <video id="r6-band" data-band width="320" height="180" muted playsinline preload="none"></video>
</section>`

// Local requests only; with fixtures on, the home document gains the markup above before </main>.
async function serveHome(page: Page, fixtures: boolean) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    if (fixtures && url.pathname === '/' && route.request().resourceType() === 'document') {
      const response = await route.fetch()
      return route.fulfill({ response, body: (await response.text()).replace('</main>', `${FIXTURES}</main>`) })
    }
    return route.continue()
  })
}

// Record every play() request, naming the hero film 'hero' and any other video by its id.
async function recordPlays(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __plays: string[] }
    w.__plays = []
    const original = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      w.__plays.push(this.hasAttribute('data-cinematic-film') ? 'hero' : this.id || 'video')
      return original.call(this)
    }
  })
}
const plays = (page: Page) => page.evaluate(() => (window as unknown as { __plays: string[] }).__plays.slice())

for (const [width, height] of VIEWPORTS) {
  test(`release 6 phase 1: the home walkthrough stays on Bind when scrolled into view and advances on Play at ${width}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
    test.setTimeout(45_000)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width, height })
    await serveHome(page, false)
    await page.goto('/', { waitUntil: 'load' })
    const demo = page.locator('[data-demo]')
    await expect(demo).toHaveClass(/is-enhanced/)
    const before = await demo.innerHTML()

    await page.locator('#demo').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await demo.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(4_000)

    await expect(page.locator('#demo-tab-1')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#demo-tab-1')).toHaveText(/Bind/)
    await expect(page.locator('[data-demo] [role="tab"][aria-selected="true"]')).toHaveCount(1)
    await expect(page.locator('#demo-panel-1')).toBeVisible()
    for (const n of [2, 3, 4, 5]) await expect(page.locator(`#demo-panel-${n}`)).toBeHidden()
    await expect(page.locator('[data-demo-play]')).toHaveAttribute('aria-pressed', 'false')
    expect(await demo.innerHTML()).toBe(before)

    // Play still works: the visitor asks, and the walkthrough moves to Challenge.
    await page.locator('[data-demo-play]').click()
    await expect(page.locator('#demo-tab-2')).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 })
    await expect(page.locator('#demo-panel-2')).toBeVisible()
  })

  test(`release 6 phase 1: no video plays on the home page until the visitor starts the hero film at ${width}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
    test.setTimeout(45_000)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width, height })
    await recordPlays(page)
    await serveHome(page, false)
    await page.goto('/', { waitUntil: 'load' })
    await expect(page.locator('[data-video], [data-video-play], video[data-band]')).toHaveCount(0)

    // Scroll the whole page past every video, then give anything scroll-started time to begin.
    for (const video of await page.locator('video').all()) {
      await video.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(400)
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(2_000)
    expect(await plays(page)).toEqual([])
    expect(await page.locator('video').evaluateAll((els) => els.every((el) => (el as HTMLVideoElement).paused))).toBe(true)

    const film = page.locator('[data-cinematic-film]')
    const toggle = page.locator('[data-cinematic-toggle]')
    expect(await film.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true)
    await toggle.scrollIntoViewIfNeeded()
    await expect(toggle).toHaveText('Play scene')
    await toggle.click()
    expect(await plays(page)).toEqual(['hero'])
    await expect.poll(() => film.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false)
  })

  test(`release 6 phase 1: scrolling never starts a walk, a step highlight or a video, even where their hooks exist, at ${width}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
    test.setTimeout(45_000)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width, height })
    await recordPlays(page)
    await serveHome(page, true)
    await page.goto('/', { waitUntil: 'load' })
    await expect(page.locator('#r6-motion-fixtures')).toHaveCount(1)
    await expect(page.locator('[data-demo]')).toHaveClass(/is-enhanced/)

    for (const id of ['r6-walk', 'r6-loop', 'r6-vfig', 'r6-band']) {
      await page.locator(`#${id}`).evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(400)
    }
    await page.waitForTimeout(4_000)

    expect(await page.locator('#r6-walk .walk__tab').nth(1).evaluate((el) => el.classList.contains('is-active'))).toBe(false)
    expect(await page.locator('#r6-loop').evaluate((el) => el.classList.contains('is-active'))).toBe(false)
    expect(await plays(page)).toEqual([])
    expect(await page.locator('#r6-video, #r6-band').evaluateAll((els) => els.every((el) => (el as HTMLVideoElement).paused))).toBe(true)
  })
}
