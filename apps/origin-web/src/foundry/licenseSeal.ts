// ----------------------------------------------------------------------------
// Origin Foundry — Signed Autonomy License artifact.
//
// The gym oracle computes a verdict (pass/category + reward + safe-path length)
// and today it vanishes. sealLicense() turns that ephemeral verdict into a
// structured, re-verifiable "ReadinessLicense" object the product can present.
//
// HONESTY — what this seal IS and IS NOT:
//   • IS  : a TAMPER-EVIDENT INTEGRITY SEAL — a SHA-256 hash over the canonical
//           JSON of the license fields. Recompute it and you can detect whether
//           any sealed field was altered after issuance.
//   • NOT : a PKI / asymmetric (public-key) signature. There is no private key,
//           no signer identity, no non-repudiation. Anyone holding the same
//           fields can recompute an identical seal.
//   • NOT : a blockchain / distributed ledger. Nothing is anchored, chained, or
//           witnessed off-machine. This seals the LOCAL verdict only.
//
// So: a checksum that proves the license object was not edited in transit — not
// a cryptographic attestation of WHO issued it. Keep that distinction in any
// user-facing copy.
//
// Deterministic by construction: same inputs → same seal. The only non-content
// input, issuedAt, is passed IN by the caller (never read from a module-top
// Date.now()) so the artifact is testable and reproducible. The nonce is derived
// from the content (floorHash + verdict), never Math.random.
// ----------------------------------------------------------------------------

import { sha256 } from '../passport/hash.ts'
import type { ReadinessLicense } from './types'

/** Inputs the gym handler already has after computing oracle + rollout. */
export interface SealLicenseInput {
  /** Rollout category / pass result — the verdict being licensed (e.g. 'pass', 'unsafe_zone'). */
  verdict: string
  /** Which deterministic oracle produced the verdict (so re-verifiers know the ruleset). */
  oracleVersion: string
  /** Robot embodiment the rollout was graded for (e.g. 'amr'). */
  embodiment: string
  /** Stable description of the task/site the verdict is about (id + grid + key cells). */
  floor: string
  /** Safe-path length the oracle found. */
  pathLength: number
  /** Reward the oracle assigned the rollout. */
  reward: number
  /** Issue timestamp (epoch ms). PASSED IN — do NOT call Date.now() here, keep it deterministic. */
  issuedAt: number
}

/**
 * Canonical, key-ordered JSON of the license body (everything the seal covers).
 * Stable key order is what makes the seal reproducible: JSON.stringify of a literal
 * with a fixed field order yields identical bytes for identical values.
 */
function canonicalBody(body: Omit<ReadinessLicense, 'seal'>): string {
  return JSON.stringify({
    licenseId: body.licenseId,
    verdict: body.verdict,
    oracleVersion: body.oracleVersion,
    embodiment: body.embodiment,
    floorHash: body.floorHash,
    pathLength: body.pathLength,
    reward: body.reward,
    issuedAt: body.issuedAt,
    nonce: body.nonce,
  })
}

/**
 * Seal a verdict into a re-verifiable ReadinessLicense.
 *
 * The `seal` field is a SHA-256 integrity hash over the canonical JSON of every
 * other field. It is tamper-evident (alter any field and verifyLicense() fails),
 * NOT a PKI signature and NOT a blockchain anchor — see the file header.
 */
export function sealLicense(input: SealLicenseInput): ReadinessLicense {
  // Hash the task/site description so the license carries a compact, stable
  // fingerprint of WHAT was evaluated without embedding the whole floor.
  const floorHash = sha256(input.floor)

  // Deterministic nonce derived from content (NOT Math.random): binds this license
  // to its exact floor + verdict so two different verdicts on the same floor get
  // distinct nonces, while identical inputs reproduce the same artifact.
  const nonce = sha256(`nonce:${floorHash}:${input.verdict}`).slice(0, 16)

  // licenseId is likewise content-derived (floorHash + verdict + issuedAt) so the
  // identifier is stable for a given issuance and never random.
  const licenseId = `rl_${sha256(`license:${floorHash}:${input.verdict}:${input.issuedAt}`).slice(0, 24)}`

  const body: Omit<ReadinessLicense, 'seal'> = {
    licenseId,
    verdict: input.verdict,
    oracleVersion: input.oracleVersion,
    embodiment: input.embodiment,
    floorHash,
    pathLength: input.pathLength,
    reward: input.reward,
    issuedAt: input.issuedAt,
    nonce,
  }

  const seal = sha256(canonicalBody(body))
  return { ...body, seal }
}

/**
 * Recompute the integrity seal over the license's own fields and compare.
 * Returns true iff the license has not been tampered with since it was sealed.
 *
 * NOTE: this proves the field bytes are intact, not WHO issued them — there is no
 * key to check against. It is a checksum verification, not signature verification.
 */
export function verifyLicense(license: ReadinessLicense): boolean {
  const { seal, ...rest } = license
  const recomputed = sha256(canonicalBody(rest))
  return recomputed === seal
}
