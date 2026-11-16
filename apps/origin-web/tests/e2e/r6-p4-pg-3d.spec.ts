import { test, expect, type Locator, type Page } from '@playwright/test'

// Release 6 Phase 4 — proving-ground 3D camera, light and fog (refit in release 7, R01/D2)
// The 3D view frames the floor it shows, from 44° above it and 32° round from its front edge.
// The camera's distance and aim come from the scene: the floor's projected box fills 72% of the
// canvas's height or 88% of its width, whichever it reaches first, unless the projected box of
// the whole scene (the floor, every rack, prop, person and box, and each robot's route) would
// pass 2.5% from an edge first; that box is centred on the canvas and stays at least 2% inside
// every edge. So a floor with tall racks sits lower than one without: the rule is the centred
// scene, not a centred floor. The canvas is 17:10 (at least 520 px tall) on a wide stage and
// square on a phone, so at 1280 × 800 and 1919 × 998 the starter floor spans at least 70% of
// the canvas's height and 55–65% of its width (measured 71.3% × 58.4% of 1112 × 654), and at
// 375 × 812 the canvas is 280–340 px tall and the floor spans 88% of its width and at least
// 60% of its height (measured 62.3% of 283 × 283). This holds on load, after a floor resize
// and on a shallow 12 × 4 warehouse, where the racks' tops show inside the canvas. The view
// opens paused on its first frame (release 7, R10). The canvas publishes where the floor's corners
// (data-floor-corners), the scene's box (data-scene-box) and each AMR's deck (data-amr-decks)
// land, and the pixels confirm them: pale floor inside a corner, darker ground outside, and an
// AMR's deck within a colour difference (CIEDE2000) of 5 of its fleet swatch, on a phone as on a
// desktop (the fog now starts beyond the framed scene). The floor reads red at least blue, and
// the background and ground are warm, red above blue by 5 or more of 255. Dragging still turns
// the view, a resize after a drag keeps the visitor's view, and turning down to the lowest
// angle keeps the floor and ground drawn: the pivot sits on the floor, so the camera can never
// pass below it. Skips with a reason where the runner has no WebGL.
// Runs in both projects: desktop 1280×720 and mobile 390×844.

type RGB = [number, number, number]
type Point = [number, number]

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
})

/** Opens /proving-ground's 3D view with time held still and draws its first frame, which
 *  opens paused; `before` edits the floor first. */
async function open3D(page: Page, before?: () => Promise<void>): Promise<Locator> {
  await page.clock.install()
  await page.clock.pauseAt(Date.now() + 1000)
  await page.goto('/proving-ground')
  const webgl = await page.evaluate(() => {
    try {
      const c = document.createElement('canvas')
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'))
    } catch { return false }
  })
  test.skip(!webgl, 'This runner has no WebGL, so the proving ground cannot draw its 3D scene here.')
  if (before) await before()
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(page.locator('.pg3d-controls').getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  return draw(page)
}

/** Brings the canvas into view and lets the paused scene draw a frame. */
async function draw(page: Page): Promise<Locator> {
  const canvas = page.locator('.pg3d-canvas canvas')
  await canvas.scrollIntoViewIfNeeded()
  await page.clock.runFor(200)
  return canvas
}

/** The floor's four projected corners, as fractions of the canvas. */
async function corners(page: Page): Promise<Point[]> {
  const mount = page.locator('.pg3d-canvas')
  await expect(mount).toHaveAttribute('data-floor-corners', /^(\d\.\d{3} ?){8}$/)
  const v = ((await mount.getAttribute('data-floor-corners')) ?? '').split(' ').map(Number)
  return [0, 2, 4, 6].map((i) => [v[i], v[i + 1]])
}

function box(cs: Point[]) {
  const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 }
}

/** The whole scene's projected box, as fractions of the canvas. */
async function sceneBox(page: Page) {
  const mount = page.locator('.pg3d-canvas')
  await expect(mount).toHaveAttribute('data-scene-box', /^(-?\d\.\d{3} ?){4}$/)
  const [x0, y0, x1, y1] = ((await mount.getAttribute('data-scene-box')) ?? '').split(' ').map(Number)
  return { x0, y0, x1, y1 }
}

/** The floor fills 72% of the canvas's height or 88% of its width, or else the scene binds
 *  first (spans 94% or more); the whole scene, floor included, is centred on the canvas and at
 *  least 2% inside each edge. Returns the floor's box. */
async function expectFramed(page: Page, what: string) {
  const b = box(await corners(page))
  const s = await sceneBox(page)
  const share = `${what}: the floor spans ${b.w.toFixed(3)} × ${b.h.toFixed(3)} of the canvas, the scene ${(s.x1 - s.x0).toFixed(3)} × ${(s.y1 - s.y0).toFixed(3)}`
  expect(b.h, share).toBeLessThanOrEqual(0.74)
  expect(b.w, share).toBeLessThanOrEqual(0.9)
  const binds = b.h >= 0.7 || b.w >= 0.86 || Math.max(s.x1 - s.x0, s.y1 - s.y0) >= 0.94
  expect(binds, `${share}: the height, width or scene fill binds`).toBe(true)
  for (const edge of [s.x0, s.y0]) expect(edge, `${what}: the scene starts inside the canvas`).toBeGreaterThanOrEqual(0.02)
  for (const edge of [s.x1, s.y1]) expect(edge, `${what}: the scene ends inside the canvas`).toBeLessThanOrEqual(0.98)
  expect(Math.abs((s.x0 + s.x1) / 2 - 0.5), `${what}: the scene is centred across`).toBeLessThanOrEqual(0.01)
  expect(Math.abs((s.y0 + s.y1) / 2 - 0.5), `${what}: the scene is centred down`).toBeLessThanOrEqual(0.01)
  for (const [edge, inside] of [[b.x0, b.x0 >= s.x0], [b.x1, b.x1 <= s.x1], [b.y0, b.y0 >= s.y0], [b.y1, b.y1 <= s.y1]] as const) {
    expect(inside, `${what}: the floor's edge ${edge} lies within the scene's box`).toBe(true)
  }
  return b
}

/** The median colour of a square patch (5×5 by default) round each point (CSS px from the canvas's top left). */
async function patches(page: Page, canvas: Locator, points: Point[], r = 2): Promise<RGB[]> {
  const shot = await canvas.screenshot({ scale: 'css' })
  return page.evaluate(async ({ src, points, r }) => {
    const img = new Image()
    img.src = src
    await img.decode()
    const ctx = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }).getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return points.map(([x, y]) => {
      const px = Math.min(img.width - 1 - r, Math.max(r, Math.round(x)))
      const py = Math.min(img.height - 1 - r, Math.max(r, Math.round(y)))
      const d = ctx.getImageData(px - r, py - r, 2 * r + 1, 2 * r + 1).data
      return [0, 1, 2].map((k) => {
        const s: number[] = []
        for (let i = k; i < d.length; i += 4) s.push(d[i])
        return s.sort((a, b) => a - b)[(s.length - 1) / 2]
      }) as [number, number, number]
    })
  }, { src: `data:image/png;base64,${shot.toString('base64')}`, points, r })
}

/** For the lowest and the left-most corner: a point 10 px inside the floor and 10 px outside it. */
function besideCorners(cs: Point[], w: number, h: number) {
  const px = cs.map(([x, y]): Point => [x * w, y * h])
  const cx = px.reduce((s, p) => s + p[0], 0) / 4, cy = px.reduce((s, p) => s + p[1], 0) / 4
  const lowest = px.reduce((a, p) => (p[1] > a[1] ? p : a))
  const leftmost = px.reduce((a, p) => (p[0] < a[0] ? p : a))
  return [lowest, leftmost].flatMap(([x, y]) => {
    const len = Math.hypot(cx - x, cy - y)
    const ux = (cx - x) / len, uy = (cy - y) / len
    return [[x + ux * 10, y + uy * 10], [x - ux * 10, y - uy * 10]] as Point[]
  })
}

const warm = ([r, , b]: RGB, margin: number) => r - b >= margin
const light = ([r, g, b]: RGB) => r + g + b
const BACKGROUND: RGB = [239, 237, 230] // #efede6

/** CIEDE2000 colour difference between two sRGB colours. */
function deltaE2000(p: RGB, q: RGB): number {
  const lab = (c: RGB) => {
    const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
    const [x, y, z] = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883].map(f)
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
  }
  const [L1, a1, b1] = lab(p), [L2, a2, b2] = lab(q)
  const rad = Math.PI / 180, p7 = (c: number) => Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7))
  const G = 0.5 * (1 - p7((Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2))
  const [A1, A2] = [a1 * (1 + G), a2 * (1 + G)]
  const [C1, C2] = [Math.hypot(A1, b1), Math.hypot(A2, b2)]
  const hue = (b: number, a: number) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360)
  const [h1, h2] = [hue(b1, A1), hue(b2, A2)]
  let dh = C1 * C2 === 0 ? 0 : h2 - h1
  if (dh > 180) dh -= 360; else if (dh < -180) dh += 360
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh / 2) * rad)
  const L = (L1 + L2) / 2, C = (C1 + C2) / 2
  const H = C1 * C2 === 0 ? h1 + h2 : Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2
  const T = 1 - 0.17 * Math.cos((H - 30) * rad) + 0.24 * Math.cos(2 * H * rad) + 0.32 * Math.cos((3 * H + 6) * rad) - 0.2 * Math.cos((4 * H - 63) * rad)
  const SL = 1 + (0.015 * (L - 50) ** 2) / Math.sqrt(20 + (L - 50) ** 2), SC = 1 + 0.045 * C, SH = 1 + 0.015 * C * T
  const RT = -Math.sin(60 * Math.exp(-(((H - 275) / 25) ** 2)) * rad) * 2 * p7(C)
  const [l, c, h] = [(L2 - L1) / SL, (C2 - C1) / SC, dH / SH]
  return Math.sqrt(l * l + c * c + h * h + RT * c * h)
}

/** Steps the floor down to `rows` rows, confirming each removal. */
async function fewerRows(page: Page, rows: number) {
  for (let h = await page.locator('.site-grid .grid-axis--row').count(); h > rows; h -= 1) {
    await page.getByRole('button', { name: 'Fewer rows', exact: true }).click()
    const confirm = page.getByRole('button', { name: /^(Remove \d+ cells? and resize|Resize)$/ })
    if (await confirm.count()) await confirm.click()
    await expect(page.locator('.floor-head-title')).toContainText(`× ${h - 1} deep`)
  }
}

// Measured on main (965215b) before the refit: 42.6% × 70% of a 1112 × 520 canvas at 1280 and
// 1919, and 70% × 27.8% of a 283 × 520 canvas at 375.
const SIZES = [
  { width: 1919, height: 998, floorW: [0.55, 0.65], floorH: [0.7, 0.74], canvasH: [600, 700] },
  { width: 1280, height: 800, floorW: [0.55, 0.65], floorH: [0.7, 0.74], canvasH: [600, 700] },
  { width: 375, height: 812, floorW: [0.86, 0.9], floorH: [0.6, 0.74], canvasH: [280, 340] },
] as const

for (const size of SIZES) test(`at ${size.width} × ${size.height} the starter floor spans enough of the canvas's width and height`, async ({ page }) => {
  await page.setViewportSize({ width: size.width, height: size.height })
  const canvas = await open3D(page)
  const { width, height } = (await canvas.boundingBox())!
  expect(height, `canvas ${width} × ${height}: its height`).toBeGreaterThanOrEqual(size.canvasH[0])
  expect(height, `canvas ${width} × ${height}: its height`).toBeLessThanOrEqual(size.canvasH[1])
  const b = await expectFramed(page, `${size.width} × ${size.height}`)
  expect(b.w, "the floor's share of the canvas's width").toBeGreaterThanOrEqual(size.floorW[0])
  expect(b.w, "the floor's share of the canvas's width").toBeLessThanOrEqual(size.floorW[1])
  expect(b.h, "the floor's share of the canvas's height").toBeGreaterThanOrEqual(size.floorH[0])
  expect(b.h, "the floor's share of the canvas's height").toBeLessThanOrEqual(size.floorH[1])
})

test('the 3D floor fills its binding dimension, with the whole scene centred inside it, on load and after a floor resize', async ({ page }) => {
  await open3D(page)
  await expectFramed(page, 'starter 12 × 9 floor')
  const before = await page.locator('.pg3d-canvas').getAttribute('data-floor-corners')

  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'More rows', exact: true }).click()
  await expect(page.locator('.floor-head-title')).toContainText('12 wide × 12 deep')
  await expect(page.locator('.pg3d-canvas')).not.toHaveAttribute('data-floor-corners', before ?? '')
  await expectFramed(page, 'resized 12 × 12 floor')
})

test('on a shallow 12 × 4 warehouse floor every rack stands wholly inside the canvas', async ({ page }) => {
  const canvas = await open3D(page, () => fewerRows(page, 4))
  await expect(page.locator('.floor-head-title')).toContainText('12 wide × 4 deep')
  // The racks' tops bind first here, so the floor fills less than 72% of the height.
  const b = await expectFramed(page, 'shallow 12 × 4 floor')
  expect(Math.max(b.w, b.h), "the shallow floor's larger share of the canvas").toBeGreaterThanOrEqual(0.6)
  // The racks' orange uprights reach the top of the scene. They start inside the canvas, at
  // the top of the published scene box, never at its edge.
  const { height: h } = (await canvas.boundingBox())!
  const shot = await canvas.screenshot({ scale: 'css' })
  const top = await page.evaluate(async (src) => {
    const img = new Image()
    img.src = src
    await img.decode()
    const ctx = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }).getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, img.width, img.height).data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] >= 170 && d[i] - d[i + 1] >= 60 && d[i] - d[i + 2] >= 110) return Math.floor(i / 4 / img.width)
    }
    return -1
  }, `data:image/png;base64,${shot.toString('base64')}`)
  const s = await sceneBox(page)
  expect(top, 'a rack upright is drawn').toBeGreaterThanOrEqual(0)
  expect(top, 'the highest rack starts inside the canvas').toBeGreaterThanOrEqual(Math.floor(0.02 * h))
  expect(Math.abs(top - s.y0 * h), 'the highest rack meets the top of the published scene box').toBeLessThanOrEqual(6)
})

test('the published corners match the picture, and the ground, background and floor are warm', async ({ page }) => {
  const canvas = await open3D(page)
  const { width: w, height: h } = (await canvas.boundingBox())!
  const cs = await corners(page)
  const [lowIn, lowOut, leftIn, leftOut] = await patches(page, canvas, besideCorners(cs, w, h))
  // Inside each corner is the pale floor; outside it, the darker stone ground.
  expect(light(lowIn) - light(lowOut), `floor ${lowIn} vs ground ${lowOut} at the lowest corner`).toBeGreaterThanOrEqual(15)
  expect(light(leftIn) - light(leftOut), `floor ${leftIn} vs ground ${leftOut} at the left corner`).toBeGreaterThanOrEqual(15)
  for (const floor of [lowIn, leftIn]) expect(warm(floor, 0), `floor ${floor}: red at least blue`).toBe(true)
  for (const ground of [lowOut, leftOut]) expect(warm(ground, 5), `ground ${ground}: warm stone, not grey-blue`).toBe(true)
  // Inside its rounded corners, the canvas shows the warm background or the warm ground, never grey-blue.
  const edges = await patches(page, canvas, [[24, 24], [w - 24, 24], [24, h - 24], [w - 24, h - 24]])
  for (const px of edges) {
    expect(warm(px, 0), `canvas corner ${px}: red at least blue`).toBe(true)
    expect(warm(px, 5), `canvas corner ${px}: warm`).toBe(true)
  }
})

test('a canvas of a new shape re-frames the floor until the visitor turns the view, which dragging still does', async ({ page }) => {
  const canvas = await open3D(page)
  const mount = page.locator('.pg3d-canvas')
  const first = await mount.getAttribute('data-floor-corners')
  const viewport = page.viewportSize()!
  const widthNow = async () => (await canvas.boundingBox())!.width
  const wide = await widthNow()

  // Untouched, the view re-frames the floor for the new canvas shape. The canvas keeps its
  // aspect while it narrows (17:10 on a wide stage, square on a phone), so the resize crosses
  // into another shape: a desktop narrows until the 520 px floor holds the height, and a phone
  // widens past 640 px to the 17:10 stage.
  await page.setViewportSize({ width: viewport.width > 640 ? 768 : 720, height: viewport.height })
  await expect.poll(widthNow).not.toBe(wide)
  await expect(mount).not.toHaveAttribute('data-floor-corners', first ?? '')
  await expectFramed(page, 'resized canvas')
  const framed = await mount.getAttribute('data-floor-corners')

  // Dragging turns the view.
  await draw(page)
  const before = await canvas.screenshot({ scale: 'css' })
  const { x, y, width, height } = (await canvas.boundingBox())!
  await page.mouse.move(x + width / 2, y + height / 2)
  await page.mouse.down()
  await page.mouse.move(x + width / 2 - 120, y + height / 2, { steps: 6 })
  await page.mouse.up()
  await page.clock.runFor(200)
  expect((await canvas.screenshot({ scale: 'css' })).equals(before), 'the picture changed after the drag').toBe(false)

  // Once turned, a resize keeps the visitor's view instead of re-framing it.
  await page.setViewportSize(viewport)
  await expect.poll(widthNow).toBe(wide)
  await expect(mount).toHaveAttribute('data-floor-corners', framed ?? '')
})

// Without racks the framed scene is the floor itself, so on a hospital floor the fitted aim
// point lies 0.7 below the floor plane at 1280 × 720 unless it is slid onto it.
for (const domain of ['warehouse', 'hospital']) test(`turning the view of a ${domain} floor down to its lowest angle keeps the floor and the ground drawn`, async ({ page }) => {
  const canvas = await open3D(page, () => page.getByRole('combobox', { name: 'Domain', exact: true }).selectOption(domain).then(() => undefined))
  const { x, y, width, height } = (await canvas.boundingBox())!
  // An upward drag lowers the camera; this one runs well past the lowest angle allowed.
  await page.mouse.move(x + width / 2, y + height / 2)
  await page.mouse.down()
  await page.mouse.move(x + width / 2, y + height / 2 - 300, { steps: 10 })
  await page.mouse.up()
  await page.clock.runFor(200)
  // The camera still looks at a pivot on the floor, so the canvas's centre shows the floor (or
  // what stands on it), and the band near the bottom shows the ground: neither is background.
  const seen = await patches(page, canvas, [[width / 2, height / 2], [width * 0.25, height * 0.9], [width / 2, height * 0.9], [width * 0.75, height * 0.9]])
  for (const px of seen) expect(light(BACKGROUND) - light(px), `pixel ${px} is drawn, not background`).toBeGreaterThanOrEqual(30)
})

test("an AMR's deck reads as its fleet swatch, unfogged, on a phone as on a desktop", async ({ page }) => {
  // Fleet 1 and the Robot tool (AMR) are active from the start: the tap places Fleet 1's AMR
  // at the corner nearest the camera, where nothing stands in front of it.
  const canvas = await open3D(page, () => page.getByRole('button', { name: 'L9, empty', exact: true }).click())
  const { width, height } = (await canvas.boundingBox())!
  const mount = page.locator('.pg3d-canvas')
  await expect(mount).toHaveAttribute('data-amr-decks', /^(\d:\d\.\d{3},\d\.\d{3} ?)+$/)
  const decks = ((await mount.getAttribute('data-amr-decks')) ?? '').split(' ').map((token) => {
    const [fleet, at] = token.split(':')
    const [dx, dy] = at.split(',').map(Number)
    return { fleet: Number(fleet), x: dx * width, y: dy * height }
  })
  const nearest = decks.reduce((a, d) => (d.y > a.y ? d : a))
  expect(nearest.fleet).toBe(1)
  const [deck] = await patches(page, canvas, [[nearest.x, nearest.y]], 1)
  expect(deltaE2000(deck, [43, 82, 59]), `deck ${deck} against the forest swatch #2b523b`).toBeLessThanOrEqual(5)
})
