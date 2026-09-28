import { test, expect } from '@playwright/test'

const ROUTES = ['/', '/verify', '/reference-check', '/over-grant', '/security', '/proving-ground', '/operations', '/simulation']

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
})

test('reduced motion keeps the stepper still and retains colour feedback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const route of ROUTES) {
    await page.goto(route)
    if (route === '/') {
      await page.locator('[data-demo-step="5"]').click()
      const moving = await page.evaluate(() => document.getAnimations().filter(a => a instanceof CSSAnimation || /transform|translate|top|width|height/.test((a as CSSTransition).transitionProperty ?? '')).map(a => a.id || (a as CSSAnimation).animationName))
      expect(moving).toEqual([])
    }
    const infinite = await page.locator('body *').evaluateAll(elements => elements.filter(el => {
      const css = getComputedStyle(el)
      return el.getClientRects().length && css.animationIterationCount.split(',').some(v => v.trim() === 'infinite')
    }).map(el => el.className))
    expect(infinite, route).toEqual([])
    const videos = await page.locator('video').evaluateAll(elements => elements.map(el => ({ paused: el.paused, time: el.currentTime })))
    expect(videos.every(video => video.paused && video.time === 0), route).toBe(true)
  }
  await page.goto('/proving-ground')
  const button = page.locator('.pg-toggle button').first()
  await expect(button).toBeVisible()
  const feedback = await button.evaluate(el => ({ properties: getComputedStyle(el).transitionProperty, duration: getComputedStyle(el).transitionDuration }))
  expect(feedback.properties).toMatch(/color|background/)
  expect(feedback.duration.split(',').some(value => parseFloat(value) > 0 && parseFloat(value) <= .15)).toBe(true)
})

test('stepper verdict readouts never inherit a panel entrance animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.locator('[data-demo-step="5"]').click()
  const animations = await page.locator('[data-demo-panel="5"] .demo__readout').evaluateAll(readouts => readouts.flatMap(el => {
    const animations: string[] = []
    for (let node: Element | null = el; node; node = node.parentElement) {
      const name = getComputedStyle(node).animationName
      if (name !== 'none') animations.push(name)
    }
    return animations
  }))
  expect(animations).toEqual([])
})

test('operations playback can pause and does not advance off screen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/operations')
  const canvas = page.locator('.ops-canvas')
  await canvas.scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click()
  const paused = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())
  await page.waitForTimeout(600)
  expect(await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(paused)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).not.toBe(paused)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(canvas).not.toBeInViewport()
  await page.waitForTimeout(200)
  const outside = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())
  await page.waitForTimeout(600)
  expect(await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(outside)
})

test('2D floor playback can pause and does not advance off screen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/proving-ground')
  await page.getByRole('button', { name: '2D', exact: true }).click()
  const grid = page.locator('.sim-grid')
  await grid.scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click()
  const paused = await grid.innerHTML()
  await page.waitForTimeout(600)
  expect(await grid.innerHTML()).toBe(paused)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => grid.innerHTML()).not.toBe(paused)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(grid).not.toBeInViewport()
  await page.waitForTimeout(200)
  const outside = await grid.innerHTML()
  await page.waitForTimeout(600)
  expect(await grid.innerHTML()).toBe(outside)
})

test('reduced-motion floor edits show the new plan at its final frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const siteMap = { width: 5, height: 5, start: { x: 0, y: 0 }, item: { x: 1, y: 0 }, drop: { x: 0, y: 0 }, robots: [{ x: 0, y: 0 }], obstacles: [], hazards: [], humanOnly: [] }
  await page.route('**/src/proving-ground/starterFloor.ts*', async route => {
    const response = await route.fetch()
    const source = await response.text()
    expect(source).toContain('siteMap: starterSiteMap(),')
    await route.fulfill({ response, body: source.replace('siteMap: starterSiteMap(),', `siteMap: ${JSON.stringify(siteMap)},`) })
  })
  await page.goto('/proving-ground')
  const robotCells = () => page.locator('.sim-grid .sim-cell').evaluateAll(cells => cells.flatMap((cell, i) => cell.classList.contains('robot') ? [i] : []))
  await expect.poll(robotCells).toEqual([0])
  await page.locator('.smp-tool').filter({ hasText: 'Item' }).click()
  await page.getByRole('button', { name: /^Cell 4,4 / }).click()
  await expect.poll(robotCells).toEqual([0])
  await expect(page.locator('.sim-grid .sim-cell').nth(24)).toHaveClass(/picked/)
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})

test('operations holds the last frame and a new wave or shift starts playback again', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()
  await page.goto('/operations')
  const stage = page.locator('.ops-stage')
  const canvas = page.locator('.ops-canvas')
  await canvas.scrollIntoViewIfNeeded()
  await page.clock.runFor(90_000)
  await expect(stage.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  const end = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())
  await page.clock.runFor(90_000)
  expect(await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(end)
  await page.locator('.ops-wave').nth(1).click()
  await canvas.scrollIntoViewIfNeeded()
  await expect(stage.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible()
  await page.clock.runFor(90_000)
  await page.getByRole('button', { name: 'Run a new shift', exact: true }).click()
  await canvas.scrollIntoViewIfNeeded()
  await expect(stage.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible()
})

test('3D playback pauses rendering off screen and hidden, finishes once, and replays on request', async ({ page }) => {
  test.setTimeout(60_000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()
  await page.addInitScript(() => {
    const state = window as unknown as { draws: number }
    state.draws = 0
    for (const context of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const original = context.prototype.drawElements
      context.prototype.drawElements = function (...args) { state.draws++; return original.apply(this, args) }
    }
  })
  const siteMap = { width: 5, height: 5, start: { x: 0, y: 0 }, item: { x: 1, y: 0 }, drop: { x: 0, y: 0 }, robots: [{ x: 0, y: 0 }], obstacles: [], hazards: [], humanOnly: [] }
  await page.route('**/src/proving-ground/starterFloor.ts*', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace('siteMap: starterSiteMap(),', `siteMap: ${JSON.stringify(siteMap)},`) })
  })
  await page.goto('/proving-ground')
  const canvas = page.locator('.pg3d-canvas')
  await canvas.scrollIntoViewIfNeeded()
  const draws = () => page.evaluate(() => (window as unknown as { draws: number }).draws)
  await expect.poll(draws).toBeGreaterThan(0)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(canvas).not.toBeInViewport()
  await page.clock.runFor(100)
  const outside = await draws()
  await page.clock.runFor(1000)
  expect(await draws()).toBe(outside)
  await canvas.scrollIntoViewIfNeeded()
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.clock.runFor(100)
  const hidden = await draws()
  await page.clock.runFor(1000)
  expect(await draws()).toBe(hidden)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.clock.runFor(8000)
  await expect(page.locator('.pg3d-controls').getByRole('button', { name: 'Replay', exact: true })).toBeVisible()
  // Completion commits the stopped state, whose effect schedules one final draw.
  await page.clock.runFor(100)
  const complete = await draws()
  await page.clock.runFor(8000)
  expect(await draws()).toBe(complete)
  await page.locator('.pg3d-controls').getByRole('button', { name: 'Replay', exact: true }).click()
  await page.clock.runFor(500)
  expect(await draws()).toBeGreaterThan(complete)
  await page.locator('.pg3d-controls').getByRole('button', { name: 'Pause', exact: true }).click()
  await page.clock.runFor(100)
  const paused = await draws()
  await page.clock.runFor(1000)
  expect(await draws()).toBe(paused)
})

for (const field of ['Domain', 'Robot embodiment']) {
  test(`changing ${field} starts a fresh 3D preview after completion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.clock.install()
    const siteMap = { width: 5, height: 5, start: { x: 0, y: 0 }, item: { x: 1, y: 0 }, drop: { x: 0, y: 0 }, robots: [{ x: 0, y: 0 }], obstacles: [], hazards: [], humanOnly: [] }
    await page.route('**/src/proving-ground/starterFloor.ts*', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()).replace('siteMap: starterSiteMap(),', `siteMap: ${JSON.stringify(siteMap)},`) })
    })
    await page.goto('/proving-ground')
    const canvas = page.locator('.pg3d-canvas')
    const controls = page.locator('.pg3d-controls')
    await canvas.scrollIntoViewIfNeeded()
    await page.clock.runFor(8000)
    await expect(controls.getByRole('button', { name: 'Replay', exact: true })).toBeVisible()
    const select = page.getByRole('combobox', { name: field, exact: true })
    await expect(select).toBeVisible()
    const next = await select.locator('option').evaluateAll(options => (options.find(option => !(option as HTMLOptionElement).selected) as HTMLOptionElement).value)
    await select.selectOption(next)
    await canvas.scrollIntoViewIfNeeded()
    await expect(controls.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await page.clock.runFor(8000)
    await expect(controls.getByRole('button', { name: 'Replay', exact: true })).toBeVisible()
  })
}

test('2D floor playback holds its final state until replay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()
  await page.goto('/proving-ground')
  await page.getByRole('button', { name: '2D', exact: true }).click()
  const grid = page.locator('.sim-grid')
  await grid.scrollIntoViewIfNeeded()
  // React schedules each next step after rendering, so advance one tick at a time.
  for (let i = 0; i < 150; i++) await page.clock.runFor(500)
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveText('Play')
  const final = await grid.innerHTML()
  for (let i = 0; i < 30; i++) await page.clock.runFor(1000)
  expect(await grid.innerHTML()).toBe(final)
})

test('reduced motion leaves static text still and disables the Passport kill-icon rotation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/proving-ground')
  const prose = page.locator('.smp-sub')
  await expect(prose).toBeVisible()
  expect(await prose.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s')
  await page.goto('/passport')
  // Public demo controls remain testable without calling any provider.
  const style = await page.evaluate(() => {
    const host = document.querySelector('.pp-app')!
    const button = document.createElement('button'); button.className = 'pp-led-kill'
    button.innerHTML = '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>'
    host.appendChild(button)
    return button.outerHTML
  })
  expect(style).toContain('pp-led-kill')
  await page.locator('.pp-led-kill').hover()
  expect(await page.locator('.pp-led-kill svg').evaluate(el => getComputedStyle(el).transform)).toBe('none')
})

test('offscreen explanatory cards are never hidden behind scroll reveal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expect(page.locator('.notgrid .card')).toHaveCount(5)
  const hidden = await page.locator('.card, .checklist > li, .routecard').evaluateAll(elements => elements.filter(el => getComputedStyle(el).opacity !== '1').map(el => el.textContent?.trim().slice(0, 50)))
  expect(hidden).toEqual([])
})

test('progress, microphone and skip-link motion does not animate layout properties', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const route of ['/', '/proving-ground', '/clip', '/passport']) {
    await page.goto(route)
    const bad = await page.evaluate(() => {
      const errors: string[] = []
      const layout = /^(width|height|top|left|right|bottom|margin.*|padding.*)$/
      function visit(rules: CSSRuleList) {
        for (const rule of rules) {
          if (rule instanceof CSSKeyframeRule) {
            for (const prop of rule.style) if (layout.test(prop)) errors.push(`${rule.cssText}`)
          } else if (rule instanceof CSSStyleRule && /skip-link|pg3d-prog-fill|clip-mic-level/.test(rule.selectorText)) {
            if (rule.style.transitionProperty.split(',').some(p => layout.test(p.trim()))) errors.push(rule.cssText)
          }
          if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules)
        }
      }
      for (const sheet of document.styleSheets) { try { visit(sheet.cssRules) } catch { /* only same-origin styles */ } }
      return errors
    })
    expect(bad, route).toEqual([])
  }
})
