import { test, expect, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Release 6 Phase 2 — tool heroes: /reference-check and /verify
// From 960 px each tool hero is a two-column poster: the copy (kicker, H1, lede, scope note) on
// the left and a static specimen card on the right; phones keep one column, with the specimen
// right after the copy. On /reference-check the specimen is request sup-02 graded under the
// Permissive preset on the support battery (allow against the oracle's escalate, a looser miss)
// and what proposal.input_digest binds; the five-stage figure stays in the hero, next to the
// scope note in the markup, and spans both columns below. On /verify the specimen is the report
// on the page's own synthetic 1.1.0 example (4 of 12, 6 over-grants, 2 misses) and its two
// ratings. Before anything is verified, the /verify result card previews what a report holds,
// by label only, and the real report replaces it. Every number, id, decision and field is
// checked against the code that grades, builds and verifies the record. Nothing moves: no
// animation, no layout shift, no sideways scroll, text at 12 px or more at 375 px.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const RC_SPEC = 'One request, graded'
const VFY_SPEC = 'What a report shows'
const PREVIEW = 'Preview · labels only · nothing checked yet'
const SIZES = [[1919, 998], [1280, 720], [375, 812]] as const
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim()
const specimen = (page: Page, name: string) => page.getByRole('figure', { name, exact: true })
const verifyButton = (page: Page) => page.getByRole('button', { name: 'Verify', exact: true })
const verdict = (page: Page) => page.getByRole('status').locator('.vfy-verdict')

// The hero's parts, in page coordinates.
const heroBoxes = (page: Page) => page.evaluate(() => {
  const box = (selector: string) => {
    const el = document.querySelector(selector)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { left: b.left, right: b.right, top: b.top + scrollY, bottom: b.bottom + scrollY, width: b.width }
  }
  return {
    hero: box('.product-hero')!, kicker: box('.product-hero .kicker')!, h1: box('.product-hero h1')!,
    scope: box('.product-hero__scope')!, spec: box('.product-hero .hero-spec'), stages: box('.product-hero .stagefig'),
    overflow: document.documentElement.scrollWidth - innerWidth,
  }
})

// Every rendered text node under the root, with its computed font size.
const textSizes = (root: Locator) => root.evaluate((el) => {
  const sizes: Array<{ text: string; px: number }> = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim()
    if (text && node.parentElement!.checkVisibility()) sizes.push({ text: text.slice(0, 40), px: parseFloat(getComputedStyle(node.parentElement!).fontSize) })
  }
  return sizes
})

// Static: no running animation, no animation name, no transition and no SMIL inside the root.
const stillness = (root: Locator) => root.evaluate((el) => {
  const nodes = [el, ...el.querySelectorAll('*')]
  return {
    animations: el.getAnimations({ subtree: true }).length,
    named: nodes.filter((node) => getComputedStyle(node).animationName !== 'none').length,
    transitions: nodes.filter((node) => getComputedStyle(node).transitionDuration.split(',').some((d) => parseFloat(d) > 0)).length,
    smil: el.querySelectorAll('animate, animateMotion, animateTransform, set').length,
  }
})

test('release 6 phase 2: both tool heroes are two columns from 960 px, the specimen on the right, and one column on phones', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height })
    for (const [route, name] of [['/reference-check', RC_SPEC], ['/verify', VFY_SPEC]] as const) {
      const at = `${route} ${width}px`
      await page.goto(route)
      await expect(specimen(page, name), at).toBeVisible()
      const { hero, kicker, h1, scope, spec, stages, overflow } = await heroBoxes(page)
      expect(overflow, at).toBeLessThanOrEqual(0)
      expect(spec, at).not.toBeNull()
      const card = spec!
      // Inside the hero at every width.
      expect(card.top, at).toBeGreaterThanOrEqual(hero.top)
      expect(card.bottom, at).toBeLessThanOrEqual(hero.bottom)
      if (width >= 960) {
        // Right of the H1 and the scope note, level with the top of the copy, about 45% of the row.
        expect(card.left, at).toBeGreaterThan(h1.right)
        expect(card.left, at).toBeGreaterThan(scope.right)
        expect(card.top, at).toBeLessThanOrEqual(h1.top)
        const share = card.width / (card.right - kicker.left)
        expect(share, at).toBeGreaterThan(0.38)
        expect(share, at).toBeLessThan(0.5)
        if (route === '/reference-check') {
          // The five-stage figure spans both columns, under the copy and the specimen.
          expect(stages, at).not.toBeNull()
          expect(stages!.top, at).toBeGreaterThanOrEqual(Math.max(card.bottom, scope.bottom))
          expect(Math.abs(stages!.left - kicker.left), at).toBeLessThanOrEqual(1)
          expect(Math.abs(stages!.right - card.right), at).toBeLessThanOrEqual(1)
        }
      } else {
        // One column: the specimen sits under the copy, at the copy's left edge, inside the gutter.
        expect(Math.abs(card.left - h1.left), at).toBeLessThanOrEqual(1)
        expect(card.top, at).toBeGreaterThan(scope.bottom)
        expect(card.right, at).toBeLessThanOrEqual(width - 16)
        // On /reference-check it comes right after the copy, before the five-stage figure.
        if (route === '/reference-check') expect(card.bottom, at).toBeLessThanOrEqual(stages!.top)
      }
    }
  }

  // In the markup the five-stage figure stays the scope note's next sibling (pass 2 pin), and the
  // specimen follows it, last in the hero.
  await page.goto('/reference-check')
  expect(await page.locator('#rc-stagefig').evaluate((el) => el.previousElementSibling?.matches('.product-hero__scope') ?? false)).toBe(true)
  expect(await page.locator('#rc-spec').evaluate((el) => el.matches('.product-hero > .shell > :last-child'))).toBe(true)
})

test('release 6 phase 2: the /reference-check specimen is sup-02 under the Permissive preset, as the oracle grades it', async ({ page }) => {
  const { supportTasks, supportOracle, supportPolicyFromParameters, verifySupportDecision, supportEnvDigest, SUPPORT_VERSIONS, ORACLE_REFUND_CAP } = await import('@origin/verifier-core/supportGym')
  const { missDirection } = await import('@origin/verifier-core/missDirection')
  const { SUPPORT_PRESETS } = await import('../../src/certify/policySpec')
  const permissive = SUPPORT_PRESETS.permissive
  const task = supportTasks.find((t) => t.id === 'sup-02')!
  const yours = supportPolicyFromParameters(permissive.spec)(task)
  const oracle = supportOracle(task)
  const graded = verifySupportDecision(task, yours)
  // The lead's facts, from the code: the oracle's cap is $100 and Permissive turns every guard off.
  expect(ORACLE_REFUND_CAP).toBe(100)
  expect(task.amount).toBe(450)
  expect(permissive.label.startsWith('Permissive')).toBe(true)
  expect(permissive.spec).toMatchObject({ denyPii: false, denyForbidden: false, denyTainted: false, requireApprovalHigh: false })
  expect(permissive.spec.refundCap).toBeGreaterThan(task.amount!)
  expect([yours, oracle.decision, graded.passed, graded.catastrophic, missDirection(yours, oracle.decision)]).toEqual(['allow', 'escalate', false, false, 'looser'])

  await page.goto('/reference-check')
  const spec = specimen(page, RC_SPEC)
  await expect(spec).toBeVisible()
  await expect(spec.locator('.hero-spec__tag')).toHaveText('Specimen · synthetic support battery')
  await expect(spec.locator('#rc-spec-desc')).toHaveText('Run the Permissive preset below with the customer-support agent and the result table shows this row.')
  await expect(spec.locator('.hero-spec__req .hero-spec__lbl')).toHaveText('Proposed action')
  await expect(spec.locator('.hero-spec__req b')).toHaveText(task.action)
  await expect(spec.locator('.hero-spec__req code')).toHaveText(`${task.id} · $${task.amount}`)
  await expect(spec.locator('.hero-spec__diff dt')).toHaveText(['Selected policy', 'Oracle'])
  await expect(spec.locator('.hero-spec__diff dd code')).toHaveText([yours, oracle.decision])
  await expect(spec.locator('.hero-spec__diff .hero-spec__why')).toHaveText(['Permissive: all safeguards off', oracle.reason])
  expect(oracle.reason).toBe(`over the $${ORACLE_REFUND_CAP} refund cap — needs approval`)
  // The verdict in the result table's own words and mark.
  await expect(spec.locator('.hero-spec__verdict > b')).toHaveText('△miss (looser)')
  expect(source('../../src/reference-check/ReferenceCheckPage.tsx')).toContain("'△ miss (looser)'")
  await expect(spec.locator('.hero-spec__verdict .hero-spec__why')).toHaveText(`${yours} is less strict than ${oracle.decision}`)
  for (const svg of await spec.locator('svg').all()) await expect(svg).toHaveAttribute('aria-hidden', 'true')
  await expect(spec.locator('a, button, input, select, textarea, [tabindex]')).toHaveCount(0)

  // The chip names what proposal.input_digest covers (src/reference-check/evidence.ts): the four
  // typed fields, the policy, the battery's request ids and digest, the scenario and two versions.
  await expect(spec.locator('.hero-spec__chip code')).toHaveText('proposal.input_digest')
  expect(squash(await spec.locator('.hero-spec__chip').textContent())).toBe('proposal.input_digest binds model, tools, context, harness, policy and battery, with the scenario and versions')
  const { buildSyntheticReferenceCheckEvidence } = await import('../../src/reference-check/evidence')
  const { canonical, sha256 } = await import('@origin/evidence/env-evidence')
  const policyFor = supportPolicyFromParameters(permissive.spec)
  const base = {
    evidenceId: 'hero-spec', issuedAt: '2026-11-14T00:00:00.000Z', maxAgeMs: 30 * 24 * 60 * 60 * 1000, scenario: 'support' as const,
    declaredConfig: { model: 'm', tools: ['t'], context: 'c', harness: 'h' }, selectedPolicy: permissive.spec, battery: supportTasks,
    rows: supportTasks.map((t) => { const d = policyFor(t); const v = verifySupportDecision(t, d); return { id: t.id, yours: d, oracle: supportOracle(t).decision, passed: v.passed, catastrophic: v.catastrophic } }),
    environmentDigest: supportEnvDigest(), evaluatorVersion: SUPPORT_VERSIONS.reward_model_version, verifierVersion: SUPPORT_VERSIONS.verifier_version,
  }
  const inputDigest = (over: Partial<typeof base>) => (buildSyntheticReferenceCheckEvidence({ ...base, ...over }) as unknown as { proposal: { input_digest: string } }).proposal.input_digest
  expect(inputDigest({})).toBe(sha256(canonical({
    scenario: base.scenario, declared_config: base.declaredConfig, selected_policy: base.selectedPolicy,
    ordered_battery_ids: supportTasks.map((t) => t.id), environment_digest: base.environmentDigest,
    evaluator_version: base.evaluatorVersion, verifier_version: base.verifierVersion,
  })))
  expect(Object.keys(base.declaredConfig)).toEqual(['model', 'tools', 'context', 'harness'])
  for (const over of [
    { declaredConfig: { ...base.declaredConfig, model: 'm2' } }, { declaredConfig: { ...base.declaredConfig, tools: ['t', 'u'] } },
    { declaredConfig: { ...base.declaredConfig, context: 'c2' } }, { declaredConfig: { ...base.declaredConfig, harness: 'h2' } },
    { selectedPolicy: SUPPORT_PRESETS['least-privilege'].spec }, { battery: [...supportTasks].reverse() }, { environmentDigest: '0'.repeat(64) },
    { evaluatorVersion: 'support-reward-v2' }, { verifierVersion: 'support-oracle-v2' },
  ]) expect(inputDigest(over), JSON.stringify(over).slice(0, 60)).not.toBe(inputDigest({}))
  // The run's id and time are outside it.
  expect(inputDigest({ evidenceId: 'other', issuedAt: '2026-11-15T00:00:00.000Z' })).toBe(inputDigest({}))
})

test('release 6 phase 2: running the Permissive preset on /reference-check shows the specimen row', async ({ page }) => {
  const { supportTasks } = await import('@origin/verifier-core/supportGym')
  const task = supportTasks.find((t) => t.id === 'sup-02')!
  await page.goto('/reference-check')
  await expect(page.getByRole('button', { name: /^Customer-support agent/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /^Permissive \(the dangerous baseline\)/ }).click()
  await page.getByRole('button', { name: 'Run the reference check', exact: true }).click()
  const row = page.locator('.rc-table tbody tr').filter({ has: page.locator('td:first-child', { hasText: task.action }) })
  await expect(row).toHaveCount(1)
  const spec = specimen(page, RC_SPEC)
  const shown = [
    squash(await spec.locator('.hero-spec__req b').textContent()),
    `$${task.amount}`,
    ...await spec.locator('.hero-spec__diff dd code').allTextContents(),
    squash(await spec.locator('.hero-spec__verdict > b').textContent()).replace('△', '△ '),
  ]
  await expect(row.locator('td')).toHaveText(shown)
})

test('release 6 phase 2: the /verify specimen is the report on the page\'s Permissive support example', async ({ page }) => {
  const { buildPolicyEvaluation } = await import('@origin/verifier-core/policyEvaluation')
  const { SUPPORT_PRESETS } = await import('../../src/certify/policySpec')
  const { ACTION_RUN_SCHEMA_VERSION } = await import('@origin/evidence/action-run-evidence')
  const { summary } = buildPolicyEvaluation({ scenario: 'support', parameters: SUPPORT_PRESETS.permissive.spec })
  expect(summary).toEqual({ matched: 4, total: 12, over_grants: 6, misses: 2 })
  expect(ACTION_RUN_SCHEMA_VERSION).toBe('1.1.0')

  await page.goto('/verify')
  const spec = specimen(page, VFY_SPEC)
  await expect(spec).toBeVisible()
  await expect(spec.locator('.hero-spec__tag')).toHaveText(`Specimen · synthetic record, format ${ACTION_RUN_SCHEMA_VERSION}`)
  await expect(spec.locator('#vfy-spec-desc')).toHaveText('Load the example “Signed browser policy evaluation (untrusted)” below and verify it to get this report.')
  await expect(spec.locator('.hero-spec__result .hero-spec__lbl')).toHaveText('Stated and reproduced')
  expect(squash(await spec.locator('.hero-spec__counts').textContent())).toBe(`${summary.matched} of ${summary.total} match · ${summary.over_grants} over-grants · ${summary.misses} misses`)
  await expect(spec.locator('.hero-spec__meta')).toHaveText('Permissive, support battery')
  await expect(spec.locator('.hero-spec__lbl--rating')).toHaveText('Rating')
  await expect(spec.locator('.hero-spec__outcomes > li > b')).toHaveText(['UNTRUSTED', 'VOID'])
  await expect(spec.locator('.hero-spec__outcomes > li > span')).toHaveText(['intact, signed by a browser key', 'edited without re-signing'])
  await expect(spec.locator('a, button, input, select, textarea, [tabindex]')).toHaveCount(0)
  // A figure, not a live result: it is outside the status region and has none of the result's classes.
  await expect(page.getByRole('status').locator('.hero-spec')).toHaveCount(0)
  await expect(spec.locator('.vfy-verdict, .vfy-stated, .vfy-score, .vfy-pill')).toHaveCount(0)

  // The example named in the caption gives this report: the counts, then UNTRUSTED while intact.
  await page.getByRole('button', { name: 'Signed browser policy evaluation (untrusted)', exact: true }).click()
  const box = page.getByLabel('Artifact JSON', { exact: true })
  await expect(box).toHaveValue(/"schema_version": "1\.1\.0"/)
  const record = JSON.parse(await box.inputValue())
  expect(record.evaluation.policy_parameters).toEqual(SUPPORT_PRESETS.permissive.spec)
  expect(record.evaluation.battery.id).toBe('support')
  expect(record.evaluation.summary).toEqual(summary)
  await verifyButton(page).click()
  await expect(verdict(page).locator('b')).toHaveText(/^UNTRUSTED$/)
  const card = page.getByRole('group', { name: 'Stated in this record and reproduced in this tab:' })
  await expect(card.locator('.vfy-score__lead b')).toHaveText(`${summary.matched} of ${summary.total}`)
  await expect(card.locator('tbody tr').nth(1).locator('td').nth(1)).toHaveText(`${summary.misses}: 0 stricter, ${summary.misses} looser`)
  await expect(card.locator('tbody tr').nth(2).locator('td')).toHaveText([`${summary.over_grants}`, `${summary.over_grants}`])
  await expect(card.locator('.vfy-score__rating')).toContainText('Intact, and signed by the key inside the record.')

  // Edited without re-signing: VOID, and no count is shown.
  await page.getByLabel('Tamper one field (see it void)').check()
  await expect(page.getByText(/^Tampered: changed the stated decision for sup-01 from \w+ to \w+ without re-signing\./)).toBeVisible()
  await verifyButton(page).click()
  await expect(verdict(page).locator('b')).toHaveText(/^VOID$/)
  await expect(page.locator('.vfy-stated')).toHaveCount(0)
  await expect(page.locator('.vfy-result')).not.toContainText(/\bof 12\b/)
})

test('release 6 phase 2: before anything is verified, the /verify result card previews the report by label, and the report replaces it', async ({ page }) => {
  await page.goto('/verify')
  const result = page.locator('.vfy-result')
  const preview = result.getByRole('group', { name: PREVIEW, exact: true })
  await expect(preview).toBeVisible()
  // Under the existing empty-state text, which stays.
  await expect(result.locator('.workspace-empty')).toContainText('Load an example or paste JSON')
  expect(await preview.evaluate((el) => el.previousElementSibling?.matches('.workspace-empty') ?? false)).toBe(true)
  await expect(preview.locator('.vfy-preview__list > li > b')).toHaveText(['Verdict', 'Stated result', 'Checks', 'What this establishes'])
  await expect(preview.locator('.vfy-preview__slot')).toHaveText(['VALID', 'UNTRUSTED', 'VOID', 'Matches', 'Misses', 'Over-grants', 'pass', 'void', 'note'])
  // Labels only: no verdict, count, pill or check result, and nothing in the status region.
  await expect(preview).not.toContainText(/\bof 12\b|\d+ ms|Checked/)
  await expect(result.locator('.vfy-verdict, .vfy-stated, .vfy-score, .vfy-pill, .vfy-log')).toHaveCount(0)
  await expect(page.getByRole('status').locator('.vfy-preview')).toHaveCount(0)

  // Loading the published TR-A002 trace is not verifying it: the preview stays until Verify.
  const published = await (await page.request.get('/proof/tr-a002.json')).text()
  await page.getByRole('button', { name: 'Load the published TR-A002 trace', exact: true }).click()
  await expect(page.getByLabel('Artifact JSON', { exact: true })).toHaveValue(published)
  await expect(result.locator('.workspace-empty b')).toHaveText('Ready to inspect.')
  await expect(preview).toBeVisible()
  await verifyButton(page).click()
  await expect(verdict(page).locator('b')).toHaveText(/^VALID$/)
  await expect(verdict(page)).toContainText('Episode trace code 0: intact')
  await expect(result.locator('.vfy-preview')).toHaveCount(0)
  await expect(result.locator('.workspace-empty')).toHaveCount(0)
  await expect(result.locator('.vfy-log li').first()).toBeVisible()
  // The preview's labels are the real report's own.
  await expect(result.locator('.vfy-note b').filter({ hasText: 'What this establishes' })).toHaveText('What this establishes:')
  const pills = new Set(await result.locator('.vfy-log .vfy-pill').allTextContents())
  await page.getByLabel('Tamper one field (see it void)').check()
  await verifyButton(page).click()
  await expect(verdict(page).locator('b')).toHaveText(/^VOID$/)
  for (const word of await result.locator('.vfy-log .vfy-pill').allTextContents()) pills.add(word)
  expect([...pills].sort()).toEqual(['note', 'pass', 'void'])
  const scorecard = source('../../src/verify/VerifyPage.tsx')
  for (const row of ["['Matches',", "['Misses',", "['Over-grants',"]) expect(scorecard).toContain(row)

  // Clear brings the preview back.
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(result.locator('.workspace-empty b')).toHaveText('Your result starts here.')
  await expect(preview).toBeVisible()
})

test('release 6 phase 2: the specimens and the preview are static and read at 12 px or more', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const [width, height] of [[375, 812], [1280, 720]] as const) {
    await page.setViewportSize({ width, height })
    for (const [route, roots] of [['/reference-check', ['#rc-spec']], ['/verify', ['#vfy-spec', '.vfy-preview']]] as const) {
      await page.goto(route)
      for (const selector of roots) {
        const root = page.locator(selector)
        await expect(root).toBeVisible()
        const sizes = await textSizes(root)
        expect(sizes.length, `${route} ${selector} ${width}px`).toBeGreaterThan(8)
        expect(sizes.filter((s) => s.px < 12), `${route} ${selector} ${width}px`).toEqual([])
        expect(await stillness(root), `${route} ${selector} ${width}px`).toEqual({ animations: 0, named: 0, transitions: 0, smil: 0 })
        // Nothing inside sticks out of the card.
        expect(await root.evaluate((el) => {
          const outer = el.getBoundingClientRect()
          return [...el.querySelectorAll('*')].filter((child) => {
            const b = child.getBoundingClientRect()
            return b.width > 0 && (b.left < outer.left - 0.5 || b.right > outer.right + 0.5)
          }).length
        }), `${route} ${selector} ${width}px`).toBe(0)
      }
    }
  }
})

for (const [width, height] of SIZES) test(`release 6 phase 2: the tool heroes do not shift the layout at ${width}`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => {
    const w = window as unknown as { __shifts: number[] }
    w.__shifts = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number, hadRecentInput: boolean })[]) if (!entry.hadRecentInput) w.__shifts.push(entry.value)
    }).observe({ type: 'layout-shift', buffered: true })
  })
  for (const route of ['/reference-check', '/verify']) {
    await page.goto(route, { waitUntil: 'load' })
    await expect(page.locator('.product-hero .hero-spec')).toBeVisible()
    // The app has mounted: its stylesheet and its first panel are in.
    await expect(page.locator('.product-workspace').first()).toBeVisible()
    await page.waitForTimeout(1500)
    const { total, overflow } = await page.evaluate(() => ({
      total: (window as unknown as { __shifts: number[] }).__shifts.reduce((sum, value) => sum + value, 0),
      overflow: document.documentElement.scrollWidth - innerWidth,
    }))
    expect(total, `${route} ${width}px`).toBeLessThanOrEqual(0.001)
    expect(overflow, `${route} ${width}px`).toBeLessThanOrEqual(0)
  }
})
