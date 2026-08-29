// Shared plumbing for the Tier A recorders (rec-shot0*.mjs).
//
// Three rules every recorder inherits:
//   1. The cursor dot is presentation, not fabrication — Playwright videos carry no OS
//      pointer, so a dot tracks the real mousemove events. Every movement it shows is a
//      movement that actually happened.
//   2. Every action lands INSIDE the frame: targets are smooth-scrolled to centre and
//      given time to settle before the cursor travels to them.
//   3. Nothing is cut or re-timed inside a run. Trimming is limited to the blank lead
//      before the page has painted.

export const CURSOR_INIT = () => {
  addEventListener('DOMContentLoaded', () => {
    const d = document.createElement('div')
    d.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;border-radius:50%;' +
      'background:rgba(31,63,208,.35);border:2px solid #1f3fd0;pointer-events:none;' +
      'transform:translate(-50%,-50%);left:-40px;top:-40px'
    document.body.appendChild(d)
    addEventListener('mousemove', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px' })
  })
}

export function actions(page) {
  const settle = async (locator, ms = 1100) => {
    await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await page.waitForTimeout(ms)
  }
  const clickAt = async (locator) => {
    await settle(locator)
    const box = await locator.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 })
    await page.waitForTimeout(300)
    await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up()
  }
  return { settle, clickAt }
}

/** Beat clock: log named moments so captions can be burned at true offsets. */
export function beatClock() {
  const t0 = Date.now()
  const beats = []
  return {
    mark: (name) => beats.push({ name, t: (Date.now() - t0) / 1000 }),
    dump: () => { console.log('BEATS ' + JSON.stringify(beats)) },
  }
}
