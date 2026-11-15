import { test, expect, type Page } from '@playwright/test'

// Release 6 Phase 1 — sim palette
// /simulation and /operations draw their warehouse robots in the proving ground's six fleet
// colours (src/shared/fleetPalette.ts), never in blue or teal, on a warm paper floor. The page
// exposes nothing new: the test replays the same seeded run from the module the dev server
// serves, finds where the page draws each robot on the frame it holds (reduced motion holds the
// last frame), and reads the canvas pixels there. Runs in both projects.

const FLEET = ['#2b523b', '#8a5200', '#6940a3', '#9d2e68', '#4a4238', '#525e2c']
type RGB = [number, number, number]
const FLEET_RGB: RGB[] = FLEET.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB)

const near = (a: RGB, b: RGB) => a.every((v, i) => Math.abs(v - b[i]) <= 2)
const isFleet = (c: RGB) => FLEET_RGB.some((f) => near(f, c))
/** Blue or teal: a hue between 170° and 260° with any visible saturation. */
function isBlueTeal([r, g, b]: RGB) {
  const max = Math.max(r, g, b)
  const chroma = max - Math.min(r, g, b)
  if (chroma < 6) return false
  const hue = max === r ? 60 * (((g - b) / chroma + 6) % 6) : max === g ? 60 * ((b - r) / chroma + 2) : 60 * ((r - g) / chroma + 4)
  return hue >= 170 && hue <= 260
}
const parseRgb = (css: string) => (css.match(/\d+/g) ?? []).slice(0, 3).map(Number) as RGB

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
  // Reduced motion holds the run's last frame, so the canvas is still while it is read.
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

interface Run { seed: number; robots: number; shiftWaves?: number }

/**
 * Replays the page's seeded run in the page, then reads the canvas where render2d draws each
 * robot on the last frame: the most common colour inside its disc, leaving out the white
 * label. A robot under the human marker's halo or sharing a cell is skipped. Also returns the
 * most common opaque pixel of the whole canvas, which is the floor.
 */
async function readCanvas(page: Page, selector: string, run: Run) {
  const canvas = page.locator(selector)
  await expect(canvas).toBeVisible()
  return canvas.evaluate(async (el, { run, sources }) => {
    const canvas = el as HTMLCanvasElement
    const sim = await import(sources.sim)
    const seed = run.shiftWaves ? (await import(sources.ops)).runShift(run.seed, run.shiftWaves, run.robots).waves[0].seed : run.seed
    const scene = sim.buildWarehouseScene({ seed, robots: run.robots })
    const frames = sim.simulate(scene).frames
    const frame = frames[frames.length - 1]
    // render2d's geometry, in CSS pixels of the bitmap it drew.
    const dpr = window.devicePixelRatio || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    const cell = Math.max(6, Math.min((w - 32) / scene.width, (h - 32) / scene.height))
    const ox = (w - cell * scene.width) / 2
    const oy = (h - cell * scene.height) / 2
    const centre = (p: { x: number; y: number }) => [ox + (p.x + 0.5) * cell, oy + (p.y + 0.5) * cell]
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    const mode = (pixels: number[]) => {
      const counts = new Map<number, number>()
      for (const i of pixels) {
        const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      const [key] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [-1]
      return key < 0 ? null : [(key >> 16) & 255, (key >> 8) & 255, key & 255]
    }
    const [hx, hy] = centre(frame.human)
    const robots = frame.robots.flatMap((r: { id: string; pos: { x: number; y: number }; done: boolean }) => {
      const [x, y] = centre(r.pos)
      const rad = cell * (r.done ? 0.24 : 0.3)
      const shared = frame.robots.some((o: typeof r) => o !== r && o.pos.x === r.pos.x && o.pos.y === r.pos.y)
      if (shared || Math.hypot(x - hx, y - hy) < cell * 0.55 + rad) return []
      const reach = rad * 0.85 * dpr
      const pixels: number[] = []
      for (let py = Math.ceil(y * dpr - reach); py <= Math.floor(y * dpr + reach); py += 1) {
        for (let px = Math.ceil(x * dpr - reach); px <= Math.floor(x * dpr + reach); px += 1) {
          if (Math.hypot(px + 0.5 - x * dpr, py + 0.5 - y * dpr) > reach) continue
          const i = (py * canvas.width + px) * 4
          if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) continue // the white label or carried pod
          pixels.push(i)
        }
      }
      return [{ id: r.id, rgb: mode(pixels) }]
    })
    const opaque: number[] = []
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) opaque.push(i)
    return { robots, total: frame.robots.length, floor: mode(opaque) }
  }, { run, sources: { sim: '/src/simulation/warehouseSim.ts', ops: '/src/simulation/opsMetrics.ts' } })
}

test('/simulation draws its robots and legend in the fleet colours on a warm paper floor', async ({ page }) => {
  await page.goto('/simulation')
  // The legend swatch beside each robot's order.
  const swatches = await page.locator('#sim-root .sim-chip i').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))
  expect(swatches).toHaveLength(4)
  for (const css of swatches) {
    expect(isBlueTeal(parseRgb(css)), `legend swatch ${css}`).toBe(false)
    expect(isFleet(parseRgb(css)), `legend swatch ${css}`).toBe(true)
  }
  // The page's default run: seed 20260713, four robots.
  const { robots, total, floor } = await readCanvas(page, '#sim-root .sim-canvas', { seed: 20260713, robots: 4 })
  expect(total).toBe(4)
  expect(robots.length, 'robots clear of the human marker').toBe(4)
  for (const { id, rgb } of robots) {
    expect(rgb, id).not.toBeNull()
    expect(isBlueTeal(rgb as RGB), `${id} draws rgb(${rgb})`).toBe(false)
    expect(isFleet(rgb as RGB), `${id} draws rgb(${rgb})`).toBe(true)
  }
  // The floor is a warm neutral: red at least blue, and no visible hue.
  const [r, g, b] = floor as RGB
  expect(r, `floor rgb(${floor})`).toBeGreaterThanOrEqual(b)
  expect(Math.max(r, g, b) - Math.min(r, g, b), `floor rgb(${floor})`).toBeLessThanOrEqual(12)
  expect(isBlueTeal(floor as RGB), `floor rgb(${floor})`).toBe(false)
})

test('/operations draws the selected wave\'s robots in the fleet colours, never blue or teal', async ({ page }) => {
  await page.goto('/operations')
  // The page's default shift: seed 777, six waves, a fleet of four; wave 1 is selected.
  const { robots, total, floor } = await readCanvas(page, '#ops-root .ops-canvas', { seed: 777, robots: 4, shiftWaves: 6 })
  expect(total).toBe(4)
  expect(robots.length, 'robots clear of the human marker').toBe(4)
  for (const { id, rgb } of robots) {
    expect(rgb, id).not.toBeNull()
    expect(isBlueTeal(rgb as RGB), `${id} draws rgb(${rgb})`).toBe(false)
    expect(isFleet(rgb as RGB), `${id} draws rgb(${rgb})`).toBe(true)
  }
  const [r, , b] = floor as RGB
  expect(r, `floor rgb(${floor})`).toBeGreaterThanOrEqual(b)
  expect(isBlueTeal(floor as RGB), `floor rgb(${floor})`).toBe(false)
})
