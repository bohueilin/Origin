// Countersign — the OFFLINE BUNDLE VERIFIER (the depth-proof artifact).
// =============================================================================
// One command over an EXPORTED bundle re-derives every earned authority claim it
// contains, and exits nonzero if anything was tampered or inflated. No network, no
// database, no trust in the exporter — the bundle carries its own evidence and the
// only external input is the pinned issuer key it declares. This is the artifact a
// skeptical third party runs to answer: "did this agent actually earn what it claims?"
//
// What it composes (it OWNS no crypto or policy of its own — that is the point):
//   • countersign-identity.agentThumbprint — pins the declared issuer to its public key,
//     so a bundle cannot lie about who signed it (the thumbprint must re-derive).
//   • warrant.verifyWarrant — for each Warrant: recomputes the self-digest (integrity),
//     checks the issuer signature (authenticity), re-folds the backing hash-chain
//     (completeness — cherry-picking breaks it), and RE-RUNS the license policy on the
//     raw evidence (authority — inflation cannot survive re-derivation).
//   • (optional, forward-looking) a delegation module, loaded lazily if present.
//
// EXIT-CODE CONTRACT (the demoable property). verifyBundle maps every warrant/delegation
// verdict code to one of three PROCESS classes, then the bundle takes the WORST class:
//
//   verdict code (from verifyWarrant)                         process exit class
//   ------------------------------------------------------    ------------------
//   0  valid                                                  0  OK
//   1  tampered (self-digest)  ┐                              2  INTEGRITY
//   4  incomplete / forged chain │ "can I trust the bytes?"   2  INTEGRITY
//   7  malformed  ┘  (+ a bundle that lies about its issuer)  2  INTEGRITY
//   2  bad issuer signature   ┐                               3  AUTHORITY
//   3  level inflation        │ "is this authority real?"     3  AUTHORITY
//   5  wrong issuer / drift    │                              3  AUTHORITY
//   6  stale (epoch/freshness) ┘                              3  AUTHORITY
//
// PRECEDENCE when a bundle mixes failures (documented, deterministic):
//   OK (0)  <  AUTHORITY (3)  <  INTEGRITY (2)   — most-severe wins.
// An INTEGRITY failure DOMINATES an AUTHORITY failure: if you cannot even trust the
// bytes of one credential, the bundle is rejected as tampered (exit 2) regardless of
// any merely-unauthorized credential. AUTHORITY dominates OK. So the bundle exit code
// is 0 only if EVERY part verifies; else 2 if ANY part failed integrity; else 3.
//
// The four shipped example bundles pin this contract down:
//   valid → 0 · tampered → 2 (code 1) · inflated → 3 (code 3) · cherry-picked → 2 (code 4).
//
// SYNC by design. The core (warrant path) is fully synchronous — same discipline as the
// rest of the Origin engine. The optional delegation module is ESM with a top-level-await
// graph and therefore cannot be require()'d; the async convenience wrapper
// verifyBundleWithDelegations lazily import()s it and injects it. Bundles without
// delegations (the common case, and all four shipped examples) need only verifyBundle.
// =============================================================================

import { agentThumbprint } from './countersign-identity.mjs'
import { verifyWarrant } from './warrant.mjs'

export const BUNDLE_SCHEMA_VERSION = '1.0.0'

/** Process exit classes. Integrity failures (tamper/incomplete/malformed) exit 2;
 *  authority failures (bad sig / inflation / wrong issuer / stale) exit 3. */
export const EXIT = Object.freeze({
  OK: 0,
  INTEGRITY: 2,
  AUTHORITY: 3,
})

/** Map a single WARRANT/issuer verdict code (0..7, from verifyWarrant) to its process exit
 *  class. Unknown codes fail closed as INTEGRITY (most severe). */
export function exitForCode(code) {
  if (code === 0) return EXIT.OK
  if (code === 1 || code === 4 || code === 7) return EXIT.INTEGRITY
  if (code === 2 || code === 3 || code === 5 || code === 6) return EXIT.AUTHORITY
  return EXIT.INTEGRITY
}

/** Map a DELEGATION verdict code (DELEGATION_DENY, from verifyDelegationChain) to its process
 *  exit class. NOTE the split differs from warrants: for delegations 5 (broken link) is an
 *  integrity failure while 4 (depth exceeded) is an authority failure — the opposite of the
 *  warrant code space — so delegation results are mapped through this table, not exitForCode.
 *    integrity {1 tampered, 5 broken link, 7 malformed} · authority {2 bad sig, 3 scope
 *    escalation, 4 depth exceeded, 6 wrong audience}. Unknown → INTEGRITY. */
export function exitForDelegationCode(code) {
  if (code === 0) return EXIT.OK
  if (code === 1 || code === 5 || code === 7) return EXIT.INTEGRITY
  if (code === 2 || code === 3 || code === 4 || code === 6) return EXIT.AUTHORITY
  return EXIT.INTEGRITY
}

// Severity rank so the bundle can take the WORST (lowest-trust) class of its parts.
// INTEGRITY(2) is the most severe, then AUTHORITY(3), then OK(0). See PRECEDENCE above.
function severity(exitCode) {
  if (exitCode === EXIT.INTEGRITY) return 2
  if (exitCode === EXIT.AUTHORITY) return 1
  return 0
}
function worst(a, b) {
  return severity(a) >= severity(b) ? a : b
}

function short(s, n = 12) {
  return typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : String(s)
}

function subjectOfCert(cert) {
  if (!cert || typeof cert !== 'object') return null
  return cert.subject_thumbprint ?? cert.agent_thumbprint ?? cert.child_thumbprint ?? cert.subject ?? cert.thumbprint ?? null
}

// A delegation entry is a CHAIN: [rootWarrant?, cert, cert, ...]. The subject is the leaf
// holder (the last cert's child_thumbprint), else the chain's root anchor.
function subjectOfChain(chain) {
  if (!Array.isArray(chain)) return subjectOfCert(chain)
  for (let i = chain.length - 1; i >= 0; i--) {
    const c = chain[i]
    if (c && typeof c === 'object' && typeof c.child_thumbprint === 'string') return c.child_thumbprint
  }
  return subjectOfCert(chain[0])
}

function mkResult(kind, subject, ok, code, reason, checks, extra = {}) {
  return { kind, subject, ok, code, reason, checks: checks ?? [], ...extra }
}

/**
 * Verify an exported Countersign bundle, fully offline. Synchronous.
 *
 * Bundle shape:
 *   {
 *     bundle_schema_version: '1.0.0',
 *     issuer:   { public_jwk, thumbprint },
 *     warrants: [ warrant, ... ],
 *     delegations?: [ chain, ... ],     // optional; each chain = [rootWarrant?, cert, ...]
 *     pinned?:  { capability_manifest_digest?, min_epoch?, now?, audience?, max_delegation_depth? }
 *   }
 *
 * @param opts.capabilityManifestDigest  override / provide the pinned manifest digest.
 * @param opts.minEpoch / opts.now       override / provide revocation-epoch & freshness pins.
 * @param opts.delegationVerifier        (fn) verifyDelegationChain(chain, opts) -> { ok, code,
 *                                       reason, checks }. Injected by the async wrapper when
 *                                       bundle.delegations is present (from @origin/verifier-core/delegation).
 * @returns { ok, exitCode, results, summary }
 */
export function verifyBundle(bundle, opts = {}) {
  const results = []

  // 0 — envelope must be a JSON object.
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    results.push(mkResult('bundle', null, false, 7, 'bundle is not a JSON object', [['FAIL', 'bundle is not a JSON object']]))
    return finalize(bundle, results)
  }

  // 1 — PIN THE ISSUER: the declared thumbprint MUST re-derive from the declared public key.
  //     A bundle cannot lie about who signed it — this is checked before any warrant is trusted.
  const issuer = bundle.issuer
  if (!issuer || typeof issuer !== 'object' || !issuer.public_jwk || typeof issuer.thumbprint !== 'string') {
    results.push(mkResult('issuer', null, false, 7, 'bundle.issuer must carry { public_jwk, thumbprint }', [['FAIL', 'bundle.issuer missing public_jwk or thumbprint']]))
    return finalize(bundle, results)
  }
  let derivedThumb
  try {
    derivedThumb = agentThumbprint(issuer.public_jwk)
  } catch (e) {
    results.push(mkResult('issuer', issuer.thumbprint, false, 7, `issuer.public_jwk is not a valid Ed25519 JWK — ${e.message}`, [['FAIL', 'issuer.public_jwk is not a valid Ed25519 JWK']]))
    return finalize(bundle, results)
  }
  if (derivedThumb !== issuer.thumbprint) {
    const reason = `bundle lies about its issuer — thumbprint(public_jwk)=${short(derivedThumb)} != declared ${short(issuer.thumbprint)}`
    results.push(mkResult('issuer', issuer.thumbprint, false, 7, reason, [['FAIL', reason]]))
    return finalize(bundle, results) // integrity failure — refuse the whole bundle (exit 2)
  }
  results.push(mkResult('issuer', issuer.thumbprint, true, 0, `issuer key owns its declared thumbprint (${short(issuer.thumbprint)})`, [['PASS', `issuer key owns its declared thumbprint (${short(issuer.thumbprint)})`]]))

  // 2 — resolve pins: opts override bundle.pinned.
  const pinned = bundle.pinned && typeof bundle.pinned === 'object' ? bundle.pinned : {}
  const capabilityManifestDigest = opts.capabilityManifestDigest ?? pinned.capability_manifest_digest
  const minEpoch = opts.minEpoch ?? pinned.min_epoch
  const now = opts.now ?? pinned.now

  // 3 — every warrant must verify against the PINNED issuer key + thumbprint.
  const warrants = Array.isArray(bundle.warrants) ? bundle.warrants : []
  if (warrants.length === 0 && !(Array.isArray(bundle.delegations) && bundle.delegations.length)) {
    results.push(mkResult('bundle', issuer.thumbprint, false, 7, 'bundle carries no warrants (and no delegations) to verify', [['FAIL', 'bundle has nothing to verify']]))
    return finalize(bundle, results)
  }
  for (const w of warrants) {
    const v = verifyWarrant(w, {
      issuerPublicJwk: issuer.public_jwk,
      expectedIssuerThumbprint: issuer.thumbprint,
      capabilityManifestDigest,
      now,
      minEpoch,
    })
    results.push(mkResult('warrant', w?.agent_thumbprint ?? null, v.ok, v.code, v.reason, v.checks, { level: v.level ?? null }))
  }

  // 4 — optional delegation chains. Each entry is a chain [rootWarrant?, cert, ...] verified by
  //     the delegation module (its own DELEGATION_DENY code space; see exitForDelegationCode).
  //     Fail closed if a chain is present but no verifier is available.
  if (Array.isArray(bundle.delegations) && bundle.delegations.length) {
    const verify = opts.delegationVerifier
    const delOpts = {}
    if (pinned.audience !== undefined) delOpts.expectedAudience = pinned.audience
    if (pinned.max_delegation_depth !== undefined) delOpts.maxDepth = pinned.max_delegation_depth
    for (const chain of bundle.delegations) {
      if (typeof verify !== 'function') {
        const reason = 'delegation present but no delegation verifier is available — refusing to trust an unverifiable delegation'
        results.push(mkResult('delegation', subjectOfChain(chain), false, 7, reason, [['FAIL', reason]]))
        continue
      }
      let v
      try {
        v = verify(chain, delOpts)
      } catch (e) {
        v = { ok: false, code: 7, reason: `delegation verifier threw — ${e.message}`, checks: [['FAIL', `delegation verifier threw — ${e.message}`]] }
      }
      results.push(mkResult('delegation', subjectOfChain(chain), v.ok, v.code, v.reason, v.checks))
    }
  }

  return finalize(bundle, results)
}

function finalize(bundle, results) {
  let exitCode = EXIT.OK
  for (const r of results) {
    const cls = r.kind === 'delegation' ? exitForDelegationCode(r.code) : exitForCode(r.code)
    exitCode = worst(exitCode, cls)
  }

  const total = results.length
  const passed = results.filter((r) => r.ok).length
  const failed = total - passed
  const warrants = results.filter((r) => r.kind === 'warrant').length
  const delegations = results.filter((r) => r.kind === 'delegation').length
  const firstFail = results.find((r) => !r.ok)

  const verdict = exitCode === EXIT.OK ? 'VALID' : 'REJECTED'
  const headline =
    exitCode === EXIT.OK
      ? `VALID — all ${total} claim(s) re-derived from the evidence`
      : exitCode === EXIT.INTEGRITY
        ? `REJECTED (integrity, exit 2) — ${firstFail ? firstFail.reason : 'a credential was tampered or is incomplete'}`
        : `REJECTED (authority, exit 3) — ${firstFail ? firstFail.reason : 'a credential is not legitimately authorized'}`

  return {
    ok: exitCode === EXIT.OK,
    exitCode,
    results,
    summary: {
      bundle_schema_version: (bundle && typeof bundle === 'object' && bundle.bundle_schema_version) || null,
      issuer_thumbprint: (bundle && typeof bundle === 'object' && bundle.issuer && bundle.issuer.thumbprint) || null,
      total,
      passed,
      failed,
      warrants,
      delegations,
      exitCode,
      verdict,
      headline,
    },
  }
}

/**
 * Async convenience wrapper: if the bundle carries delegations and no verifier was injected,
 * lazily import() the optional delegation module and inject it, then run the sync verifier.
 * Absent delegation module is not an error for bundles that carry no delegations.
 */
export async function verifyBundleWithDelegations(bundle, opts = {}) {
  let delegationVerifier = opts.delegationVerifier
  if (!delegationVerifier && bundle && Array.isArray(bundle.delegations) && bundle.delegations.length) {
    delegationVerifier = await loadDelegationVerifier()
  }
  return verifyBundle(bundle, { ...opts, delegationVerifier })
}

async function loadDelegationVerifier() {
  // ESM-with-top-level-await → import() only (never require()). Try the co-located source
  // first (monorepo worktree), then the package export (once installed). Guarded: a missing
  // module returns null so the caller fails the specific delegation closed, not the process.
  const candidates = ['./delegation.mjs', '@origin/verifier-core/delegation']
  for (const spec of candidates) {
    try {
      const mod = await import(spec)
      const fn = mod.verifyDelegationChain || mod.verifyDelegation || mod.default
      if (typeof fn === 'function') return fn
    } catch {
      /* not present / not resolvable — try the next candidate */
    }
  }
  return null
}

/**
 * Render a verifyBundle result as a multi-line human report. Every underlying check is
 * printed as a `PASS`/`FAIL` line, grouped per credential, with an overall verdict footer.
 */
export function formatReport(result) {
  const lines = []
  const sep = '─'.repeat(72)
  lines.push(sep)
  lines.push('Countersign — offline bundle verification')
  const s = result.summary || {}
  if (s.issuer_thumbprint) lines.push(`issuer:  ${s.issuer_thumbprint}`)
  lines.push(`claims:  ${s.total ?? result.results.length} total · ${s.passed ?? 0} pass · ${s.failed ?? 0} fail  (warrants: ${s.warrants ?? 0}, delegations: ${s.delegations ?? 0})`)
  lines.push(sep)

  for (const r of result.results) {
    const tag = r.ok ? 'PASS' : 'FAIL'
    const kind = String(r.kind || 'item').toUpperCase()
    const subj = r.subject ? ` ${short(r.subject, 16)}` : ''
    const lvl = r.level ? ` [${r.level}]` : ''
    lines.push(`${tag}  [${kind}]${subj}${lvl}  — code ${r.code}: ${r.reason}`)
    for (const [ctag, msg] of r.checks || []) {
      lines.push(`        ${ctag}  ${msg}`)
    }
  }

  lines.push(sep)
  const verdict = result.ok ? 'PASS' : 'FAIL'
  lines.push(`${verdict}  ${result.summary ? result.summary.headline : (result.ok ? 'VALID' : 'REJECTED')}`)
  lines.push(`exit ${result.exitCode}`)
  lines.push(sep)
  return lines.join('\n')
}
