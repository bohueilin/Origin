// MockSecretBroker — the local stand-in for a real vault (1Password / etc).
//
// It holds a fake secret in memory and NEVER returns it. A scoped request gets back an
// opaque, task-bound handle plus redacted metadata (field LABELS only). The point of the
// demo: the agent requests scoped access THROUGH Janus; it never owns or sees credentials.

import type { ScopedSecretRequest, ScopedSecretResult, SecretBroker } from '../types'
import { MOCK_SECRET_SENTINEL, assertNoSecret } from './redact'
import { sha256 } from '../hash'

interface VaultItem {
  item_ref: string
  title: string
  category: string
  // Field VALUES live here and are never returned by the broker.
  fields: Record<string, string>
}

const VAULT: Record<string, VaultItem> = {
  'op://Personal/luma-account': {
    item_ref: 'op://Personal/luma-account',
    title: 'Luma — events login',
    category: 'login',
    fields: {
      username: 'builder@example.com',
      password: MOCK_SECRET_SENTINEL,
      otp: MOCK_SECRET_SENTINEL,
    },
  },
}

export class MockSecretBroker implements SecretBroker {
  readonly id = 'mock'
  private now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async requestScopedSecret(request: ScopedSecretRequest): Promise<ScopedSecretResult> {
    const item = VAULT[request.item_ref]
    if (!item) throw new Error(`No vault item for ref (fail closed)`)

    // Opaque handle: a hash bound to (item, capability, intent, grant). It cannot be
    // exchanged for the secret — only Janus's server-side path (absent here) could
    // ever resolve a value, and only inside a sandbox.
    const handle =
      'pph_' +
      sha256(
        [request.item_ref, request.capability, request.intent_id, request.grant_id, this.now()].join('|'),
      ).slice(0, 32)

    const requested = request.fields ?? Object.keys(item.fields)
    const field_labels = requested.filter((f) => f in item.fields)

    const result: ScopedSecretResult = {
      handle,
      metadata: { title: item.title, category: item.category, field_labels },
      scope: request.capability,
      expires_at: this.now() + 5 * 60 * 1000,
    }
    // Boundary assertion: nothing we return may contain the secret value.
    assertNoSecret(result, 'MockSecretBroker.requestScopedSecret')
    return result
  }
}
