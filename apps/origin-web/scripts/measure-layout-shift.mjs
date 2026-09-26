// Local layout-shift acceptance check. Plain viewports deliberately omit isMobile:
// touch emulation can classify the navigation shift as recent input and hide it.
import { chromium } from 'playwright'
const origin = process.env.BASE_URL || 'http://localhost:5290'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Use a local server')
const routes = (process.env.ROUTES || '/,/trust,/labs,/brief,/verify,/over-grant,/security,/reference-check,/simulation,/operations,/proving-ground,/proof,/reference-check-vs-runtime').split(',')
const runs = Number(process.env.RUNS || 3)
const browser = await chromium.launch()
const jobs = routes.flatMap(route => [{ width: 375, height: 812 }, { width: 1440, height: 900 }].flatMap(viewport => Array.from({ length: runs }, (_, i) => ({ route, viewport, run: i + 1 }))))
const results = []
try {
  // Two independent contexts at a time keep the full matrix reasonably quick.
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (jobs.length) {
      const job = jobs.shift()
      const context = await browser.newContext({ viewport: job.viewport, reducedMotion: 'no-preference' })
      await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
      const page = await context.newPage()
      await page.addInitScript(() => {
        window.__layoutShifts = []
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__layoutShifts.push({
              time: entry.startTime, value: entry.value,
              sources: entry.sources.map(({ node, previousRect, currentRect }) => ({
                element: node ? `${node.nodeName}${node.id ? `#${node.id}` : ''}.${typeof node.className === 'string' ? node.className : ''}` : null,
                before: { y: previousRect.y, height: previousRect.height },
                after: { y: currentRect.y, height: currentRect.height },
              })),
            })
          }
        }).observe({ type: 'layout-shift', buffered: true })
      })
      await page.goto(`${origin}${job.route}`, { waitUntil: 'load' })
      await page.waitForTimeout(4000)
      const shifts = await page.evaluate(() => window.__layoutShifts)
      const cls = shifts.reduce((sum, entry) => sum + entry.value, 0)
      const result = { ...job, cls, shifts }
      results.push(result)
      console.log(JSON.stringify(result))
      await context.close()
    }
  }))
} finally {
  await browser.close()
}
if (results.some(result => result.cls > 0.01)) process.exitCode = 1
