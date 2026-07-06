// The digital half of the thesis: Origin licenses what a PHYSICAL agent may do on
// your floor; Passport licenses what a SOFTWARE agent may do on your accounts,
// calendar, and tools. Same question, same answer — capability ≠ permission.
// Built from pure JSX + existing .fd- tokens; links to the always-on /passport demo.

import { PRODUCT_NAME } from '../brand'

const STORY: { n: number; t: string; d: string }[] = [
  { n: 1, t: 'Grant', d: 'The agent gets exactly the authority it needs — scoped, time-boxed, nothing more.' },
  { n: 2, t: 'Execute', d: 'It can look and propose, not act. Discovery and drafting only.' },
  { n: 3, t: 'Approve', d: 'You sign off before anything sensitive — and approved actions run in simulation first.' },
  { n: 4, t: 'Deny', d: 'Spend, send, and raw credentials are never on the table. Full stop.' },
  { n: 5, t: 'Audit & revoke', d: 'Every decision is logged in a tamper-evident chain. One tap kills all of it.' },
]

export function PassportLayer() {
  return (
    <section className="fd-section fd-shell" id="passport">
      <div className="fd-kicker">The digital half · Agent identity</div>
      <h2>A robot has a floor. An agent has your accounts. Same question, same answer.</h2>
      <p className="fd-section-sub">
        Passport is the control plane for delegated autonomy. The agent can propose —{' '}
        <strong>Passport decides what it may actually do</strong>, and you can see, approve, and
        revoke every bit of it.
      </p>

      <div className="fd-pp">
        {/* The Passport identity card — the whole argument in one glance. */}
        <div className="fd-pp-card" aria-label="Agent passport">
          <div className="fd-pp-card-head">
            <span className="fd-pp-status"><span className="fd-pp-dot" aria-hidden="true" />ACTIVE</span>
            <span className="fd-pp-brand">PASSPORT</span>
          </div>
          <div className="fd-pp-holder">
            <span className="fd-pp-holder-lbl">Holder</span>
            <span className="fd-pp-holder-val">Personal agent</span>
          </div>
          <div className="fd-pp-scope">
            <span className="fd-pp-scope-val">Airport Pickup</span>
            <span className="fd-pp-risk">⚠ HIGH RISK</span>
          </div>
          <div className="fd-pp-ttl">⏱ 90:00 · revocable</div>

          <div className="fd-pp-grp">
            <span className="fd-pp-grp-lbl fd-t-pos">Granted</span>
            <span className="fd-pp-chips">
              <span className="fd-pp-chip fd-pp-chip-pos">read calendar</span>
              <span className="fd-pp-chip fd-pp-chip-pos">check flights</span>
              <span className="fd-pp-chip fd-pp-chip-pos">prepare a ride</span>
            </span>
          </div>
          <div className="fd-pp-grp">
            <span className="fd-pp-grp-lbl fd-t-warn">Approval required</span>
            <span className="fd-pp-chips">
              <span className="fd-pp-chip fd-pp-chip-warn">book the ride</span>
            </span>
          </div>
          <div className="fd-pp-grp">
            <span className="fd-pp-grp-lbl fd-t-neg">Denied to the agent</span>
            <span className="fd-pp-chips">
              <span className="fd-pp-chip fd-pp-chip-neg">send a message</span>
              <span className="fd-pp-chip fd-pp-chip-neg">spend money</span>
              <span className="fd-pp-chip fd-pp-chip-neg">unrestricted credentials</span>
            </span>
          </div>

          <button className="fd-pp-revoke" type="button" aria-label="Revoke all authority">
            ⏻ Revoke all authority
          </button>
        </div>

        {/* The five-beat story beside the card. */}
        <ol className="fd-pp-story" aria-label="How delegated autonomy works">
          {STORY.map((s) => (
            <li className="fd-pp-beat" key={s.n}>
              <span className="fd-pp-beat-n" aria-hidden="true">{s.n}</span>
              <div>
                <b>{s.t}</b>
                <span>{s.d}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="fd-pp-cta">
        <a className="fd-btn fd-btn-primary" href="/passport">
          Try Passport — no signup, nothing spent →
        </a>
        <span className="fd-pp-cta-note">
          Runs in the browser · deterministic · nothing real is booked, sent, or spent.
        </span>
      </div>

      <div className="fd-stack">
        <div className="fd-stack-card fd-stack-card-alt">
          <div className="fd-stack-tag">Digital layer · agent identity</div>
          <h3>Passport — identity + kill-switch</h3>
          <p>
            Every agent carries a signed passport that can only <strong>narrow</strong> on each
            handoff: <b className="fd-t-pos">grant</b> →{' '}
            <b className="fd-t-warn">approve</b> → <b className="fd-t-neg">deny</b> → audit → revoke.
            Capability is the agent’s; permission is yours.
          </p>
          <a className="fd-btn fd-btn-primary" href="/passport">
            Try Passport →
          </a>
        </div>

        <div className="fd-stack-card">
          <div className="fd-stack-tag">Physical layer · this product</div>
          <h3>{PRODUCT_NAME} — robot readiness</h3>
          <p>
            A deterministic oracle decides whether a robot may <b className="fd-t-pos">finish</b>,{' '}
            <b className="fd-t-warn">escalate</b>, or <b className="fd-t-neg">refuse</b> on the
            floor you drew — the same spine, one body over.
          </p>
          <a className="fd-btn" href="/capture.html?start=submit">
            Submit your site →
          </a>
        </div>
      </div>

      <p className="fd-stack-foot">
        Both bodies share one spine: scoped authority, signed and tamper-evident, that can only
        narrow — and an instant kill-switch over everything an agent may do.
      </p>
    </section>
  )
}
