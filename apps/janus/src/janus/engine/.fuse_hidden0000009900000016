// PassportSession — the DemoScenarioRunner. Drives a scenario end to end:
//   declare intent → classify risk → decide policy → issue scoped grant → build plan →
//   run read/prepare tools (grant-gated) → pause at approval gates → on approval run a
//   simulated commit → finalize an itinerary → expose the full audit trace → support revoke.
//
// It is an observable: the UI subscribes and re-renders on every state change. Fully
// deterministic given an injected clock.

import type {
  AgentPlan,
  AgentStatus,
  AgentView,
  ApprovalPacket,
  AuditTrace,
  CapabilityGrant,
  CollabKind,
  CollabMsg,
  SecretBroker,
  ToolCall,
  ToolExecutionContext,
  ToolResult,
  UserIntent,
} from '../types'
import type { Itinerary, ScenarioSpec, StepSpec } from '../scenarios/types'
import { type Agent, ORCHESTRATOR, PASSPORT, PLANNER, USER, agentById, workerForTool } from '../agents'
import { getConnector } from '../connectors'
import { MockSecretBroker } from '../secrets/mockSecretBroker'
import { pickBroker } from '../secrets/pickBroker'
import { IdFactory } from './ids'
import { IntentParser } from './intentParser'
import { RiskClassifier } from './riskClassifier'
import { CapabilityPolicyEngine } from './policyEngine'
import { GrantManager } from './grantManager'
import { Planner } from './planner'
import { AuditLogger } from './auditLogger'
import { ApprovalManager } from './approvalManager'
import { ToolRouter } from './toolRouter'
import { RevocationManager } from './revocationManager'

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'revoked'

export interface PassportSnapshot {
  scenario: { id: string; title: string; tagline: string }
  status: SessionStatus
  intent: UserIntent
  grant: CapabilityGrant
  plan: AgentPlan
  toolCalls: ToolCall[]
  approvals: ApprovalPacket[]
  audit: AuditTrace
  itinerary: Itinerary | null
  prevented: string[]
  /** Secret-free structured outputs keyed by tool name (for rich UI rendering). */
  results: Record<string, ToolResult>
  brokerId: string
  /** True while there is an approval pending the user's decision. */
  pendingApprovalId: string | null
  /** The collaborating agent team and their live status. */
  agents: AgentView[]
  /** The live hand-off stream between agents. */
  collab: CollabMsg[]
  /** The agent currently acting (for the active-pulse), and what it is doing. */
  activeAgentId: string | null
  activePhase: string | null
}

export interface SessionOptions {
  now?: () => number
  broker?: SecretBroker
  agentId?: string
  /** Milliseconds to pause between collaboration beats so the demo plays out live.
   *  0 (the default) runs instantly — used by tests. */
  pace?: number
}

export class PassportSession {
  readonly scenario: ScenarioSpec
  private now: () => number
  private broker: SecretBroker
  private idf = new IdFactory()
  private agentId: string

  private intent!: UserIntent
  private grant!: CapabilityGrant
  private plan!: AgentPlan
  private audit!: AuditLogger
  private approvals!: ApprovalManager
  private router!: ToolRouter

  private results: Record<string, ToolResult> = {}
  private toolCalls: ToolCall[] = []
  private itinerary: Itinerary | null = null
  private status: SessionStatus = 'idle'
  private cursor = 0
  private prevented: string[] = []
  private approvedSpend = 0
  private brokerExplicit: boolean
  private pace: number

  // --- collaboration choreography state ---
  private agentState = new Map<string, AgentView>()
  private collab: CollabMsg[] = []
  private activeAgentId: string | null = null
  private activePhase: string | null = null

  private listeners = new Set<() => void>()
  private snapshot: PassportSnapshot | null = null

  constructor(scenario: ScenarioSpec, opts: SessionOptions = {}) {
    this.scenario = scenario
    this.now = opts.now ?? Date.now
    this.broker = opts.broker ?? new MockSecretBroker(this.now)
    this.brokerExplicit = Boolean(opts.broker)
    this.agentId = opts.agentId ?? 'agent://personal-assistant'
    this.pace = Math.max(0, opts.pace ?? 0)
  }

  // --- collaboration helpers ----------------------------------------------

  /** Pause between beats so the team's work is legible. No-op when pace is 0 (tests). */
  private beat(mult = 1): Promise<void> {
    if (this.pace <= 0) return Promise.resolve()
    return new Promise((r) => setTimeout(r, this.pace * mult))
  }

  /** Seed the roster: core agents + the workers this scenario actually uses. */
  private initRoster(): void {
    const order: { agent: Agent; status: AgentStatus }[] = [
      { agent: ORCHESTRATOR, status: 'idle' },
      { agent: PLANNER, status: 'thinking' },
      { agent: PASSPORT, status: 'idle' },
    ]
    for (const o of order) this.agentState.set(o.agent.id, { ...o.agent, status: o.status })
    for (const spec of this.scenario.steps) {
      const tool = spec.kind === 'tool' ? spec.tool : spec.kind === 'approval' ? spec.commitTool : null
      if (!tool) continue
      const w = workerForTool(tool)
      if (!this.agentState.has(w.id)) this.agentState.set(w.id, { ...w, status: 'idle' })
    }
    this.agentState.set(USER.id, { ...USER, status: 'idle' })
  }

  private setAgent(id: string, status: AgentStatus): void {
    const cur = this.agentState.get(id)
    if (cur) this.agentState.set(id, { ...cur, status })
    else {
      const a = agentById(id)
      this.agentState.set(id, { ...a, status })
    }
  }

  /** Record one hand-off message in the collaboration stream. */
  private say(from: string, to: string, text: string, kind: CollabKind): void {
    this.collab.push({ id: this.idf.next('msg'), ts: this.now(), from, to, text, kind })
  }

  // --- lifecycle ----------------------------------------------------------

  async start(): Promise<void> {
    // Resolve the secret broker via the real fallback path (1Password if configured, else mock).
    if (!this.brokerExplicit) this.broker = await pickBroker(this.now)
    const t = this.now()
    const risk = RiskClassifier.classify(this.scenario.requested_capabilities, this.scenario.commit_capabilities)
    this.intent = IntentParser.parse(this.scenario, this.idf, t, risk.risk_level)

    this.audit = new AuditLogger(this.idf, this.now)
    this.approvals = new ApprovalManager(this.idf, this.now)

    const decision = CapabilityPolicyEngine.decide(
      this.scenario.requested_capabilities,
      this.scenario.commit_capabilities,
    )
    this.grant = GrantManager.issue(
      this.intent,
      decision,
      {
        agent_id: this.agentId,
        ttl_seconds: this.scenario.ttl_seconds,
        budget_limit: this.scenario.budget_limit,
        scope: this.scenario.normalized_intent,
      },
      this.idf,
      t,
    )
    this.router = new ToolRouter(this.grant, this.audit, this.idf, this.now)
    this.plan = Planner.build(this.scenario, this.intent, risk.notes, this.idf)
    this.prevented = [...this.scenario.prevented]
    this.initRoster()

    // Narrate the authorization decision in the audit trail.
    this.audit.append({ actor: 'user', kind: 'intent.declared', summary: `Intent: ${this.intent.normalized_intent}`, decision: 'info' })
    this.audit.append({
      actor: 'agent',
      kind: 'plan.proposed',
      summary: `Agent proposed a ${this.plan.steps.length}-step plan and requested ${this.scenario.requested_capabilities.length} capabilities.`,
      decision: 'info',
      detail: { requested: this.scenario.requested_capabilities },
    })
    this.audit.append({
      actor: 'passport',
      kind: 'grant.issued',
      summary: `Granted ${decision.allowed_capabilities.length} scoped capabilities; denied ${decision.denied_capabilities.length}; ${decision.requires_approval_for.length} require explicit approval.`,
      decision: 'allow',
      detail: {
        allowed: decision.allowed_capabilities,
        denied: decision.denied_capabilities,
        requires_approval_for: decision.requires_approval_for,
        ttl_seconds: this.scenario.ttl_seconds,
      },
    })

    // Opening hand-offs — the team forms around the intent.
    this.setAgent('planner', 'done')
    this.say('user', 'planner', this.intent.normalized_intent, 'assign')
    this.emit()
    await this.beat()
    this.setAgent('orchestrator', 'working')
    this.say('planner', 'orchestrator', `Proposed a ${this.plan.steps.length}-step plan.`, 'note')
    this.say(
      'passport',
      'orchestrator',
      `Issued ${this.grant.allowed_capabilities.length} scoped capabilities · denied ${this.grant.denied_capabilities.length} · ${this.grant.requires_approval_for.length} need approval.`,
      'grant',
    )
    this.emit()
    await this.beat()

    this.status = 'running'
    return this.advance()
  }

  /** Run forward until a pause (approval gate), completion, or revocation. */
  private advance(): Promise<void> {
    if (this.status === 'revoked') {
      this.emit()
      return Promise.resolve()
    }
    return this.run()
  }

  private async run(): Promise<void> {
    while (this.cursor < this.plan.steps.length) {
      if (this.status === 'revoked') break
      RevocationManager.reconcileExpiry(this.grant, this.now())

      const step = this.plan.steps[this.cursor]
      const spec = this.scenario.steps[this.cursor]

      if (spec.kind === 'note') {
        step.status = 'done'
        this.audit.append({ actor: 'agent', kind: 'plan.note', summary: step.title, decision: 'info' })
        this.say('orchestrator', 'orchestrator', step.title, 'note')
        this.cursor++
        this.emit()
        await this.beat(0.5)
        continue
      }

      if (spec.kind === 'tool') {
        const worker = workerForTool(spec.tool)
        // 1) Orchestrator assigns the step; the worker starts reasoning.
        this.activeAgentId = worker.id
        this.activePhase = 'thinking'
        this.setAgent('orchestrator', 'working')
        this.setAgent(worker.id, 'thinking')
        this.say('orchestrator', worker.id, step.title, 'assign')
        this.emit()
        await this.beat()

        // 2) Capability is not permission: the worker must ask Passport before it can act.
        if (step.capability) {
          this.activePhase = 'authorizing'
          this.setAgent('passport', 'working')
          this.say(worker.id, 'passport', `requesting ${step.capability}`, 'request')
          this.emit()
          await this.beat()
        }

        // 3) Execute — the router authorizes against the live grant, then runs the connector.
        const halted = await this.runTool(step, spec)
        if (halted) {
          this.say('passport', worker.id, step.output_summary ?? 'denied', 'deny')
          this.setAgent('passport', 'idle')
          this.setAgent(worker.id, 'idle')
          this.activeAgentId = null
          this.activePhase = null
          this.emit()
          return
        }

        // 4) Passport grants; the worker works, then reports back to the Orchestrator.
        if (step.capability) this.say('passport', worker.id, `granted ${step.capability}`, 'grant')
        this.setAgent('passport', 'idle')
        this.activePhase = 'working'
        this.setAgent(worker.id, 'working')
        this.emit()
        await this.beat()
        this.say(worker.id, 'orchestrator', step.output_summary ?? 'done', 'result')
        this.setAgent(worker.id, 'done')
        this.activeAgentId = null
        this.activePhase = null
        this.cursor++
        this.emit()
        await this.beat(0.6)
        continue
      }

      // approval gate — the worker prepared a sensitive action; Passport escalates it to You.
      const gateWorker = workerForTool(spec.commitTool)
      const packet = this.approvals.create(spec.packet, this.intent, spec.commitTool, spec.commitInput)
      step.approval_ref = packet.approval_id
      step.status = 'awaiting_approval'
      this.setAgent(gateWorker.id, 'waiting')
      this.activeAgentId = 'passport'
      this.activePhase = 'escalating'
      this.setAgent('passport', 'waiting')
      this.say(gateWorker.id, 'passport', `prepared "${packet.action_type}" — it touches the real world`, 'escalate')
      this.emit()
      await this.beat()
      this.say('passport', 'user', `Approve "${packet.action_type}"? ${packet.irreversible ? 'Irreversible · ' : ''}runs in simulation.`, 'escalate')
      this.setAgent('user', 'thinking')
      this.audit.append({
        actor: 'passport',
        kind: 'approval.requested',
        summary: `Approval required: ${packet.action_type}.`,
        decision: 'info',
        capability: packet.capability,
        detail: { approval_id: packet.approval_id, external_party: packet.external_party },
      })
      this.status = 'awaiting_approval'
      this.emit()
      return
    }

    this.finalize()
  }

  private async runTool(step: AgentPlan['steps'][number], spec: Extract<StepSpec, { kind: 'tool' }>): Promise<boolean> {
    const adapter = getConnector(spec.tool)
    if (!adapter) {
      // A missing connector is a first-class audited denial — never an untraced no-op.
      this.audit.append({ actor: 'passport', kind: 'tool.denied', summary: `No connector registered for ${spec.tool}.`, decision: 'deny' })
      step.status = 'blocked'
      step.output_summary = 'no such connector'
      return false
    }
    step.status = 'running'
    const { call, result } = await this.router.route(adapter, spec.input, this.ctx())
    this.toolCalls.push(call)
    // In-flight kill switch: if authority was revoked while this awaited, discard and halt.
    if (this.status === 'revoked') {
      step.status = 'blocked'
      step.output_summary = 'blocked — authority revoked mid-step'
      return true
    }
    if (call.status === 'ok' && result) {
      step.status = 'done'
      step.output_summary = result.summary
      this.results[spec.tool] = result
      return false
    }
    // Denied/blocked (e.g., grant revoked or expired mid-run): halt safely.
    step.status = 'blocked'
    step.output_summary = call.output_summary
    this.prevented.push(`Blocked "${step.title}" — ${call.output_summary}.`)
    this.status = this.grant.status === 'revoked' ? 'revoked' : 'completed'
    return true
  }

  // --- user actions -------------------------------------------------------

  async resolveApproval(approvalId: string, decision: 'approve' | 'deny'): Promise<void> {
    // Revocation is terminal — no approval can be resolved after the kill switch.
    if (this.status === 'revoked') return
    this.approvals.expireDue()
    const packet = this.approvals.get(approvalId)
    if (!packet || packet.status !== 'pending') return
    const step = this.plan.steps.find((s) => s.approval_ref === approvalId)

    if (decision === 'deny') {
      this.approvals.deny(approvalId)
      if (step) step.status = 'denied'
      this.setAgent('user', 'done')
      if (step?.agent_id) this.setAgent(step.agent_id, 'idle')
      this.say('user', 'passport', `denied "${packet.action_type}" — stand down`, 'deny')
      this.audit.append({
        actor: 'user',
        kind: 'approval.denied',
        summary: `You denied: ${packet.action_type}.`,
        decision: 'reject',
        capability: packet.capability,
      })
      this.prevented.push(`You denied "${packet.action_type}" — it never happened.`)
      this.activeAgentId = null
      this.activePhase = null
      this.status = 'running'
      this.cursor++
      this.emit()
      await this.beat()
      await this.advance()
      return
    }

    // approve → run the gated commit (simulated)
    this.approvals.approve(approvalId)
    this.setAgent('user', 'done')
    this.say('user', 'passport', `approved "${packet.action_type}"`, 'approved')
    this.audit.append({
      actor: 'user',
      kind: 'approval.approved',
      summary: `You approved: ${packet.action_type}.`,
      decision: 'approve',
      capability: packet.capability,
    })
    this.emit()
    await this.beat()
    await this.runCommit(packet, step)
  }

  private async runCommit(packet: ApprovalPacket, step?: AgentPlan['steps'][number]): Promise<void> {
    // Spend ceiling: even an approved action is refused if it would breach the grant's budget.
    if (!GrantManager.withinBudget(this.grant, this.approvedSpend, packet.estimated_cost)) {
      this.audit.append({
        actor: 'passport',
        kind: 'tool.denied',
        summary: `Refused ${packet.action_type}: would exceed the spend ceiling.`,
        decision: 'deny',
        capability: packet.capability,
      })
      this.approvals.consume(packet.approval_id)
      if (step) {
        step.status = 'blocked'
        step.output_summary = 'blocked — exceeds spend ceiling'
      }
      this.prevented.push(`Refused "${packet.action_type}" — it would exceed your spend ceiling.`)
      this.say('passport', 'user', `refused "${packet.action_type}" — over your spend ceiling`, 'deny')
      this.activeAgentId = null
      this.activePhase = null
      this.status = 'running'
      this.cursor++
      this.emit()
      await this.beat()
      await this.advance()
      return
    }

    const worker = workerForTool(packet.tool_name)
    this.activeAgentId = worker.id
    this.activePhase = 'working'
    this.setAgent('passport', 'working')
    this.setAgent(worker.id, 'working')
    this.say('passport', worker.id, `authorized — execute "${packet.action_type}" (simulated)`, 'grant')
    this.emit()
    await this.beat()

    const adapter = getConnector(packet.tool_name)
    if (adapter) {
      const { call, result } = await this.router.route(adapter, packet.tool_input, this.ctx(packet), packet)
      this.toolCalls.push(call)
      // In-flight kill switch.
      if (this.status === 'revoked') {
        if (step) {
          step.status = 'blocked'
          step.output_summary = 'blocked — authority revoked mid-commit'
        }
        this.emit()
        return
      }
      if (call.status === 'ok') {
        if (packet.estimated_cost) this.approvedSpend += packet.estimated_cost.amount
        this.approvals.consume(packet.approval_id) // one-shot: the approval is now spent
        this.say(worker.id, 'orchestrator', result?.summary ?? 'done (simulated)', 'result')
        this.setAgent(worker.id, 'done')
      }
      this.setAgent('passport', 'idle')
      this.activeAgentId = null
      this.activePhase = null
      if (step) {
        step.status = call.status === 'ok' ? 'done' : 'blocked'
        step.output_summary = result?.summary ?? call.output_summary
      }
      if (result) this.results[packet.tool_name] = result
    } else {
      this.audit.append({ actor: 'passport', kind: 'tool.denied', summary: `No connector registered for ${packet.tool_name}.`, decision: 'deny', capability: packet.capability })
      if (step) {
        step.status = 'blocked'
        step.output_summary = 'no such connector'
      }
    }
    if (this.status === 'revoked') {
      this.emit()
      return
    }
    this.status = 'running'
    this.cursor++
    await this.advance()
  }

  revoke(): void {
    if (this.status === 'revoked') return
    RevocationManager.revoke(this.grant, this.now())
    this.audit.append({
      actor: 'user',
      kind: 'grant.revoked',
      summary: 'You revoked the grant. The agent can do nothing further.',
      decision: 'reject',
    })
    for (const s of this.plan.steps) {
      if (s.status === 'pending' || s.status === 'awaiting_approval') s.status = 'skipped'
    }
    // Expire any still-pending approvals.
    for (const p of this.approvals.packets) if (p.status === 'pending') this.approvals.deny(p.approval_id)
    this.prevented.push('Authority revoked — all remaining and future actions are denied.')
    // Stand the whole team down.
    for (const [id, a] of this.agentState) this.agentState.set(id, { ...a, status: id === 'passport' || id === 'user' ? 'done' : 'idle' })
    this.say('user', 'passport', 'Revoke everything — kill switch', 'deny')
    this.say('passport', 'orchestrator', 'Authority revoked. All agents stood down.', 'deny')
    this.activeAgentId = null
    this.activePhase = null
    this.status = 'revoked'
    this.emit()
  }

  // --- helpers ------------------------------------------------------------

  private ctx(approval?: ApprovalPacket): ToolExecutionContext {
    return { intent: this.intent, grant: this.grant, broker: this.broker, now: this.now, approval }
  }

  private finalize(): void {
    if (this.status !== 'revoked') {
      this.itinerary = this.scenario.finalize({ results: this.results, approvals: this.approvals.packets })
      this.status = 'completed'
      this.audit.append({ actor: 'passport', kind: 'intent.completed', summary: 'Plan complete. Itinerary assembled; grant remains revocable.', decision: 'info' })
      this.setAgent('orchestrator', 'done')
      this.setAgent('passport', 'idle')
      this.activeAgentId = null
      this.activePhase = null
      this.say('orchestrator', 'user', 'Itinerary assembled. Nothing irreversible ran.', 'result')
    }
    this.emit()
  }

  // --- observable ---------------------------------------------------------

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    this.snapshot = null
    for (const fn of this.listeners) fn()
  }

  getState(): PassportSnapshot {
    if (this.snapshot) return this.snapshot
    RevocationManager.reconcileExpiry(this.grant, this.now())
    this.approvals.expireDue()
    const pending = this.approvals.packets.find((p) => p.status === 'pending')
    this.snapshot = {
      scenario: { id: this.scenario.id, title: this.scenario.title, tagline: this.scenario.tagline },
      status: this.status,
      intent: this.intent,
      grant: this.grant,
      plan: this.plan,
      toolCalls: this.toolCalls,
      approvals: this.approvals.packets,
      audit: this.audit.trace(this.intent.intent_id),
      itinerary: this.itinerary,
      prevented: this.prevented,
      results: this.results,
      brokerId: this.broker.id,
      pendingApprovalId: pending?.approval_id ?? null,
      agents: [...this.agentState.values()],
      collab: this.collab,
      activeAgentId: this.activeAgentId,
      activePhase: this.activePhase,
    }
    return this.snapshot
  }
}
