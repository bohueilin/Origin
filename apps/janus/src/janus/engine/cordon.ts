// Cordon — containment for an org of agents (Janus governance layer).
// =============================================================================
// Clean-room. Inspired by the CORDON + QuarantineAI containment pattern; no code
// was copied (see docs/PRIOR_ART.md). Two guarantees, both deterministic + local:
//
//   1. The credential broker REFUSES to resolve a secret for a TAINTED agent —
//      the secret is never even fetched (we throw before the broker is called).
//   2. On compromise, only the poisoned SUB-TREE freezes; clean agents keep
//      working. The blast radius (how many agents were exposed before containment)
//      is measured.
//
// An agent becomes "tainted"/exposed the moment it ingests content from an
// untrusted source (an inbound email, a web page, a tool result). Taint is a
// property of the AGENT, tracked outside its own context — so a "don't tell the
// guard" injection in the content has no surface to act on.
// =============================================================================

import type { Capability, ScopedSecretRequest, ScopedSecretResult, SecretBroker } from '../types'

export interface TaintMark {
  agent_id: string
  source: string
  reason: string
  ts: number
}

export type CordonEventKind = 'cordon.exposed' | 'cordon.secret_refused' | 'cordon.frozen'
export interface CordonEvent {
  kind: CordonEventKind
  agent_id: string
  summary: string
  capability?: Capability
  detail?: Record<string, unknown>
}

/** One edge of the delegation tree: an agent and the parent that delegated to it. */
export interface DelegationEdge {
  agent_id: string
  parent_id: string | null
}

export interface FreezeResult {
  compromised: string
  frozen: string[]
  spared: string[]
  blast_radius: number
}

/** Thrown when the broker is asked to resolve a secret for a tainted/frozen agent. */
export class CordonRefusal extends Error {
  readonly agent_id: string
  readonly capability: Capability
  readonly reason: string
  constructor(agent_id: string, capability: Capability, reason: string) {
    super(`Cordon refused ${capability} for exposed agent ${agent_id}: ${reason}`)
    this.name = 'CordonRefusal'
    this.agent_id = agent_id
    this.capability = capability
    this.reason = reason
  }
}

export function createCordon(opts: { now?: () => number; onEvent?: (e: CordonEvent) => void } = {}) {
  const now = opts.now ?? Date.now
  const onEvent = opts.onEvent ?? (() => {})
  const tainted = new Map<string, TaintMark>()
  const frozen = new Set<string>()
  const emit = (e: CordonEvent) => {
    onEvent(e)
    return e
  }

  return {
    /** An agent ingested content from an untrusted source → mark it exposed. */
    markExposed(agent_id: string, source: string, reason = 'ingested untrusted content'): TaintMark {
      const mark: TaintMark = { agent_id, source, reason, ts: now() }
      tainted.set(agent_id, mark)
      emit({ kind: 'cordon.exposed', agent_id, summary: `${agent_id} exposed to untrusted content via ${source}`, detail: { source, reason } })
      return mark
    },
    isTainted: (agent_id: string): boolean => tainted.has(agent_id),
    isFrozen: (agent_id: string): boolean => frozen.has(agent_id),
    taintOf: (agent_id: string): TaintMark | undefined => tainted.get(agent_id),

    /** The gate the broker consults BEFORE resolving a secret. Deny if tainted or frozen. */
    guardSecretRequest(agent_id: string): { allow: boolean; reason?: string } {
      if (frozen.has(agent_id)) return { allow: false, reason: 'agent is frozen (quarantined)' }
      if (tainted.has(agent_id)) return { allow: false, reason: 'agent is exposed to untrusted content' }
      return { allow: true }
    },

    /** Record a refusal in the audit stream (called by the broker wrapper before it throws). */
    noteRefusal(agent_id: string, capability: Capability, reason: string): void {
      emit({
        kind: 'cordon.secret_refused',
        agent_id,
        capability,
        summary: `refused ${capability} for ${agent_id} — secret never fetched (${reason})`,
        detail: { reason },
      })
    },

    /**
     * Compromise containment: freeze the compromised agent + every descendant it delegated to,
     * and spare everyone else (ancestors, siblings, unrelated branches). Returns the blast radius.
     */
    freezeSubtree(edges: readonly DelegationEdge[], compromised_agent_id: string): FreezeResult {
      const children = new Map<string, string[]>()
      const all = new Set<string>()
      for (const e of edges) {
        all.add(e.agent_id)
        if (e.parent_id) {
          all.add(e.parent_id)
          const arr = children.get(e.parent_id) ?? []
          arr.push(e.agent_id)
          children.set(e.parent_id, arr)
        }
      }
      all.add(compromised_agent_id)
      const toFreeze: string[] = []
      const seen = new Set<string>()
      const queue = [compromised_agent_id]
      while (queue.length) {
        const a = queue.shift() as string
        if (seen.has(a)) continue
        seen.add(a)
        toFreeze.push(a)
        frozen.add(a)
        for (const c of children.get(a) ?? []) queue.push(c)
      }
      const spared = [...all].filter((a) => !frozen.has(a))
      const res: FreezeResult = { compromised: compromised_agent_id, frozen: toFreeze, spared, blast_radius: toFreeze.length }
      emit({ kind: 'cordon.frozen', agent_id: compromised_agent_id, summary: `froze ${toFreeze.length} agent(s) in the poisoned sub-tree; ${spared.length} spared`, detail: { ...res } })
      return res
    },
  }
}

export type Cordon = ReturnType<typeof createCordon>

/**
 * Wrap a SecretBroker so a tainted/frozen agent NEVER reaches it — the secret is not even fetched.
 * `agentOf` resolves the requesting agent from the grant id. On refusal we record an audit event
 * (via the Cordon event sink) and throw CordonRefusal; the underlying broker is never called.
 *
 * Wire the Cordon event sink into the tamper-evident trace with, e.g.:
 *   createCordon({ onEvent: (e) => audit.append({ actor: 'janus', kind: e.kind,
 *     decision: e.kind === 'cordon.secret_refused' ? 'deny' : 'info', summary: e.summary,
 *     capability: e.capability, detail: e.detail }) })
 */
export function guardBrokerWithCordon(
  broker: SecretBroker,
  cordon: Cordon,
  agentOf: (grant_id: string) => string,
): SecretBroker {
  return {
    id: `${broker.id}+cordon`,
    isAvailable: () => broker.isAvailable(),
    async requestScopedSecret(request: ScopedSecretRequest): Promise<ScopedSecretResult> {
      const agent_id = agentOf(request.grant_id)
      const guard = cordon.guardSecretRequest(agent_id)
      if (!guard.allow) {
        cordon.noteRefusal(agent_id, request.capability, guard.reason ?? 'refused')
        // The broker is NOT called — the secret is never fetched.
        throw new CordonRefusal(agent_id, request.capability, guard.reason ?? 'refused')
      }
      return broker.requestScopedSecret(request) // clean agent → normal scoped path
    },
  }
}
