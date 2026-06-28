// OnePasswordSecretBroker — the REAL broker, a thin client proxy to the server access layer.
//
// The 1Password service-account token + every secret value live ONLY on the server. This
// client-side broker (the engine runs in the browser) calls the server's credential routes and
// receives ONLY an opaque, task-scoped handle + redacted metadata — never a value. The secret is
// resolved server-side at the tool boundary (see server/onePasswordBroker.ts).
//
//   isAvailable()         → GET /api/passport/credential/status  (is a service account configured?)
//   requestScopedSecret() → POST /api/passport/credential/lease  (mint a handle; no secret returned)

import type { ScopedSecretRequest, ScopedSecretResult, SecretBroker } from '../types'
import { api } from '../apiBase.ts'

export class OnePasswordSecretBroker implements SecretBroker {
  readonly id = 'onepassword'

  async isAvailable(): Promise<boolean> {
    try {
      const r = await fetch(api('/api/passport/credential/status'))
      if (!r.ok) return false
      const j = (await r.json()) as { available?: boolean }
      return Boolean(j?.available)
    } catch {
      return false
    }
  }

  async requestScopedSecret(request: ScopedSecretRequest): Promise<ScopedSecretResult> {
    const r = await fetch(api('/api/passport/credential/lease'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    const j = (await r.json()) as {
      ok?: boolean
      lease?: { handle: string; item_title: string; field_labels: string[]; scope: string; expires_at: number }
      error?: string
    }
    if (!r.ok || !j?.ok || !j.lease) {
      // Fail closed: a denied lease yields no handle and no secret.
      throw new Error(j?.error ?? '1Password lease was denied (fail closed).')
    }
    return {
      handle: j.lease.handle,
      metadata: { title: j.lease.item_title, category: 'credential', field_labels: j.lease.field_labels },
      scope: j.lease.scope,
      expires_at: j.lease.expires_at,
    }
  }
}
