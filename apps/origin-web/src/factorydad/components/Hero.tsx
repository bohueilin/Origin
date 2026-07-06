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
          <img className="fd-hero-pill-logo" src="/origin-logo.png" alt="" aria-hidden="true" /> {PRODUCT_FULL} <span className="fd-hero-pill-sub">· CAPABILITY IS NOT PERMISSION</span>
        </span>
        <div className="fd-hero-eyebrow">Physical AI is here</div>
        <h1>Can you trust it on your floor?</h1>
        <p className="fd-lede">
          It’s already moving in next to people — <strong>factories, hospitals, homes</strong>. The robot is
          arriving; the only question left is whether you can trust it. {PRODUCT_NAME} is the readiness layer
          for autonomy — a deterministic oracle decides what a robot may do (<strong>finish</strong>,{' '}
          <strong>escalate</strong>, or <strong>refuse</strong>), and every action is identity-bound,
          auditable, and revocable.
        </p>

        <figure className="fd-hero-film">
          <video
            src="/Home_Collaboration_Videos.mp4"
            poster="/home-collaboration-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            controls={false}
            aria-hidden="true"
          />
          <span className="fd-film-scrim" aria-hidden="true" />
          <figcaption className="fd-film-cap">Working alongside people — the moment trust is earned, or lost.</figcaption>
        </figure>

        <div className="fd-cta">
          <a className="fd-btn fd-btn-ghost" href="/passport">Try the Passport demo →</a>
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

        {/* Primary product action — kept high on the page so the main ask ("submit your site")
            is the first thing people act on, right after they watch a robot earn its license. */}
        <div className="fd-hero-submit">
          <div className="fd-hero-submit-copy">
            <h2>Build a robot your floor can trust.</h2>
            <p>Submit your site and watch it earn its license — then climb.</p>
          </div>
          <a className="fd-hero-submit-btn" href="/capture.html?start=submit">Submit your site →</a>
        </div>

        <p className="fd-hero-note">{bundle.disclaimer}</p>
      </div>
    </header>
  )
}
