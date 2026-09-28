import { test, expect } from '@playwright/test'

// Test roles at their actual rendered sizes: instructions, provenance, then UI labels.
const routes = [
  { route: '/app', prose: '.ec__note, .proofstrip__val', integrity: '.proofstrip__pill, .proofstrip__cap' },
  { route: '/proof', prose: '.tr2why__a, .tr2-not, .tr2-verify__cap, .proof__foot', integrity: '.tr2-verify__lbl' },
  { route: '/proving-ground', prose: '.field-hint, .triad-meaning, .trust-note, .pg-episode__meta, .pg-verdict__scope', integrity: '.site-fleet-tag', label: '.smp-fleet-active, .panel-kicker, .smp-rtype-chip b' },
  { route: '/capture', prose: '.voice-hint, .voice-note, .field-hint, .empty-upload, .site-gym-empty, .trust-note', integrity: '.input-ledger span, .pipeline-chip > span', label: '.panel-kicker' },
  { route: '/foundry', prose: '.fdy-passport-gym__caption, .fdy-passport-gym__proof, .fdy-rsi-card__note, .fdy-train__caption, .fdy-brainline' },
  { route: '/soc', prose: '.cpt__honest, .cpt__col li, .pp-narrate-note' },
  { route: '/clip', prose: '.clip__consent p, .clip__footer, .clip__live', integrity: '.clip__attack-tag, .clip__provenance' },
  { route: '/passport', prose: '.pp-usecase-prompt, .pp-usecase-safety, .pp-readonly-tx, .pp-voice-readonly, .pp-foot-mid', integrity: '.pp-usecase-badge', label: '.pp-sponsor-role' },
  { route: '/auth', prose: '.ap-paused, .ap-pilot-note, .ap-legal, .ap-alt' },
  { route: '/admin', prose: '.ap-owner-note, .ap-pilot-note, .ap-legal' },
]
for (const config of routes) test(`interactive explanations and provenance remain legible: ${config.route}`, async ({ page }) => {
  await page.route('**/*', request => {
    const url = new URL(request.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/') ? request.continue() : request.abort('blockedbyclient')
  })
  await page.goto(config.route)
  await expect(page.locator(config.prose).first()).toBeVisible()
  for (const [role, minimum, leading] of [['prose', 14, 1.65], ['integrity', 12, 1.5], ['label', 11, 1.5]] as const) {
    const selector = config[role as keyof typeof config]
    if (!selector) continue
    const metrics = await page.locator(selector).evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => {
      const s = getComputedStyle(el)
      return { text: el.textContent?.slice(0, 90), size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) }
    }))
    expect(metrics.length, `${role} is exercised`).toBeGreaterThan(0)
    for (const m of metrics) {
      expect(m.size, `${role}: ${m.text}`).toBeGreaterThanOrEqual(minimum)
      expect(m.line, `${role}: ${m.text}`).toBeGreaterThanOrEqual(m.size * leading - .02)
    }
  }
})
