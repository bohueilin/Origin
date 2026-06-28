// Credential-broker types. Core principle: an agent NEVER receives a raw password,
// seed phrase, private key, long-lived token, full vault item, or session cookie.
// It receives only a brokered capability — a policy decision + an opaque, task-scoped
// session handle. All enforcement is server-side; these types are provider-agnostic.

export type CredentialScope =
  | 'api_read'        // read-only API access
  | 'login_session'   // create a login session
  | 'cli_auth'        // CLI authentication
  | 'website_login'   // log in to an approved website (high-risk on first use)
  | 'wallet_prepare'  // prepare a transaction draft (no signing)
  | 'wallet_sign'     // sign — HUMAN-ONLY in MVP; the broker never auto-resolves this

export type ApprovalPolicy = 'auto_low_risk' | 'approval_required'
export type GrantStatus = 'active' | 'revoked' | 'expired'
export type BrokerDecision = 'allowed' | 'denied' | 'approval_required'

/** A scoped, time-limited, revocable capability the user granted to an agent.
 *  Holds only REFERENCES (vaultRef/itemRef) — never the secret value itself. */
export interface CredentialGrant {
  id: string
  userId: string
  orgId?: string | null
  agentId?: string | null
  runId?: string | null
  provider: string
  targetService: string
  targetDomain: string
  vaultRef?: string | null
  itemRef?: string | null
  scope: CredentialScope
  approvalPolicy: ApprovalPolicy
  expiresAt: number // epoch ms
  usageLimit: number // 0 = unlimited
  usageCount: number
  status: GrantStatus
  createdAt: number
  revokedAt?: number | null
  // Lethal-trifecta exposure this agent carries (Rule of Two). All three at once forces a
  // human in the loop, regardless of scope. Default false (no exposure declared).
  trifectaPrivateData?: boolean
  trifectaUntrustedContent?: boolean
  trifectaExternalComms?: boolean
}

/** A single capability request from an agent runtime (treated as untrusted). */
export interface CapabilityRequest {
  grantId: string
  agentId: string
  runId?: string | null
  scope: CredentialScope
  targetDomain: string // the domain the agent is about to act on (must match the grant)
  action: string
  reason?: string
}

/** Runtime context for an evaluation. `approved` is set true only after the user
 *  completed a step-up approval. `now` is injectable for deterministic tests. */
export interface RuntimeContext {
  agentId: string
  runId?: string | null
  ip?: string | null
  approved?: boolean
  now?: number
}

/** What the agent actually receives on success — NEVER a secret. The session handle
 *  is opaque and task-scoped; it cannot be exchanged for the underlying credential. */
export interface AgentCapability {
  grantId: string
  scope: CredentialScope
  targetService: string
  targetDomain: string
  sessionHandle: string
  expiresAt: number
}

export interface CapabilityResult {
  decision: BrokerDecision
  reason: string
  capability?: AgentCapability
}

export interface AuditEvent {
  userId: string
  orgId?: string | null
  actorType: 'user' | 'agent' | 'system'
  actorId?: string | null
  eventType: string
  targetType?: string
  targetId?: string
  metadata: Record<string, unknown>
  ip?: string | null
  createdAt: number
}

export type AuditSink = (event: AuditEvent) => void | Promise<void>

/** What a provider returns after performing/brokering the action server-side: a
 *  task-scoped handle + already-redacted metadata. Providers MUST NOT return secrets. */
export interface ProviderResolution {
  sessionHandle: string
  serviceMetadataRedacted: Record<string, unknown>
}

/** A credential provider performs the approved action using the real secret on the
 *  server, and returns only a handle. Implementations: mock, 1Password (scaffold). */
export interface CredentialProvider {
  readonly id: string
  resolveCapability(grant: CredentialGrant, request: CapabilityRequest, context: RuntimeContext): Promise<ProviderResolution>
  revokeGrant(grantId: string): Promise<void>
}
