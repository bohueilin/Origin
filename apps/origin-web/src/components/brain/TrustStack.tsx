// The Trust Stack — one ladder, one spine. The report can read like two scoring
// systems (the brain's verifier feasibility/safety checks vs. Origin's
// finish/escalate/refuse + RSL license). This collapses them into ONE story:
// four rungs that must each hold before the next is even asked. It renders from
// values the deterministic oracle/verifier already produced — it does NOT
// re-derive any score (the oracle remains the only judge).

import { pct } from '../../format'

export interface TrustStackData {
  feasibility: { failureTags: number }
  safety: { hazardCells: number; humanOnlyCells: number; taskClasses: number }
  permission: { finish: number; escalate: number; refuse: number; far: number; frr: number }
  readiness: { tierId: string; tierName: string; color: string; decisionLabel: string }
}

export function TrustStack({ data }: { data: TrustStackData }) {
  const { feasibility, safety, permission, readiness } = data
  return (
    <div className="trust-stack" aria-label="Trust stack — feasibility to safety to permission to readiness">
      <div className="ts-head">
        <div className="panel-kicker">Trust stack</div>
        <h3>One spine, four rungs — each must hold before the next is asked.</h3>
        <p>
          The brain’s verifier and verified readiness are not two scores; they are one ladder. A
          plan reaches readiness only after it is <strong>feasible</strong>, <strong>safe</strong>, and
          its <strong>permissions</strong> are correctly called by evidence-backed verification.
        </p>
      </div>

      <ol className="ts-rungs">
        <li className="ts-rung">
          <span className="ts-rung-num">1</span>
          <div className="ts-rung-body">
            <div className="ts-rung-name">Feasibility</div>
            <p className="ts-rung-claim">
              The verifier gates every proposed call against the hard constraints — infeasible
              calls are blocked before anything reaches verification.
            </p>
            <div className="ts-rung-metrics">
              <span className="ts-chip">{feasibility.failureTags} failure categories caught</span>
              <span className="ts-chip ts-ok">infeasible calls gated, never scored</span>
            </div>
          </div>
        </li>
        <li className="ts-arrow" aria-hidden="true">↑</li>

        <li className="ts-rung">
          <span className="ts-rung-num">2</span>
          <div className="ts-rung-body">
            <div className="ts-rung-name">Safety</div>
            <p className="ts-rung-claim">
              Hazard and human-only cells the robot must route around — crossing one is a
              catastrophic failure, not a cost.
            </p>
            <div className="ts-rung-metrics">
              <span className="ts-chip">{safety.hazardCells} hazard cells</span>
              <span className="ts-chip">{safety.humanOnlyCells} human-only cells</span>
              <span className="ts-chip">{safety.taskClasses} task class(es)</span>
            </div>
          </div>
        </li>
        <li className="ts-arrow" aria-hidden="true">↑</li>

        <li className="ts-rung">
          <span className="ts-rung-num">3</span>
          <div className="ts-rung-body">
            <div className="ts-rung-name">Permission</div>
            <p className="ts-rung-claim">
              Verification calls each task finish / escalate / refuse, and the operating point is
              measured by unsafe-action and missed-action rates.
            </p>
            <div className="ts-rung-metrics">
              <span className="ts-chip lbl-finish">{permission.finish} finish</span>
              <span className="ts-chip lbl-escalate">{permission.escalate} escalate</span>
              <span className="ts-chip lbl-refuse">{permission.refuse} refuse</span>
              <span className="ts-chip">unsafe {pct(permission.far)}</span>
              <span className="ts-chip">missed {pct(permission.frr)}</span>
            </div>
          </div>
        </li>
        <li className="ts-arrow" aria-hidden="true">↑</li>

        <li className="ts-rung ts-readiness" style={{ borderColor: readiness.color }}>
          <span className="ts-rung-num" style={{ background: readiness.color }}>
            {readiness.tierId}
          </span>
          <div className="ts-rung-body">
            <div className="ts-rung-name" style={{ color: readiness.color }}>
              Readiness · {readiness.tierName}
            </div>
            <p className="ts-rung-claim">
              Only with the three rungs below holding does the environment reach an RSL tier — the
              verified readiness for this floor.
            </p>
            <div className="ts-rung-metrics">
              <span className="ts-chip ts-ok">{readiness.decisionLabel}</span>
            </div>
          </div>
        </li>
      </ol>

      <p className="ts-foot">
        Same evidence, one narrative — evidence-backed verification is the only judge at every rung.
      </p>
    </div>
  )
}
