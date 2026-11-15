import { test, expect, type Page } from '@playwright/test'

// Release 6 Phase 1 — no blue
// Style Lock: paper, ink and one forest-green accent (#2b523b, hover #203f2d); no blue, no teal,
// no gradients. A colour is blue or teal when its hue is between 170° and 260° and it is visibly
// saturated: after any alpha is composited over white, its channels spread by at least 10 and its
// HSL saturation is at least 0.25. Transparent colours and warm or cool near-greys pass.
// Runs in both projects.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
})

const FOREST = 'rgb(43, 82, 59)'
const FOREST_HOVER = 'rgb(32, 63, 45)'

/** Every blue or teal colour the page paints, and every blue or teal colour its stylesheets declare.
 *  With `focusedOnly`, only what the focused element paints, its focus ring included. */
const blueOnPage = (page: Page, focusedOnly = false) => page.evaluate((focusedOnly) => {
  const inBand = (r0: number, g0: number, b0: number, a: number) => {
    if (a < 0.04) return false
    const [r, g, b] = [r0, g0, b0].map((v) => 255 + (v - 255) * a)
    const max = Math.max(r, g, b)
    const spread = max - Math.min(r, g, b)
    if (spread < 10) return false
    const light = (max + Math.min(r, g, b)) / 510
    if (spread / 255 / (1 - Math.abs(2 * light - 1)) < 0.25) return false
    const hue = max === r ? 60 * (((g - b) / spread + 6) % 6) : max === g ? 60 * ((b - r) / spread + 2) : 60 * ((r - g) / spread + 4)
    return hue >= 170 && hue <= 260
  }
  const blue = (text: string) => {
    const found: string[] = []
    for (const m of text.matchAll(/rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)|#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
      let rgba: number[]
      if (m[1]) rgba = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
      else if (m[2]) rgba = m[2].split(/[\s/]+/).filter(Boolean).map(Number).map((v, i) => (i < 3 ? v * 255 : v))
      else {
        const hex = m[3].length === 3 ? m[3].replace(/./g, (c) => c + c) : m[3]
        rgba = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
      }
      const [r, g, b, a = 1] = rgba
      if (inBand(r, g, b, a)) found.push(m[0])
    }
    return found
  }
  const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.getAttribute('class') ? `.${el.getAttribute('class')!.trim().split(/\s+/).join('.')}` : ''}`

  const painted: string[] = []
  for (const el of focusedOnly ? [document.activeElement ?? document.body] : document.querySelectorAll('*')) {
    for (const pseudo of [null, '::before', '::after']) {
      const css = getComputedStyle(el, pseudo)
      if (pseudo && ['none', 'normal'].includes(css.content)) continue
      const values: Record<string, string> = {
        color: css.color, 'background-color': css.backgroundColor, 'background-image': css.backgroundImage,
        'outline-color': css.outlineColor, 'box-shadow': css.boxShadow,
      }
      for (const side of ['top', 'right', 'bottom', 'left']) {
        if (parseFloat(css.getPropertyValue(`border-${side}-width`)) > 0) values[`border-${side}-color`] = css.getPropertyValue(`border-${side}-color`)
      }
      if (el instanceof SVGElement) { values.fill = css.fill; values.stroke = css.stroke }
      for (const [prop, value] of Object.entries(values)) {
        for (const hit of blue(value)) painted.push(`${name(el)}${pseudo ?? ''} ${prop}: ${hit}`)
      }
    }
  }

  if (focusedOnly) return { painted, declared: [] }
  const declared: string[] = []
  const walk = (rules: CSSRuleList, sheet: string) => {
    for (const rule of rules) {
      if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules, sheet)
      if (rule instanceof CSSStyleRule) for (const hit of blue(rule.style.cssText)) declared.push(`${sheet} ${rule.selectorText}: ${hit}`)
    }
  }
  for (const sheet of document.styleSheets) walk(sheet.cssRules, sheet.href ? new URL(sheet.href).pathname : 'inline <style>')

  return { painted: [...new Set(painted)], declared: [...new Set(declared)] }
}, focusedOnly)

/** Tabs once through the page. For every stop that shows keyboard focus: its focus ring, the
 *  contrast of that ring against the ground under it (translucent layers composited over white),
 *  and anything blue or teal the stop paints, its ring included. */
const tabWalk = async (page: Page) => {
  const stops: { name: string, ring: string, contrast: number }[] = []
  const blue: string[] = []
  for (let i = 0; i < 200; i++) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body || !el.matches(':focus-visible')) return null
      const rgba = (color: string) => {
        const v = color.match(/^rgba?\(([^)]+)\)$/)?.[1].split(/[\s,/]+/).map(Number)
        return v ? [v[0], v[1], v[2], v[3] ?? 1] : [NaN, NaN, NaN, 1]
      }
      const luminance = (rgb: number[]) => rgb.map((value) => {
        const c = value / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
      const css = getComputedStyle(el)
      const layers: number[][] = []
      for (let node = parseFloat(css.outlineOffset) < 0 ? el : el.parentElement; node; node = node.parentElement) {
        const layer = rgba(getComputedStyle(node).backgroundColor)
        if (layer[3] > 0) layers.unshift(layer)
        if (layer[3] >= 1) break
      }
      const ground = layers.reduce((under, [r, g, b, a]) => [r, g, b].map((v, i) => v * a + under[i] * (1 - a)), [255, 255, 255])
      const [r, g, b, a] = rgba(css.outlineColor)
      const ring = [r, g, b].map((v, i) => v * a + ground[i] * (1 - a))
      const [hi, lo] = [luminance(ring), luminance(ground)].sort((x, y) => y - x)
      const box = el.getBoundingClientRect()
      return {
        name: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}" at ${Math.round(box.top + scrollY)}`,
        ring: `${css.outlineStyle} ${css.outlineWidth} ${css.outlineColor}`,
        contrast: css.outlineStyle === 'none' ? 0 : Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
      }
    })
    if (!stop) continue
    if (stop.name === stops[0]?.name) break
    if (stops.some((seen) => seen.name === stop.name)) continue
    stops.push(stop)
    blue.push(...(await blueOnPage(page, true)).painted)
  }
  return { stops, blue }
}

test('the proving ground evaluation button is flat forest green, also on hover', async ({ page, isMobile }) => {
  await page.goto('/proving-ground')
  const button = page.getByRole('button', { name: /Inspect the result/ })
  await expect(button).toBeVisible()
  const look = () => button.evaluate((el) => {
    const css = getComputedStyle(el)
    return { image: css.backgroundImage, color: css.backgroundColor }
  })
  expect(await look()).toEqual({ image: 'none', color: FOREST })
  test.skip(isMobile, 'hover needs a pointer')
  await button.hover()
  await expect.poll(async () => (await look()).color).toBe(FOREST_HOVER)
  expect((await look()).image).toBe('none')
})

test('every primary button on the site-to-gym console is flat forest green', async ({ page }) => {
  await page.goto('/capture')
  const buttons = page.locator('.btn.primary')
  await expect(buttons.first()).toBeVisible()
  const looks = await buttons.evaluateAll((els) => els.map((el) => {
    const css = getComputedStyle(el)
    return `${el.textContent?.trim()}: ${css.backgroundColor} ${css.backgroundImage}`
  }))
  expect(looks.length).toBeGreaterThan(0)
  for (const look of looks) expect(look).toMatch(/: rgb\(43, 82, 59\) none$/)
})

for (const route of ['/', '/trust', '/app', '/foundry', '/reference-check', '/security']) {
  test(`${route} paints and declares no blue or teal`, async ({ page }) => {
    await page.goto(route)
    // The page's own H1 (on /foundry, the app's, once it mounts over the static fallback).
    await expect(page.locator('main h1:visible')).toHaveCount(1)
    const { painted, declared } = await blueOnPage(page)
    expect(painted).toEqual([])
    expect(declared).toEqual([])
  })
}

// Keyboard focus. A control with no ring of its own gets the browser's, which Chromium paints
// blue (rgb(0, 95, 204) on paper), and a native checkbox fills with the browser's blue unless it
// sets accent-color. On the graphite verify strip of /proof the shared forest ring is 1.6:1, so
// the strip draws its rings in the on-dark tone.
for (const route of ['/foundry', '/proof']) {
  test(`${route}: every keyboard focus ring is solid, at least 3:1 on its ground, and never blue`, async ({ page }) => {
    await page.goto(route)
    await expect(page.locator('main h1:visible')).toHaveCount(1)
    const { stops, blue } = await tabWalk(page)
    expect(stops.length).toBeGreaterThan(10)
    if (route === '/proof') {
      // The walk crosses the strip: its repo link, the command block and the in-page re-check buttons.
      for (const name of [/^a "github\.com\/bohueilin\/Origin"/, /^pre "# in the repo/, /^button "Re-verify in this tab"/, /^button "Flip one character/]) {
        expect(stops.map((stop) => stop.name)).toContainEqual(expect.stringMatching(name))
      }
    }
    expect(blue).toEqual([])
    expect(stops.filter((stop) => !stop.ring.startsWith('solid ') || stop.contrast < 3)).toEqual([])
  })
}

test('the /foundry upload consent checkbox fills forest green, not the browser blue', async ({ page }) => {
  await page.goto('/foundry')
  await expect(page.locator('.fdy-consent input[type="checkbox"]')).toHaveCSS('accent-color', FOREST)
})
