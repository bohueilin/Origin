import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
const trace = JSON.parse(readFileSync(new URL('../../public/proof/tr-a002.json', import.meta.url), 'utf8'))
for (const route of ['/proof', '/trust', '/reference-check-vs-runtime']) test(`computed diagram remains readable without JavaScript on ${route}`, async ({ browser, baseURL }) => {
  for (const width of [320, 1440]) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } })
    const page = await context.newPage()
    await page.route('**/*', r => ['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort())
    await page.goto(`${baseURL}${route}`)
    const svg = page.locator('.evidence-diagram svg:visible')
    await expect(svg).toHaveCount(1)
    await expect(svg.locator('title')).toHaveCount(1)
    await expect(svg.locator('desc')).toHaveCount(1)
    if (route === '/proof') {
      await expect(svg).toHaveAttribute('role', 'img')
      await expect(svg).toContainText('Machine-emitted')
      await expect(svg).toContainText('not a customer deployment')
      await expect(svg.locator('[data-trace-node]')).toHaveCount(12)
      await expect(page.locator('.evidence-diagram ol li')).toHaveCount(12)
      await expect(page.locator('[data-trace-step]')).not.toBeVisible()
      await expect(page.locator('[data-tamper]')).not.toBeVisible()
      for (let i = 0; i < trace.events.length; i++) {
        await expect(page.locator('.evidence-diagram ol li').nth(i)).toContainText(trace.events[i].event_hash)
        await expect(page.locator('.evidence-diagram ol li').nth(i)).toContainText(trace.events[i].prev_hash)
      }
    } else {
      await expect(svg).toContainText('Runs today, in your browser')
      await expect(svg.locator('[data-proposed]')).toContainText('Proposed — not built')
      expect(await svg.locator('[data-proposed]').textContent()).not.toMatch(/\b(live|active|running)\b/i)
      const contrast = await svg.locator('[data-proposed] .diagram-lane').evaluate(el => {
        const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
        const fg = rgb(getComputedStyle(el).fill), bg = [248, 247, 244]
        let opacity = 1
        for (let node: Element | null = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity)
        const lum = (c: number[]) => c.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((s,n,i) => s + n * [.2126,.7152,.0722][i], 0)
        return (lum(bg) + .05) / (lum(fg.map((n,i) => n * opacity + bg[i] * (1-opacity))) + .05)
      })
      expect(contrast).toBeGreaterThanOrEqual(4.5)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await context.close()
  }
})

test.describe('the published trace is progressively interactive', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort())
  })

  test('steps only on request, reaches the recorded block, and resets', async ({ page }) => {
    await page.goto('/proof')
    const figure = page.locator('[data-diagram="trace"]')
    const step = page.locator('[data-trace-step]')
    await expect(step).toBeVisible()
    await expect(step).toHaveAttribute('aria-pressed', 'false')
    await expect(figure.locator('svg:visible [data-trace-node]')).toHaveCount(12)
    const detail = figure.locator('[data-trace-detail]')
    await expect(detail).toHaveText("Activate 'Step through the chain' to begin at Event 1.")
    for (const event of trace.events) {
      await step.click()
      await expect(detail).toContainText(`Event ${event.seq}: ${event.action}`)
      await expect(page.locator(`.tr2-flow li[data-seq="${event.seq}"]`)).toHaveClass(/is-current/)
      if (event.seq === 11) await expect(figure.locator('[data-trace-block]')).toHaveText('Event 11 is the one that matters: the agent tried to exceed its scope. The proxy blocked it, and the block itself is in the chain.')
    }
    await expect(step).toHaveText('Reset')
    await figure.locator('svg:visible [data-trace-node="12"]').click()
    await step.click()
    await expect(step).toHaveText('Step through the chain')
    await expect(step).toHaveAttribute('aria-pressed', 'false')
    await expect(detail).toHaveText("Activate 'Step through the chain' to begin at Event 1.")
    await expect(page.locator('.tr2-flow li.is-current')).toHaveCount(0)
    await expect(figure.locator('[data-trace-node][aria-pressed="true"]')).toHaveCount(0)
    await expect(page.locator('.tracerail')).toHaveCount(0)
  })

  test('scrolling nodes under a stationary pointer preserves the current step and status at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/proof')
    const step = page.locator('[data-trace-step]')
    const detail = page.locator('[data-trace-detail]')
    const figure = page.locator('[data-diagram="trace"] svg:visible')
    const ninth = figure.locator('[data-trace-node="9"]')
    const point = await ninth.evaluate(el => {
      const box = el.getBoundingClientRect()
      return { x: box.x + box.width / 2, top: box.y + scrollY + box.height / 2 - 450 }
    })
    const scrollUnderPointer = async () => {
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }))
      await page.mouse.move(point.x, 450)
      const entered = page.evaluate(() => new Promise<void>(resolve => {
        const onOver = (event: PointerEvent) => {
          if (!(event.target as Element).closest('[data-trace-node="9"]')) return
          document.removeEventListener('pointerover', onOver)
          resolve()
        }
        document.addEventListener('pointerover', onOver)
      }))
      await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), point.top)
      await entered
    }
    // Real browser hit testing emits pointerover during scroll without pointer motion.
    await scrollUnderPointer()
    await expect(detail).not.toContainText('Event 9:')
    await expect(step).toHaveAttribute('aria-pressed', 'false')
    for (let i = 0; i < 6; i++) await step.click()
    const sixth = await detail.textContent()
    await expect(detail).toContainText('Event 6: approval.granted')
    await scrollUnderPointer()
    await expect(detail).toHaveText(sixth!)
    await expect(figure.locator('.is-stepped[data-trace-node]')).toHaveCount(6)
    await figure.locator('[data-trace-node="3"]').focus()
    await page.keyboard.press('Escape')
    await expect(step).toBeFocused()
    await expect(detail).toHaveText(sixth!)
    await step.click()
    await expect(detail).toContainText('Event 7:')
    for (let i = 7; i < 12; i++) await step.click()
    const sealed = await detail.textContent()
    await scrollUnderPointer()
    await expect(detail).toHaveText(sealed!)
    await expect(detail).toContainText('Event 12: evidence.digest_sealed')
    await expect(step).toHaveText('Reset')
    await expect(figure.locator('.is-stepped[data-trace-node]')).toHaveCount(12)
    await ninth.focus()
    await page.keyboard.press('Escape')
    await expect(step).toBeFocused()
    await expect(detail).toHaveText(sealed!)
    await step.click()
    await scrollUnderPointer()
    await expect(detail).toHaveText("Activate 'Step through the chain' to begin at Event 1.")
    await expect(figure.locator('.is-stepped[data-trace-node]')).toHaveCount(0)
    // Deliberate hover still exposes the same event details as focus and tap.
    await page.mouse.move(0, 0)
    await figure.locator('[data-trace-node="3"]').hover()
    await expect(detail).toContainText('Event 3:')
  })

  test('all twelve visible nodes support Tab, Enter, Space, Escape and touch-sized targets', async ({ page }) => {
    await page.goto('/proof')
    const nodes = page.locator('[data-diagram="trace"] svg:visible [data-trace-node]')
    const detail = page.locator('[data-trace-detail]')
    await nodes.first().focus()
    for (let i = 0; i < trace.events.length; i++) {
      if (i) await page.keyboard.press('Tab')
      await expect(nodes.nth(i)).toBeFocused()
      await expect(detail).toContainText(`Event ${i + 1}: ${trace.events[i].action}`)
      const box = await nodes.nth(i).boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    await page.keyboard.press('Space')
    await expect(nodes.last()).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Enter')
    await expect(nodes.last()).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-trace-step]')).toBeFocused()
    await nodes.nth(10).click()
    await expect(nodes.nth(10)).toHaveAttribute('aria-pressed', 'true')
    await expect(detail).toContainText('proxy.blocked')
    await nodes.nth(10).click()
    await expect(nodes.nth(10)).toHaveAttribute('aria-pressed', 'false')
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
  })

  test('touch taps toggle trace-node selection without changing step progress', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort())
    await page.goto(`${baseURL}/proof`)
    const node = page.locator('svg:visible [data-trace-node="11"]')
    await node.tap()
    await expect(node).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-trace-detail]')).toContainText('Event 11: proxy.blocked')
    await node.tap()
    await expect(node).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('[data-trace-step]')).toHaveAttribute('aria-pressed', 'false')
    await page.locator('[data-trace-step]').tap()
    await expect(page.locator('[data-trace-detail]')).toContainText('Event 1: proposal.created')
    await context.close()
  })

  test('keyboard focus remains distinct after a blocked node has been stepped', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/proof')
    for (let i = 0; i < 11; i++) await page.locator('[data-trace-step]').click()
    await page.keyboard.press('Tab')
    const node = page.locator('svg:visible [data-trace-node="11"]')
    await node.focus()
    await expect(node).toBeFocused()
    await expect(node.locator('rect')).toHaveCSS('stroke', 'rgb(43, 82, 59)')
    await expect(node.locator('rect')).toHaveCSS('stroke-width', '3px')
  })

  test('re-verifies the published bytes, flips only the digest, and restores', async ({ page }) => {
    await page.goto('/proof')
    const out = page.locator('[data-tamper-out]')
    await page.getByRole('button', { name: 'Re-verify in this tab', exact: true }).click()
    await expect(out).toContainText('VALID (code 0)')
    await expect(out.locator('code')).toHaveText(trace.final_digest)
    const flip = page.locator('[data-tamper-flip]')
    await flip.click()
    await expect(out).toContainText('VOID (code 2) — final_digest no longer equals')
    await expect(out).toContainText(`sealed ${trace.final_digest.slice(0, 12)}, now 0${trace.final_digest.slice(1, 12)}`)
    await expect(flip).toHaveText('Restore the original')
    await expect(flip).toHaveAttribute('aria-pressed', 'true')
    await flip.click()
    await expect(out.locator('code')).toHaveText(trace.final_digest)
    await expect(flip).toHaveAttribute('aria-pressed', 'false')
  })

  test('fetch failure and malformed evidence never report VALID and permit retry', async ({ page }) => {
    let attempt = 0
    await page.route('**/proof/tr-a002.json', route => {
      attempt++
      return attempt === 1 ? route.fulfill({ status: 503, body: 'Unavailable' }) : attempt === 2 ? route.fulfill({ json: { events: [], final_digest: trace.final_digest } }) : route.fulfill({ json: trace })
    })
    await page.goto('/proof')
    const run = page.getByRole('button', { name: 'Re-verify in this tab', exact: true })
    const out = page.locator('[data-tamper-out]')
    await run.click()
    await expect(out).toContainText('Unable to re-check')
    await expect(out).not.toContainText('VALID')
    await run.click()
    await expect(out).toContainText('Unable to re-check')
    await expect(out).not.toContainText('VALID')
    await run.click()
    await expect(out).toContainText('VALID (code 0)')
  })

  test('rapid actions preserve the final requested tamper state', async ({ page }) => {
    let release!: () => void
    const waiting = new Promise<void>(resolve => { release = resolve })
    await page.route('**/proof/tr-a002.json', async route => { await waiting; await route.fulfill({ json: trace }) })
    await page.goto('/proof')
    const flip = page.locator('[data-tamper-flip]')
    await page.locator('[data-tamper-run]').click()
    await flip.click()
    await flip.click()
    await flip.click()
    release()
    await expect(flip).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-tamper-out]')).toContainText('VOID (code 2)')
  })

  test('a parseable fetched trace with an altered event is VOID before any flip', async ({ page }) => {
    const altered = structuredClone(trace)
    altered.events[0].action = 'changed.after.sealing'
    await page.route('**/proof/tr-a002.json', route => route.fulfill({ json: altered }))
    await page.goto('/proof')
    await page.locator('[data-tamper-run]').click()
    await expect(page.locator('[data-tamper-out]')).toHaveText('VOID (code 2) — event 1 event_hash.')
    await expect(page.locator('[data-tamper-flip]')).toHaveAttribute('aria-pressed', 'false')
  })

  test('reduced motion preserves every control at zero diagram transition duration', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/proof')
    await page.locator('[data-trace-step]').click()
    await expect(page.locator('[data-trace-detail]')).toContainText('Event 1: proposal.created')
    await page.locator('[data-tamper-flip]').click()
    await expect(page.locator('[data-tamper-out]')).toContainText('VOID (code 2)')
    expect(await page.evaluate(() => document.getAnimations().filter(a => a instanceof CSSAnimation || a instanceof CSSTransition && /transform|offset-distance|stroke-dashoffset|stroke|fill/.test(a.transitionProperty)).length)).toBe(0)
  })
})
