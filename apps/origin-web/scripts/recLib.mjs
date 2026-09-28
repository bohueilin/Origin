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
      'background:rgba(43,82,59,.35);border:2px solid #2b523b;pointer-events:none;' +
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

export function requireRelease(release, expectedCommit) {
  if (release?.source !== 'release' || !/^[a-f0-9]{7,40}$/.test(release.commit ?? '') || !release.built_at || !release.run_url || release.all_green !== true || (expectedCommit && !expectedCommit.startsWith(release.commit))) {
    throw new Error('Recording requires a complete, passing release stamp')
  }
  return release
}

export function requireVerdict(text, verdict, code) {
  if (!new RegExp(`^${verdict}\\b`).test(text.trim()) || !new RegExp(`\\bcode ${code}\\b`).test(text)) {
    throw new Error(`Expected ${verdict} (code ${code}); observed ${text}`)
  }
  return { verdict, code }
}

export function fleetFacts(fleet, surfaceText) {
  const identities = fleet.match(/([\d,]+) SYNTHETIC agent identities/)
  const seed = fleet.match(/seed (\d+)/)
  const surface = surfaceText.match(/(\d+(?:\.\d+)?)%/)
  if (!identities || !seed || !surface) throw new Error('Missing observed fleet facts')
  return { identities: Number(identities[1].replaceAll(',', '')), seed: Number(seed[1]), surface: surface[1] }
}

export function rootFacts(text) {
  const match = text.match(/blast radius at the ROOT (\d+(?:\.\d+)?)% → (\d+(?:\.\d+)?)%/)
  if (!match || Number(match[2]) <= Number(match[1])) throw new Error('Root reach did not increase')
  return { before: match[1], after: match[2] }
}

export function scoreFacts(caughtText, details) {
  const match = caughtText.match(/^caught (\d+)\/(\d+)$/)
  if (!match || Number(match[1]) !== Number(match[2]) || Number(match[2]) === 0 || !/\bzero false positives\b/.test(details)) {
    throw new Error('Planted-corpus recovery or false-positive check failed')
  }
  return { caught: Number(match[1]), planted: Number(match[2]), fp: 0 }
}

export function policyFacts(text) {
  const match = text.replace(/\s+/g, ' ').match(/(\d+) of (\d+) synthetic decisions match the oracle/)
  if (!match || +match[1] !== +match[2] || +match[2] === 0) throw new Error(`Unexpected policy verdict: ${text}`)
  return { matched: +match[1], n: +match[2] }
}

/** Only first-party GETs and font GETs can leave a recording context. */
export async function openRecording(name, pathname) {
  if (!process.env.RECORD_COMMIT) throw new Error('Set RECORD_COMMIT to the verified live release commit')
  const { chromium } = await import('playwright')
  const fs = await import('node:fs/promises')
  const { createHash } = await import('node:crypto')
  const out = `/tmp/rec/${name}`
  await fs.mkdir(out, { recursive: true })
  try {
    await fs.rename(`${out}/run.json`, `${out}/run-previous-${Date.now()}.json`)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const browser = await chromium.launch({ downloadsPath: out })
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, timezoneId: 'UTC', acceptDownloads: true,
    recordVideo: { dir: out, size: { width: 1600, height: 900 } } })
  const blocked = []
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url())
    if (request.method() === 'GET' && ['originphysicalai.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue()
    blocked.push(`${request.method()} ${url.origin}${url.pathname}`)
    return route.abort()
  })
  try {
    const response = await context.request.get('https://originphysicalai.com/trust/gates-summary.json')
    if (!response.ok()) throw new Error(`Release stamp HTTP ${response.status()}`)
    const release = requireRelease(await response.json(), process.env.RECORD_COMMIT)
    const page = await context.newPage()
    const started = Date.now(), beats = []
    const mark = name => beats.push({ name, t: (Date.now() - started) / 1000 })
    const probe = async (name, locator) => {
      await locator.first().waitFor({ state: 'visible' })
      const count = await locator.count()
      if (count !== 1) throw new Error(`${name} resolves to ${count} elements`)
      return locator
    }
    await page.addInitScript(CURSOR_INIT)
    await page.goto(`https://originphysicalai.com${pathname}`, { waitUntil: 'networkidle' })
    mark('painted')
    const finish = async (facts, observed, extra = {}) => {
      mark('end')
      const video = page.video()
      await context.close(); await browser.close()
      const raw = await video.path()
      const font = new URL('./fonts/Carlito-Regular.ttf', import.meta.url)
      const sha = data => createHash('sha256').update(data).digest('hex')
      const run = { shot: name, date: new Date(started).toISOString().slice(0, 10), date_timezone: 'UTC', recorded_at: new Date(started).toISOString(),
        host: 'originphysicalai.com', commit: release.commit, release, beats, facts, observed, blocked_requests: [...new Set(blocked)],
        raw_file: raw.split('/').at(-1), raw_sha256: sha(await fs.readFile(raw)), font: 'Carlito-Regular.ttf', font_sha256: sha(await fs.readFile(font)), ...extra }
      await fs.writeFile(`${out}/run.json`, JSON.stringify(run, null, 2) + '\n')
      console.log(JSON.stringify({ shot: name, commit: release.commit, facts, raw, run: `${out}/run.json` }))
      return run
    }
    return { page, context, browser, out, release, mark, probe, finish, ...actions(page) }
  } catch (error) {
    await context.close(); await browser.close(); throw error
  }
}
