import { useEffect, useRef, useState } from 'react'
import type { PassportSnapshot } from '../../engine/session'
import type { ConformanceCheck } from '../../engine/intentMonitor'
import './intentConformanceMonitor.css'

/**
 * IntentConformanceMonitor — the signature "is the agent still doing what it said?" instrument.
 *
 * Renders the DECLARED INTENT as a sealed envelope/boundary, and the agent's actions tracking
 * inside it in real time from `snapshot.conformance`. Each conformance check streams in (mono
 * action + capability + verdict), staying green while conforming. When a check has
 * severity 'block' / verdict 'diverged' (the injection), the action is shown lunging past the
 * intent boundary and being snapped back / locked out — the monitor flips to CONTAINED.
 *
 * Consumes the engine snapshot via props. Self-contained, no external state.
 */
export function IntentConformanceMonitor({ snap }: { snap: PassportSnapshot }) {
  const conf = snap.conformance
  const checks = conf?.checks ?? []
  const envelope = conf?.envelope ?? []
  const contained = conf?.state === 'contained'

  // --- streaming reveal: progressively disclose checks as they "arrive" ----------------------
  const [revealed, setRevealed] = useState(0)
  const prevCount = useRef(0)

  useEffect(() => {
    // When new checks appear in the snapshot, stream them in one at a time for a live feel.
    if (checks.length <= revealed) {
      // snapshot shrank (new run) → reset.
      if (checks.length < prevCount.current) setRevealed(checks.length)
      prevCount.current = checks.length
      return
    }
    prevCount.current = checks.length
    const t = setTimeout(() => setRevealed((r) => Math.min(r + 1, checks.length)), 460)
    return () => clearTimeout(t)
  }, [checks.length, revealed])

  const shown = checks.slice(0, revealed)

  // The index of the first blocking divergence — the containment beat.
  // Computed directly (NOT useMemo): the engine mutates the same conformanceChecks array in
  // place, so its reference is stable across snapshots — a useMemo keyed on [checks] would
  // capture the empty first render and never recompute, leaving the monitor stuck on
  // "resolving divergence…" forever.
  const breachIndex = checks.findIndex((c) => c.severity === 'block')
  const breachShown = breachIndex >= 0 && breachIndex < revealed
  const breach = breachShown ? checks[breachIndex] : null

  const total = checks.length
  const conformingCount = checks.filter((c) => c.verdict === 'conforming').length
  const divergedCount = total - conformingCount

  const empty = total === 0

  return (
    <section
      className={`icm ${breachShown ? 'icm--contained' : 'icm--conforming'}`}
      aria-label="Intent conformance monitor"
    >
      <header className="icm-head">
        <div className="icm-head-l">
          <span className="icm-kicker">Runtime · Intent conformance</span>
          <h3 className="icm-title">Is the agent still doing what it said?</h3>
        </div>
        <StateBadge contained={breachShown} />
      </header>

      {/* declared intent — the sealed envelope */}
      <div className="icm-intent">
        <div className="icm-intent-tab">
          <LockGlyph sealed={!breachShown} />
          <span className="icm-intent-tab-label">Declared intent</span>
        </div>
        <p className="icm-intent-text">
          {empty ? 'No intent declared for this run yet.' : conf.intent}
        </p>
        {envelope.length > 0 && (
          <div className="icm-envelope">
            <span className="icm-envelope-label">Justified envelope</span>
            <div className="icm-envelope-caps">
              {envelope.map((cap) => (
                <code key={cap} className="icm-cap-pill">
                  {cap}
                </code>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* live conformance progress */}
      <div className="icm-meter">
        <div className="icm-meter-row">
          <span className="icm-meter-stat">
            <b className="icm-num icm-num--ok">{conformingCount}</b> conforming
          </span>
          <span className="icm-meter-sep" />
          <span className="icm-meter-stat">
            <b className={`icm-num ${divergedCount ? 'icm-num--bad' : ''}`}>{divergedCount}</b> diverged
          </span>
          <span className="icm-meter-spacer" />
          <span className="icm-meter-count">
            {revealed}/{total || 0} actions judged
          </span>
        </div>
        <div className="icm-track" aria-hidden>
          {checks.map((c, i) => (
            <span
              key={c.id}
              className={
                'icm-tick' +
                (i >= revealed ? ' icm-tick--pending' : '') +
                (c.severity === 'block' ? ' icm-tick--block' : '') +
                (c.verdict === 'conforming' ? ' icm-tick--ok' : ' icm-tick--warn')
              }
            />
          ))}
        </div>
      </div>

      {/* the action stream — inside the boundary, until one lunges out */}
      <div className="icm-stream">
        {empty && (
          <p className="icm-empty">
            Waiting for the agent to act. Every action it takes will be judged against the
            declared intent in real time.
          </p>
        )}
        {shown.map((c, i) => (
          <CheckRow key={c.id} check={c} isBreach={i === breachIndex} />
        ))}
      </div>

      {/* the containment verdict — the dramatic beat */}
      {breach && <ContainmentBanner check={breach} intent={conf.intent} />}

      {contained && !breachShown && (
        // engine says contained but the breaching check hasn't streamed in yet — hold the line.
        <div className="icm-pending-contain mono">resolving divergence…</div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------------------------------- */

function StateBadge({ contained }: { contained: boolean }) {
  return (
    <div
      className={`icm-badge ${contained ? 'icm-badge--contained' : 'icm-badge--conforming'}`}
      role="status"
    >
      <span className="icm-badge-dot" />
      <span className="icm-badge-text mono">{contained ? 'CONTAINED' : 'CONFORMING'}</span>
    </div>
  )
}

function CheckRow({ check, isBreach }: { check: ConformanceCheck; isBreach: boolean }) {
  const block = check.severity === 'block'
  return (
    <div
      className={
        'icm-row' +
        (block ? ' icm-row--block' : check.verdict === 'conforming' ? ' icm-row--ok' : ' icm-row--warn') +
        (isBreach ? ' icm-row--breach' : '')
      }
    >
      <div className="icm-row-rail" aria-hidden>
        <span className="icm-row-node" />
      </div>
      <div className="icm-row-body">
        <div className="icm-row-top">
          <span className="icm-row-action">{check.action}</span>
          <VerdictTag verdict={check.verdict} severity={check.severity} />
        </div>
        <div className="icm-row-meta">
          <code className="icm-row-cap mono">{check.capability}</code>
          <span className="icm-row-ts mono">{fmtTs(check.ts)}</span>
        </div>
        {check.verdict !== 'conforming' && (
          <p className="icm-row-reason">{check.reason}</p>
        )}
      </div>
    </div>
  )
}

function VerdictTag({
  verdict,
  severity,
}: {
  verdict: ConformanceCheck['verdict']
  severity: ConformanceCheck['severity']
}) {
  if (severity === 'block') {
    return (
      <span className="icm-tag icm-tag--block mono">
        <LockGlyph sealed small /> BLOCKED
      </span>
    )
  }
  if (verdict === 'diverged') {
    return <span className="icm-tag icm-tag--warn mono">DRIFT</span>
  }
  return (
    <span className="icm-tag icm-tag--ok mono">
      <CheckGlyph /> IN-ENVELOPE
    </span>
  )
}

function ContainmentBanner({ check, intent }: { check: ConformanceCheck; intent: string }) {
  return (
    <div className="icm-contain" role="alert">
      <div className="icm-contain-flash" aria-hidden />
      <div className="icm-contain-head">
        <div className="icm-contain-lock">
          <LockGlyph sealed />
        </div>
        <div>
          <div className="icm-contain-title mono">DIVERGENCE CONTAINED</div>
          <div className="icm-contain-sub">
            The agent stepped outside the intent it was granted. Passport refused the action
            before it could run.
          </div>
        </div>
      </div>
      <div className="icm-contain-detail">
        <div className="icm-contain-line">
          <span className="icm-contain-k mono">action</span>
          <span className="icm-contain-v">{check.action}</span>
        </div>
        <div className="icm-contain-line">
          <span className="icm-contain-k mono">requested</span>
          <code className="icm-contain-v mono icm-contain-cap">{check.capability}</code>
        </div>
        <div className="icm-contain-line">
          <span className="icm-contain-k mono">intent</span>
          <span className="icm-contain-v icm-contain-intent">“{intent}”</span>
        </div>
        <p className="icm-contain-reason">{check.reason}</p>
      </div>
    </div>
  )
}

/* --- tiny inline glyphs (no emoji) --------------------------------------------------------- */

function LockGlyph({ sealed, small }: { sealed: boolean; small?: boolean }) {
  const s = small ? 11 : 14
  return (
    <svg
      className="icm-glyph"
      width={s}
      height={s}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <rect x="3" y="7" width="10" height="7" rx="1.6" className="icm-glyph-body" />
      <path
        d={sealed ? 'M5 7V5a3 3 0 0 1 6 0v2' : 'M5 7V5a3 3 0 0 1 5.6-1.4'}
        className="icm-glyph-shackle"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function fmtTs(ts: number): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}
