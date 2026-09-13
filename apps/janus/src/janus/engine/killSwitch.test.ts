import { describe, expect, it } from 'vitest'
import { KillSwitchRegistry } from './killSwitch'

describe('KillSwitchRegistry', () => {
  it('is idempotent and selects the most-specific active scope', () => {
    const stops = new KillSwitchRegistry()
    stops.activate({ scope: 'global', reason: 'global' }); stops.activate({ scope: 'tenant', target: 'tenant-a', reason: 'tenant' }); stops.activate({ scope: 'session', target: 'session-a', reason: 'session' })
    stops.activate({ scope: 'session', target: 'session-a', reason: 'session' })
    expect(stops.blocked({ tenant_id: 'tenant-a', session_id: 'session-a' })).toMatchObject({ scope: 'session', reason: 'session' })
    stops.deactivate({ scope: 'session', target: 'session-a', reason: 'ignored' })
    expect(stops.blocked({ tenant_id: 'tenant-a', session_id: 'session-a' })).toMatchObject({ scope: 'tenant', reason: 'tenant' })
  })

  it('requires no target for global and a target for every scoped record', () => {
    const stops = new KillSwitchRegistry()
    expect(() => stops.activate({ scope: 'global', target: 'unexpected', reason: 'bad' })).toThrow(TypeError)
    expect(() => stops.activate({ scope: 'tenant', reason: 'bad' })).toThrow(TypeError)
  })

  it('returns isolated records from activate, blocked, and deactivate', () => {
    const stops = new KillSwitchRegistry()
    const activated = stops.activate({ scope: 'tenant', target: 'tenant-a', reason: 'operator stop' })
    activated.active = false; activated.reason = 'mutated'
    const blocked = stops.blocked({ tenant_id: 'tenant-a' })!
    blocked.active = false; blocked.reason = 'mutated again'
    expect(stops.blocked({ tenant_id: 'tenant-a' })).toMatchObject({ active: true, reason: 'operator stop' })
    const deactivated = stops.deactivate({ scope: 'tenant', target: 'tenant-a', reason: 'ignored' })!
    deactivated.active = true
    expect(stops.blocked({ tenant_id: 'tenant-a' })).toBeUndefined()
  })
})
