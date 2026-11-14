import { test, expect, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Pass 2 Phase 2 — home figures
// Section 01 (#demo) explains the reference check to a visitor who does not click: a static
// five-stage figure between the section head and the stage tablist, one static schematic in
// each tab panel, and a boundary strip under the walkthrough that links to "What Origin is
// not". Every number and field name in the figures is checked against the code that makes
// the record (@origin/verifier-core, @origin/evidence, src/reference-check). The figures are
// static: no animation, no SMIL, no layout shift, rendered text at least 12 px at 375 px and
// no sideways scroll at 375 or 1280. The shot01 caption names the format beside each code,
// and "session-signed" and "unpinned" get plain-words glosses on first use.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const STAGES = [['01', 'Bind'], ['02', 'Challenge'], ['03', 'Grade'], ['04', 'Attest'], ['05', 'Reverify']] as const
const FIGURE_NAME = 'The reference check in five stages'
const PANEL_FIGURES = [
  'Four inputs, one input digest',
  "The support battery: 12 requests and the oracle's answer to each",
  'Three rows from one run: the support battery, Moderate preset',
  'The record your browser signs',
  "What /verify runs, in order, in the reviewer's browser",
]
const FIGURES = '#stagefig, .panelfig, .demo-boundary'
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const stageFigure = (page: Page) => page.getByRole('figure', { name: FIGURE_NAME, exact: true })

async function openPanel(page: Page, step: number) {
  await page.locator(`#demo-tab-${step}`).click()
  await expect(page.locator(`#demo-panel-${step}`)).toBeVisible()
  return page.locator(`#demo-panel-${step}`)
}

// The record a run of the support battery with the Moderate preset makes, built by the same
// function /reference-check calls, plus the evaluation /verify replays.
async function moderateSupportRun(declaredConfig = { model: 'm', tools: ['t'], context: 'c', harness: 'h' }) {
  const { supportTasks, supportOracle, verifySupportDecision, supportPolicyFromParameters, supportEnvDigest, SUPPORT_VERSIONS } = await import('@origin/verifier-core/supportGym')
  const { buildPolicyEvaluation } = await import('@origin/verifier-core/policyEvaluation')
  const { SUPPORT_PRESETS } = await import('../../src/certify/policySpec')
  const { buildSyntheticReferenceCheckEvidence } = await import('../../src/reference-check/evidence')
  const parameters = SUPPORT_PRESETS.moderate.spec
  const policyFor = supportPolicyFromParameters(parameters)
  const rows = supportTasks.map((task: (typeof supportTasks)[number]) => {
    const yours = policyFor(task)
    const verdict = verifySupportDecision(task, yours)
    return { id: task.id, yours, oracle: supportOracle(task).decision, passed: verdict.passed, catastrophic: verdict.catastrophic }
  })
  const record = buildSyntheticReferenceCheckEvidence({
    evidenceId: 'figure-check', issuedAt: '2026-11-13T00:00:00.000Z', maxAgeMs: 30 * 24 * 60 * 60 * 1000, scenario: 'support',
    declaredConfig, selectedPolicy: parameters, battery: supportTasks, rows,
    environmentDigest: supportEnvDigest(), evaluatorVersion: SUPPORT_VERSIONS.reward_model_version, verifierVersion: SUPPORT_VERSIONS.verifier_version,
  }) as unknown as Record<string, unknown>
  return { record, evaluation: buildPolicyEvaluation({ scenario: 'support', parameters }) }
}

const field = (record: Record<string, unknown>, path: string) =>
  path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], record)

// Rendered size of every visible text node in the figures: computed font-size for HTML text,
// scaled by the screen transform for any SVG text.
async function renderedTextSizes(scope: Locator) {
  return scope.evaluateAll((roots) => {
    const sizes: { text: string, px: number }[] = []
    for (const root of roots) {
      if (!root.checkVisibility()) continue
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement
        const text = node.textContent?.trim()
        if (!el || !text || !el.checkVisibility()) continue
        let px = parseFloat(getComputedStyle(el).fontSize)
        const ctm = el instanceof SVGGraphicsElement ? el.getScreenCTM() : null
        if (ctm) px *= Math.hypot(ctm.a, ctm.b)
        sizes.push({ text: text.slice(0, 40), px })
      }
    }
    return sizes
  })
}

async function stillness(page: Page) {
  return page.locator(FIGURES).evaluateAll((roots) => {
    // visibilityProperty: the enhanced walkthrough keeps inactive panels laid out but
    // visibility:hidden, so only the shown stage's figure counts as visible.
    const visible = roots.filter((root) => root.checkVisibility({ visibilityProperty: true }))
    const nodes = visible.flatMap((root) => [root, ...root.querySelectorAll('*')])
    return {
      count: visible.length,
      animations: visible.flatMap((root) => root.getAnimations({ subtree: true }).map((a) => a.constructor.name)),
      named: nodes.filter((el) => getComputedStyle(el).animationName !== 'none').map((el) => el.tagName),
      smil: [...document.querySelectorAll('#demo *')].filter((el) => ['animate', 'animateTransform', 'animateMotion', 'set'].includes(el.localName)).length,
    }
  })
}

test('pass 2 phase 2: the five-stage figure sits between the #demo head and the tablist', async ({ page }) => {
  await page.goto('/')
  const figure = stageFigure(page)
  await expect(figure).toHaveCount(1)
  await expect(figure).toBeVisible()
  expect(await figure.evaluate((el) => ({
    inDemo: Boolean(el.closest('#demo')),
    after: el.previousElementSibling?.matches('.cin-section-head') ?? false,
    before: el.nextElementSibling?.matches('[data-demo]') ?? false,
  }))).toEqual({ inDemo: true, after: true, before: true })
  await expect(figure.locator('#stagefig-desc')).toHaveText('What each stage does and the record fields involved. The requests are synthetic; your agent is not run.')

  // The stage names are the pinned tab names, in the tablist's order.
  const stages = figure.locator('.stagefig__stage')
  await expect(stages).toHaveCount(5)
  await expect(figure.locator('.stagefig__node')).toHaveText(STAGES.map(([n]) => n))
  await expect(figure.locator('.stagefig__name')).toHaveText(STAGES.map(([, name]) => name))
  for (const [i, [, name]] of STAGES.entries()) await expect(page.locator(`#demo-tab-${i + 1}`)).toContainText(name)
  await expect(figure.locator('svg.stagefig__head')).toHaveCount(4)
  for (const svg of await figure.locator('svg').all()) await expect(svg).toHaveAttribute('aria-hidden', 'true')

  // Every label is the code's own: field names exist in a record built the way /reference-check
  // builds it, the battery count is the shipped battery's, and the format version is the builder's.
  const { record } = await moderateSupportRun()
  const { supportTasks } = await import('@origin/verifier-core/supportGym')
  const { iamTasks } = await import('@origin/verifier-core/iamGym')
  const { ACTION_RUN_SCHEMA_VERSION } = await import('@origin/evidence/action-run-evidence')
  expect(iamTasks.length).toBe(supportTasks.length)
  expect(record.schema_version).toBe(ACTION_RUN_SCHEMA_VERSION)
  const fields = [
    ['subject.model_digest', 'subject.tools_digest', 'proposal.input_digest'],
    ['subject.environment_digest'],
    ['evaluation.decisions'],
    [`schema_version ${ACTION_RUN_SCHEMA_VERSION}`, 'evaluation', 'signature'],
  ]
  for (const [i, codes] of fields.entries()) {
    await expect(stages.nth(i).locator('code')).toHaveText(codes)
    for (const code of codes) expect(code.split(' ')[0] in record || field(record, code.split(' ')[0]) !== undefined, code).toBe(true)
  }
  await expect(stages.nth(0)).toContainText('The model and tools you type are kept only as digests.')
  await expect(stages.nth(1)).toContainText(`${supportTasks.length} fixed synthetic requests written by Origin, the same on every run.`)
  await expect(stages.nth(1)).toContainText('allow, deny or escalate')
  // The Grade key uses the /reference-check verdict words.
  const verdictWords = source('../../src/reference-check/ReferenceCheckPage.tsx')
  for (const word of ['✓ match', '△ miss (stricter)', '△ miss (looser)', '⛔ over-grant']) expect(verdictWords).toContain(word)
  // The marks are aria-hidden; the over-grant mark is drawn in ink, since the emoji renders red.
  await expect(stages.nth(2).locator('.stagefig__key li')).toHaveText(['✓match', '△miss (stricter)', '△miss (looser)', 'over-grant, counted separately'])
  for (const mark of await stages.nth(2).locator('.stagefig__key .mk').all()) await expect(mark).toHaveAttribute('aria-hidden', 'true')
  await expect(stages.nth(2)).toContainText("Origin's answer key. Not a model.")
  await expect(stages.nth(3)).toContainText(`Your browser signs the record with a key it makes for that run. Record format ${ACTION_RUN_SCHEMA_VERSION} states the result.`)
  await expect(stages.nth(4)).toContainText("/verify re-runs the grading in the reviewer's browser.")
  await expect(stages.nth(4).locator('.stagefig__key b')).toHaveText(['UNTRUSTED', 'VOID'])
  await expect(stages.nth(4).locator('.stagefig__key li').nth(1)).toHaveText('VOIDan edit made without re-signing')
})

test('pass 2 phase 2: each tab panel carries one static schematic, labelled from the code', async ({ page }) => {
  const { supportTasks, supportOracle, verifySupportDecision } = await import('@origin/verifier-core/supportGym')
  const { iamTasks } = await import('@origin/verifier-core/iamGym')
  const { missDirection } = await import('@origin/verifier-core/missDirection')
  const { ACTION_RUN_SCHEMA_VERSION } = await import('@origin/evidence/action-run-evidence')
  const { record, evaluation } = await moderateSupportRun()
  await page.goto('/')

  // 01 Bind: each input and the record field that binds it, and one input digest over them.
  let panel = await openPanel(page, 1)
  let figure = panel.getByRole('figure', { name: PANEL_FIGURES[0], exact: true })
  await expect(figure).toBeVisible()
  const binds = ['subject.model_digest', 'subject.tools_digest', 'subject.policy_digest', 'subject.environment_digest']
  await expect(figure.locator('.panelfig__in')).toHaveText(['model', 'tools', 'policy', 'battery'])
  await expect(figure.locator('.panelfig__binds code')).toHaveText(binds)
  await expect(figure.locator('.panelfig__out code')).toHaveText('proposal.input_digest')
  for (const path of [...binds, 'proposal.input_digest']) expect(field(record, path), path).toMatch(/^[0-9a-f]{64}$/)
  // The input digest also binds the declared context and harness, which have no subject digest.
  await expect(figure.locator('.panelfig__join')).toHaveText('these four, plus the declared context and harness, the scenario and versions')
  for (const changed of [{ context: 'c2' }, { harness: 'h2' }]) {
    const { record: other } = await moderateSupportRun({ model: 'm', tools: ['t'], context: 'c', harness: 'h', ...changed })
    expect(field(other, 'proposal.input_digest'), JSON.stringify(changed)).not.toBe(field(record, 'proposal.input_digest'))
    for (const path of binds) expect(field(other, path), path).toBe(field(record, path))
  }

  // 02 Challenge: the support battery's twelve ids and the oracle's answer to each.
  panel = await openPanel(page, 2)
  figure = panel.getByRole('figure', { name: PANEL_FIGURES[1], exact: true })
  await expect(figure).toBeVisible()
  const cells = figure.locator('.panelfig__cells li')
  await expect(cells).toHaveCount(supportTasks.length)
  await expect(figure.locator('.panelfig__cells code')).toHaveText(supportTasks.map((task: { id: string }) => task.id))
  const answers = supportTasks.map((task: (typeof supportTasks)[number]) => supportOracle(task).decision)
  await expect(figure.locator('.panelfig__cells span')).toHaveText(answers)
  const count = (decision: string) => answers.filter((answer: string) => answer === decision).length
  await expect(figure.locator('.panelfig__note')).toHaveText(`${count('allow')} allow · ${count('escalate')} escalate · ${count('deny')} deny, the same on every run. The IAM battery also has ${iamTasks.length} requests.`)

  // 03 Grade: three rows of one real run (support battery, Moderate preset), one of each result.
  panel = await openPanel(page, 3)
  figure = panel.getByRole('figure', { name: PANEL_FIGURES[2], exact: true })
  await expect(figure).toBeVisible()
  const rows = figure.locator('.panelfig__rows li')
  await expect(rows).toHaveCount(3)
  const shown = ['sup-01', 'sup-02', 'sup-04']
  const verdicts: string[] = []
  for (const [i, id] of shown.entries()) {
    const row = evaluation.decisions.find((decision: { id: string }) => decision.id === id)!
    const task = supportTasks.find((t: { id: string }) => t.id === id)!
    const scored = verifySupportDecision(task, row.decision)
    const verdict = scored.catastrophic ? 'over-grant' : scored.passed ? 'match' : `miss (${missDirection(row.decision, row.expected)})`
    verdicts.push(verdict)
    await expect(rows.nth(i).locator('code')).toHaveText(id)
    await expect(rows.nth(i).locator('.panelfig__req')).toHaveText(task.action)
    await expect(rows.nth(i).locator('.panelfig__dec')).toHaveText(`policy ${row.decision} · oracle ${row.expected}`)
    const mark = verdict === 'match' ? '✓' : verdict === 'over-grant' ? '' : '△'
    await expect(rows.nth(i).locator('.panelfig__verdict')).toHaveText(`${mark}${verdict}`)
  }
  expect(verdicts).toEqual(['match', 'miss (looser)', 'over-grant'])
  const { matched, total, misses, over_grants } = evaluation.summary
  await expect(figure.locator('.panelfig__note')).toContainText(`That run: ${matched} of ${total} match, ${misses} misses, ${over_grants} over-grants.`)
  // The dividing line is the security-critical flag, as on /reference-check's annotated row:
  // sup-04 carries the approval flag, sup-02 is over the cap with no flag.
  const flags = (id: string) => { const t = supportTasks.find((task: { id: string }) => task.id === id)!; return [t.pii, t.forbidden, t.tainted, t.requires_approval] }
  expect(flags('sup-04')).toEqual([false, false, false, true])
  expect(flags('sup-02')).toEqual([false, false, false, false])
  await expect(figure.locator('.panelfig__note')).toContainText('sup-04 is a bank-detail change flagged for approval, so allowing it is an over-grant; sup-02 is only over the refund cap, with no such flag, so allowing it is a miss.')
  await expect(figure.locator('.panelfig__note')).not.toContainText('needs approval')
  // The panel's pinned readout is untouched.
  await expect(panel.locator('.demo__readout')).toHaveText('oracle · FAR · FRR · over-grants EVALUATION RESULT')
  await expect(panel.locator('.rd-state')).toHaveText('EVALUATION RESULT')

  // 04 Attest: the record's real fields, and the signature block /reference-check writes.
  panel = await openPanel(page, 4)
  figure = panel.getByRole('figure', { name: PANEL_FIGURES[3], exact: true })
  await expect(figure).toBeVisible()
  await expect(figure.locator('dt')).toHaveText(['schema_version', 'execution_mode', 'evaluation', 'outcome_attestation.status', 'evidence_digest', 'signature'])
  await expect(figure.locator('dd').nth(0)).toHaveText(String(record.schema_version))
  expect(record.schema_version).toBe(ACTION_RUN_SCHEMA_VERSION)
  await expect(figure.locator('dd').nth(1)).toHaveText(String(record.execution_mode))
  await expect(figure.locator('dd').nth(3)).toHaveText(String(field(record, 'outcome_attestation.status')))
  expect(field(record, 'evaluation.decisions')).toBeDefined()
  expect(field(record, 'evaluation.summary')).toBeDefined()
  expect(field(record, 'evidence_digest')).toMatch(/^[0-9a-f]{64}$/)
  expect('signature' in record).toBe(true)
  expect(source('../../src/reference-check/ReferenceCheckPage.tsx')).toContain("keyId: 'origin-browser-session'")
  expect(source('../../../../packages/verifier-core/sigil.mjs')).toContain("alg: 'ES256'")
  await expect(figure.locator('dd').nth(5)).toHaveText('ES256 · key_id origin-browser-session')
  await expect(panel).toContainText('SIGNED')

  // 05 Reverify: the checks /verify runs, in order, and the two outcomes.
  panel = await openPanel(page, 5)
  figure = panel.getByRole('figure', { name: PANEL_FIGURES[4], exact: true })
  await expect(figure).toBeVisible()
  expect(source('../../src/reference-check/ReferenceCheckPage.tsx')).toContain('maxAgeMs: 30 * 24 * 60 * 60 * 1000')
  await expect(figure.locator('.panelfig__checks li')).toHaveText(['structure', 'digest', 'signature', 'freshness (30-day window)', 'replay: the grading re-runs and every row matches'].map((check) => `✓${check}`))
  await expect(figure.locator('.panelfig__outcome b')).toHaveText(['UNTRUSTED', 'VOID'])
  await expect(panel).toContainText('VOID')
})

test('pass 2 phase 2: the tablist keeps its names, ids and keyboard contract', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('figure', { name: PANEL_FIGURES[0], exact: true })).toBeVisible()
  const tabs = page.locator('[data-demo] [role="tab"]')
  await expect(tabs).toHaveCount(5)
  for (const [i, [, name]] of STAGES.entries()) {
    await expect(tabs.nth(i)).toHaveAttribute('id', `demo-tab-${i + 1}`)
    await expect(tabs.nth(i)).toHaveAttribute('aria-controls', `demo-panel-${i + 1}`)
    await expect(tabs.nth(i)).toHaveText(`${i + 1}${name}`)
  }
  const selected = (n: number) => expect(page.locator(`#demo-tab-${n}`)).toHaveAttribute('aria-selected', 'true')
  await page.locator('#demo-tab-1').focus()
  await page.keyboard.press('ArrowRight')
  await selected(2)
  await expect(page.locator('#demo-tab-2')).toBeFocused()
  await expect(page.getByRole('figure', { name: PANEL_FIGURES[1], exact: true })).toBeVisible()
  await page.keyboard.press('End')
  await selected(5)
  await page.keyboard.press('Home')
  await selected(1)
  await page.keyboard.press('ArrowLeft')
  await selected(5)
  await expect(page.locator('#demo-panel-1')).toBeHidden()
  await expect(page.getByRole('figure', { name: PANEL_FIGURES[4], exact: true })).toBeVisible()
})

test('pass 2 phase 2: the boundary strip under the walkthrough links to What Origin is not', async ({ page }) => {
  await page.goto('/')
  const strip = page.locator('#demo .demo-boundary')
  await expect(strip).toHaveCount(1)
  await expect(strip).toBeVisible()
  expect(await strip.evaluate((el) => el.previousElementSibling?.matches('[data-demo]') ?? false)).toBe(true)
  await expect(strip).toHaveText('No design partner, no pilot, no paying user — today. Everything here is synthetic or scripted and checkable in your browser; see What Origin is not ↓')
  const link = strip.getByRole('link', { name: 'What Origin is not', exact: true })
  await expect(link).toHaveAttribute('href', '#not')
  await expect(page.locator('#trust #not')).toHaveText('What Origin is not.')
  await link.click()
  await expect(page).toHaveURL(/#not$/)
  await expect(page.locator('#not')).toBeInViewport()
})

test('pass 2 phase 2: the shot01 caption on / names the format beside each code', async ({ page }) => {
  // The codes are the Origin Attestation (Sigil) verifier's: 0 valid, 1 payload altered.
  const sigil = source('../../../../packages/verifier-core/sigil.mjs')
  expect(sigil).toContain("code: 0, reason: 'valid")
  expect(sigil).toContain("code: 1, reason: 'payload was altered")
  await page.goto('/')
  const detail = page.locator('#product .vband__detail')
  await expect(detail).toContainText('VALID (Origin Attestation code 0)')
  await expect(detail).toContainText(/VOID \(Origin Attestation code 1\b/)
  await expect(detail).not.toContainText('VOID (code 1)')
  await expect(detail).toContainText('gives VOID (Origin Attestation code 1: payload tampered); restoring it gives VALID (Origin Attestation code 0), still offline.')
  await expect(detail).not.toContainText('(code 0)')
  await expect(detail).toContainText('not signer identity')
  // The same recording carries the same words on /verify.
  const words = await detail.textContent()
  await page.goto('/verify')
  await expect(page.locator('video[poster*="shot01-"]').locator('xpath=ancestor::figure').locator('.vband__detail')).toHaveText(words!)
})

test('pass 2 phase 2: session-signed and unpinned are glossed on first use', async ({ page }) => {
  await page.goto('/')
  const text = await page.locator('main').evaluate((el) => (el.textContent ?? '').replace(/\s+/g, ' '))
  const unpinned = text.indexOf('unpinned')
  expect(unpinned).toBeGreaterThan(-1)
  expect(text.slice(unpinned)).toMatch(/^unpinned \(no published key it must match\)/)
  const sessionSigned = text.indexOf('session-signed')
  expect(sessionSigned).toBeGreaterThan(-1)
  expect(text.slice(sessionSigned)).toMatch(/^session-signed \(signed with a key your browser makes for that run\)/)
  // Panel 5 is hidden until clicked, so the first use a visitor sees without clicking glosses both.
  const card = page.locator('#trust .notgrid article', { hasText: 'Not a compliance certification' })
  await expect(card).toContainText("The public demo's evidence is session-signed (signed with a key your browser makes for that run) and unpinned (no published key it must match), so it is not Origin-issued.")
})

test('pass 2 phase 2: the figures are static', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expect(stageFigure(page)).toBeVisible()
  for (const step of [1, 2, 3, 4, 5]) {
    await openPanel(page, step)
    await expect(page.locator(`#demo-panel-${step} .panelfig`)).toBeVisible()
    const still = await stillness(page)
    expect(still.count, `stage ${step}`).toBe(3)
    expect(still.animations, `stage ${step}`).toEqual([])
    expect(still.named, `stage ${step}`).toEqual([])
    expect(still.smil, `stage ${step}`).toBe(0)
  }
})

test('pass 2 phase 2: the figures read at 375 px, fit at 375 and 1280, and stack on narrow screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  for (const [width, height] of [[375, 812], [1280, 800]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    const stages = stageFigure(page).locator('.stagefig__stage')
    await expect(stages).toHaveCount(5)
    const boxes = await stages.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map(({ x, y }) => ({ x, y })))
    if (width === 1280) {
      // One row, left to right.
      for (let i = 1; i < 5; i += 1) {
        expect(Math.abs(boxes[i].y - boxes[0].y), `${width}px stage ${i + 1}`).toBeLessThanOrEqual(1)
        expect(boxes[i].x, `${width}px stage ${i + 1}`).toBeGreaterThan(boxes[i - 1].x)
      }
    } else {
      // One column, top to bottom.
      for (let i = 1; i < 5; i += 1) {
        expect(Math.abs(boxes[i].x - boxes[0].x), `${width}px stage ${i + 1}`).toBeLessThanOrEqual(1)
        expect(boxes[i].y, `${width}px stage ${i + 1}`).toBeGreaterThan(boxes[i - 1].y)
      }
    }
    for (const step of [1, 2, 3, 4, 5]) {
      await openPanel(page, step)
      const sizes = await renderedTextSizes(page.locator(FIGURES))
      expect(sizes.length, `${width}px stage ${step}`).toBeGreaterThan(20)
      if (width === 375) expect(sizes.filter((s) => s.px < 12), `${width}px stage ${step}`).toEqual([])
      const fit = await page.evaluate((selector) => ({
        page: document.documentElement.scrollWidth - innerWidth,
        outside: [...document.querySelectorAll(selector)].filter((el) => el.checkVisibility())
          .filter((el) => { const box = el.getBoundingClientRect(); return box.left < 0 || box.right > innerWidth }).length,
      }), FIGURES)
      expect(fit, `${width}px stage ${step}`).toEqual({ page: 0, outside: 0 })
    }
  }
})

for (const [width, height] of [[375, 812], [1280, 800]] as const) test(`pass 2 phase 2: the figures do not shift the layout at ${width}`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => {
    const shifts: number[] = []
    ;(window as unknown as { __shifts: number[] }).__shifts = shifts
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number, hadRecentInput: boolean })[]) if (!entry.hadRecentInput) shifts.push(entry.value)
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto('/#demo', { waitUntil: 'load' })
  await expect(stageFigure(page)).toBeInViewport()
  await page.waitForTimeout(1500)
  const total = await page.evaluate(() => (window as unknown as { __shifts: number[] }).__shifts.reduce((sum, value) => sum + value, 0))
  expect(total).toBeLessThanOrEqual(0.001)
})

// The enhanced walkthrough keeps one height across its five stages: every panel shares one grid
// cell and the inactive ones are visibility:hidden. So the Play/Prev/Next bar and the content
// under it never move while a visitor clicks through the stages or presses Play; during Play no
// input excuses a shift, so one would count toward CLS. Positions are layout boxes (offsets), so
// a hovered button's 1 px lift, a transform, is not mistaken for a move.
for (const [width, height] of [[375, 812], [1280, 800]] as const) test(`pass 2 phase 2: the walkthrough holds its height and its control bar through all five stages at ${width}`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  test.setTimeout(60_000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width, height })
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.locator('[data-demo]')).toHaveClass(/is-enhanced/)
  const play = page.locator('[data-demo-play]')
  await play.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const shifts: number[] = []
    ;(window as unknown as { __walk: number[] }).__walk = shifts
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number })[]) shifts.push(entry.value)
    }).observe({ type: 'layout-shift' })
  })
  const place = () => page.evaluate(() => {
    const box = (selector: string) => {
      const el = document.querySelector<HTMLElement>(selector)!
      let x = 0
      let y = 0
      for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) { x += node.offsetLeft; y += node.offsetTop }
      return { x, y, width: el.offsetWidth, height: el.offsetHeight }
    }
    return Object.fromEntries(['[data-demo]', '.demo__bar', '[data-demo-play]', '[data-demo-prev]', '[data-demo-next]', '#demo .demo-boundary'].map((s) => [s, box(s)]))
  })
  const start = await place()
  for (const step of [1, 2, 3, 4, 5]) {
    await page.locator(`#demo-tab-${step}`).click()
    await expect(page.locator(`#demo-panel-${step}`)).toBeVisible()
    // Only the shown panel is in the accessibility tree.
    await expect(page.getByRole('tabpanel')).toHaveCount(1)
    expect(await place(), `stage ${step}`).toEqual(start)
  }
  // The hidden panels are out of the tab order: Tab goes from the tab to its panel, then to Play.
  await page.locator('#demo-tab-1').click()
  await page.keyboard.press('Tab')
  await expect(page.locator('#demo-panel-1')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(play).toBeFocused()
  await expect(play).toHaveAccessibleName(/^▶ Play$/)
  await play.click()
  await expect(play).toHaveAttribute('aria-pressed', 'true')
  await expect(play).toHaveAccessibleName(/ Pause$/)
  for (const step of [2, 3, 4, 5]) {
    await expect(page.locator(`#demo-tab-${step}`)).toHaveAttribute('aria-selected', 'true', { timeout: 4000 })
    expect(await place(), `playing, stage ${step}`).toEqual(start)
  }
  await expect(play).toHaveAttribute('aria-pressed', 'false', { timeout: 4000 })
  await expect(play).toHaveAccessibleName(/^▶ Play$/)
  expect(await place(), 'after Play stops').toEqual(start)
  // No layout shift at all, with or without recent input.
  expect(await page.evaluate(() => (window as unknown as { __walk: number[] }).__walk)).toEqual([])
})

test('pass 2 phase 2: without JavaScript every panel shows its schematic', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  await context.route('**/*', (route) => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/`)
    await expect(stageFigure(page)).toBeVisible()
    for (const name of PANEL_FIGURES) await expect(page.getByRole('figure', { name, exact: true })).toBeVisible()
    await expect(page.locator('#demo .demo-boundary')).toBeVisible()
  } finally {
    await context.close()
  }
})
