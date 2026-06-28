// Phase 2 environment preview — the operator reviews the generated eval before
// running it: themed tasks, hazards/human-only zones, terminal labels, and the
// oracle assumptions that make the ground truth defensible.

import { useState } from 'react'
import { bfsOracle } from '../warehouse'
import { CaseBoard } from '../factorydad/components/CaseBoard'
import { warehouseTaskToCase } from '../factorydad/fromWarehouse'
import { evaluateDrawnSite } from '../siteEval'
import { MultiRobotSim } from './MultiRobotSim'
import { StepBridge } from './StepBridge'
import type { EnvironmentPlan } from '../environmentPlan'
import type { FrozenWorkflow } from '../workflowDraft'

const LABEL_CLASS: Record<string, string> = {
  finish: 'lbl-finish',
  escalate: 'lbl-escalate',
  refuse: 'lbl-refuse',
}

export function EnvironmentPreview({
  plan,
  frozen,
  onRun,
  onBack,
}: {
  plan: EnvironmentPlan
  frozen?: FrozenWorkflow | null
  onRun: () => void
  onBack: () => void
}) {
  const { theme, profile, tasks, labelCounts, requirement } = plan

  // The operator's OWN drawn floor, scored by the same oracle — featured first so
  // the simulation they watch reflects the walls/hazards they placed.
  const drawn = frozen?.siteMap ? evaluateDrawnSite(frozen.siteMap, requirement.embodiment) : null
  const drawnTask = drawn?.task ?? null

  // Feature the finish task with the longest safe path — the most robot movement
  // to watch on the user's own generated floor.
  const featured =
    [...tasks]
      .filter((t) => bfsOracle(t).label === 'finish')
      .sort((a, b) => bfsOracle(b).optimalPath.length - bfsOracle(a).optimalPath.length)[0] ?? tasks[0]
  const [simId, setSimId] = useState(drawnTask ? drawnTask.id : featured.id)
  const simTask =
    drawnTask && simId === drawnTask.id ? drawnTask : tasks.find((t) => t.id === simId) ?? tasks[0]

  // The operator's drawn fleet — when they placed robots, the "Your floor" sim shows
  // the SAME multi-robot animation as the proving ground (one shared component).
  const fleetRobots = frozen?.siteMap?.robots?.length ?? 0
  const fleetMulti = fleetRobots > 0
  const showFleet = !!drawnTask && !!frozen?.siteMap && simId === drawnTask.id && fleetMulti

  return (
    <section className="preview">
      <div className="intake-head">
        <button className="btn ghost back" onClick={onBack}>
          ← Edit inputs
        </button>
        <div>
          <div className="section-title">Your readiness gym · {theme.label}</div>
          <h2>{requirement.outcome}</h2>
        </div>
      </div>

      <p className="preview-lead">
        Origin turned your site into a deterministic test gym. Before a robot earns the right to move
        near people, it has to clear every scenario below — and you walk away with one readiness call
        you can hand a safety team: <span className="lbl-finish">what it may do on its own</span>,{' '}
        <span className="lbl-escalate">where it must ask a human</span>, and{' '}
        <span className="lbl-refuse">what it must refuse outright</span>.
      </p>

      <StepBridge done="Your floor simulated end to end" next="review the full gym below, then run the license eval — deterministic, no model spend." />

      {frozen && (
        <div className="frozen-banner">
          <div>
            <div className="panel-kicker">Approved setup is sealed</div>
            <strong>Locked into an immutable snapshot — the gym scores this exact setup.</strong>
            <p>{frozen.frozenWorkflowSummary}</p>
          </div>
          <div
            className="seal-pill"
            title="A fingerprint of the exact facts you approved. The score is bound to this — if anything changes, the seal changes too. Tamper-evident."
          >
            <span className="seal-pill-k">🔒 Approval seal</span>
            <code>{frozen.approvedFactsHash}</code>
          </div>
        </div>
      )}

      <div className="preview-meta">
        <div className="preview-card">
          <div className="panel-kicker">Plan</div>
          <p className="preview-line">
            <strong>{tasks.length}</strong> tasks · <strong>{profile.label}</strong> embodiment
          </p>
          <p className="preview-evalid" title="The deterministic test run scored against your sealed snapshot.">
            Eval plan · <code>{plan.id}</code>
          </p>
          <div className="preview-counts">
            <span className="lbl-finish">{labelCounts.finish} finish</span>
            <span className="lbl-escalate">{labelCounts.escalate} escalate</span>
            <span className="lbl-refuse">{labelCounts.refuse} refuse</span>
          </div>
        </div>
        <div className="preview-card">
          <div className="panel-kicker">Domain vocabulary</div>
          <ul className="preview-vocab">
            <li>
              <span>Item</span>
              {theme.itemTerm}
            </li>
            <li>
              <span>Hazard</span>
              {theme.hazardTerm}
            </li>
            <li>
              <span>Human-only</span>
              {theme.humanOnlyTerm}
            </li>
          </ul>
        </div>
        <div className="preview-card">
          <div className="panel-kicker">Oracle assumptions</div>
          <ul className="preview-assumptions">
            {plan.oracleAssumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </div>

      {plan.workflow && (
        <div className="workflow-map-panel">
          <div className="panel-kicker">Mapped from your approved workflow</div>
          <div className="workflow-map-grid">
            <p>{plan.workflow.inputManifestSummary}</p>
            <p>{plan.workflow.frozenWorkflowSummary}</p>
            <span>{plan.workflow.selectedTaskIds.length} canonical task(s) selected</span>
          </div>
        </div>
      )}

      <div className="preview-sim">
        <div className="panel-kicker">Simulate the license test · your robots in the proving ground</div>
        <p className="preview-sim-sub">
          Watch your fleet scan, navigate the hazards on your floor, and earn the call —
          finish, escalate, or refuse. A deterministic readiness simulation (not a physics
          simulator); the oracle decides, no model spend.
        </p>
        <div className="sim-chips">
          {drawnTask && drawn && (
            <button
              className={`sim-chip ${simId === drawnTask.id ? 'on' : ''}`}
              onClick={() => setSimId(drawnTask.id)}
            >
              Your floor{fleetMulti ? ` · ${fleetRobots} robot${fleetRobots === 1 ? '' : 's'}` : ''}{' '}
              <span className={LABEL_CLASS[drawn.verdict]}>{drawn.verdict}</span>
            </button>
          )}
          {tasks.map((t) => {
            const l = bfsOracle(t).label
            return (
              <button
                key={t.id}
                className={`sim-chip ${t.id === simId ? 'on' : ''}`}
                onClick={() => setSimId(t.id)}
              >
                {t.title} <span className={LABEL_CLASS[l]}>{l}</span>
              </button>
            )
          })}
        </div>
        {showFleet ? (
          <div className="simulation-stage">
            <MultiRobotSim siteMap={frozen!.siteMap} verdictLabel={drawn?.verdict} embodiment={frozen!.embodiment} />
          </div>
        ) : (
          <CaseBoard key={simTask.id} caseData={warehouseTaskToCase(simTask)} auto loop />
        )}
      </div>

      <div className="preview-tasks">
        <div className="ptask-row ptask-head">
          <span>Task</span>
          <span>Level</span>
          <span>Oracle</span>
          <span>Battery</span>
          <span>Steps</span>
          <span>Hazards</span>
          <span>Human-only</span>
        </div>
        {tasks.map((task) => {
          const label = bfsOracle(task).label
          return (
            <div className="ptask-row" key={task.id}>
              <span className="ptask-title">{task.title}</span>
              <span>{task.level}</span>
              <span className={LABEL_CLASS[label]}>{label}</span>
              <span>{task.battery}</span>
              <span>{task.maxSteps}</span>
              <span>{task.hazards.length}</span>
              <span>{task.humanOnly.length}</span>
            </div>
          )
        })}
      </div>

      <div className="run-cta">
        <div className="run-cta-text">
          <div className="panel-kicker">Last step</div>
          <h3>Run the readiness test</h3>
          <p>
            Scores blind baselines and the calibrated oracle through the deterministic verifier —{' '}
            <strong>no model calls, no spend</strong>. You get the finish / escalate / refuse
            breakdown and the readiness tier for this floor.
          </p>
        </div>
        <button className="btn primary run-cta-btn" onClick={onRun}>
          <span className="run-cta-play" aria-hidden="true">▶</span>
          <span className="run-cta-main">Run license eval</span>
          <span className="run-cta-tag">deterministic · no spend</span>
        </button>
      </div>
    </section>
  )
}
