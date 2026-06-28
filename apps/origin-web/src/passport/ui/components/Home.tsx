import { useCallback, useRef, useState } from 'react'
import type { ScenarioSpec } from '../../scenarios/types'
import { SCENARIOS, SECONDARY_USE_CASES, getScenario } from '../../scenarios'
import { IntentParser } from '../../engine/intentParser'
import { classifyIntent, type BrainRoute } from '../../brainClient'
import { useVoiceInput } from '../useVoiceInput'

const PILLARS = [
  { k: 'AI security', d: 'Agents operate inside bounded, testable, fail-closed systems.' },
  { k: 'Agent security', d: 'Every action is tied to identity, scope, policy, and revocation.' },
  { k: 'Governance', d: 'Intent, permissions, approvals, denials, and residual risk are explicit and auditable.' },
  { k: 'Trust', d: 'You can understand, approve, inspect, and revoke what agents do on your behalf.' },
  { k: 'Safe deployment', d: 'Powerful workflows without silent overreach, credential exposure, or runaway spend.' },
]

const SPONSORS = [
  { role: 'Voice', name: 'VoiceCursor', note: 'speak your intent' },
  { role: 'Inference', name: 'GMI Cloud', note: 'the agent’s brain' },
]

export function Home({ onRun, canRun = true }: { onRun: (s: ScenarioSpec) => void; canRun?: boolean }) {
  const [text, setText] = useState('')
  const [thinking, setThinking] = useState(false)
  const [heard, setHeard] = useState<BrainRoute | null>(null)
  const matched = text.trim() ? IntentParser.match(text, SCENARIOS) : null

  // Speak/type → GMI brain classifies → "what I heard" → run the scenario.
  const route = useCallback(async (t: string) => {
    if (!canRun) return // owner-only: never fire a run from the typed/voice funnel for viewers
    if (!t.trim()) return
    setHeard(null)
    setThinking(true)
    const r = await classifyIntent(t)
    setThinking(false)
    if (!r) return
    if (r.source === 'keyword' || !r.summary) { onRun(r.scenario); return }
    setHeard(r)
    window.setTimeout(() => onRun(r.scenario), 2600)
  }, [onRun, canRun])

  const voice = useVoiceInput((t) => { setText(t); void route(t) })
  const shown = voice.listening ? voice.transcript : text

  const exRef = useRef<HTMLDivElement>(null)
  const scrollEx = (dir: number) => exRef.current?.scrollBy({ left: dir * 344, behavior: 'smooth' })

  return (
    <div className="pp-home">
      <section className="pp-hero">
        <div className="pp-hero-pill">
          <span className="pp-hero-dot" /> Live demo · scoped, revocable permissions · secrets never exposed
        </div>
        <h1 className="pp-hero-title">Capability is not permission.</h1>
        <p className="pp-hero-lede">
          Passport is the control plane for <b>delegated autonomy</b> — the agent proposes a plan, Passport issues a{' '}
          <b>scoped, revocable</b> grant, and every real-world action waits for your approval. Watch one run the loop:
        </p>

        <figure className="pp-hero-stage">
          <div className="pp-hero-glow" aria-hidden="true" />
          <div className="pp-hero-screen">
            <div className="pp-hero-chrome" aria-hidden="true">
              <span className="pp-hero-light" />
              <span className="pp-hero-light" />
              <span className="pp-hero-light" />
              <em>passport · agent journey</em>
            </div>
            <video
              className="pp-hero-video"
              src="/agent-journey.mp4"
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
              aria-label="Agent journey: an agent reorders your usual DoorDash, gated by Passport approval"
            />
          </div>
          <figcaption className="pp-hero-cap">
            <span className="pp-hero-dot" /> An agent reorders your usual DoorDash — and stops to ask <b>before it acts</b>.
          </figcaption>
        </figure>

        <p className="pp-hero-founder">
          We’re building Passport because the next platform shift isn’t smarter agents — it’s <b>agents you can
          trust to act</b>. Identity-bound, policy-governed, user-authorized, auditable, revocable.
        </p>
      </section>

      <section className="pp-funnel">
        <div className="pp-funnel-label">Speak what you want — your agent does the rest</div>
        <div className={`pp-voice ${voice.listening ? 'pp-voice-on' : ''}`}>
          <button
            className={`pp-mic ${voice.listening ? 'pp-mic-on' : ''}`}
            onClick={() => (voice.listening ? voice.stop() : voice.start())}
            aria-pressed={voice.listening}
            aria-label={voice.listening ? 'Stop listening' : 'Start voice input'}
            disabled={!voice.supported || thinking || !canRun}
            aria-disabled={!canRun}
            title={voice.supported ? 'Hold a thought and speak' : 'Voice not supported here — type instead'}
          >
            {voice.listening ? <span className="pp-mic-wave"><i /><i /><i /><i /></span> : '🎙'}
          </button>
          <div className="pp-voice-body">
            <input
              id="pp-req"
              className="pp-request-input"
              placeholder={voice.listening ? 'Listening… speak now' : 'e.g. Plan me a FIFA catch-up night and order my usual DoorDash…'}
              value={shown}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void route(shown) }}
              disabled={thinking || !canRun}
              aria-disabled={!canRun}
            />
            <div className="pp-voice-sub">
              {!canRun
                ? <span className="pp-voice-readonly">owner access required to run · viewing read-only</span>
                : voice.error
                  ? <span className="pp-voice-err">{voice.error}</span>
                  : voice.listening
                    ? <span className="pp-voice-live"><span className="pp-hero-dot" /> Listening…</span>
                    : matched
                      ? <>Heard you — looks like <b>{matched.title}</b>. Press <b>Run</b> or Enter.</>
                      : <>Try “airport pickup”, “FIFA night + DoorDash”, or “fill my night”.</>}
            </div>
          </div>
          <button className="pp-btn pp-btn-primary pp-run-btn" disabled={!shown.trim() || thinking || !canRun} aria-disabled={!canRun} onClick={() => void route(shown)}>
            {thinking ? 'Thinking…' : 'Run'}
          </button>
        </div>
        <div className="pp-voice-cursor">
          🖱 Prefer to dictate? <b>VoiceCursor</b> types straight into this box on Mac, Windows, iOS &amp; Android — speak anywhere.
        </div>

        {thinking && (
          <div className="pp-brain pp-brain-thinking">
            <span className="pp-brain-orb" aria-hidden="true" />
            <div className="pp-brain-tx">
              <b>Origin is understanding your intent…</b>
              <span className="pp-brain-sub">Inference by GMI Cloud<span className="pp-think-dots"><i /><i /><i /></span></span>
            </div>
          </div>
        )}
        {heard && !thinking && (
          <div className="pp-brain pp-brain-heard">
            <div className="pp-brain-head">
              <span className="pp-brain-orb" aria-hidden="true" />
              <b>Here’s what I heard</b>
              <span className={`pp-brain-src pp-brain-src-${heard.source}`}>{heard.source === 'gmi' ? '✨ GMI Cloud' : 'matched'}</span>
            </div>
            {heard.summary && <p className="pp-brain-summary">“{heard.summary}”</p>}
            {heard.personalization && <p className="pp-brain-personal">I’ll honor: <b>{heard.personalization}</b></p>}
            <div className="pp-brain-go">
              <span>→ Starting <b>{heard.scenario.title}</b></span>
              <button className="pp-btn pp-btn-primary" onClick={() => onRun(heard.scenario)} disabled={!canRun} aria-disabled={!canRun}>Run now →</button>
            </div>
          </div>
        )}
      </section>

      <section className="pp-examples">
        <div className="pp-examples-head">
          <div className="pp-funnel-label pp-scenarios-label">Or start from an example</div>
          <div className="pp-examples-nav">
            <button className="pp-arrow" onClick={() => scrollEx(-1)} aria-label="Previous examples">‹</button>
            <button className="pp-arrow" onClick={() => scrollEx(1)} aria-label="Next examples">›</button>
          </div>
        </div>
        <div className="pp-examples-track" ref={exRef}>
          {SCENARIOS.map((s, i) => (
            <button key={s.id} className="pp-example-card" onClick={() => onRun(s)} disabled={!canRun} aria-disabled={!canRun}>
              <span className="pp-scenario-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="pp-scenario-title">{s.title}</span>
              <span className="pp-scenario-tag">{s.tagline}</span>
              {s.tools && (
                <div className="pp-example-tools">
                  {s.tools.slice(0, 4).map((t) => <span key={t.name} className="pp-example-tool">{t.name}</span>)}
                  {s.tools.length > 4 && <span className="pp-example-tool pp-example-tool-more">+{s.tools.length - 4}</span>}
                </div>
              )}
              <span className="pp-scenario-cta">Run scenario →</span>
            </button>
          ))}
        </div>
      </section>

      <section className="pp-sponsors">
        <span className="pp-sponsors-label">Powered by</span>
        <div className="pp-sponsor-row">
          {SPONSORS.map((s) => (
            <div key={s.name} className="pp-sponsor">
              <span className="pp-sponsor-role">{s.role}</span>
              <span className="pp-sponsor-name">{s.name}</span>
              <span className="pp-sponsor-note">{s.note}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pp-pillars">
        <div className="pp-kicker">Why Passport advances the infrastructure for safe agent adoption</div>
        <div className="pp-pillar-grid">
          {PILLARS.map((p) => (
            <div key={p.k} className="pp-pillar">
              <b>{p.k}</b>
              <span>{p.d}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pp-usecases">
        <div className="pp-kicker">More flows Passport governs</div>
        <div className="pp-usecase-grid">
          {SECONDARY_USE_CASES.map((u) => {
            const target = u.maps_to && u.maps_to !== 'any' ? getScenario(u.maps_to) : null
            return (
              <div key={u.id} className="pp-usecase">
                <div className="pp-usecase-head">
                  <b>{u.title}</b>
                  <span className={`pp-usecase-badge pp-usecase-${u.status}`}>{u.status === 'live' ? 'in a live scenario' : 'card'}</span>
                </div>
                <p className="pp-usecase-prompt">“{u.prompt}”</p>
                <div className="pp-usecase-safety">🛡 {u.safety_angle}</div>
                {target && (
                  <button className="pp-usecase-link" onClick={() => onRun(target)} disabled={!canRun} aria-disabled={!canRun}>
                    See it in “{target.title}” →
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
