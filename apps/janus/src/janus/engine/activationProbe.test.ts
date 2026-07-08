import { describe, it, expect } from 'vitest'
import { trainActivationProbe, makeActivationProbe, type ActivationDelta } from './activationProbe'
import { conformanceProbe, tellGate, type DeclaredPlan, type ObservedAction } from './tell'

// ── SYNTHETIC FIXTURE (labeled) ──────────────────────────────────────────────
// These are NOT real model activations. They stand in for the hidden-state deltas an
// open-weight model would emit, so we can test the probe's math deterministically. A real
// deployment feeds true activations via readActivations; we never claim these are measured.
const cleanDeltas: ActivationDelta[] = [
  { vector: [0.02, -0.01, 0.0, 0.03] },
  { vector: [-0.01, 0.02, 0.01, -0.02] },
  { vector: [0.0, 0.0, -0.02, 0.01] },
]
const poisonedDeltas: ActivationDelta[] = [
  { vector: [0.9, 0.8, -0.7, 0.85] },
  { vector: [0.85, 0.75, -0.65, 0.9] },
  { vector: [0.95, 0.82, -0.72, 0.88] },
]

const PLAN: DeclaredPlan = {
  intent_id: 'intent_1',
  allowed_tools: ['calendar.read'],
  allowed_capabilities: ['calendar.read'],
  ordered: ['calendar.read'],
}
const action = (extra: Partial<ObservedAction> = {}): ObservedAction => ({
  tool_name: 'calendar.read',
  capability: 'calendar.read',
  step_index: 0,
  ...extra,
})

describe('Tell white-box — activation-delta probe (TaskTracker method)', () => {
  const weights = trainActivationProbe(cleanDeltas, poisonedDeltas)

  it('a clean (in-task) activation delta conforms — no hijack', () => {
    const probe = makeActivationProbe({ weights, readActivations: () => ({ vector: [0.01, 0.0, -0.01, 0.02] }) })
    const m = probe.measure(action(), PLAN)
    expect(m.hijack).toBe(false)
    expect(m.conforms).toBe(true)
    expect(m.method).toBe('activation-probe')
    expect(m.confidence).toBeGreaterThan(0)
  })

  it('a poisoned (task-drifted) activation delta is flagged as a hijack', () => {
    const probe = makeActivationProbe({ weights, readActivations: () => ({ vector: [0.92, 0.79, -0.68, 0.87] }) })
    const m = probe.measure(action(), PLAN)
    expect(m.hijack).toBe(true)
    expect(m.evidence).toMatch(/drift|TaskTracker/i)
  })

  it('HONESTY GATE: with NO activations (API-only model) the probe abstains, never claims a result', () => {
    const probe = makeActivationProbe({ weights, readActivations: () => null })
    const m = probe.measure(action(), PLAN)
    expect(m.hijack).toBe(false) // does not fabricate a hijack
    expect(m.confidence).toBe(0) // contributes nothing to the fused gate
    expect(m.evidence).toMatch(/no model activations|inactive|API-only/i)
  })

  it('fuses in tellGate: catches a same-tool, in-plan action whose INTERNAL intent drifted', () => {
    // Black-box conformance ALONE passes this (tool + capability are in-plan)...
    const inPlanButPoisoned = action({ args_summary: 'read calendar (but injection redirected the goal)' })
    expect(conformanceProbe().measure(inPlanButPoisoned, PLAN).hijack).toBe(false)
    expect(tellGate(inPlanButPoisoned, PLAN).decision).toBe('allow')

    // ...but the white-box probe reads the drifted internal representation and the fused gate blocks.
    const wb = makeActivationProbe({ weights, readActivations: () => ({ vector: [0.9, 0.8, -0.7, 0.86] }) })
    const fused = tellGate(inPlanButPoisoned, PLAN, [conformanceProbe(), wb])
    expect(fused.decision).toBe('block')
    expect(fused.measured.method).toBe('activation-probe')
  })

  it('abstaining white-box probe does not break the black-box gate (API-only fallback)', () => {
    const wb = makeActivationProbe({ weights, readActivations: () => null })
    // in-plan action → still allowed (white-box abstains, black-box conforms)
    expect(tellGate(action(), PLAN, [conformanceProbe(), wb]).decision).toBe('allow')
    // out-of-plan action → still blocked by black-box alone
    const outOfPlan = action({ tool_name: 'payments.refund', capability: 'payments.refund' })
    expect(tellGate(outOfPlan, PLAN, [conformanceProbe(), wb]).decision).toBe('block')
  })

  it('trainActivationProbe is deterministic and fails closed on empty input', () => {
    const a = trainActivationProbe(cleanDeltas, poisonedDeltas)
    const b = trainActivationProbe(cleanDeltas, poisonedDeltas)
    expect(a).toEqual(b)
    expect(() => trainActivationProbe([], poisonedDeltas)).toThrow()
  })
})
