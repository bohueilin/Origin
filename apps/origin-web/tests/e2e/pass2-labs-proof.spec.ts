import { test, expect, type Locator, type Page } from '@playwright/test'

// Pass 2 Phase 1 — labs and proof
// The hero eyebrow on /proof and /labs sits close under the sticky header, as on
// /reference-check and /verify. The /labs illustration is described as what it shows (a
// fictional person with a tablet watching a mobile robot), and its crop keeps both in
// frame. Card 03 names what the collision count covers. /proof links the three scripted
// scenarios on /app.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const HERO_ROUTES = ['/proof', '/labs']

// Top of the hero eyebrow and bottom of the sticky header, in px from the top of the viewport.
async function heroOffsets(page: Page, route: string) {
  await page.goto(route)
  const eyebrow = page.locator('.editorial-hero .kicker').first()
  await expect(eyebrow).toBeVisible()
  const top = (await eyebrow.boundingBox())!.y
  const header = (await page.locator('.site-header').boundingBox())!
  return { top, headerBottom: header.y + header.height }
}

test('pass 2: the hero eyebrow on /proof and /labs sits close under the header on desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  for (const route of HERO_ROUTES) {
    await page.setViewportSize({ width: 1280, height: 720 })
    const at1280 = await heroOffsets(page, route)
    expect(at1280.top, `${route} at 1280x720`).toBeGreaterThanOrEqual(at1280.headerBottom)
    expect(at1280.top, `${route} at 1280x720`).toBeGreaterThanOrEqual(88)
    expect(at1280.top, `${route} at 1280x720`).toBeLessThanOrEqual(180)

    await page.setViewportSize({ width: 1919, height: 998 })
    const at1919 = await heroOffsets(page, route)
    expect(at1919.top, `${route} at 1919x998`).toBeGreaterThanOrEqual(at1919.headerBottom)
    expect(at1919.top, `${route} at 1919x998`).toBeLessThan(220)
  }
})

test('pass 2: the hero eyebrow on /proof and /labs stays close under the header on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'uses the mobile project viewport')
  for (const route of HERO_ROUTES) {
    const { top, headerBottom } = await heroOffsets(page, route)
    expect(top, route).toBeGreaterThanOrEqual(headerBottom)
    expect(top, route).toBeLessThanOrEqual(180)
  }
  // The /labs hero stays stacked on a phone: the illustration follows the copy.
  await page.goto('/labs')
  const copy = (await page.locator('.editorial-hero__grid > div').first().boundingBox())!
  const figure = (await page.locator('.editorial-hero__media').boundingBox())!
  expect(figure.y).toBeGreaterThanOrEqual(copy.y + copy.height)
})

test('pass 2: the /labs illustration names the fictional person and the mobile robot, and no researcher', async ({ page }) => {
  await page.goto('/labs')
  const figure = page.locator('.editorial-hero__media')
  await expect(figure.locator('img')).toHaveAttribute('alt', 'AI-generated illustration of a person with a tablet watching a mobile robot in a sunlit workspace')
  await expect(figure.locator('figcaption')).toHaveText('AI-generated illustration · fictional person and mobile robot · not an Origin facility, deployment or customer evidence')
  expect(await figure.evaluate((el) => el.outerHTML)).not.toMatch(/researcher/i)
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

test('pass 2: the /labs crop keeps the person and the robot in frame at 375 and 1280 px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  for (const [width, height] of [[375, 812], [1280, 720]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/labs')
    const crop = await visibleCrop(page.locator('.editorial-hero__media img'))
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

test('pass 2: /labs card 03 counts collisions with a parked finished robot and the human marker', async ({ page }) => {
  await page.goto('/labs')
  const card = page.locator('.labs-card[data-lab="03"]')
  await expect(card).toContainText('Collision events, including with a finished robot parked in its cell or with the human marker, are counted from the frames.')
})

test('pass 2: /proof links the three scripted scenarios on /app, and /app resolves', async ({ page }) => {
  await page.goto('/proof')
  const link = page.locator('main a[href="/app"]')
  await expect(link).toHaveCount(1)
  await expect(link).toHaveText('Walk three scripted agent scenarios (/app) →')
  await expect(link).toBeVisible()
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  const res = await page.request.get('/app')
  expect(res.status()).toBe(200)
  // The dev server falls back to the home page for unknown paths, so name the page served.
  expect(await res.text()).toMatch(/<title>[^<]*Evidence Console/)
})
