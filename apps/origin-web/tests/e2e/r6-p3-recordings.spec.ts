import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Release 6 Phase 3 — recordings; Release 7 (R05) — no caption in the picture
// The three recordings are re-recorded on the live Release 6 site (commit 965215b, UTC date
// 2026-11-16) and rendered with only a small "RECORDED · ONE TAKE · SYNTHETIC DATA" pill in the
// picture's top-left corner, over the site's sticky header (scripts/burn-captions.py). No
// caption is drawn into the picture: the cues are timed text in the manifest and the WebVTT
// track, and the site's caption tray shows the active one under the player. Each recording figure leads with a
// one-line summary bar (the pill and "Recorded <date> (<commit>) · synthetic demo data") and
// keeps every other provenance and boundary sentence in an inline "Full provenance and limits"
// disclosure inside the figure. The poster, video and caption track are the new dated files,
// and the manifest in scripts/recordings/ states the same files, date and commit.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

type Box = [number, number, number, number]
type Manifest = {
  date: string, commit: string, host: string,
  render: { output: string, poster: string, tag_px: number, captions_in_picture: boolean, captions: { from_s: number, to_s: number, text: string, box?: Box }[] },
}
const manifest = (shot: string) =>
  JSON.parse(readFileSync(new URL(`../../scripts/recordings/${shot}.json`, import.meta.url), 'utf8')) as Manifest

const DATE = '2026-11-16'
const COMMIT = '965215b'
const RECORDINGS: [route: string, shot: string, claim: string][] = [
  ['/', 'shot01', 'not signer identity'],
  ['/verify', 'shot01', 'still offline'],
  ['/over-grant', 'shot02', 'false positives'],
  ['/reference-check', 'shot04', 'UNTRUSTED'],
]
const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim()

for (const [route, shot, claim] of RECORDINGS) {
  test(`r6 p3: the ${shot} figure on ${route} shows the new dated files, a summary bar and an inline disclosure`, async ({ page }) => {
    const run = manifest(shot)
    expect(run.date).toBe(DATE)
    expect(run.commit).toBe(COMMIT)
    expect(run.render.output).toBe(`${shot}-${DATE}.mp4`)
    expect(run.render.poster).toBe(`${shot}-${DATE}.webp`)
    await page.goto(route)

    // The poster, the video source and the caption track are the new dated files.
    const video = page.locator(`video[poster*="${shot}-"]`)
    await expect(video).toHaveCount(1)
    await expect(video).toHaveAttribute('poster', `/video/${shot}-${DATE}.webp`)
    await expect(video.locator('source')).toHaveAttribute('src', `/video/${shot}-${DATE}.mp4`)
    const track = video.locator('track[kind="captions"]')
    await expect(track).toHaveAttribute('src', `/video/${shot}-${DATE}.vtt`)
    for (const url of [`/video/${shot}-${DATE}.webp`, `/video/${shot}-${DATE}.mp4`]) {
      expect((await page.request.get(url)).status(), url).toBe(200)
    }
    // The caption track file exists, and its note carries the take's provenance.
    const vtt = await page.request.get(`/video/${shot}-${DATE}.vtt`)
    expect(vtt.status()).toBe(200)
    const cues = await vtt.text()
    expect(cues.startsWith('WEBVTT\n\nNOTE RECORDED · ONE TAKE · SYNTHETIC DATA · recorded 2026-11-16 on originphysicalai.com (965215b) · cursor dot and corner label overlaid; captions shown under the picture\n')).toBe(true)
    expect(cues).toContain(run.render.captions[1].text)

    // The summary bar: the pill and one summary line, inside the figure.
    const figure = video.locator('xpath=ancestor::figure')
    const bar = figure.locator('figcaption > .vband__bar')
    await expect(bar).toHaveCount(1)
    await expect(bar).toBeVisible()
    await expect(bar.locator('.vband__pill')).toHaveText('Recorded · one take · synthetic data')
    expect(await bar.locator('.vband__pill').evaluate((el) => (el as HTMLElement).innerText)).toBe('RECORDED · ONE TAKE · SYNTHETIC DATA')
    await expect(bar.locator('.vband__sum')).toHaveText(`Recorded ${DATE} (${COMMIT}) · synthetic demo data`)
    expect(squash(await bar.textContent())).toBe(`Recorded · one take · synthetic data Recorded ${DATE} (${COMMIT}) · synthetic demo data`)

    // The rest of the provenance and limits, verbatim, in a closed inline disclosure.
    const details = figure.locator('figcaption > details.vband__prov-details')
    await expect(details).toHaveCount(1)
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false)
    const summary = details.locator('summary')
    await expect(summary).toHaveText('Full provenance and limits')
    expect(await details.evaluate((el) => el.firstElementChild?.tagName)).toBe('SUMMARY')
    const detail = details.locator('.vband__detail')
    await expect(detail).toHaveCount(1)
    await expect(detail).toBeHidden()
    expect(squash(await detail.textContent()).startsWith(`Recorded ${DATE} on originphysicalai.com (${COMMIT}), using synthetic demo data.`)).toBe(true)
    await expect(detail).toContainText(claim)
    await expect(details.locator('small')).toContainText(/^Duration \d:\d\d\. A cursor dot and the corner label are overlaid; the captions show under the picture, not in it\. The run is one continuous take\. Recording method and provenance\.$/)
    // Nothing of the provenance sits outside the bar and the disclosure.
    expect(await figure.locator('figcaption').evaluate((el) => [...el.children].map((child) => child.className))).toEqual(['vband__bar', 'vband__prov-details'])
    await summary.click()
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true)
    await expect(detail).toBeVisible()
    await expect(details.locator('a[href$="/scripts/RECORDINGS.md"]')).toBeVisible()
  })
}

// Release 7 (shelf-life policy): the take is of the Release 6 pages, so the disclosure carries no
// drift note, and no dated note sits under the figure.
test('r6 p3: the shot04 disclosure carries no drift note', async ({ page }) => {
  await page.goto('/reference-check')
  await expect(page.locator('.vband__note')).toHaveCount(0)
  const detail = page.locator('video[poster*="shot04-"]').locator('xpath=ancestor::figure').locator('.vband__detail')
  await expect(detail).not.toContainText('have since gained')
  await expect(detail).not.toContainText('the pages have changed since')
})

test('r7: the picture carries only the corner pill; every caption is timed text for the tray and the track', async () => {
  for (const shot of ['shot01', 'shot02', 'shot04']) {
    const { render } = manifest(shot)
    expect(render.captions_in_picture, shot).toBe(false)
    expect(render, shot).not.toHaveProperty('caption_px')
    const [pill, ...cues] = render.captions
    expect(pill.text, shot).toBe('RECORDED · ONE TAKE · SYNTHETIC DATA')
    expect(pill.box!.slice(0, 2), shot).toEqual([24, 24])
    expect(pill.box![2], shot).toBeLessThanOrEqual(1280 / 3 + 24)
    expect(pill.box![3], shot).toBeLessThanOrEqual(72)
    expect(cues.length, shot).toBeGreaterThan(1)
    for (const [i, cue] of cues.entries()) {
      expect(cue, `${shot} caption ${i + 1}`).not.toHaveProperty('box')
      expect(cue.to_s, `${shot} caption ${i + 1}`).toBeGreaterThan(cue.from_s)
      if (i > 0) expect(cue.from_s, `${shot} caption ${i + 1}`).toBeGreaterThanOrEqual(cues[i - 1].to_s)
    }
  }
})
