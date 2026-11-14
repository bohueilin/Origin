import { test, expect, type Page } from '@playwright/test'

// Pass 2 follow-up — /reference-check battery qualifier and over-grant mark
// The static preset comparison under the shot04 recording scores the customer-support battery.
// One line under it says so and gives the IAM battery's scores for the same two presets, as
// the shipped oracle returns them. In the interactive result table, an over-grant row is marked
// with the ink no-entry glyph of the static figures (an aria-hidden SVG beside the word), not
// the colour emoji, which renders red.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim()

// Each preset's summary on a battery, from the code /verify replays, with the stricter-miss count.
async function presetScores(scenario: 'support' | 'iam', preset: 'least-privilege' | 'permissive') {
  const { buildPolicyEvaluation } = await import('@origin/verifier-core/policyEvaluation')
  const { missDirection } = await import('@origin/verifier-core/missDirection')
  const { PRESETS, SUPPORT_PRESETS } = await import('../../src/certify/policySpec')
  const { label, spec } = (scenario === 'iam' ? PRESETS : SUPPORT_PRESETS)[preset]
  const evaluation = buildPolicyEvaluation({ scenario, parameters: spec })
  const differing = evaluation.decisions.filter((row) => row.decision !== row.expected)
  const stricter = differing.filter((row) => missDirection(row.decision, row.expected) === 'stricter').length
  return { label, summary: evaluation.summary, stricter }
}

test('pass 2 follow-up: the comparison names its battery and gives the IAM battery\'s scores', async ({ page }) => {
  const { SUPPORT_GYM_VERSION } = await import('@origin/verifier-core/supportGym')
  const { IAM_GYM_VERSION } = await import('@origin/verifier-core/iamGym')
  const lp = await presetScores('iam', 'least-privilege')
  const perm = await presetScores('iam', 'permissive')
  // The owner's numbers, as the oracle returns them: no over-grant under least-privilege, so its
  // one miss is the stricter one.
  expect([lp.summary.matched, lp.summary.total, lp.summary.over_grants, lp.summary.misses, lp.stricter]).toEqual([11, 12, 0, 1, 1])
  expect([perm.summary.matched, perm.summary.total]).toEqual([3, 12])
  // The preset names are the ones the page's buttons show.
  expect(lp.label.startsWith('Least-privilege')).toBe(true)
  expect(perm.label.startsWith('Permissive')).toBe(true)

  await page.goto('/reference-check')
  const fig = page.locator('#rcx-compare')
  const line = fig.locator('#rcx-battery')
  await expect(line).toBeVisible()
  expect(squash(await line.textContent())).toBe(
    `Scores above are for the customer-support synthetic battery (${SUPPORT_GYM_VERSION}); on the IAM battery (${IAM_GYM_VERSION}), ` +
    `Least-privilege matches ${lp.summary.matched} of ${lp.summary.total} (${lp.stricter} stricter miss) and Permissive matches ${perm.summary.matched} of ${perm.summary.total}.`,
  )
  await expect(line.locator('code')).toHaveText([SUPPORT_GYM_VERSION, IAM_GYM_VERSION])
  // It follows the support battery's grading note, inside the figure whose scores it qualifies.
  expect(await line.evaluate((el) => el.previousElementSibling?.matches('.rcx-fig__note') ?? false)).toBe(true)
  expect(await line.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)

  // The battery id is the one the tool shows when the IAM scenario is picked.
  await page.getByRole('button', { name: /IAM least-privilege/ }).click()
  await expect(page.locator('.rc-policy .rc-hint').first()).toContainText(IAM_GYM_VERSION)
})

// Runs the reference check and then the permissive baseline for one scenario, as smoke.spec.ts does.
async function permissiveRun(page: Page, scenario: RegExp, matched: string) {
  await page.getByRole('button', { name: scenario }).click()
  await page.getByRole('button', { name: 'Run the reference check', exact: true }).click()
  await page.getByRole('button', { name: 'Try the permissive baseline', exact: true }).press('Enter')
  await expect(page.locator('.rc-verdict b')).toHaveText(matched)
}

// A computed colour in the red family: a saturated hue within 25 degrees of red.
function isRed(colour: string) {
  const m = colour.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/)
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return false
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => Number(v) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d === 0) return false
  const l = (max + min) / 2, s = d / (1 - Math.abs(2 * l - 1))
  const h = ((max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360
  return s > 0.25 && (h <= 25 || h >= 335)
}

test('pass 2 follow-up: over-grant rows carry the ink mark, not the red emoji', async ({ page }) => {
  for (const [scenario, key] of [[/Customer-support agent/, 'support'], [/IAM least-privilege/, 'iam']] as const) {
    const { summary } = await presetScores(key, 'permissive')
    await page.goto('/reference-check')
    await permissiveRun(page, scenario, `${summary.matched} of ${summary.total}`)

    const table = page.locator('.rc-table')
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(summary.total)
    expect(await table.textContent()).not.toContain('⛔')
    const over = rows.filter({ has: page.locator('td:last-child', { hasText: 'over-grant' }) })
    await expect(over).toHaveCount(summary.over_grants)
    // The word is the cell's only text; the mark is one aria-hidden SVG before it.
    await expect(over.locator('td:last-child')).toHaveText(Array(summary.over_grants).fill('over-grant'))
    for (const cell of await over.locator('td:last-child').all()) {
      await expect(cell.locator('svg')).toHaveCount(1)
      const mark = await cell.evaluate((td) => {
        const svg = td.querySelector('svg')!
        const word = [...td.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.includes('over-grant'))!
        const range = document.createRange()
        range.selectNodeContents(word)
        const box = svg.getBoundingClientRect(), text = range.getBoundingClientRect()
        return {
          hidden: svg.closest('[aria-hidden="true"]') !== null,
          before: (svg.compareDocumentPosition(word) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
          height: box.height, fontSize: parseFloat(getComputedStyle(td).fontSize),
          within: box.top >= text.top - 0.5 && box.bottom <= text.bottom + 0.5,
          shapes: svg.innerHTML,
        }
      })
      expect(mark.hidden).toBe(true)
      expect(mark.before).toBe(true)
      // Sized to the table text and on its line.
      expect(mark.height).toBeGreaterThan(0)
      expect(mark.height).toBeLessThanOrEqual(mark.fontSize)
      expect(mark.within).toBe(true)
      // The same glyph as the over-grant mark in the static key below.
      expect(mark.shapes).toBe(await page.locator('.rcx-key dt').nth(3).locator('svg').evaluate((svg) => svg.innerHTML))
    }

    // Nothing in an over-grant row's verdict cell is coloured red.
    const colours = await over.locator('td:last-child').evaluateAll((cells) => cells.flatMap((td) => [td, ...td.querySelectorAll('*')])
      .flatMap((el) => { const cs = getComputedStyle(el); return [cs.color, cs.fill, cs.stroke] }))
    expect(colours.length).toBeGreaterThan(0)
    expect(colours.filter(isRed)).toEqual([])
    // The match and miss rows are not counted as over-grants.
    await expect(rows.filter({ hasText: 'over-grant' })).toHaveCount(summary.over_grants)
    await expect(rows.filter({ hasText: '✓ match' })).toHaveCount(summary.matched)
    await expect(rows.filter({ hasText: '△ miss' })).toHaveCount(summary.misses)
  }
})
