import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  analyzeOverGrant,
  effectiveScopes,
  generateCorpus,
  isSensitive,
  resources,
  scoreAgainstGroundTruth,
} from '@origin/verifier-core/overGrant'

// over-grant.html draws the recorded run as static figures (Pass 2 Phase 2). Their numbers
// are typed into the HTML, so recompute them here the way the 06 panel does: the clean
// seeded fleet, the first identity three levels deep widened by the first sensitive scope
// its root cannot reach, and the planted corpus scored against its ground truth.
const html = readFileSync(new URL('../../over-grant.html', import.meta.url), 'utf8')
const figures = html.match(/<section class="section og-figs"[\s\S]*?<\/section>/)?.[0] ?? ''
const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

describe('/over-grant recorded-run figures', () => {
  const clean = generateCorpus({ seed: 20260818, roots: 400, depth: 4, violationRate: 0 })
  const { gur, bri } = analyzeOverGrant(clean).metrics
  const sensitive = resources.filter(isSensitive).map((r) => r.id)
  const deep = clean.identities.find((i) => i.id.split('.').length >= 3)!
  const rootId = deep.id.split('.')[0]
  const reach = (corpus: typeof clean) => {
    const scopes = [...effectiveScopes(corpus).get(rootId)!]
    return sensitive.filter((id) => scopes.some((s) => s.startsWith(`${id}:`)))
  }
  const before = reach(clean)
  const target = sensitive.find((id) => !before.includes(id))!
  const widened = {
    ...clean,
    identities: clean.identities.map((i) => (i.id === deep.id ? { ...i, granted: [...i.granted, `${target}:read`].sort() } : i)),
  }
  const after = reach(widened)
  const planted = generateCorpus({ seed: 20260818, roots: 400, depth: 4, violationRate: 0.06 })
  const score = scoreAgainstGroundTruth(analyzeOverGrant(planted), planted.planted)

  it('states the fleet it was drawn from', () => {
    expect(figures).toContain(`seed 20260818, 400 roots, ${fmt(clean.identities.length)} synthetic identities, a ${clean.windowDays}-day window`)
  })

  it('splits granted scopes into exercised and never exercised', () => {
    const idle = gur.scopesGranted - gur.scopesExercised
    expect(figures).toContain(`<b>${fmt(gur.scopesGranted)}</b> granted scopes`)
    expect(figures).toContain(`style="width: ${pct(gur.fleetGur)}"`)
    expect(figures).toContain(`<dd data-og="exercised">${fmt(gur.scopesExercised)} · ${pct(gur.fleetGur)}</dd>`)
    expect(figures).toContain(`<dd data-og="never"><b>${fmt(idle)} · ${pct(gur.overGrantSurface)}</b></dd>`)
  })

  it('draws the widened path and the root reach before and after', () => {
    expect(deep.parent).toBe(`${rootId}.0`)
    expect(deep.id.split('.').length - 1).toBe(2)
    expect(clean.identities.find((i) => i.id === deep.parent)!.granted.some((s) => s.startsWith(`${target}:`))).toBe(false)
    expect(figures).toContain(`<code>${rootId}</code> root`)
    expect(figures).toContain(`<code>${deep.parent}</code> holds no ${target} scope`)
    expect(figures).toContain(`<code>${deep.id}</code> gains <code>${target}:read</code>, two hops below the root`)
    expect(figures).toContain(`<b data-og="before">${before.length} of ${bri.sensitiveResources}</b> (${pct(before.length / bri.sensitiveResources)})`)
    expect(figures).toContain(`<b data-og="after">${after.length} of ${bri.sensitiveResources}</b> (${pct(after.length / bri.sensitiveResources)})`)
    const nodes = (state: string) => {
      const list = figures.match(new RegExp(`aria-label="${state}: sensitive resources">([\\s\\S]*?)</ul>`))?.[1] ?? ''
      return [...list.matchAll(/data-reach="(\w+)">([\w-]+)</g)].map(([, mark, id]) => [id, mark])
    }
    expect(nodes('Before')).toEqual(sensitive.map((id) => [id, before.includes(id) ? 'reached' : 'none']))
    expect(nodes('After')).toEqual(sensitive.map((id) => [id, id === target ? 'new' : after.includes(id) ? 'reached' : 'none']))
  })

  it('states the planted-edge result', () => {
    expect(figures).toContain(`with ${score.amv.planted} planted widened edges`)
    expect(figures).toContain(`<b data-og="planted">${score.amv.caught} of ${score.amv.planted}, with ${score.amv.falsePositives} false positives</b>`)
  })
})
