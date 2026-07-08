// Tell — measured-intent conformance for the Janus gate (black-box-first).
// =============================================================================
// Clean-room. Inspired by Agent Polygraph's declared-vs-measured-vs-action gate and
// SecureDelegate's predicted-plan (no code copied — see docs/PRIOR_ART.md).
//
// Intent-based access checks "declared vs. action" — but a declared intent is just text an
// injection can fake. Tell upgrades the gate to THREE-way: declared (the predicted plan) vs.
// MEASURED (a probe reads the agent's actual intent) vs. action. A goal-hijack is caught
// BEFORE the tool executes.
//
// A `ProbeSignal` measures intent. This file ships the black-box tier — a deterministic
// CONFORMANCE monitor (does the action fall within the declared plan?). The white-box tier —
// an activation-delta probe reading the model's internal task representation (the TaskTracker
// method, reimplemented from the paper) — is a drop-in for the SAME interface, and only real
// with open-weight model activations, so it is never claimed on API-only models.
//
// The layers FUSE (defence in depth): the black-box monitor catches out-of-plan actions; the
// white-box probe catches same-tool-different-intent hijacks the monitor alone misses. An
// action is blocked if ANY probe flags a hijack — neither layer alone is enough.
// =============================================================================

import type { AgentPlan, Capability } from '../types'

/** What the agent DECLARED it would do — the parent's predicted plan for a child. */
export interface DeclaredPlan {
  intent_id: string
  allowed_tools: string[]
  allowed_capabilities: Capability[]
  ordered?: string[] | null // optional expected tool sequence
}

/** One action the agent is ABOUT to take (evaluated pre-execution). */
export interface ObservedAction {
  tool_name: string
  capability: Capability
  step_index: number
  args_summary?: string
}

export interface IntentMeasurement {
  conforms: boolean
  hijack: boolean // measured intent diverged from the mandate
  confidence: number // [0,1]
  method: string // 'conformance' (black-box) | 'activation-probe' (white-box) | ...
  evidence: string
}

/** A probe that MEASURES intent. Black-box + white-box implementations share this contract. */
export interface ProbeSignal {
  readonly method: string
  measure(observed: ObservedAction, plan: DeclaredPlan): IntentMeasurement
}

/** Black-box conformance monitor: the action's tool + capability must be within the declared plan. */
export function conformanceProbe(): ProbeSignal {
  return {
    method: 'conformance',
    measure(observed, plan) {
      const toolOk = plan.allowed_tools.includes(observed.tool_name)
      const capOk = plan.allowed_capabilities.includes(observed.capability)
      const orderOk = !plan.ordered || plan.ordered.length === 0 || plan.ordered.includes(observed.tool_name)
      const conforms = toolOk && capOk && orderOk
      const reasons: string[] = []
      if (!toolOk) reasons.push(`tool ${observed.tool_name} not in declared plan`)
      if (!capOk) reasons.push(`capability ${observed.capability} not declared`)
      if (!orderOk) reasons.push(`tool ${observed.tool_name} out of declared order`)
      return {
        conforms,
        hijack: !conforms,
        confidence: 1, // deterministic monitor: certain either way
        method: 'conformance',
        evidence: conforms ? 'action within the declared mandate' : reasons.join('; '),
      }
    },
  }
}

export interface TellVerdict {
  decision: 'allow' | 'block'
  measured: IntentMeasurement
  measurements: IntentMeasurement[]
  reason: string
}

/**
 * The three-way gate: declared (plan) vs. measured (probes) vs. action. Runs BEFORE the tool
 * executes. Blocks if ANY probe flags a hijack (fusion / defence in depth) — a goal-hijack is
 * stopped pre-tool-call even when a naive scope check would allow it.
 */
export function tellGate(action: ObservedAction, plan: DeclaredPlan, probes: ProbeSignal[] = [conformanceProbe()]): TellVerdict {
  const measurements = probes.map((p) => p.measure(action, plan))
  const hijack = measurements.find((m) => m.hijack)
  if (hijack) {
    return { decision: 'block', measured: hijack, measurements, reason: `measured-intent hijack (${hijack.method}): ${hijack.evidence}` }
  }
  return { decision: 'allow', measured: measurements[0], measurements, reason: 'declared == measured == action' }
}

/** Derive a DeclaredPlan from the planner's AgentPlan — the mandate the child's actions are measured against. */
export function declaredPlanFrom(plan: AgentPlan): DeclaredPlan {
  const tools = new Set<string>()
  const caps = new Set<Capability>()
  const ordered: string[] = []
  for (const s of plan.steps ?? []) {
    if (s.tool_name) {
      tools.add(s.tool_name)
      ordered.push(s.tool_name)
    }
    if (s.capability) caps.add(s.capability)
  }
  for (const t of plan.tools_required ?? []) tools.add(t)
  return { intent_id: plan.intent_id, allowed_tools: [...tools], allowed_capabilities: [...caps], ordered }
}
