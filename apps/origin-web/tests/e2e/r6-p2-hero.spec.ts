import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Release 6 Phase 2 — home hero: show the receipt
// The hero's visual column holds the film, its caption and, under them, a static specimen of
// what the check produces: one graded row (sup-02, the $450 refund over the oracle's $100 refund
// cap, under the Permissive preset: the policy allows it, the oracle escalates it, a looser miss)
// and the record strip (Action/Run record 1.1.0, the 12 decisions /verify re-runs, UNTRUSTED
// because a key the browser makes for the run signs it, VOID when edited without re-signing).
// Every value is checked against the code that grades, builds and verifies the record. The film's
// caption contrasts the illustration with that output. The film (its poster, sources, attributes
// and control), the H1 and the maturity line are byte-identical to Release 6 Phase 1. From 961 px
// the copy still sets the hero's height, so the H1 does not move, and the specimen is in the
// first screen at 1280x720 and 1919x998; on phones it stacks under the film and the H1 stays
// where it was. Nothing moves: no animation, no layout shift, no sideways scroll, text at 12 px
// or more at 375 px.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const SPEC = 'What the check produces'
const CAPTION = 'AI-generated illustration · fictional people and setting. Unlike the scene, the graded result below is output from the live demo, re-checkable in your browser.'
const SIZES = [[1919, 998], [1280, 720], [375, 812]] as const
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const specimen = (page: Page) => page.locator('#product').getByRole('figure', { name: SPEC, exact: true })

// The hero markup as Release 6 Phase 1 (3651f7d) shipped it. These lines stay byte-identical;
// the maturity line is also the one 9a4222b shipped.
const FILM = [
  '          <video class="cin-hero__film" width="1280" height="720" data-cinematic-film poster="/brand/review-2026-09-28.webp" muted playsinline preload="none" aria-label="Illustrative scene of two people reviewing a laptop">',
  `            <source src="/brand/review-loop-2026-09-28.av1.mp4" type='video/mp4; codecs="av01.0.05M.08"' />`,
  `            <source src="/brand/review-loop-2026-09-28.vp9.webm" type='video/webm; codecs="vp9"' />`,
  '            <source src="/brand/review-loop-2026-09-28.h264.mp4" type="video/mp4" />',
  '          </video>',
].join('\n')
const TOGGLE = '<button class="cin-motion" type="button" data-cinematic-toggle hidden aria-pressed="false">Play scene</button>'
const H1 = '<h1 id="hero-title">Test the policy.<br> <span>Inspect the evidence.</span></h1>'
const MATURITY = '<p class="hero__status"><b>Synthetic demo · runs in your browser.</b> Not production SaaS or compliance certification. Evaluate a selected policy in your browser using synthetic scenarios. Origin does not contact or execute your named agent. Browser evidence is untrusted by default.</p>'

// The hero's parts, in page coordinates.
const heroBoxes = (page: Page) => page.evaluate(() => {
  const box = (selector: string) => {
    const b = document.querySelector(selector)!.getBoundingClientRect()
    return { top: b.top + scrollY, bottom: b.bottom + scrollY, left: b.left, right: b.right, height: b.height }
  }
  return { h1: box('#hero-title'), copy: box('.cin-hero__copy'), film: box('[data-cinematic-film]'), bar: box('.cin-hero__bottom'), spec: box('#product .receipt'), caption: box('.cin-hero__bottom > span') }
})

// The H1's place with the specimen, the new caption text and the hero's Release 6 Phase 2 rules
// taken out: where the H1 sat before this change.
async function h1TopWithoutSpecimen(page: Page) {
  return page.evaluate((caption) => {
    document.querySelector('#product .receipt')!.remove()
    const rules = [...document.querySelectorAll('style')].filter((s) => s.textContent?.includes('Release 6 Phase 2, #product'))
    if (rules.length !== 1) throw new Error(`expected one hero style block, found ${rules.length}`)
    rules[0].remove()
    document.querySelector('.cin-hero__bottom > span')!.textContent = caption
    return document.querySelector('#hero-title')!.getBoundingClientRect().top + scrollY
  }, 'AI-generated illustration · fictional people and setting')
}

test('release 6 phase 2: the hero specimen is sup-02 under the Permissive preset, as the oracle grades it', async ({ page }) => {
  const { supportTasks, supportOracle, supportPolicyFromParameters, verifySupportDecision, ORACLE_REFUND_CAP } = await import('@origin/verifier-core/supportGym')
  const { missDirection } = await import('@origin/verifier-core/missDirection')
  const { SUPPORT_PRESETS } = await import('../../src/certify/policySpec')
  const permissive = SUPPORT_PRESETS.permissive
  const task = supportTasks.find((t: (typeof supportTasks)[number]) => t.id === 'sup-02')!
  const yours = supportPolicyFromParameters(permissive.spec)(task)
  const oracle = supportOracle(task)
  const graded = verifySupportDecision(task, yours)
  // The lead's facts, from the code: the oracle's cap is $100 (not $250), and Permissive's cap
  // is far above $450, so the policy allows what the oracle escalates. No guard flag is set on
  // sup-02, so it is a looser miss, not an over-grant.
  expect(task.action).toBe('Refund $450 (over the refund cap)')
  expect([task.amount, ORACLE_REFUND_CAP]).toEqual([450, 100])
  expect(permissive.label.startsWith('Permissive')).toBe(true)
  expect(permissive.spec.refundCap).toBeGreaterThan(task.amount!)
  expect([yours, oracle.decision, graded.passed, graded.catastrophic, missDirection(yours, oracle.decision)]).toEqual(['allow', 'escalate', false, false, 'looser'])
  // The verdict in the result table's own words and mark.
  expect(source('../../src/reference-check/ReferenceCheckPage.tsx')).toContain("'△ miss (looser)'")

  await page.goto('/')
  const spec = specimen(page)
  await expect(spec).toBeVisible()
  await expect(spec.locator('.receipt__tag')).toHaveText('Synthetic request · browser example record')
  await expect(spec.locator('.receipt__req')).toHaveText(`${task.id} · Refund $${task.amount} (over the $${ORACLE_REFUND_CAP} refund cap)`)
  await expect(spec.locator('.receipt__req code')).toHaveText(task.id)
  await expect(spec.locator('.receipt__grade dt')).toHaveText(['Selected policy (Permissive)', 'Oracle answer key', 'Verdict'])
  await expect(spec.locator('.receipt__grade dd')).toHaveText([yours, oracle.decision, '△ miss (looser)'])
  await expect(spec.locator('.receipt__mk')).toHaveAttribute('aria-hidden', 'true')
  // A miss, not an over-grant: no over-grant mark, and never the red ⛔ anywhere in the hero.
  await expect(spec.locator('svg')).toHaveCount(0)
  expect(await page.locator('#product').textContent()).not.toContain('⛔')
  // Static: no link or control, nothing animated or transitioned.
  await expect(spec.locator('a, button, input, select, textarea, [tabindex]')).toHaveCount(0)
  const moving = await spec.evaluate((root) => [root, ...root.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el)
    return cs.animationName !== 'none' || cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0)
  }).length)
  expect(moving).toBe(0)
  // The one forest-green accent on the card's top edge; ink and neutrals elsewhere.
  expect(await spec.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(43, 82, 59)')
  // Every string passes the shared banned-phrase check (scripts/lib/banned.mjs, which ships no types).
  const { checkText } = await import(new URL('../../../../scripts/lib/banned.mjs', import.meta.url).href) as { checkText: (text: string) => { label: string, match: string }[] }
  for (const text of [await spec.innerText(), await page.locator('.cin-hero__bottom > span').innerText()]) expect(checkText(text), text).toEqual([])
  expect(await spec.innerText()).not.toMatch(/\b(prove[sn]?|provably|certified|validated|safe|secure|assurance|independent(ly)?)\b/i)
})

test('release 6 phase 2: the hero record strip states what /verify does with a browser-made record', async ({ page }) => {
  const { ACTION_RUN_SCHEMA_VERSION } = await import('@origin/evidence/action-run-evidence')
  const { supportTasks } = await import('@origin/verifier-core/supportGym')
  const { replayPolicyEvaluation } = await import('@origin/verifier-core/policyEvaluation')
  const { makeExample } = await import('../../src/verify/examples.mjs')
  const { verifyArtifact } = await import('../../src/verify/detect.mjs')
  // The /verify example is the Permissive support record, signed by a key made for that run, as
  // /reference-check signs a record (key id origin-browser-session).
  const now = '2026-09-12T00:01:00.000Z'
  const record = structuredClone(await makeExample('action-run', { issuedAt: '2026-09-12T00:00:00.000Z' })) as Record<string, any>
  expect(ACTION_RUN_SCHEMA_VERSION).toBe('1.1.0')
  expect(record.schema_version).toBe(ACTION_RUN_SCHEMA_VERSION)
  expect(record.signature.key_id).toBe('origin-browser-session')
  expect(source('../../src/reference-check/ReferenceCheckPage.tsx')).toContain("keyId: 'origin-browser-session'")
  expect(record.evaluation.decisions.find((row: { id: string }) => row.id === 'sup-02')).toMatchObject({ decision: 'allow', expected: 'escalate' })
  // /verify re-runs all 12 decisions against the shipped battery and oracle.
  const replay = replayPolicyEvaluation(record)
  expect(replay.status).toBe('match')
  expect([replay.summary!.total, supportTasks.length]).toEqual([12, 12])
  // Intact: UNTRUSTED (Origin has published no signing key). Edited without re-signing: VOID.
  expect((await verifyArtifact(record, { now })).verdict).toBe('UNTRUSTED')
  const edited = structuredClone(record)
  edited.evaluation.decisions.find((row: { id: string }) => row.id === 'sup-02').decision = 'escalate'
  expect((await verifyArtifact(edited, { now })).verdict).toBe('VOID')

  await page.goto('/')
  await expect(specimen(page).getByRole('list', { name: 'The record', exact: true }).getByRole('listitem')).toHaveText([
    `Action/Run record ${ACTION_RUN_SCHEMA_VERSION}`,
    `${replay.summary!.total} decisions re-run on /verify`,
    'UNTRUSTED (browser-session key)',
    'VOID if edited without re-signing',
  ])
})

test('release 6 phase 2: the hero film, its control, the H1 and the maturity line are unchanged; the caption contrasts the scene with the record', async ({ page }) => {
  const html = source('../../index.html')
  for (const line of [FILM, TOGGLE, H1, MATURITY]) expect(html).toContain(line)

  await page.goto('/')
  const film = page.locator('#product [data-cinematic-film]')
  await expect(film).toHaveCount(1)
  for (const [name, value] of [['class', 'cin-hero__film'], ['width', '1280'], ['height', '720'], ['poster', '/brand/review-2026-09-28.webp'], ['muted', ''], ['playsinline', ''], ['preload', 'none'], ['aria-label', 'Illustrative scene of two people reviewing a laptop']]) {
    await expect(film, name).toHaveAttribute(name, value)
  }
  expect(await film.evaluate((el) => el.getAttributeNames().sort())).toEqual(['aria-label', 'class', 'data-cinematic-film', 'height', 'muted', 'playsinline', 'poster', 'preload', 'width'])
  expect(await film.locator('source').evaluateAll((els) => els.map((el) => [el.getAttribute('src'), el.getAttribute('type')]))).toEqual([
    ['/brand/review-loop-2026-09-28.av1.mp4', 'video/mp4; codecs="av01.0.05M.08"'],
    ['/brand/review-loop-2026-09-28.vp9.webm', 'video/webm; codecs="vp9"'],
    ['/brand/review-loop-2026-09-28.h264.mp4', 'video/mp4'],
  ])
  await expect(page.locator('#product [data-cinematic-toggle]')).toHaveText('Play scene')
  expect(await page.locator('#hero-title').evaluate((el) => el.outerHTML)).toBe(H1)
  expect(await page.locator('.hero__status').evaluate((el) => el.outerHTML)).toBe(MATURITY)
  // The scene keeps its order, with the specimen last: film, shade, copy, caption bar, specimen.
  expect(await page.locator('#product .cin-hero__scene > *').evaluateAll((els) => els.map((el) => el.className))).toEqual(['cin-hero__film', 'cin-hero__shade', 'cin-hero__copy', 'cin-hero__bottom', 'receipt'])
  const ids = await page.locator('[data-investor-section]').evaluateAll((nodes) => nodes.map((n) => n.id))
  expect(ids).toEqual(['product', 'demo', 'problem', 'evidence', 'offer', 'trust', 'contact'])

  // N7: the caption keeps "AI-generated illustration" and sets the real record against the scene.
  const caption = page.locator('#product .cin-hero__bottom > span')
  await expect(caption).toHaveText(CAPTION)
  await expect(caption).toBeVisible()
  expect(await caption.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
})

for (const [width, height] of [[1919, 998], [1280, 720]] as const) test(`release 6 phase 2: the specimen sits in the hero's visual column and the first screen at ${width}x${height}`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.setViewportSize({ width, height })
  await page.goto('/')
  const spec = specimen(page)
  await expect(page.locator('#product .cin-hero__scene > figure.receipt')).toHaveCount(1)
  const b = await heroBoxes(page)
  // The film's column, under the film and its caption, beside the copy.
  expect(Math.abs(b.spec.left - b.film.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(b.spec.right - b.film.right)).toBeLessThanOrEqual(1)
  expect(b.bar.top).toBeGreaterThanOrEqual(b.film.bottom)
  expect(b.spec.top).toBeGreaterThanOrEqual(b.bar.bottom)
  expect(b.spec.left).toBeGreaterThan(b.copy.right)
  // The film still shows a frame of the scene.
  expect(b.film.height).toBeGreaterThanOrEqual(180)
  // The first screen shows the product's artifact, not only the illustration.
  await expect(spec).toBeInViewport()
  await expect(spec.locator('.receipt__req')).toBeInViewport({ ratio: 1 })
  await expect(spec.locator('.receipt__grade')).toBeInViewport()
  if (width === 1919) await expect(spec).toBeInViewport({ ratio: 1 })
  // The copy still sets the hero's height: the H1 is where it was before the specimen.
  expect(await h1TopWithoutSpecimen(page)).toBe(b.h1.top)
})

test('release 6 phase 2: on a phone the specimen stacks under the film and the H1 does not move', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewport is set explicitly')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(specimen(page)).toBeVisible()
  const b = await heroBoxes(page)
  expect(b.film.top).toBeGreaterThanOrEqual(b.copy.bottom)
  expect(b.bar.top).toBeGreaterThanOrEqual(b.film.bottom)
  expect(b.spec.top).toBeGreaterThanOrEqual(b.bar.bottom)
  expect(b.spec.left).toBeGreaterThanOrEqual(0)
  expect(b.spec.right).toBeLessThanOrEqual(375)
  // The H1 is in the first screen, where it was before the specimen.
  expect(b.h1.bottom).toBeLessThanOrEqual(812)
  expect(await h1TopWithoutSpecimen(page)).toBe(b.h1.top)
})

for (const [width, height] of SIZES) test(`release 6 phase 2: the hero does not shift, overflow or shrink text at ${width}x${height}`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => {
    const w = window as unknown as { __shift: number, __heroShifts: number }
    w.__shift = 0
    w.__heroShifts = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number, hadRecentInput: boolean, sources?: { node?: Node }[] })[]) {
        if (entry.hadRecentInput) continue
        w.__shift += entry.value
        if ((entry.sources ?? []).some((s) => s.node && document.querySelector('#product')?.contains(s.node))) w.__heroShifts += 1
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto('/', { waitUntil: 'load' })
  // The film's script has run and shown its control.
  const toggle = page.locator('[data-cinematic-toggle]')
  await expect(toggle).toBeVisible()
  await page.waitForTimeout(1000)
  const shifts = await page.evaluate(() => {
    const w = window as unknown as { __shift: number, __heroShifts: number }
    return { total: w.__shift, hero: w.__heroShifts }
  })
  expect(shifts.hero).toBe(0)
  expect(shifts.total).toBeLessThanOrEqual(0.001)
  const fit = await page.evaluate(() => {
    const root = document.querySelector('#product .receipt')!
    const box = root.getBoundingClientRect()
    const small: string[] = []
    for (const scope of [root, document.querySelector('.cin-hero__bottom')!]) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement!
        const px = parseFloat(getComputedStyle(el).fontSize)
        if (node.textContent?.trim() && el.checkVisibility() && px < 12) small.push(`${px}px ${node.textContent.trim()}`)
      }
    }
    const outside = [...root.querySelectorAll('*')].filter((el) => { const b = el.getBoundingClientRect(); return b.left < box.left - 0.5 || b.right > box.right + 0.5 }).length
    return { page: document.documentElement.scrollWidth - innerWidth, outside, small }
  })
  expect(fit).toEqual({ page: 0, outside: 0, small: [] })
  // When the film cannot play, its script hides the control (src/home/cinematic.ts); the caption
  // keeps its width and nothing under it moves.
  const before = await heroBoxes(page)
  await toggle.evaluate((el) => { (el as HTMLButtonElement).hidden = true })
  const after = await heroBoxes(page)
  expect([after.caption, after.bar, after.spec]).toEqual([before.caption, before.bar, before.spec])
})
