import { describe, expect, it } from 'vitest'
import { ApprovalManager } from './approvalManager'
import { AuditLogger } from './auditLogger'
import { GrantManager } from './grantManager'
import { IdFactory } from './ids'
import { KillSwitchRegistry } from './killSwitch'
import { ToolRouter } from './toolRouter'
import { PassportSession } from './session'
import { MockSecretBroker } from '../secrets/mockSecretBroker'
import { getScenario } from '../scenarios'
import type { ToolAdapter, ToolExecutionContext, UserIntent } from '../types'
import type { ApprovalPacketSpec } from '../scenarios/types'

function clock(start = 1_000_000) {
  let value = start
  return { now: () => value, advance: (ms: number) => (value += ms) }
}

const intent: UserIntent = {
  intent_id: 'intent_test', raw_user_request: 'x', normalized_intent: 'x', user_goal: 'x',
  success_criteria: [], constraints: [], time_window: null, risk_level: 'low', created_at: 0,
}
const spec: ApprovalPacketSpec = { action_type: 'send', description: 'x', external_party: null, estimated_cost: null, data_shared: [], irreversible: false, approve_button_label: 'approve', deny_button_label: 'deny', capability: 'messages.send' }

describe('Passport ToolRouter Task 3 parity', () => {
  it('atomically binds, stops, consumes, and classifies commit outcomes', async () => {
    const c = clock(); const idf = new IdFactory()
    const grant = GrantManager.issue(intent, { allowed_capabilities: [], denied_capabilities: ['messages.send'], requires_approval_for: [] }, { agent_id: 'agent://test', ttl_seconds: 3600, scope: 'test' }, idf, c.now())
    const approvals = new ApprovalManager(idf, c.now); const stops = new KillSwitchRegistry()
    const router = new ToolRouter(grant, new AuditLogger(idf, c.now), idf, c.now, { approvals, killSwitch: stops, killContext: () => ({ environment_id: 'env', tenant_id: 'tenant', agent_id: grant.agent_id, session_id: 'session' }) })
    const context: ToolExecutionContext = { intent, grant, broker: new MockSecretBroker(c.now), now: c.now }
    const make = () => { const packet = approvals.create(spec, intent, 'send', { to: 'a' }); approvals.approve(packet.approval_id); return packet }
    let calls = 0
    const simulated: ToolAdapter = { name: 'send', requiredCapability: 'messages.send', riskLevel: 'high', sideEffecting: true, async execute() { calls++; return { summary: 'simulated', execution_mode: 'simulated', outcome_attestation: 'simulated' } } }

    const inputMismatch = make()
    expect((await router.route(simulated, { to: 'changed' }, context, inputMismatch, { agentId: 'worker', permits: () => true })).call.status).toBe('denied')
    stops.activate({ scope: 'tenant', target: 'tenant', reason: 'stop' })
    const stopped = make()
    expect((await router.route(simulated, { to: 'a' }, context, stopped, { agentId: 'worker', permits: () => true })).call.status).toBe('denied')
    stops.deactivate({ scope: 'tenant', target: 'tenant', reason: 'stop' })
    const accepted = make()
    expect((await router.route(simulated, { to: 'a' }, context, accepted, { agentId: 'worker', permits: () => true })).call.status).toBe('simulated')
    expect(approvals.get(accepted.approval_id)?.status).toBe('consumed')
    const claimed = make()
    const live: ToolAdapter = { ...simulated, async execute() { calls++; return { summary: 'unverified', execution_mode: 'live', outcome_attestation: 'claimed' } } }
    expect((await router.route(live, { to: 'a' }, context, claimed, { agentId: 'worker', permits: () => true })).call.status).toBe('claimed')
    expect(calls).toBe(2)
  })

  it('does not let a caller mutate the approval authority through a session snapshot', async () => {
    const c = clock()
    const session = new PassportSession(getScenario('airport-pickup')!, { now: c.now })
    await session.start()
    const exposed = session.getState().approvals.find((packet) => packet.capability === 'ride.booking.submit')!
    exposed.tool_input = { attacker: true }
    exposed.input_digest = '0'.repeat(64)
    exposed.nonce_digest = '1'.repeat(64)
    exposed.status = 'consumed'
    exposed.expires_at = 0
    exposed.tool_name = 'attacker.tool'
    exposed.capability = 'attacker.capability'
    await session.resolveApproval(exposed.approval_id, 'approve')
    expect(session.getState().toolCalls.find((call) => call.tool_name === 'ride.submit')?.status).toBe('simulated')
  })

  it('audits and blocks a malformed approval input instead of throwing from the session boundary', async () => {
    const c = clock(); const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic
    const base = getScenario('airport-pickup')!
    const scenario = { ...base, steps: base.steps.map((step) => step.kind === 'approval' ? { ...step, commitInput: cyclic } : step) }
    const session = new PassportSession(scenario, { now: c.now })
    await expect(session.start()).resolves.toBeUndefined()
    const state = session.getState()
    expect(state.status).toBe('completed')
    expect(state.audit.events.some((event) => event.kind === 'approval.input_invalid' && event.decision === 'deny')).toBe(true)
  })
})
