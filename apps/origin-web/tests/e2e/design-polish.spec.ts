import { test, expect } from '@playwright/test'

test('floor editor keeps its introduction and panels inside comfortable margins', async ({ page }) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/proving-ground')
    const shell = page.locator('.pg-wrap .flow-shell')
    await expect(shell.locator('.flow-title')).toBeVisible()
    const layout = await shell.evaluate((element) => {
      const outer = element.getBoundingClientRect()
      const children = [...element.querySelectorAll(':scope > .back, :scope > .flow-kicker, :scope > .flow-title, :scope > .flow-sub, :scope > .align-grid')]
      return {
        left: children.map((child) => child.getBoundingClientRect().left - outer.left),
        right: children.map((child) => outer.right - child.getBoundingClientRect().right),
        top: children[0].getBoundingClientRect().top - outer.top,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(layout.left).toHaveLength(5)
    const inset = width < 600 ? 16 : 24
    for (const gap of [...layout.left, ...layout.right, layout.top]) expect(gap, `${width}px inset`).toBeGreaterThanOrEqual(inset)
    expect(layout.overflow, `${width}px page overflow`).toBeLessThanOrEqual(1)
  }
})

test('expanded desktop navigation fits at the tablet breakpoint', async ({ page }) => {
  for (const width of [961, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.getByRole('link', { name: 'Proving Ground', exact: true })).toBeVisible()
    const layout = await nav.evaluate((element) => {
      const links = [...element.querySelectorAll('a')].map((link) => link.getBoundingClientRect())
      const brand = document.querySelector('.site-header .brand')!.getBoundingClientRect()
      return {
        right: links.at(-1)!.right,
        gap: links[0].left - brand.right,
        lines: links.map((rect) => rect.height),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(layout.right).toBeLessThanOrEqual(width - 16)
    expect(layout.gap).toBeGreaterThanOrEqual(16)
    for (const height of layout.lines) expect(height).toBeLessThanOrEqual(48)
    expect(layout.overflow).toBeLessThanOrEqual(1)
  }
})

test('phone editor instructions and saved-plan picker use the available panel width', async ({ page }) => {
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/proving-ground')
    await expect(page.locator('.smp-sub')).toBeVisible()
    const layout = await page.locator('.site-map-panel').evaluate((panel) => {
      const rect = (selector: string) => panel.querySelector(selector)!.getBoundingClientRect()
      const heading = rect('.smp-head')
      const instructions = rect('.smp-sub')
      const reset = rect('.smp-clear')
      const plans = rect('.smp-plans-row')
      const picker = rect('.smp-plans-select')
      const save = rect('.smp-save-btn')
      return {
        proseRatio: instructions.width / heading.width,
        resetGap: reset.top - instructions.bottom,
        pickerRatio: picker.width / plans.width,
        saveGap: save.top - picker.bottom,
      }
    })
    expect(layout.proseRatio).toBeGreaterThanOrEqual(0.95)
    expect(layout.resetGap).toBeGreaterThanOrEqual(8)
    expect(layout.pickerRatio).toBeGreaterThanOrEqual(0.95)
    expect(layout.saveGap).toBeGreaterThanOrEqual(8)
  }
})

test('floor editor controls stay inside their cards on narrow screens', async ({ page }) => {
  for (const width of [320, 350, 375, 390, 600, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/proving-ground')
    await expect(page.locator('.smp-fleet').first()).toBeVisible()
    const clipped = await page.locator('.site-map-panel').evaluate((panel) => {
      return [...panel.querySelectorAll('button, input, select, textarea')]
        .filter((control) => !control.closest('.site-grid-scroll'))
        .filter((control) => {
          const rect = control.getBoundingClientRect()
          const container = control.closest('.smp-fleet, .smp-saved') ?? panel
          const bounds = container.getBoundingClientRect()
          return rect.width > 0 && (rect.left < bounds.left || rect.right > bounds.right)
        })
        .map((control) => control.getAttribute('aria-label') || control.className)
    })
    expect(clipped, `${width}px clipped controls`).toEqual([])
  }
})
