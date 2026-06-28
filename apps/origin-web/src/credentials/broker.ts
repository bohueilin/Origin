// The credential broker. Treats the agent as an untrusted caller and runs every
// request through a deterministic governance pipeline before any provider touches a
// secret. Pure + framework-agnostic so it runs identically in an edge function and
// in tests. Returns a decision + (on success) a non-secret capability handle.
import type {
  AgentCapability,
  AuditSink,
  CapabilityRequest,
  CapabilityResult,
  CredentialGrant,
  CredentialProvider,
  CredentialScope,
  RuntimeContext,
} from './types'
import { assertNoSecret, redact } from './redact'
import { evaluateRuleOfTwo } from './ruleOfTwo'

// High-risk scopes require step-up approval on first use.
const HIGH_RISK: CredentialScope[] = ['website_login', 'wallet_prepare']

function normDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
}

export interface BrokerArgs {
  grant: CredentialGrant | null
  request: CapabilityRequest
  context: RuntimeContext
  provider: CredentialProvider
  audit: AuditSink
  /** Secret values to assert never cross the agent boundary (defense in depth). */
  knownSecrets?: Array<string | null | undefined>
}

export async function brokerCapability(args: BrokerArgs): Promise<CapabilityResult> {
  const { grant, request, context, provider, audit, knownSecrets } = args
  const now = context.now ?? Date.now()

  const emit = (eventType: string, extra: Record<string, unknown> = {}) =>
    audit({
      userId: grant?.userId ?? 'unknown',
      orgId: grant?.orgId ?? null,
      actorType: 'agent',
      actorId: request.agentId,
      eventType,
      targetType: 'credential_grant',
      targetId: request.grantId,
      metadata: redact({ scope: request.scope, targetDomain: request.targetDomain, action: request.action, reason: request.reason, ...extra }) as Record<string, unknown>,
      ip: context.ip ?? null,
      createdAt: now,
    })

  const deny = async (reason: string): Promise<CapabilityResult> => {
    await emit('credential_request_denied', { decision: 'denied', deny_reason: reason })
    return { decision: 'denied', reason }
  }
  const stepUp = async (reason: string): Promise<CapabilityResult> => {
    await emit('credential_request_approval_required', { decision: 'approval_required', step_up_reason: reason })
    return { decision: 'approval_required', reason }
  }

  // 1. grant must exist
  if (!grant) return deny('grant not found')
  // 2. authorize the agent/run binding
  if (grant.agentId && grant.agentId !== request.agentId) return deny('agent not authorized for this grant')
  if (grant.runId && request.runId && grant.runId !== request.runId) return deny('run not authorized for this grant')
  // 3. grant must be active (not revoked)
  if (grant.status !== 'active' || grant.revokedAt) return deny('grant revoked')
  // 4. not expired
  if (now >= grant.expiresAt) return deny('grant expired')
  // 5. scope must match exactly
  if (grant.scope !== request.scope) return deny('scope mismatch')
  // 6. usage limit
  if (grant.usageLimit > 0 && grant.usageCount >= grant.usageLimit) return deny('usage limit reached')
  // 7. domain binding — fail closed on any mismatch
  if (normDomain(grant.targetDomain) !== normDomain(request.targetDomain)) return deny('domain mismatch (fail closed)')
  // 8. wallet signing is human-only in MVP — the broker never auto-resolves it
  if (request.scope === 'wallet_sign') return stepUp('wallet signing requires explicit human approval; the agent may only prepare a draft')
  // 8b. Rule of Two — if this grant carries all three lethal-trifecta exposures (private
  // data + untrusted content + external comms), the agent may not act autonomously.
  const rot = evaluateRuleOfTwo({
    privateData: Boolean(grant.trifectaPrivateData),
    untrustedContent: Boolean(grant.trifectaUntrustedContent),
    externalComms: Boolean(grant.trifectaExternalComms),
  }, Boolean(context.approved))
  if (rot.requiresHuman) return stepUp(rot.reason)
  // 9. step-up: explicit policy, or a high-risk scope on first use, requires approval
  const firstUse = grant.usageCount === 0
  if (!context.approved && (grant.approvalPolicy === 'approval_required' || (HIGH_RISK.includes(request.scope) && firstUse))) {
    return stepUp('step-up approval required before this capability can be used')
  }

  // 10. broker the action via the provider — never returns the raw secret. Fail closed.
  try {
    const resolution = await provider.resolveCapability(grant, request, context)
    const capability: AgentCapability = {
      grantId: grant.id,
      scope: grant.scope,
      targetService: grant.targetService,
      targetDomain: grant.targetDomain,
      sessionHandle: resolution.sessionHandle,
      expiresAt: grant.expiresAt,
    }
    const result: CapabilityResult = { decision: 'allowed', reason: 'capability granted', capability }
    // Hard backstop: nothing the agent receives may contain a known secret value.
    assertNoSecret(result, knownSecrets ?? [])
    await emit('credential_request_allowed', { decision: 'allowed', provider: provider.id, providerMeta: resolution.serviceMetadataRedacted })
    return result
  } catch (err) {
    return deny(`provider error (fail closed): ${String(err instanceof Error ? err.message : err).slice(0, 120)}`)
  }
}
