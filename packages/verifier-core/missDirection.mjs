// missDirection — which way a policy's decision misses the deterministic oracle's.
// =============================================================================
// One shared helper, so every page that reports a miss (/security, /reference-check,
// /verify) names its direction the same way. Strictness is ordered
// allow < escalate < deny: "stricter" when the policy's decision is further along
// that order than the oracle's (Origin's answer key), "looser" when it is less far
// along, null when the two agree. Pure: no I/O, no clock.
// =============================================================================

const STRICTNESS = ['allow', 'escalate', 'deny']

export function missDirection(decision, expected) {
  const d = STRICTNESS.indexOf(decision)
  const e = STRICTNESS.indexOf(expected)
  if (d < 0 || e < 0) {
    throw new TypeError(`missDirection: unknown decision "${d < 0 ? decision : expected}"`)
  }
  if (d === e) return null
  return d > e ? 'stricter' : 'looser'
}
