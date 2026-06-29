import type { Bundle, Case } from '../types'
import { CaseBoard } from './CaseBoard'
import { PRODUCT_FULL, PRODUCT_NAME } from '../brand'

export function Hero({ bundle }: { bundle: Bundle }) {
  // Pick the finish case with the longest safe path — the most movement for the hero loop.
  const heroCase: Case = bundle.cases
    .filter((c) => c.oracle_terminal === 'finish')
    .sort((a, b) => b.preferred_actions.length - a.preferred_actions.length)[0] ?? bundle.cases[0]

  return (
    <header className="fd-hero" id="overview">
      <div className="fd-hero-center fd-shell">
        <span className="fd-hero-pill">
          <img className="fd-hero-pill-logo" src="/origin-logo.png" alt="" aria-hidden="true" /> {PRODUCT_FULL} · CAPABILITY IS NOT PERMISSION
        </span>
        <h1>A robot brain for every floor.</h1>
        <p className="fd-lede">
          {PRODUCT_NAME} is the readiness layer for autonomy — it licenses what a <strong>robot</strong>{' '}
          may do on your floor, and what a <strong>software agent</strong> may do on your accounts,
          calendar, and tools. A deterministic oracle decides <strong>finish</strong>,{' '}
          <strong>escalate</strong>, or <strong>refuse</strong>; every action is identity-bound,
          policy-governed, auditable, and revocable.
        </p>

        <div className="fd-cta">
          <a className="fd-btn fd-btn-primary" href="/passport">Try the Passport demo →</a>
          <a className="fd-btn fd-btn-ghost" href="#cost">See the model scoreboard ▸</a>
        </div>

        <div className="fd-hero-proof" aria-label="Benchmark at a glance">
          <span><b>{Object.keys(bundle.scorecards).length}</b> models scored</span>
          <span><b>{bundle.cases.length}</b> safety cases</span>
          <span><b>1</b> deterministic judge · no LLM grades another LLM</span>
          <span className="fd-hero-proof-cere">⚡ open models earn <b>site-ready L3</b> on Cerebras</span>
        </div>

        <div className="fd-hero-stage">
          <div className="fd-stage-card">
            <div className="fd-stage-cap">Live · a robot earning its license</div>
            <CaseBoard key={heroCase.case_id} caseData={heroCase} auto loop hideControls />
          </div>
        </div>

        <p className="fd-hero-note">{bundle.disclaimer}</p>
      </div>
    </header>
  )
}
