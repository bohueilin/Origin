// 1Password provider — Service-Account + lease model, fail-closed by design.
//
// The PRODUCTION secret-resolving path runs SERVER-SIDE in the edge function
// `functions/credential-broker.ts` + `functions/_onePasswordBroker.ts`: a SERVICE ACCOUNT
// token (`ops_…`) held only by the server resolves `op://vault/item/field` references JIT
// via @1password/sdk `secrets.resolve(...)`, ONLY at the tool-execution boundary, and
// returns only an opaque lease handle (`pph_…`) + redacted metadata. The secret never
// leaves 1Password and never reaches the agent or the browser.
//
// This provider mirrors that contract for the `brokerCapability` pipeline. It NEVER
// resolves a secret in this process: it builds the `op://` reference from the grant,
// pins it to the configured vault, mints an opaque task-scoped handle, and returns only
// redacted metadata. When no service-account token is configured it FAILS CLOSED
// (resolveCapability throws → broker denies). The token is never read in the browser;
// `serviceAccountToken` here is only ever populated server-side — in the browser the
// provider is unconfigured and so degrades to the mock broker for everything.
import type { CredentialGrant, CapabilityRequest, CredentialProvider, ProviderResolution, RuntimeContext } from './types'
import { redact } from './redact'

export interface OnePasswordConfig {
  // Present ONLY when running server-side. In the browser this is always undefined, so the
  // provider is unconfigured and fails closed (→ mock fallback at the wiring layer).
  serviceAccountToken?: string
  // The vault the brokered service account is pinned to (op:// refs outside it are rejected).
  vault?: string
  integrationName: string
}

const DEFAULT_TTL_MS = 5 * 60 * 1000

/** Parse op://vault/item/field. Field optional. */
function parseRef(ref: string): { vault: string; item: string; field?: string } | null {
  const m = /^op:\/\/([^/\s]+)\/([^/\s]+)(?:\/(.+))?$/.exec(ref.trim())
  if (!m) return null
  return { vault: m[1], item: m[2], field: m[3] }
}

/** Build the op://vault/item/field reference from the grant's stored refs. */
function buildRef(grant: CredentialGrant): string {
  const vault = (grant.vaultRef ?? '').trim()
  const item = (grant.itemRef ?? '').trim()
  if (!vault || !item) throw new Error('onepassword grant missing vaultRef/itemRef')
  return `op://${vault}/${item}`
}

/** Opaque, task-scoped handle. Carries no secret and cannot be exchanged for one. */
function handle(grant: CredentialGrant, request: CapabilityRequest): string {
  const runPart = (request.runId ?? grant.runId ?? 'norun').slice(0, 12)
  return `pph_${grant.id.slice(0, 8)}_${grant.scope}_${runPart}`
}

export function createOnePasswordProvider(config: OnePasswordConfig = { integrationName: 'OriginPhysicalAI' }): CredentialProvider {
  const configured = Boolean(config.serviceAccountToken)
  return {
    id: 'onepassword',

    async resolveCapability(grant: CredentialGrant, request: CapabilityRequest, _context: RuntimeContext): Promise<ProviderResolution> {
      void _context
      // FAIL CLOSED: no service-account token → never silently succeed. In the browser this
      // is always the case, so onepassword grants degrade to the mock broker upstream.
      if (!configured) {
        throw new Error('onepassword provider not configured (fail closed): set OP_SERVICE_ACCOUNT_TOKEN server-side')
      }
      const ref = buildRef(grant)
      const parsed = parseRef(ref)
      if (!parsed) throw new Error('onepassword grant has an invalid op:// reference')
      // Vault pinning (defense in depth): only the brokered vault is reachable.
      if (config.vault && parsed.vault !== config.vault) {
        throw new Error('onepassword reference is outside the brokered vault')
      }
      // Redacted metadata ONLY — never a field value. The secret is resolved JIT server-side
      // (via @1password/sdk) inside the edge function's lease 'use' boundary, never here.
      return {
        sessionHandle: handle(grant, request),
        serviceMetadataRedacted: redact({
          provider: 'onepassword',
          vaultRef: grant.vaultRef ?? null,
          itemRef: grant.itemRef ?? null,
          itemTitle: parsed.item,
          fieldLabels: parsed.field ? [parsed.field] : [],
          expiresAt: Date.now() + DEFAULT_TTL_MS,
        }) as Record<string, unknown>,
      }
    },

    async revokeGrant(_grantId: string): Promise<void> {
      // Revocation = the lease kill switch. The durable grant-status change is the broker
      // store's job; the live lease is revoked server-side via `revokeLease` in the edge
      // function. Nothing secret to tear down in this process.
      void _grantId
    },
  }
}

// Default export is the UNCONFIGURED provider so any accidental wiring (and the browser)
// fails closed: resolveCapability throws → the broker denies with 'provider error (fail closed)'.
export const onepasswordProvider: CredentialProvider = createOnePasswordProvider()
