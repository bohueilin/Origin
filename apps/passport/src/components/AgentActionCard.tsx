import { POLICY_BANDS } from '../agent'
import type { AgentDecision } from '../types'

interface Props {
  decision: AgentDecision | null
}

const SOURCE_LABEL: Record<AgentDecision['source'], string> = {
  mock: 'Mock Policy',
  nebius: 'Nebius Token Factory',
}

export function AgentActionCard({ decision }: Props) {
  const isNebius = decision?.source === 'nebius'

  return (
    <div className="card action-card">
      <div className="card-head">
        <span className="step-tag">2 · Agent action</span>
        <span className="muted-tag">proposes only · verifier scores</span>
      </div>

      {decision ? (
        <>
          <div className="source-row">
            <span className={`source-chip source-${decision.source}`}>
              {SOURCE_LABEL[decision.source]}
            </span>
            {isNebius && decision.model && <span className="model-name">{decision.model}</span>}
          </div>

          <div className={`action-badge action-${decision.action}`}>{decision.action}</div>

          {/* Mock-policy explainability: the entire decision rule, made visible. */}
          {decision.source === 'mock' && decision.policyBand && (
            <div className="policy-signal">
              <div className="policy-label">Mock policy signal</div>
              <div className="band-bar" role="img" aria-label={decision.policyBand}>
                {POLICY_BANDS.map((b) => {
                  const width = (b.to >= 1 ? 1 : b.to) - b.from
                  const activeBand = decision.action === b.action
                  return (
                    <div
                      key={b.action}
                      className={`band band-${b.action} ${activeBand ? 'band-active' : ''}`}
                      style={{ width: `${width * 100}%` }}
                      title={`${b.from.toFixed(2)}–${b.to >= 1 ? '1.00' : b.to.toFixed(2)}: ${b.action}`}
                    >
                      {b.action}
                    </div>
                  )
                })}
                {decision.policySignal !== undefined && (
                  <div
                    className="band-marker"
                    style={{ left: `${Math.min(decision.policySignal, 1) * 100}%` }}
                  />
                )}
              </div>
              <div className="policy-readout">{decision.policyBand}</div>
            </div>
          )}

          <div className="confidence-row">
            <span className="muted">confidence</span>
            <div className="confidence-bar">
              <div className="confidence-fill" style={{ width: `${decision.confidence * 100}%` }} />
            </div>
            <span className="confidence-pct">{Math.round(decision.confidence * 100)}%</span>
          </div>

          <p className="agent-rationale">{decision.rationale}</p>

          {isNebius && decision.requestedInfo && (
            <div className="requested-info">
              <span className="ri-label">Requested info</span>
              <p>{decision.requestedInfo}</p>
            </div>
          )}

          <p className="policy-note">
            The model sees only visible context. Hidden risk is verifier ground truth, revealed
            after scoring.
          </p>
        </>
      ) : (
        <p className="placeholder">Waiting for an episode…</p>
      )}
    </div>
  )
}
