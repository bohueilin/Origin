// Agent-side client for the Autonomy License broker. This is what an agent runtime
// imports. It carries ONLY the opaque, grant-bound agent token (never a user JWT, never
// a secret) and asks the broker for a capability. On success it gets a decision + an
// opaque session handle — never a raw credential.
//
// Framework-agnostic: `fetchImpl` is injectable so this is unit-tested without a network
// and runs in any JS runtime an agent lives in.

export interface CapabilityAsk {
  grantId: string
  agentId: string
  scope: string
  targetDomain: string
  action: string
  runId?: string
  reason?: string
}

export interface BrokerDecision {
  decision: 'allowed' | 'denied' | 'approval_required'
  reason: string
  capability?: {
    grantId: string
    scope: string
    targetService: string
    targetDomain: string
    sessionHandle: string
    expiresAt: number
    serviceMetadataRedacted?: Record<string, unknown>
  }
}

export interface AgentClientOptions {
  brokerUrl: string         // the deployed credential-broker function URL
  agentToken: string        // opaque, grant-bound token from agent-token-mint
  fetchImpl?: typeof fetch  // injectable for tests
}

export class AutonomyAgentClient {
  private readonly brokerUrl: string
  private readonly agentToken: string
  private readonly fetchImpl: typeof fetch

  constructor(opts: AgentClientOptions) {
    if (!opts.brokerUrl) throw new Error('brokerUrl required')
    if (!opts.agentToken) throw new Error('agentToken required')
    this.brokerUrl = opts.brokerUrl
    this.agentToken = opts.agentToken
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  /** Request a scoped capability. Never throws on a policy outcome — a denial is a
   *  normal `{decision:'denied'}` result. Throws only on a transport/parse failure, and
   *  the caller should treat that as fail-closed (do nothing). */
  async requestCapability(ask: CapabilityAsk): Promise<BrokerDecision> {
    const res = await this.fetchImpl(this.brokerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The opaque agent token — useless against anything but the broker, for one grant.
        'x-agent-token': this.agentToken,
      },
      body: JSON.stringify(ask),
    })
    const data = (await res.json()) as BrokerDecision
    if (!data || typeof data.decision !== 'string') throw new Error('broker returned an unexpected response')
    return data
  }

  /** Convenience: true only when the broker allowed the capability. */
  async isAllowed(ask: CapabilityAsk): Promise<boolean> {
    const d = await this.requestCapability(ask)
    return d.decision === 'allowed'
  }
}
