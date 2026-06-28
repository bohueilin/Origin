// "We sit in the middle" — the investor thesis section. Frames Origin as the control
// plane for agent autonomy: any agent (ACP/AP2/MCP/A2A/your own) routes its request for
// real-world authority through the broker, which issues a scoped, revocable capability —
// never a raw secret — with a human in the loop for sensitive acts and an append-only log.
import { PRODUCT_NAME } from '../brand'

const AGENTS = ['ChatGPT · ACP', 'Google · AP2', 'MCP tools', 'Agent-to-Agent', 'Your own agent']
const REAL_WORLD = [
  { t: 'Logins & sessions', d: 'sign in, hold a session' },
  { t: 'Payments & wallets', d: 'spend within set limits' },
  { t: 'APIs & private data', d: 'read only what is scoped' },
]
const NEVER = ['passwords', 'seed phrases', 'private keys', 'long-lived tokens']

export function TrustPlane() {
  return (
    <section className="fd-section fd-shell fd-plane" id="control-plane">
      <div className="fd-kicker">The control plane for agent autonomy</div>
      <h2>Agents can finally act on your behalf — without ever holding your keys.</h2>
      <p className="fd-section-sub">
        The same permission spine that licenses a robot on your floor governs the software agents
        touching your accounts. Capability arrived; permission is the missing layer. Every
        agentic-commerce standard — ChatGPT’s ACP, Google’s AP2, MCP, Agent-to-Agent — assumes a
        trust layer between the agent and your accounts, money, and data. {PRODUCT_NAME} is that
        layer: scoped, revocable authority, a human in the loop for anything sensitive, and an
        append-only record of every act.
      </p>

      <div className="fd-plane-flow" role="img" aria-label="Any agent requests a capability; the Origin broker issues a scoped handle; the agent acts on the real world without ever holding a secret.">
        <div className="fd-plane-col">
          <div className="fd-plane-h">Any agent</div>
          <ul className="fd-plane-chips">
            {AGENTS.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>

        <div className="fd-plane-arrow" aria-hidden="true"><span>requests a capability</span><i>→</i></div>

        <div className="fd-plane-col fd-plane-core">
          <div className="fd-plane-h">{PRODUCT_NAME} broker</div>
          <ul className="fd-plane-rules">
            <li>Scoped grant — one agent, one service, one domain</li>
            <li>Human approval for sensitive acts</li>
            <li>Opaque token — no database, no secret</li>
            <li>Append-only audit of every decision</li>
          </ul>
          <div className="fd-plane-triad">
            <span className="fd-t-pos">Allow</span>
            <span className="fd-t-warn">Escalate</span>
            <span className="fd-t-neg">Refuse</span>
          </div>
        </div>

        <div className="fd-plane-arrow" aria-hidden="true"><span>brokered handle</span><i>→</i></div>

        <div className="fd-plane-col">
          <div className="fd-plane-h">The real world</div>
          <ul className="fd-plane-targets">
            {REAL_WORLD.map((r) => <li key={r.t}><b>{r.t}</b><span>{r.d}</span></li>)}
          </ul>
        </div>
      </div>

      <div className="fd-plane-never">
        <span className="fd-plane-never-label">The agent never receives</span>
        <div className="fd-plane-never-tags">
          {NEVER.map((n) => <em key={n}>{n}</em>)}
        </div>
      </div>

      <div className="fd-cta">
        <a className="fd-btn fd-btn-primary" href="#passport">See the trust stack</a>
        <a className="fd-btn fd-btn-ghost" href="/app.html">Open the console</a>
      </div>
    </section>
  )
}
