import { test, expect, type Locator } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
})

async function expectUnobscured(verdict: Locator) {
  await expect.poll(() => verdict.evaluate(el => {
    const rect = el.getBoundingClientRect()
    const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0
    return rect.top >= header && rect.bottom <= innerHeight
  })).toBe(true)
  expect(await verdict.evaluate(el => el.getAnimations().length)).toBe(0)
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`verification keeps a tamper verdict visible and refreshes its stamp at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/verify')
    await page.getByRole('button', { name: 'Origin Attestation', exact: true }).click()
    await page.getByRole('checkbox', { name: /Tamper one field/ }).check()
    await page.getByRole('button', { name: 'Verify', exact: true }).click()
    const verdict = page.locator('.vfy-verdict')
    await expect(verdict).toContainText('VOID')
    await expectUnobscured(verdict)
    const stamp = page.locator('.vfy-checked')
    await expect(stamp).toContainText(/Checked .* · [\d.]+ ms/)
    await expect(stamp).toBeInViewport()
    const before = await stamp.textContent()
    await page.getByRole('button', { name: 'Verify', exact: true }).click()
    await expect(stamp).not.toHaveText(before!)
    await expectUnobscured(verdict)
  })
}

test('a mobile reference check brings its verdict into view', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/reference-check')
  await page.getByRole('button', { name: 'Run the reference check', exact: true }).click()
  await expect(page.locator('.rc-verdict')).toContainText('synthetic decisions match the oracle')
  await expectUnobscured(page.locator('.rc-verdict'))
})

test('widening a diagram leaf draws its actual parent chain and root ring', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/over-grant')
  const tree = page.locator('#delegation svg')
  await page.getByRole('button', { name: 'Widen payroll-bot', exact: true }).click()
  const path = tree.locator('path[stroke-dasharray="4 3"]')
  await expect(path).toHaveAttribute('d', 'M 96 254 L 168 150 L 300 46')
  await expect(tree.locator('circle[r="24"]')).toHaveCount(1)
  await expect(path).toHaveCSS('opacity', '1')
  expect(await path.evaluate(el => el.getAnimations().some(a => (a.effect as KeyframeEffect).getKeyframes().some(frame => frame.transform !== undefined)))).toBe(false)
  await page.getByRole('button', { name: 'Narrow payroll-bot', exact: true }).click()
  await expect(path).toHaveCount(0)
  await expect(tree.locator('circle[r="24"]')).toHaveCount(0)
})

test('lead modal has a finite entrance and closes instantly in both motion modes', async ({ page }) => {
  await page.goto('/')
  for (const reduced of [false, true]) {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
    const frames = await page.locator('#lead-modal').evaluate((el, reduce) => {
      const dialog = el as HTMLDialogElement
      dialog.showModal()
      const animations = dialog.getAnimations().filter(a => (a.effect as KeyframeEffect).target === dialog)
      const entrance = animations.find(a => (a.effect as KeyframeEffect).pseudoElement === null)
      return { count: entrance ? 1 : 0, duration: entrance?.effect?.getTiming().duration, transforms: (entrance?.effect as KeyframeEffect | null)?.getKeyframes().some(frame => frame.transform !== undefined), reduced: reduce }
    }, reduced)
    expect(frames.count).toBe(1)
    expect(frames.duration).toBe(reduced ? 120 : 180)
    expect(frames.transforms).toBe(!reduced)
    const afterClose = await page.locator('#lead-modal').evaluate(el => {
      (el as HTMLDialogElement).close()
      return el.getAnimations().length
    })
    expect(afterClose).toBe(0)
  }
})
