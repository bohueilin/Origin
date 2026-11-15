import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Release 6 Phase 2 — home walkthrough
// Section 01 (#demo) is one component. The stage tablist is the stage strip: each tab shows its
// number, name, a one-line note and the record field it touches, so the five stages are shown
// once (the standalone five-stage figure above the tabs is gone). Each panel is a balanced split
// from 900 px (question, heading and prose on the left, the schematic and the mono readout on the
// right), and the five panels' content is written to similar heights, so under the one-height
// lock no stage leaves more than 15% of the panel empty. Stages 1 and 2 open on the battery's own
// case, sup-02: a $450 refund over the oracle's $100 refund cap. Under the walkthrough, beside the
// boundary line, a three-beat strip links to /app, named as a separate scripted scenario ($480
// over a $250 auto-cap). The five-column strip starts at 1024 px, where every stage fits.
// Every number, id and field below is read from the code that makes the record.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const STAGES = ['Bind', 'Challenge', 'Grade', 'Attest', 'Reverify'] as const
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// The record a run of the support battery with the Moderate preset makes, built by the same
// function /reference-check calls.
async function moderateSupportRecord() {
  const { supportTasks, supportOracle, verifySupportDecision, supportPolicyFromParameters, supportEnvDigest, SUPPORT_VERSIONS } = await import('@origin/verifier-core/supportGym')
  const { SUPPORT_PRESETS } = await import('../../src/certify/policySpec')
  const { buildSyntheticReferenceCheckEvidence } = await import('../../src/reference-check/evidence')
  const parameters = SUPPORT_PRESETS.moderate.spec
  const policyFor = supportPolicyFromParameters(parameters)
  const rows = supportTasks.map((task: (typeof supportTasks)[number]) => {
    const yours = policyFor(task)
    const verdict = verifySupportDecision(task, yours)
    return { id: task.id, yours, oracle: supportOracle(task).decision, passed: verdict.passed, catastrophic: verdict.catastrophic }
  })
  return buildSyntheticReferenceCheckEvidence({
    evidenceId: 'r6-walkthrough', issuedAt: '2026-11-14T00:00:00.000Z', maxAgeMs: 30 * 24 * 60 * 60 * 1000, scenario: 'support',
    declaredConfig: { model: 'm', tools: ['t'], context: 'c', harness: 'h' }, selectedPolicy: parameters, battery: supportTasks, rows,
    environmentDigest: supportEnvDigest(), evaluatorVersion: SUPPORT_VERSIONS.reward_model_version, verifierVersion: SUPPORT_VERSIONS.verifier_version,
  }) as unknown as Record<string, unknown>
}

const field = (record: Record<string, unknown>, path: string) =>
  path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], record)

// Every stage's panel height, the share of it left empty under the content, both columns' boxes,
// and the control bar's place. Positions are layout boxes (offsets), so a hovered button's lift,
// a transform, is never mistaken for a move.
const walkthrough = (page: Page) => page.evaluate(() => {
  const top = (el: HTMLElement) => {
    let y = 0
    for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) y += node.offsetTop
    return y
  }
  const stages = [...document.querySelectorAll<HTMLElement>('[data-demo-panel]')].map((panel) => {
    const kids = [...panel.children] as HTMLElement[]
    const bottom = Math.max(...kids.map((el) => top(el) + el.offsetHeight + parseFloat(getComputedStyle(el).marginBottom)))
    const content = bottom - top(panel)
    const column = (selector: string) => { const el = panel.querySelector<HTMLElement>(`:scope > ${selector}`)!; return { x: el.offsetLeft, y: top(el), width: el.offsetWidth } }
    return { height: panel.offsetHeight, content, empty: (panel.offsetHeight - content) / panel.offsetHeight, main: column('.demo__main'), side: column('.demo__side'), inner: panel.clientWidth }
  })
  const bar = ['[data-demo]', '.demo__bar', '[data-demo-play]', '[data-demo-prev]', '[data-demo-next]', '#demo .demo-boundary', '#demo .demo-beats'].map((selector) => {
    const el = document.querySelector<HTMLElement>(selector)!
    return { selector, x: el.offsetLeft, y: top(el), width: el.offsetWidth, height: el.offsetHeight }
  })
  return { stages, bar }
})

test('release 6 phase 2: the stage tablist is the one stage strip, labelled from the code', async ({ page }) => {
  await page.goto('/')
  const demo = page.locator('#demo')
  await expect(page.locator('[data-demo]')).toHaveClass(/is-enhanced/)
  // The standalone figure is gone: no second list of the five stages in #demo.
  await expect(demo.locator('#stagefig, .stagefig')).toHaveCount(0)
  await expect(demo.getByRole('figure', { name: 'The reference check in five stages', exact: true })).toHaveCount(0)
  const tablist = demo.getByRole('tablist', { name: 'The reference check in five stages', exact: true })
  await expect(tablist).toBeVisible()

  // Each stage name shows once in the strip; outside it only the shown panel's heading tag names
  // a stage, and it names the selected one.
  const named = () => demo.evaluate((root, names) => {
    const shown = [...root.querySelectorAll('*')].filter((el) => el.checkVisibility({ visibilityProperty: true }) && names.includes(el.textContent?.trim() ?? ''))
    const leaves = shown.filter((el) => !shown.some((other) => other !== el && el.contains(other)))
    return {
      strip: leaves.filter((el) => el.closest('[role="tablist"]')).map((el) => el.textContent!.trim()),
      outside: leaves.filter((el) => !el.closest('[role="tablist"]')).map((el) => el.textContent!.trim()),
    }
  }, [...STAGES] as string[])
  for (const [i, name] of STAGES.entries()) {
    await page.locator(`#demo-tab-${i + 1}`).click()
    expect(await named(), `stage ${i + 1}`).toEqual({ strip: [...STAGES], outside: [name] })
  }

  // Each tab: number, name (its accessible name), a one-line note and the field, both read as its
  // description. The panels are labelled by the stage name.
  const { supportTasks } = await import('@origin/verifier-core/supportGym')
  const { ACTION_RUN_SCHEMA_VERSION } = await import('@origin/evidence/action-run-evidence')
  const notes = [
    'Model and tools kept only as digests.',
    `${supportTasks.length} fixed synthetic requests, the same every run.`,
    'Code, not a model, compares with the oracle.',
    'Signed by a key your browser makes.',
    '/verify re-runs the grading.',
  ]
  const fields = ['proposal.input_digest', 'subject.environment_digest', 'evaluation.decisions', `schema_version ${ACTION_RUN_SCHEMA_VERSION}`, 'UNTRUSTED · VOID']
  for (const [i, name] of STAGES.entries()) {
    const tab = page.locator(`#demo-tab-${i + 1}`)
    await expect(tab.locator(':scope > span')).toHaveText(String(i + 1))
    await expect(tab.locator(':scope > b')).toHaveText(name)
    await expect(tab.locator(':scope > small')).toHaveText(notes[i])
    await expect(tab.locator(':scope > code')).toHaveText(fields[i])
    await expect(tab).toHaveAccessibleName(name)
    await expect(tab).toHaveAccessibleDescription(`${notes[i]} ${fields[i]}`)
    await expect(tab.locator(':scope > i')).toHaveAttribute('aria-hidden', 'true')
    await tab.click()
    await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible()
  }
  // The record fields exist in a record built the way /reference-check builds it.
  const record = await moderateSupportRecord()
  expect(record.schema_version).toBe(ACTION_RUN_SCHEMA_VERSION)
  for (const path of ['proposal.input_digest', 'subject.environment_digest']) expect(field(record, path), path).toMatch(/^[0-9a-f]{64}$/)
  expect(Array.isArray(field(record, 'evaluation.decisions'))).toBe(true)
  // /verify's verdicts for an Action/Run record: VOID when a check fails, UNTRUSTED when intact but
  // its signer is not a trusted issuer (src/verify/detect.mjs).
  expect(source('../../src/verify/detect.mjs')).toContain("const verdict = firstFailed ? 'VOID' : !d.issuer_trusted ? 'UNTRUSTED' : 'VALID'")
})

test('release 6 phase 2: stages 1 to 4 follow the battery\'s own case, sup-02, with its true numbers', async ({ page }) => {
  const { supportTasks, supportOracle, ORACLE_REFUND_CAP } = await import('@origin/verifier-core/supportGym')
  const { buildPolicyEvaluation } = await import('@origin/verifier-core/policyEvaluation')
  const { SUPPORT_PRESETS } = await import('../../src/certify/policySpec')
  const { missDirection } = await import('@origin/verifier-core/missDirection')
  const task = supportTasks.find((t: { id: string }) => t.id === 'sup-02')!
  const oracle = supportOracle(task)
  expect(task.amount).toBe(450)
  expect(ORACLE_REFUND_CAP).toBe(100)
  expect(oracle.decision).toBe('escalate')
  expect(oracle.reason).toMatch(/^over the \$100 refund cap/)
  const row = buildPolicyEvaluation({ scenario: 'support', parameters: SUPPORT_PRESETS.moderate.spec }).decisions.find((d: { id: string }) => d.id === 'sup-02')!
  expect(row).toEqual({ id: 'sup-02', decision: 'allow', expected: 'escalate' })
  expect(missDirection(row.decision, row.expected)).toBe('looser')

  await page.goto('/')
  // Stage 1 opens on the human moment: the case comes first in the panel.
  const case1 = page.locator('#demo-panel-1 .demo__main > :first-child')
  await expect(case1).toHaveClass(/demo__case/)
  await expect(case1).toHaveText(`sup-02A $${task.amount} refund over the $${ORACLE_REFUND_CAP} refund cap: should the agent proceed, refuse, or hand it to a person?`)
  await expect(page.locator('#demo-panel-1')).toContainText('it does not prove that the named agent was inspected or run')

  await page.locator('#demo-tab-2').click()
  const panel2 = page.locator('#demo-panel-2')
  await expect(panel2.locator('.demo__main > :first-child')).toHaveText(`sup-02The $${task.amount} refund is one of ${supportTasks.length} requests whose answers the oracle fixes before any policy is run.`)
  await expect(panel2.locator('.panelfig__cells li.is-case')).toHaveCount(1)
  await expect(panel2.locator('.panelfig__cells li.is-case code')).toHaveText('sup-02')
  await expect(panel2.locator('.panelfig__pick code')).toHaveText('sup-02')
  await expect(panel2.locator('.panelfig__pick span').first()).toHaveText(task.action)
  await expect(panel2.locator('.panelfig__pick .panelfig__dec')).toHaveText(`oracle ${oracle.decision} · over the $${ORACLE_REFUND_CAP} refund cap`)

  await page.locator('#demo-tab-3').click()
  await expect(page.locator('#demo-panel-3')).toContainText(`Under the Moderate preset the policy allows the $${task.amount} refund and the oracle escalates it: a looser miss.`)
  await expect(page.locator('#demo-panel-3 .demo__key li')).toHaveText(['✓match', '△miss (stricter)', '△miss (looser)', 'over-grant, counted separately'])

  await page.locator('#demo-tab-4').click()
  await expect(page.locator('#demo-panel-4 .panelfig__pick code')).toHaveText('evaluation.decisions')
  await expect(page.locator('#demo-panel-4 .panelfig__pick .panelfig__dec')).toHaveText(JSON.stringify(row))

  // The /app scenario's numbers stay out of the walkthrough.
  for (const step of [1, 2, 3, 4, 5]) {
    await page.locator(`#demo-tab-${step}`).click()
    await expect(page.locator(`#demo-panel-${step}`)).not.toContainText(/\$250|\$480|auto-cap/)
  }
})

test('release 6 phase 2: the five-column stage strip starts where it fits, at 1024 px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  // Each tab's boxes: the tab's content box, its name, its connector, and each word of its field
  // code (split at spaces and at the <wbr> after the dot) with the lines it is drawn on.
  const strip = () => page.locator('[data-demo] [role="tab"]').evaluateAll((tabs) => tabs.map((tab) => {
    const s = getComputedStyle(tab)
    const t = tab.getBoundingClientRect()
    const name = tab.querySelector(':scope > b')!.getBoundingClientRect()
    const connector = tab.querySelector(':scope > i')!.getBoundingClientRect()
    const code = tab.querySelector(':scope > code')!
    const words: { word: string, lines: number }[] = []
    for (const node of code.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue
      const text = node.textContent!
      for (const match of text.matchAll(/\S+/g)) {
        const range = document.createRange()
        range.setStart(node, match.index!)
        range.setEnd(node, match.index! + match[0].length)
        words.push({ word: match[0], lines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size })
      }
    }
    return {
      x: t.x, y: t.y, contentRight: t.right - parseFloat(s.paddingRight),
      nameRight: name.right, connector: { left: connector.left, right: connector.right, width: connector.width },
      codeShown: getComputedStyle(code).display !== 'none', words, spills: tab.scrollWidth > tab.clientWidth,
    }
  }))

  // Below 1024 px the strip is a list: the tabs stack, without connectors or field codes.
  await page.setViewportSize({ width: 1023, height: 900 })
  await page.goto('/')
  await expect(page.locator('[data-demo]')).toHaveClass(/is-enhanced/)
  const list = await strip()
  expect(list.map((tab) => tab.x)).toEqual(Array(5).fill(list[0].x))
  for (const [i, tab] of list.entries()) {
    if (i) expect(tab.y, `tab ${i + 1} under tab ${i}`).toBeGreaterThan(list[i - 1].y)
    expect(tab.codeShown, `tab ${i + 1}`).toBe(false)
    expect(tab.connector.width, `tab ${i + 1}`).toBe(0)
  }
  // From 1024 px: one row of five; no field breaks inside an identifier, and every connector
  // keeps a line before its 7 px arrowhead (Challenge, the longest name, leaves the least).
  for (const [width, height] of [[1024, 900], [1280, 720], [1919, 998]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.locator('[data-demo]')).toHaveClass(/is-enhanced/)
    const row = await strip()
    expect(row.map((tab) => tab.y), `${width}px`).toEqual(Array(5).fill(row[0].y))
    for (const [i, tab] of row.entries()) {
      const at = `tab ${i + 1} at ${width}px`
      expect(tab.codeShown, at).toBe(true)
      for (const { word, lines } of tab.words) expect(lines, `${at}: "${word}" on one line`).toBe(1)
      expect(tab.spills, at).toBe(false)
      if (i === 4) continue // the last connector is hidden: no stage follows Reverify
      expect(tab.connector.width, at).toBeGreaterThanOrEqual(12)
      expect(tab.connector.left, at).toBeGreaterThan(tab.nameRight)
      expect(tab.connector.right, at).toBeLessThanOrEqual(tab.contentRight + 0.5)
    }
  }
})

for (const [width, height] of [[1919, 998], [1280, 720], [375, 812]] as const) test(`release 6 phase 2: at ${width} every stage fills one panel height, and the bar never moves`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  test.setTimeout(60_000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width, height })
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.locator('[data-demo]')).toHaveClass(/is-enhanced/)
  await page.locator('[data-demo-play]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const shifts: number[] = []
    ;(window as unknown as { __r6walk: number[] }).__r6walk = shifts
    new PerformanceObserver((list) => { for (const entry of list.getEntries() as (PerformanceEntry & { value: number })[]) shifts.push(entry.value) }).observe({ type: 'layout-shift' })
  })

  const start = await walkthrough(page)
  expect(start.stages).toHaveLength(5)
  expect(new Set(start.stages.map((s) => s.height)).size, 'one panel height').toBe(1)
  for (const [i, stage] of start.stages.entries()) {
    expect(stage.empty, `stage ${i + 1} empty share`).toBeGreaterThanOrEqual(0)
    expect(stage.empty, `stage ${i + 1} empty share`).toBeLessThanOrEqual(0.15)
    if (width >= 900) {
      // A balanced split: the left column about 52% of the panel, the schematic and readout right.
      expect(stage.side.y, `stage ${i + 1}`).toBe(stage.main.y)
      expect(stage.side.x, `stage ${i + 1}`).toBeGreaterThan(stage.main.x + stage.main.width)
      const share = stage.main.width / (stage.main.width + stage.side.width)
      expect(share, `stage ${i + 1} left share`).toBeGreaterThan(0.5)
      expect(share, `stage ${i + 1} left share`).toBeLessThan(0.55)
    } else {
      expect(stage.side.x, `stage ${i + 1}`).toBe(stage.main.x)
      expect(stage.side.y, `stage ${i + 1}`).toBeGreaterThan(stage.main.y)
    }
  }
  for (const step of [1, 2, 3, 4, 5, 1]) {
    await page.locator(`#demo-tab-${step}`).click()
    await expect(page.locator(`#demo-panel-${step}`)).toBeVisible()
    expect((await walkthrough(page)).bar, `stage ${step}`).toEqual(start.bar)
  }
  const play = page.locator('[data-demo-play]')
  await play.click()
  await expect(play).toHaveAttribute('aria-pressed', 'true')
  for (const step of [2, 3, 4, 5]) {
    await expect(page.locator(`#demo-tab-${step}`)).toHaveAttribute('aria-selected', 'true', { timeout: 4000 })
    expect((await walkthrough(page)).bar, `playing, stage ${step}`).toEqual(start.bar)
  }
  await expect(play).toHaveAttribute('aria-pressed', 'false', { timeout: 4000 })
  expect((await walkthrough(page)).bar, 'after Play stops').toEqual(start.bar)
  // No layout shift at all while clicking through and playing, with or without recent input.
  expect(await page.evaluate(() => (window as unknown as { __r6walk: number[] }).__r6walk)).toEqual([])

  // The strip and the panels are still: no animation or transition runs on them.
  expect(await page.locator('[data-demo] .demo__rail, [data-demo] .demo__screen').evaluateAll((els) => els.flatMap((el) => el.getAnimations({ subtree: true })).length)).toBe(0)
  // Text in #demo is at least 12 px, and every tab is at least 44 px tall and wide.
  const small = await page.locator('#demo').evaluate((root) => {
    const out: string[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement
      if (el && node.textContent?.trim() && el.checkVisibility({ visibilityProperty: true }) && parseFloat(getComputedStyle(el).fontSize) < 12) out.push(node.textContent.trim())
    }
    return out
  })
  expect(small).toEqual([])
  for (const box of await page.locator('[data-demo] [role="tab"]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()))) {
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
})

test('release 6 phase 2: a three-beat strip sits beside the boundary line and links to the scripted /app scenario', async ({ page }, testInfo) => {
  // The $480 refund, its $250 auto-cap and its $500 ceiling are the scripted /app scenario's,
  // a case separate from the walkthrough's sup-02 ($450 over the $100 refund cap).
  const app = source('../../app.html')
  expect(app).toContain('Refund $480.00')
  expect(app).toContain('$480.00 over the $250 auto-cap')
  expect(app).toContain('within the $500 approval ceiling')
  expect(app).toContain('All three scenarios are scripted, interactive walkthroughs.')

  await page.goto('/')
  const boundary = page.locator('#demo .demo-boundary')
  const beats = page.locator('#demo .demo-beats')
  await expect(beats).toHaveCount(1)
  await expect(beats).toBeVisible()
  expect(await beats.evaluate((el) => el.previousElementSibling?.matches('.demo-boundary') ?? false)).toBe(true)
  await expect(boundary).toContainText('No design partner, no pilot, no paying user — today.')
  await expect(beats.getByRole('list', { name: 'A review, in three beats' }).getByRole('listitem')).toHaveText([
    '1. Your agent is waiting on approval.',
    '→2. You run the check in your browser.',
    '→3. Your reviewer re-runs the grading and sees UNTRUSTED or VOID.',
  ])
  for (const arrow of await beats.locator('li > span').all()) await expect(arrow).toHaveAttribute('aria-hidden', 'true')
  // The link says plainly that it is another case, so $480 beside $450 does not read as a typo.
  const link = beats.getByRole('link', { name: 'A separate scripted scenario: walk a $480 refund over a $250 auto-cap on /app', exact: true })
  await expect(link).toHaveAttribute('href', '/app')

  if (testInfo.project.name !== 'desktop-chromium') return
  for (const [width, height] of [[1280, 720], [375, 812]] as const) {
    await page.setViewportSize({ width, height })
    const [b, s] = [await boundary.boundingBox(), await beats.boundingBox()]
    if (width === 1280) {
      // Side by side, the same height.
      expect(Math.abs(s!.y - b!.y)).toBeLessThanOrEqual(1)
      expect(s!.x).toBeGreaterThan(b!.x + b!.width)
      expect(Math.abs(s!.height - b!.height)).toBeLessThanOrEqual(1)
    } else {
      expect(s!.y).toBeGreaterThan(b!.y + b!.height)
    }
    expect((await link.boundingBox())!.height, `${width}px`).toBeGreaterThanOrEqual(44)
  }
  await link.click()
  await expect(page).toHaveURL(/\/app(\.html)?$/)
})

test('release 6 phase 2: without JavaScript each stage name shows once, in its panel', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  await context.route('**/*', (route) => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/`)
    await expect(page.locator('[data-demo] [role="tablist"]')).toBeHidden()
    for (const [i, name] of STAGES.entries()) {
      await expect(page.locator(`#demo-panel-${i + 1}`)).toBeVisible()
      await expect(page.locator(`#demo-panel-${i + 1} h3 .demo__tag`)).toHaveText(name)
    }
    // No second list of the stages: each name shows once in #demo, as its panel's heading tag.
    expect(await page.locator('#demo').evaluate((root, names) => [...root.querySelectorAll('*')]
      .filter((el) => el.checkVisibility() && el.children.length === 0 && names.includes(el.textContent?.trim() ?? ''))
      .map((el) => el.textContent!.trim()), [...STAGES] as string[])).toEqual([...STAGES])
    await expect(page.locator('#demo .demo-beats')).toBeVisible()
  } finally {
    await context.close()
  }
})
