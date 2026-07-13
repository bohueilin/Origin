// The buyer reference-check flow — a real product surface, not a fixed demo.
// A buyer describes their agent (config, bound into the credential) and their IAM
// policy posture (presets or toggles), runs it through the deterministic
// least-privilege gym, and gets: an RSL readiness level, the before/after lift, a
// per-decision breakdown that shows exactly where the policy over-grants, and a
// signed, config-bound credential they can download and re-verify offline on /verify.
//
// The deterministic oracle is the only label authority (never an LLM). "Certified"
// means reproducible least-privilege behavior under THIS verifier + THIS config —
// never "safe". The signing key here is generated in-session for offline integrity;
// production issues under Origin's pinned issuer key.
import { useMemo, useState } from 'react'
import {
  issueIamReferenceCheck,
  iamTasks,
  iamOracle,
  verifyIamDecision,
  iamEnvDigest,
  IAM_VERSIONS,
} from '@origin/verifier-core/iamGym'
import { verifyCredential } from '@origin/verifier-core/crucible'
import { generateSigningKey, signSigil, keyThumbprint } from '@origin/verifier-core/sigil'
import { computeLicenseFromVerdicts, type LicenseVerdict } from '../license'

type Decision = 'allow' | 'deny' | 'escalate'
type Classification = 'low' | 'medium' | 'high' | 'forbidden'

interface PolicySpec {
  honorRoleAllowlist: boolean
  denyForbidden: boolean
  denyTainted: boolean
  escalateOnApproval: boolean
  autoAllowUpTo: Classification
}

interface AgentConfig {
  model: string
  tools: string
  context: string
  harness: string
}

const CLASS_ORDER: Record<Classification, number> = { low: 0, medium: 1, high: 2, forbidden: 3 }

// Build a decision function from the buyer's declared policy posture. This is a
// faithful least-privilege interpreter: each guard the buyer leaves OFF is a way
// their agent can over-grant, which the oracle then catches.
function policyForSpec(spec: PolicySpec) {
  return (task: (typeof iamTasks)[number]): Decision => {
    if (spec.denyForbidden && task.resource.classification === 'forbidden') return 'deny'
    if (spec.denyTainted && task.principal.tainted) return 'deny'
    if (spec.honorRoleAllowlist && !task.policy.allowed_roles.includes(task.principal.role)) return 'deny'
    if (spec.escalateOnApproval && task.policy.requires_approval) return 'escalate'
    if (CLASS_ORDER[task.resource.classification as Classification] > CLASS_ORDER[spec.autoAllowUpTo])
      return 'escalate'
    return 'allow'
  }
}

const PRESETS: Record<string, { label: string; blurb: string; spec: PolicySpec }> = {
  'least-privilege': {
    label: 'Least-privilege (recommended)',
    blurb: 'Every guard on; auto-allow only up to medium. The posture that earns a high RSL.',
    spec: { honorRoleAllowlist: true, denyForbidden: true, denyTainted: true, escalateOnApproval: true, autoAllowUpTo: 'medium' },
  },
  moderate: {
    label: 'Moderate',
    blurb: 'Role allow-list + forbidden + tainted enforced, but auto-allows high-value actions without escalation.',
    spec: { honorRoleAllowlist: true, denyForbidden: true, denyTainted: false, escalateOnApproval: false, autoAllowUpTo: 'high' },
  },
  permissive: {
    label: 'Permissive (the dangerous baseline)',
    blurb: 'Guards off — the naive over-granting agent. Expect catastrophic over-grants and a capped RSL.',
    spec: { honorRoleAllowlist: false, denyForbidden: false, denyTainted: false, escalateOnApproval: false, autoAllowUpTo: 'forbidden' },
  },
}

const computeLevel = (verdicts: LicenseVerdict[]) => computeLicenseFromVerdicts(verdicts).level.id
const short = (s: string) => (s ? `${s.slice(0, 10)}…` : '')

interface RowResult {
  id: string
  resource: string
  classification: Classification
  yours: Decision
  oracle: Decision
  passed: boolean
  catastrophic: boolean
}

interface RunResult {
  rsl: string
  passRate: number
  coldPassRate: number
  lift: number
  catastrophic: number
  configDigest: string
  rows: RowResult[]
  credential: unknown
  reVerifyCode: number
  sigil: unknown
  sigilThumbprint: string
}

export function ReferenceCheckPage() {
  const [agent, setAgent] = useState<AgentConfig>({
    model: 'my-agent-v1',
    tools: 'iam.decide, data.read',
    context: 'system-prompt@1',
    harness: 'my-harness@1',
  })
  const [spec, setSpec] = useState<PolicySpec>(PRESETS['least-privilege'].spec)
  const [presetKey, setPresetKey] = useState<string>('least-privilege')
  const [result, setResult] = useState<RunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const agentConfig = useMemo(
    () => ({
      model: agent.model.trim() || 'unnamed-agent',
      tools: agent.tools.split(',').map((t) => t.trim()).filter(Boolean),
      context: agent.context.trim() || 'none',
      harness: agent.harness.trim() || 'none',
    }),
    [agent],
  )

  const applyPreset = (key: string) => {
    setPresetKey(key)
    if (PRESETS[key]) setSpec(PRESETS[key].spec)
  }
  const toggle = (k: keyof PolicySpec) => {
    setPresetKey('custom')
    setSpec((s) => ({ ...s, [k]: !s[k as keyof PolicySpec] }))
  }

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const policyFor = policyForSpec(spec)
      // Per-decision breakdown (the buyer sees exactly where their policy over-grants).
      const rows: RowResult[] = iamTasks.map((task) => {
        const yours = policyFor(task)
        const oracle = iamOracle(task).decision as Decision
        const v = verifyIamDecision(task, yours)
        return {
          id: task.id,
          resource: task.resource.id,
          classification: task.resource.classification as Classification,
          yours,
          oracle,
          passed: v.passed,
          catastrophic: v.catastrophic,
        }
      })
      // The product API: mint the config-bound credential + RSL + lift.
      const r = issueIamReferenceCheck({ agentConfig, policyFor, computeLevel, issuedAt: null })
      // Independently re-verify it against the live config (proves it round-trips).
      const rv = verifyCredential({
        credential: r.credential,
        liveConfig: agentConfig,
        envBundleDigest: iamEnvDigest(),
        versions: IAM_VERSIONS,
      })
      // Sign it into a downloadable Sigil (in-session key; offline-verifiable).
      const keyPair = await generateSigningKey()
      const sigil = await signSigil(r.credential, keyPair, { issuer: 'origin-reference-check', kind: 'credential' })
      const thumb = await keyThumbprint(sigil.pubkey_jwk)
      setResult({
        rsl: r.credential.rsl_level,
        passRate: r.credential.pass_rate,
        coldPassRate: r.credential.cold_pass_rate,
        lift: r.credential.lift,
        catastrophic: r.catastrophic,
        configDigest: r.credential.config_digest,
        rows,
        credential: r.credential,
        reVerifyCode: rv.code,
        sigil,
        sigilThumbprint: thumb,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const download = (obj: unknown, name: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const verdictClass = result && result.catastrophic > 0 ? 'rc-verdict--warn' : 'rc-verdict--ok'

  return (
    <div className="rc-grid">
      {/* ── 1 · Configure the agent ── */}
      <div className="rc-card">
        <p className="rc-step">1 · Your agent</p>
        <p className="rc-hint">
          These values are hashed into the credential — change the model, tools, context, or harness
          later and the credential <b>voids</b> (that is the point: a certificate can’t be carried onto
          a different agent).
        </p>
        <div className="rc-fields">
          <label className="rc-field">
            <span>Model</span>
            <input value={agent.model} onChange={(e) => setAgent({ ...agent, model: e.target.value })} />
          </label>
          <label className="rc-field">
            <span>Tools (comma-separated)</span>
            <input value={agent.tools} onChange={(e) => setAgent({ ...agent, tools: e.target.value })} />
          </label>
          <label className="rc-field">
            <span>Context / system prompt id</span>
            <input value={agent.context} onChange={(e) => setAgent({ ...agent, context: e.target.value })} />
          </label>
          <label className="rc-field">
            <span>Harness</span>
            <input value={agent.harness} onChange={(e) => setAgent({ ...agent, harness: e.target.value })} />
          </label>
        </div>
      </div>

      {/* ── 2 · Declare the policy posture ── */}
      <div className="rc-card">
        <p className="rc-step">2 · Your IAM policy posture</p>
        <p className="rc-hint">
          Pick a preset or toggle the guards. The gym runs {iamTasks.length} least-privilege access
          decisions; each guard you leave <b>off</b> is a way your agent can over-grant, which the
          deterministic oracle catches.
        </p>
        <div className="rc-presets">
          {Object.entries(PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              className={`rc-preset${presetKey === key ? ' is-on' : ''}`}
              onClick={() => applyPreset(key)}
            >
              <b>{p.label}</b>
              <span>{p.blurb}</span>
            </button>
          ))}
        </div>
        <div className="rc-toggles">
          <label className="rc-toggle">
            <input type="checkbox" checked={spec.honorRoleAllowlist} onChange={() => toggle('honorRoleAllowlist')} />
            Honor the role allow-list (deny off-role principals)
          </label>
          <label className="rc-toggle">
            <input type="checkbox" checked={spec.denyForbidden} onChange={() => toggle('denyForbidden')} />
            Deny categorically forbidden resources
          </label>
          <label className="rc-toggle">
            <input type="checkbox" checked={spec.denyTainted} onChange={() => toggle('denyTainted')} />
            Deny tainted principals (prompt-injection posture)
          </label>
          <label className="rc-toggle">
            <input type="checkbox" checked={spec.escalateOnApproval} onChange={() => toggle('escalateOnApproval')} />
            Escalate approval-gated actions to a human
          </label>
          <label className="rc-toggle rc-toggle--select">
            <span>Auto-allow up to classification</span>
            <select
              value={spec.autoAllowUpTo}
              onChange={(e) => {
                setPresetKey('custom')
                setSpec((s) => ({ ...s, autoAllowUpTo: e.target.value as Classification }))
              }}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="forbidden">forbidden (never recommended)</option>
            </select>
          </label>
        </div>
        <div className="rc-actions">
          <button className="btn btn--primary" onClick={run} disabled={busy}>
            {busy ? 'Running the gym…' : 'Run the reference check'}
          </button>
        </div>
        {error ? <p className="rc-error">Error: {error}</p> : null}
      </div>

      {/* ── 3 · The verdict ── */}
      {result ? (
        <div className="rc-card">
          <p className="rc-step">3 · Your reference check</p>
          <div className={`rc-verdict ${verdictClass}`}>
            <b>{result.rsl}</b>
            <span>RSL readiness level</span>
            <span className="rc-verdict__meta">
              passed {Math.round(result.passRate * 100)}% · cold baseline {Math.round(result.coldPassRate * 100)}% ·
              lift +{Math.round(result.lift * 100)}% · config {short(result.configDigest)}
            </span>
          </div>
          {result.catastrophic > 0 ? (
            <p className="rc-hint rc-hint--warn">
              <b>{result.catastrophic} catastrophic over-grant{result.catastrophic > 1 ? 's' : ''}</b> —
              your policy allowed a forbidden / tainted / high-sensitivity action the oracle refuses. A
              single catastrophic over-grant caps the RSL: the right to act can’t be averaged back.
            </p>
          ) : (
            <p className="rc-hint">
              No catastrophic over-grants — the credential re-verified independently
              {result.reVerifyCode === 0 ? ' (code 0)' : ` (code ${result.reVerifyCode})`}.
            </p>
          )}

          <div className="rc-scroll">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Decision</th>
                  <th>Resource</th>
                  <th>Class</th>
                  <th>Your agent</th>
                  <th>Oracle</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.id} className={r.catastrophic ? 'rc-row--cat' : r.passed ? '' : 'rc-row--miss'}>
                    <td><code>{r.id}</code></td>
                    <td><b>{r.resource}</b></td>
                    <td>{r.classification}</td>
                    <td>{r.yours}</td>
                    <td>{r.oracle}</td>
                    <td>
                      {r.catastrophic ? '⛔ over-grant' : r.passed ? '✓ match' : '△ miss'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 4 · Download + verify ── */}
          <p className="rc-step" style={{ marginTop: 26 }}>4 · Take the evidence with you</p>
          <div className="rc-actions">
            <button className="btn btn--primary btn--sm" onClick={() => download(result.sigil, 'reference-check.sigil.json')}>
              Download the signed Sigil
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => download(result.credential, 'reference-check.credential.json')}>
              Download the credential
            </button>
            <a className="btn btn--ghost btn--sm" href="/verify">
              Re-verify it on /verify →
            </a>
          </div>
          <p className="rc-hint">
            The Sigil is signed with an in-session key (thumbprint <code>{short(result.sigilThumbprint)}</code>)
            for offline integrity — paste the downloaded file into <a href="/verify">/verify</a> and it
            re-checks in your browser: green means reproducible under this verifier + config, tamper any
            field and it goes VOID. <b>Production issues under Origin’s pinned issuer key.</b> This is a
            synthetic pilot battery; real design-partner evidence stays blocked until authorized.
          </p>
        </div>
      ) : null}

      {/* ── Book ── */}
      <div className="rc-card rc-card--cta">
        <p className="rc-step">Want a reference check on your real agent?</p>
        <p className="rc-hint">
          This runs Origin’s synthetic IAM battery. To certify your actual agent against your own
          least-privilege policy and environment — as a design partner — book an evidence review.
        </p>
        <div className="rc-actions">
          <a className="btn btn--primary" href="/#offer" data-analytics="refcheck_book_click">
            Book a reference check
          </a>
        </div>
      </div>
    </div>
  )
}
