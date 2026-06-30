import bundleJson from './data.json'
import type { Bundle } from './types'
import { PRODUCT_NAME } from './brand'
import { AccountMenu } from '../auth/AccountMenu'
import { Hero } from './components/Hero'
import { HowItWorks } from './components/HowItWorks'
import { CasesSection } from './components/CasesSection'
import { RslCurve } from './components/RslCurve'
import { RsiPrimer } from './components/RsiPrimer'
import { RsiClimb } from './components/RsiClimb'
import { ModelLearning } from './components/ModelLearning'
import { ScorecardPanel } from './components/ScorecardPanel'
import { CostReadiness } from './components/CostReadiness'
import { FailureRows } from './components/FailureRows'
import { TrustPlane } from './components/TrustPlane'
import { PassportLayer } from './components/PassportLayer'
import { SiteFooter } from './components/SiteFooter'

const bundle = bundleJson as unknown as Bundle

const WHY = [
  {
    t: 'Robots ship faster than anyone can prove them safe.',
    d: 'Humanoids and AMRs are moving into human spaces before sites can vet them.',
  },
  {
    t: 'A physical mistake isn’t a typo.',
    d: 'It injures a person or halts a line. “Plausible” isn’t good enough on a real floor.',
  },
  {
    t: 'Permission is the defensible layer.',
    d: 'Capability is commoditizing across labs. The trust to deploy is the unsolved, ownable problem.',
  },
]

export function Dashboard() {
  const tc = bundle.terminal_counts
  const dc = bundle.difficulty_counts
  return (
    <>
      <h2 className="sr-only">
        {PRODUCT_NAME}: a site-specific robot brain and readiness gate. A deterministic oracle
        scores whether the robot may finish, escalate, or refuse; failures are captured as training
        rows so each new brain re-earns permission.
      </h2>
      <nav className="fd-nav">
        <div className="fd-nav-inner">
          <a className="fd-brand" href="#overview">
            <img className="fd-logo" src="/origin-logo.png" alt="" aria-hidden="true" />
            <span>{PRODUCT_NAME}</span>
          </a>
          <div className="fd-nav-links">
            <a href="#how">Product</a>
            <a href="#cost">Price</a>
            <a href="#trust">Trust</a>
            <a href="#passport">Agent Identity</a>
            <a href="#contact">Contact</a>
            <a className="fd-btn fd-btn-primary fd-nav-try" href="/passport">Try Passport →</a>
          </div>
          <AccountMenu />
        </div>
      </nav>

      <main>
        <Hero bundle={bundle} />

        <div className="fd-truststrip fd-shell" role="note">
          The model proposes actions. <strong>A deterministic oracle scores.</strong> No model sets
          its own reward, label, or license — because a model that grades itself can be gamed.
        </div>

        <TrustPlane />

        <section className="fd-section fd-shell" id="why">
          <div className="fd-kicker">Why now</div>
          <h2>Capability is arriving. Permission isn’t.</h2>
          <p className="fd-section-sub">
            {PRODUCT_NAME} is the layer between an agent and the real world — it turns capability
            into <strong>licensed permission</strong>: identity-bound, policy-governed, auditable,
            revocable. One spine, two bodies: a robot that <em>can</em> do the job on your floor, and
            a software agent that <em>can</em> touch your accounts — neither is one you trust until
            permission is enforceable.
          </p>
          <div className="fd-why-grid">
            {WHY.map((w) => (
              <div className="fd-why" key={w.t}>
                <b>{w.t}</b>
                <span>{w.d}</span>
              </div>
            ))}
          </div>
        </section>

        <HowItWorks />

        <div className="fd-proof fd-shell" aria-label="At a glance">
          <span><b>{bundle.cases.length}</b> safety scenarios · {dc.core} core / {dc.hard} hard</span>
          <span><b>{tc.finish}/{tc.escalate}/{tc.refuse}</b> finish / escalate / refuse</span>
          <span><b>{Object.keys(bundle.scorecards).length}</b> models on one bar</span>
          <span><b>1</b> deterministic judge · no LLM grades another LLM</span>
        </div>

        <CasesSection bundle={bundle} />
        <RslCurve bundle={bundle} />
        <RsiPrimer />
        <RsiClimb bundle={bundle} />
        <ModelLearning />
        <FailureRows bundle={bundle} />
        <ScorecardPanel bundle={bundle} />
        <CostReadiness bundle={bundle} />
        <PassportLayer />

        <section className="fd-close fd-shell">
          <h2>Build a robot your floor can trust.</h2>
          <p>Submit your site and watch it earn its license — then climb.</p>
          <a className="fd-btn fd-btn-primary" href="/app.html?start=submit">Submit your site</a>
        </section>

      </main>

      <SiteFooter bundle={bundle} />
    </>
  )
}
