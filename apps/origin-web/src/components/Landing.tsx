// Landing — the first page. A frontier-lab, proof-first descent:
// hook → proof → how → moat → personalized brain → breadth → why-now → who → ask.
// The autonomy layer runs the Observe → Plan → Act → Verify loop. Bright, restrained,
// one signature device (the finish / escalate / refuse decision triad).

import { ScrollVideo } from './ScrollVideo'

const FLOW = [
  { n: '01', t: 'Observe', d: 'Video, photos, floor plan, SOPs, and Drive links — the live floor context the work happens in.' },
  { n: '02', t: 'Plan', d: 'Safe task steps and finish / escalate / refuse rules you confirm before anything moves.' },
  { n: '03', t: 'Act', d: 'Execute through your AMRs, humanoids, or ROS 2 stack — robot-agnostic, under your controls.' },
  { n: '04', t: 'Verify', d: 'Confirm completion with operator-grade telemetry and a replayable audit log.' },
]

const PROOF = [
  { v: 'Evidence-backed verification', l: 'every task step is confirmed, not assumed' },
  { v: 'Calibrated per site', l: 'tune safety vs. access live — no blanket accuracy promises' },
  { v: 'Replayable audit trail', l: 'tamper-evident and reproducible' },
]

const WHO = [
  { t: 'Safety & ops leads', d: 'Sign off with evidence, not vendor promises.' },
  { t: 'Robotics integrators', d: 'Ship faster with a portable verification report.' },
  { t: 'Insurers & risk', d: 'Price autonomy against a measured operating point.' },
]

export function Landing({ onCreate, onSample }: { onCreate: () => void; onSample: () => void }) {
  return (
    <section className="landing">
      {/* ---------- hero ---------- */}
      <div className="landing-top">
        <div className="landing-hero">
          <span className="landing-eyebrow">The Origin operator console</span>
          <h1 className="landing-headline">See robot work observed, planned, executed, and verified.</h1>
          <p className="landing-sub">
            Origin is the robot-agnostic autonomy layer between work orders and robot action.
            It observes dynamic floor context, plans safe task steps, executes through your AMRs,
            humanoids, or ROS 2 stack, and verifies completion with evidence — deciding at each step
            whether to <strong>finish</strong>, <strong>escalate</strong>, or <strong>refuse</strong>,
            with operator-grade telemetry and replayable audit logs.
          </p>

          {/* Signature device: the three verification decisions. */}
          <div className="decision-triad" role="img" aria-label="Verification decisions: finish, escalate, refuse">
            <span className="dt-seg dt-finish">Finish</span>
            <span className="dt-seg dt-escalate">Escalate</span>
            <span className="dt-seg dt-refuse">Refuse</span>
          </div>

          <div className="landing-cta">
            <button className="btn primary hero-action" onClick={onCreate}>
              <span aria-hidden="true">↑</span> Upload workflow video
            </button>
            <button className="btn ghost" onClick={onSample}>
              See sample evaluation report
            </button>
          </div>
          <p className="landing-trust">
            Enterprise controls throughout — human override, no-go zones, confidence thresholds, and
            exception handling. Every task step is verified against a deterministic check, never an
            LLM. Demo captures local metadata only; nothing is uploaded or parsed.
          </p>
        </div>

        {/* Hero vision film — ambient, non-interactive (no controls, no enlarge). */}
        <aside className="hero-video" aria-hidden="true">
          <div className="hv-frame">
            <video
              src="/vision-film.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              disablePictureInPicture
              controls={false}
            />
            <span className="hv-scrim" />
            <span className="hv-tag">Vision film</span>
          </div>
          <p className="hv-caption">Physical AI, working safely alongside people.</p>
        </aside>
      </div>

      {/* ---------- proof bar ---------- */}
      <section className="proof-bar" aria-label="Why this is credible">
        {PROOF.map((p) => (
          <div className="pb-stat" key={p.l}>
            <span className="pb-v">{p.v}</span>
            <span className="pb-l">{p.l}</span>
          </div>
        ))}
      </section>

      <details className="home-faq">
        <summary>How do you handle accuracy?</summary>
        <p>
          No two sites are identical, so we don’t make blanket accuracy claims. For each location we
          watch two kinds of mistake — acting when it should have stopped (an{' '}
          <strong>unsafe action</strong>), and refusing a job it could have safely done (a{' '}
          <strong>missed action</strong>). You tune the balance between strict safety and smooth
          operation to fit the site — verified live from telemetry, never promised.
        </p>
      </details>

      {/* ---------- how it works (one canonical flow) ---------- */}
      <ol className="flow-bento" aria-label="How it works">
        {FLOW.map((s) => (
          <li key={s.n}>
            <span className="fb-num">{s.n}</span>
            <strong>{s.t}</strong>
            <p>{s.d}</p>
          </li>
        ))}
      </ol>

      {/* ---------- the moat: how verification decides ---------- */}
      <section className="trust-diagram" aria-label="How verification decides">
        <div className="panel-kicker">How verification decides</div>
        <h2>Observe the floor. Plan the step. Act, then verify against evidence.</h2>
        <ol className="td-flow">
          <li className="td-node">
            <span className="td-step">Observe</span>
            <p>Live floor context — footage, floor plan, SOPs, and safety rules.</p>
          </li>
          <li className="td-arrow" aria-hidden="true">→</li>
          <li className="td-node">
            <span className="td-step td-ai">Plan</span>
            <p>Draft safe task steps and rules — a proposal you review, never self-approving.</p>
          </li>
          <li className="td-arrow" aria-hidden="true">→</li>
          <li className="td-node">
            <span className="td-step">Act</span>
            <p>Execute through your AMRs, humanoids, or ROS 2 stack, under your controls.</p>
          </li>
          <li className="td-arrow" aria-hidden="true">→</li>
          <li className="td-node">
            <span className="td-step td-oracle">Verify</span>
            <p>Operator-grade telemetry decides finish / escalate / refuse and logs every step.</p>
          </li>
        </ol>
        <p className="td-note">
          Verification is grounded in operator-grade telemetry and a replayable audit log — the
          record of what actually happened is the source of truth.
        </p>
      </section>

      {/* ---------- personalized AI brain ---------- */}
      <section className="brain-feature" aria-label="Build the ultimate personalized AI brain">
        <div className="bf-media">
          <img src="/physical-ai-brain.png" alt="Physical AI humanoid brain concept" loading="lazy" />
        </div>
        <div className="bf-body">
          <div className="panel-kicker">Build the ultimate personalized AI brain</div>
          <h2>A robot that’s safe in one workplace can be dangerous in yours.</h2>
          <p>
            Capture the real workplace and we shape the deployment context the robot must reason
            about — the routes, the hazards, the people — before it ever moves near someone.
          </p>
          <ul className="bf-benefits">
            <li>
              <strong>Know before you deploy.</strong> See exactly which tasks a robot may finish,
              must escalate, or must refuse on your floor.
            </li>
            <li>
              <strong>Footage in, safe plan out.</strong> Describe the site in your words or a quick
              video — you confirm what we understood. (We don’t parse the footage yet.)
            </li>
            <li>
              <strong>Catch the dangerous error first.</strong> Acting when it should stop is the
              failure that hurts people; we verify against it head-on.
            </li>
            <li>
              <strong>Share proof, not promises.</strong> An auditable verification report for safety,
              ops, and insurers.
            </li>
          </ul>
          <button className="btn primary hero-action" onClick={onCreate}>
            Set up your site →
          </button>
        </div>
      </section>

      {/* ---------- breadth: across human spaces ---------- */}
      <section className="footage-section" aria-label="Reference footage across human spaces">
        <div className="footage-head">
          <div className="panel-kicker">Reference footage</div>
          <h2>The same autonomy layer, across human spaces.</h2>
          <p>
            From the factory floor to the home — the settings Physical AI has to work safely in.
            Illustration footage only, never parsed as evidence.
          </p>
        </div>
        <div className="footage-row">
          <article className="footage-card">
            <ScrollVideo id="h4SQUglSsH4" title="Manufacturing reference footage" />
            <div className="footage-body">
              <div className="panel-kicker">Manufacturing floor</div>
              <p>
                Lifting and moving near people and machines.{' '}
                <a href="https://www.youtube.com/shorts/h4SQUglSsH4" target="_blank" rel="noreferrer">
                  Open the Short
                </a>
                .
              </p>
            </div>
          </article>
          <article className="footage-card">
            <ScrollVideo id="L7i_KE5z_GY" title="Home and care reference footage" />
            <div className="footage-body">
              <div className="panel-kicker">Beyond the factory</div>
              <p>
                The same autonomy layer runs robots in homes and care settings.{' '}
                <a href="https://www.youtube.com/shorts/L7i_KE5z_GY" target="_blank" rel="noreferrer">
                  Open the Short
                </a>
                .
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* ---------- why now / origin wedge ---------- */}
      <section className="origin" aria-label="Why now">
        <div className="panel-kicker">Why now</div>
        <h2>It started with a worried son.</h2>
        <p className="origin-lead">
          A founder watched a robot get installed on his dad’s factory floor and realized no one
          could answer the only question that mattered: <em>is it safe to let it work next to him?</em>{' '}
          Capability is arriving; control isn’t. This is the layer that supplies it.
        </p>
        <ul className="origin-points">
          <li>Humanoids and AMRs are shipping into human spaces before sites can control them.</li>
          <li>A physical mistake isn’t a bad paragraph — it injures people or halts a line.</li>
          <li>Capability ≠ permission. Every robot needs a verified record of when to act, escalate, or refuse.</li>
        </ul>
      </section>

      {/* ---------- who it's for + credibility ---------- */}
      <section className="audience" aria-label="Who it's for">
        <div className="panel-kicker">Who it’s for</div>
        <h2>For everyone who has to answer “is it safe to deploy?”</h2>
        <div className="audience-grid">
          {WHO.map((w) => (
            <div className="audience-card" key={w.t}>
              <strong>{w.t}</strong>
              <span>{w.d}</span>
            </div>
          ))}
        </div>
        <div className="credibility">
          <span>Designed to map toward established safety frameworks</span>
          <span>OWASP agentic-risk crosswalk</span>
          <span className="cred-pilot">In pilot — talk to us</span>
        </div>
      </section>

      {/* ---------- pilot package ---------- */}
      <section className="pilot-package">
        <div>
          <div className="panel-kicker">Pilot package</div>
          <h2>What a customer gives us, and what they get back.</h2>
          <p>
            Start with a small workplace slice: the task outcome, robot type, SOPs, floor plan,
            unsafe examples, and escalation rules. The current demo captures local metadata only; the
            verification stays evidence-backed.
          </p>
        </div>
        <div className="pilot-grid">
          <div>
            <strong>Customer inputs</strong>
            <span>Outcome, video, Drive links, SOPs, floor plan, unsafe examples.</span>
          </div>
          <div>
            <strong>Workflow mapped</strong>
            <span>Tasks, hazards, human-only zones, safety rules, escalation gates.</span>
          </div>
          <div>
            <strong>Evidence returned</strong>
            <span>Operating envelope, telemetry summary, exception trace, replayable audit log.</span>
          </div>
          <div>
            <strong>Next pilot step</strong>
            <span>Run the actual model/robot and persist its trace as verified audit evidence.</span>
          </div>
        </div>
      </section>

      {/* ---------- closing ---------- */}
      <section className="closing" aria-label="Get started">
        <h2>Verify it before it moves near someone.</h2>
        <p>Put the autonomy layer between your work orders and robot action.</p>
        <div className="closing-cta">
          <button className="btn primary hero-action" onClick={onCreate}>
            <span aria-hidden="true">↑</span> Upload workflow video
          </button>
          <button className="btn ghost" onClick={onSample}>
            See sample evaluation report
          </button>
        </div>
        <p className="landing-disclaimer">
          Origin returns an evidence-backed verification record and a replayable audit trail today,
          not a regulatory certification. Certification attests controls; we run and verify the
          physical behavior underneath.
        </p>
      </section>
    </section>
  )
}
