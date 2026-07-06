import { Brain, CheckCircle2, CircleDashed } from 'lucide-react'
import { DeepDiveButton } from '../app/deepDive'
import { useDeepDive } from '../app/deepDiveContext'
import type { RootCauseAnalysis } from '../lib/schemas'

type RootCausePanelProps = {
  rootCause: RootCauseAnalysis
}

export function RootCausePanel({ rootCause }: RootCausePanelProps) {
  const { open } = useDeepDive()
  return (
    <section className="panel" aria-labelledby="root-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Root Cause</p>
          <h2 id="root-title">{rootCause.primaryClass}</h2>
        </div>
        <div className="panel-head-actions">
          <DeepDiveButton
            onClick={() =>
              open({
                title: 'Root-cause analysis',
                subtitle: 'Every candidate cause Gemma 4 weighed, with confidence and evidence',
                data: rootCause,
              })
            }
          />
          <Brain size={22} aria-hidden="true" />
        </div>
      </div>

      <p className="panel-takeaway">
        <Brain size={16} aria-hidden="true" />
        <span>
          One root cause: <strong>the router acts before it verifies</strong> — escalating before
          identity, charge status, and eligibility checks. Evidence-backed, not a guess.
        </span>
      </p>

      <p className="root-summary">{rootCause.summary}</p>

      <div className="cause-grid">
        {rootCause.classes.map((cause) => (
          <div className={cause.applies ? 'cause active' : 'cause'} key={cause.type}>
            {cause.applies ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <CircleDashed size={18} aria-hidden="true" />
            )}
            <div>
              <strong>{cause.type}</strong>
              <span>{Math.round(cause.confidence * 100)}% confidence</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
