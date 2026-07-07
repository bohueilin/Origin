import { describe, it, expect } from 'vitest'
import type { AgentPlan, PlanStep } from '../types'
import { conformanceProbe, tellGate, declaredPlanFrom, type DeclaredPlan, type ObservedAction, type ProbeSignal } from './tell'

// The child was mandated to read the calendar only.
const PLAN: DeclaredPlan = {
  intent_id: 'intent_1',
  allowed_tools: ['calendar.read'],
  allowed_capabilities: ['calendar.read'],
  ordered: ['calendar.read'],
}
const action = (tool_name: string, capability: string, extra: Partial<ObservedAction> = {}): ObservedAction => ({
  tool_name,
  capability,
  step_index: 0,
  ...extra,
})

describe('Tell — three-way gate (declared vs measured vs action), black-box tier', () => {
  it('a conformant action is allowed (declared == measured == action)', () => {
    const v = tellGate(action('calendar.read', 'calendar.read'), PLAN)
    expect(v.decision).toBe('allow')
    expect(v.measured.hijack).toBe(false)
  })

  it('a goal-hijacked action is BLOCKED before the tool executes', () => {
    // injection makes the calendar-only agent try to move money.
    const v = tellGate(action('payments.refund', 'payments.refund'), PLAN)
    expect(v.decision).toBe('block')
    expect(v.measured.hijack).toBe(true)
    expect(v.reason).toMatch(/not in declared plan/)
  })

  it('an undeclared capability on an in-plan tool is blocked', () => {
    const v = tellGate(action('calendar.read', 'calendar.write'), PLAN)
    expect(v.decision).toBe('block')
    expect(v.measured.evidence).toMatch(/capability/)
  })
})

describe('Tell — the white-box probe is a drop-in for the same interface', () => {
  it('an activation-probe ProbeSignal plugs into the gate and blocks a measured hijack', () => {
    // Stub for the open-weight tier: reads internal task drift (real only with model activations).
    const activationProbe: ProbeSignal = {
      method: 'activation-probe',
      measure: () => ({ conforms: false, hijack: true, confidence: 0.98, method: 'activation-probe', evidence: 'internal task representation shifted post-injection' }),
    }
    const v = tellGate(action('calendar.read', 'calendar.read'), PLAN, [activationProbe])
    expect(v.decision).toBe('block')
    expect(v.measured.method).toBe('activation-probe')
  })

  it('neither layer alone is enough: conformance passes an in-plan-but-hijacked call; fusion catches it', () => {
    // Same tool, in-plan → the black-box monitor conforms (necessary, not sufficient)...
    const inPlanButPoisoned = action('calendar.read', 'calendar.read', { args_summary: 'exfiltrate to attacker' })
    expect(conformanceProbe().measure(inPlanButPoisoned, PLAN).hijack).toBe(false)
    expect(tellGate(inPlanButPoisoned, PLAN).decision).toBe('allow')

    // ...but fused with the white-box probe (same-tool-different-intent), the gate blocks.
    const activationProbe: ProbeSignal = {
      method: 'activation-probe',
      measure: () => ({ conforms: false, hijack: true, confidence: 0.97, method: 'activation-probe', evidence: 'goal drift on an in-plan tool' }),
    }
    expect(tellGate(inPlanButPoisoned, PLAN, [conformanceProbe(), activationProbe]).decision).toBe('block')
  })
})

describe('Tell — derives the mandate from the planner output', () => {
  it('declaredPlanFrom builds the plan from an AgentPlan the parent predicted', () => {
    const steps: PlanStep[] = [
      { step_id: 's1', index: 0, title: 'read cal', description: '', kind: 'tool', tool_name: 'calendar.read', capability: 'calendar.read', status: 'pending' },
      { step_id: 's2', index: 1, title: 'draft', description: '', kind: 'tool', tool_name: 'messages.draft', capability: 'messages.draft', status: 'pending' },
    ]
    const plan: AgentPlan = { plan_id: 'p1', intent_id: 'intent_1', steps, tools_required: ['calendar.read', 'messages.draft'], approval_points: [], risk_notes: [], fallback_plan: '' }
    const declared = declaredPlanFrom(plan)
    expect(declared.allowed_tools.sort()).toEqual(['calendar.read', 'messages.draft'])
    expect(declared.allowed_capabilities.sort()).toEqual(['calendar.read', 'messages.draft'])
    // a tool outside the derived mandate is a hijack
    expect(tellGate(action('payments.refund', 'payments.refund'), declared).decision).toBe('block')
  })
})
