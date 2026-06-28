// Landing — the first page. A frontier-lab, proof-first descent:
// hook → proof → how → moat → personalized brain → breadth → why-now → who → ask.
// AI proposes; the deterministic oracle judges. Bright, restrained, one signature
// device (the finish / escalate / refuse decision triad).

import { ScrollVideo } from './ScrollVideo'

const FLOW = [
  { n: '01', t: 'Media intake', d: 'Video, photos, floor plan, SOPs, and Drive links — how the work really happens.' },
  { n: '02', t: 'Understood workflow', d: 'A site map, storyboard, and finish / escalate / refuse rules you confirm.' },
  { n: '03', t: 'Deterministic check', d: 'A fixed rulebook (the “oracle”) — not an AI — decides if each move was safe.' },
  { n: '04', t: 'Autonomy license', d: 'A readiness score (FAR/FRR), cheat-checks, and a portable evidence pack.' },
]

const PROOF = [
  { v: 'Deterministic scoring', l: 'a fixed algorithm decides — not an AI’s opinion' },
  { v: 'Calibrated per site', l: 'tune safety vs. access live — no blanket accuracy promises' },
  { v: 'Evidence-backed', l: 'tamper-evident and reproducible' },
]

const WHO = [
  { t: 'Safety & ops leads', d: 'Sign off with evidence, not vendor promises.' },
  { t: 'Robotics integrators', d: 'Ship faster with a portable readiness report.' },
  { t: 'Insurers & risk', d: 'Price autonomy against a measured operating point.' },
]

export function Landing({ onCreate, onSample }: { onCreate: () => void; onSample: () => void }) {
  return (
    <section className="landing">
      {/* ---------- hero ---------- */}
      <div className="landing-top">
        <div className="landing-hero">
          <span className="landing-eyebrow">The driving test for Physical AI</span>
          <h1 className="landing-headline">Turn real-world footage into a robot safety license.</h1>
          <p className="landing-sub">
            Robots are moving into factories, hospitals, and homes faster than anyone can prove
            they’re safe. Upload how the work really happens, confirm what we understood, and run a
            deterministic eval that decides when a robot may <strong>finish</strong>, must{' '}
            <strong>escalate</strong>, or must <strong>refuse</strong> — then issue the readiness
            license it earned for that exact site, re-checked every time the agent learns.
          </p>

          {/* Signature device: the three calls we license. */}
          <div className="decision-triad" role="img" aria-label="The licensed calls: finish, escalate, refuse">
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
            An operational readiness gate — re-earned each time the agent learns, not a regulatory
            certification. A deterministic oracle judges, never an LLM. Demo captures local metadata
            only; nothing is uploaded or parsed.
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
          measure two kinds of mistake — acting when it should have stopped (a{' '}
          <strong>false accept</strong>), and refusing a job it could have safely done (a{' '}
          <strong>false reject</strong>), together written{' '}
          <abbr title="False-Accept Rate / False-Reject Rate">FAR / FRR</abbr>. You tune the balance
          between strict safety and smooth operation to fit the site — measured live, never promised.
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

      {/* ---------- the moat: how the oracle decides ---------- */}
      <section className="trust-diagram" aria-label="How the oracle decides">
        <div className="panel-kicker">How the oracle decides</div>
        <h2>AI proposes. You approve. A deterministic oracle judges.</h2>
        <ol className="td-flow">
          <li className="td-node">
            <span className="td-step">Declared</span>
            <p>Your footage, floor plan, SOPs, and safety rules.</p>
          </li>
          <li className="td-arrow" aria-hidden="true">→</li>
          <li className="td-node">
            <span className="td-step td-ai">AI-interpreted</span>
            <p>A draft site map and rules — a proposal, never the judge.</p>
          </li>
          <li className="td-arrow" aria-hidden="true">→</li>
          <li className="td-node">
            <span className="td-step">You approve</span>
            <p>Edit, then freeze the workflow into the eval.</p>
          </li>
          <li className="td-arrow" aria-hidden="true">→</li>
          <li className="td-node">
            <span className="td-step td-oracle">Safety checker</span>
            <p>A fixed algorithm (the “oracle”) decides finish / escalate / refuse — the same way every time.</p>
          </li>
        </ol>
        <p className="td-note">
          Uploaded media and AI interpretation never set rewards, labels, or the license. The
          deterministic oracle is the source of truth.
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
              <strong>Footage in, eval out.</strong> Describe the site in your words or a quick
              video — you confirm what we understood. (We don’t parse the footage yet.)
            </li>
            <li>
              <strong>Catch the dangerous error first.</strong> Acting when it should stop is the
              failure that hurts people; we measure it head-on.
            </li>
            <li>
              <strong>Share proof, not promises.</strong> An auditable readiness report for safety,
              ops, and insurers.
            </li>
          </ul>
          <button className="btn primary hero-action" onClick={onCreate}>
            Build your site eval →
          </button>
        </div>
      </section>

      {/* ---------- breadth: across human spaces ---------- */}
      <section className="footage-section" aria-label="Reference footage across human spaces">
        <div className="footage-head">
          <div className="panel-kicker">Reference footage</div>
          <h2>The same license, across human spaces.</h2>
          <p>
            From the factory floor to the home — the settings Physical AI has to earn its license in.
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
                The same eval licenses robots in homes and care settings.{' '}
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
          Capability is arriving; permission isn’t. This is the layer that earns it.
        </p>
        <ul className="origin-points">
          <li>Humanoids and AMRs are shipping into human spaces before sites can license them.</li>
          <li>A physical mistake isn’t a bad paragraph — it injures people or halts a line.</li>
          <li>Capability ≠ permission. Every robot needs proof of when to act, escalate, or refuse.</li>
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
          <span>Designed to map toward AIUC-1</span>
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
            evaluation stays deterministic.
          </p>
        </div>
        <div className="pilot-grid">
          <div>
            <strong>Customer inputs</strong>
            <span>Outcome, video, Drive links, SOPs, floor plan, unsafe examples.</span>
          </div>
          <div>
            <strong>Eval generated</strong>
            <span>Tasks, hazards, human-only zones, oracle labels, reward gates.</span>
          </div>
          <div>
            <strong>Evidence returned</strong>
            <span>Operating envelope, FAR/FRR, reward-hack trace, Signal Extractor rows.</span>
          </div>
          <div>
            <strong>Next pilot step</strong>
            <span>Run the actual model/robot and persist its trace as license evidence.</span>
          </div>
        </div>
      </section>

      {/* ---------- closing ---------- */}
      <section className="closing" aria-label="Get started">
        <h2>Prove it before it moves near someone.</h2>
        <p>Turn your site into the test a robot has to pass.</p>
        <div className="closing-cta">
          <button className="btn primary hero-action" onClick={onCreate}>
            <span aria-hidden="true">↑</span> Upload workflow video
          </button>
          <button className="btn ghost" onClick={onSample}>
            See sample evaluation report
          </button>
        </div>
        <p className="landing-disclaimer">
          Autonomy License is a readiness evidence pack today, not a regulatory certification
          authority. Certification attests controls; we train and measure the physical behavior
          underneath.
        </p>
      </section>
    </section>
  )
}
