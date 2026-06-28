// IntentMonitor — runtime intent-conformance enforcement (Passport feature #1).
//
// A CapabilityGrant is scoped to a DECLARED intent. The grant tells you what the agent *may*
// touch; the intent tells you *why*. This monitor judges, for every action the agent takes,
// whether that action stays WITHIN the justified purpose — and CONTAINS divergence when it
// doesn't.
//
// The "intent envelope" is the legitimately-justified capability set for this run:
//   envelope = grant.allowed_capabilities ∪ grant.requires_approval_for
// i.e. the read/prepare caps the agent was granted, plus the commit caps the scenario
// declared (each reachable only behind an explicit human approval). Anything OUTSIDE that set
// is, by construction, outside the declared purpose — divergence.
//
// Severity ladder:
//   ok    — conforming: capability is inside the envelope.
//   warn  — diverged but soft: an unexpected-but-not-dangerous out-of-envelope capability.
//   block — diverged and dangerous: a GLOBAL_FORBIDDEN capability (payment.spend,
//           credential.unrestricted), or a side-effecting commit the scenario never declared.
//           A 'block' verdict REFUSES the action and flips the run into a contained state.
//
// This is deterministic and side-effect-free; the session decides what to do with a verdict.

import type { Capability, CapabilityGrant } from '../types'
import { GLOBAL_FORBIDDEN, isSideEffecting } from '../capabilities'

export type ConformanceVerdict = 'conforming' | 'diverged'
export type ConformanceSeverity = 'ok' | 'warn' | 'block'

export interface ConformanceCheck {
  id: string
  /** Human-readable label of the action being judged (the plan step title). */
  action: string
  capability: Capability
  verdict: ConformanceVerdict
  severity: ConformanceSeverity
  reason: string
  ts: number
}

export interface CheckConformanceArgs {
  /** The capability the action wants to exercise. */
  capability: Capability
  /** Human-readable label of the action (usually the plan step title). */
  action: string
  /** True if this action is a side-effecting commit (vs. a read/prepare). */
  sideEffecting?: boolean
}

export interface ConformanceResult {
  verdict: ConformanceVerdict
  reason: string
  severity: ConformanceSeverity
}

/**
 * Derive the intent envelope for a grant: the legitimately-justified capability set.
 * Read/prepare caps the agent holds + the commit caps the scenario declared (approval-gated).
 */
export function intentEnvelope(grant: CapabilityGrant): Capability[] {
  return uniq([...grant.allowed_capabilities, ...grant.requires_approval_for])
}

export class IntentMonitor {
  private readonly grant: CapabilityGrant
  private readonly envelopeSet: Set<Capability>
  private readonly now: () => number
  private seq = 0

  constructor(grant: CapabilityGrant, now: () => number) {
    this.grant = grant
    this.now = now
    this.envelopeSet = new Set(intentEnvelope(grant))
  }

  get envelope(): Capability[] {
    return [...this.envelopeSet]
  }

  /**
   * Judge whether one action stays within the declared intent. Pure — does not mutate the
   * monitor's history (use record() to persist the produced check into a checks array).
   */
  checkConformance(args: CheckConformanceArgs): ConformanceResult {
    const cap = args.capability
    const sideEffecting = args.sideEffecting ?? isSideEffecting(cap)

    // 1) Categorically forbidden capability requested → hard divergence, always blocked.
    if (GLOBAL_FORBIDDEN.includes(cap)) {
      return {
        verdict: 'diverged',
        severity: 'block',
        reason: `Action requests "${cap}", a categorically forbidden capability outside the declared intent "${this.grant.scope}".`,
      }
    }

    // 2) Inside the justified envelope → conforming.
    if (this.envelopeSet.has(cap)) {
      return {
        verdict: 'conforming',
        severity: 'ok',
        reason: `"${cap}" is within the intent's justified envelope.`,
      }
    }

    // 3) Outside the envelope. A side-effecting commit the scenario never declared is the
    //    dangerous case — refuse it. A non-committing out-of-envelope read is softer (warn).
    if (sideEffecting) {
      return {
        verdict: 'diverged',
        severity: 'block',
        reason: `Action attempts commit "${cap}" that the declared intent never justified — outside the granted envelope.`,
      }
    }
    return {
      verdict: 'diverged',
      severity: 'warn',
      reason: `Action uses "${cap}" outside the declared intent's envelope; flagged but not dangerous on its own.`,
    }
  }

  /** Run checkConformance and materialize a persistable ConformanceCheck record. */
  record(args: CheckConformanceArgs): ConformanceCheck {
    const r = this.checkConformance(args)
    this.seq += 1
    return {
      id: `conf_${this.seq.toString().padStart(3, '0')}`,
      action: args.action,
      capability: args.capability,
      verdict: r.verdict,
      severity: r.severity,
      reason: r.reason,
      ts: this.now(),
    }
  }
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}
