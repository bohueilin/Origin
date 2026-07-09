// ----------------------------------------------------------------------------
// Countersign scope policy — the ONE deterministic map from an earned autonomy
// license level (L0..L4) to the set of capabilities a credential at that level
// may unlock. This is the module the capability gate calls.
//
// The level ladder (apps/janus/src/license.ts) says how much autonomy an agent
// has EARNED; the capability catalog (apps/janus/src/janus/capabilities.ts) says
// what each dotted capability id costs (risk + sideEffecting). This module joins
// them: the level is the ceiling, the manifest is the join table.
//
// Invariant — "capability is not permission": high/critical side-effecting
// commits (messages.send, delivery.order.submit, ride.booking.submit, ...) are
// NEVER auto-unlocked by any level. Even at L4 they resolve to require_approval;
// a human must OK each one explicitly. GLOBAL_FORBIDDEN caps are denied outright.
//
// Pure and deterministic: no I/O, no wall-clock, no RNG. The manifest is loaded
// via a static JSON import (never read from disk at call time) and hashed so the
// policy itself is tamper-evident — the digest is embedded into every Warrant.
// ----------------------------------------------------------------------------

import { createHash } from 'node:crypto'
import { stableStringify } from './evidence/digest.ts'
import manifestJson from './capabilityManifest.json' with { type: 'json' }

export type LicenseLevelId = 'L0' | 'L1' | 'L2' | 'L3' | 'L4'

/** The three-way outcome the gate acts on. */
export type ScopeDecisionKind = 'allow' | 'require_approval' | 'deny'

export interface ScopeDecision {
  decision: ScopeDecisionKind
  reason: string
}

interface CapabilityManifest {
  manifest_version: string
  levels: Record<LicenseLevelId, string[]>
  always_human_approval: string[]
  always_forbidden: string[]
  notes: string
}

// Static, immutable view of the declarative manifest. Cast because a JSON import
// widens `levels` to Record<string, string[]>; the shape is validated at load.
const manifest = manifestJson as CapabilityManifest

/** Ladder order, mirrors packages/verifier-core/license-policy.mjs LICENSE_ORDER. */
export const LICENSE_ORDER: readonly LicenseLevelId[] = ['L0', 'L1', 'L2', 'L3', 'L4']

const HUMAN_APPROVAL = new Set(manifest.always_human_approval)
const FORBIDDEN = new Set(manifest.always_forbidden)

/**
 * The cumulative set of capabilities a credential at `level` may unlock. The
 * manifest stores each level cumulatively (L0 ⊆ L1 ⊆ … ⊆ L4), so this is a
 * direct read; a fresh Set is returned each call so callers cannot mutate state.
 */
export function allowedCapabilities(level: LicenseLevelId): Set<string> {
  const caps = manifest.levels[level]
  return new Set(caps ?? [])
}

/** True iff `capability` is within `level`'s scope ceiling (ignores approval gating). */
export function isCapabilityInScope(level: LicenseLevelId, capability: string): boolean {
  return allowedCapabilities(level).has(capability)
}

/**
 * True for the high/critical side-effecting commits that NO level auto-unlocks.
 * These always require an explicit, one-shot human approval — even at L4.
 */
export function requiresHumanApproval(capability: string): boolean {
  return HUMAN_APPROVAL.has(capability)
}

/** True for GLOBAL_FORBIDDEN caps that are denied even WITH human approval. */
export function isForbidden(capability: string): boolean {
  return FORBIDDEN.has(capability)
}

/**
 * The gate decision for (level, capability):
 *   - deny            — the capability is globally forbidden, OR the level's
 *                       ceiling does not include it (autonomy not yet earned).
 *   - require_approval— a high/critical side-effecting commit: a human must OK
 *                       it explicitly, at ANY level (capability is not permission).
 *   - allow           — in scope for this level and not human-approval-gated.
 *
 * Forbidden is checked first so a forbidden cap can never leak an approval path.
 */
export function scopeDecision(level: LicenseLevelId, capability: string): ScopeDecision {
  if (isForbidden(capability)) {
    return {
      decision: 'deny',
      reason: `${capability} is globally forbidden — denied at every level, even with human approval.`,
    }
  }
  if (requiresHumanApproval(capability)) {
    return {
      decision: 'require_approval',
      reason: `${capability} is a high/critical side-effecting commit — no license level auto-unlocks it; a human must approve it explicitly, even at ${LICENSE_ORDER[LICENSE_ORDER.length - 1]}.`,
    }
  }
  if (isCapabilityInScope(level, capability)) {
    return {
      decision: 'allow',
      reason: `${capability} is within the scope ceiling of license ${level}.`,
    }
  }
  return {
    decision: 'deny',
    reason: `${capability} is outside the scope ceiling of license ${level} — the agent has not earned the autonomy to unlock it; escalate to a human or a higher license.`,
  }
}

/**
 * Deterministic SHA-256 over a canonicalized manifest (sorted keys). Reuses the
 * canonical stableStringify so the digest matches the rest of the evidence spine.
 * Defaults to the live manifest; accepts an override so callers/tests can prove
 * that any mutation changes the digest (tamper-evidence).
 */
export function computeManifestDigest(source: unknown = manifest): string {
  return createHash('sha256').update(stableStringify(source)).digest('hex')
}

/** The canonical digest of the live level→scope manifest, embedded into Warrants. */
export function manifestDigest(): string {
  return computeManifestDigest(manifest)
}

/** The manifest_version string pinned into evidence for provenance. */
export const MANIFEST_VERSION = manifest.manifest_version

/** Read-only handle to the loaded manifest (for introspection / debugging). */
export const capabilityManifest: Readonly<CapabilityManifest> = manifest
