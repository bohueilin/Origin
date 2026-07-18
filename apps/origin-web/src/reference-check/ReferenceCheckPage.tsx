// The buyer reference-check flow — a real product surface, not a fixed demo.
// A buyer picks a scenario (a customer-support agent by default, or the IAM least-privilege
// gym), describes their agent (config, bound into the attestation), declares a policy, and
// runs it through the deterministic oracle. They get: a Verified Readiness Level, the
// before/after lift, a per-decision breakdown that shows exactly where the policy over-grants,
// a signed Origin Attestation they download and re-verify offline on /verify — and a one-click
// "drift" demonstration proving the attestation voids the moment a tool/permission changes.
//
// The deterministic oracle is the only label authority (never an LLM). A verdict means
// reproducible least-privilege behavior under THIS verifier + THIS config — never "safe". The
// signing key is generated in-session for offline integrity; production issues under Origin's
// pinned issuer key.
import { useMemo, useState } from 'react'
import { issueIamReferenceCheck, iamTasks, iamOracle, verifyIamDecision, iamEnvDigest, IAM_VERSIONS } from '@origin/verifier-core/iamGym'
import { issueSupportReferenceCheck, supportTasks, supportOracle, verifySupportDecision, supportEnvDigest, SUPPORT_VERSIONS } from '@origin/verifier-core/supportGym'
import { verifyCredential, type CrucibleCredential } from '@origin/verifier-core/crucible'
import { generateSigningKey, signSigil, keyThumbprint } from '@origin/verifier-core/sigil'
import { computeLicenseFromVerdicts, type LicenseVerdict } from '../license'
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
  L0: { scope: 'Observe only — no side effects', approval: 'every action', monitoring: 'full', voids: 'any grant' },
  L1: { scope: 'Read-only / low-sensitivity', approval: 'all side effects', monitoring: 'full', voids: 'any over-grant' },
  L2: { scope: 'In-scope medium; commits approval-gated', approval: 'high-value + tainted', monitoring: 'on', voids: 'config or policy drift' },
  L3: { scope: 'In-scope incl. high; no catastrophic', approval: 'catastrophic only', monitoring: 'sampled', voids: 'model / tools / env drift' },
  L4: { scope: 'Full in-scope autonomy', approval: 'none within scope', monitoring: 'audit', voids: 'any drift' },
}

interface RowResult { id: string; label: string; sub: string; yours: Decision; oracle: Decision; passed: boolean; catastrophic: boolean }
interface RunResult {
  scenario: Scenario; level: string; passRate: number; coldPassRate: number; lift: number; catastrophic: number
  configDigest: string; rows: RowResult[]; credential: CrucibleCredential; reVerifyCode: number
  sigil: unknown; sigilThumbprint: string; driftCode: number | null
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
      } else {
        const policyFor = policyForSpec(iamSpec)
        rows = iamTasks.map((task) => {
          const yours = policyFor(task)
          const v = verifyIamDecision(task, yours)
          return { id: task.id, label: task.resource.id, sub: task.resource.classification, yours, oracle: iamOracle(task).decision as Decision, passed: v.passed, catastrophic: v.catastrophic }
        })
        r = issueIamReferenceCheck({ agentConfig, policyFor, computeLevel, issuedAt: null })
        envDigest = iamEnvDigest(); versions = IAM_VERSIONS
      }

      const rv = verifyCredential({ credential: r.credential, liveConfig: agentConfig, envBundleDigest: envDigest, versions })
      const keyPair = await generateSigningKey()
      const sigil = await signSigil(r.credential, keyPair, { issuer: 'origin-reference-check', kind: 'credential' })
      const thumb = await keyThumbprint(sigil.pubkey_jwk)
      setResult({
        scenario, level: r.credential.rsl_level as string, passRate: r.credential.pass_rate as number, coldPassRate: r.credential.cold_pass_rate as number,
        lift: r.credential.lift as number, catastrophic: r.catastrophic, configDigest: r.credential.config_digest as string,
        rows, credential: r.credential, reVerifyCode: rv.code, sigil, sigilThumbprint: thumb, driftCode: null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // The differentiated moment: change a tool and the attestation instantly voids.
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
        <p className="rc-hint">These values are hashed into the attestation — change the model, tools, context, or harness later and it <b>voids</b> (a certificate can’t be carried onto a different agent).</p>
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
          <button className="btn btn--primary" onClick={run} disabled={busy}>{busy ? 'Running the check…' : 'Run the reference check'}</button>
        </div>
        {error ? <p className="rc-error" role="alert">Error: {error}</p> : null}
      </div>

      {/* 3 · verdict */}
      {result ? (
        <div className="rc-card">
          <p className="rc-step">3 · Your reference check</p>
          <div className={`rc-verdict ${verdictClass}`} role="status" aria-live="polite">
            <b>{result.level}</b>
            <span>Verified Readiness Level</span>
            <span className="rc-verdict__meta">passed {Math.round(result.passRate * 100)}% · unbounded baseline {Math.round(result.coldPassRate * 100)}% · lift +{Math.round(result.lift * 100)}% · config {short(result.configDigest)}</span>
          </div>
          {result.catastrophic > 0 ? (
            <p className="rc-hint rc-hint--warn"><b>{result.catastrophic} catastrophic over-grant{result.catastrophic > 1 ? 's' : ''}</b> — your policy allowed an action the oracle refuses (PII / destructive / fraud-flagged / approval-gated). A single catastrophic over-grant caps the level: the right to act can’t be averaged back.</p>
          ) : (
            <p className="rc-hint">No catastrophic over-grants — the attestation re-verified independently{result.reVerifyCode === 0 ? ' (code 0)' : ` (code ${result.reVerifyCode})`}.</p>
          )}

          {/* what this level actually permits */}
          {VRL_DECISIONS[result.level] ? (
            <p className="rc-hint"><b>What {result.level} permits:</b> {VRL_DECISIONS[result.level].scope}. Human approval on {VRL_DECISIONS[result.level].approval}; monitoring {VRL_DECISIONS[result.level].monitoring}; <b>voids on</b> {VRL_DECISIONS[result.level].voids}.</p>
          ) : null}

          <div className="rc-scroll">
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
            <button className="btn btn--primary btn--sm" onClick={() => download(result.sigil, 'reference-check.attestation.json')}>Download the Origin Attestation</button>
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
            The attestation is signed with an in-session key (thumbprint <code>{short(result.sigilThumbprint)}</code>) for offline integrity — paste the downloaded file into <a href="/verify">/verify</a> and it re-checks in your browser: green means reproducible under this verifier + config, tamper any field and it goes VOID. <b>Production issues under Origin’s pinned issuer key.</b> Synthetic pilot battery; real design-partner evidence stays blocked until authorized.
          </p>
        </div>
      ) : null}

      {/* Book */}
      <div className="rc-card rc-card--cta">
        <p className="rc-step">Want a reference check on your real agent?</p>
        <p className="rc-hint">This runs Origin’s synthetic battery. To check your actual agent against your own policy and environment — as a design partner — book an evidence review.</p>
        <div className="rc-actions"><a className="btn btn--primary" href="/#contact" data-analytics="refcheck_book_click">Book an evidence review</a></div>
      </div>
    </div>
  )
}
