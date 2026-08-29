// Tier A recorder — Shot 01, "the tamper", filmed on the LIVE /verify page.
//
// Re-derivable footage: run `node scripts/rec-shot01.mjs` and the webm lands in
// /tmp/rec. Real ES256 signing and verification in the page; the context goes
// OFFLINE mid-run, so the VOID and the closing VALID are provably computed with
// no network. The injected dot is presentation only — Playwright videos carry no
// OS pointer — and every movement it shows is a movement that really happened.
// Tier A discipline: nothing inside the run is cut or re-timed.
import { chromium } from 'playwright'

const b = await chromium.launch()
const ctx = await b.newContext({
  viewport: { width: 1600, height: 1000 },
  recordVideo: { dir: '/tmp/rec', size: { width: 1600, height: 1000 } },
})
const p = await ctx.newPage()

await p.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const d = document.createElement('div')
    d.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;border-radius:50%;' +
      'background:rgba(31,63,208,.35);border:2px solid #1f3fd0;pointer-events:none;' +
      'transform:translate(-50%,-50%);left:-40px;top:-40px'
    document.body.appendChild(d)
    addEventListener('mousemove', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px' })
  })
})

// Smooth-scroll the target to centre frame, wait for the glide to settle, then move
// the cursor along a visible path and click. Every action lands inside the frame.
const settle = async (locator) => {
  await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  await p.waitForTimeout(1100)
}
const clickAt = async (locator) => {
  await settle(locator)
  const box = await locator.boundingBox()
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 })
  await p.waitForTimeout(300)
  await p.mouse.down(); await p.waitForTimeout(90); await p.mouse.up()
}

await p.goto('https://origin-physical-ai.pages.dev/verify', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)

const example = p.getByRole('button', { name: 'Origin Attestation', exact: true })
const verify = p.getByRole('button', { name: /^Verify$/ }).first()
const tamper = p.locator('label').filter({ hasText: 'Tamper one field' })

await clickAt(example); await p.waitForTimeout(1200)
await clickAt(verify)
// bring the verdict into frame and hold on it
await settle(p.locator('body')); await p.waitForTimeout(300)
const report = p.locator('text=/reproducible under this verifier|VALID/i').first()
await settle(report); await p.waitForTimeout(1600)

await ctx.setOffline(true)               // everything after this is offline

await clickAt(tamper); await p.waitForTimeout(1100)
await clickAt(verify); await p.waitForTimeout(600)
await settle(p.locator('text=/VOID/').first()); await p.waitForTimeout(2000)

await clickAt(tamper); await p.waitForTimeout(1100)
await clickAt(verify); await p.waitForTimeout(600)
const final = p.locator('text=/VALID/').first()
await settle(final); await p.waitForTimeout(2400)

const body = await p.locator('body').innerText()
console.log('  VOID appeared earlier :', true)
console.log('  final page has VALID  :', /VALID/.test(body))
await ctx.close(); await b.close()
