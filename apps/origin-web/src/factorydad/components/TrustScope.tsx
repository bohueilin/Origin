import type { Bundle } from '../types'
import { modelLabel, pct } from '../labels'
import { versionTag } from '../brand'

const CHAIN = [
  { who: 'input', label: 'Case declared', d: 'Intent, scan, grid, safety rules' },
  { who: 'oracle', label: 'Scan required', d: 'Perceive before acting' },
  { who: 'oracle', label: 'Deterministic replay', d: 'A fixed algorithm, not an LLM' },
  { who: 'oracle', label: 'finish / escalate / refuse', d: 'The licensed call' },
  { who: 'oracle', label: 'RSL tier + FAR/FRR', d: 'Readiness, safety-first' },
]

export function TrustScope({ bundle }: { bundle: Bundle }) {
  return (
    <section className="fd-section fd-shell" id="trust">
      <div className="fd-kicker">Why you can trust it</div>
      <h2>Deterministic by construction</h2>
      <p className="fd-section-sub">
        No model sets its own reward, label, or license. The model under test only proposes
        actions; a fixed oracle decides — the same way every time.
      </p>

      <ol className="fd-chain" aria-label="How the verdict is earned">
        {CHAIN.map((s) => (
          <li key={s.label} className={`fd-chain-node fd-chain-${s.who}`}>
            <b>{s.label}</b>
            <span>{s.d}</span>
          </li>
        ))}
      </ol>

      <div className="fd-scope">
        <div className="fd-scope-card">
          <div className="fd-kicker">Dataset boundary</div>
          <p>{bundle.dataset_boundary.droid}</p>
          <p>{bundle.dataset_boundary.mvtec}</p>
          <p className="fd-scope-note">{bundle.dataset_boundary.note}</p>
        </div>
        <div className="fd-scope-card">
          <div className="fd-kicker">Scope</div>
          <p>{bundle.disclaimer}</p>
          <p className="fd-scope-note">
            Benchmark {versionTag(bundle.version)} · {bundle.cases.length} scenarios ·
            {' '}{bundle.difficulty_counts.core} core / {bundle.difficulty_counts.hard} hard.
          </p>
        </div>
      </div>

      <div className="fd-evidence">
        <span className="fd-kicker">Evidence — measured runs</span>

        <div className="fd-ev-group">
          <span className="fd-ev-label">HUD cloud jobs <small>· v1, 20 cases · click through to the trace</small></span>
          <div className="fd-evidence-links">
            {bundle.hud_runs.map((r) => (
              <a key={r.job_url} href={r.job_url} target="_blank" rel="noreferrer" className="fd-ev-link">
                {modelLabel(r.agent)} · {pct(r.success_rate)} · {r.rsl_tier}
                <span aria-hidden="true"> ↗</span>
              </a>
            ))}
          </div>
        </div>

        <div className="fd-ev-group">
          <span className="fd-ev-label">
            Local harness <small>· full v2 benchmark, {bundle.cases.length} cases · real API calls, scored by the same oracle</small>
          </span>
          <div className="fd-evidence-links">
            {bundle.harness_runs.map((r) => (
              <span key={r.agent} className="fd-ev-chip">
                {modelLabel(r.agent)} · {pct(r.success_rate)} · {r.rsl_tier}
                <small> · FAR {r.false_accept_rate.toFixed(2)}</small>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
