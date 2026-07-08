import { describe, it, expect } from 'vitest'
import type { ScopedSecretRequest, ScopedSecretResult, SecretBroker } from '../types'
import { createCordon, guardBrokerWithCordon, CordonRefusal, type CordonEvent, type DelegationEdge } from './cordon'

// A spy broker that COUNTS how many times the secret is actually fetched. Cordon's whole point is
// that for a tainted agent this counter stays at 0 — the secret is never even fetched.
function spyBroker() {
  let fetches = 0
  const broker: SecretBroker = {
    id: 'spy',
    isAvailable: async () => true,
    async requestScopedSecret(req: ScopedSecretRequest): Promise<ScopedSecretResult> {
      fetches += 1
      return {
        handle: `jns_${req.grant_id}`,
        metadata: { title: 'x', category: 'login', field_labels: ['username'] },
        scope: req.capability,
        expires_at: 0,
      }
    },
  }
  return { broker, fetches: () => fetches }
}

const req = (grant_id: string): ScopedSecretRequest => ({
  item_ref: 'op://Personal/luma-account',
  capability: 'credential.login',
  intent_id: 'intent_1',
  grant_id,
})

describe('Cordon — the broker refuses to resolve a secret for a tainted agent', () => {
  it('a tainted agent gets a CordonRefusal AND the secret is never fetched', async () => {
    const cordon = createCordon({ now: () => 1000 })
    const { broker, fetches } = spyBroker()
    const guarded = guardBrokerWithCordon(broker, cordon, () => 'comms')

    cordon.markExposed('comms', 'inbound-email') // Comms agent read an untrusted email
    await expect(guarded.requestScopedSecret(req('grant_comms'))).rejects.toBeInstanceOf(CordonRefusal)
    expect(fetches()).toBe(0) // the underlying broker was never called — secret never fetched
  })

  it('a clean agent gets its scoped secret through the normal path', async () => {
    const cordon = createCordon({ now: () => 1000 })
    const { broker, fetches } = spyBroker()
    const guarded = guardBrokerWithCordon(broker, cordon, () => 'calendar')

    const result = await guarded.requestScopedSecret(req('grant_cal'))
    expect(result.handle).toBe('jns_grant_cal')
    expect(fetches()).toBe(1)
  })

  it('a frozen agent is also refused (quarantine implies no credentials)', async () => {
    const cordon = createCordon({ now: () => 1000 })
    const { broker, fetches } = spyBroker()
    const guarded = guardBrokerWithCordon(broker, cordon, () => 'leaf')
    cordon.freezeSubtree([{ agent_id: 'leaf', parent_id: 'root' }], 'leaf')
    await expect(guarded.requestScopedSecret(req('grant_leaf'))).rejects.toBeInstanceOf(CordonRefusal)
    expect(fetches()).toBe(0)
  })
})

describe('Cordon — freeze only the poisoned sub-tree; measure blast radius', () => {
  // root → mid → leaf   (the poisoned branch)
  //  └──→ sibling        (a clean branch)
  const tree: DelegationEdge[] = [
    { agent_id: 'root', parent_id: null },
    { agent_id: 'mid', parent_id: 'root' },
    { agent_id: 'leaf', parent_id: 'mid' },
    { agent_id: 'sibling', parent_id: 'root' },
  ]

  it('freezing a mid node contains it + its descendants, sparing ancestors and siblings', () => {
    const cordon = createCordon({ now: () => 1000 })
    const res = cordon.freezeSubtree(tree, 'mid')
    expect(res.frozen.sort()).toEqual(['leaf', 'mid'])
    expect(res.blast_radius).toBe(2)
    expect(res.spared.sort()).toEqual(['root', 'sibling'])
    expect(cordon.isFrozen('root')).toBe(false)
    expect(cordon.isFrozen('sibling')).toBe(false)
    expect(cordon.isFrozen('leaf')).toBe(true)
  })

  it('a spared (clean) agent keeps working after containment elsewhere', async () => {
    const cordon = createCordon({ now: () => 1000 })
    cordon.freezeSubtree(tree, 'mid')
    const { broker, fetches } = spyBroker()
    const guarded = guardBrokerWithCordon(broker, cordon, () => 'sibling')
    await guarded.requestScopedSecret(req('grant_sib')) // sibling is spared → normal path
    expect(fetches()).toBe(1)
  })
})

describe('Cordon — every containment action is auditable', () => {
  it('emits exposed / secret_refused / frozen events for the trace', async () => {
    const events: CordonEvent[] = []
    const cordon = createCordon({ now: () => 1000, onEvent: (e) => events.push(e) })
    const { broker } = spyBroker()
    const guarded = guardBrokerWithCordon(broker, cordon, () => 'comms')

    cordon.markExposed('comms', 'inbound-email')
    await guarded.requestScopedSecret(req('grant_comms')).catch(() => {})
    cordon.freezeSubtree([{ agent_id: 'comms', parent_id: 'root' }], 'comms')

    expect(events.map((e) => e.kind)).toEqual(['cordon.exposed', 'cordon.secret_refused', 'cordon.frozen'])
    expect(events[1].capability).toBe('credential.login')
  })
})
