import { PRODUCT_NAME } from '../brand'

// A dramatic dark beat: the humanoid image literally shows a brain whose signals
// resolve into three decisions (green/amber/red) — finish / escalate / refuse.
export function RobotBrain() {
  return (
    <section className="fd-brainband" id="brain">
      <div className="fd-brainband-inner fd-shell">
        <div className="fd-brain-copy">
          <div className="fd-kicker fd-kicker-light">The brain</div>
          <h2>{PRODUCT_NAME} is the brain a robot reasons with.</h2>
          <p>
            It reads your site, weighs the hazards, and turns raw capability into a decision you
            can trust — personalized to your floor, scored by a deterministic oracle. Every signal
            resolves into one of three calls:
          </p>
          <div className="fd-triad">
            <span className="fd-seg fd-seg-finish">Finish</span>
            <span className="fd-seg fd-seg-escalate">Escalate</span>
            <span className="fd-seg fd-seg-refuse">Refuse</span>
          </div>
        </div>
        <div className="fd-brain-media">
          <img
            src="/humanoid_physical_AI.png"
            alt="A humanoid robot whose brain routes signals into finish, escalate, and refuse decisions"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  )
}
