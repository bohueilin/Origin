import { test, expect, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Pass 2 Phase 2 — /reference-check and /brief figures
// /reference-check opens with a compact copy of the home five-stage figure, placed in the hero
// before the tool. Below the shot04 recording and its dated line, a static section compares
// the permissive baseline with the least-privilege preset on the synthetic support battery and
// reads one row of the result in full. /brief's five-step strip becomes the same five-stage
// figure and still prints on one page. Both pages gloss "session-signed" and "unpinned" on
// first use. Every number, id, decision and field name in the figures is checked against the
// code that grades and builds the record (@origin/verifier-core, src/certify/policySpec,
// src/reference-check). The figures are static: no animation, no SMIL, no layout shift,
// rendered text at least 12 px at 375 px and no sideways scroll at 375 or 1280.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const STAGES = [['01', 'Bind'], ['02', 'Challenge'], ['03', 'Grade'], ['04', 'Attest'], ['05', 'Reverify']] as const
const STAGE_FIGURE = 'The reference check in five stages'
const STAGE_DESC = 'What each stage does and the record fields involved. The requests are synthetic; your agent is not run.'
const COMPARE_FIGURE = 'Permissive baseline vs. least-privilege preset, synthetic battery'
const ROW_FIGURE = 'One row of the result, annotated'
const RC_FIGURES = '#rc-stagefig, #rcx-compare, #rcx-row'
const BRIEF_FIGURES = '.brief__flow'
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim()

const figure = (page: Page, name: string) => page.getByRole('figure', { name, exact: true })

type Verdict = 'match' | 'miss (stricter)' | 'miss (looser)' | 'over-grant'

// Grades the support battery with a preset the way /reference-check does (ReferenceCheckPage
// run(): verifySupportDecision for passed/catastrophic, missDirection for the miss direction).
async function gradeSupport(preset: 'permissive' | 'least-privilege') {
  const { supportTasks, supportOracle, verifySupportDecision, supportPolicyFromParameters } = await import('@origin/verifier-core/supportGym')
  const { missDirection } = await import('@origin/verifier-core/missDirection')
  const { buildPolicyEvaluation } = await import('@origin/verifier-core/policyEvaluation')
  const { SUPPORT_PRESETS } = await import('../../src/certify/policySpec')
  const { label, spec } = SUPPORT_PRESETS[preset]
  const policyFor = supportPolicyFromParameters(spec)
  const rows = supportTasks.map((task) => {
    const yours = policyFor(task)
    const oracle = supportOracle(task)
    const { passed, catastrophic } = verifySupportDecision(task, yours)
    const verdict: Verdict = catastrophic ? 'over-grant' : passed ? 'match' : missDirection(yours, oracle.decision) === 'stricter' ? 'miss (stricter)' : 'miss (looser)'
    return { task, yours, oracle: oracle.decision, reason: oracle.reason, verdict }
  })
  return { label, spec, rows, summary: buildPolicyEvaluation({ scenario: 'support', parameters: spec }).summary }
}

// The record a /reference-check run builds, to check that every field name in a figure exists.
async function sampleRecord() {
  const { supportTasks, supportOracle, verifySupportDecision, supportPolicyFromParameters, supportEnvDigest, SUPPORT_VERSIONS } = await import('@origin/verifier-core/supportGym')
  const { SUPPORT_PRESETS } = await import('../../src/certify/policySpec')
  const { buildSyntheticReferenceCheckEvidence } = await import('../../src/reference-check/evidence')
  const parameters = SUPPORT_PRESETS['least-privilege'].spec
  const policyFor = supportPolicyFromParameters(parameters)
  const rows = supportTasks.map((task) => {
    const yours = policyFor(task)
    const verdict = verifySupportDecision(task, yours)
    return { id: task.id, yours, oracle: supportOracle(task).decision, passed: verdict.passed, catastrophic: verdict.catastrophic }
  })
  return buildSyntheticReferenceCheckEvidence({
    evidenceId: 'figure-check', issuedAt: '2026-11-14T00:00:00.000Z', maxAgeMs: 30 * 24 * 60 * 60 * 1000, scenario: 'support',
    declaredConfig: { model: 'm', tools: ['t'], context: 'c', harness: 'h' }, selectedPolicy: parameters, battery: supportTasks, rows,
    environmentDigest: supportEnvDigest(), evaluatorVersion: SUPPORT_VERSIONS.reward_model_version, verifierVersion: SUPPORT_VERSIONS.verifier_version,
  }) as unknown as Record<string, unknown>
}

const field = (record: Record<string, unknown>, path: string) =>
  path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], record)

// What a figure's stages say: number, name, note, field codes and key lines.
async function stageContent(scope: Locator, stage: string, name: string, note: string) {
  return scope.locator(stage).evaluateAll((els, [n, nm, nt]) => els.map((el) => ({
    node: el.querySelector(n)?.textContent?.trim() ?? '',
    name: el.querySelector(nm)?.textContent?.trim() ?? '',
    note: el.querySelector(nt)?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    codes: [...el.querySelectorAll('code')].map((c) => c.textContent?.trim() ?? ''),
    keys: [...el.querySelectorAll('ul li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
  })), [stage === '.stagefig__stage' ? '.stagefig__node' : ':scope > span', name, note])
}

// Rendered size of every visible text node: computed font-size, scaled for any SVG text.
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

async function stillness(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((roots) => {
    const nodes = roots.flatMap((root) => [root, ...root.querySelectorAll('*')])
    return {
      count: roots.filter((root) => root.checkVisibility()).length,
      animations: roots.flatMap((root) => root.getAnimations({ subtree: true }).map((a) => a.constructor.name)),
      named: nodes.filter((el) => getComputedStyle(el).animationName !== 'none').map((el) => el.tagName),
      transitions: nodes.filter((el) => getComputedStyle(el).transitionDuration.split(',').some((d) => parseFloat(d) > 0)).map((el) => el.tagName),
      smil: nodes.filter((el) => ['animate', 'animateTransform', 'animateMotion', 'set'].includes(el.localName)).length,
    }
  })
}

test('pass 2 phase 2: /reference-check opens with the five-stage figure, before the tool', async ({ page }) => {
  await page.goto('/reference-check')
  const fig = figure(page, STAGE_FIGURE)
  await expect(fig).toHaveCount(1)
  await expect(fig).toBeVisible()
  await expect(fig.locator('#rc-stagefig-desc')).toHaveText(STAGE_DESC)

  // In the hero, after the scope note, and before the tool and its four-step strip.
  expect(await fig.evaluate((el) => ({
    inHero: Boolean(el.closest('section.product-hero')),
    afterScope: el.previousElementSibling?.matches('.product-hero__scope') ?? false,
    beforeTool: Boolean(el.compareDocumentPosition(document.querySelector('#refcheck-root')!) & Node.DOCUMENT_POSITION_FOLLOWING),
  }))).toEqual({ inHero: true, afterScope: true, beforeTool: true })
  await expect(page.locator('#refcheck-root .workspace-steps > li')).toHaveCount(4)
  await expect(fig.locator('.stagefig__bridge')).toHaveText('The tool below runs stages 01 to 04 in your browser; /verify runs stage 05.')

  const stages = fig.locator('.stagefig__stage')
  await expect(stages).toHaveCount(5)
  await expect(fig.locator('.stagefig__node')).toHaveText(STAGES.map(([n]) => n))
  await expect(fig.locator('.stagefig__name')).toHaveText(STAGES.map(([, name]) => name))
  await expect(fig.locator('svg.stagefig__head')).toHaveCount(4)
  for (const svg of await fig.locator('svg').all()) await expect(svg).toHaveAttribute('aria-hidden', 'true')

  // The same stages, names and annotations as the home figure.
  const here = await stageContent(fig, '.stagefig__stage', '.stagefig__name', '.stagefig__note')
  await page.goto('/')
  const home = await stageContent(figure(page, STAGE_FIGURE), '.stagefig__stage', '.stagefig__name', '.stagefig__note')
  expect(here).toEqual(home)

  // Every label is the code's own.
  const record = await sampleRecord()
  const { supportTasks } = await import('@origin/verifier-core/supportGym')
  const { iamTasks } = await import('@origin/verifier-core/iamGym')
  const { ACTION_RUN_SCHEMA_VERSION } = await import('@origin/evidence/action-run-evidence')
  expect(supportTasks.length).toBe(12)
  expect(iamTasks.length).toBe(12)
  expect(record.schema_version).toBe(ACTION_RUN_SCHEMA_VERSION)
  expect(here[1].note).toContain(`${supportTasks.length} fixed synthetic requests`)
  expect(here[3].note).toContain(`Record format ${ACTION_RUN_SCHEMA_VERSION}`)
  for (const code of here.flatMap((stage) => stage.codes)) {
    const [path] = code.split(' ')
    expect(path in record || field(record, path) !== undefined, code).toBe(true)
  }
})

test('pass 2 phase 2: the preset contrast on /reference-check is what the oracle returns', async ({ page }) => {
  await page.goto('/reference-check')
  const fig = figure(page, COMPARE_FIGURE)
  await expect(fig).toBeVisible()
  await expect(fig.locator('#rcx-compare-desc')).toHaveText('The same 12 synthetic support requests, graded by the oracle. Each square is one request, sup-01 to sup-12.')

  // Below the shot04 recording: its dated line stays the recording figure's next sibling, and
  // the new section follows the recording's section.
  await expect(page.locator('.vband > .shell > figure.vband__fig + p.vband__note')).toHaveCount(1)
  expect(await page.locator('section.rcx').evaluate((el) => el.previousElementSibling?.matches('section.vband') ?? false)).toBe(true)
  await expect(page.locator('section.rcx h2')).toHaveText('How to read a result')

  const reasonLabel: Record<string, string> = {
    'destructive / bulk action — never auto-executed': 'destructive or bulk action',
    'discloses personal data — refuse': 'discloses personal data',
    'fraud-flagged account — human review': 'fraud-flagged account',
    'high-risk change — requires human approval': 'bank change needing approval',
  }
  const presetSource = source('../../src/reference-check/ReferenceCheckPage.tsx')
  for (const [preset, card] of [['permissive', '.rcx-card--perm'], ['least-privilege', '.rcx-card--lp']] as const) {
    const graded = await gradeSupport(preset)
    const cardLoc = fig.locator(card)
    const matched = graded.rows.filter((r) => r.verdict === 'match').length
    const over = graded.rows.filter((r) => r.verdict === 'over-grant')
    const misses = graded.rows.filter((r) => r.verdict.startsWith('miss'))
    // The run summary /verify replays agrees with the row-by-row grading.
    expect(graded.summary).toEqual({ matched, total: graded.rows.length, over_grants: over.length, misses: misses.length })

    await expect(cardLoc.locator('h3')).toHaveText(graded.label)
    await expect(cardLoc.locator('.rcx-stats dd')).toHaveText([`${matched} of ${graded.rows.length}`, `${over.length}`, `${misses.length}`])
    // One square per request, in battery order, marked with its verdict.
    const squares = cardLoc.locator('.rcx-grid > li')
    await expect(squares).toHaveCount(graded.rows.length)
    const shown = await squares.evaluateAll((els) => els.map((li) => ({ n: li.querySelector('span')?.textContent ?? '', cls: li.className })))
    expect(shown).toEqual(graded.rows.map((r) => ({
      n: r.task.id.replace('sup-', ''),
      cls: r.verdict === 'over-grant' ? 'is-over' : r.verdict === 'match' ? '' : 'is-miss',
    })))

    if (preset === 'permissive') {
      // The owner's draft numbers, as the oracle returns them: 4 of 12, 6 over-grants, 2 looser misses.
      expect([matched, over.length, misses.length]).toEqual([4, 6, 2])
      expect(misses.every((r) => r.verdict === 'miss (looser)')).toBe(true)
      await expect(cardLoc.locator('.rcx-stats dt').nth(2)).toHaveText('misses, both looser')
      expect(graded.rows.every((r) => r.yours === 'allow')).toBe(true)
      expect(presetSource).toContain("permissive: 'All safeguards off.")
      await expect(cardLoc.locator('.rcx-card__set')).toHaveText('All safeguards off, so it allows every request.')
      // Over-grants grouped by the reason the oracle returns for each request.
      const groups = new Map<string, string[]>()
      for (const r of over) groups.set(reasonLabel[r.reason], [...(groups.get(reasonLabel[r.reason]) ?? []), r.task.id])
      const cats = await cardLoc.locator('.rcx-cats li').evaluateAll((els) => els.map((li) => ({
        label: li.querySelector('span')?.textContent ?? '',
        ids: (li.querySelector('code')?.textContent ?? '').split('·').map((s) => s.trim()),
      })))
      expect(new Map(cats.map((c) => [c.label, [...c.ids].sort()]))).toEqual(new Map([...groups].map(([k, v]) => [k, [...v].sort()])))
      const missIds = misses.map((r) => r.task.id)
      await expect(cardLoc.locator('.rcx-card__note code')).toHaveText(missIds)
      const { ORACLE_REFUND_CAP } = await import('@origin/verifier-core/supportGym')
      expect(misses.every((r) => (r.task.amount ?? 0) > ORACLE_REFUND_CAP)).toBe(true)
      await expect(cardLoc.locator('.rcx-card__note')).toContainText(`over the $${ORACLE_REFUND_CAP} refund cap`)
    } else {
      expect([matched, over.length, misses.length]).toEqual([12, 0, 0])
      // "Its settings apply the oracle's own rules": the preset decides every request as the oracle does.
      expect(graded.rows.every((r) => r.yours === r.oracle)).toBe(true)
      await expect(cardLoc.locator('.rcx-card__set')).toHaveText('A $100 refund cap; personal data and destructive actions refused; fraud flags and bank changes escalated.')
      expect(presetSource).toContain(`'least-privilege': '${squash(await cardLoc.locator('.rcx-card__set').textContent())}'`)
      expect(graded.spec.refundCap).toBe(100)
    }
  }

  const { SUPPORT_VERSIONS, SUPPORT_GYM_VERSION } = await import('@origin/verifier-core/supportGym')
  await expect(fig.locator('.rcx-fig__note code')).toHaveText([SUPPORT_VERSIONS.verifier_version, SUPPORT_GYM_VERSION])
})

test('pass 2 phase 2: the annotated row is sup-02 under the permissive baseline, in the result table\'s words', async ({ page }) => {
  await page.goto('/reference-check')
  const fig = figure(page, ROW_FIGURE)
  await expect(fig).toBeVisible()
  await expect(fig.locator('#rcx-row-desc')).toHaveText('Request sup-02 from the same synthetic battery, graded under the permissive baseline.')

  const permissive = await gradeSupport('permissive')
  const leastPrivilege = await gradeSupport('least-privilege')
  const row = permissive.rows.find((r) => r.task.id === 'sup-02')!
  expect(row.verdict).toBe('miss (looser)')
  expect([row.task.pii, row.task.forbidden, row.task.tainted, row.task.requires_approval]).toEqual([false, false, false, false])
  expect(leastPrivilege.rows.find((r) => r.task.id === 'sup-02')!.verdict).toBe('match')

  // The result table's column names, the request's own label and attribute, both decisions
  // and the verdict, with the table's own mark.
  await expect(fig.locator('.rcx-anat__lbl')).toHaveText(['Proposed action', 'Selected policy', 'Oracle', 'Verdict'])
  const values = fig.locator('.rcx-anat__val')
  await expect(values.nth(0).locator('b')).toHaveText(row.task.action)
  await expect(values.nth(0).locator('code')).toHaveText(`${row.task.id} · $${row.task.amount}`)
  await expect(values.nth(1)).toHaveText(row.yours)
  await expect(values.nth(2)).toHaveText(row.oracle)
  await expect(values.nth(3)).toHaveText(`△${row.verdict}`)
  await expect(fig.locator('.rcx-anat__n')).toHaveText(['1', '2', '3', '4'])
  await expect(fig.locator('.rcx-anat__note').nth(3)).toContainText('Least-privilege escalates it: a match.')
  for (const head of ['Proposed action', 'Selected policy', 'Oracle', 'Verdict']) expect(source('../../src/reference-check/ReferenceCheckPage.tsx')).toContain(`<th scope="col">${head}</th>`)

  // The key uses the verdict words and marks of the result table (over-grant's ⛔ is drawn in ink).
  const table = source('../../src/reference-check/ReferenceCheckPage.tsx')
  for (const word of ["'✓ match'", "'△ miss (stricter)'", "'△ miss (looser)'", "'⛔ over-grant'"]) expect(table).toContain(word)
  await expect(fig.locator('.rcx-key dt')).toHaveText(['✓match', '△miss (stricter)', '△miss (looser)', 'over-grant'])
  await expect(fig.locator('.rcx-key dt').nth(3).locator('svg')).toHaveCount(1)
  await expect(fig.locator('.rcx-key dd').nth(1)).toHaveText('The policy answers more strictly than the oracle (allow, then escalate, then deny).')
  await expect(fig.locator('.rcx-key dd').nth(3)).toHaveText('An allow on a security-critical request that the oracle denies or escalates. Counted separately from misses; matches do not offset it.')
  const { missDirection } = await import('@origin/verifier-core/missDirection')
  expect([missDirection('escalate', 'allow'), missDirection('deny', 'escalate'), missDirection('allow', 'escalate')]).toEqual(['stricter', 'stricter', 'looser'])
})

test('pass 2 phase 2: /reference-check and /brief gloss session-signed and unpinned on first use', async ({ page }) => {
  await page.goto('/reference-check')
  await expect(page.getByRole('button', { name: 'Run the reference check', exact: true })).toBeVisible()
  const rc = squash(await page.locator('main').textContent())
  expect(rc.slice(rc.indexOf('session-signed'))).toMatch(/^session-signed \(signed with a key your browser makes for that run\)/)
  expect(rc.slice(rc.indexOf('unpinned'))).toMatch(/^unpinned \(no published key it must match\)/)
  await expect(page.locator('.product-hero__scope')).toContainText('The download is session-signed (signed with a key your browser makes for that run), so an edit made without re-signing shows as VOID; it is unpinned (no published key it must match), and therefore UNTRUSTED by default.')

  await page.goto('/brief')
  const brief = squash(await page.locator('main').textContent())
  // The pinned phrase stays whole (editorial.spec.ts); the gloss follows it.
  const glossed = 'session-signed, and unpinned (signed with a key your browser makes for that run, with no published key it must match)'
  expect(brief.indexOf(glossed)).toBeGreaterThan(-1)
  expect(brief.indexOf(glossed)).toBe(brief.indexOf('session-signed'))
  expect(brief.indexOf(glossed) + 'session-signed, and '.length).toBe(brief.indexOf('unpinned'))
})

test('pass 2 phase 2: /brief carries the five-stage figure and still prints on one page', async ({ page }, testInfo) => {
  await page.goto('/brief')
  const fig = figure(page, STAGE_FIGURE)
  await expect(fig).toHaveCount(1)
  await expect(fig).toBeVisible()
  await expect(fig.locator('#brief-stages-desc')).toHaveText(STAGE_DESC)
  await expect(fig.locator('.brief__step')).toHaveCount(5)
  await expect(fig.locator('.brief__step h2')).toHaveText(STAGES.map(([, name]) => name))
  await expect(fig.locator('svg.brief-stages__head')).toHaveCount(4)
  for (const svg of await fig.locator('svg').all()) await expect(svg).toHaveAttribute('aria-hidden', 'true')
  const here = await stageContent(fig, '.brief__step', 'h2', 'p')
  expect(here.map((s) => s.node)).toEqual(STAGES.map(([n]) => n))
  await page.goto('/')
  const home = await stageContent(figure(page, STAGE_FIGURE), '.stagefig__stage', '.stagefig__name', '.stagefig__note')
  expect(here.map(({ name, note, codes, keys }) => ({ name, note, codes, keys }))).toEqual(home.map(({ name, note, codes, keys }) => ({ name, note, codes, keys })))

  await page.goto('/brief')
  await page.emulateMedia({ media: 'print' })
  await expect(fig).toBeVisible()
  for (const el of await fig.locator('h2, p, li, code').all()) await expect(el).toBeVisible()
  // In print the figure keeps the brief's 9 px floor (editorial.css prints steps and boundary at 9 px).
  const printed = await renderedTextSizes(fig)
  expect(printed.length).toBeGreaterThan(20)
  expect(printed.filter((s) => s.px < 9)).toEqual([])
  if (testInfo.project.name === 'desktop-chromium') {
    for (const options of [{ preferCSSPageSize: true }, { format: 'Letter' }, { format: 'A4' }]) {
      const pdf = await page.pdf({ ...options, printBackground: true })
      expect(pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? [], JSON.stringify(options)).toHaveLength(1)
    }
  }
})

test('pass 2 phase 2: the /reference-check and /brief figures are static', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const [route, selector, count] of [['/reference-check', RC_FIGURES, 3], ['/brief', BRIEF_FIGURES, 1]] as const) {
    await page.goto(route)
    await expect(page.locator(selector).first()).toBeVisible()
    const still = await stillness(page, selector)
    expect(still, route).toEqual({ count, animations: [], named: [], transitions: [], smil: 0 })
  }
})

test('pass 2 phase 2: the figures read at 375 px, fit at 375 and 1280, and stack on narrow screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  for (const [width, height] of [[375, 812], [1280, 800]] as const) {
    await page.setViewportSize({ width, height })
    for (const [route, selector] of [['/reference-check', RC_FIGURES], ['/brief', BRIEF_FIGURES]] as const) {
      await page.goto(route)
      const sizes = await renderedTextSizes(page.locator(selector))
      expect(sizes.length, `${route} ${width}px`).toBeGreaterThan(30)
      if (width === 375) expect(sizes.filter((s) => s.px < 12), `${route} ${width}px`).toEqual([])
      const fit = await page.evaluate((sel) => ({
        page: document.documentElement.scrollWidth - innerWidth,
        outside: [...document.querySelectorAll(sel)].flatMap((root) => [root, ...root.querySelectorAll('*')])
          .filter((el) => el.checkVisibility())
          .filter((el) => { const box = el.getBoundingClientRect(); return box.width > 0 && (box.left < -0.5 || box.right > innerWidth + 0.5) }).length,
      }), selector)
      expect(fit, `${route} ${width}px`).toEqual({ page: 0, outside: 0 })
    }

    // Rows at 1280, one column at 375.
    const tops = async (route: string, items: string) => {
      await page.goto(route)
      return page.locator(items).evaluateAll((els) => els.map((el) => { const { x, y } = el.getBoundingClientRect(); return { x: Math.round(x), y: Math.round(y) } }))
    }
    for (const [route, items, n] of [
      ['/reference-check', '#rc-stagefig .stagefig__stage', 5],
      ['/reference-check', '#rcx-compare .rcx-card', 2],
      ['/reference-check', '#rcx-row .rcx-anat__val', 4],
      ['/brief', '.brief__flow .brief__step', 5],
    ] as const) {
      const boxes = await tops(route, items)
      expect(boxes, `${items} ${width}px`).toHaveLength(n)
      for (let i = 1; i < n; i += 1) {
        if (width === 1280) {
          expect(Math.abs(boxes[i].y - boxes[0].y), `${items} ${width}px #${i + 1}`).toBeLessThanOrEqual(1)
          expect(boxes[i].x, `${items} ${width}px #${i + 1}`).toBeGreaterThan(boxes[i - 1].x)
        } else {
          expect(Math.abs(boxes[i].x - boxes[0].x), `${items} ${width}px #${i + 1}`).toBeLessThanOrEqual(1)
          expect(boxes[i].y, `${items} ${width}px #${i + 1}`).toBeGreaterThan(boxes[i - 1].y)
        }
      }
    }
  }
})

for (const [width, height] of [[375, 812], [1280, 800]] as const) test(`pass 2 phase 2: the /reference-check and /brief figures do not shift the layout at ${width}`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => {
    const w = window as unknown as { __shifts: number[], __heights: number[] }
    w.__shifts = []
    w.__heights = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number, hadRecentInput: boolean })[]) if (!entry.hadRecentInput) w.__shifts.push(entry.value)
    }).observe({ type: 'layout-shift', buffered: true })
    document.addEventListener('DOMContentLoaded', () => {
      w.__heights = [...document.querySelectorAll('#rc-stagefig, #rcx-compare, #rcx-row, .brief__flow')].map((el) => el.getBoundingClientRect().height)
    })
  })
  // Landing on the hero figure, then on /brief. The section below the recording is then
  // scrolled into view after the tool has mounted: nothing in it moves either.
  for (const [route, figureSelector] of [['/reference-check#rc-stagefig', '#rc-stagefig'], ['/brief', '.brief__flow']] as const) {
    await page.goto(route, { waitUntil: 'load' })
    if (route.includes('#')) await expect(page.locator(figureSelector)).toBeInViewport()
    else await expect(page.locator(figureSelector)).toBeVisible()
    await page.waitForTimeout(1500)
    if (route.startsWith('/reference-check')) {
      for (const id of ['#rcx-compare', '#rcx-row']) {
        await page.locator(id).scrollIntoViewIfNeeded()
        await expect(page.locator(id)).toBeInViewport()
        await page.waitForTimeout(400)
      }
    }
    const { total, before, after } = await page.evaluate(() => {
      const w = window as unknown as { __shifts: number[], __heights: number[] }
      return {
        total: w.__shifts.reduce((sum, value) => sum + value, 0),
        before: w.__heights.map(Math.round),
        after: [...document.querySelectorAll('#rc-stagefig, #rcx-compare, #rcx-row, .brief__flow')].map((el) => Math.round(el.getBoundingClientRect().height)),
      }
    })
    expect(total, route).toBeLessThanOrEqual(0.001)
    // Each figure has its final size from the first parse: nothing in it loads or resizes later.
    expect(after.length, route).toBe(route.startsWith('/brief') ? 1 : 3)
    expect(after, route).toEqual(before)
  }
})

test('pass 2 phase 2: without JavaScript the /reference-check figures show', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } })
  await context.route('**/*', (route) => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/reference-check`)
    for (const name of [STAGE_FIGURE, COMPARE_FIGURE, ROW_FIGURE]) await expect(figure(page, name)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  } finally {
    await context.close()
  }
})
