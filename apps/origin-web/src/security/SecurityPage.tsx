// /security — the security cores, live in the browser.
// =============================================================================
// Five panels, each driving the REAL @origin/verifier-core engine client-side (no server, no
// mocks of the engines themselves — the data is synthetic and labeled as such):
//
//   1. Origin Attestation — sign → verify → tamper → VOID → wrong-signer → rejected
//   2. Merkle batch     — one signed root, O(log N) inclusion proofs, beneficiary-bound
//   3. Policy chain     — hash-chained versions; decisions bind to the version in force
//   4. Reference check  — the IAM gym + Crucible: config-bound credential from the
//                         deterministic oracle; drift → VOID; over-grants cap the readiness level
//   5. Over-grant       — the analyzer pointed at an authorization LOG rather than a policy:
//                         five metrics over a synthetic fleet, and the delegation coupling —
//                         widen one edge deep in the tree, watch the root's blast radius grow
//
// Unblocked by the isomorphic sha256 in @origin/evidence (§9.2): these
// modules now load in a browser bundle because the evidence core no longer
// hard-imports node:crypto.
//
// Honesty rails: every verdict is "reproducible under this verifier" — never
// "safe" or "correct". All payloads below are SYNTHETIC demo artifacts.
// =============================================================================
import { useState } from 'react'
import type { ReactNode } from 'react'
import { generateSigningKey, signSigil, verifySigil } from '@origin/verifier-core/sigil'
import type { Sigil } from '@origin/verifier-core/sigil'
import { batchReceipts, verifyReceiptInBatch } from '@origin/verifier-core/merkleBatch'
import type { ReceiptBatch } from '@origin/verifier-core/merkleBatch'
import {
  createPolicy,
  amendPolicy,
  verifyPolicyChain,
  bindDecision,
  verifyDecisionUnderPolicy,
} from '@origin/verifier-core/proofCarryingPolicy'
import type { PolicyVersion } from '@origin/verifier-core/proofCarryingPolicy'
import {
  issueIamReferenceCheck,
  oraclePolicy,
  allowAllPolicy,
  iamEnvDigest,
  iamTasks,
  IAM_VERSIONS,
} from '@origin/verifier-core/iamGym'
import type { IamReferenceCheck } from '@origin/verifier-core/iamGym'
import { verifyCredential } from '@origin/verifier-core/crucible'
import {
  generateCorpus,
  analyzeOverGrant,
  scoreAgainstGroundTruth,
  effectiveScopes,
  blastRadius,
  resources as overGrantResources,
  isSensitive,
} from '@origin/verifier-core/overGrant'
import type { OverGrantCorpus } from '@origin/verifier-core/overGrant'
import { computeLicenseFromVerdicts } from '../license'
import type { LicenseVerdict } from '../license'

// ── tiny UI vocabulary ───────────────────────────────────────────────────────
type Tone = 'ok' | 'bad' | 'info'
interface Step {
  tone: Tone
  label: string
  text: string
}
const ok = (label: string, text: string): Step => ({ tone: 'ok', label, text })
const bad = (label: string, text: string): Step => ({ tone: 'bad', label, text })
const info = (label: string, text: string): Step => ({ tone: 'info', label, text })
const short = (d: unknown) => String(d).slice(0, 12) + '…'

function Pill({ tone }: { tone: Tone }) {
  const txt = tone === 'ok' ? 'pass' : tone === 'bad' ? 'blocked' : 'note'
  return <span className={`sec-pill sec-pill--${tone}`}>{txt}</span>
}

function Log({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null
  return (
    <ul className="sec-log" aria-live="polite">
      {steps.map((s, i) => (
        <li key={i}>
          <Pill tone={s.tone} />
          <span>
            <b>{s.label}</b> — {s.text}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Peek({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null
  return (
    <details className="sec-peek">
      <summary>{title}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  )
}

function DemoCard(props: { kicker: string; title: string; lede: string; children: ReactNode }) {
  return (
    <article className="card">
      <p className="kicker">{props.kicker}</p>
      <h2 style={{ marginTop: 6 }}>{props.title}</h2>
      <p className="section__lede" style={{ marginTop: 8 }}>
        {props.lede}
      </p>
      {props.children}
    </article>
  )
}

// ── 1 · Origin Attestation ────────────────────────────────────────────────────────────────
// A SYNTHETIC score receipt — the payload we sign. Labeled synthetic on purpose.
const DEMO_RECEIPT = {
  receipt_schema_version: '1.0.0',
  kind: 'demo.score_receipt',
  note: 'SYNTHETIC demo receipt — not customer data',
  episode_id: 'ep_demo_001',
  reward: 1,
  passed: true,
  license_level: 'L2',
  verifier_version: 'demo-verifier-1.0.0',
}

function SigilPanel() {
  const [steps, setSteps] = useState<Step[]>([])
  const [sigil, setSigil] = useState<Sigil | null>(null)
  const [busy, setBusy] = useState(false)

  const signAndVerify = async () => {
    setBusy(true)
    try {
      const key = await generateSigningKey()
      const s = await signSigil(DEMO_RECEIPT, key, { issuer: 'origin-demo', kind: 'score-receipt' })
      const v = await verifySigil(s)
      setSigil(s)
      setSteps([
        info('signed', `ES256 over the content-address ${short(s.payload_digest)} — the public key travels inside the attestation`),
        v.ok
          ? ok('verified offline', `${v.reason} (code ${v.code}) — no server, no registry, just the attestation`)
          : bad('verify', v.reason),
      ])
    } finally {
      setBusy(false)
    }
  }

  const tamper = async () => {
    if (!sigil) return
    const forged = structuredClone(sigil)
    forged.payload = { ...DEMO_RECEIPT, reward: 999 }
    const v1 = await verifySigil(forged)
    const flipped = structuredClone(sigil)
    flipped.signature =
      (flipped.signature[0] === 'A' ? 'B' : 'A') + flipped.signature.slice(1)
    const v2 = await verifySigil(flipped)
    setSteps((prev) => [
      ...prev,
      info('tamper attempt', 'flipped payload.reward 1 → 999 without re-signing'),
      v1.ok ? bad('MISSED', 'tamper was not detected') : ok('tamper voided', `${v1.reason} (code ${v1.code})`),
      info('tamper attempt', 'corrupted one byte of the signature'),
      v2.ok ? bad('MISSED', 'corruption was not detected') : ok('corruption voided', `${v2.reason} (code ${v2.code})`),
    ])
  }

  const wrongSigner = async () => {
    if (!sigil) return
    const otherKey = await generateSigningKey()
    const imposter = await signSigil(DEMO_RECEIPT, otherKey, { issuer: 'origin-demo', kind: 'score-receipt' })
    const v = await verifySigil(imposter, { expectedThumbprint: sigil.thumbprint })
    setSteps((prev) => [
      ...prev,
      info('imposter', 'a DIFFERENT key signed the same payload — signature itself is valid'),
      v.ok
        ? bad('MISSED', 'wrong signer was accepted')
        : ok('signer pinned', `${v.reason} (code ${v.code}) — a valid-but-wrong-signer attestation is rejected`),
    ])
  }

  return (
    <DemoCard
      kicker="Origin Attestation · portable signed receipt"
      title="Flip one byte and it voids."
      lede="Sign a synthetic score receipt with ECDSA P-256 in your browser (Web Crypto — the private key never leaves this page), then verify it offline with only the attestation itself. Then try to cheat."
    >
      <div className="sec-actions">
        <button className="btn btn--primary btn--sm" onClick={() => void signAndVerify()} disabled={busy}>
          Sign + verify
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => void tamper()} disabled={!sigil}>
          Tamper with it
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => void wrongSigner()} disabled={!sigil}>
          Wrong signer
        </button>
      </div>
      <Log steps={steps} />
      <Peek title="Peek at the attestation (JSON)" value={sigil} />
      <p className="sec-note">
        Integrity + authenticity only: it proves the content is intact and this key signed it — not that the
        key belongs to a real-world identity. That binding is a separate PKI/attestation concern.
      </p>
    </DemoCard>
  )
}

// ── 2 · Merkle batch ─────────────────────────────────────────────────────────
const BATCH_ENTRIES = Array.from({ length: 8 }, (_, i) => ({
  beneficiary: `partner-${String(i + 1).padStart(2, '0')}`,
  receipt: {
    kind: 'demo.receipt',
    note: 'SYNTHETIC demo receipt',
    receipt_id: `r-${String(i + 1).padStart(3, '0')}`,
    reward: i % 2,
    verifier_version: 'demo-verifier-1.0.0',
  },
}))

function MerklePanel() {
  const [steps, setSteps] = useState<Step[]>([])
  const [batch, setBatch] = useState<ReceiptBatch | null>(null)
  const [rootSigil, setRootSigil] = useState<Sigil | null>(null)

  const build = async () => {
    const b = batchReceipts(BATCH_ENTRIES)
    const key = await generateSigningKey()
    const rs = await signSigil({ merkle_root: b.root, receipt_count: b.count }, key, {
      issuer: 'origin-demo',
      kind: 'merkle-root',
    })
    const rsv = await verifySigil(rs)
    const target = BATCH_ENTRIES[3]
    const check = verifyReceiptInBatch(target, b.proofs[3], b.root)
    setBatch(b)
    setRootSigil(rs)
    setSteps([
      info('batched', `${b.count} receipts → ONE Merkle root ${short(b.root)} — one signature amortizes the whole batch`),
      rsv.ok ? ok('root signed', 'the root travels as an attestation; each holder gets a compact inclusion proof') : bad('root sign', rsv.reason),
      check.ok
        ? ok(`receipt #4 verified`, `${check.reason} — proof is ${b.proofs[3].proof.length} hashes for ${b.count} receipts (O(log N)), no other receipt revealed`)
        : bad('inclusion', check.reason),
    ])
  }

  const tamperReceipt = () => {
    if (!batch) return
    const altered = {
      beneficiary: BATCH_ENTRIES[3].beneficiary,
      receipt: { ...BATCH_ENTRIES[3].receipt, reward: 999 },
    }
    const v = verifyReceiptInBatch(altered, batch.proofs[3], batch.root)
    setSteps((prev) => [
      ...prev,
      info('tamper attempt', 'altered receipt #4 (reward 0 → 999) while keeping its original proof'),
      v.ok ? bad('MISSED', 'tampered receipt passed') : ok('tamper caught', v.reason),
    ])
  }

  const repoint = () => {
    if (!batch) return
    const stolen = { beneficiary: 'attacker-99', receipt: BATCH_ENTRIES[3].receipt }
    const v = verifyReceiptInBatch(stolen, batch.proofs[3], batch.root)
    setSteps((prev) => [
      ...prev,
      info('re-point attempt', 'tried to claim receipt #4 for a different beneficiary'),
      v.ok
        ? bad('MISSED', 're-pointed receipt passed')
        : ok('beneficiary bound', `${v.reason} — the beneficiary is hashed into the leaf, so a receipt can't be re-pointed`),
    ])
  }

  return (
    <DemoCard
      kicker="Merkle batch · signed once, proven individually"
      title="Eight receipts. One signature. Each provable alone."
      lede="Batch eight synthetic receipts into a Merkle tree, sign only the root, then prove one receipt's inclusion without revealing the others. Leaves are beneficiary-bound and domain-separated (leaf: vs node:) against second-preimage games."
    >
      <div className="sec-actions">
        <button className="btn btn--primary btn--sm" onClick={() => void build()}>
          Batch + sign the root
        </button>
        <button className="btn btn--ghost btn--sm" onClick={tamperReceipt} disabled={!batch}>
          Tamper a receipt
        </button>
        <button className="btn btn--ghost btn--sm" onClick={repoint} disabled={!batch}>
          Re-point the beneficiary
        </button>
      </div>
      <Log steps={steps} />
      <Peek title="Peek at receipt #4's inclusion proof" value={batch ? batch.proofs[3] : null} />
      <Peek title="Peek at the signed root (attestation)" value={rootSigil} />
    </DemoCard>
  )
}

// ── 3 · Proof-carrying policy ────────────────────────────────────────────────
function PolicyPanel() {
  const [steps, setSteps] = useState<Step[]>([])
  const [chain, setChain] = useState<PolicyVersion[] | null>(null)
  const [decision, setDecision] = useState<unknown>(null)

  const build = () => {
    const v1 = createPolicy(
      { spend_cap_usd: 50, require_approval_over_usd: 25 },
      { author: 'ops@origin-demo', reason: 'genesis policy', at: '2026-07-01' },
    )
    const v2 = amendPolicy(
      v1,
      { spend_cap_usd: 200, require_approval_over_usd: 100 },
      { author: 'cfo@origin-demo', reason: 'Q3 budget raise — approved in finance review', at: '2026-07-03' },
    )
    const v3 = amendPolicy(
      v2,
      { spend_cap_usd: 20, require_approval_over_usd: 0 },
      { author: 'security@origin-demo', reason: 'incident lockdown — cap everything', at: '2026-07-05' },
    )
    const versions = [v1, v2, v3]
    const cv = verifyPolicyChain(versions)
    const d = bindDecision(v2, { action: 'pay_invoice', amount_usd: 120, allowed: true })
    const underV2 = verifyDecisionUnderPolicy(d, v2)
    const underV3 = verifyDecisionUnderPolicy(d, v3)
    setChain(versions)
    setDecision(d)
    setSteps([
      info('history', 'v1 cap $50 → v2 cap $200 (CFO, with reason) → v3 cap $20 (incident lockdown) — each amendment carries its proof inside the hash'),
      cv.ok ? ok('chain intact', `${cv.reason}; head ${short(cv.head)}`) : bad('chain', cv.reason),
      ok('decision bound', 'a $120 payment decided under v2 carries v2’s digest with it'),
      underV2.ok ? ok('judged under v2', underV2.reason) : bad('under v2', underV2.reason),
      underV3.ok
        ? bad('MISSED', 'the v2 decision passed under v3')
        : ok('no retroactive compliance', `${underV3.reason} — yesterday's decision cannot be re-judged under today's policy`),
    ])
  }

  const tamperHistory = () => {
    if (!chain) return
    const forged = structuredClone(chain)
    forged[1].rules = { ...forged[1].rules, spend_cap_usd: 999999 }
    const cv = verifyPolicyChain(forged)
    setSteps((prev) => [
      ...prev,
      info('tamper attempt', 'silently rewrote v2’s cap to $999,999 in the stored history'),
      cv.ok ? bad('MISSED', 'rewritten history verified') : ok('rewrite caught', cv.reason),
    ])
  }

  return (
    <DemoCard
      kicker="Proof-carrying policy · versioned, hash-chained"
      title="Yesterday's decision, judged by yesterday's policy."
      lede="A policy is not a mutable blob — it's a hash-chained sequence of versions, and every decision binds to the exact version it ran under. Amend the policy all you like; you can't retroactively make a past decision look compliant."
    >
      <div className="sec-actions">
        <button className="btn btn--primary btn--sm" onClick={build}>
          Build the history + bind a decision
        </button>
        <button className="btn btn--ghost btn--sm" onClick={tamperHistory} disabled={!chain}>
          Rewrite history
        </button>
      </div>
      <Log steps={steps} />
      <Peek title="Peek at the bound decision" value={decision} />
      <Peek title="Peek at the policy chain" value={chain} />
    </DemoCard>
  )
}

// ── 4 · IAM reference check (Crucible) ───────────────────────────────────────
const AGENT_CONFIG = {
  model: 'demo-agent-v1',
  tools: ['iam.decide'],
  context: 'least-privilege-system-prompt@3',
  harness: 'janus-router@1',
  note: 'SYNTHETIC demo config',
}
const computeLevel = (verdicts: LicenseVerdict[]) => computeLicenseFromVerdicts(verdicts).level.id

function ReferenceCheckPanel() {
  const [steps, setSteps] = useState<Step[]>([])
  const [result, setResult] = useState<IamReferenceCheck | null>(null)

  const runHarnessed = () => {
    const r = issueIamReferenceCheck({
      agentConfig: AGENT_CONFIG,
      policyFor: oraclePolicy,
      computeLevel,
      issuedAt: '2026-07-06',
    })
    const v = verifyCredential({
      credential: r.credential,
      liveConfig: AGENT_CONFIG,
      envBundleDigest: iamEnvDigest(),
      versions: IAM_VERSIONS,
    })
    setResult(r)
    setSteps([
      info('gym', `${iamTasks.length} least-privilege access decisions, labeled by the deterministic oracle — never an LLM grading an LLM`),
      ok('reference check issued', r.summary.replaceAll('\n', ' ')),
      v.code === 0
        ? ok('independently re-verified', 'the credential re-checks against the live config + pinned env/verifier (code 0)')
        : bad('re-verify', `code ${v.code}: ${v.checks[v.checks.length - 1]?.[1] ?? 'failed'}`),
    ])
  }

  const runAllowAll = () => {
    const r = issueIamReferenceCheck({
      agentConfig: { ...AGENT_CONFIG, harness: 'none — raw allow-all baseline' },
      policyFor: allowAllPolicy,
      computeLevel,
      issuedAt: '2026-07-06',
    })
    setSteps((prev) => [
      ...prev,
      info('baseline', 'the naive allow-all agent runs the same battery'),
      bad(
        `${r.catastrophic} catastrophic over-grants`,
        `allowed forbidden/tainted/high-sensitivity actions the oracle refuses — the readiness level is capped at ${r.credential.rsl_level}. Over-caution is a miss; over-GRANTING is catastrophic.`,
      ),
    ])
  }

  const drift = () => {
    if (!result) return
    const v = verifyCredential({
      credential: result.credential,
      liveConfig: { ...AGENT_CONFIG, model: 'demo-agent-v2' },
      envBundleDigest: iamEnvDigest(),
      versions: IAM_VERSIONS,
    })
    setSteps((prev) => [
      ...prev,
      info('config drift', 'the agent’s model changed after certification (demo-agent-v1 → v2)'),
      v.code === 4
        ? ok('credential VOID', 'config drift detected (code 4) — a cert earned by one config cannot be carried onto another')
        : bad('MISSED', `expected VOID, got code ${v.code}`),
    ])
  }

  return (
    <DemoCard
      kicker="Crucible + IAM gym · configuration-bound reference checks + attestations"
      title="A reference check for agents — issued by the oracle, bound to the config."
      lede="Run an agent policy through a deterministic IAM/least-privilege gym and mint a config-bound credential: the Verified Readiness Level, the before/after lift, and the receipts that back it. Change the model, tools, context, or harness — and it voids."
    >
      <div className="sec-actions">
        <button className="btn btn--primary btn--sm" onClick={runHarnessed}>
          Issue a reference check
        </button>
        <button className="btn btn--ghost btn--sm" onClick={runAllowAll}>
          Run the allow-all baseline
        </button>
        <button className="btn btn--ghost btn--sm" onClick={drift} disabled={!result}>
          Drift the config
        </button>
      </div>
      {result ? (
        <div className="sec-badge-row">
          <span className="sec-rsl">
            {result.credential.rsl_level} <small>Verified Readiness Level</small>
          </span>
          <span className="sec-note" style={{ marginTop: 0 }}>
            pass {Math.round(result.credential.pass_rate * 100)}% · cold {Math.round(result.credential.cold_pass_rate * 100)}% · lift +
            {Math.round(result.credential.lift * 100)}% · config {short(result.credential.config_digest)}
          </span>
        </div>
      ) : null}
      <Log steps={steps} />
      <Peek title="Peek at the credential" value={result ? result.credential : null} />
      <p className="sec-note">
        "Certified" here means <b>reproducible least-privilege behavior under this verifier + this config</b> —
        never "safe". Synthetic demo battery; real design-partner evidence stays blocked until authorized.
      </p>
      <div className="sec-actions" style={{ marginTop: 4 }}>
        <a className="btn btn--primary btn--sm" href="/reference-check">
          Run your own reference check &rarr;
        </a>
      </div>
    </DemoCard>
  )
}

// ── 5 · Over-grant analyzer ──────────────────────────────────────────────────
// The IAM gym above scores a POLICY against a fixed battery. This scores OBSERVED AUTHORITY against
// what was actually exercised — the same oracle discipline pointed at an authorization log.
//
// The demo arc is the coupling, because that is the part a table of numbers cannot show: on a clean
// fleet, effective authority (own grants ∪ every descendant's) equals each identity's own grant, so
// the union adds nothing. Widen ONE delegation edge four hops down and the blast radius measured at
// the ROOT grows — which is why attenuation is the precondition that makes the other metrics mean
// something, not a hygiene checkbox.
const OG_SEED = 20260818
const OG_ROOTS = 400
const OG_DEPTH = 4
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`

// Six identities, laid out so the whole delegation tree reads at a glance. The
// percentages are computed by the SAME blastRadius() the published bench uses -- widening
// an edge really does change what the root can reach, it is not a typed-in number.
const TREE = [
  { id: 'root', parent: null, x: 300, y: 46, label: 'platform', granted: ['payroll:read', 'customer-pii:read', 'ledger:read', 'wire-transfer:read', 'source-secrets:read', 'dashboards:read'] },
  { id: 'ops', parent: 'root', x: 168, y: 150, label: 'ops', granted: ['payroll:read', 'customer-pii:read', 'dashboards:read'] },
  { id: 'fin', parent: 'root', x: 432, y: 150, label: 'finance', granted: ['ledger:read', 'wire-transfer:read'] },
  { id: 'ops-a', parent: 'ops', x: 96, y: 254, label: 'payroll-bot', granted: ['payroll:read'], widen: 'hr-records:read' },
  { id: 'ops-b', parent: 'ops', x: 240, y: 254, label: 'pii-bot', granted: ['customer-pii:read'], widen: 'prod-db:delete' },
  { id: 'fin-a', parent: 'fin', x: 432, y: 254, label: 'ledger-bot', granted: ['ledger:read'], widen: 'audit-log:read' },
] as const

function DelegationPanel() {
  const [widened, setWidened] = useState<ReadonlySet<string>>(new Set())
  const at = (id: string) => TREE.find((n) => n.id === id)!

  const corpus = {
    seed: 1,
    windowDays: 30,
    resources: overGrantResources,
    identities: TREE.map((n) => ({
      id: n.id,
      parent: n.parent,
      owner: 'human-01',
      tainted: false,
      granted: widened.has(n.id) && 'widen' in n ? [...n.granted, n.widen].sort() : [...n.granted],
      granted_day: 0,
      ttl_days: 30,
    })),
    events: [],
    planted: { violationEdges: [], dormantScopes: [] },
  } as unknown as OverGrantCorpus

  const root = blastRadius(corpus).perIdentity.find((p) => p.id === 'root')!
  const sensitive = overGrantResources.filter(isSensitive).length
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`

  const toggle = (id: string) =>
    setWidened((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <DemoCard
      kicker="Attenuation"
      title="Widen one edge. Watch the root's blast radius move."
      lede="A correct capability token can only narrow as it is delegated, so an ancestor reaches exactly its own grant. Break that on any edge and authority flows back up the tree."
    >
      <svg viewBox="0 0 600 300" className="deleg" role="img" aria-label={`Delegation tree. Root reaches ${root.reachable} of ${sensitive} sensitive resources.`}>
        {TREE.filter((n) => n.parent).map((n) => {
          const p = at(n.parent!)
          const bad = widened.has(n.id)
          return (
            <line key={`e-${n.id}`} x1={p.x} y1={p.y + 18} x2={n.x} y2={n.y - 18}
              stroke={bad ? 'var(--warn)' : 'var(--line-2)'} strokeWidth={bad ? 3 : 1.5} />
          )
        })}
        {TREE.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r="18" fill={n.id === 'root' ? 'var(--signal)' : 'var(--paper-2)'}
              stroke={widened.has(n.id) ? 'var(--warn)' : 'var(--line-2)'} strokeWidth={widened.has(n.id) ? 3 : 1.5} />
            <text x={n.x} y={n.y + 34} textAnchor="middle" className="deleg__l">{n.label}</text>
          </g>
        ))}
      </svg>

      <div className="deleg__ctl">
        {TREE.filter((n) => 'widen' in n).map((n) => (
          <button key={n.id} type="button" className={`btn btn--ghost btn--sm${widened.has(n.id) ? ' is-on' : ''}`}
            aria-pressed={widened.has(n.id)} onClick={() => toggle(n.id)}>
            {widened.has(n.id) ? 'Narrow' : 'Widen'} {n.label}
          </button>
        ))}
      </div>

      <Log steps={[
        widened.size === 0
          ? ok('attenuation holds', `Every child narrows. The root reaches exactly its own grant: ${root.reachable} of ${sensitive} sensitive resources.`)
          : bad(`${widened.size} edge${widened.size > 1 ? 's' : ''} widened`, `A descendant now holds a scope its parent never had, so the root inherits it.`),
        info('blast radius at the root', `${root.reachable} / ${sensitive} sensitive resources reachable — BRI ${pct(root.bri)}`),
      ]} />
    </DemoCard>
  )
}

function OverGrantPanel() {
  const [steps, setSteps] = useState<Step[]>([])
  const [corpus, setCorpus] = useState<OverGrantCorpus | null>(null)
  const [surface, setSurface] = useState<number | null>(null)

  const analyze = () => {
    // violationRate 0 — every child narrows, which is what a macaroon-model attenuating token does
    const clean = generateCorpus({ seed: OG_SEED, roots: OG_ROOTS, depth: OG_DEPTH, violationRate: 0 })
    const r = analyzeOverGrant(clean)
    const m = r.metrics
    // the no-op property, checked rather than asserted
    const eff = effectiveScopes(clean)
    const noOp = clean.identities.every((i) => eff.get(i.id)!.size === i.granted.length)
    setCorpus(clean)
    setSurface(m.gur.overGrantSurface)
    setSteps([
      info(
        'fleet',
        `${clean.identities.length} SYNTHETIC agent identities · ${m.amv.delegationEdges} delegation edges · ${clean.events.length} tool-call events · seed ${OG_SEED}`,
      ),
      bad(
        `GUR ${m.gur.fleetGur.toFixed(3)}`,
        `${m.gur.scopesExercised} of ${m.gur.scopesGranted} granted scopes were ever exercised — an over-grant surface of ${pct1(m.gur.overGrantSurface)}. A denied call is not use, and the fleet number is Σused ÷ Σgranted, never the mean of per-identity ratios.`,
      ),
      info(
        `BRI mean ${pct1(m.bri.meanBri)}`,
        `p95 ${pct1(m.bri.p95Bri)}, max ${pct1(m.bri.maxBri)} of the ${m.bri.sensitiveResources} sensitive resources reachable from a single identity`,
      ),
      m.amv.violatingEdgeCount === 0
        ? ok('AMV 0', `no delegation edge widened authority across ${m.amv.delegationEdges} edges — a structural zero, earned over real edges`)
        : bad(`AMV ${m.amv.violatingEdgeCount}`, `${m.amv.violatingEdgeCount} edges widened authority`),
      noOp
        ? ok('effective authority is a no-op', 'every child narrows, so an ancestor reaches exactly its own grant and nothing more')
        : bad('union grew', 'a descendant added authority its ancestor never held'),
      info(
        `TRP ${m.trp.exposedIdentities}/${m.trp.taintedIdentities}`,
        `tainted identities holding both a sensitive read and an egress capability — ${m.trp.paths} source→sink pairs. Structural exposure, not a detected exfiltration.`,
      ),
      info(
        `SAH ${m.sah.medianStalenessRatio.toFixed(2)}`,
        `median age-of-last-use ÷ TTL over the ${m.sah.exercisedScopes} scopes actually in use; median usage span ÷ TTL ${m.sah.medianSpanToTtl.toFixed(2)} — the just-in-time conversion signal`,
      ),
    ])
  }

  const widenOne = () => {
    if (!corpus) return
    const eff = effectiveScopes(corpus)
    // a leaf four hops from its root, so the widened scope has to travel to be felt
    const deep = corpus.identities.find((i) => i.id.split('.').length >= 3)
    if (!deep) return
    const rootId = deep.id.split('.')[0]
    const rootEff = eff.get(rootId)!
    const target = overGrantResources.find((r) => isSensitive(r) && ![...rootEff].some((s) => s.startsWith(`${r.id}:`)))
    if (!target) return

    const before = blastRadius(corpus, eff).perIdentity.find((p) => p.id === rootId)!
    const widened: OverGrantCorpus = {
      ...corpus,
      identities: corpus.identities.map((i) =>
        i.id === deep.id ? { ...i, granted: [...i.granted, `${target.id}:read`].sort() } : i,
      ),
    }
    const after = analyzeOverGrant(widened)
    const afterRoot = after.metrics.bri.perIdentity.find((p) => p.id === rootId)!
    setCorpus(widened)
    setSteps((prev) => [
      ...prev,
      info(
        'widen one edge',
        `granted ${deep.id} the scope ${target.id}:read — one scope its parent never held, ${deep.id.split('.').length - 1} hops below ${rootId}`,
      ),
      after.metrics.amv.violatingEdgeCount === 1
        ? ok('AMV 0 → 1', `the analyzer names the edge and the scope that widened it, out of ${after.metrics.amv.delegationEdges} edges`)
        : bad('MISSED', `expected exactly 1 violating edge, got ${after.metrics.amv.violatingEdgeCount}`),
      afterRoot.reachable > before.reachable
        ? bad(
            `blast radius at the ROOT ${pct1(before.bri)} → ${pct1(afterRoot.bri)}`,
            `${rootId} never held ${target.id}:read, and its own grant is unchanged — the authority arrived from a descendant. This is why attenuation is the precondition for the other metrics, not a hygiene checkbox.`,
          )
        : bad('MISSED', 'the root’s reachable set did not move'),
    ])
  }

  const scorePlanted = () => {
    const planted = generateCorpus({ seed: OG_SEED, roots: OG_ROOTS, depth: OG_DEPTH, violationRate: 0.06 })
    const score = scoreAgainstGroundTruth(analyzeOverGrant(planted), planted.planted)
    setSteps((prev) => [
      ...prev,
      info(
        'ground truth',
        `a fresh corpus with ${score.amv.planted} deliberately widened edges and ${score.dormant.planted} scopes granted-but-never-used, both known in advance`,
      ),
      score.amv.catchRate === 1 && score.amv.falsePositives === 0
        ? ok(
            `caught ${score.amv.caught}/${score.amv.planted}`,
            'every planted violation recovered, zero false positives — a metric you cannot score against ground truth is a dashboard, not a verifier',
          )
        : bad('detection regressed', `catch ${score.amv.catchRate}, ${score.amv.falsePositives} false positives`),
      score.dormant.exact
        ? ok(`dormant scopes exact`, `${score.dormant.measured} measured = ${score.dormant.planted} planted — the GUR denominator lands on the nose`)
        : bad('denominator off', `${score.dormant.measured} measured vs ${score.dormant.planted} planted`),
    ])
  }

  return (
    <DemoCard
      kicker="Over-grant analyzer · authorization-risk metrics from a tool-call log"
      title="How much authority is held and never used — and what one hijacked identity could reach."
      lede="The reference check above scores a policy. This scores the authority a fleet actually holds, against what it actually exercised: five metrics, each with a stated denominator, over a synthetic agent fleet and its RPC log. Then widen a single delegation edge and watch the blast radius move at the root."
    >
      <div className="sec-actions">
        <button className="btn btn--primary btn--sm" onClick={analyze}>
          Analyze the fleet
        </button>
        <button className="btn btn--ghost btn--sm" onClick={widenOne} disabled={!corpus}>
          Widen one delegation edge
        </button>
        <button className="btn btn--ghost btn--sm" onClick={scorePlanted}>
          Score against planted ground truth
        </button>
      </div>
      {surface != null ? (
        <div className="sec-badge-row">
          <span className="sec-rsl">
            {pct1(surface)} <small>over-grant surface</small>
          </span>
          <span className="sec-note" style={{ marginTop: 0 }}>
            granted authority never exercised in the window · synthetic fleet, seed {OG_SEED}
          </span>
        </div>
      ) : null}
      <Log steps={steps} />
      <p className="sec-note">
        The corpus is <b>SYNTHETIC</b> and seeded — these numbers measure the analyzer, not any real
        deployment, and no claim is made about any customer's authorization data. The published
        artifact re-derives byte-for-byte from its seed; definitions, denominators, and limits are in{' '}
        <code>docs/OVER-GRANT-METRICS.md</code>.
      </p>
      <div className="sec-actions" style={{ marginTop: 4 }}>
        <a className="btn btn--ghost btn--sm" href="/trust/over-grant-bench.json">
          The published artifact &rarr;
        </a>
      </div>
    </DemoCard>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────
export function SecurityPage() {
  return (
    <div className="sec-grid">
      <SigilPanel />
      <MerklePanel />
      <PolicyPanel />
      <ReferenceCheckPanel />
      <DelegationPanel />
      <OverGrantPanel />
    </div>
  )
}
