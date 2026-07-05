// Phase 2 license results — reuses the existing demo outputs, scoped to the
// generated plan: triptych, FAR/FRR baseline board, confusion matrix, reward-
// hacking trace, Signal Extractor counts, and a readiness/license summary.

import { useState } from 'react'
import { computeLicenseFromVerdicts, type LicenseVerdict } from '../license'
import { bfsOracle, type WarehouseDemo, type WarehouseRollout } from '../warehouse'
import type { EnvironmentPlan } from '../environmentPlan'
import { buildPhysicalAiLicenseReport } from '../licenseReport'
import { persistWarehouseReference } from '../serverEpisodeClient'
import type { FrozenWorkflow } from '../workflowDraft'
import { MatrixMini, TriptychCard } from './warehouseViz'
import { StepBridge } from './StepBridge'
import { TrustChain } from './TrustChain'
import { TrustStack } from './brain/TrustStack'
import { PolicyProgression } from './PolicyProgression'
import { DrawnFloorEval } from './DrawnFloorEval'
import { actionTrace, pct } from '../format'

function toVerdicts(rollouts: readonly WarehouseRollout[]): LicenseVerdict[] {
  return rollouts.map((r) => ({
    passed: r.passed,
    reward: r.reward,
    catastrophic: r.category === 'unsafe_zone' || r.falseAccept,
  }))
}

function reportFilename(reportId: string): string {
  return `${reportId.replace(/[^a-z0-9_-]+/gi, '_')}.json`
}

export function LicenseResults({
  plan,
  frozen,
  demo,
  onRefine,
  onRestart,
  onSample,
}: {
  plan: EnvironmentPlan
  frozen?: FrozenWorkflow | null
  demo: WarehouseDemo
  onRefine: () => void
  onRestart: () => void
  onSample: () => void
}) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const oracle = demo.baselines.find((b) => b.name === 'calibrated oracle') ?? demo.baselines[0]
  const license = computeLicenseFromVerdicts(toVerdicts(oracle.rollouts))
  const report = buildPhysicalAiLicenseReport(plan, demo)
  const reportJson = JSON.stringify(report, null, 2)

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportJson)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  function downloadReport() {
    const blob = new Blob([reportJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = reportFilename(report.reportId)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // Persist ONE representative server-owned reference episode (calibrated oracle).
  // Prefer a finish task so the evidence shows a passing autonomous run; else the
  // first task. The browser sends only descriptive context + trusted enums; the
  // server computes oracle/reward/evidence.
  const referenceTask = plan.tasks.find((t) => bfsOracle(t).label === 'finish') ?? plan.tasks[0]
  const [persistStatus, setPersistStatus] = useState<
    'idle' | 'saving' | 'saved' | 'local_only' | 'unavailable'
  >('idle')
  const [persistDetail, setPersistDetail] = useState<string | null>(null)

  async function persistReference() {
    if (persistStatus === 'saving') return
    setPersistStatus('saving')
    setPersistDetail(null)
    const res = await persistWarehouseReference({
      taskId: referenceTask.id,
      domain: plan.requirement.domain,
      embodiment: plan.requirement.embodiment,
      planId: plan.id,
      requirementSummary: plan.requirement.outcome,
      approvedFactsHash: plan.workflow?.approvedFactsHash ?? undefined,
      inputManifestSummary: plan.workflow?.inputManifestSummary ?? undefined,
      frozenWorkflowSummary: plan.workflow?.frozenWorkflowSummary ?? undefined,
    })
    setPersistStatus(res.status)
    const id = res.recordId ? ` · ${res.recordId}` : ''
    setPersistDetail(`${res.taskId} · ${res.category} · reward ${res.reward.toFixed(2)}${id}`)
  }

  const persistLabel =
    persistStatus === 'saving'
      ? 'Persisting…'
      : persistStatus === 'saved'
        ? 'Reference evidence saved'
        : persistStatus === 'local_only'
          ? 'Saved locally (no evidence store)'
          : persistStatus === 'unavailable'
            ? 'Evidence server unavailable'
            : 'Persist reference evidence'

  return (
    <section className="results">
      <div className="intake-head">
        <button className="btn ghost back" onClick={onRefine}>
          ← Adjust environment
        </button>
        <div>
          <div className="section-title">
            Verification report · {plan.theme.label} · {plan.profile.label}
          </div>
          <h2>{plan.requirement.outcome}</h2>
        </div>
      </div>

      <StepBridge done="Verified against telemetry — finish / escalate / refuse, with unsafe- & missed-action rates" next="this is your verification report — hand it to a safety team." />

      <div className="license-cert" style={{ borderColor: license.level.color }}>
        <div className="cert-seal" style={{ background: license.level.color }}>
          <span className="cert-tier">{license.level.id}</span>
          <span className="cert-seal-sub">VERIFIED</span>
        </div>
        <div className="cert-main">
          <div className="cert-eyebrow">Verified readiness · evidence pack</div>
          <div className="cert-title" style={{ color: license.level.color }}>
            {license.level.name}
          </div>
          <div className="cert-meta">
            <span>
              Issued for <strong>{plan.theme.label}</strong> · <strong>{plan.profile.label}</strong>
            </span>
            <span>
              Reference operating point{' '}
              <strong>unsafe {pct(report.calibration.far)}</strong> ·{' '}
              <strong>missed {pct(report.calibration.frr)}</strong>
            </span>
          </div>
          <div className="cert-chain" aria-label="Evidence provenance">
            <span>Inputs declared</span>
            <span className="cert-arrow" aria-hidden="true">→</span>
            <span>Confirmed by you</span>
            <span className="cert-arrow" aria-hidden="true">→</span>
            <span>Eval frozen</span>
            <span className="cert-arrow" aria-hidden="true">→</span>
            <span className="cert-scored">Verified against telemetry</span>
          </div>
        </div>
        <div className="cert-side">
          <span className="cert-id" title="The deterministic run this report verifies.">
            <em>Eval plan</em> {report.reportId}
          </span>
          {(plan.workflow?.approvedFactsHash || frozen?.approvedFactsHash) && (
            <span
              className="cert-hash"
              title="A fingerprint of the exact facts you approved — the score is bound to this, tamper-evident."
            >
              <em>🔒 Approval seal</em> {plan.workflow?.approvedFactsHash ?? frozen?.approvedFactsHash}
            </span>
          )}
          <span className="cert-note">Not a regulatory certification</span>
        </div>
      </div>

      <div className="agent-under-test" role="note">
        <span className="aut-badge">Agent under test</span>
        <p>
          Integration pending — the reference run is shown as the bar to clear, not a robot’s
          actual score. A model-under-test plugs in here and re-verifies on every change.
        </p>
      </div>

      <div className="results-summary">
        <div className="results-license" style={{ borderColor: license.level.color }}>
          <span className="chip-badge" style={{ background: license.level.color }}>
            {license.level.id}
          </span>
          <div>
            <div className="chip-eyebrow">Reference ceiling for this environment</div>
            <div className="license-name" style={{ color: license.level.color }}>
              {license.level.name}
            </div>
            <p className="results-license-note">
              The calibrated reference reaches this tier here. A real model is verified against the same
              env via the model path (next phase); no model has been run yet.
            </p>
          </div>
        </div>
        <div className="results-decision">
          <div className="panel-kicker">Reference readiness</div>
          <div className={`decision-badge decision-${report.decision}`}>{report.decisionLabel}</div>
          <p>{report.summary}</p>
          <div className="decision-metrics">
            <span>unsafe {pct(report.calibration.far)}</span>
            <span>missed {pct(report.calibration.frr)}</span>
            <span>Avg {report.calibration.avgReward.toFixed(2)}</span>
          </div>
        </div>
        <div className="results-readiness">
          <div className="panel-kicker">Readiness read-out</div>
          <ul>
            <li>
              <span className="lbl-finish">May do autonomously</span> tasks verification labels{' '}
              <strong>finish</strong> ({plan.labelCounts.finish})
            </li>
            <li>
              <span className="lbl-escalate">Must escalate</span> when no safe route fits the robot
              budget ({plan.labelCounts.escalate})
            </li>
            <li>
              <span className="lbl-refuse">Must refuse</span> hazard / human-only targets (
              {plan.labelCounts.refuse})
            </li>
          </ul>
        </div>
      </div>

      <TrustStack
        data={{
          feasibility: {
            failureTags: report.trainingData.failureTags,
          },
          safety: {
            hazardCells: report.safetyEnvelope.hazardCells,
            humanOnlyCells: report.safetyEnvelope.humanOnlyCells,
            taskClasses: report.safetyEnvelope.taskClasses,
          },
          permission: {
            finish: plan.labelCounts.finish,
            escalate: plan.labelCounts.escalate,
            refuse: plan.labelCounts.refuse,
            far: report.calibration.far,
            frr: report.calibration.frr,
          },
          readiness: {
            tierId: license.level.id,
            tierName: license.level.name,
            color: license.level.color,
            decisionLabel: report.decisionLabel,
          },
        }}
      />

      <TrustChain compact />

      {frozen?.siteMap && (
        <DrawnFloorEval
          siteMap={frozen.siteMap}
          embodiment={plan.requirement.embodiment}
          hazardTerm={plan.theme.hazardTerm}
          humanOnlyTerm={plan.theme.humanOnlyTerm}
        />
      )}

      <PolicyProgression demo={demo} />

      <div className="report-strip">
        <div className="report-card">
          <div className="panel-kicker">Operating envelope</div>
          <ul>
            {report.operatingEnvelope.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="report-card">
          <div className="panel-kicker">Pilot next steps</div>
          <ol>
            {report.nextSteps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>
        <div className="report-card">
          <div className="panel-kicker">Safety envelope &amp; failure modes</div>
          <p className="report-fact">
            <strong>{report.safetyEnvelope.hazardCells}</strong> hazard cells ·{' '}
            <strong>{report.safetyEnvelope.humanOnlyCells}</strong> human-only cells across{' '}
            <strong>{report.safetyEnvelope.taskClasses}</strong> task class(es) the robot must route around.
          </p>
          {report.failureModes.length > 0 && (
            <div className="failure-modes">
              {report.failureModes.map((f) => (
                <span className="fm-chip" key={f.tag}>
                  {f.tag} <b>×{f.count}</b>
                </span>
              ))}
            </div>
          )}
          <p className="signal-note">
            Failure categories the deterministic verifier caught across evaluated policies — not an
            LLM’s judgement.
          </p>
        </div>
        <details className="report-card report-json">
          <summary>
            <span>
              Report JSON · {report.trainingData.failureTags} tags ·{' '}
              {report.trainingData.preferencePairs} pairs · {report.trainingData.rewardRows} reward rows
            </span>
          </summary>
          <div className="report-actions">
            <button className="btn" onClick={copyReport}>
              Copy JSON
            </button>
            <button className="btn ghost" onClick={downloadReport}>
              Download
            </button>
            <span className={`copy-status copy-${copyStatus}`}>
              {copyStatus === 'copied'
                ? 'Copied'
                : copyStatus === 'failed'
                  ? 'Clipboard unavailable'
                  : reportFilename(report.reportId)}
            </span>
          </div>
          <pre>{reportJson}</pre>
        </details>
      </div>

      <p className="report-disclaimer">{report.disclaimer}</p>

      {(frozen || plan.workflow) && (
        <div className="provenance-strip">
          <div>
            <span>1</span>
            Inputs declared
            <small>{plan.workflow?.inputManifestSummary ?? 'Local metadata only'}</small>
          </div>
          <div>
            <span>2</span>
            Facts confirmed
            <small title="A fingerprint of the exact facts you approved — tamper-evident.">
              Approval seal · {plan.workflow?.approvedFactsHash ?? frozen?.approvedFactsHash}
            </small>
          </div>
          <div>
            <span>3</span>
            Eval frozen
            <small>Canonical tasks only; verified labels untouched</small>
          </div>
          <div>
            <span>4</span>
            Safety case
            <small>unsafe-/missed-action rates + reward gates + evidence</small>
          </div>
        </div>
      )}

      <div className="persist-strip">
        <div>
          <div className="panel-kicker">Evidence bridge</div>
          <p>
            Persist <strong>one representative</strong> calibrated-oracle episode (task{' '}
            <code>{referenceTask.id}</code>) to the server-authoritative warehouse gym and
            tamper-evident store. This is a single reference run — not the full generated plan.
          </p>
          {persistDetail && <p className="persist-detail">{persistDetail}</p>}
        </div>
        <div className="persist-actions">
          <button
            className="btn primary"
            onClick={persistReference}
            disabled={persistStatus === 'saving'}
          >
            {persistLabel}
          </button>
          <span className={`persist-status persist-${persistStatus}`}>
            {persistStatus === 'saved'
              ? 'saved'
              : persistStatus === 'local_only'
                ? 'local only'
                : persistStatus === 'unavailable'
                  ? 'unavailable'
                  : ''}
          </span>
        </div>
      </div>

      <div className="triptych">
        {demo.triptych.map((item) => (
          <TriptychCard
            key={item.slot}
            slot={item.slot}
            title={item.title}
            line={item.line}
            rollout={item.rollout}
          />
        ))}
      </div>

      <div className="warehouse-grid">
        <div className="warehouse-panel">
          <div className="panel-kicker">Headline calibration (unsafe / missed action)</div>
          <div className="baseline-list">
            {demo.baselines.map((b) => (
              <div className="baseline-row" key={b.name}>
                <span>{b.name}</span>
                <span>unsafe {pct(b.matrix.far)}</span>
                <span>missed {pct(b.matrix.frr)}</span>
                <span>avg {b.avgReward.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <MatrixMini matrix={oracle.matrix} />
        </div>

        <div className="warehouse-panel">
          <div className="panel-kicker">Faked-finish trace</div>
          <h3>{demo.rewardHack.task.title}</h3>
          <p>
            A fake terminal finish without pick/drop gets outcome 0, so shaping cannot rescue it:
            reward {demo.rewardHack.reward.toFixed(2)}.
          </p>
          <p className="trip-trace">{actionTrace(demo.rewardHack.actions)}</p>
          <div className="trip-stats">
            <span>{demo.rewardHack.category}</span>
            <span>verified {demo.rewardHack.expected}</span>
            <span>actual {demo.rewardHack.matrixAction}</span>
          </div>
        </div>

        <div className="warehouse-panel">
          <div className="panel-kicker">Training signal</div>
          <div className="signal-grid">
            <span>{demo.signal.failureTags.length}</span>
            <span>failure tags</span>
            <span>{demo.signal.preferencePairs.length}</span>
            <span>preference pairs</span>
            <span>{demo.signal.rewardViews.length}</span>
            <span>reward rows</span>
          </div>
          {report.samplePreference && (
            <div className="pref-pair" aria-label="Sample preference pair">
              <div className="pref-row pref-good">
                <span>verification preferred</span>
                <code>{actionTrace(report.samplePreference.preferred)}</code>
              </div>
              <div className="pref-row pref-bad">
                <span>policy did</span>
                <code>{actionTrace(report.samplePreference.rejected)}</code>
              </div>
            </div>
          )}
          <p className="signal-note">
            A training starter set for the next RL pass — failure-derived rows and preference pairs.
            Not used to train anything here.
          </p>
        </div>

        <div className="warehouse-panel aiuc-panel">
          <div className="panel-kicker">AIUC wedge</div>
          <p>{demo.aiucWedge}</p>
          <p className="signal-note">
            Generated client-side from evidence-backed verification. Evidence persistence + a live model
            path plug into this report in the next phase.
          </p>
        </div>
      </div>

      <div className="intake-cta">
        <button className="btn" onClick={onRestart}>
          Start a new eval
        </button>
        <button className="btn ghost" onClick={onSample}>
          View sample warehouse demo
        </button>
      </div>
    </section>
  )
}
