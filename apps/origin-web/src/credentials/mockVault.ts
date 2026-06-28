// Representative credential vault — the demo-mode stand-in for a live 1Password vault.
//
// Everything in here is CLEARLY REPRESENTATIVE. No value is ever held; each item is just
// a label + a reference (vaultRef/itemRef) that a grant can point at. When the broker is
// LIVE (OP_SERVICE_ACCOUNT_TOKEN set) the real catalog comes from the `op:'catalog'` op on
// the edge function instead; until then this roster lets the entire assign/revoke/test
// pipeline run end to end with real `credential_grants` rows — only the final secret
// resolution flips to real when the token is present.
//
// The titles are realistic on purpose (a demo of fleet permissions should look like a real
// vault), but they resolve to nothing: there is no secret behind `cred-07`. The banner in
// the UI always says "Representative vault" while `isRepresentative()` is true.

import { insforge } from '../insforge'

/** One catalog item: a vault reference + a human label. NEVER a value. Mirrors what the
 *  broker's `op:'catalog'` returns (titles + refs only) so the UI is provider-agnostic. */
export interface VaultItem {
  vaultRef: string
  itemRef: string
  title: string
  fieldLabels: string[]
  /** true while this item comes from the representative roster (no live vault behind it). */
  representative: boolean
}

export const REPRESENTATIVE_VAULT_NAME = 'Origin-Demo-Vault'

// 30 realistic-but-fictional credentials. Names span the surfaces a robot fleet would touch:
// cloud, payments, logistics, source control, observability, comms. itemRefs are stable
// (`cred-01`..`cred-30`) so a grant's item_ref is deterministic across reloads.
const TITLES: string[] = [
  'AWS prod read-only',
  'AWS staging deploy',
  'Stripe restricted key',
  'DoorDash partner API',
  'GitHub deploy token',
  'Datadog ingest key',
  'Twilio messaging SID',
  'SendGrid mail key',
  'Cloudflare zone token',
  'PagerDuty events key',
  'Snowflake analyst role',
  'Segment write key',
  'Shopify storefront token',
  'Plaid sandbox secret',
  'Mapbox tiles token',
  'OpenAI org key',
  'Slack bot token',
  'Jira automation token',
  'Linear API key',
  'HubSpot private app',
  'Postmark server token',
  'Auth0 management key',
  'Okta API token',
  'Vercel deploy hook',
  'Fastly purge token',
  'New Relic ingest key',
  'Algolia admin key',
  'Square access token',
  'UPS shipping API',
  'FedEx web services key',
]

/** The representative roster: 30 items, all pinned to the demo vault, labels only. */
export const REPRESENTATIVE_VAULT: VaultItem[] = TITLES.map((title, i) => ({
  vaultRef: REPRESENTATIVE_VAULT_NAME,
  itemRef: `cred-${String(i + 1).padStart(2, '0')}`,
  title,
  fieldLabels: ['credential'],
  representative: true,
}))

/**
 * Is the broker running against the representative vault (demo mode) rather than a live
 * 1Password vault?
 *
 * Client-side we can NEVER see OP_SERVICE_ACCOUNT_TOKEN (it lives only on the edge), so we
 * treat "representative" as the safe default and only flip to live when a server probe says
 * the broker is live. Callers that have that probe (the catalog endpoint) pass `liveProbe`;
 * with no probe we stay representative — the honest, fail-safe default for a demo.
 */
export function isRepresentative(liveProbe?: { live?: boolean } | null): boolean {
  if (liveProbe && liveProbe.live === true) return false
  return true
}

/** Convenience: are we even wired to a backend? (mirrors store.ts fail-soft on null insforge) */
export function hasBackend(): boolean {
  return Boolean(insforge)
}
