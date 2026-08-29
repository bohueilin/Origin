// Tier A recorder — Shot 04, the 60-second product tour, filmed on the LIVE site.
//
// One take, cursor visible, no voiceover: run the reference check on /reference-check,
// read the verdict, download the attestation, drift the config and watch it VOID, then
// follow the page's own link to /verify. Captions are burned in afterwards at the beat
// times this script logs (BEATS ...) — captions are editorial, the run is untouched.
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

await p.goto('https://origin-physical-ai.pages.dev/reference-check', { waitUntil: 'networkidle' })
await p.waitForTimeout(2200) // let the reader see the policy form first

clock.mark('run')
await clickAt(p.getByRole('button', { name: 'Run the reference check' }))
await p.waitForTimeout(800)
await settle(p.locator('text=/Verified Readiness|readiness/i').first())
await p.waitForTimeout(3200) // the verdict block, held still

clock.mark('download')
const dl = p.waitForEvent('download').catch(() => null)
await clickAt(p.getByRole('button', { name: 'Download the Origin Attestation' }))
await dl
await p.waitForTimeout(1800)

clock.mark('drift')
await clickAt(p.getByRole('button', { name: /Change a tool/ }))
await p.waitForTimeout(700)
await settle(p.locator('text=/VOID/').first())
await p.waitForTimeout(2800)

clock.mark('verify')
await clickAt(p.getByRole('link', { name: /Re-verify it on \/verify/ }))
await p.waitForLoadState('networkidle')
await p.waitForTimeout(1200)
await settle(p.locator('text=/One artifact in|honest\s+verdict/i').first(), 900)
await p.waitForTimeout(2600)

clock.mark('end')
console.log('landed on:', p.url())
clock.dump()
await ctx.close(); await b.close()
