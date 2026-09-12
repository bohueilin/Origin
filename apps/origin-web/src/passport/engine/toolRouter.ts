// ToolRouter — the chokepoint. Every tool call goes through here and is authorized BEFORE
// it runs. Fail-closed by default. Two gates:
//
//   read/prepare adapter → the grant must be live AND explicitly allow the capability
//                          (and not deny it).
//   commit adapter (sideEffecting) → requires an APPROVED ApprovalPacket matching this
//                          tool + capability; the grant denies the capability outright, so
//                          the only path is an explicit human approval (and the result is
//                          still simulated).
//
// Every call — allowed, denied, or errored — emits exactly one audit event.

import type {
  ApprovalPacket,
  Capability,
  CapabilityGrant,
  ToolAdapter,
  ToolCall,
  ToolExecutionContext,
  ToolResult,
} from '../types'
import { GLOBAL_FORBIDDEN } from '../capabilities'
import { GrantManager } from './grantManager'
import { assertNoSecret, redact } from '../secrets/redact'
import type { AuditLogger } from './auditLogger'
import type { IdFactory } from './ids'
import { canonical, sha256 } from '@origin/evidence/env-evidence'
import type { ApprovalManager } from './approvalManager'
import type { KillSwitchContext, KillSwitchRegistry } from './killSwitch'

export interface RouteResult {
  call: ToolCall
  result?: ToolResult
  denialReason?: string
}
export interface RouterStops { approvals?: ApprovalManager; killSwitch?: KillSwitchRegistry; killContext?: () => KillSwitchContext }

export class ToolRouter {
  private grant: CapabilityGrant
  private audit: AuditLogger
  private idf: IdFactory
  private now: () => number
  private stops?: RouterStops

  constructor(grant: CapabilityGrant, audit: AuditLogger, idf: IdFactory, now: () => number, stops?: RouterStops) {
    this.grant = grant
    this.audit = audit
    this.idf = idf
    this.now = now
    this.stops = stops
  }

  async route(
    adapter: ToolAdapter,
    input: Record<string, unknown>,
    ctx: ToolExecutionContext,
    approval?: ApprovalPacket,
    actor?: { agentId: string; permits: (cap: Capability) => boolean },
  ): Promise<RouteResult> {
    const cap = adapter.requiredCapability
    const deny = (reason: string, kind = 'tool.denied'): RouteResult => {
      this.audit.append({
        actor: 'passport',
        kind,
        summary: `Denied ${adapter.name}: ${reason}`,
        decision: 'deny',
        capability: cap,
        detail: { tool: adapter.name },
      })
      return {
        call: this.mkCall(adapter, input, 'denied', `denied — ${reason}`),
        denialReason: reason,
      }
    }

    // 0) Globally forbidden capabilities are never executable — not even with approval.
    if (GLOBAL_FORBIDDEN.includes(cap)) {
      return deny('capability is categorically forbidden', 'tool.forbidden')
    }

    // 1) Grant must be live (active, not revoked, not expired).
    const liveness = GrantManager.liveness(this.grant, this.now())
    if (liveness !== 'ok') {
      return deny(`grant is ${liveness}`, 'tool.denied')
    }

    // 1b) Worker-level attenuation: a sub-agent may only use capabilities within its
    //     attenuated subset (child.caps ⊆ parent). Fail closed if the actor is known
    //     but the capability is outside its node's subset.
    if (actor && !actor.permits(cap)) {
      // Inline the audit so the actor id is recorded (do not change the shared deny() helper).
      this.audit.append({
        actor: 'passport',
        kind: 'delegation.exceeded',
        summary: `Denied ${adapter.name}: capability "${cap}" is outside ${actor.agentId}'s delegated subset`,
        decision: 'deny',
        capability: cap,
        detail: { tool: adapter.name, agent: actor.agentId },
      })
      return {
        call: this.mkCall(adapter, input, 'denied', `denied — capability "${cap}" is outside ${actor.agentId}'s delegated subset`),
        denialReason: `capability "${cap}" is outside ${actor.agentId}'s delegated subset`,
      }
    }

    // 2) Authorization path.
    if (adapter.sideEffecting) {
      // Commit: requires an approved packet for THIS tool + capability.
      if (!approval || !this.stops?.approvals || !this.stops.killSwitch || !this.stops.killContext) return deny('side-effecting action requires managed approval and stop controls', 'tool.denied')
      let routeInputDigest: string
      try {
        routeInputDigest = sha256(canonical(input))
      } catch {
        return deny('side-effecting input is not canonical JSON', 'tool.denied')
      }
      const stored = this.stops.approvals.get(approval.approval_id)
      if (!stored) return deny('approval is unknown', 'tool.denied')
      approval = stored
      if (approval.intent_id !== this.grant.intent_id || approval.intent_id !== ctx.intent.intent_id) return deny('approval intent does not match this grant and request', 'tool.denied')
      if (approval.capability !== cap || approval.tool_name !== adapter.name) {
        return deny('approval does not authorize this action', 'tool.denied')
      }
      if (routeInputDigest !== approval.input_digest) return deny('approval input does not match the approved input', 'tool.denied')
      if (approval.status !== 'approved') return deny(`approval is ${approval.status}`, 'tool.denied')
      if (this.now() >= approval.expires_at) { this.stops.approvals.expireApproved(approval.approval_id); return deny('approval expired', 'tool.denied') }
      if (approval.execution_mode !== 'simulated' || approval.nonce_digest !== sha256(canonical({ domain: 'origin.approval-nonce.v1', approval_id: approval.approval_id, intent_id: approval.intent_id }))) return deny('approval binding is invalid', 'tool.denied')
      // Defense in depth: the grant's own policy must have scoped this capability as
      // approval-gated. A packet alone cannot unlock a capability the grant never contemplated.
      if (!this.grant.requires_approval_for.includes(cap) && !this.grant.denied_capabilities.includes(cap)) {
        return deny('capability is outside the grant policy', 'tool.denied')
      }
      let blocked
      try {
        blocked = this.stops.killSwitch.blocked(this.stops.killContext())
      } catch {
        return deny('kill-switch context is unavailable', 'tool.denied')
      }
      if (blocked) return deny(`kill switch active (${blocked.scope}): ${blocked.reason}`, 'tool.killed')
      const consumed = this.stops.approvals.consumeApproved(approval.approval_id)
      if (!consumed) return deny('approval is no longer consumable', 'tool.denied')
      approval = consumed
    } else {
      // Read/prepare: must be explicitly allowed and not denied.
      if (this.grant.denied_capabilities.includes(cap)) return deny('capability is on the deny list', 'tool.denied')
      if (!this.grant.allowed_capabilities.includes(cap)) return deny('capability was not granted', 'tool.denied')
    }

    // 3) Execute. Redact the whole result at the boundary, THEN assert no secret slipped
    //    through. Everything downstream (results map, snapshot, UI, audit) only ever sees the
    //    redacted copy — the "secret-free" guarantee is enforced here, not assumed of fixtures.
    try {
      const raw = await adapter.execute(input, { ...ctx, approval })
      const result = redact(raw)
      assertNoSecret(result, `tool:${adapter.name}`)
      const status = adapter.sideEffecting ? (result.execution_mode === 'simulated' || result.simulated ? 'simulated' : 'claimed') : 'ok'
      const call = this.mkCall(adapter, input, status, result.summary)
      this.audit.append({
        actor: 'tool',
        kind: adapter.sideEffecting ? 'tool.commit' : 'tool.run',
        summary: `${adapter.name}: ${result.summary}`,
        decision: 'allow',
        capability: cap,
        detail: { tool: adapter.name, simulated: Boolean(result.simulated) },
      })
      return { call, result }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'tool error'
      this.audit.append({
        actor: 'tool',
        kind: 'tool.error',
        summary: `${adapter.name} errored: ${msg}`,
        decision: 'deny',
        capability: cap,
        detail: { tool: adapter.name },
      })
      return { call: this.mkCall(adapter, input, 'error', `error — ${msg}`), denialReason: msg }
    }
  }

  private mkCall(
    adapter: ToolAdapter,
    input: Record<string, unknown>,
    status: ToolCall['status'],
    outputSummary: string,
  ): ToolCall {
    return {
      tool_call_id: this.idf.next('call'),
      intent_id: this.grant.intent_id,
      grant_id: this.grant.grant_id,
      tool_name: adapter.name,
      capability_required: adapter.requiredCapability,
      input_summary: summarizeInput(input),
      output_summary: outputSummary,
      status,
      timestamp: this.now(),
    }
  }
}

/** Compact, secret-free, human-readable input summary for the trace. */
function summarizeInput(input: Record<string, unknown>): string {
  // Redact both by key-name and by value-pattern before rendering, so neither a
  // secret-ish field name nor a secret-shaped value can reach the trace.
  try {
    const safe = redact(input)
    const parts = Object.entries(safe).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    const s = parts.join(', ')
    return s.length > 120 ? s.slice(0, 117) + '…' : s || '(none)'
  } catch {
    return '[unrenderable input]'
  }
}
