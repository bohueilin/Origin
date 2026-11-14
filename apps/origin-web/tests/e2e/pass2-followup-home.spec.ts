import { test, expect, type Page } from '@playwright/test'

// Pass 2 follow-up — home walkthrough height on phones
// The five-stage walkthrough (#demo) keeps one height, its tallest stage's, so the Play/Prev/Next
// bar never moves; the space under a shorter stage is the difference. Phone-only rules in
// index.html shrink the tallest stages (Reverify, then Grade) without changing any text, type
// size or line height: a readout's label and text share lines (balanced, so "over-grants" is
// never split) while its state keeps a line of its own, the first /verify checks and the
// UNTRUSTED outcome each fit on one line, and padding and gaps are tighter.
// Measured on 2026-11-14 with the macOS type stack (Avenir Next, SF Mono), before -> after:
//   375 x 812: locked height 1046 -> 898 px; largest slack (Bind) 285 -> 208 px
//   390 x 844: locked height 1046 -> 876 px; largest slack (Bind) 304 -> 202 px
// The pixel pins allow 8 px over the after figures. They run only where Avenir Next renders:
// another type stack wraps differently (the ubuntu CI runner falls back to its own system face).
// Positions are layout boxes (offsets), so an entrance transform is never mistaken for a move.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const PHONES = [
  { width: 375, height: 812, locked: 906, slack: 216 },
  { width: 390, height: 844, locked: 885, slack: 211 },
] as const

async function openHome(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.locator('[data-demo]')).toHaveClass(/is-enhanced/)
}

// Every stage's panel height and the empty space under its content, plus the control bar's place.
const walkthrough = (page: Page) => page.evaluate(() => {
  const top = (el: HTMLElement) => {
    let y = 0
    for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) y += node.offsetTop
    return y
  }
  const stages = [...document.querySelectorAll<HTMLElement>('[data-demo-panel]')].map((panel) => {
    const bottom = Math.max(...[...panel.children].map((child) => {
      const el = child as HTMLElement
      return top(el) + el.offsetHeight + parseFloat(getComputedStyle(el).marginBottom)
    }))
    return { height: panel.offsetHeight, slack: panel.offsetHeight - (bottom - top(panel)) }
  })
  const bar = ['.demo__bar', '[data-demo-play]', '[data-demo-prev]', '[data-demo-next]'].map((selector) => {
    const el = document.querySelector<HTMLElement>(selector)!
    return { selector, x: el.offsetLeft, y: top(el), width: el.offsetWidth, height: el.offsetHeight }
  })
  return { stages, bar }
})

// The pins were measured with Avenir Next; a canvas measure tells whether it renders here.
const rendersAvenir = (page: Page) => page.evaluate(() => {
  const ctx = document.createElement('canvas').getContext('2d')!
  const width = (font: string) => { ctx.font = font; return ctx.measureText('Reverify the walkthrough 0123').width }
  return width('16px "Avenir Next", monospace') !== width('16px monospace')
})

test('pass 2 follow-up: on phones the locked walkthrough height and the slack under every stage stay within the measured pins', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  for (const { width, height, locked, slack } of PHONES) {
    await openHome(page, width, height)
    test.skip(!(await rendersAvenir(page)), 'the pixel pins were measured with the Avenir Next type stack')
    const { stages } = await walkthrough(page)
    expect(stages, `${width}px`).toHaveLength(5)
    expect(new Set(stages.map((stage) => stage.height)).size, `${width}px one height`).toBe(1)
    expect(stages[0].height, `${width}px locked height`).toBeLessThanOrEqual(locked)
    for (const [i, stage] of stages.entries()) {
      expect(stage.slack, `${width}px stage ${i + 1} slack`).toBeGreaterThanOrEqual(0)
      expect(stage.slack, `${width}px stage ${i + 1} slack`).toBeLessThanOrEqual(slack)
    }
  }
})

test('pass 2 follow-up: on phones every stage has one panel height and the tabs never move the Play/Prev/Next bar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const { width, height } of PHONES) {
    await openHome(page, width, height)
    await expect(page.locator('[data-demo-play]')).toBeVisible()
    const start = await walkthrough(page)
    expect(new Set(start.stages.map((stage) => stage.height)).size, `${width}px one height`).toBe(1)
    for (const step of [1, 2, 3, 4, 5]) {
      await page.locator(`#demo-tab-${step}`).click()
      await expect(page.locator(`#demo-tab-${step}`)).toHaveAttribute('aria-selected', 'true')
      const now = await walkthrough(page)
      expect(now.stages.map((stage) => stage.height), `${width}px stage ${step}`).toEqual(start.stages.map((stage) => stage.height))
      expect(now.bar, `${width}px stage ${step}`).toEqual(start.bar)
    }
  }
})

test('pass 2 follow-up: on phones a readout label shares its first line with its text, the state keeps its own line and over-grants stays whole', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  for (const { width, height } of PHONES) {
    await openHome(page, width, height)
    const readouts = await page.locator('[data-demo] .demo__readout').evaluateAll((els) => els.map((el) => {
      const label = el.querySelector('b')!
      const state = el.querySelector('.rd-state')!
      const text = label.nextSibling!
      const range = document.createRange()
      range.selectNodeContents(text)
      const lines = [...range.getClientRects()]
      const word = text.textContent!.indexOf('over-grants')
      let wordRects = 0
      if (word >= 0) {
        range.setStart(text, word)
        range.setEnd(text, word + 'over-grants'.length)
        wordRects = range.getClientRects().length
      }
      return {
        readout: el.textContent!.trim(),
        labelTop: label.getBoundingClientRect().top,
        textTop: lines[0].top,
        textBottom: Math.max(...lines.map((line) => line.bottom)),
        stateTop: state.getBoundingClientRect().top,
        wordRects,
      }
    }))
    expect(readouts, `${width}px`).toHaveLength(6)
    for (const r of readouts) {
      expect(Math.abs(r.textTop - r.labelTop), `${width}px ${r.readout}`).toBeLessThanOrEqual(1)
      expect(r.stateTop, `${width}px ${r.readout}`).toBeGreaterThanOrEqual(r.textBottom)
    }
    expect(readouts.filter((r) => r.readout.includes('over-grants')).map((r) => r.wordRects), `${width}px`).toEqual([1])
  }
})
