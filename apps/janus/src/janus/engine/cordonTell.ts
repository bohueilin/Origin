// Cordon + Tell — a live end-to-end over the REAL Janus gate + tamper-evident trace.
// =============================================================================
// Composes the actual ToolRouter (with the Tell + Cordon guard), the real AuditLogger, and a
// Cordon-guarded SecretBroker into ONE continuous loop — not a bespoke reimplementation:
//
//   1. an in-plan action runs (declared == measured == action);
//   2. an INJECTED out-of-plan action is blocked pre-tool-call by Tell, and taints the agent;
//   3. the tainted agent's credential request is refused BEFORE the broker is called
//      (the secret is never fetched);
//   4. Cordon freezes the poisoned sub-tree (blast radius measured); the rest keeps working;
//   5. a frozen agent can do nothing further;
//   6. every step lands in the tamper-evident hash-chained trace, which re-verifies.
// =============================================================================

import type {
  AuditTrace,
  CapabilityGrant,
  ScopedSecretRequest,
  ScopedSecretResult,
  SecretBroker,
  ToolAdapter,
  ToolExecutionContext,
  UserIntent,
} from '../types'
import { IdFactory } from './ids'
import { AuditLogger } from './auditLogger'
import { ToolRouter } from './toolRouter'
import { createCordon, guardBrokerWithCordon } from './cordon'
import type { DeclaredPlan } from './tell'

const AGENT = 'agent://assistant'

// A spy broker so we can PROVE the secret is never fetched for a tainted agent.
function countingBroker() {
  let fetches = 0
  const broker: SecretBroker = {
    id: 'spy',
    isAvailable: async () => true,
    async requestScopedSecret(req: ScopedSecretRequest): Promise<ScopedSecretResult> {
      fetches += 1
      return { handle: `jns_${req.grant_id}`, metadata: { title: 'Luma — events login', category: 'login', field_labels: ['username'] }, scope: req.capability, expires_at: 0 }
    },
  }
  return { broker, fetches: () => fetches }
}

const calendarRead: ToolAdapter = {
  name: 'calendar.read',
  requiredCapability: 'calendar.read',
  riskLevel: 'low',
  async execute() {
    return { summary: 'read 3 calendar events' }
  },
}
// The injected action: not in the declared plan — Tell must block it before it runs.
const paymentsRefund: ToolAdapter = {
  name: 'payments.refund',
  requiredCapability: 'payments.refund',
  riskLevel: 'high',
  async execute() {
    return { summary: 'refund issued' }
  },
}
// In-plan, but it touches a real credential — routed through the (guarded) broker.
const credentialLogin: ToolAdapter = {
  name: 'credential.login',
  requiredCapability: 'credential.login',
  riskLevel: 'medium',
  async execute(_input, ctx: ToolExecutionContext) {
    const r = await ctx.broker.requestScopedSecret({ item_ref: 'op://Personal/luma-account', capability: 'credential.login', intent_id: 'intent_demo', grant_id: 'grant_demo' })
    return { summary: `scoped login (${r.metadata.title})` }
  },
}

export interface CordonTellStep {
  tool: string
  status: string
  note: string
}
export interface CordonTellResult {
  steps: CordonTellStep[]
  trace: AuditTrace
  traceVerified: boolean
  blastRadius: number
  secretFetches: number
}

export async function runCordonTellDemo(opts: { now?: () => number } = {}): Promise<CordonTellResult> {
  const now = opts.now ?? (() => 1_000_000)
  const idf = new IdFactory()
  const audit = new AuditLogger(idf, now)
  // Cordon's events flow into the SAME tamper-evident trace.
  const cordon = createCordon({
    now,
    onEvent: (e) => audit.append({ actor: 'janus', kind: e.kind, decision: e.kind === 'cordon.exposed' ? 'info' : 'deny', summary: e.summary, capability: e.capability, detail: e.detail }),
  })

  const grant: CapabilityGrant = {
    grant_id: 'grant_demo',
    intent_id: 'intent_demo',
    agent_id: AGENT,
    allowed_capabilities: ['calendar.read', 'credential.login'],
    denied_capabilities: [],
    scope: 'demo',
    ttl: 300,
    budget_limit: null,
    requires_approval_for: [],
    status: 'active',
    created_at: now(),
    expires_at: now() + 300_000,
    revoked_at: null,
  }
  const intent: UserIntent = {
    intent_id: 'intent_demo',
    raw_user_request: 'read my calendar and log in to Luma',
    normalized_intent: 'read calendar + scoped Luma login',
    user_goal: 'plan the evening',
    success_criteria: [],
    constraints: [],
    time_window: null,
    risk_level: 'medium',
    created_at: now(),
  }
  const plan: DeclaredPlan = {
    intent_id: intent.intent_id,
    allowed_tools: ['calendar.read', 'credential.login'],
    allowed_capabilities: ['calendar.read', 'credential.login'],
    ordered: ['calendar.read', 'credential.login'],
  }

  const { broker, fetches } = countingBroker()
  const guardedBroker = guardBrokerWithCordon(broker, cordon, () => AGENT)
  const router = new ToolRouter(grant, audit, idf, now, { cordon, agentId: AGENT, plan })
  const ctx: ToolExecutionContext = { intent, grant, broker: guardedBroker, now, approval: undefined }

  const steps: CordonTellStep[] = []
  const run = async (adapter: ToolAdapter) => {
    const { call } = await router.route(adapter, {}, ctx)
    steps.push({ tool: adapter.name, status: call.status, note: call.output_summary })
    return call
  }

  await run(calendarRead) // 1) in-plan → runs
  await run(paymentsRefund) // 2) injected out-of-plan → Tell blocks + taints
  await run(credentialLogin) // 3) tainted agent → broker refuses; secret never fetched
  const freeze = cordon.freezeSubtree(
    [{ agent_id: AGENT, parent_id: 'orchestrator' }, { agent_id: 'child://drafts', parent_id: AGENT }],
    AGENT,
  ) // 4) contain the poisoned sub-tree
  await run(calendarRead) // 5) a frozen agent can do nothing further

  const trace = audit.trace(intent.intent_id)
  return { steps, trace, traceVerified: AuditLogger.verify(trace), blastRadius: freeze.blast_radius, secretFetches: fetches() }
}
