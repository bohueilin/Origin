import { test, expect } from '@playwright/test'

test('narrow headers keep the brand separate from their actions', async ({ page }) => {
  for (const width of [320, 350, 375]) {
    await page.setViewportSize({ width, height: 812 })
    for (const path of ['/', '/labs', '/proving-ground', '/reference-check', '/verify', '/simulation']) {
      await page.goto(path)
      await expect(page.locator('.site-header__cta-mobile')).toBeVisible()
      if (width === 320) {
        // Linux and Windows fallbacks can be wider than the macOS brand font.
        await page.addStyleTag({ content: '.site-header, .site-header a, .site-header span, .site-header button { font-family: monospace !important; }' })
      }
      await page.evaluate(() => document.fonts.ready)
      const brand = await page.locator('.site-header .brand__name').boundingBox()
      const actions = await page.locator('.site-header__cta').boundingBox()
      expect(brand!.x + brand!.width + 8, `${path} at ${width}px: brand overlaps actions`).toBeLessThanOrEqual(actions!.x + 1)
      expect(actions!.x + actions!.width, `${path} at ${width}px: actions extend past the header`).toBeLessThanOrEqual(width - 15)
    }
  }
})

test('dark Labs link and keyboard focus have readable contrast', async ({ page }) => {
  await page.goto('/')
  const link = page.locator('.cin-labs__copy .cin-text-link')
  await link.focus()
  const ratios = await link.evaluate(element => {
    const style = getComputedStyle(element)
    const background = getComputedStyle(element.closest('.cin-labs__grid')!).backgroundColor
    const luminance = (color: string) => {
      const values = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
        const channel = value / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
    }
    const contrast = (color: string) => {
      const values = [luminance(color), luminance(background)].sort((a, b) => b - a)
      return (values[0] + 0.05) / (values[1] + 0.05)
    }
    return { text: contrast(style.color), outline: contrast(style.outlineColor), outlineWidth: parseFloat(style.outlineWidth) }
  })
  expect(ratios.text).toBeGreaterThanOrEqual(4.5)
  expect(ratios.outline).toBeGreaterThanOrEqual(3)
  expect(ratios.outlineWidth).toBeGreaterThanOrEqual(2)
})

test('homepage prototype index works without JavaScript and stays within the page', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 812 } })
  const page = await context.newPage()
  await page.goto('/')
  const index = page.getByRole('navigation', { name: 'Explore the working prototypes' })
  await expect(index.getByRole('link')).toHaveCount(3)
  for (const path of ['/reference-check', '/proving-ground', '/verify']) {
    const link = index.locator(`a[href="${path}"]`)
    await expect(link).toBeVisible()
    const box = await link.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(16)
    expect(box!.x + box!.width).toBeLessThanOrEqual(304)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  await index.locator('a[href="/proving-ground"]').click()
  await expect(page).toHaveURL(/\/proving-ground$/)
  await expect(page.locator('h1')).toContainText('Draw a floor.')
  await context.close()
})

test('lab workflow links move keyboard focus to the selected section', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/proving-ground')
  for (const id of ['pg-playback', 'pg-results', 'pg-editor']) {
    const link = page.locator(`.workspace-steps a[href="#${id}"]`)
    await expect(link).toBeVisible()
    await link.focus()
    await page.keyboard.press('Enter')
    const section = page.locator(`#${id}`)
    await expect(section).toBeFocused()
    await expect(page).toHaveURL(new RegExp(`#${id}$`))
    const top = await section.evaluate(element => element.getBoundingClientRect().top)
    expect(top).toBeGreaterThanOrEqual(88)
    expect(top).toBeLessThan(250)
  }
})
