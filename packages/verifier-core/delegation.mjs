// Countersign delegation — offline attenuated authority, macaroon-style, Ed25519-signed.
// =============================================================================
// The problem: an agent that EARNED authority (a Warrant, at some license level) needs to
// hand a NARROWER slice of that authority to a sub-agent — a tool it spawns, a contractor it
// calls — and do it entirely OFFLINE (no server round-trip, no revocation callback), yet have
// a third party verify the whole chain and know exactly (a) what the leaf may do and (b) who
// the authority ultimately traces back to. This is the macaroon idea (caveats that only ever
// ADD restrictions) but with a public-key twist: each hop is signed by the delegating agent's
// own Ed25519 key (countersign-identity), so a verifier confirms WHO narrowed WHAT without
// sharing any secret and without contacting the issuer.
//
// The one load-bearing invariant: **authority only ever NARROWS down the chain, and attribution
// to the root never launders away.** Every layer below stops a specific escalation:
//
//   1. self-digest (sha256 of the cert minus its own digest+signature) — flip any field and
//      the digest no longer recomputes → TAMPERED (1). Nothing in a cert is editable in place.
//   2. parent signature over that digest, by the PARENT'S key — a cert is only authority if the
//      agent that HELD the authority signed the narrowing. We resolve the parent key by its
//      claimed thumbprint (from opts.publicJwks or the embedded JWK) and REQUIRE
//      agentThumbprint(key) === parent_thumbprint, so a forged/self-issued cert wearing the
//      parent's name is rejected before the signature is even trusted → BAD PARENT SIG (2).
//   3. monotonic narrowing (intersectCaveats) — the child's grant must be a SUBSET of the
//      parent's effective grant on every dimension. Add a tool the parent never had, ask a
//      bigger budget, a longer ttl, a path outside the parent's subtree → SCOPE ESCALATION (3).
//      This is the macaroon guarantee: caveats compose by intersection, never by union.
//   4. depth budget — max_depth DECREMENTS each hop; when it hits zero the chain cannot grow
//      another link → DEPTH EXCEEDED (4). Stops an unbounded re-delegation fan-out.
//   5. chain linkage — each cert's parent_delegation_digest must point at the PREVIOUS cert's
//      self-digest (or the root Warrant's digest), and its parent_thumbprint must be the
//      previous grantee. Splice a cert from another chain, or re-delegate as someone who was
//      never the grantee → BROKEN LINK (5). Attribution to the root is unforgeable.
//   6. audience binding — a cert may pin an audience (the resource it is FOR); a child cannot
//      retarget it, and a resource server pins its own id via opts.expectedAudience → WRONG
//      AUDIENCE (6). A delegation minted for service A cannot be replayed against service B.
//   7. everything else fails CLOSED as MALFORMED (7): a non-object cert, a caveat of the wrong
//      type, a depth that doesn't match its position. Ambiguity is denial, never allowance.
//
// Honest scope (mirrors warrant.mjs): this proves the delegation chain is a well-formed,
// strictly-narrowing, correctly-signed attenuation ROOTED at a given thumbprint. It does NOT
// prove that root actually EARNED its authority — that is verifyWarrant's job (re-derive the
// level from evidence under the pinned policy, pin the issuer). Verify the root Warrant first,
// then verify the delegation chain hangs off it. Two layers, cleanly separated.
//
// Pure + deterministic: no Date.now, no RNG. issued_at / ttl are caller-supplied numbers, and
// verification does no wall-clock comparison (freshness is the caller's, like verifyWarrant).
// Reuses canonical()+sha256() from @origin/evidence for the digest, and signPayload/verifyPayload
// from countersign-identity for the Ed25519 layer — the same primitives the rest of the stack
// already trusts.
// =============================================================================

import { canonical, sha256 } from '@origin/evidence/env-evidence'
import { agentThumbprint, signPayload, verifyPayload } from './countersign-identity.mjs'
import { levelRank } from './license-policy.mjs'

export const DELEGATION_SCHEMA_VERSION = '1.0.0'
export const COUNTERSIGN_DELEGATION_VERSION = 'countersign-delegation-v1'

/**
 * Deny codes returned by verifyDelegationChain (and mapped from intersectCaveats dimensions).
 * Documented once, here, so a verifier and a caller agree on the enum.
 */
export const DELEGATION_DENY = Object.freeze({
  VALID: 0, // a well-formed, strictly-narrowing, correctly-signed chain
  TAMPERED: 1, // a cert's self-digest does not recompute — a field was altered in place
  BAD_PARENT_SIG: 2, // the parent signature is invalid, or the key doesn't own the claimed parent id
  SCOPE_ESCALATION: 3, // a child tried to WIDEN a dimension (tool/capability/budget/ttl/path)
  DEPTH_EXCEEDED: 4, // max_depth decremented to zero (or an absolute opts.maxDepth cap was passed)
  BROKEN_LINK: 5, // parent_delegation_digest / parent_thumbprint does not link to the prior holder
  WRONG_AUDIENCE: 6, // a child retargeted the audience, or it != opts.expectedAudience
  MALFORMED: 7, // structurally invalid — non-object cert, bad caveat type, depth/position mismatch
})

// ── small helpers ────────────────────────────────────────────────────────────
const isFiniteNum = (n) => typeof n === 'number' && Number.isFinite(n)
const isStrArray = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string')
const uniqSort = (a) => Array.from(new Set(a)).sort()
const normArr = (a) => (isStrArray(a) ? uniqSort(a) : null)
const numOrNull = (n) => (isFiniteNum(n) ? n : null)
const short = (t) => (typeof t === 'string' ? t.slice(0, 10) : String(t))

/** Derive the PUBLIC Ed25519 JWK from a private one (drop `d`). Fails closed on a non-OKP key. */
function publicFromPrivate(jwk) {
  if (!jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.x !== 'string') {
    throw new Error('delegation: expected an Ed25519 OKP private JWK {kty,crv,x,d}')
  }
  return { kty: 'OKP', crv: 'Ed25519', x: jwk.x }
}

/** Content address of a DelegationCert, excluding its own self-digest + signature. */
function delegationDigest(cert) {
  const { cert_digest, parent_signature, ...rest } = cert
  void cert_digest
  void parent_signature
  return sha256(canonical(rest))
}

/**
 * Structural validation of a caveats object. Returns { ok } or { ok:false, reason }.
 * Unspecified dimensions are legal (they inherit the parent's). A PRESENT dimension of the
 * wrong shape is malformed — fail closed. Used by mint (which throws) and verify (code 7).
 */
export function validateCaveats(caveats) {
  if (caveats == null) return { ok: true }
  if (typeof caveats !== 'object' || Array.isArray(caveats)) return { ok: false, reason: 'caveats must be an object' }
  if ('tools' in caveats && !isStrArray(caveats.tools)) return { ok: false, reason: 'caveats.tools must be an array of strings' }
  if ('capabilities' in caveats && !isStrArray(caveats.capabilities)) return { ok: false, reason: 'caveats.capabilities must be an array of strings' }
  if ('path_prefix' in caveats && typeof caveats.path_prefix !== 'string') return { ok: false, reason: 'caveats.path_prefix must be a string' }
  if ('budget' in caveats && !isFiniteNum(caveats.budget)) return { ok: false, reason: 'caveats.budget must be a finite number' }
  if ('ttl_ms' in caveats && !isFiniteNum(caveats.ttl_ms)) return { ok: false, reason: 'caveats.ttl_ms must be a finite number' }
  if ('max_depth' in caveats && (!Number.isInteger(caveats.max_depth) || caveats.max_depth < 0)) return { ok: false, reason: 'caveats.max_depth must be a non-negative integer' }
  if ('audience' in caveats && typeof caveats.audience !== 'string') return { ok: false, reason: 'caveats.audience must be a string' }
  return { ok: true }
}

/** Canonicalize caveats for minting: validate (throw on bad), keep known keys, sort arrays. */
function normalizeCaveats(caveats) {
  const v = validateCaveats(caveats)
  if (!v.ok) throw new Error(`mintDelegation: ${v.reason}`)
  const out = {}
  if (caveats && 'tools' in caveats) out.tools = uniqSort(caveats.tools)
  if (caveats && 'capabilities' in caveats) out.capabilities = uniqSort(caveats.capabilities)
  if (caveats && 'path_prefix' in caveats) out.path_prefix = caveats.path_prefix
  if (caveats && 'budget' in caveats) out.budget = caveats.budget
  if (caveats && 'ttl_ms' in caveats) out.ttl_ms = caveats.ttl_ms
  if (caveats && 'max_depth' in caveats) out.max_depth = caveats.max_depth
  if (caveats && 'audience' in caveats) out.audience = caveats.audience
  return out
}

/** Read a caveats object into the canonical internal shape; null on every unspecified dimension. */
function readCaveats(caveats) {
  const src = caveats && typeof caveats === 'object' && !Array.isArray(caveats) ? caveats : {}
  return {
    tools: normArr(src.tools),
    capabilities: normArr(src.capabilities),
    path_prefix: typeof src.path_prefix === 'string' ? src.path_prefix : null,
    budget: numOrNull(src.budget),
    ttl_ms: numOrNull(src.ttl_ms),
    max_depth: numOrNull(src.max_depth),
    audience: typeof src.audience === 'string' ? src.audience : null,
  }
}

const escalation = (dimension, reason) => ({ ok: false, escalation: true, dimension, reason })

/** Set narrowing: child must be a SUBSET of parent (null parent = wildcard / all allowed). */
function narrowSet(parentArr, childArr, dim) {
  if (childArr == null) return { ok: true, value: parentArr } // child unspecified → inherit
  if (parentArr != null) {
    for (const item of childArr) {
      if (!parentArr.includes(item)) return escalation(dim, `child adds "${item}" not granted by parent ${dim}`)
    }
  }
  return { ok: true, value: childArr }
}

/** Numeric ceiling narrowing: child must be <= parent (null parent = unbounded). Effective = min. */
function narrowMax(parentVal, childVal, dim) {
  if (childVal == null) return { ok: true, value: parentVal } // inherit
  if (parentVal != null && childVal > parentVal) return escalation(dim, `child ${dim} ${childVal} exceeds parent ${parentVal}`)
  return { ok: true, value: parentVal == null ? childVal : Math.min(parentVal, childVal) }
}

/**
 * The monotonic-narrowing kernel: intersect a parent's effective caveats with a child's.
 * Returns { ok:true, effective } — the NARROWER of each dimension (what the child may actually
 * do) — or an error marker { ok:false, escalation:true, dimension, reason } the instant the
 * child tries to WIDEN any dimension. `parent`/`child` may be raw caveat objects; unspecified
 * dimensions inherit the parent. This is the whole monotonicity guarantee in one place.
 *
 * Dimension → deny mapping used by verifyDelegationChain:
 *   tools · capabilities · path_prefix · budget · ttl_ms → SCOPE_ESCALATION (3)
 *   max_depth → DEPTH_EXCEEDED (4) · audience → WRONG_AUDIENCE (6)
 */
export function intersectCaveats(parent, child) {
  const p = readCaveats(parent)
  const c = readCaveats(child)
  const eff = {}

  const t = narrowSet(p.tools, c.tools, 'tools')
  if (!t.ok) return t
  eff.tools = t.value

  const cap = narrowSet(p.capabilities, c.capabilities, 'capabilities')
  if (!cap.ok) return cap
  eff.capabilities = cap.value

  // path_prefix: the child's must EXTEND the parent's (a subtree). null parent → root ''.
  const parentPrefix = p.path_prefix ?? ''
  if (c.path_prefix == null) {
    eff.path_prefix = p.path_prefix
  } else if (!c.path_prefix.startsWith(parentPrefix)) {
    return escalation('path_prefix', `child path_prefix "${c.path_prefix}" does not extend parent "${parentPrefix}"`)
  } else {
    eff.path_prefix = c.path_prefix
  }

  const b = narrowMax(p.budget, c.budget, 'budget')
  if (!b.ok) return b
  eff.budget = b.value

  const ttl = narrowMax(p.ttl_ms, c.ttl_ms, 'ttl_ms')
  if (!ttl.ok) return ttl
  eff.ttl_ms = ttl.value

  // max_depth DECREMENTS: a parent with N further delegations left grants a child at most N-1.
  // A parent already at 0 (or below) may not spawn another link at all.
  const pMax = p.max_depth
  if (pMax != null && pMax <= 0) return escalation('max_depth', 'parent grants no further delegation (max_depth exhausted)')
  const allowedChildMax = pMax == null ? null : pMax - 1
  if (c.max_depth == null) {
    eff.max_depth = allowedChildMax
  } else if (allowedChildMax != null && c.max_depth > allowedChildMax) {
    return escalation('max_depth', `child max_depth ${c.max_depth} exceeds parent budget ${allowedChildMax}`)
  } else {
    eff.max_depth = allowedChildMax == null ? c.max_depth : Math.min(c.max_depth, allowedChildMax)
  }

  // audience: a child may SET it if the parent left it open, but never RETARGET a set one.
  if (c.audience == null) {
    eff.audience = p.audience
  } else if (p.audience != null && c.audience !== p.audience) {
    return escalation('audience', `child audience "${c.audience}" diverges from parent "${p.audience}"`)
  } else {
    eff.audience = c.audience
  }

  return { ok: true, effective: eff }
}

/** The friendly, JSON-safe view of effective caveats (null = unbounded / no restriction). */
function publicCaveats(eff) {
  return {
    tools: eff.tools, // string[] | null (null = all tools)
    capabilities: eff.capabilities, // string[] | null
    path_prefix: eff.path_prefix ?? '', // '' = no path restriction
    budget: eff.budget, // number | null (null = unbounded)
    ttl_ms: eff.ttl_ms, // number | null
    max_depth: eff.max_depth, // number | null (further delegations still permitted below the leaf)
    audience: eff.audience, // string | null
  }
}

/**
 * Mint a signed DelegationCert: the PARENT narrows a slice of its authority to a CHILD.
 * The parent signs (Ed25519) the cert's self-digest, binding parent+child thumbprints, the
 * caveats, the link back to the parent cert (or root Warrant) digest, the depth, and issued_at.
 * The parent's PUBLIC key rides along so the chain is self-verifying; a verifier still checks
 * that key's thumbprint equals parent_thumbprint, so embedding it grants no forgery power.
 *
 * @param parentThumbprint   who is delegating (must own parentPrivateJwk; derived if omitted).
 * @param parentPrivateJwk   the parent's Ed25519 private JWK — it SIGNS the narrowing.
 * @param childThumbprint    the grantee's agent id.
 * @param caveats            monotonic restrictions (see validateCaveats). Only ever narrow.
 * @param parentDelegationDigest  the prior cert's cert_digest, or the root Warrant's warrant_digest.
 * @param depth              1-based hop index (root Warrant = 0, first delegation = 1, ...).
 * @param issuedAt           caller-supplied timestamp (no wall-clock here). Bound into the digest.
 */
export function mintDelegation({
  parentThumbprint,
  parentPrivateJwk,
  childThumbprint,
  caveats = {},
  parentDelegationDigest = null,
  depth = 1,
  issuedAt = null,
}) {
  if (!parentPrivateJwk) throw new Error('mintDelegation: parentPrivateJwk is required (the parent signs the narrowing)')
  if (typeof childThumbprint !== 'string' || !childThumbprint) throw new Error('mintDelegation: childThumbprint is required')
  if (!Number.isInteger(depth) || depth < 1) throw new Error('mintDelegation: depth must be a positive integer (first delegation = 1)')

  const parentPublicJwk = publicFromPrivate(parentPrivateJwk)
  const derived = agentThumbprint(parentPublicJwk)
  if (parentThumbprint == null) parentThumbprint = derived
  else if (parentThumbprint !== derived) {
    throw new Error('mintDelegation: parentThumbprint does not match the signing key (a parent can only delegate its own authority)')
  }

  const cert = {
    delegation_schema_version: DELEGATION_SCHEMA_VERSION,
    v: COUNTERSIGN_DELEGATION_VERSION,
    parent_thumbprint: parentThumbprint,
    child_thumbprint: childThumbprint,
    caveats: normalizeCaveats(caveats),
    parent_delegation_digest: parentDelegationDigest, // links to the prior cert, or the root Warrant
    depth,
    issued_at: issuedAt,
    parent_public_jwk: parentPublicJwk, // self-verifying; thumbprint-checked on verify
  }
  cert.cert_digest = delegationDigest(cert)
  cert.parent_signature = signPayload({ cert_digest: cert.cert_digest }, parentPrivateJwk)
  return cert
}

/** A root Warrant sits at the head of a chain; a cert never has agent_thumbprint without a parent. */
function isWarrantLike(x) {
  return !!x && typeof x === 'object' && 'agent_thumbprint' in x && !('parent_thumbprint' in x)
}

/**
 * Verify a delegation chain end-to-end, fully offline. Returns
 *   { ok, code, reason, effectiveCaveats, depth, checks }.
 *
 * `chain` is either [rootWarrant, cert1, cert2, ...] (root Warrant at the head) or a bare
 * [cert1, cert2, ...] with the root supplied via opts.rootWarrant / opts.rootThumbprint. The
 * root Warrant is used ONLY as the attribution anchor (its agent_thumbprint + warrant_digest) —
 * whether that Warrant is legitimately EARNED is verifyWarrant's separate concern.
 *
 * @param opts.rootWarrant        alternative to a head warrant (supplies thumbprint + digest).
 * @param opts.rootThumbprint     pin the agent the chain must root at (cross-checked vs a head warrant).
 * @param opts.rootDelegationDigest  the digest cert1.parent_delegation_digest must match (root anchor).
 * @param opts.rootCaveats        the root's maximal authority (defaults to fully unbounded).
 * @param opts.publicJwks         { [thumbprint]: publicJwk } to resolve parent keys (else embedded).
 * @param opts.maxDepth           an absolute hop cap (in addition to the max_depth caveat budget).
 * @param opts.expectedAudience   the resource server's own id; the chain's audience must equal it.
 */
export function verifyDelegationChain(chain, opts = {}) {
  const checks = []
  const pass = (m) => (checks.push(['PASS', m]), true)
  const deny = (code, reason) => ({
    ok: false,
    code,
    reason,
    effectiveCaveats: null,
    depth: null,
    checks: (checks.push(['FAIL', reason]), checks),
  })

  if (!Array.isArray(chain) || chain.length === 0) return deny(DELEGATION_DENY.MALFORMED, 'delegation chain must be a non-empty array')

  // ── resolve the root anchor: a head Warrant, or opts. ────────────────────────
  let certs, rootThumbprint, rootDigest
  if (isWarrantLike(chain[0])) {
    const w = chain[0]
    rootThumbprint = w.agent_thumbprint
    rootDigest = typeof w.warrant_digest === 'string' ? w.warrant_digest : (opts.rootDelegationDigest ?? null)
    certs = chain.slice(1)
    if (opts.rootThumbprint != null && opts.rootThumbprint !== rootThumbprint) {
      return deny(DELEGATION_DENY.BROKEN_LINK, `root Warrant thumbprint ${short(rootThumbprint)} != pinned root ${short(opts.rootThumbprint)}`)
    }
  } else {
    certs = chain
    rootThumbprint = opts.rootThumbprint ?? opts.rootWarrant?.agent_thumbprint ?? null
    rootDigest = opts.rootDelegationDigest ?? opts.rootWarrant?.warrant_digest ?? null
  }
  if (certs.length === 0) return deny(DELEGATION_DENY.MALFORMED, 'no delegation certs to verify')
  if (rootThumbprint == null) return deny(DELEGATION_DENY.MALFORMED, 'no root thumbprint — supply a root Warrant or opts.rootThumbprint')

  // ── walk the chain, narrowing as we go. ──────────────────────────────────────
  let parentEffective = readCaveats(opts.rootCaveats ?? {}) // fully unbounded unless the caller caps it
  let expectedParentThumb = rootThumbprint
  let expectedParentLink = rootDigest // may be null → the first link is trusted as the anchor
  let leafHolder = rootThumbprint
  let leafDepth = 0

  for (let i = 0; i < certs.length; i++) {
    const cert = certs[i]

    // structural — a cert must be a signed object with both thumbprints and a depth in position.
    if (
      !cert ||
      typeof cert !== 'object' ||
      typeof cert.cert_digest !== 'string' ||
      typeof cert.parent_signature !== 'string' ||
      typeof cert.parent_thumbprint !== 'string' ||
      typeof cert.child_thumbprint !== 'string'
    ) {
      return deny(DELEGATION_DENY.MALFORMED, `cert[${i}] malformed — missing digest, signature, or thumbprints`)
    }
    if (cert.depth !== i + 1) return deny(DELEGATION_DENY.MALFORMED, `cert[${i}] depth ${cert.depth} does not match its chain position ${i + 1}`)
    const cv = validateCaveats(cert.caveats)
    if (!cv.ok) return deny(DELEGATION_DENY.MALFORMED, `cert[${i}] ${cv.reason}`)

    // (1) integrity — the self-digest recomputes → no field was altered in place.
    if (delegationDigest(cert) !== cert.cert_digest) return deny(DELEGATION_DENY.TAMPERED, `cert[${i}] tampered — cert_digest does not recompute`)

    // (5) linkage — this cert must hang off the PREVIOUS holder + the previous cert's digest.
    if (cert.parent_thumbprint !== expectedParentThumb) {
      return deny(DELEGATION_DENY.BROKEN_LINK, `cert[${i}] parent ${short(cert.parent_thumbprint)} is not the prior grantee ${short(expectedParentThumb)}`)
    }
    if (expectedParentLink != null && cert.parent_delegation_digest !== expectedParentLink) {
      return deny(DELEGATION_DENY.BROKEN_LINK, `cert[${i}] parent_delegation_digest does not link to the prior cert/root`)
    }

    // (2) authenticity — resolve the parent key, REQUIRE it owns the claimed id, then verify.
    const key = opts.publicJwks?.[cert.parent_thumbprint] ?? cert.parent_public_jwk
    if (!key) return deny(DELEGATION_DENY.BAD_PARENT_SIG, `cert[${i}] no parent public key (not embedded and not in opts.publicJwks)`)
    let keyThumb
    try {
      keyThumb = agentThumbprint(key)
    } catch {
      return deny(DELEGATION_DENY.BAD_PARENT_SIG, `cert[${i}] parent public key is not a valid Ed25519 JWK`)
    }
    if (keyThumb !== cert.parent_thumbprint) {
      return deny(DELEGATION_DENY.BAD_PARENT_SIG, `cert[${i}] key does not own the claimed parent id (thumbprint mismatch)`)
    }
    if (!verifyPayload({ cert_digest: cert.cert_digest }, cert.parent_signature, key)) {
      return deny(DELEGATION_DENY.BAD_PARENT_SIG, `cert[${i}] parent signature invalid for this key`)
    }

    // (3/4/6) monotonic narrowing — the child must be a strict subset of the parent's grant.
    const inter = intersectCaveats(parentEffective, cert.caveats)
    if (!inter.ok) {
      const code =
        inter.dimension === 'max_depth' ? DELEGATION_DENY.DEPTH_EXCEEDED : inter.dimension === 'audience' ? DELEGATION_DENY.WRONG_AUDIENCE : DELEGATION_DENY.SCOPE_ESCALATION
      return deny(code, `cert[${i}] ${inter.reason}`)
    }

    // (4) absolute hop cap, if the caller pinned one.
    if (opts.maxDepth != null && cert.depth > opts.maxDepth) return deny(DELEGATION_DENY.DEPTH_EXCEEDED, `cert[${i}] depth ${cert.depth} exceeds max ${opts.maxDepth}`)

    pass(`cert[${i}] valid — ${short(cert.parent_thumbprint)} narrows to child ${short(cert.child_thumbprint)}`)

    parentEffective = inter.effective
    expectedParentThumb = cert.child_thumbprint
    expectedParentLink = cert.cert_digest
    leafHolder = cert.child_thumbprint
    leafDepth = cert.depth
  }

  // (6) audience pin — the resource server confirms this delegation was minted FOR it.
  if (opts.expectedAudience !== undefined) {
    if (parentEffective.audience !== opts.expectedAudience) {
      return deny(DELEGATION_DENY.WRONG_AUDIENCE, `audience mismatch — chain grants ${parentEffective.audience ?? 'any'}, resource expects ${opts.expectedAudience}`)
    }
    pass(`audience matches ${opts.expectedAudience}`)
  }

  return {
    ok: true,
    code: DELEGATION_DENY.VALID,
    reason: `valid ${certs.length}-hop delegation; leaf ${short(leafHolder)} may act within the narrowed caveats`,
    effectiveCaveats: publicCaveats(parentEffective),
    depth: leafDepth,
    checks,
  }
}

/**
 * The leaf's REAL authority = min(earned Warrant level ceiling, the intersected caveats).
 * A delegation can only narrow SCOPE; it never raises the license ceiling, so the governing
 * level is the root Warrant's earned level (verify that Warrant separately). Returns the
 * effective caveats plus the governing level, or the chain's deny code if the chain is invalid.
 *
 * @param warrantLevel  the root's earned license level ('L0'..'L4'); falls back to a head Warrant's.
 * @param chain         the same chain shape verifyDelegationChain accepts.
 * @param opts          passed through to verifyDelegationChain.
 */
export function effectiveCeiling({ warrantLevel, chain, opts = {} }) {
  const verdict = verifyDelegationChain(chain, opts)
  if (!verdict.ok) {
    return { ok: false, code: verdict.code, reason: verdict.reason, governingLevel: null, levelRank: null, effectiveCaveats: null, depth: null }
  }
  const headWarrant = Array.isArray(chain) && isWarrantLike(chain[0]) ? chain[0] : opts.rootWarrant
  const governingLevel = warrantLevel ?? headWarrant?.license_level ?? null
  return {
    ok: true,
    code: DELEGATION_DENY.VALID,
    reason: `leaf authority = min(level ${governingLevel ?? 'n/a'}, narrowed caveats)`,
    governingLevel,
    levelRank: governingLevel == null ? null : levelRank(governingLevel),
    effectiveCaveats: verdict.effectiveCaveats,
    depth: verdict.depth,
  }
}
