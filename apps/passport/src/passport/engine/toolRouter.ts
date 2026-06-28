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

export interface RouteResult {
  call: ToolCall
  result?: ToolResult
  denialReason?: string
}

export class ToolRouter {
  private grant: CapabilityGrant
  private audit: AuditLogger
  private idf: IdFactory
  private now: () => number

  constructor(grant: CapabilityGrant, audit: AuditLogger, idf: IdFactory, now: () => number) {
    this.grant = grant
    this.audit = audit
    this.idf = idf
    this.now = now
  }

  async route(
    adapter: ToolAdapter,
    input: Record<string, unknown>,
    ctx: ToolExecutionContext,
    approval?: ApprovalPacket,
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

    // 2) Authorization path.
    if (adapter.sideEffecting) {
      // Commit: requires an approved packet for THIS tool + capability.
      if (!approval) return deny('side-effecting action requires an approval packet', 'tool.denied')
      if (approval.status !== 'approved') return deny(`approval is ${approval.status}`, 'tool.denied')
      if (approval.capability !== cap || approval.tool_name !== adapter.name) {
        return deny('approval does not authorize this action', 'tool.denied')
      }
      if (this.now() >= approval.expires_at) return deny('approval expired', 'tool.denied')
      // Defense in depth: the grant's own policy must have scoped this capability as
      // approval-gated. A packet alone cannot unlock a capability the grant never contemplated.
      if (!this.grant.requires_approval_for.includes(cap) && !this.grant.denied_capabilities.includes(cap)) {
        return deny('capability is outside the grant policy', 'tool.denied')
      }
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
      const call = this.mkCall(adapter, input, 'ok', result.summary)
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
  const safe = redact(input)
  const parts = Object.entries(safe).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
  const s = parts.join(', ')
  return s.length > 120 ? s.slice(0, 117) + '…' : s || '(none)'
}
