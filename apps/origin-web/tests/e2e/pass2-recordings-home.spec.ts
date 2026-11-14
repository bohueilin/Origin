import { test, expect, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Pass 2 Phase 1 — recordings and home
// The recordings' captions are burned into the video, so the frame leaves a tray under the
// picture for the native control bar, and the picture is pinned to the top of the frame:
// the burned-in caption sits at least 48 px clear above the control bar. Each recording
// figure leads with the "Recorded" pill and one summary line built from its manifest.
// Home: the lab illustration says what it shows (a fictional person with a tablet and a
// mobile robot) and its crop keeps both in frame, the offer and the lead dialog's intro say
// to send nothing confidential, and the dialog's privacy link opens in a new tab. Without
// JavaScript the header CTA keeps its pill shape with the label centred.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const manifest = (shot: string) =>
  JSON.parse(readFileSync(new URL(`../../scripts/recordings/${shot}.json`, import.meta.url), 'utf8')) as { date: string, commit: string }

const RECORDINGS: [route: string, shot: string][] = [['/', 'shot01'], ['/verify', 'shot01'], ['/over-grant', 'shot02'], ['/reference-check', 'shot04']]
const VIEWPORTS: [width: number, height: number][] = [[1919, 998], [1280, 720], [430, 932], [375, 812]]

// Chromium's native control stack: a 48 px button panel over a 24 px timeline, at the
// bottom of the <video> element. The burned-in caption box ends 24/720 of the picture
// height above the picture's bottom edge.
const CONTROLS = 72
const CAPTION_BOTTOM = 696 / 720

// The <video> box against the picture inside it. The posters are 16:9 and the picture is
// scaled whole and pinned to the top, so its height is width * 9/16 before any video
// metadata has loaded.
async function frame(page: Page, shot: string) {
  const video = page.locator(`video[poster*="${shot}-"]`)
  await video.scrollIntoViewIfNeeded()
  return video.evaluate(async (el: HTMLVideoElement, [controls, captionBottom]) => {
    const poster = new Image()
    poster.src = el.poster
    await poster.decode()
    const s = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    const [, y = '50%'] = s.objectPosition.split(' ')
    const pictureTop = box.top + (parseFloat(y) || 0)
    const pictureHeight = box.width * 9 / 16
    return {
      fit: s.objectFit,
      objectTop: parseFloat(y) || 0,
      poster: poster.naturalWidth * 9 - poster.naturalHeight * 16,
      clearance: (box.bottom - controls) - (pictureTop + pictureHeight * captionBottom),
      top: box.top,
    }
  }, [CONTROLS, CAPTION_BOTTOM] as const)
}

for (const [route, shot] of RECORDINGS) {
  test(`pass 2: the ${shot} frame on ${route} keeps the control bar off the burned-in captions`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
    const { date, commit } = manifest(shot)
    for (const [width, height] of VIEWPORTS) {
      const at = `${route} at ${width}x${height}`
      await page.setViewportSize({ width, height })
      await page.goto(route)
      const box = await frame(page, shot)
      // A 16:9 picture pinned to the top and scaled whole; the burned-in caption ends at
      // least 48 px above the top of the native control bar.
      expect(box.fit, at).toBe('contain')
      expect(box.objectTop, at).toBe(0)
      expect(box.poster, at).toBe(0)
      expect(box.clearance, at).toBeGreaterThanOrEqual(48)
      const figure = page.locator(`video[poster*="${shot}-"]`).locator('xpath=ancestor::figure')
      const pill = figure.locator('.vband__pill')
      await expect(pill, at).toBeVisible()
      expect((await pill.boundingBox())!.y, at).toBeGreaterThanOrEqual(box.top)
      const summary = figure.locator('.vband__sum')
      await expect(summary, at).toBeVisible()
      await expect(summary, at).toHaveText(`Recorded ${date} (${commit}) · one continuous take · synthetic demo data`)
    }
  })
}

test('pass 2: loading the recording metadata does not move the frame', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewport is set explicitly')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/verify')
  const video = page.locator('video[poster*="shot01-"]')
  await video.scrollIntoViewIfNeeded()
  const before = (await video.boundingBox())!
  await video.evaluate((el: HTMLVideoElement) => new Promise<void>((resolve) => {
    el.addEventListener('loadedmetadata', () => resolve(), { once: true })
    el.preload = 'metadata'
    el.load()
  }))
  const after = (await video.boundingBox())!
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(0.5)
})

test('pass 2: the shot04 dated note stays its own line after the figure', async ({ page }) => {
  const { date } = manifest('shot04')
  await page.goto('/reference-check')
  const note = page.locator('.vband > .shell > figure.vband__fig + p.vband__note')
  await expect(note).toHaveText(`Recorded ${date}; the page has changed since (L0–L4 tier labels were removed and the record now states its result in format 1.1.0).`)
  expect(await note.evaluate((el) => Number(getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(600)
  expect(await note.evaluate((el) => getComputedStyle(el).display)).toBe('block')
})

test('pass 2: the home lab illustration says what it shows', async ({ page }) => {
  await page.goto('/')
  const figure = page.locator('.cin-labs figure')
  await expect(figure.locator('img')).toHaveAttribute('alt', 'AI-generated illustration of a person with a tablet watching a mobile robot in a sunlit workspace')
  await expect(figure.locator('figcaption')).toHaveText('AI-generated illustration · fictional person and mobile robot · not an Origin facility, deployment or customer evidence')
  await expect(figure).not.toContainText('researcher')
})

// The illustration's two subjects, as fractions of the source picture (measured on the
// 1200x675 encoding): the person with the tablet at the upper right, and the mobile robot.
const PERSON = { left: 1010 / 1200, top: 0, right: 1128 / 1200, bottom: 344 / 675 }
const ROBOT = { left: 785 / 1200, top: 408 / 675, right: 1047 / 1200, bottom: 508 / 675 }

// The part of the source picture an object-fit: cover image shows, from its rendered box,
// its natural size and its object-position, as fractions of the source.
async function visibleCrop(img: Locator) {
  await img.scrollIntoViewIfNeeded()
  return img.evaluate(async (el: HTMLImageElement) => {
    if (!el.complete) await new Promise((resolve) => el.addEventListener('load', resolve, { once: true }))
    const s = getComputedStyle(el)
    const w = el.clientWidth, h = el.clientHeight
    const scale = Math.max(w / el.naturalWidth, h / el.naturalHeight)
    const rw = el.naturalWidth * scale, rh = el.naturalHeight * scale
    const offset = (v: string, free: number) => (v.endsWith('%') ? free * parseFloat(v) / 100 : parseFloat(v))
    const [x, y = '50%'] = s.objectPosition.split(' ')
    const ox = offset(x, w - rw), oy = offset(y, h - rh)
    return { fit: s.objectFit, left: -ox / rw, top: -oy / rh, right: (w - ox) / rw, bottom: (h - oy) / rh }
  })
}

test('pass 2: the home lab crop keeps the person and the robot in frame at 375 and 1280 px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  for (const [width, height] of [[375, 812], [1280, 720]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    const crop = await visibleCrop(page.locator('.cin-labs figure img'))
    expect(crop.fit).toBe('cover')
    for (const [name, region] of Object.entries({ person: PERSON, robot: ROBOT })) {
      const at = `${name} at ${width}px: ${JSON.stringify(crop)}`
      expect(crop.left, at).toBeLessThanOrEqual(region.left)
      expect(crop.top, at).toBeLessThanOrEqual(region.top)
      expect(crop.right, at).toBeGreaterThanOrEqual(region.right)
      expect(crop.bottom, at).toBeGreaterThanOrEqual(region.bottom)
    }
  }
})

test('pass 2: the home offer and lead dialog say to send nothing confidential', async ({ page }) => {
  const line = 'Send nothing confidential: no data agreement is in place yet.'
  await page.goto('/')
  await expect(page.locator('#offer .section__lede')).toContainText(line)
  await page.locator('#offer').getByRole('button', { name: 'Book an Agent Evidence Review' }).click()
  // The dialog's intro, which it names as its description, carries the line, so it is
  // read before the fields; the note after the submit button does not repeat it.
  const dialog = page.locator('#lead-modal')
  const intro = dialog.locator('#lead-sub')
  await expect(dialog).toHaveAttribute('aria-labelledby', 'lead-title')
  await expect(dialog).toHaveAttribute('aria-describedby', 'lead-sub')
  await expect(intro).toBeVisible()
  await expect(intro).toContainText(line)
  await expect(dialog).toHaveAccessibleDescription(/Send nothing confidential: no data agreement is in place yet\.$/)
  expect(await intro.evaluate((el) => Boolean(el.compareDocumentPosition(document.getElementById('lead-name')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
  const note = dialog.locator('.modal__note')
  await expect(note).toBeVisible()
  await expect(note).toHaveText('Sent over TLS to Origin; see the privacy policy (opens in a new tab). No spam.')
  const privacy = note.locator('a[href="/legal/privacy-policy.html"]')
  await expect(privacy).toHaveAttribute('target', '_blank')
  await expect(privacy).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(privacy).toHaveAccessibleName('privacy policy (opens in a new tab)')
  expect(await privacy.locator('.sr-only').textContent()).toBe(' (opens in a new tab)')
})

test('pass 2: without JavaScript at 375 px the header CTA pill is centred on its label', async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'the context sets its own viewport')
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 375, height: 812 } })
  await context.route('**/*', (route) => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  const page = await context.newPage()
  try {
    for (const route of ['/', '/verify']) {
      await page.goto(route)
      await expect(page.locator('html'), route).not.toHaveClass(/nav-ready/)
      const pills = page.locator('.site-header a.btn--primary', { hasText: 'Run reference check' }).filter({ visible: true })
      for (const pill of await pills.all()) {
        const insets = await pill.evaluate((el) => {
          const range = document.createRange()
          range.selectNodeContents(el)
          const label = range.getBoundingClientRect()
          const box = el.getBoundingClientRect()
          return { left: label.left - box.left, right: box.right - label.right, top: label.top - box.top, bottom: box.bottom - label.bottom, height: box.height }
        })
        expect(Math.abs(insets.left - insets.right), `${route} ${JSON.stringify(insets)}`).toBeLessThanOrEqual(2)
        expect(Math.abs(insets.top - insets.bottom), `${route} ${JSON.stringify(insets)}`).toBeLessThanOrEqual(2)
        // A pill, not a bare label: the button keeps its inline padding and touch height.
        expect(insets.left, route).toBeGreaterThanOrEqual(8)
        expect(insets.height, route).toBeGreaterThanOrEqual(44)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true)
    }
  } finally {
    await context.close()
  }
})
