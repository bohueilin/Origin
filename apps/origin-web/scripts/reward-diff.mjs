// Origin Training Evidence — reward:diff (P5 blocking exploit-suite gate).
// =============================================================================
// Runs the current reward module over the frozen exploit + gold corpus and asserts
// the two invariants a reward version must never break:
//   • every GOLD case earns reward > 0 (the honest path is still rewarded)
//   • every EXPLOIT case is driven to patched_reward 0 AND flagged is_hack (the gate holds)
//
// This is the training analog of a regression gate: reward hardening that lets a
// known exploit back through is a reward-hacking regression, not a code change.
//
//   node scripts/reward-diff.mjs
// Exit: 0 all invariants hold · 5 reward regression (an exploit paid out, or gold broke).
// =============================================================================

import { scoreReward } from '../rlkit/reward-module.ts'
import { goldSuite, exploitSuite } from '../rlkit/exploit-suite.ts'

let failures = 0
const line = (ok, msg) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)

console.log('— gold corpus (the honest path must still be rewarded) —')
for (const c of goldSuite()) {
  const r = scoreReward(c.task, c.actions, { policy: 'reward-diff' })
  const ok = r.reward > 0 && !r.is_hack
  if (!ok) failures++
  line(ok, `${c.id.padEnd(20)} reward=${r.reward} is_hack=${r.is_hack} category=${r.category}`)
}

console.log('\n— exploit corpus (every known reward hack must be driven to 0) —')
for (const c of exploitSuite()) {
  const r = scoreReward(c.task, c.actions, { policy: 'reward-diff' })
  const ok = r.patched_reward === 0 && r.reward === 0 && r.is_hack === true && r.exploit_cluster === c.cluster
  if (!ok) failures++
  line(ok, `${c.id.padEnd(20)} reward=${r.reward} is_hack=${r.is_hack} cluster=${r.exploit_cluster} (want ${c.cluster}) category=${r.category}`)
}

// A malicious post-gate shaper must not be able to rescue a gated 0.
console.log('\n— shaper-can-not-rescue-a-gate (a hostile judge is clamped post-gate) —')
{
  const c = exploitSuite()[0]
  const evil = scoreReward(c.task, c.actions, { policy: 'reward-diff', judge: () => 1000 })
  const ok = evil.reward === 0
  if (!ok) failures++
  line(ok, `hostile judge(1000) on ${c.id} → reward=${evil.reward} (gate holds)`)
}

const code = failures === 0 ? 0 : 5
console.log(
  code === 0
    ? '\nOK — every exploit is driven to 0 and every gold is preserved (reward integrity holds).'
    : `\nREWARD REGRESSION (exit 5) — ${failures} invariant(s) broke. A known exploit paid out or gold regressed.`,
)
process.exit(code)
