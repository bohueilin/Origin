// Shared, presentational warehouse visualizations reused by both the static
// showcase and the generated-plan license results. Pure render helpers — no state.

import type { WarehouseCalibrationMatrix, WarehouseRollout } from '../warehouse'
import { actionTrace } from '../format'

export function MatrixMini({ matrix }: { matrix: WarehouseCalibrationMatrix }) {
  return (
    <div className="matrix-mini" aria-label="FAR FRR terminal action confusion matrix">
      <div className="matrix-row matrix-head">
        <span>Expected</span>
        <span>finish</span>
        <span>escalate</span>
        <span>refuse</span>
        <span>none</span>
      </div>
      {matrix.labels.map((label) => (
        <div className="matrix-row" key={label}>
          <span className="matrix-label">{label}</span>
          <span>{matrix.counts[label].finish}</span>
          <span>{matrix.counts[label].escalate}</span>
          <span>{matrix.counts[label].refuse}</span>
          <span>{matrix.counts[label].no_terminal}</span>
        </div>
      ))}
    </div>
  )
}

export function TriptychCard({
  slot,
  title,
  line,
  rollout,
}: {
  slot: 'A' | 'B' | 'C'
  title: string
  line: string
  rollout: WarehouseRollout
}) {
  return (
    <article className={`trip-card ${rollout.passed ? 'trip-pass' : 'trip-fail'}`}>
      <div className="trip-top">
        <span className="trip-slot">{slot}</span>
        <span className="trip-verdict">{rollout.passed ? 'PASS' : 'FAIL'}</span>
      </div>
      <h3>{title}</h3>
      <p className="trip-line">{line}</p>
      <div className="trip-task">{rollout.task.title}</div>
      <div className="trip-stats">
        <span>oracle {rollout.expected}</span>
        <span>actual {rollout.matrixAction}</span>
        <span>reward {rollout.reward.toFixed(2)}</span>
      </div>
      <p className="trip-trace">{actionTrace(rollout.actions)}</p>
    </article>
  )
}
