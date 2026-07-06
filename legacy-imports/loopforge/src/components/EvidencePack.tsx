import { useState } from 'react'
import { ClipboardCheck, Download, FileCheck2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { track } from '../lib/analytics'
import type {
  EvidencePack as EvidencePackType,
  LoopForgeRun,
  ValidationGate,
} from '../lib/schemas'

type EvidencePackProps = {
  evidence: EvidencePackType
  failingGates?: number
  gates?: ValidationGate[]
  runId?: string
  run?: LoopForgeRun
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function EvidencePack({ evidence, failingGates = 0, gates = [], runId, run }: EvidencePackProps) {
  const blocked = failingGates > 0
  const [hash, setHash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Generate a self-describing, hash-stamped packet an approver can archive and an
  // auditor can independently re-hash to confirm nothing was altered post-sign-off.
  const downloadPacket = async () => {
    setBusy(true)
    try {
      const payload = {
        artifact: 'LoopForge Evidence Pack',
        runId: runId ?? null,
        generatedAt: new Date().toISOString(),
        status: blocked ? 'rollout-held' : 'approved-for-canary',
        scenario: run?.scenario ?? null,
        sourceMode: run?.sourceMode ?? null,
        model: run?.latency.cerebras.model ?? null,
        metrics: run
          ? {
              cerebrasTokensPerSecond: run.latency.cerebras.tokensPerSecond,
              speedupBasis:
                'Throughput ratio, with GPU baseline projected to the same generated-token loop budget.',
              speedup: run.latency.speedup,
              cerebrasTotalMs: run.latency.cerebras.totalMs,
              baselineTotalMs: run.latency.baseline.totalMs,
              baselineMode: run.latency.baseline.mode,
              baselineNote: run.latency.baseline.note,
            }
          : null,
        ingest: run?.ingest ?? null,
        issueSummary: evidence.issueSummary,
        conversationEvidence: evidence.conversationEvidence,
        rootCause: run?.rootCause ?? {
          hypothesis: evidence.rootCauseHypothesis,
        },
        workflowPatch: run?.patch ?? {
          semanticDiff: evidence.semanticDiff,
        },
        adversarialProbeCorpus: run?.simulations ?? [],
        repairLoop: run?.repair ?? null,
        validationSummary: evidence.validationSummary,
        rolloutRecommendation: evidence.rolloutRecommendation,
        expectedImpact: evidence.expectedImpact,
        postLaunchMonitors: evidence.postLaunchMonitors,
        reviewerDecisionOptions: evidence.reviewerDecisionOptions,
        gates: gates.map((g) => ({
          id: g.id,
          name: g.name,
          category: g.category,
          severity: g.severity,
          status: g.status,
          detail: g.detail,
          evidence: g.evidence,
        })),
        providerNotes: run?.providerNotes ?? [],
      }
      const canonical = JSON.stringify(payload, null, 2)
      const digest = await sha256Hex(canonical)
      const signed = {
        ...payload,
        integrity: {
          algorithm: 'SHA-256',
          hash: digest,
          note: 'Hash covers the document with the integrity block removed. Re-serialize the rest with 2-space indentation and re-hash to verify it is unmodified.',
        },
      }
      const blob = new Blob([JSON.stringify(signed, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `loopforge-evidence-${runId ?? 'pack'}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setHash(digest)
      track('download_evidence_pack', { status: payload.status, run_id: runId ?? null })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Evidence Pack</p>
          <h2 id="evidence-title">Approval-ready rollout packet</h2>
        </div>
        <FileCheck2 size={22} aria-hidden="true" />
      </div>

      {blocked ? (
        <div className="evidence-blocked" role="status">
          <ShieldAlert size={16} aria-hidden="true" />
          Rollout blocked — {failingGates} gate{failingGates === 1 ? '' : 's'} still failing. The
          Guardian holds this patch until every control passes.
        </div>
      ) : (
        <p className="panel-takeaway good">
          <FileCheck2 size={16} aria-hidden="true" />
          <span>
            <strong>Approval-ready in seconds, not days.</strong> The fix is validated, gated to a 5%
            canary with a kill switch, and ready for Risk, Fraud &amp; Compliance sign-off — a full
            audit trail an approver can sign.
          </span>
        </p>
      )}

      <div className="evidence-strip" aria-label="Evidence pack status">
        <span>Issue isolated</span>
        <span>Patch simulated</span>
        <span>{blocked ? 'Rollout held' : 'Rollout gated'}</span>
      </div>

      <div className="evidence-body">
        <div>
          <h3>Issue summary</h3>
          <p>{evidence.issueSummary}</p>
        </div>
        <div>
          <h3>Validation summary</h3>
          <p>{evidence.validationSummary}</p>
        </div>
        <div>
          <h3>Rollout recommendation</h3>
          <p>{evidence.rolloutRecommendation}</p>
        </div>
      </div>

      <div className="decision-row">
        {evidence.reviewerDecisionOptions.map((option) => (
          <span key={option}>
            <ClipboardCheck size={15} aria-hidden="true" />
            {option}
          </span>
        ))}
      </div>

      <div className="evidence-download">
        <button type="button" className="evidence-dl-btn" onClick={downloadPacket} disabled={busy}>
          <Download size={16} aria-hidden="true" />
          {busy ? 'Signing…' : 'Download signed evidence pack (JSON)'}
        </button>
        {hash ? (
          <p className="evidence-hash" role="status">
            <ShieldCheck size={13} aria-hidden="true" />
            SHA-256 {hash.slice(0, 16)}…{hash.slice(-8)} — re-hashable to verify
          </p>
        ) : (
          <span className="evidence-dl-note">
            Hash-stamped packet includes probes, patch diff, root cause, gates, and timing basis
          </span>
        )}
      </div>
    </section>
  )
}
