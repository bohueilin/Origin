import { GitCompareArrows, RotateCcw } from 'lucide-react'
import type { WorkflowPatch } from '../lib/schemas'
import { sevClass } from '../lib/severity'

type WorkflowDiffProps = {
  patch: WorkflowPatch
}

export function WorkflowDiff({ patch }: WorkflowDiffProps) {
  return (
    <section className="panel diff-panel" aria-labelledby="patch-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Workflow Patch Diff</p>
          <h2 id="patch-title">{patch.title}</h2>
        </div>
        <GitCompareArrows size={22} aria-hidden="true" />
      </div>

      <p className="panel-takeaway">
        <GitCompareArrows size={16} aria-hidden="true" />
        <span>
          The fix inserts <strong>{patch.semanticDiff.length} hard safety gates</strong> the old
          router was missing — identity, fraud, eligibility, high-dollar, and adversarial — each one
          fail-closed.
        </span>
      </p>

      <p className="patch-summary">{patch.summary}</p>

      <div className="diff-table">
        {patch.semanticDiff.map((diff) => (
          <div className="diff-row" key={diff.area}>
            <div className="diff-area">
              <strong>{diff.area}</strong>
              <span className={`badge-sev ${sevClass(diff.risk)}`}>{diff.risk}</span>
            </div>
            <p className="before">{diff.before}</p>
            <p className="after">{diff.after}</p>
          </div>
        ))}
      </div>

      <div className="rollback-note">
        <RotateCcw size={18} aria-hidden="true" />
        <span>{patch.rollbackNote}</span>
      </div>
    </section>
  )
}
