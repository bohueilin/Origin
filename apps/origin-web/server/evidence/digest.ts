// ----------------------------------------------------------------------------
// Tamper-evidence digest — the single source of digest logic, used on WRITE
// (over the audit row) and on READ-BACK (over the persisted row), so a row is
// comparable across the round-trip. Extracted from runEpisodeHandler so the
// standalone gym server and the legacy path share one implementation.
// ----------------------------------------------------------------------------

import { createHash } from 'node:crypto'

/** Deterministic JSON canonicalization (sorted keys) for the integrity digest. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const obj = value as Record<string, unknown>
  return (
    '{' +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]))
      .join(',') +
    '}'
  )
}

// The stable fields the integrity digest is computed over — identical on write
// and read-back. This is an ALLOW-LIST (not a deny-list) on purpose: InsForge
// injects its own `id` / `createdAt` / `updatedAt`, so hashing only known fields
// keeps write and read comparable.
//
// Scope = every persisted, non-secret field the app displays / sorts / summarizes
// / may replay / a future Vapi operator may narrate. Expanding scope is the SAFE
// direction for tamper-evidence: a field InsForge happens to normalize yields a
// false `mismatched` (conservative under-trust), never a false `valid`.
//
// INTENTIONALLY EXCLUDED:
//  - `id`            — assigned by InsForge (volatile, not server-authored).
//  - `audit_row_digest` — the digest itself.
//  - `createdAt` / `updatedAt` — InsForge's own row timestamps (not our column).
//  - `created_at`    — OUR server timestamp, excluded because timestamp columns
//                      are the most likely to be normalized on round-trip, which
//                      would make EVERY rehydrated row falsely mismatch and defeat
//                      the feature. (Documented in README.)
export const DIGEST_FIELDS = [
  // identity
  'trace_id',
  'run_id',
  'episode_index',
  'run_sequence',
  'trace_authority',
  // attribution / versions
  'environment_name',
  'scenario_registry_version',
  'verifier_version',
  'reward_model_version',
  'license_policy_version',
  'app_commit',
  'row_schema_version',
  // scenario (incl. canonical snapshot — server-side only, never sent to browser)
  'scenario_id',
  'scenario_version',
  'scenario_title',
  'domain',
  'scenario_snapshot',
  // policy provenance + inputs
  'requested_policy_mode',
  'actual_policy_source',
  'fallback',
  'fallback_code',
  'attempted_model_input',
  'actual_policy_input',
  'model_name',
  // normalized decision
  'action',
  'rationale',
  'requested_info',
  'confidence',
  // verifier result
  'passed',
  'reward',
  'category',
  'catastrophic',
  'expected_action',
  'actual_action',
  'verifier_reason',
  'verifier_checks',
  // license
  'license_level',
  'license_summary',
] as const

/**
 * SHA-256 over the stable canonical audit fields picked from `source` (the audit
 * row on write, or a persisted row on read-back). Deterministic across write/read
 * for the same evidence. Reused on both sides so a row is tamper-evident.
 */
export function computeAuditDigest(source: Record<string, unknown>): string {
  const picked: Record<string, unknown> = {}
  for (const k of DIGEST_FIELDS) picked[k] = source[k]
  return createHash('sha256').update(stableStringify(picked)).digest('hex')
}
