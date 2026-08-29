// Tier A recorder — Shot 01, "the tamper", filmed on the LIVE /verify page.
//
// Re-derivable footage: run `node scripts/rec-shot01.mjs` and the webm lands in
// /tmp/rec. Real ES256 signing and verification in the page; the context goes
// OFFLINE mid-run, so the VOID and the closing VALID are provably computed with
// no network. The injected dot is presentation only — Playwright videos carry no
// OS pointer — and every movement it shows is a movement that really happened.
// Tier A discipline: nothing inside the run is cut or re-timed.
import { chromium } from 'playwright'
import { CURSOR_INIT, actions } from './recLib.mjs'

const b = await chromium.launch()
const ctx = await b.newContext({
  viewport: { width: 1600, height: 1000 },
  recordVideo: { dir: '/tmp/rec', size: { width: 1600, height: 1000 } },
})
const p = await ctx.newPage()
await p.addInitScript(CURSOR_INIT)
const { settle, clickAt } = actions(p)

await p.goto('https://origin-physical-ai.pages.dev/verify', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)

const example = p.getByRole('button', { name: 'Origin Attestation', exact: true })
const verify = p.getByRole('button', { name: /^Verify$/ }).first()
const tamper = p.locator('label').filter({ hasText: 'Tamper one field' })

await clickAt(example); await p.waitForTimeout(1200)
await clickAt(verify)
await settle(p.locator('body')); await p.waitForTimeout(300)
await settle(p.locator('text=/reproducible under this verifier|VALID/i').first()); await p.waitForTimeout(1600)

await ctx.setOffline(true) // everything after this point is computed with no network

await clickAt(tamper); await p.waitForTimeout(1100)
await clickAt(verify); await p.waitForTimeout(600)
await settle(p.locator('text=/VOID/').first()); await p.waitForTimeout(2000)

await clickAt(tamper); await p.waitForTimeout(1100)
await clickAt(verify); await p.waitForTimeout(600)
await settle(p.locator('text=/VALID/').first()); await p.waitForTimeout(2400)

const body = await p.locator('body').innerText()
console.log('final page has VALID:', /VALID/.test(body))
await ctx.close(); await b.close()
