import { test, expect } from '@playwright/test'

// Release 6 Phase 4 follow-up — Gate 7: tap targets on a phone
// At 375 × 812 every visible interactive target on the sixteen public routes is at least
// 44 × 44 CSS px, and no route scrolls sideways. Boxed controls (buttons, tabs, chips,
// selects, fields, disclosures) take a real 44 px minimum below 761px. A link inside running
// text grows its box with vertical padding, which an inline box adds without moving any
// line, and any sideways padding is cancelled by an equal negative margin. A control wrapped
// in its label (a visually hidden file input, a checkbox) is measured by the label, which is
// what the finger hits. Visually hidden skip links (1 × 1 until focused) are not targets yet.

const ROUTES = ['/', '/trust', '/labs', '/brief', '/verify', '/over-grant', '/security', '/reference-check', '/reference-check-vs-runtime', '/simulation', '/operations', '/proving-ground', '/proof', '/app', '/capture', '/foundry']

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
})

for (const route of ROUTES) {
  test(`gate 7: every tap target on ${route} is at least 44 x 44 at 375 px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'the viewport is set explicitly')
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(route)
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('h1:visible').first()).toBeVisible()
    const small = await page.evaluate(() => {
      const selector = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [role=slider], [role=switch], [role=checkbox], [role=radio], [tabindex]:not([tabindex="-1"])'
      const found: string[] = []
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        if (getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden], [inert], [aria-hidden="true"]')) continue
        if (rect.width <= 1 && rect.height <= 1) continue
        let { width, height } = rect
        const label = el.closest('label')
        if (label && el.matches('input') && (width < 43.5 || height < 43.5)) ({ width, height } = label.getBoundingClientRect())
        if (width >= 43.5 && height >= 43.5) continue
        const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('type') || '').trim().replace(/\s+/g, ' ').slice(0, 40)
        found.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(width)}x${Math.round(height)}`)
      }
      return found
    })
    expect(small, `targets under 44 x 44 on ${route}`).toEqual([])
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `sideways scroll on ${route}`).toBeLessThanOrEqual(0)
  })
}
