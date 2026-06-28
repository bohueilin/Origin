import { describe, expect, it } from 'vitest'
import { PassportSession } from './session'
import type { PassportSnapshot, SessionStatus } from './session'
import { ToolRouter } from './toolRouter'
import { GrantManager } from './grantManager'
import { AuditLogger } from './auditLogger'
import { IdFactory } from './ids'
import { CapabilityPolicyEngine } from './policyEngine'
import { getConnector } from '../connectors'
import { MockSecretBroker } from '../secrets/mockSecretBroker'
import { pickBroker } from '../secrets/pickBroker'
import { MOCK_SECRET_SENTINEL } from '../secrets/redact'
import { SCENARIOS, getScenario } from '../scenarios'
import type { CapabilityGrant, ToolExecutionContext, UserIntent } from '../types'

// ---- a controllable clock ----
function clock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

function fakeIntent(): UserIntent {
  return {
    intent_id: 'intent_test', raw_user_request: 'x', normalized_intent: 'x', user_goal: 'x',
    success_criteria: [], constraints: [], time_window: null, risk_level: 'low', created_at: 0,
  }
}

function buildGrant(now: number, allowed: string[], denied: string[] = [], ttl = 3600): CapabilityGrant {
  const idf = new IdFactory()
  return GrantManager.issue(
    fakeIntent(),
    { allowed_capabilities: allowed, denied_capabilities: denied, requires_approval_for: [] },
    { agent_id: 'agent://test', ttl_seconds: ttl, scope: 'test' },
    idf,
    now,
  )
}

function ctx(grant: CapabilityGrant, now: () => number): ToolExecutionContext {
  return { intent: fakeIntent(), grant, broker: new MockSecretBroker(now), now }
}

async function drive(session: PassportSession, decide: (s: PassportSnapshot) => 'approve' | 'deny' = () => 'approve') {
  await session.start()
  let guard = 0
  while (session.getState().status === 'awaiting_approval' && guard++ < 30) {
    const id = session.getState().pendingApprovalId
    if (!id) break
    await session.resolveApproval(id, decide(session.getState()))
  }
  return session.getState()
}

describe('ToolRouter fail-closed authorization', () => {
  it('1. denies a tool call when the required capability is not granted', async () => {
    const c = clock()
    const grant = buildGrant(c.now(), [] /* nothing allowed */)
    const router = new ToolRouter(grant, new AuditLogger(new IdFactory(), c.now), new IdFactory(), c.now)
    const adapter = getConnector('calendar.availability')!
    const { call } = await router.route(adapter, {}, ctx(grant, c.now))
    expect(call.status).toBe('denied')
  })

  it('2. allows a tool call with a valid grant', async () => {
    const c = clock()
    const grant = buildGrant(c.now(), ['calendar.read'])
    const router = new ToolRouter(grant, new AuditLogger(new IdFactory(), c.now), new IdFactory(), c.now)
    const adapter = getConnector('calendar.availability')!
    const { call, result } = await router.route(adapter, { day: 'Tomorrow' }, ctx(grant, c.now))
    expect(call.status).toBe('ok')
    expect(result?.summary).toContain('free')
  })

  it('3. denies when the grant has expired', async () => {
    const c = clock()
    const grant = buildGrant(c.now(), ['calendar.read'], [], 60)
    const router = new ToolRouter(grant, new AuditLogger(new IdFactory(), c.now), new IdFactory(), c.now)
    c.advance(61_000) // past 60s ttl
    const { call, denialReason } = await router.route(getConnector('calendar.availability')!, {}, ctx(grant, c.now))
    expect(call.status).toBe('denied')
    expect(denialReason).toContain('expired')
  })

  it('4. denies when the grant has been revoked', async () => {
    const c = clock()
    const grant = buildGrant(c.now(), ['calendar.read'])
    grant.status = 'revoked'
    grant.revoked_at = c.now()
    const router = new ToolRouter(grant, new AuditLogger(new IdFactory(), c.now), new IdFactory(), c.now)
    const { call, denialReason } = await router.route(getConnector('calendar.availability')!, {}, ctx(grant, c.now))
    expect(call.status).toBe('denied')
    expect(denialReason).toContain('revoked')
  })

  it('denies a side-effecting commit without an approved packet', async () => {
    const c = clock()
    const grant = buildGrant(c.now(), ['calendar.read'], ['messages.send'])
    const router = new ToolRouter(grant, new AuditLogger(new IdFactory(), c.now), new IdFactory(), c.now)
    const { call } = await router.route(getConnector('messages.send')!, { to: 'x' }, ctx(grant, c.now))
    expect(call.status).toBe('denied')
  })

  it('never executes a globally-forbidden capability', async () => {
    const c = clock()
    const grant = buildGrant(c.now(), ['payment.spend']) // even if mistakenly "allowed"
    const router = new ToolRouter(grant, new AuditLogger(new IdFactory(), c.now), new IdFactory(), c.now)
    // craft a throwaway forbidden adapter
    const adapter = { name: 'pay', requiredCapability: 'payment.spend', riskLevel: 'critical' as const, sideEffecting: true, async execute() { return { summary: 'should never run' } } }
    const { call } = await router.route(adapter, {}, ctx(grant, c.now))
    expect(call.status).toBe('denied')
  })
})

describe('CapabilityPolicyEngine', () => {
  it('grants only read/prepare caps and denies all commits + forbidden', () => {
    const d = CapabilityPolicyEngine.decide(
      ['calendar.read', 'events.search', 'messages.draft'],
      ['messages.send', 'ride.booking.submit'],
    )
    expect(d.allowed_capabilities).toContain('calendar.read')
    expect(d.allowed_capabilities).not.toContain('messages.send')
    expect(d.denied_capabilities).toContain('messages.send')
    expect(d.denied_capabilities).toContain('payment.spend') // always denied
    expect(d.requires_approval_for).toContain('ride.booking.submit')
    expect(d.requires_approval_for).not.toContain('payment.spend')
  })
})

describe('high-risk approval gating (airport pickup)', () => {
  it('5. raises an approval packet for the ride booking and pauses', async () => {
    const c = clock()
    const session = new PassportSession(getScenario('airport-pickup')!, { now: c.now })
    await session.start()
    const s = session.getState()
    expect(s.status).toBe('awaiting_approval')
    const ride = s.approvals.find((p) => p.capability === 'ride.booking.submit')
    expect(ride).toBeTruthy()
    expect(ride?.estimated_cost?.amount).toBe(47)
  })

  it('6. does not run the simulated submit until approved', async () => {
    const c = clock()
    const session = new PassportSession(getScenario('airport-pickup')!, { now: c.now })
    await session.start()
    // Before approval: no ride.submit tool call exists.
    expect(session.getState().toolCalls.some((t) => t.tool_name === 'ride.submit')).toBe(false)
    const id = session.getState().pendingApprovalId!
    await session.resolveApproval(id, 'approve')
    // After approval: the simulated commit ran (and is marked simulated).
    const ran = session.getState().toolCalls.find((t) => t.tool_name === 'ride.submit')
    expect(ran?.status).toBe('ok')
    expect(session.getState().results['ride.submit']?.simulated).toBe(true)
  })

  it('denying an approval prevents the action entirely', async () => {
    const c = clock()
    const session = new PassportSession(getScenario('airport-pickup')!, { now: c.now })
    const final = await drive(session, () => 'deny')
    expect(final.toolCalls.some((t) => t.tool_name === 'ride.submit')).toBe(false)
    expect(final.prevented.some((p) => /denied/i.test(p))).toBe(true)
    expect(final.status).toBe('completed')
  })
})

describe('audit trace', () => {
  it('8. records an event for every tool call', async () => {
    const c = clock()
    const session = new PassportSession(getScenario('fill-my-night')!, { now: c.now })
    const s = await drive(session)
    const auditedTools = s.audit.events.filter((e) => e.kind === 'tool.run' || e.kind === 'tool.commit' || e.kind === 'tool.denied' || e.kind === 'tool.error')
    expect(auditedTools.length).toBeGreaterThanOrEqual(s.toolCalls.length)
    expect(s.audit.digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('the trace verifies, and any tampering is detected (real hash-chain check)', async () => {
    const c = clock()
    const session = new PassportSession(getScenario('fill-my-night')!, { now: c.now })
    const s = await drive(session)
    // A genuine trace verifies against its digest.
    expect(AuditLogger.verify(s.audit)).toBe(true)
    expect(s.audit.events.length).toBeGreaterThan(5)
    // Edit one event in a copy → verification fails.
    const edited = { ...s.audit, events: s.audit.events.map((e, i) => (i === 2 ? { ...e, summary: e.summary + ' [edited]' } : { ...e })) }
    expect(AuditLogger.verify(edited)).toBe(false)
    // Remove one event in a copy → verification fails.
    const dropped = { ...s.audit, events: s.audit.events.filter((_, i) => i !== 1) }
    expect(AuditLogger.verify(dropped)).toBe(false)
  })

  it('the returned trace is frozen (cannot be mutated by a reader)', async () => {
    const c = clock()
    const session = new PassportSession(getScenario('fill-my-night')!, { now: c.now })
    const s = await drive(session)
    expect(Object.isFrozen(s.audit.events)).toBe(true)
    expect(() => {
      // @ts-expect-error intentional mutation attempt
      s.audit.events.push({})
    }).toThrow()
  })
})

describe('spend ceiling enforcement', () => {
  it('withinBudget honors the ceiling and fails closed on currency mismatch', () => {
    const grant = buildGrant(0, ['x'])
    grant.budget_limit = { amount: 50, currency: 'USD' }
    expect(GrantManager.withinBudget(grant, 0, { amount: 47, currency: 'USD' })).toBe(true)
    expect(GrantManager.withinBudget(grant, 47, { amount: 10, currency: 'USD' })).toBe(false) // 57 > 50
    expect(GrantManager.withinBudget(grant, 0, { amount: 10, currency: 'EUR' })).toBe(false) // mismatch
    expect(GrantManager.withinBudget(grant, 0, null)).toBe(true)
  })

  it('refuses an approved commit that would breach the ceiling, and audits the refusal', async () => {
    const c = clock()
    const session = new PassportSession(getScenario('airport-pickup')!, { now: c.now })
    await session.start()
    // Shrink the ceiling below the ride cost ($47) so approving it is refused at the gate.
    session.getState().grant.budget_limit = { amount: 5, currency: 'USD' }
    const id = session.getState().pendingApprovalId!
    await session.resolveApproval(id, 'approve')
    const s = session.getState()
    expect(s.toolCalls.some((t) => t.tool_name === 'ride.submit')).toBe(false)
    expect(s.audit.events.some((e) => e.decision === 'deny' && /spend ceiling/i.test(e.summary))).toBe(true)
  })
})

describe('one-shot approvals', () => {
  it('consumes an approval after its commit and ignores re-resolution', async () => {
    const c = clock()
    const session = new PassportSession(getScenario('airport-pickup')!, { now: c.now })
    await session.start()
    const id = session.getState().pendingApprovalId!
    await session.resolveApproval(id, 'approve')
    const pkt = session.getState().approvals.find((p) => p.approval_id === id)!
    expect(pkt.status).toBe('consumed')
    const before = session.getState().toolCalls.length
    await session.resolveApproval(id, 'approve') // no-op: already consumed
    expect(session.getState().toolCalls.length).toBe(before)
  })
})

describe('broker fallback', () => {
  it('falls back to the mock broker when 1Password is unavailable', async () => {
    const broker = await pickBroker(() => 0)
    expect(broker.id).toBe('mock')
    expect(await broker.isAvailable()).toBe(true)
  })
})

describe('secret hygiene', () => {
  it('7. never leaks the mock secret into any surfaced state', async () => {
    const c = clock()
    const session = new PassportSession(getScenario('fill-my-night')!, { now: c.now })
    const s = await drive(session)
    const blob = JSON.stringify(s)
    expect(blob).not.toContain(MOCK_SECRET_SENTINEL)
    // The credential step did run and produced an opaque handle.
    expect(s.results['credential.request']?.data?.handle).toMatch(/^pph_/)
  })
})

describe('scenarios complete', () => {
  const ids = ['fill-my-night', 'enrich-my-life', 'airport-pickup']
  for (const id of ids) {
    it(`9/10/11. ${id} completes with an itinerary`, async () => {
      const c = clock()
      const session = new PassportSession(getScenario(id)!, { now: c.now })
      const s = await drive(session)
      expect(s.status).toBe<SessionStatus>('completed')
      expect(s.itinerary).not.toBeNull()
      expect(s.itinerary!.lines.length).toBeGreaterThan(2)
    })
  }

  it('exposes all three primary scenarios', () => {
    expect(SCENARIOS.map((x) => x.id)).toEqual(['fill-my-night', 'enrich-my-life', 'airport-pickup'])
  })
})

describe('revocation', () => {
  it('revoking mid-run denies all subsequent tool calls', async () => {
    const c = clock()
    const session = new PassportSession(getScenario('fill-my-night')!, { now: c.now })
    await session.start() // pauses at first approval
    session.revoke()
    const s = session.getState()
    expect(s.status).toBe('revoked')
    expect(s.grant.status).toBe('revoked')
    // A direct router call after revoke fails closed.
    const router = new ToolRouter(s.grant, new AuditLogger(new IdFactory(), c.now), new IdFactory(), c.now)
    const { call } = await router.route(getConnector('calendar.availability')!, {}, ctx(s.grant, c.now))
    expect(call.status).toBe('denied')
  })
})

describe('agent collaboration', () => {
  it('exposes a roster and a hand-off stream where Passport authorizes each capability', async () => {
    const c = clock()
    const session = new PassportSession(getScenario('fill-my-night')!, { now: c.now })
    const s = await drive(session)
    // Roster includes the core agents.
    for (const id of ['orchestrator', 'planner', 'passport', 'user']) {
      expect(s.agents.some((a) => a.id === id)).toBe(true)
    }
    expect(s.agents.length).toBeGreaterThan(5)
    // The stream shows workers requesting capabilities and Passport granting them.
    expect(s.collab.length).toBeGreaterThan(6)
    expect(s.collab.some((m) => m.kind === 'request' && m.to === 'passport')).toBe(true)
    expect(s.collab.some((m) => m.kind === 'grant' && m.from === 'passport')).toBe(true)
    // Every actionable step is owned by a worker agent.
    expect(s.plan.steps.filter((st) => st.kind !== 'note').every((st) => Boolean(st.agent_id))).toBe(true)
  })
})
