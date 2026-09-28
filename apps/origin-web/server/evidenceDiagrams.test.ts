import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderTraceDiagram, renderPostureDiagram, renderPostureCards, validateTrace } from '../scripts/evidence-diagrams.ts'
import { PRODUCT_POSTURE } from '../scripts/product-status.ts'
const trace = JSON.parse(readFileSync(new URL('../public/proof/tr-a002.json', import.meta.url), 'utf8'))
const summary = JSON.parse(readFileSync(new URL('../public/proof/tr-a002-summary.json', import.meta.url), 'utf8'))

describe('artifact-derived diagrams', () => {
  it('renders all real nodes and links in both layouts and an accessible ordered list', () => {
    const html = renderTraceDiagram(trace, summary)
    expect((html.match(/data-trace-node=/g) ?? []).length).toBe(trace.event_count * 2)
    expect((html.match(/<li>/g) ?? []).length).toBe(trace.event_count)
    for (const [i, event] of trace.events.entries()) {
      expect(html).toContain(event.action)
      expect(html).toContain(event.event_hash.slice(0, 8))
      if (i) expect(event.prev_hash).toBe(trace.events[i - 1].event_hash)
    }
    expect(html).toContain(summary.final_digest.slice(0, 12))
    expect(html).toContain(summary.verify_command)
    expect(html).toContain('<title')
  })
  it('rejects a changed event, broken link, incorrect count or summary digest', () => {
    expect(() => validateTrace({ ...trace, event_count: 1 }, summary)).toThrow()
    const altered = structuredClone(trace); altered.events[0].action = 'changed'
    expect(() => validateTrace(altered, summary)).toThrow()
    const broken = structuredClone(trace); broken.events[1].prev_hash = '0'.repeat(64)
    expect(() => validateTrace(broken, summary)).toThrow()
    expect(() => validateTrace(trace, { ...summary, final_digest: '0'.repeat(64) })).toThrow()
  })
  it('uses the same statuses for cards and both diagram layouts', () => {
    const diagram = renderPostureDiagram(), cards = renderPostureCards()
    expect(PRODUCT_POSTURE.filter(p => p.status === 'Available now')).toHaveLength(2)
    for (const item of PRODUCT_POSTURE) { expect(cards).toContain(item.title); expect(cards).toContain(item.status); expect(diagram).toContain(item.status) }
    const future = [...diagram.matchAll(/<g data-proposed="true"[^>]*>([\s\S]*?)<\/g>/g)]
    expect(future).toHaveLength(2)
    for (const [, lane] of future) {
      expect(lane).toContain('Proposed — not built')
      expect(lane).not.toMatch(/\b(live|active|running)\b/i)
      expect(lane).not.toContain('--signal')
      expect(lane).toContain('stroke-dasharray')
    }
  })
})
