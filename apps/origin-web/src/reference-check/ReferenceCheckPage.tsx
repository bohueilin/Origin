// The buyer reference-check flow is a browser-only synthetic policy evaluation.
// A buyer picks a scenario (a customer-support or IAM least-privilege gym), declares an
// agent configuration and policy, and evaluates that POLICY against the deterministic
// battery. The named agent is not contacted or executed. The downloaded Action/Run envelope
// is signed for tamper evidence, is deliberately unpinned, and carries not_attempted rather
// than provider-confirmed execution.
//
// The deterministic oracle is the only label authority (never an LLM). A verdict means
// reproducible least-privilege behavior under THIS verifier + THIS config — never "safe". The
// browser-session signing key proves only that the downloaded envelope was not altered after it
// was made; it is unpinned and cannot grant deployment authority.
import { useMemo, useState } from 'react'
import { issueIamReferenceCheck, iamTasks, iamOracle, verifyIamDecision, iamEnvDigest, IAM_VERSIONS } from '@origin/verifier-core/iamGym'
import { issueSupportReferenceCheck, supportTasks, supportOracle, verifySupportDecision, supportEnvDigest, SUPPORT_VERSIONS } from '@origin/verifier-core/supportGym'
import { verifyCredential, type CrucibleCredential } from '@origin/verifier-core/crucible'
import { generateSigningKey, keyThumbprint } from '@origin/verifier-core/sigil'
import { signActionRunEvidence } from '@origin/verifier-core/action-run-evidence'
import { computeLicenseFromVerdicts, type LicenseVerdict } from '../license'
import { buildSyntheticReferenceCheckEvidence } from './evidence'
import {
  PRESETS, policyForSpec, type PolicySpec, type Decision, type Classification,
  SUPPORT_PRESETS, supportPolicyForSpec, type SupportPolicySpec,
} from '../certify/policySpec'

interface AgentConfig { model: string; tools: string; context: string; harness: string }
type Scenario = 'support' | 'iam'

const computeLevel = (verdicts: LicenseVerdict[]) => computeLicenseFromVerdicts(verdicts).level.id
const short = (s: string) => (s ? `${s.slice(0, 10)}…` : '')

// Each Verified Readiness Level maps to a concrete operational decision — not just a score.
const VRL_DECISIONS: Record<string, { scope: string; approval: string; monitoring: string; voids: string }> = {
  L0: { scope: 'Illustrative posture: observe-only', approval: 'illustrative: every proposed action', monitoring: 'illustrative: full', voids: 'declared config or selected policy changes' },
  L1: { scope: 'Illustrative posture: read-only / low-sensitivity', approval: 'illustrative: all side effects', monitoring: 'illustrative: full', voids: 'declared config or selected policy changes' },
  L2: { scope: 'Illustrative posture: medium-sensitivity with approval gates', approval: 'illustrative: high-value + tainted', monitoring: 'illustrative: on', voids: 'declared config or selected policy changes' },
  L3: { scope: 'Illustrative posture: high-sensitivity with catastrophic checks', approval: 'illustrative: catastrophic cases', monitoring: 'illustrative: sampled', voids: 'declared config or selected policy changes' },
  L4: { scope: 'Illustrative posture: broad in-scope policy coverage', approval: 'illustrative: none within a hypothetical scope', monitoring: 'illustrative: audit', voids: 'declared config or selected policy changes' },
}

interface RowResult { id: string; label: string; sub: string; yours: Decision; oracle: Decision; passed: boolean; catastrophic: boolean }
interface RunResult {
  scenario: Scenario; level: string; passRate: number; coldPassRate: number; lift: number; catastrophic: number
  configDigest: string; rows: RowResult[]; credential: CrucibleCredential; reVerifyCode: number
  evidence: unknown; sigilThumbprint: string; driftCode: number | null
}

export function ReferenceCheckPage() {
  const [scenario, setScenario] = useState<Scenario>('support')
  const [agent, setAgent] = useState<AgentConfig>({ model: 'support-agent-v1', tools: 'refunds, crm.write, email.send', context: 'support-policy@1', harness: 'my-harness@1' })
  const [iamSpec, setIamSpec] = useState<PolicySpec>(PRESETS['least-privilege'].spec)
  const [supSpec, setSupSpec] = useState<SupportPolicySpec>(SUPPORT_PRESETS['least-privilege'].spec)
  const [presetKey, setPresetKey] = useState<string>('least-privilege')
  const [result, setResult] = useState<RunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const agentConfig = useMemo(() => ({
    model: agent.model.trim() || 'unnamed-agent',
    tools: agent.tools.split(',').map((t) => t.trim()).filter(Boolean),
    context: agent.context.trim() || 'none',
    harness: agent.harness.trim() || 'none',
  }), [agent])

  const switchScenario = (s: Scenario) => {
    setScenario(s)
    setPresetKey('least-privilege')
    setResult(null)
    setError(null)
    setAgent(s === 'support'
      ? { model: 'support-agent-v1', tools: 'refunds, crm.write, email.send', context: 'support-policy@1', harness: 'my-harness@1' }
      : { model: 'iam-agent-v1', tools: 'iam.decide, data.read', context: 'system-prompt@1', harness: 'my-harness@1' })
  }
  const applyPreset = (key: string) => {
    setPresetKey(key)
    if (scenario === 'support' && SUPPORT_PRESETS[key]) setSupSpec(SUPPORT_PRESETS[key].spec)
    if (scenario === 'iam' && PRESETS[key]) setIamSpec(PRESETS[key].spec)
  }

  const run = async () => {
    setBusy(true); setError(null)
    try {
      let rows: RowResult[]
      let r: { credential: CrucibleCredential; catastrophic: number }
      let envDigest: string
      let versions: { verifier_version: string; reward_model_version: string }
      let battery: ReadonlyArray<{ id: string }>
      let selectedPolicy: object

      if (scenario === 'support') {
        const policyFor = supportPolicyForSpec(supSpec)
        rows = supportTasks.map((task: { id: string; action: string; amount: number | null; pii: boolean; forbidden: boolean; tainted: boolean; requires_approval: boolean }) => {
          const yours = policyFor(task) as Decision
          const flags = [task.pii && 'PII', task.forbidden && 'destructive', task.tainted && 'fraud-flagged', task.requires_approval && 'approval', task.amount != null && `$${task.amount}`].filter(Boolean).join(' · ')
          const v = verifySupportDecision(task, yours)
          return { id: task.id, label: task.action, sub: flags || 'routine', yours, oracle: supportOracle(task).decision as Decision, passed: v.passed, catastrophic: v.catastrophic }
        })
        r = issueSupportReferenceCheck({ agentConfig, policyFor, computeLevel, issuedAt: null })
        envDigest = supportEnvDigest(); versions = SUPPORT_VERSIONS
        battery = supportTasks
        selectedPolicy = supSpec
      } else {
        const policyFor = policyForSpec(iamSpec)
        rows = iamTasks.map((task) => {
          const yours = policyFor(task)
          const v = verifyIamDecision(task, yours)
          return { id: task.id, label: task.resource.id, sub: task.resource.classification, yours, oracle: iamOracle(task).decision as Decision, passed: v.passed, catastrophic: v.catastrophic }
        })
        r = issueIamReferenceCheck({ agentConfig, policyFor, computeLevel, issuedAt: null })
        envDigest = iamEnvDigest(); versions = IAM_VERSIONS
        battery = iamTasks
        selectedPolicy = iamSpec
      }

      const rv = verifyCredential({ credential: r.credential, liveConfig: agentConfig, envBundleDigest: envDigest, versions })
      const issuedAt = new Date().toISOString()
      const keyPair = await generateSigningKey()
      const unsignedEvidence = buildSyntheticReferenceCheckEvidence({
        evidenceId: crypto.randomUUID(), issuedAt, maxAgeMs: 24 * 60 * 60 * 1000, scenario,
        declaredConfig: agentConfig, selectedPolicy, battery, rows,
        environmentDigest: envDigest, evaluatorVersion: versions.reward_model_version, verifierVersion: versions.verifier_version,
      })
      const evidence = await signActionRunEvidence(unsignedEvidence, keyPair, {
        keyId: 'origin-browser-session', keyEpoch: 1, issuer: 'origin-reference-check-session', signedAt: issuedAt,
      })
      const thumb = await keyThumbprint(evidence.signature.sigil.pubkey_jwk)
      setResult({
        scenario, level: r.credential.rsl_level as string, passRate: r.credential.pass_rate as number, coldPassRate: r.credential.cold_pass_rate as number,
        lift: r.credential.lift as number, catastrophic: r.catastrophic, configDigest: r.credential.config_digest as string,
        rows, credential: r.credential, reVerifyCode: rv.code, evidence, sigilThumbprint: thumb, driftCode: null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // The legacy configuration-binding demonstration remains available alongside the new envelope.
  const simulateDrift = () => {
    if (!result) return
    const drifted = { ...agentConfig, tools: [...agentConfig.tools, 'payments.transfer'] }
    const envDigest = result.scenario === 'support' ? supportEnvDigest() : iamEnvDigest()
    const versions = result.scenario === 'support' ? SUPPORT_VERSIONS : IAM_VERSIONS
    const rv = verifyCredential({ credential: result.credential as Parameters<typeof verifyCredential>[0]['credential'], liveConfig: drifted, envBundleDigest: envDigest, versions })
    setResult({ ...result, driftCode: rv.code })
  }

  const download = (obj: unknown, name: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
  }

  const verdictClass = result && result.catastrophic > 0 ? 'rc-verdict--warn' : 'rc-verdict--ok'
  const presets = scenario === 'support' ? SUPPORT_PRESETS : PRESETS
  const taskCount = scenario === 'support' ? supportTasks.length : iamTasks.length

  return (
    <div className="rc-grid">
      <p className="rc-hint">
        This is a browser-only synthetic policy evaluation. It evaluates the selected policy against a fixed deterministic battery; it does not contact or execute the named agent. <a href="/reference-check-vs-runtime">See how it differs from proposed runtime enforcement →</a>
      </p>
      {/* Scenario switch */}
      <div className="rc-scenarios">
        <button type="button" aria-pressed={scenario === 'support'} className={`rc-scn${scenario === 'support' ? ' is-on' : ''}`} onClick={() => switchScenario('support')}>
          <b>Customer-support agent</b><span>Refunds · CRM · email · PII · bank changes</span>
        </button>
        <button type="button" aria-pressed={scenario === 'iam'} className={`rc-scn${scenario === 'iam' ? ' is-on' : ''}`} onClick={() => switchScenario('iam')}>
          <b>IAM least-privilege</b><span>Access decisions across roles + sensitivity</span>
        </button>
      </div>

      {/* 1 · agent */}
      <div className="rc-card">
        <p className="rc-step">1 · Your agent</p>
        <p className="rc-hint">These declared configuration values are hashed into the synthetic evidence. Changing them changes the policy-evaluation input; this browser check does not contact, inspect, or execute the named agent.</p>
        <div className="rc-fields">
          <label className="rc-field"><span>Model</span><input value={agent.model} onChange={(e) => setAgent({ ...agent, model: e.target.value })} /></label>
          <label className="rc-field"><span>Tools (comma-separated)</span><input value={agent.tools} onChange={(e) => setAgent({ ...agent, tools: e.target.value })} /></label>
          <label className="rc-field"><span>Context / system prompt id</span><input value={agent.context} onChange={(e) => setAgent({ ...agent, context: e.target.value })} /></label>
          <label className="rc-field"><span>Harness</span><input value={agent.harness} onChange={(e) => setAgent({ ...agent, harness: e.target.value })} /></label>
        </div>
      </div>

      {/* 2 · policy */}
      <div className="rc-card">
        <p className="rc-step">2 · Your policy</p>
        <p className="rc-hint">
          Pick a preset or set the guards. The gym runs {taskCount} proposed {scenario === 'support' ? 'support actions' : 'access decisions'}; each guard you leave <b>off</b> is a way your agent can over-grant, which the deterministic oracle catches.
        </p>
        <div className="rc-presets">
          {Object.entries(presets).map(([key, p]) => (
            <button key={key} type="button" aria-pressed={presetKey === key} className={`rc-preset${presetKey === key ? ' is-on' : ''}`} onClick={() => applyPreset(key)}>
              <b>{p.label}</b><span>{p.blurb}</span>
            </button>
          ))}
        </div>
        {scenario === 'support' ? (
          <div className="rc-toggles">
            <label className="rc-toggle rc-toggle--select"><span>Refund cap (auto-approve up to)</span>
              <select value={supSpec.refundCap} onChange={(e) => { setPresetKey('custom'); setSupSpec((s) => ({ ...s, refundCap: Number(e.target.value) })) }}>
                <option value={50}>$50</option><option value={100}>$100</option><option value={250}>$250</option><option value={100000}>no cap (dangerous)</option>
              </select>
            </label>
            <label className="rc-toggle"><input type="checkbox" checked={supSpec.denyPii} onChange={() => { setPresetKey('custom'); setSupSpec((s) => ({ ...s, denyPii: !s.denyPii })) }} />Refuse to disclose personal data (PII)</label>
            <label className="rc-toggle"><input type="checkbox" checked={supSpec.denyForbidden} onChange={() => { setPresetKey('custom'); setSupSpec((s) => ({ ...s, denyForbidden: !s.denyForbidden })) }} />Refuse destructive / bulk actions</label>
            <label className="rc-toggle"><input type="checkbox" checked={supSpec.denyTainted} onChange={() => { setPresetKey('custom'); setSupSpec((s) => ({ ...s, denyTainted: !s.denyTainted })) }} />Route fraud-flagged accounts to a human</label>
            <label className="rc-toggle"><input type="checkbox" checked={supSpec.requireApprovalHigh} onChange={() => { setPresetKey('custom'); setSupSpec((s) => ({ ...s, requireApprovalHigh: !s.requireApprovalHigh })) }} />Escalate over-cap refunds + bank-detail changes for approval</label>
          </div>
        ) : (
          <div className="rc-toggles">
            <label className="rc-toggle"><input type="checkbox" checked={iamSpec.honorRoleAllowlist} onChange={() => { setPresetKey('custom'); setIamSpec((s) => ({ ...s, honorRoleAllowlist: !s.honorRoleAllowlist })) }} />Honor the role allow-list (deny off-role principals)</label>
            <label className="rc-toggle"><input type="checkbox" checked={iamSpec.denyForbidden} onChange={() => { setPresetKey('custom'); setIamSpec((s) => ({ ...s, denyForbidden: !s.denyForbidden })) }} />Deny categorically forbidden resources</label>
            <label className="rc-toggle"><input type="checkbox" checked={iamSpec.denyTainted} onChange={() => { setPresetKey('custom'); setIamSpec((s) => ({ ...s, denyTainted: !s.denyTainted })) }} />Deny tainted principals (prompt-injection posture)</label>
            <label className="rc-toggle"><input type="checkbox" checked={iamSpec.escalateOnApproval} onChange={() => { setPresetKey('custom'); setIamSpec((s) => ({ ...s, escalateOnApproval: !s.escalateOnApproval })) }} />Escalate approval-gated actions to a human</label>
            <label className="rc-toggle rc-toggle--select"><span>Auto-allow up to classification</span>
              <select value={iamSpec.autoAllowUpTo} onChange={(e) => { setPresetKey('custom'); setIamSpec((s) => ({ ...s, autoAllowUpTo: e.target.value as Classification })) }}>
                <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="forbidden">forbidden (never recommended)</option>
              </select>
            </label>
          </div>
        )}
        <div className="rc-actions">
          <button className="btn btn--primary" onClick={run} disabled={busy} aria-busy={busy}>{busy ? 'Running the check…' : 'Run the reference check'}</button>
        </div>
        {error ? <p className="rc-error" role="alert">Error: {error}</p> : null}
      </div>

      {/* 3 · verdict */}
      {result ? (
        <div className="rc-card">
          <p className="rc-step">3 · Your reference check</p>
          <div className={`rc-verdict ${verdictClass}`} role="status" aria-live="polite">
            <b>{result.level}</b>
            <span>Synthetic battery readiness sample</span>
            <span className="rc-verdict__meta">passed {Math.round(result.passRate * 100)}% · unbounded baseline {Math.round(result.coldPassRate * 100)}% · lift +{Math.round(result.lift * 100)}% · config {short(result.configDigest)}</span>
          </div>
          {result.catastrophic > 0 ? (
            <p className="rc-hint rc-hint--warn"><b>{result.catastrophic} catastrophic over-grant{result.catastrophic > 1 ? 's' : ''}</b> — your policy allowed an action the oracle refuses (PII / destructive / fraud-flagged / approval-gated). A single catastrophic over-grant caps the level: the right to act can’t be averaged back.</p>
          ) : (
            <p className="rc-hint">No catastrophic over-grants in this fixed battery — the legacy configuration-bound credential re-verified locally{result.reVerifyCode === 0 ? ' (code 0)' : ` (code ${result.reVerifyCode})`}. This is not evidence that the named agent executed.</p>
          )}

          {/* what this level actually permits */}
          {VRL_DECISIONS[result.level] ? (
            <p className="rc-hint"><b>Illustrative posture associated with {result.level}:</b> {VRL_DECISIONS[result.level].scope}. Human approval on {VRL_DECISIONS[result.level].approval}; monitoring {VRL_DECISIONS[result.level].monitoring}; <b>input changes:</b> {VRL_DECISIONS[result.level].voids}. It is not a permission grant or deployment authorization.</p>
          ) : null}

          {/* tabindex/role: a horizontally scrollable region must be reachable by
              keyboard (axe scrollable-region-focusable). */}
          <div className="rc-scroll" tabIndex={0} role="region" aria-label="Scenario results (scrollable)">
            <table className="rc-table">
              <thead><tr><th>Proposed action</th><th>Attributes</th><th>Your agent</th><th>Oracle</th><th>Verdict</th></tr></thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.id} className={r.catastrophic ? 'rc-row--cat' : r.passed ? '' : 'rc-row--miss'}>
                    <td><b>{r.label}</b></td><td>{r.sub}</td><td>{r.yours}</td><td>{r.oracle}</td>
                    <td>{r.catastrophic ? '⛔ over-grant' : r.passed ? '✓ match' : '△ miss'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4 · evidence + drift */}
          <p className="rc-step" style={{ marginTop: 26 }}>4 · Take the evidence — and watch it expire</p>
          <div className="rc-actions">
            <button className="btn btn--primary btn--sm" onClick={() => download(result.evidence, 'reference-check.policy-evaluation.json')}>Download signed policy-evaluation evidence</button>
            <a className="btn btn--ghost btn--sm" href="/verify">Re-verify it on /verify →</a>
            <button className="btn btn--ghost btn--sm" onClick={simulateDrift}>Change a tool → watch it void</button>
          </div>
          {result.driftCode != null ? (
            <p className={`rc-hint ${result.driftCode === 0 ? '' : 'rc-hint--warn'}`} role="alert">
              {result.driftCode === 4
                ? <><b>VOID (code 4) — config drift.</b> Adding a tool (<code>payments.transfer</code>) changed the config hash, so the attestation no longer applies. <b>Static approvals go stale; Origin’s evidence is bound to the exact system tested.</b></>
                : <>Re-checked against the drifted config → code {result.driftCode}.</>}
            </p>
          ) : null}
          <p className="rc-hint">
            This browser-generated synthetic demo credential is an Action/Run envelope signed with a browser-session key (thumbprint <code>{short(result.sigilThumbprint)}</code>) for tamper evidence only. Paste it into <a href="/verify">/verify</a>: it correctly renders <b>UNTRUSTED</b> because this ephemeral key is not issuer-pinned, and <b>not attempted</b> because no named agent ran and no provider confirmed an effect. Tampering any field makes it VOID. Synthetic pilot battery; real design-partner evidence stays blocked until authorized.
          </p>
        </div>
      ) : null}

      {/* Book */}
      <div className="rc-card rc-card--cta">
        <p className="rc-step">Need an authorized evaluation beyond this browser demo?</p>
        <p className="rc-hint">This page only evaluates a selected policy against Origin’s synthetic battery. A design-partner evidence review can scope whether any authorized evaluation of an actual agent is appropriate.</p>
        <div className="rc-actions"><a className="btn btn--ghost" href="/#contact" data-analytics="refcheck_book_click">Book an evidence review</a></div>
      </div>
    </div>
  )
}
