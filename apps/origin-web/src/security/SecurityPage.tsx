// /security — the security cores, live in the browser.
// =============================================================================
// Four panels, each driving the REAL @origin/verifier-core engine client-side (no server, no
// mocks of the engines themselves — the data is synthetic and labeled as such):
//
//   1. Sigil            — sign → verify → tamper → VOID → wrong-signer → rejected
//   2. Merkle batch     — one signed root, O(log N) inclusion proofs, beneficiary-bound
//   3. Policy chain     — hash-chained versions; decisions bind to the version in force
//   4. Reference check  — the IAM gym + Crucible: config-bound credential from the
//                         deterministic oracle; drift → VOID; over-grants cap the RSL
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

// ── 1 · Sigil ────────────────────────────────────────────────────────────────
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
        info('signed', `ES256 over the content-address ${short(s.payload_digest)} — the public key travels inside the Sigil`),
        v.ok
          ? ok('verified offline', `${v.reason} (code ${v.code}) — no server, no registry, just the Sigil`)
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
        : ok('signer pinned', `${v.reason} (code ${v.code}) — a valid-but-wrong-signer Sigil is rejected`),
    ])
  }

  return (
    <DemoCard
      kicker="Sigil · portable signed receipt"
      title="Flip one byte and it voids."
      lede="Sign a synthetic score receipt with ECDSA P-256 in your browser (Web Crypto — the private key never leaves this page), then verify it offline with only the Sigil itself. Then try to cheat."
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
      <Peek title="Peek at the Sigil (JSON)" value={sigil} />
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
      rsv.ok ? ok('root signed', 'the root travels as a Sigil; each holder gets a compact inclusion proof') : bad('root sign', rsv.reason),
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
      <Peek title="Peek at the signed root (Sigil)" value={rootSigil} />
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
        `allowed forbidden/tainted/high-sensitivity actions the oracle refuses — the RSL is capped at ${r.credential.rsl_level}. Over-caution is a miss; over-GRANTING is catastrophic.`,
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
      kicker="Crucible + IAM gym · certification-as-a-market"
      title="A reference check for agents — issued by the oracle, bound to the config."
      lede="Run an agent policy through a deterministic IAM/least-privilege gym and mint a config-bound credential: the RSL readiness level, the before/after lift, and the receipts that back it. Change the model, tools, context, or harness — and it voids."
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
            {result.credential.rsl_level} <small>RSL level</small>
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
    </div>
  )
}
