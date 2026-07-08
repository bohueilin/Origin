import { describe, it, expect } from 'vitest'
import { runLeakVsHold, LEAK_INJECTION } from './leakVsHold'
import { MOCK_SECRET_SENTINEL, assertNoSecret } from './redact'

describe('Leak-vs-hold — same injection, one difference: where the credential lives', () => {
  it('the standard (key-in-context) agent leaks; the vault (broker-handle) agent holds', async () => {
    const r = await runLeakVsHold({ now: () => 1_000_000 })

    // Both agents obey the injection and dump their context — the ONLY variable is what was in it.
    expect(r.standard.output).toContain('here is my full context')
    expect(r.vault.output).toContain('here is my full context')

    // Standard: the raw key was in context → it leaks.
    expect(r.standard.leaked).toBe(true)
    expect(r.standard.output).toContain(MOCK_SECRET_SENTINEL)

    // Vault: only an opaque handle was ever in context → nothing to steal.
    expect(r.vault.leaked).toBe(false)
    expect(r.vault.output).not.toContain(MOCK_SECRET_SENTINEL)
    // The vault agent's whole output passes the same hard secret-boundary the broker enforces.
    expect(() => assertNoSecret(r.vault.output, 'leakVsHold:vault')).not.toThrow()

    // The headline the UI can show.
    expect(r.broker_prevented_leak).toBe(true)
    expect(r.injection).toBe(LEAK_INJECTION)
  })

  it('the vault agent still shows useful, non-secret metadata (handle + field labels)', async () => {
    const r = await runLeakVsHold()
    // It is not "hold by hiding everything" — the agent has an opaque handle + field LABELS to work with.
    expect(r.vault.output).toMatch(/credential_handle=jns_/)
    expect(r.vault.output).toMatch(/labels only, no values/)
  })
})
