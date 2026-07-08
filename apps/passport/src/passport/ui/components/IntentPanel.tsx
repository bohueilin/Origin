import type { PassportSnapshot } from '../../engine/session'
import { RiskBadge, Section } from '../bits'

export function IntentPanel({ snap }: { snap: PassportSnapshot }) {
  const { intent, plan } = snap
  return (
    <Section kicker="1 · Intent understanding" title="What you asked for" aside={<RiskBadge level={intent.risk_level} />}>
      <blockquote className="pp-intent-quote">“{intent.raw_user_request}”</blockquote>
      <div className="pp-intent-grid">
        <Field label="Normalized intent" value={intent.normalized_intent} />
        <Field label="Goal" value={intent.user_goal} />
        {intent.time_window && <Field label="Time window" value={intent.time_window} />}
      </div>
      <div className="pp-intent-lists">
        <div>
          <div className="pp-mini-label">Success criteria</div>
          <ul className="pp-ticks">
            {intent.success_criteria.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="pp-mini-label">Constraints</div>
          <ul className="pp-dots">
            {intent.constraints.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
      {plan.risk_notes.length > 0 && (
        <div className="pp-risknotes">
          <div className="pp-mini-label">Janus risk assessment</div>
          <ul>
            {plan.risk_notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="pp-field">
      <span className="pp-mini-label">{label}</span>
      <span className="pp-field-v">{value}</span>
    </div>
  )
}
