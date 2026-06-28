import { describe, expect, it } from 'vitest'
import { computeAuditDigest, stableStringify } from './digest.ts'

describe('stableStringify', () => {
  it('is key-order deterministic', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }))
  })

  it('canonicalizes nested objects regardless of key order', () => {
    const a = { outer: { x: 1, y: 2 }, list: [{ p: 1, q: 2 }] }
    const b = { list: [{ q: 2, p: 1 }], outer: { y: 2, x: 1 } }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })
})

describe('computeAuditDigest', () => {
  // A minimal row touching a few allow-listed fields. Key order varies below.
  const base: Record<string, unknown> = {
    trace_id: 't1',
    run_id: 'r1',
    scenario_id: 'com-1',
    scenario_title: 'Refund within policy',
    action: 'act',
    reward: 1,
  }

  it('is stable for equivalent rows with different object key order', () => {
    const reordered: Record<string, unknown> = {
      reward: 1,
      action: 'act',
      scenario_title: 'Refund within policy',
      scenario_id: 'com-1',
      run_id: 'r1',
      trace_id: 't1',
    }
    expect(computeAuditDigest(base)).toBe(computeAuditDigest(reordered))
  })

  it('changes when an allow-listed field changes', () => {
    const original = computeAuditDigest(base)
    expect(computeAuditDigest({ ...base, scenario_title: 'Something else' })).not.toBe(original)
    expect(computeAuditDigest({ ...base, action: 'escalate' })).not.toBe(original)
  })

  it('does not change when excluded fields change', () => {
    const original = computeAuditDigest(base)
    const withExcluded = {
      ...base,
      id: 'insforge-id-123',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
      created_at: '2026-03-03T00:00:00.000Z',
      audit_row_digest: 'deadbeef',
    }
    expect(computeAuditDigest(withExcluded)).toBe(original)
  })
})
