import { AlertCircle, MessageSquareText, TrendingDown } from 'lucide-react'
import type { Incident, LoopForgeRun } from '../lib/schemas'
import { sevClass } from '../lib/severity'

type FailureClusterProps = {
  run: LoopForgeRun
  incidents: Incident[]
}

export function FailureCluster({ run, incidents }: FailureClusterProps) {
  return (
    <section className="panel" aria-labelledby="cluster-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Failure Cluster</p>
          <h2 id="cluster-title">{run.cluster.name}</h2>
        </div>
        <span className={`risk-chip badge-sev ${sevClass(run.cluster.riskTier)}`}>
          {run.cluster.riskTier}
        </span>
      </div>

      <p className="panel-takeaway warn">
        <TrendingDown size={16} aria-hidden="true" />
        <span>
          <strong>{run.cluster.volume} customer contacts</strong> this week hit this one broken
          workflow — fraud, identity, and high-dollar cases all slipping through. Every one is a
          bounced customer and a revenue leak.
        </span>
      </p>

      <p className="cluster-impact">{run.cluster.impactEstimate}</p>

      <div className="incident-list">
        {incidents.slice(0, 5).map((incident) => (
          <article className="incident-row" key={incident.id}>
            <div className="incident-icon">
              <MessageSquareText size={18} aria-hidden="true" />
            </div>
            <div>
              <div className="incident-meta">
                <strong>{incident.id}</strong>
                <span>{incident.chargeStatus}</span>
                <span className={`badge-sev ${sevClass(incident.severity)}`}>
                  {incident.severity}
                </span>
              </div>
              <p>{incident.quote}</p>
              <small>
                <AlertCircle size={14} aria-hidden="true" />
                {incident.qaFlag}
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
