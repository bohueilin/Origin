import { test, expect } from '@playwright/test'

for (const [route, shot, claim] of [
  ['/', 'shot01', 'not signer identity'],
  ['/verify', 'shot01', 'still offline'],
  ['/over-grant', 'shot02', 'false positives'],
  ['/reference-check', 'shot04', 'UNTRUSTED'],
]) {
  test(`dated synthetic recording stays click-to-play on ${route}`, async ({ page }) => {
    await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
    await page.goto(route)
    const video = page.locator(`video[poster*="${shot}-"]`)
    await expect(video).toHaveCount(1)
    await expect(video).toHaveAttribute('poster', new RegExp(`/video/${shot}-\\d{4}-\\d{2}-\\d{2}\\.webp$`))
    await expect(video).toHaveAttribute('width', '1280')
    await expect(video).toHaveAttribute('height', '720')
    await expect(video).toHaveAttribute('preload', 'none')
    expect(await video.getAttribute('data-band')).toBeNull()
    expect(await video.getAttribute('autoplay')).toBeNull()
    expect(await video.getAttribute('loop')).toBeNull()
    await video.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    expect(await video.evaluate((el: HTMLVideoElement) => ({ paused: el.paused, time: el.currentTime, controls: el.controls }))).toEqual({ paused: true, time: 0, controls: true })
    const figure = video.locator('xpath=ancestor::figure')
    await expect(figure.locator('figcaption')).toContainText(claim)
    await expect(figure.locator('figcaption')).toContainText(/2026-\d{2}-\d{2}.*originphysicalai.com.*[a-f0-9]{7}/)
    const pill = figure.locator('.vband__pill')
    await expect(pill).toHaveText('Recorded · one take · synthetic data')
    expect(await pill.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
    expect((await pill.boundingBox())!.y).toBeGreaterThanOrEqual((await video.boundingBox())!.y + (await video.boundingBox())!.height)
    await video.evaluate((el: HTMLVideoElement) => el.play())
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0)
  })
}
