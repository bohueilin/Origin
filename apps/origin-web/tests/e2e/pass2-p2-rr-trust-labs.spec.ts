import { test, expect, type Locator, type Page } from '@playwright/test'

// Pass 2 Phase 2 — explainer posture figure, /labs micro-diagrams, inbound links and glosses
// /reference-check-vs-runtime draws each step as its own box: four solid boxes that run today in
// the browser and five dashed boxes that are proposed and not built. Its trust-boundary list names
// the format beside each verifier code. Each /labs card carries a small static diagram of what its
// experiment does. /trust and /labs link to /security and the explainer. "session-signed" and
// "unpinned" are glossed where the explainer first uses them in prose. Every figure is static.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

// The Style Lock: ink, its secondary tones, the one green accent, and the white card fill.
const ALLOWED = new Set([
  'rgb(39, 45, 38)', // --ink
  'rgb(78, 91, 72)', // --ink-soft
  'rgb(89, 102, 79)', // --steel
  'rgb(223, 228, 216)', // --line
  'rgb(201, 210, 194)', // --line-2
  'rgb(43, 82, 59)', // --signal
  'rgb(255, 255, 255)', // --paper-2
])
const GREEN = 'rgb(43, 82, 59)'

// Every stroke and fill painted inside an SVG.
async function paints(svg: Locator) {
  return svg.evaluate((root) => [...root.querySelectorAll('rect, path, circle, text, line, polyline, polygon')].flatMap((el) => {
    const s = getComputedStyle(el)
    return [s.fill, s.stroke].filter((c) => c !== 'none' && !c.startsWith('rgba(0, 0, 0, 0)'))
  }))
}

// Rendered size of every text in an SVG: its font size times the SVG's screen scale.
async function textSizes(svg: Locator) {
  return svg.evaluate((root) => {
    const scale = (root as SVGSVGElement).getScreenCTM()!.a
    return [...root.querySelectorAll('text')].map((t) => parseFloat(getComputedStyle(t).fontSize) * scale)
  })
}

async function noOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
}

async function isStill(page: Page, scope: string) {
  return page.evaluate((sel) => ({
    animations: document.getAnimations().length,
    smil: document.querySelectorAll(`${sel} animate, ${sel} animateTransform, ${sel} animateMotion, ${sel} set`).length,
  }), scope)
}

const TODAY = ['Selected policy', 'Deterministic oracle', 'Session-signed evidence', 'Offline re-verification']
const PROPOSED = ['Agent proposal', 'Runtime gate', 'Named approvals', 'tool-call proxy', 'Kill switch']

for (const width of [375, 1280]) {
  test(`pass 2 phase 2: the explainer posture figure draws four solid boxes that run today and five dashed proposed boxes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/reference-check-vs-runtime')
    const figure = page.locator('figure.posture-figure[data-diagram="posture"]')
    await expect(figure).toHaveCount(1)
    const svg = page.getByRole('img', { name: 'What runs today and what is only proposed' })
    await expect(svg).toHaveCount(1)
    await expect(svg).toBeVisible()
    await expect(svg).toHaveClass(new RegExp(width < 1000 ? 'diagram-mobile' : 'diagram-desktop'))
    await expect(svg.locator('desc')).toContainText('not built')
    await expect(svg.locator('desc')).toContainText('No customer deployment or runtime enforcement is claimed.')

    // Four solid boxes in the lane that runs today, five dashed ones in the proposed lane.
    const current = svg.locator('[data-current]')
    const proposed = svg.locator('[data-proposed]')
    await expect(current).toContainText('Runs today, in your browser')
    await expect(proposed).toContainText('Proposed — not built')
    await expect(proposed).toContainText('PROPOSED PILOT ARCHITECTURE')
    const dash = (boxes: Locator) => boxes.evaluateAll((els) => els.map((el) => getComputedStyle(el).strokeDasharray))
    const solid = await dash(current.locator('rect.pf-box'))
    expect(solid).toHaveLength(4)
    for (const d of solid) expect(d).toBe('none')
    const dashed = await dash(proposed.locator('rect.pf-box'))
    expect(dashed).toHaveLength(5)
    for (const d of dashed) expect(d).not.toBe('none')
    for (const name of TODAY) await expect(current, name).toContainText(name)
    for (const name of PROPOSED) await expect(proposed, name).toContainText(name)
    expect(await proposed.textContent()).not.toMatch(/\b(live|active|running)\b/i)
    // The numbers and words it states come from the reference check: 12 requests per scenario,
    // a preset or five controls, a key the browser makes for that run, UNTRUSTED on /verify.
    await expect(current).toContainText('12 fixed synthetic')
    await expect(current).toContainText('a preset or five controls')
    await expect(current).toContainText('makes for that run')
    await expect(current).toContainText('UNTRUSTED')
    await expect(figure.locator('figcaption')).toContainText('Dashed boxes are proposed pilot architecture and are not built')

    // Ink and the one green accent only; the green belongs to the lane that runs today.
    const colours = await paints(svg)
    for (const c of colours) expect(ALLOWED.has(c), c).toBe(true)
    expect(await paints(proposed)).not.toContain(GREEN)

    // Legible and still.
    const sizes = await textSizes(svg)
    expect(sizes.length).toBeGreaterThan(20)
    if (width === 375) for (const s of sizes) expect(s).toBeGreaterThanOrEqual(12)
    expect(await noOverflow(page)).toBe(true)
    expect(await isStill(page, '.posture-figure')).toEqual({ animations: 0, smil: 0 })
  })
}

test('pass 2 phase 2: the explainer names the format beside each verifier code', async ({ page }) => {
  await page.goto('/reference-check-vs-runtime')
  const list = page.locator('section[aria-labelledby="boundaries"] [data-code-formats]')
  await expect(list.locator('li')).toHaveCount(5)
  // The codes detect.mjs and @origin/verifier-core return for each format.
  await expect(list.locator('li').nth(0)).toHaveText('Origin Attestation: 1 payload tampered · 2 signature invalid · 3 wrong signer · 4 malformed')
  await expect(list.locator('li').nth(1)).toHaveText('Crucible credential: 3 tamper · 4 configuration drift')
  await expect(list.locator('li').nth(2)).toHaveText('ScoreReceipt: 3 tampered')
  await expect(list.locator('li').nth(3)).toHaveText('Episode trace: 2 chain tamper')
  await expect(list.locator('li').nth(4)).toContainText('Action/Run Evidence')
  await expect(list.locator('li').nth(4)).toContainText('no numeric code')
  await expect(page.locator('main')).not.toContainText('codes 1–4 identify')
  await expect(page.locator('#reference-check')).toContainText('(Crucible credential code 4: configuration drift)')
})

test('pass 2 phase 2: the explainer glosses session-signed and unpinned where its prose first uses them', async ({ page }) => {
  await page.goto('/reference-check-vs-runtime')
  const prose = await page.locator('main').evaluate((main) => {
    const copy = main.cloneNode(true) as HTMLElement
    copy.querySelectorAll('figure').forEach((f) => f.remove())
    return (copy.textContent ?? '').replace(/\s+/g, ' ')
  })
  const signed = prose.toLowerCase().indexOf('session-signed')
  expect(signed).toBeGreaterThan(-1)
  expect(prose.slice(signed)).toMatch(/^session-signed \(signed by a key your browser makes for that run\)/)
  const pinned = prose.indexOf('unpinned')
  expect(pinned).toBeGreaterThan(-1)
  expect(prose.slice(pinned)).toMatch(/^unpinned \(not tied to any key Origin has published\)/)
  // /labs already glosses the opaque lease handle where card 02 uses it.
  await page.goto('/labs')
  await expect(page.locator('.labs-card[data-lab="02"]')).toContainText('opaque lease handle: a reference to the credential, bound to that one grant, that cannot be exchanged for the secret.')
})

test('pass 2 phase 2: /trust glosses session-signed and unpinned in its posture card, as / and /reference-check do', async ({ page }) => {
  await page.goto('/trust')
  const card = page.locator('.editorial-card', { hasText: 'Explicit artifact provenance' })
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('The public reference-check artifact is session-signed (signed with a key your browser makes for that run) and unpinned (no published key it must match).')
  // The card is the page's first prose use of both terms.
  const text = await page.locator('main').evaluate((main) => (main.textContent ?? '').replace(/\s+/g, ' '))
  const signed = text.indexOf('session-signed')
  expect(signed).toBeGreaterThan(-1)
  expect(text.slice(signed)).toMatch(/^session-signed \(signed with a key your browser makes for that run\)/)
  const pinned = text.indexOf('unpinned')
  expect(pinned).toBeGreaterThan(-1)
  expect(text.slice(pinned)).toMatch(/^unpinned \(no published key it must match\)/)
})

// Counts drawn from the code: the proving-ground starter floor has 8 walls
// (src/proving-ground/starterFloor.ts); the default warehouse scene has 4 shelf columns of
// 3 blocks (buildWarehouseScene); the default shift has 6 waves (OperationsPage, runShift).
const LAB_FIGS: [lab: string, selector: string, count: number][] = [
  ['01', 'rect.lf-wall', 8],
  ['02', 'rect.lf-ink', 1],
  ['03', 'rect.lf-wall', 12],
  ['04', 'rect.lf-wall', 2],
  ['05', 'rect.lf-bar', 6],
  ['06', 'circle.lf-ink', 7],
]

for (const width of [375, 1280]) {
  test(`pass 2 phase 2: each /labs card carries a static 56px micro-diagram at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/labs')
    await expect(page.locator('.labs-card svg.labs-fig')).toHaveCount(6)
    for (const [lab, selector, count] of LAB_FIGS) {
      const svg = page.locator(`.labs-card[data-lab="${lab}"] svg.labs-fig[data-lab-fig="${lab}"]`)
      await expect(svg, lab).toHaveCount(1)
      await expect(svg, lab).toBeVisible()
      // Decorative: the card text says what the diagram shows.
      await expect(svg, lab).toHaveAttribute('aria-hidden', 'true')
      await expect(svg, lab).toHaveAttribute('height', '56')
      await expect(svg, lab).toHaveAttribute('width', /^\d+$/)
      const box = (await svg.boundingBox())!
      expect(Math.abs(box.height - 56), lab).toBeLessThanOrEqual(0.5)
      expect(box.width, lab).toBeLessThanOrEqual(Number(await svg.getAttribute('width')) + 0.5)
      await expect(svg.locator('text'), lab).toHaveCount(0)
      await expect(svg.locator(selector), `${lab} ${selector}`).toHaveCount(count)
      const colours = await paints(svg)
      for (const c of colours) expect(ALLOWED.has(c), `${lab} ${c}`).toBe(true)
      expect(colours, lab).toContain(GREEN)
    }
    expect(await noOverflow(page)).toBe(true)
    expect(await isStill(page, '.labs-fig')).toEqual({ animations: 0, smil: 0 })
  })
}

test('pass 2 phase 2: /trust and /labs link to /security and the explainer', async ({ page }) => {
  await page.goto('/trust')
  const posture = page.locator('#posture .editorial-heading')
  await expect(posture.locator('a[href="/reference-check-vs-runtime"]')).toHaveText('Reference check vs runtime enforcement')
  await expect(posture.locator('a[href="/security"]')).toHaveText('verification workbench')
  await expect(posture.locator('a[href="/reference-check-vs-runtime"]')).toBeVisible()
  await page.goto('/labs')
  const note = page.locator('#experiments .editorial-note')
  await expect(note.locator('a[href="/security"]')).toHaveText('verification workbench')
  await expect(note.locator('a[href="/reference-check-vs-runtime"]')).toHaveText('what runs today and what is only proposed')
  await expect(note.locator('a[href="/security"]')).toBeVisible()
  for (const href of ['/security', '/reference-check-vs-runtime']) expect((await page.request.get(href)).status(), href).toBe(200)
})

for (const width of [375, 1280]) {
  test(`pass 2 phase 2: /trust, /labs and the explainer do not scroll sideways at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const route of ['/trust', '/labs', '/reference-check-vs-runtime']) {
      await page.goto(route)
      expect(await noOverflow(page), route).toBe(true)
    }
  })
}
