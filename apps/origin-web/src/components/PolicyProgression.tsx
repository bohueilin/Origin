// "Autonomy improves over time" — the RL/RSI story, told with REAL deterministic
// data. Each rung is an actual policy scored by the deterministic oracle over the
// same task set (no model spend, no backend). The progression reckless → untrained
// → calibrated reference shows FAR/FRR/reward/tier moving the right way. The model
// is the student; the oracle is the judge; RL/RSI happens inside the env. The
// "trained model" target is the reference operating point — labeled as the
// sponsor-compute path, never a fabricated measured run.

import { computeLicenseFromVerdicts, type LicenseVerdict } from '../license'
import type { WarehouseDemo, WarehouseRollout } from '../warehouse'
import { pct } from '../format'

function toVerdicts(rollouts: readonly WarehouseRollout[]): LicenseVerdict[] {
  return rollouts.map((r) => ({
    passed: r.passed,
    reward: r.reward,
    catastrophic: r.category === 'unsafe_zone' || r.falseAccept,
  }))
}

// The rungs we tell the story with, worst → reference, by baseline name.
const RUNGS: { name: string; stage: string; blurb: string }[] = [
  {
    name: 'always finish',
    stage: 'Reckless baseline',
    blurb: 'Acts on everything. Capable-looking, but it accepts jobs it should refuse — the dangerous error.',
  },
  {
    name: 'seeded random',
    stage: 'Untrained policy',
    blurb: 'No calibration yet. Mixed calls — some unsafe accepts, some needless refusals.',
  },
  {
    name: 'calibrated oracle',
    stage: 'Calibrated reference',
    blurb: 'The bar to clear: finish / escalate / refuse the same way every time. Zero unsafe accepts.',
  },
]

export function PolicyProgression({ demo }: { demo: WarehouseDemo }) {
  const rungs = RUNGS.map((r) => {
    const base = demo.baselines.find((b) => b.name === r.name)
    if (!base) return null
    const lic = computeLicenseFromVerdicts(toVerdicts(base.rollouts))
    return {
      ...r,
      far: base.matrix.far,
      frr: base.matrix.frr,
      avg: base.avgReward,
      success: lic.passRate,
      level: lic.level,
    }
  }).filter((r): r is NonNullable<typeof r> => r !== null)

  if (rungs.length === 0) return null

  return (
    <section className="policy-prog" aria-label="Autonomy improves over time">
      <div className="panel-kicker">Autonomy improves over time</div>
      <h2>From reckless to calibrated — measured, not promised.</h2>
      <p className="pp-sub">
        Same tasks, same deterministic judge. As the policy improves, the dangerous error
        (acting when it should stop) falls to zero and the readiness tier climbs. The model is the
        student; the <strong>oracle is the judge</strong>; RL/RSI happens inside the environment —
        never in the real world.
      </p>

      <ol className="pp-ladder">
        {rungs.map((r, i) => (
          <li className="pp-rung" key={r.name}>
            <div className="pp-rung-head">
              <span className="pp-stage">{r.stage}</span>
              <span className="pp-tier" style={{ background: r.level.color }}>
                {r.level.id}
              </span>
            </div>
            <div className="pp-tier-name" style={{ color: r.level.color }}>{r.level.name}</div>
            <p className="pp-blurb">{r.blurb}</p>
            <div className="pp-metrics">
              <span><b className={r.far === 0 ? 'pp-good' : 'pp-bad'}>{pct(r.far)}</b> FAR</span>
              <span><b>{pct(r.frr)}</b> FRR</span>
              <span><b>{pct(r.success)}</b> pass</span>
              <span><b>{r.avg.toFixed(2)}</b> reward</span>
            </div>
            {i < rungs.length - 1 && <span className="pp-arrow" aria-hidden="true">→</span>}
          </li>
        ))}
      </ol>

      <p className="pp-target">
        <span className="pp-target-badge">RL / RSI path</span>
        Training a real model on the extracted failure rows and preference pairs drives it along
        this same axis toward the calibrated reference — the FAR-first, then-FRR direction.
        That training run is the <strong>sponsor-compute path</strong>; it is not executed here, so
        no trained-model numbers are claimed. Every figure above is a deterministic oracle score.
      </p>
    </section>
  )
}
