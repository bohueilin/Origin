// Tier A recorder — Shot 02, "the over-grant sweep", filmed on the LIVE /security page.
//
// The analyzer runs in the viewer's browser over a seeded synthetic fleet: 9,690
// identities, 63.1% over-grant surface, 445/445 planted violations caught. The panel
// says SYNTHETIC on-screen, so the footage carries its own label. Tier A discipline:
// one take, nothing cut or re-timed.
import { chromium } from 'playwright'
import { CURSOR_INIT, actions, beatClock } from './recLib.mjs'

const b = await chromium.launch()
const ctx = await b.newContext({
  viewport: { width: 1600, height: 1000 },
  recordVideo: { dir: '/tmp/rec', size: { width: 1600, height: 1000 } },
})
const p = await ctx.newPage()
await p.addInitScript(CURSOR_INIT)
const { settle, clickAt } = actions(p)
const clock = beatClock()

await p.goto('https://origin-physical-ai.pages.dev/security', { waitUntil: 'networkidle' })
await p.waitForTimeout(1400)

const analyze = p.getByRole('button', { name: 'Analyze the fleet' })
const widen = p.getByRole('button', { name: 'Widen one delegation edge' })
const score = p.getByRole('button', { name: 'Score against planted ground truth' })

clock.mark('analyze')
await clickAt(analyze)
await p.waitForTimeout(900)
await settle(p.locator('text=/over-grant surface/i').first())
await p.waitForTimeout(2600) // let the numbers land and HOLD — settled metrics read as measured

clock.mark('widen')
await clickAt(widen)
await p.waitForTimeout(2400)

clock.mark('score')
await clickAt(score)
await p.waitForTimeout(600)
await settle(p.locator('text=/catch|caught|planted/i').first())
await p.waitForTimeout(3000)

clock.mark('end')
const body = await p.locator('body').innerText()
console.log('surface on page:', /over-grant surface/i.test(body), '| ground truth text:', /planted/i.test(body))
clock.dump()
await ctx.close(); await b.close()
