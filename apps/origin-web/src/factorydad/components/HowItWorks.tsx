import { PRODUCT_NAME } from '../brand'

const STEPS = [
  {
    n: '1',
    t: 'Submit your site',
    d: 'Floor plan, footage, or just describe it out loud. Your space, your rules, your hazards.',
  },
  {
    n: '2',
    t: 'Build the robot brain',
    d: 'We turn your site into a personalized eval and put a robot brain under test on it.',
  },
  {
    n: '3',
    t: 'Run the proving ground',
    d: 'Watch the robot scan, navigate the hazards, and decide — finish, escalate, or refuse.',
  },
  {
    n: '4',
    t: 'Get the readiness license',
    d: 'A safety-first readiness tier, with the failures it must fix to climb — re-earned by each new brain.',
  },
]

export function HowItWorks() {
  return (
    <section className="fd-section fd-shell" id="how">
      <div className="fd-kicker">How it works</div>
      <h2>From your floor to a robot you can trust.</h2>
      <p className="fd-section-sub">
        {PRODUCT_NAME} is a deterministic proving ground: capability is never enough — the brain
        has to earn permission on your submitted site model, and re-earn it on every retrain.
      </p>

      <ol className="fd-how-grid">
        {STEPS.map((s) => (
          <li className="fd-how-step" key={s.n}>
            <span className="fd-how-n">{s.n}</span>
            <strong>{s.t}</strong>
            <span className="fd-how-d">{s.d}</span>
          </li>
        ))}
      </ol>

      <div className="fd-how-cta">
        <a className="fd-btn fd-btn-primary" href="/app.html?start=submit">Submit your site</a>
        <a className="fd-btn fd-btn-ghost" href="#cases">Or watch a robot earn it first</a>
      </div>
    </section>
  )
}
