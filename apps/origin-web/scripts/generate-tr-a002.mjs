// Origin trace emitter — TR-A002 (machine-emitted sandbox trace)
// =============================================================================
// WHAT THIS IS (and honestly is not)
//   This script deterministically emits a tamper-evident agent-evidence trace
//   for one SIMULATED, SANDBOXED agent workflow: the payments-ops-agent handling
//   a refund exception under policy refund-cap-v0.3. Every event is committed to
//   a real SHA-256 hash chain (each event hashes its own canonical JSON together
//   with the previous event's hash), and the final event seals the chain into a
//   single digest. Change any byte of any event and the final digest changes —
//   that is the whole point, and `npm run proof:verify` re-derives the chain to
//   prove it.
//
//   It is NOT a customer deployment, NOT production SaaS, NOT a performance
//   claim, and NO live money moves — the payments.refund side effect is executed
//   in a sandbox only. The scenario inputs (order, amounts, approver) are
//   simulated. The artifact's own `label` says exactly this.
//
//   Emitted by code -> "machine-emitted". Deterministic (fixed pseudo-timestamps,
//   stable field order) -> the published digest is reproducible and verifiable.
//
// Usage:
//   node scripts/generate-tr-a002.mjs         # writes public/proof/tr-a002*.json
//   node scripts/generate-tr-a002.mjs --check # emit in-memory, print digest only
// =============================================================================

import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(HERE, '../public/proof')
const GENESIS = '0'.repeat(64) // null hash — the chain's genesis anchor

// ── canonical JSON: keys sorted lexicographically at every level, no whitespace,
//    UTF-8, separators ',' and ':'. Deterministic regardless of insertion order.
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  }
  return JSON.stringify(value) // strings / numbers / booleans / null
}
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

// ── the SIMULATED scenario. Deterministic pseudo-timestamps: a fixed base plus a
//    per-event second offset, so regeneration is byte-identical and the digest is
//    stable. These are illustrative wall-clock-shaped values, not a live capture.
const POLICY = {
  id: 'refund-cap-v0.3',
  rules: [
    'auto-allow refunds <= $250.00',
    'require human approval for refunds > $250.00 and <= $500.00',
    'deny / block refunds above the approved scope',
  ],
}
const BASE_TS = Date.parse('2026-07-04T17:00:00.000Z')
const at = (offsetSeconds) => new Date(BASE_TS + offsetSeconds * 1000).toISOString()

// Each entry is the event *payload* (everything except prev_hash / event_hash,
// which the chain adds). Order and content are load-bearing for the digest.
const STEPS = [
  {
    action: 'proposal.created',
    actor: 'payments-ops-agent',
    tool: 'payments.refund',
    policy_id: null,
    verdict: null,
    approver: null,
    side_effect: { tool: 'payments.refund', amount_usd: 480.0, target: 'order_8842', executed: false },
    detail: 'Agent proposed a refund of $480.00 for order_8842 on the dispute-exception path.',
  },
  {
    action: 'policy.evaluated',
    actor: 'origin-policy-gate',
    tool: 'payments.refund',
    policy_id: POLICY.id,
    verdict: null,
    approver: null,
    side_effect: null,
    detail:
      'Evaluated the proposal against refund-cap-v0.3: $480.00 is above the $250.00 auto-allow cap and within the $500.00 approval ceiling.',
  },
  {
    action: 'verdict.require_approval',
    actor: 'origin-policy-gate',
    tool: 'payments.refund',
    policy_id: POLICY.id,
    verdict: 'require_approval',
    approver: 'payments-on-call',
    side_effect: null,
    detail:
      'Verdict: require human approval — amount falls in the $250.00–$500.00 approval band. Risk owner: payments-on-call.',
  },
  {
    action: 'proxy.held',
    actor: 'origin-proxy',
    tool: 'payments.refund',
    policy_id: POLICY.id,
    verdict: 'require_approval',
    approver: 'payments-on-call',
    side_effect: { tool: 'payments.refund', amount_usd: 480.0, target: 'order_8842', executed: false, held: true },
    detail: 'Side effect held at the tool-call proxy — payments.refund was not dispatched while approval is pending.',
  },
  {
    action: 'approval.requested',
    actor: 'origin-proxy',
    tool: null,
    policy_id: POLICY.id,
    verdict: null,
    approver: 'payments-on-call',
    side_effect: null,
    detail: 'Approval requested from payments-on-call with the proposal, the policy verdict, and the exact side-effect scope.',
  },
  {
    action: 'approval.granted',
    actor: 'payments-on-call',
    tool: null,
    policy_id: POLICY.id,
    verdict: 'approved',
    approver: 'payments-on-call',
    side_effect: null,
    detail: 'Human approver payments-on-call granted the refund of $480.00 on order_8842.',
  },
  {
    action: 'proxy.executed_sandbox',
    actor: 'origin-proxy',
    tool: 'payments.refund',
    policy_id: POLICY.id,
    verdict: 'approved',
    approver: 'payments-on-call',
    side_effect: {
      tool: 'payments.refund',
      amount_usd: 480.0,
      target: 'order_8842',
      executed: true,
      sandbox: true,
      live_money: false,
    },
    detail: 'Executed in the sandbox — a simulated payments.refund of $480.00 on order_8842. No live money moved.',
  },
  {
    action: 'action.recorded',
    actor: 'origin-recorder',
    tool: null,
    policy_id: POLICY.id,
    verdict: 'approved',
    approver: 'payments-on-call',
    side_effect: null,
    detail: 'Recorded the executed action to the audit chain with its approver, policy verdict, and side-effect scope.',
  },
  {
    action: 'retry.proposed_over_scope',
    actor: 'payments-ops-agent',
    tool: 'payments.refund',
    policy_id: null,
    verdict: null,
    approver: null,
    side_effect: { tool: 'payments.refund', amount_usd: 920.0, target: 'order_8842', executed: false },
    detail: 'Agent proposed a second refund of $920.00 on order_8842 — above the $500.00 approval ceiling.',
  },
  {
    action: 'verdict.deny_or_block',
    actor: 'origin-policy-gate',
    tool: 'payments.refund',
    policy_id: POLICY.id,
    verdict: 'deny',
    approver: null,
    side_effect: null,
    detail: 'Verdict: deny — $920.00 exceeds the $500.00 approval ceiling. Over the approved scope.',
  },
  {
    action: 'proxy.blocked',
    actor: 'origin-proxy',
    tool: 'payments.refund',
    policy_id: POLICY.id,
    verdict: 'deny',
    approver: null,
    side_effect: { tool: 'payments.refund', amount_usd: 920.0, target: 'order_8842', executed: false, blocked: true },
    detail: 'Side effect BLOCKED at the proxy — the over-scope refund was never dispatched. The block itself is recorded.',
  },
  // event 12 seals: it additionally commits the running chain root of events 1–11.
  {
    action: 'evidence.digest_sealed',
    actor: 'origin-recorder',
    tool: null,
    policy_id: POLICY.id,
    verdict: null,
    approver: null,
    side_effect: null,
    detail: 'Evidence package sealed — the hash chain over the preceding 11 events is committed to the final digest.',
    seal: true,
  },
]

// ── build the hash chain: prev_hash links each event to the last; the sealing
//    event also records chain_root (the hash of event 11) explicitly.
let prev = GENESIS
const events = STEPS.map((step, i) => {
  const seq = i + 1
  const payload = {
    seq,
    event_id: `evt_${String(seq).padStart(3, '0')}`,
    ts: at(i * 3), // deterministic pseudo-timestamps, +3s per step
    actor: step.actor,
    action: step.action,
    tool: step.tool,
    policy_id: step.policy_id,
    verdict: step.verdict,
    approver: step.approver,
    side_effect: step.side_effect,
    sandbox: true,
    detail: step.detail,
  }
  if (step.seal) payload.chain_root = prev
  const event_hash = sha256(canonical({ ...payload, prev_hash: prev }))
  const out = { ...payload, prev_hash: prev, event_hash }
  prev = event_hash
  return out
})

const finalDigest = events[events.length - 1].event_hash
const logDigest = sha256(canonical(events.map((e) => e.event_hash)))

const trace = {
  artifact: 'TR-A002',
  type: 'machine_emitted_sandbox_trace',
  emitted_by: 'scripts/generate-tr-a002.mjs (Origin trace emitter)',
  label:
    'Machine-emitted by the Origin trace emitter over one SIMULATED, SANDBOXED agent workflow. Every event is committed to a real SHA-256 hash chain; the final event seals the chain. Not a customer deployment, not production SaaS, not a performance claim. The payments.refund side effect executes in a sandbox only — no live money moves. Scenario inputs are simulated. Timestamps are deterministic pseudo-timestamps.',
  scenario: 'refund exception handling',
  agent: 'payments-ops-agent',
  policy: POLICY,
  risk_owner: 'payments-on-call',
  proxy_tool: 'payments.refund',
  sandbox: true,
  hash_spec: {
    algorithm: 'sha256',
    canonicalization:
      "event_hash = SHA-256 hex of the canonical JSON of the event (all fields except event_hash, including prev_hash). Canonical JSON: object keys sorted lexicographically at every level, UTF-8, JSON separators ',' and ':', no whitespace.",
    genesis_prev_hash: GENESIS,
    final_digest_is:
      'the event_hash of the sealing event (evidence.digest_sealed), which commits the chain root of events 1–11.',
    verify: 'npm run proof:verify',
  },
  event_count: events.length,
  final_digest: finalDigest,
  log_digest: logDigest,
  events,
}

const summary = {
  artifact: 'TR-A002',
  type: 'machine_emitted_sandbox_trace',
  label: trace.label,
  agent: trace.agent,
  policy_id: POLICY.id,
  scenario: trace.scenario,
  flow: [
    'proposal.created ($480 refund on order_8842)',
    'policy.evaluated (refund-cap-v0.3)',
    'verdict.require_approval',
    'proxy.held',
    'approval.requested -> approval.granted (payments-on-call)',
    'proxy.executed_sandbox (no live money)',
    'action.recorded',
    'retry.proposed_over_scope ($920)',
    'verdict.deny_or_block -> proxy.blocked',
    'evidence.digest_sealed',
  ],
  event_count: events.length,
  final_digest: finalDigest,
  log_digest: logDigest,
  algorithm: 'sha256',
  verify_command: 'npm run proof:verify',
  shows: [
    'The Origin trace emitter producing a real, tamper-evident hash-chained record of an agent workflow: proposal, policy verdict, proxy hold, human approval, sandbox execution, a blocked over-scope retry, and a sealed digest.',
  ],
  does_not_show: [
    'A customer deployment, production SaaS, revenue, reviewer acceptance, compliance certification, or a performance / latency claim.',
    'Live money movement — the payments.refund side effect executes in a sandbox only.',
  ],
}

if (process.argv.includes('--check')) {
  console.log('TR-A002 (in-memory) final_digest:', finalDigest)
  console.log('TR-A002 (in-memory) log_digest  :', logDigest)
} else {
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(resolve(OUT_DIR, 'tr-a002.json'), JSON.stringify(trace, null, 2) + '\n')
  writeFileSync(resolve(OUT_DIR, 'tr-a002-summary.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log('wrote public/proof/tr-a002.json + tr-a002-summary.json')
  console.log(`events        : ${events.length}`)
  console.log(`final_digest  : ${finalDigest}`)
  console.log(`log_digest    : ${logDigest}`)
}

export { events, finalDigest, logDigest, canonical, sha256, GENESIS }
