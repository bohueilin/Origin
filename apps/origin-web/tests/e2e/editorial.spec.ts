import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

test('proof reports clipboard denial without claiming the command was copied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => { throw new DOMException('Clipboard access denied', 'NotAllowedError') },
      },
    })
  })
  await page.goto('/proof')
  await page.getByRole('button', { name: 'Copy the verify command' }).click()

  const status = page.getByRole('status')
  await expect(status).toHaveText('Copy unavailable — select the command')
  await expect(status).not.toContainText('Copied')
  // The manual recovery path remains readable after the failed enhancement.
  await expect(page.locator('.tr2-verify')).toContainText('npm run proof:verify')
})

test('brief print layout preserves its full narrative and evidence boundaries', async ({ page }, testInfo) => {
  await page.goto('/brief')
  const content = page.locator('main h1, main h2, main p:not(.brief__print-only), main li')
  const count = await content.count()
  const screenText = await content.allTextContents()
  expect(count).toBeGreaterThan(20)

  await page.emulateMedia({ media: 'print' })
  for (let i = 0; i < count; i += 1) {
    await expect(content.nth(i), `Print must retain: ${screenText[i].trim()}`).toBeVisible()
  }
  await expect(page.locator('main')).toContainText('session-signed, and unpinned')
  await expect(page.locator('main')).toContainText('Execution is not attempted')
  await expect(page.locator('main')).toContainText('not earned yet')
  await expect(page.locator('.brief__print-only')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print / Save PDF' })).toBeHidden()
  if (process.env.ORIGIN_VISUAL_QA === '1' && testInfo.project.name === 'desktop-chromium') {
    await page.pdf({ path: testInfo.outputPath('origin-brief.pdf'), preferCSSPageSize: true, printBackground: true })
  }
})
