import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// a11y.spec.ts gates every page in its initial state. These checks drive the interactive
// surfaces with the keyboard alone and re-run axe on the states a reviewer actually
// reaches. Local checks only, not a claim of WCAG conformance.
async function localOnly(page: Page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
}

async function expectNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map(v => `${v.id} x${v.nodes.length}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), label).toEqual([])
}

async function press(page: Page, target: Locator, key = 'Enter') {
  await target.focus()
  await page.keyboard.press(key)
}

test.beforeEach(async ({ page }) => {
  await localOnly(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('floor editor places a tool from the keyboard alone', async ({ page }) => {
  await page.goto('/proving-ground')
  const wall = page.locator('.smp-tool').filter({ hasText: 'Wall' })
  await press(page, wall)
  await expect(wall).toHaveAttribute('aria-pressed', 'true')
  // Cells are named by their on-screen axes (column letter, row number) and contents.
  const clear = page.getByRole('button', { name: /^[A-L]\d+, empty$/ }).first()
  const [, at] = (await clear.getAttribute('aria-label'))!.match(/^([A-L]\d+), /)!
  await press(page, clear, 'Space')
  await expect(page.getByRole('button', { name: new RegExp(`^${at}, wall W\\d+$`) })).toBeFocused()
  await expectNoSeriousViolations(page, '/proving-ground after a keyboard edit')
})

test('simulation controls work from the keyboard and the canvas names its verdict', async ({ page }) => {
  await page.goto('/simulation')
  const canvas = page.getByRole('img', { name: 'Warehouse simulation, 2D floor view' })
  await expect(canvas).toHaveAttribute('aria-describedby', 'sim-verdict')
  await expect(page.locator('#sim-verdict')).not.toBeEmpty()
  const ticks = page.locator('.sim-scores div').last()
  const tick = async () => Number((await ticks.innerText()).match(/t=(\d+)/)![1])
  // Restart replays from frame 0 (it starts playback even under reduced motion), so
  // pause it from the keyboard before reading the counter.
  await press(page, page.getByRole('button', { name: 'Restart', exact: true }))
  await press(page, page.getByRole('button', { name: 'Pause', exact: true }))
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused()
  const before = await tick()
  await press(page, page.getByRole('button', { name: 'Step', exact: true }))
  await expect.poll(tick).toBeGreaterThan(before)
  await press(page, page.getByRole('button', { name: 'Play', exact: true }))
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused()
  await expectNoSeriousViolations(page, '/simulation after keyboard playback')
})

test('operations playback and wave selection work from the keyboard', async ({ page }) => {
  await page.goto('/operations')
  const toggle = page.locator('.ops-stage button')
  await press(page, toggle)
  await expect(toggle).toHaveText('Pause playback')
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveText('Play')
  const second = page.locator('.ops-wave').nth(1)
  await press(page, second)
  await expect(second).toHaveClass(/is-sel/)
  await expect(page.locator('#ops-caption')).toContainText('Wave 2')
  await expect(page.getByRole('img', { name: 'Wave 2 playback' })).toHaveAttribute('aria-describedby', 'ops-caption')
  await expectNoSeriousViolations(page, '/operations after selecting a wave')
})

test('security signature experiment passes axe after signing and tampering', async ({ page }) => {
  await page.goto('/security')
  const panel = page.locator('#signatures')
  await press(page, panel.getByRole('button', { name: 'Sign + verify' }))
  await expect(panel.locator('.sec-log')).toContainText('verified offline')
  await press(page, panel.getByRole('button', { name: 'Tamper with it' }))
  await expect(panel.locator('.sec-log')).toContainText('corruption voided')
  await expectNoSeriousViolations(page, '/security after signing and tampering')
})

test('verify passes axe on a VOID result', async ({ page }) => {
  await page.goto('/verify')
  await press(page, page.getByRole('button', { name: 'Synthetic sandbox reference check' }))
  await page.getByLabel('Tamper one field (see it void)').check()
  await press(page, page.getByRole('button', { name: 'Verify', exact: true }))
  await expect(page.getByRole('status').filter({ hasText: 'VOID' })).toContainText('code 3')
  await expectNoSeriousViolations(page, '/verify after VOID')
})

test('promoted delegation graph supports keyboard widening before the recording', async ({ page }) => {
  await page.goto('/over-grant')
  const panel = page.locator('#delegation')
  await expect(panel).toHaveCount(1)
  const hero = await page.locator('.product-hero').boundingBox()
  const graph = await panel.boundingBox()
  const recording = await page.locator('.vband').boundingBox()
  expect(graph!.y).toBeGreaterThan(hero!.y + hero!.height)
  expect(graph!.y + graph!.height).toBeLessThan(recording!.y)
  const widen = panel.getByRole('button', { name: /^(Widen|Narrow) payroll-bot$/ })
  await expect(widen).toHaveText('Widen payroll-bot')
  await page.locator('.product-hero__links a').last().focus()
  await page.keyboard.press('Tab')
  await expect(widen).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(widen).toHaveAttribute('aria-pressed', 'true')
  await expect(widen).toHaveText('Narrow payroll-bot')
  await expect(panel.locator('.sec-log')).toContainText('6 / 9 sensitive resources reachable — BRI 66.7%')
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: 'Widen pii-bot', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: 'Widen ledger-bot', exact: true })).toBeFocused()
  await expectNoSeriousViolations(page, '/over-grant after keyboard widening')
})

test('recorded over-grant numerals stay static with inseparable qualifiers', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/over-grant')
  const stats = page.locator('.vband > .shell > .og-recorded-stats')
  await expect(stats).toBeVisible()
  await expect(stats.locator('p')).toHaveCount(3)
  await expect(stats.locator('p').nth(0)).toHaveText('63.2% of granted scopes never exercised in the window · seed 20260818, 400 roots, 2,074 synthetic identities · describes the demonstration, not a customer deployment')
  await expect(stats.locator('p').nth(1)).toHaveText('90/90 planted widened edges caught, 0 false positives · against synthetic ground truth · separate seeded corpus')
  await expect(stats.locator('p').nth(2)).toHaveText("55.6% → 66.7% root's sensitive-resource reach after widening one delegation edge · synthetic, seeded")
  expect(await stats.evaluate(el => el.previousElementSibling?.tagName)).toBe('FIGURE')
  expect(await stats.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
  await page.setViewportSize({ width: 959, height: 900 })
  await expect(stats).toBeHidden()
  await expect(page.locator('.vband__cap')).toContainText('63.2%')
})

for (const width of [320, 1440]) {
  test(`delegation graph and computed baseline survive without JavaScript at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } })
    const page = await context.newPage()
    await localOnly(page)
    await page.goto('/over-grant')
    const panel = page.locator('#delegation')
    await expect(panel).toBeVisible()
    await expect(panel.locator('svg:visible')).toHaveAttribute('viewBox', width < 700 ? '0 0 220 365' : '0 0 600 300')
    await expect(panel.locator('svg:visible circle[r="18"]')).toHaveCount(6)
    await expect(panel.getByRole('img')).toHaveAccessibleName('Delegation tree. Root reaches 5 of 9 sensitive resources.')
    await expect(panel.locator('.sec-log')).toContainText('5 / 9 sensitive resources reachable — BRI 55.6%')
    await expect(panel.getByRole('button')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const graph = await panel.boundingBox()
    const recording = await page.locator('.vband').boundingBox()
    expect(graph!.y + graph!.height).toBeLessThan(recording!.y)
    await context.close()
  })
}
