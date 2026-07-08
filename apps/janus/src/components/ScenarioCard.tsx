import type { Scenario } from '../types'

const DOMAIN_LABEL: Record<Scenario['domain'], string> = {
  commerce: 'Commerce',
  business_ops: 'Business Ops',
  robotics: 'Robotics',
}

interface Props {
  scenario: Scenario
  /** Hidden risk is only revealed after the verifier has scored the episode. */
  revealed: boolean
}

export function ScenarioCard({ scenario, revealed }: Props) {
  return (
    <div className="card scenario-card">
      <div className="card-head">
        <span className="step-tag">1 · Scenario</span>
        <span className="scenario-meta">
          <span className={`meta-chip difficulty-${scenario.difficulty}`}>
            {scenario.difficulty}
          </span>
          <span className={`meta-chip split-${scenario.split}`}>
            {scenario.split === 'heldout' ? 'held-out' : 'train'}
          </span>
          <span className={`domain-chip domain-${scenario.domain}`}>
            {DOMAIN_LABEL[scenario.domain]}
          </span>
        </span>
      </div>

      <h3 className="card-title">{scenario.title}</h3>
      <p className="situation">{scenario.situation}</p>

      <div className="signals">
        <div className="signals-label">Visible signals</div>
        <ul>
          {scenario.visibleSignals.map((s) => (
            <li key={s.label}>
              <span className="sig-key">{s.label}</span>
              <span className="sig-val">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={`hidden-risk ${revealed ? 'revealed' : 'masked'}`}>
        <div className="hidden-risk-label">
          {revealed ? '⚠ Hidden risk (revealed after scoring)' : '🔒 Hidden risk — locked until scored'}
        </div>
        <p>{revealed ? scenario.hiddenRisk : 'Run the episode to reveal what the agent could not see.'}</p>
      </div>
    </div>
  )
}
