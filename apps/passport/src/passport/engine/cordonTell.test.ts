import { describe, it, expect } from 'vitest'
import { runCordonTellDemo } from './cordonTell'

describe('Cordon + Tell — live end-to-end over the real Janus gate + trace', () => {
  it('runs the full injection-containment loop and the trace re-verifies', async () => {
    const r = await runCordonTellDemo({ now: () => 1_000_000 })

    // 1) the in-plan calendar read runs
    expect(r.steps[0]).toMatchObject({ tool: 'calendar.read', status: 'ok' })
    // 2) the injected out-of-plan payments.refund is BLOCKED (Tell), pre-tool-call
    expect(r.steps[1]).toMatchObject({ tool: 'payments.refund', status: 'denied' })
    // 3) the now-tainted agent's credential request errors out — and the secret was NEVER fetched
    expect(r.steps[2]).toMatchObject({ tool: 'credential.login', status: 'error' })
    expect(r.secretFetches).toBe(0)
    // 4) containment froze the poisoned sub-tree (assistant + the child it delegated to)
    expect(r.blastRadius).toBe(2)
    // 5) a frozen agent can do nothing further
    expect(r.steps[3]).toMatchObject({ tool: 'calendar.read', status: 'denied' })

    // the whole loop is recorded in the tamper-evident hash chain, and it re-verifies
    expect(r.traceVerified).toBe(true)
    const kinds = r.trace.events.map((e) => e.kind)
    expect(kinds).toContain('tool.run') // the allowed read
    expect(kinds).toContain('tool.hijack_blocked') // Tell caught the injection
    expect(kinds).toContain('cordon.exposed') // the injection tainted the agent
    expect(kinds).toContain('cordon.secret_refused') // the broker refused — secret never fetched
    expect(kinds).toContain('cordon.frozen') // the sub-tree was contained
    expect(kinds).toContain('tool.quarantined') // the frozen agent is blocked
  })
})
