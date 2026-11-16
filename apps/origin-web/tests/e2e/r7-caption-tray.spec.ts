import { test, expect, type Page } from '@playwright/test'

// Release 7 — the recorded demos' captions in a tray under the player (R05, R16/N7)
// The active cue of each recording's text track shows in a tint tray directly below the
// <video> element (and so below the picture and its native controls), never over the recorded
// interface. The track is kept, in mode 'hidden', so the browser's own overlay never draws a
// second caption. Every cue shares one grid cell: the tray is at least 48 px tall and keeps one
// height across cue changes, and a long cue wraps inside it instead of running out of it.
// The recordings carry no caption in the picture (re-rendered for R05), so the tray is the
// only place a cue shows.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const RECORDINGS: [route: string, shot: string][] = [['/', 'shot01'], ['/reference-check', 'shot04'], ['/over-grant', 'shot02'], ['/verify', 'shot01']]
const VIEWPORTS: [width: number, height: number][] = [[1919, 998], [1280, 800], [375, 812]]
const OVER_GRANT_LONG_CUE = 'Fresh seeded corpus, 90 planted widened edges: 90/90 caught · 0 false positives (synthetic ground truth)'

// Seek the loaded recording and report the tray against the video once the cue has changed.
async function at(page: Page, shot: string, seconds: number) {
  return page.locator(`video[poster*="${shot}-"]`).evaluate(async (el: HTMLVideoElement, t) => {
    const track = el.textTracks[0]
    const changed = new Promise<void>((resolve) => {
      track.addEventListener('cuechange', () => resolve(), { once: true })
      setTimeout(resolve, 1500) // a seek within the same cue fires no cuechange
    })
    el.currentTime = t
    await new Promise((resolve) => el.addEventListener('seeked', resolve, { once: true }))
    await changed
    await new Promise(requestAnimationFrame)
    const tray = el.closest('figure')!.querySelector<HTMLElement>('[data-caption-tray]')!
    const v = el.getBoundingClientRect()
    const r = tray.getBoundingClientRect()
    const on = [...tray.querySelectorAll('span.is-on')] as HTMLElement[]
    return {
      gap: r.top - v.bottom, height: r.height, minHeight: parseFloat(getComputedStyle(tray).minHeight),
      scrollWidth: tray.scrollWidth, clientWidth: tray.clientWidth,
      on: on.map((s) => s.textContent), onFits: on.every((s) => s.scrollWidth <= s.clientWidth && s.getBoundingClientRect().bottom <= r.bottom + 0.5),
      active: [...(track.activeCues ?? [])].map((c) => (c as VTTCue).text), mode: track.mode,
    }
  }, seconds)
}

for (const [route, shot] of RECORDINGS) {
  test(`r7: the ${shot} captions on ${route} sit in a tray under the player`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
    for (const [width, height] of VIEWPORTS) {
      const where = `${route} at ${width}x${height}`
      await page.setViewportSize({ width, height })
      await page.goto(route)
      const video = page.locator(`video[poster*="${shot}-"]`)
      await video.scrollIntoViewIfNeeded()
      const tray = video.locator('xpath=ancestor::figure').locator('[data-caption-tray]')
      await expect(tray, where).toHaveCount(1)
      // Load the media so the seeks below move the cue timeline; the track has loaded its cues.
      await video.evaluate((el: HTMLVideoElement) => new Promise<void>((resolve) => {
        if (el.readyState >= 1) return resolve()
        el.addEventListener('loadedmetadata', () => resolve(), { once: true })
        el.preload = 'auto'
        el.load()
      }))
      await expect.poll(() => tray.locator('span').count(), where).toBeGreaterThan(1)
      expect(await tray.evaluate((el) => getComputedStyle(el).backgroundColor), where).toBe('rgb(237, 241, 231)')
      expect(await tray.evaluate((el) => getComputedStyle(el).color), where).toBe('rgb(39, 45, 38)')

      const start = await at(page, shot, 0)
      expect(start.mode, where).toBe('hidden')
      expect(start.on, `${where} at 0:00`).toEqual([])
      const heights = [start.height]
      for (const t of [4, 15]) {
        const now = await at(page, shot, t)
        expect(now.gap, `${where} at ${t}s: tray top vs video bottom`).toBeGreaterThanOrEqual(0)
        expect(now.minHeight, where).toBeGreaterThanOrEqual(48)
        expect(now.height, where).toBeGreaterThanOrEqual(48)
        // One cue at a time, the track's active cue, in full inside the tray.
        expect(now.on, `${where} at ${t}s`).toEqual(now.active)
        expect(now.on, `${where} at ${t}s`).toHaveLength(1)
        expect(now.onFits, `${where} at ${t}s`).toBe(true)
        expect(now.scrollWidth, where).toBeLessThanOrEqual(now.clientWidth)
        heights.push(now.height)
      }
      expect(start.gap, `${where} at 0:00: tray top vs video bottom`).toBeGreaterThanOrEqual(0)
      // No layout shift: the tray keeps one height from 0:00 through the cue changes.
      expect(Math.max(...heights) - Math.min(...heights), `${where} heights ${heights}`).toBeLessThanOrEqual(0.5)

      if (shot === 'shot02') {
        const end = await at(page, shot, 26)
        expect(end.on, where).toEqual([OVER_GRANT_LONG_CUE])
        expect(end.onFits, where).toBe(true)
        expect(end.scrollWidth, `${where}: tray scrollWidth vs clientWidth`).toBeLessThanOrEqual(end.clientWidth)
        expect(Math.abs(end.height - heights[0]), where).toBeLessThanOrEqual(0.5)
        await expect(tray.locator('span.is-on'), where).toBeVisible()
      }
    }
  })
}

test('r7: turning the player captions on leaves the native overlay off (no double captions)', async ({ page }) => {
  await page.goto('/over-grant')
  const video = page.locator('video[poster*="shot02-"]')
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.textTracks[0].mode)).toBe('hidden')
  await video.evaluate((el: HTMLVideoElement) => { el.textTracks[0].mode = 'showing' })
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.textTracks[0].mode)).toBe('hidden')
  // The track element stays for assistive technology.
  await expect(video.locator('track[kind="captions"]')).toHaveCount(1)
})
