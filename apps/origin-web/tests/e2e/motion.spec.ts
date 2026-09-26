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
  await page.getByRole('button', { name: 'Pause wave playback', exact: true }).click()
  const paused = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())
  await page.waitForTimeout(600)
  expect(await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(paused)
  await page.getByRole('button', { name: 'Play wave playback', exact: true }).click()
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
  await page.getByRole('button', { name: 'Pause floor playback', exact: true }).click()
  const paused = await grid.innerHTML()
  await page.waitForTimeout(600)
  expect(await grid.innerHTML()).toBe(paused)
  await page.getByRole('button', { name: 'Play floor playback', exact: true }).click()
  await expect.poll(() => grid.innerHTML()).not.toBe(paused)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(grid).not.toBeInViewport()
  await page.waitForTimeout(200)
  const outside = await grid.innerHTML()
  await page.waitForTimeout(600)
  expect(await grid.innerHTML()).toBe(outside)
})
