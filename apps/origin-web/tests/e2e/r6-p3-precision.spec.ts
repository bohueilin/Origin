import { test, expect, type Page } from '@playwright/test'

// Release 6 Phase 3 — precision on the tool pages
// /over-grant's recorded-run figure and /security experiment 05 both show a root going from 5 of 9
// to 6 of 9 sensitive resources, but they are two different trees: the recorded run widens
// agent-000.0.0 with payroll:read in experiment 06's seeded fleet, and 05 is six hand-built
// identities rooted at platform. Each page now says which tree is which, naming each edge as the
// code does, and expands the blast-radius index (BRI) where it first appears. /security says where
// to start and why its recommended preset scores 11 of 12; /verify says in one line what it does;
// /reference-check gives the IAM Moderate score and, without JavaScript, ties its static figures to
// the tool. The held-versus-exercised bar, the widened delegation path and the 05 figure are drawn
// as real SVG geometry with their text kept in HTML. Home section 01 links to the explainer.

test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

async function localOnly(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
}

const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim()
const RECORDED_REACH = "Root agent-000's reach over 9 sensitive resources, before and after one widened edge"
const PANEL_REACH = "Two fixed states: the root's reach before and after payroll-bot gains hr-records:read, a scope its parent ops never held"
const FOREST = 'rgb(43, 82, 59)'

// The recorded run's widened edge, recomputed as the 06 panel picks it: the first identity three
// levels deep in the clean seeded fleet, widened by the first sensitive scope its root cannot reach.
async function seededRun() {
  const { generateCorpus, effectiveScopes, analyzeOverGrant, resources, isSensitive } = await import('@origin/verifier-core/overGrant')
  const clean = generateCorpus({ seed: 20260818, roots: 400, depth: 4, violationRate: 0 })
  const deep = clean.identities.find((i) => i.id.split('.').length >= 3)!
  const rootId = deep.id.split('.')[0]
  const sensitive = resources.filter(isSensitive).map((r) => r.id)
  const rootScopes = [...effectiveScopes(clean).get(rootId)!]
  const target = sensitive.find((id) => !rootScopes.some((s) => s.startsWith(`${id}:`)))!
  const { gur, bri } = analyzeOverGrant(clean).metrics
  return { rootId, edge: `${deep.id} gains ${target}:read`, sensitive: bri.sensitiveResources, fleetGur: gur.fleetGur }
}

test('release 6 phase 3: /over-grant says its recorded run and the interactive tree are different trees', async ({ page }) => {
  const { rootId, edge } = await seededRun()
  expect([rootId, edge]).toEqual(['agent-000', 'agent-000.0.0 gains payroll:read'])
  await page.goto('/over-grant')
  const fig = page.getByRole('figure', { name: RECORDED_REACH, exact: true })
  const which = fig.locator('.og-fig__which')
  await expect(which).toBeVisible()
  expect(squash(await which.textContent())).toBe(
    `In the recorded seeded run (experiment 06's fleet), ${edge}. The interactive tree just below is a different one, ` +
    "experiment 05's six hand-built identities rooted at platform: there, for example, payroll-bot gains hr-records:read, " +
    'which also takes platform from 5 of 9 to 6 of 9.',
  )
  // "Just below" holds: the 05 panel follows this figure's section, and its root is platform.
  const panel = page.locator('#delegation')
  expect(await page.locator('section.og-figs').evaluate((s, d) => !!(s.compareDocumentPosition(d!) & Node.DOCUMENT_POSITION_FOLLOWING), await panel.elementHandle())).toBe(true)
  await expect(panel.locator('svg:visible text').first()).toHaveText('platform')
  // Widening payroll-bot in the live tree does take platform from 5 of 9 to 6 of 9.
  await panel.getByRole('button', { name: 'Widen payroll-bot', exact: true }).click()
  await expect(panel.locator('.sec-log')).toContainText('6 / 9 sensitive resources reachable')
})

for (const route of ['/over-grant', '/security']) {
  for (const js of [true, false]) {
    test(`release 6 phase 3: experiment 05 on ${route} names its own tree, the seeded edge and BRI (${js ? 'mounted' : 'no JS'})`, async ({ browser, baseURL }) => {
      const { edge, sensitive } = await seededRun()
      const context = await browser.newContext({ javaScriptEnabled: js })
      try {
        const page = await context.newPage()
        await localOnly(page)
        await page.goto(`${baseURL}${route}`)
        const how = page.locator('#delegation > .sec-claim dd').first()
        expect(squash(await how.textContent())).toBe(
          'Six hand-built synthetic identities in an interactive tree rooted at platform. ' +
          `It is not experiment 06's seeded fleet, whose recorded run widens a different edge: ${edge}. ` +
          `An identity's reach is its own grant plus every descendant's, counted over ${sensitive} sensitive resources; ` +
          `its blast-radius index (BRI) is the share of those ${sensitive} it can reach.`,
        )
        // The expansion is the page's first "BRI", and the log then reads the root's value.
        const first = await page.evaluate(() => {
          const text = document.body.innerText
          return { bri: text.indexOf('BRI'), expansion: text.indexOf('blast-radius index (BRI)') }
        })
        expect(first.expansion).toBeGreaterThan(-1)
        expect(first.bri).toBe(first.expansion + 'blast-radius index ('.length)
        // The code's BRI: sensitive resources reachable under effective authority over the
        // catalogue's sensitive resources (packages/verifier-core/overGrant.mjs blastRadius).
        await expect(page.locator('#delegation .sec-log')).toContainText(`5 / ${sensitive} sensitive resources reachable — BRI ${(5 / sensitive * 100).toFixed(1)}%`)
      } finally {
        await context.close()
      }
    })
  }
}

test('release 6 phase 3: /security says where to start, with and without JavaScript', async ({ browser, baseURL, page }) => {
  const START = 'Start here: Experiment 04 (Configuration binding) or 05 (Delegated authority).'
  await page.goto('/security')
  const start = page.locator('.sec-grid > .sec-start')
  await expect(start).toHaveText(START)
  // At the top of the experiment list: before the experiment nav and every card.
  expect(await start.evaluate((el) => el.nextElementSibling?.matches('nav.workspace-nav') ?? false)).toBe(true)
  // The names are the cards' own.
  await expect(page.locator('#config-binding > .kicker')).toHaveText('04 · Configuration binding')
  await expect(page.locator('#delegation > .kicker')).toHaveText('05 · Delegated authority')
  expect(await start.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)

  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const noJs = await context.newPage()
    await localOnly(noJs)
    await noJs.goto(`${baseURL}/security`)
    const staticStart = noJs.locator('#security-root > .sec-start')
    await expect(staticStart).toHaveText(START)
    expect(await staticStart.evaluate((el) => el.nextElementSibling?.matches('ul.onpage-static') ?? false)).toBe(true)
  } finally {
    await context.close()
  }
})

test('release 6 phase 3: /security 04 says why the recommended preset scores 11 of 12', async ({ page }) => {
  const { iamTasks, verifyIamDecision } = await import('@origin/verifier-core/iamGym')
  const { missDirection } = await import('@origin/verifier-core/missDirection')
  const { PRESETS, policyForSpec } = await import('../../src/certify/policySpec')
  const policyFor = policyForSpec(PRESETS['least-privilege'].spec)
  const rows = iamTasks.map((task) => ({ id: task.id, decision: policyFor(task), check: verifyIamDecision(task, policyFor(task)) }))
  const misses = rows.filter((r) => !r.check.passed)
  // One miss, iam-06: the preset escalates where the oracle allows, a stricter miss, not an over-grant.
  expect(misses.map((r) => [r.id, r.decision, r.check.expected, r.check.catastrophic, missDirection(r.decision, r.check.expected)]))
    .toEqual([['iam-06', 'escalate', 'allow', false, 'stricter']])
  const n = iamTasks.length
  await page.goto('/security')
  const shows = page.locator('#config-binding > .sec-claim dd').nth(1)
  await expect(shows).toContainText(
    `The Least-privilege preset matches ${n - misses.length} of ${n}: it escalates ${misses[0].id}, which the oracle allows, a stricter miss; ` +
    `grading the oracle's own answer key would match ${n} of ${n} by construction.`,
  )
  // The panel's own run agrees.
  await page.locator('#config-binding').getByRole('button', { name: 'Issue a reference check', exact: true }).click()
  await expect(page.locator('#config-binding .sec-rsl')).toHaveText(`${n - misses.length} of ${n} synthetic decisions match the oracle`)
})

test('release 6 phase 3: /verify says in one line what it does, at the top of the workspace', async ({ page }) => {
  await page.goto('/verify')
  const line = page.locator('.vfy-grid > .vfy-purpose')
  await expect(line).toHaveText('Paste or open a record. This page checks whether its bytes and any signature are intact, replays its stated policy decisions when it carries them, and states what that result does not establish.')
  expect(await line.evaluate((el) => el === el.parentElement!.firstElementChild)).toBe(true)
  const [lineBox, stepsBox] = [await line.boundingBox(), await page.locator('.vfy-grid > .workspace-steps').boundingBox()]
  expect(lineBox!.y + lineBox!.height).toBeLessThanOrEqual(stepsBox!.y)
  expect(await line.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
})

test('release 6 phase 3: /reference-check gives the IAM Moderate score, and ties its figures to the tool without JavaScript', async ({ browser, baseURL, page }) => {
  const { buildPolicyEvaluation } = await import('@origin/verifier-core/policyEvaluation')
  const { verifyIamDecision, iamTasks } = await import('@origin/verifier-core/iamGym')
  const { missDirection } = await import('@origin/verifier-core/missDirection')
  const { PRESETS } = await import('../../src/certify/policySpec')
  const score = (preset: string) => buildPolicyEvaluation({ scenario: 'iam', parameters: PRESETS[preset].spec })
  const [lp, mod, perm] = ['least-privilege', 'moderate', 'permissive'].map(score)
  expect([mod.summary.matched, mod.summary.total, mod.summary.over_grants, mod.summary.misses]).toEqual([8, 12, 3, 1])
  const modMiss = mod.decisions.filter((row, i) => row.decision !== row.expected && !verifyIamDecision(iamTasks[i], row.decision).catastrophic)
  expect(modMiss.map((row) => missDirection(row.decision, row.expected))).toEqual(['looser'])
  expect(lp.summary.misses).toBe(1)

  await page.goto('/reference-check')
  expect(squash(await page.locator('#rcx-compare #rcx-battery').textContent())).toBe(
    'Scores above are for the customer-support synthetic battery (support-gym-v1); on the IAM battery (iam-gym-v1), ' +
    `Least-privilege matches ${lp.summary.matched} of ${lp.summary.total} (${lp.summary.misses} stricter miss), ` +
    `Moderate matches ${mod.summary.matched} of ${mod.summary.total} with ${mod.summary.over_grants} over-grants and ${mod.summary.misses} looser miss, ` +
    `and Permissive matches ${perm.summary.matched} of ${perm.summary.total}.`,
  )
  const NOJS = 'The static preset comparison and annotated row above show the results the interactive tool produces on the default customer-support battery.'
  // With JavaScript the tool itself is on the page, so the line is not shown.
  await expect(page.getByText(NOJS)).toHaveCount(0)

  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const noJs = await context.newPage()
    await localOnly(noJs)
    await noJs.goto(`${baseURL}/reference-check`)
    const line = noJs.locator('.rcx-nojs')
    await expect(line).toBeVisible()
    await expect(line).toHaveText(NOJS)
    // "Above" is true: the comparison and the annotated row both come before it.
    for (const id of ['#rcx-compare', '#rcx-row']) {
      const before = await noJs.locator(id).evaluate((fig, l) => !!(fig.compareDocumentPosition(l!) & Node.DOCUMENT_POSITION_FOLLOWING), await line.elementHandle())
      expect(before, id).toBe(true)
    }
    expect(await line.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
  } finally {
    await context.close()
  }
})

test('release 6 phase 3: /over-grant draws the held bar and the widened path as SVG geometry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  const { fleetGur } = await seededRun()
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/over-grant')
    const held = page.locator('section.og-figs .og-fig').first()
    const bar = held.locator('svg.og-bar')
    await expect(bar).toHaveCount(1)
    await expect(bar).toHaveAttribute('aria-hidden', 'true')
    const geo = await bar.evaluate((svg) => {
      const r = (sel: string) => svg.querySelector(sel)!.getBoundingClientRect()
      const lines = [...svg.querySelectorAll('line.og-bar__brace')].map((l) => l.getBoundingClientRect())
      return { held: r('rect.og-bar__held').width, used: r('rect.og-bar__used').width, usedRight: r('rect.og-bar__used').right,
        heldRight: r('rect.og-bar__held').right, braceLeft: Math.min(...lines.map((l) => l.left)), braceRight: Math.max(...lines.map((l) => l.right)),
        braces: lines.length, texts: svg.querySelectorAll('text').length }
    })
    // Proportional: the exercised rect is the fleet's utilization share of the granted rect, and the
    // bracket spans the never-exercised rest. The numbers stay in the HTML key.
    expect(geo.used / geo.held, `${width}`).toBeCloseTo(fleetGur, 2)
    expect(geo.braces).toBe(3)
    expect(Math.abs(geo.braceLeft - geo.usedRight), `${width}`).toBeLessThanOrEqual(2)
    expect(Math.abs(geo.braceRight - geo.heldRight), `${width}`).toBeLessThanOrEqual(2)
    expect(geo.texts).toBe(0)
    await expect(held.locator('dd')).toHaveText(['3,194 · 36.8%', '5,481 · 63.2%'])

    // The path: one node per row, joined by edges whatever the text wraps to; the widened edge and
    // its node are the one green. The text is the list's own HTML.
    const rows = page.getByRole('figure', { name: RECORDED_REACH, exact: true }).locator('ol.og-chain > li')
    await expect(rows).toHaveCount(3)
    const drawn = await rows.evaluateAll((lis) => lis.map((li) => {
      const svg = li.querySelector(':scope > svg.og-chain__g')!
      const node = svg.querySelector('circle')!.getBoundingClientRect()
      const edges = [...svg.querySelectorAll('line, path')].map((e) => ({ box: e.getBoundingClientRect(), stroke: getComputedStyle(e).stroke }))
      return { hidden: svg.getAttribute('aria-hidden'), texts: svg.querySelectorAll('text').length, nodeX: node.x + node.width / 2, nodeY: node.y + node.height / 2,
        nodeFill: getComputedStyle(svg.querySelector('circle')!).fill, edges, top: li.getBoundingClientRect().top, bottom: li.getBoundingClientRect().bottom }
    }))
    for (const row of drawn) expect([row.hidden, row.texts]).toEqual(['true', 0])
    // Each child steps right of its parent, and its elbow starts on the parent's column at the row
    // boundary, where the parent's downward edge ends.
    for (let i = 1; i < drawn.length; i++) {
      const parent = drawn[i - 1], child = drawn[i]
      expect(child.nodeX).toBeGreaterThan(parent.nodeX + 10)
      const down = parent.edges.find((e) => Math.abs(e.box.x + e.box.width / 2 - parent.nodeX) < 2 && e.box.y > parent.nodeY)!
      const elbow = child.edges.find((e) => Math.abs(e.box.y - child.top) < 2)!
      expect(Math.abs(down.box.bottom - parent.bottom), `${width} row ${i}`).toBeLessThanOrEqual(1)
      expect(Math.abs(elbow.box.x - parent.nodeX), `${width} row ${i}`).toBeLessThanOrEqual(3)
      expect(Math.abs(elbow.box.y - parent.bottom), `${width} row ${i}`).toBeLessThanOrEqual(1)
    }
    // agent-000.0 → agent-000.0.0 is the widened edge: green on both of its segments, grey elsewhere.
    expect(drawn[0].edges.map((e) => e.stroke)).not.toContain(FOREST)
    expect(drawn[1].edges.map((e) => e.stroke)).toEqual(expect.arrayContaining([FOREST]))
    expect(drawn[2].edges.map((e) => e.stroke)).toEqual([FOREST])
    expect(drawn[2].nodeFill).toBe(FOREST)
    // Nothing scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  }
})

// Forced colours leave SVG fills and strokes as authored, so on a dark high-contrast theme the ink
// root node, the exercised part of the bar and the green edge would sink into the page. The
// drawings take system colours there: every shape keeps 3:1 against the page, the exercised part
// stands apart from the held rest, and the widened edge and its node stay distinct from the others.
test('release 6 phase 3: in forced-colours mode the /over-grant drawings keep their contrast', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ forcedColors: 'active', colorScheme })
    await page.goto('/over-grant')
    await expect(page.locator('svg.og-bar')).toHaveCount(1)
    const drawn = await page.evaluate(() => {
      const ground = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) ?? []).map(Number)
      // A translucent system colour is measured as it is painted, over the page.
      const paint = (color: string) => {
        if (color === 'none') return null
        const [r, g, b, a = 1] = (color.match(/[\d.]+/g) ?? []).map(Number)
        return [r, g, b].map((v, i) => v * a + ground[i] * (1 - a))
      }
      const lum = (c: number[]) => {
        const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
      }
      const ratio = (a: number[] | null, b: number[] | null) => {
        if (!a || !b) return 1
        const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
        return (x + 0.05) / (y + 0.05)
      }
      const shapes = [...document.querySelectorAll('svg.og-bar > *, svg.og-chain__g > *')].map((el) => {
        const style = getComputedStyle(el)
        const fill = el.tagName === 'line' ? null : paint(style.fill), stroke = paint(style.stroke)
        return { cls: el.getAttribute('class')!, fill: style.fill, stroke: style.stroke, contrast: Math.max(ratio(fill, ground), ratio(stroke, ground)) }
      })
      const fillOf = (sel: string) => paint(getComputedStyle(document.querySelector(sel)!).fill)
      return { shapes, split: ratio(fillOf('rect.og-bar__used'), fillOf('rect.og-bar__held')) }
    })
    for (const shape of drawn.shapes) expect(shape.contrast, `${colorScheme}: ${shape.cls}`).toBeGreaterThanOrEqual(3)
    expect(drawn.split, colorScheme).toBeGreaterThanOrEqual(3)
    const stroke = (cls: string) => drawn.shapes.find((s) => s.cls === cls)!.stroke
    const fill = (cls: string) => drawn.shapes.find((s) => s.cls === cls)!.fill
    expect(stroke('og-chain__edge og-chain__edge--widened')).not.toBe(stroke('og-chain__edge'))
    expect(fill('og-chain__node og-chain__node--widened')).not.toBe(fill('og-chain__node og-chain__node--root'))
  }
})

test('release 6 phase 3: /security 05 draws each fixed state as its tree, and the panel keeps one visible svg', async ({ page }) => {
  await page.goto('/security')
  const panel = page.locator('#delegation')
  const fig = panel.getByRole('figure', { name: PANEL_REACH, exact: true })
  const trees = fig.locator('img.reach-fig__tree')
  await expect(trees).toHaveCount(2)
  await expect.poll(() => trees.evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true)
  const drawings = await trees.evaluateAll((imgs) => imgs.map((img) => {
    const el = img as HTMLImageElement
    const svg = new DOMParser().parseFromString(decodeURIComponent(el.src.replace(/^data:image\/svg\+xml,/, '')), 'image/svg+xml')
    return {
      alt: el.getAttribute('alt'), loaded: el.complete && el.naturalWidth > 0, width: el.getBoundingClientRect().width,
      circles: [...svg.querySelectorAll('circle')].map((c) => [c.getAttribute('cx'), c.getAttribute('cy'), c.getAttribute('fill')]),
      green: [...svg.querySelectorAll('line')].filter((l) => l.getAttribute('stroke') === '#2b523b').map((l) => [l.getAttribute('x2'), l.getAttribute('y2')]),
      lines: svg.querySelectorAll('line').length,
      texts: svg.querySelectorAll('text').length,
    }
  }))
  // The live tree's own six nodes and five edges at its coordinates; After widens ops → payroll-bot
  // (96, 254 is payroll-bot) and rings the root. Decorative: the words are the HTML around it.
  const nodes = [['300', '46'], ['168', '150'], ['432', '150'], ['96', '254'], ['240', '254'], ['432', '254']]
  for (const d of drawings) {
    expect([d.alt, d.loaded, d.lines, d.texts]).toEqual(['', true, 5, 0])
    expect(d.width).toBeGreaterThanOrEqual(150)
  }
  expect(drawings[0].circles.map(([x, y]) => [x, y])).toEqual(nodes)
  expect(drawings[0].green).toEqual([])
  expect(drawings[1].green).toEqual([['96', '236']])
  expect(drawings[1].circles).toHaveLength(7)
  expect(drawings[1].circles).toContainEqual(['96', '254', '#2b523b'])
  // The 05 tree pins hold: one visible svg in the panel, named, with its six labels.
  const tree = panel.locator('svg:visible')
  await expect(tree).toHaveCount(1)
  await expect(tree).toHaveAccessibleName('Delegation tree. Root reaches 5 of 9 sensitive resources.')
  await expect(tree.locator('text')).toHaveCount(6)
})

test('release 6 phase 3: home section 01 links to what runs today vs. the proposed pilot architecture', async ({ page }) => {
  await page.goto('/')
  const link = page.locator('#demo a[href="/reference-check-vs-runtime"]')
  await expect(link).toHaveCount(1)
  await expect(link).toHaveText('Read next: what runs in your browser today vs. the proposed pilot architecture →')
  await expect(link).toBeVisible()
  const box = (await link.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(await link.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
  // Home keeps its seven sections, in order.
  await expect(page.locator('[data-investor-section]')).toHaveCount(7)
  expect((await page.request.get('/reference-check-vs-runtime')).status()).toBe(200)
  await expect(page.locator('h1')).toBeVisible()
})
