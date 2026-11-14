import { test, expect, type Page } from '@playwright/test'

// Pass 2 Phase 1 — /trust gates scoreboard (D01)
//
// scripts/gates-all.sh cut a detail with no "N passed" summary at 70 characters, so four
// of the scoreboard's rows ended mid-phrase ("digest ca1"). The script now keeps the whole
// line, and the /trust renderer finishes those four cuts in snapshots stamped before the
// change. A restored ending is marked: a lighter shade, a dagger, a screen-reader note in
// the same span, and one line under the table. Both halves are served from fixtures, so a
// release that re-stamps public/trust/gates-summary.json does not change what is tested.

const VIEWPORTS = [
  { width: 1919, height: 998 },
  { width: 1280, height: 720 },
  { width: 430, height: 932 },
  { width: 375, height: 812 },
]
const LEGACY_CUTS = [/digest ca1$/, /reward 1, d$/, /\(reward$/, /\+ \d+ React$/]

type Summary = { generated_at: string, commit: string, tracked_clean: boolean, all_green: boolean, suites: { name: string; result: string; detail: string }[] }

// A copy of the tracked snapshot (public/trust/gates-summary.json at 9a4222b, stamped
// 2026-09-28 at 7dc4999). Its four 70-character details are the legacy cuts; the
// reward:diff cut keeps its trailing space.
const LEGACY: Summary = {
  generated_at: '2026-09-28T07:44:28Z',
  commit: '7dc4999',
  tracked_clean: true,
  all_green: true,
  suites: [
    { name: 'ts:build (workspaces)', result: 'PASS', detail: '✓ built in 65ms' },
    { name: 'ts:build (chronos-ui)', result: 'PASS', detail: '✓ built in 468ms' },
    { name: 'ts:origin-web (+evidence+verifier-core globs)', result: 'PASS', detail: 'Tests  806 passed (806)' },
    { name: 'ts:janus', result: 'PASS', detail: 'Tests  191 passed (191)' },
    { name: 'ts:@origin/evidence', result: 'PASS', detail: 'Tests  41 passed (41)' },
    { name: 'ts:@origin/verifier-core', result: 'PASS', detail: 'Tests  46 passed (46)' },
    { name: 'ev:verify:evidence', result: 'PASS', detail: 'ALL CHECKS PASSED' },
    { name: 'ev:proof:verify', result: 'PASS', detail: 'ALL CHECKS PASSED — TR-A002 hash chain verified (12 events, digest ca1' },
    { name: 'ev:env:verify', result: 'PASS', detail: 'VERIFIED — the score is reproducible under verifier 1.0.0 (reward 1, d' },
    { name: 'ev:reward:diff', result: 'PASS', detail: 'OK — every exploit is driven to 0 and every gold is preserved (reward ' },
    { name: 'ev:/verify selftest', result: 'PASS', detail: 'ALL PASS — /verify detect+verify logic reproduces under Node' },
    { name: 'honesty-lint', result: 'PASS', detail: 'honesty-lint: clean — 21 served pages (prose + meta/title) + 176 React' },
    { name: 'py:cobra', result: 'PASS', detail: '181 passed' },
    { name: 'py:chronos', result: 'PASS', detail: '411 passed, 5 skipped' },
  ],
}

// The four legacy lines as the renderer restores them (the honesty-lint counts after the
// cut vary by commit, so its ending stops at an ellipsis).
const RESTORED: Record<string, string> = {
  'ev:proof:verify': 'ALL CHECKS PASSED — TR-A002 hash chain verified (12 events, digest ca1d4690206e…)',
  'ev:env:verify': 'VERIFIED — the score is reproducible under verifier 1.0.0 (reward 1, digest 55abc08bbd18…). This is reproducibility under this verifier, not a claim the score is "correct".',
  'ev:reward:diff': 'OK — every exploit is driven to 0 and every gold is preserved (reward integrity holds).',
  'honesty-lint': 'honesty-lint: clean — 21 served pages (prose + meta/title) + 176 React copy files, …',
}
const MARK = '†'
const SR_NOTE = " (ending restored from the verifier's fixed output)"
const NOTE = "† Ending restored from the verifier's fixed output. This snapshot cut lines at 70 characters; release stamps from now on carry the whole line."

// Whole last lines as gates-all now stamps them (the honesty-lint counts are from
// 9a4222b and drift by commit). The env:verify line is the longest a stamp holds.
const FULL_LINES: Record<string, string> = {
  'ev:proof:verify': 'ALL CHECKS PASSED — TR-A002 hash chain verified (12 events, digest ca1d4690206e…)',
  'ev:env:verify': 'VERIFIED — the score is reproducible under verifier 1.0.0 (reward 1, digest 55abc08bbd18…). This is reproducibility under this verifier, not a claim the score is "correct".',
  'ev:reward:diff': 'OK — every exploit is driven to 0 and every gold is preserved (reward integrity holds).',
  'honesty-lint': 'honesty-lint: clean — 21 served pages (prose + meta/title) + 183 React copy files, 15 social cards + 3 caption files + cover template, 28 banned patterns, 3 required disclaimers, 52 launch contracts.',
}

// Every cell and detail box must fit its own width (nothing clipped or scrolled inside the
// table), and the page must not scroll sideways.
async function readBoard(page: Page) {
  const board = page.locator('#gates-scoreboard')
  await expect(board.locator('tbody tr').first()).toBeVisible()
  return board.evaluate((el) => {
    const boxes = [...el.querySelectorAll<HTMLElement>('td, .gates-detail')]
    return {
      rows: [...el.querySelectorAll('tbody tr')].map((tr) => ({
        name: tr.querySelector('td:last-child span')?.textContent ?? '',
        detail: tr.querySelector('.gates-detail')?.textContent ?? '',
        stamped: tr.querySelector('.gates-detail > span:first-child')?.textContent ?? '',
        restored: tr.querySelector('[data-completed]')?.textContent ?? '',
        text: (tr.textContent ?? '').replace(/\s+/g, ' ').trim(),
      })),
      details: el.querySelectorAll('.gates-detail').length,
      completed: el.querySelectorAll('[data-completed]').length,
      clipped: boxes.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => `${b.scrollWidth} > ${b.clientWidth}: ${b.textContent}`),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
}

// WCAG contrast of an element's text against the scoreboard's background.
async function contrast(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const rgb = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number)
    const lum = (c: number[]) => c.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    const a = lum(rgb(getComputedStyle(el).color))
    const b = lum(rgb(getComputedStyle(document.getElementById('gates-scoreboard')!).backgroundColor))
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })
}

for (const viewport of VIEWPORTS) {
  test(`pass 2: the /trust scoreboard shows whole verifier lines at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)

    // A snapshot stamped before the change: exactly its four cut lines are finished, each
    // ending marked, and one note under the table says so.
    await page.route('**/trust/gates-summary.json', (route) => route.fulfill({ json: LEGACY }))
    await page.goto('/trust')
    const legacy = await readBoard(page)
    expect(legacy.rows).toHaveLength(LEGACY.suites.length)
    expect(legacy.details).toBe(LEGACY.suites.length)
    expect(legacy.completed).toBe(4)
    expect(legacy.clipped).toEqual([])
    expect(legacy.overflow).toBeLessThanOrEqual(1)
    for (const { text } of legacy.rows) for (const cut of LEGACY_CUTS) expect(text).not.toMatch(cut)
    for (const [name, line] of Object.entries(RESTORED)) {
      const row = legacy.rows.find((r) => r.name === name)!
      const stamped = LEGACY.suites.find((s) => s.name === name)!.detail.trimEnd()
      expect(row.stamped, name).toBe(stamped)
      expect(row.restored, name).toBe(line.slice(stamped.length) + MARK + SR_NOTE)
      expect(row.detail, name).toBe(line + MARK + SR_NOTE)
    }
    const board = page.locator('#gates-scoreboard')
    await expect(board.locator('[data-completed] > [aria-hidden="true"]')).toHaveText(Array(4).fill(MARK))
    await expect(board.locator('[data-completed] > .sr-only')).toHaveText(Array(4).fill(SR_NOTE.trim()))
    const note = board.locator('.gates-restored')
    await expect(note).toHaveCount(1)
    await expect(note).toBeVisible()
    await expect(note).toHaveText(NOTE)
    expect(await contrast(page, '#gates-scoreboard [data-completed]')).toBeGreaterThanOrEqual(4.5)
    expect(await contrast(page, '#gates-scoreboard .gates-restored')).toBeGreaterThanOrEqual(4.5)

    // A stamp made after the change carries whole lines: they render as stamped, nothing is
    // added, no note appears, and the longest still wraps inside the scoreboard.
    const fresh: Summary = { ...LEGACY, suites: LEGACY.suites.map((s) => ({ ...s, detail: FULL_LINES[s.name] ?? s.detail })) }
    await page.unroute('**/trust/gates-summary.json')
    await page.route('**/trust/gates-summary.json', (route) => route.fulfill({ json: fresh }))
    await page.reload()
    const full = await readBoard(page)
    expect(full.completed).toBe(0)
    await expect(board.locator('.gates-restored')).toHaveCount(0)
    await expect(board).not.toContainText(MARK)
    expect(full.clipped).toEqual([])
    expect(full.overflow).toBeLessThanOrEqual(1)
    for (const [name, line] of Object.entries(FULL_LINES)) {
      expect(full.rows.find((r) => r.name === name)?.detail, name).toBe(line)
    }
  })
}
