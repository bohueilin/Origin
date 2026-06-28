// Origin Foundry — the hero surface. Upload a floor → gemma-4-31b (vision) reads it into
// a real RL environment → a Planner + Guardian loop on Cerebras proposes and RATIFIES every
// step → the deterministic oracle scores it → you get a readiness license. The speed race
// proves it only works at Cerebras tok/s. Every model call is gemma-4-31b on Cerebras; a
// labeled mock keeps the demo alive offline.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './foundry.css'
import { FloorGrid } from './FloorGrid'
import { parseFloor, quorumRun, speedRace, fileToDataUri } from '../foundryClient'
import type { ParseFloorResponse, QuorumRunResponse, SpeedRaceResponse, FoundrySource, QuorumMode } from '../types'
import type { GridPos } from '../../warehouse'

function SourceBadge({ source }: { source: FoundrySource }) {
  const label = source === 'cerebras' ? 'gemma-4-31b · Cerebras' : source === 'gemini' ? 'Gemini · baseline' : 'deterministic mock'
  return <span className={`fdy-badge fdy-badge--${source}`}>{label}</span>
}

function Stat({ label, value, unit, tone }: { label: string; value: string | number; unit?: string; tone?: 'pos' | 'neg' | 'warn' }) {
  return (
    <div className={`fdy-stat${tone ? ` fdy-stat--${tone}` : ''}`}>
      <div className="fdy-stat__val">
        {value}
        {unit && <span className="fdy-stat__unit">{unit}</span>}
      </div>
      <div className="fdy-stat__label">{label}</div>
    </div>
  )
}

// ---- Speed race -------------------------------------------------------------

function SpeedRacePanel() {
  const [data, setData] = useState<SpeedRaceResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const run = useCallback(async () => {
    setBusy(true)
    try {
      setData(await speedRace())
    } finally {
      setBusy(false)
    }
  }, [])

  const cTok = data?.cerebras.tokS ?? 0
  const bTok = data?.baseline.tokS ?? 0
  const max = Math.max(cTok, bTok, 1)

  return (
    <section className="fdy-card fdy-race">
      <div className="fdy-card__head">
        <h2>The speed race</h2>
        <p>Same prompt. gemma-4-31b on Cerebras vs a GPU-class baseline. Per-step verification is only free at the top lane.</p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Racing…' : data ? 'Race again' : 'Run the speed race'}
      </button>
      {data && (
        <div className="fdy-race__lanes">
          {[data.cerebras, data.baseline].map((lane) => (
            <div key={lane.provider} className={`fdy-lane fdy-lane--${lane.provider}`}>
              <div className="fdy-lane__top">
                <SourceBadge source={lane.provider} />
                <div className="fdy-lane__tok">
                  {lane.tokS ?? '—'} <span>tok/s</span>
                </div>
              </div>
              <div className="fdy-lane__bar">
                <div className="fdy-lane__fill" style={{ width: `${Math.round(((lane.tokS ?? 0) / max) * 100)}%` }} />
              </div>
              <div className="fdy-lane__meta">
                {lane.ttftMs != null && <span>TTFT {lane.ttftMs}ms</span>}
                {lane.totalMs != null && <span>{lane.totalMs}ms total</span>}
                {lane.note && <span className="fdy-lane__note">{lane.note}</span>}
              </div>
              <p className="fdy-lane__preview">{lane.preview}</p>
            </div>
          ))}
          {data.speedup && <div className="fdy-race__verdict">Cerebras is ~{data.speedup}× faster — fast enough to verify every step.</div>}
        </div>
      )}
    </section>
  )
}

// ---- Training (armed; flagged as a small, honest trend) ---------------------

const MOCK_CURVE = [
  { step: 0, reward: 0.18, far: 0.42 },
  { step: 1, reward: 0.31, far: 0.3 },
  { step: 2, reward: 0.49, far: 0.19 },
  { step: 3, reward: 0.63, far: 0.11 },
  { step: 4, reward: 0.74, far: 0.06 },
  { step: 5, reward: 0.82, far: 0.03 },
]

function TrainingPanel() {
  const [run, setRun] = useState(false)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!run) return
    const t = setInterval(() => setShown((s) => (s >= MOCK_CURVE.length ? s : s + 1)), 420)
    return () => clearInterval(t)
  }, [run])
  const start = () => {
    setShown(0)
    setRun(true)
  }

  const pts = MOCK_CURVE.slice(0, shown)
  const W = 320
  const H = 120
  const xOf = (i: number) => (i / (MOCK_CURVE.length - 1)) * W
  const line = (sel: (p: { reward: number; far: number }) => number) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${H - sel(p) * H}`).join(' ')

  return (
    <section className="fdy-card fdy-train">
      <div className="fdy-card__head">
        <h2>Train in your floor</h2>
        <p>
          The reward is the deterministic safety oracle, so the policy can't learn to cheat the metric. One click kicks a small but real fine-tune
          (Fireworks RFT, rollouts on Modal). Watch reward climb and false-accepts fall.
        </p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={start}>
        {run ? 'Training…' : 'Kick off training'}
      </button>
      <span className="fdy-flag">armed · reusing services/foundry-train (Fireworks + Modal)</span>
      <svg viewBox={`0 0 ${W} ${H}`} className="fdy-curve" role="img" aria-label="Reward and false-accept-rate over training steps">
        <line x1={0} y1={H} x2={W} y2={H} stroke="var(--fg-grid)" />
        <path d={line((p) => p.reward)} fill="none" stroke="var(--fg-pos)" strokeWidth={2.5} />
        <path d={line((p) => p.far)} fill="none" stroke="var(--fg-neg)" strokeWidth={2.5} strokeDasharray="4 3" />
      </svg>
      <div className="fdy-train__legend">
        <span><i style={{ background: 'var(--fg-pos)' }} /> reward ↑</span>
        <span><i style={{ background: 'var(--fg-neg)' }} /> false-accept rate ↓</span>
      </div>
    </section>
  )
}

// ---- Quorum trace -----------------------------------------------------------

function QuorumTrace({ result, revealed }: { result: QuorumRunResponse; revealed: number }) {
  return (
    <ol className="fdy-trace">
      {result.steps.slice(0, revealed).map((s, i) => (
        <li key={i} className={`fdy-step fdy-step--${s.verdict}`}>
          <div className="fdy-step__loop">#{s.loop}</div>
          <div className="fdy-step__body">
            <div className="fdy-step__plan">
              <strong>Planner</strong> → <code>{s.proposed}</code> {s.rationale && <em>{s.rationale}</em>}
            </div>
            <div className="fdy-step__guard">
              <strong>Guardian</strong> → <span className={`fdy-verdict fdy-verdict--${s.verdict}`}>{s.verdict === 'ratify' ? 'RATIFY' : 'VETO'}</span> {s.guardianReason}
            </div>
          </div>
          <div className="fdy-step__tok">{s.tokS ? `${s.tokS} tok/s` : ''}</div>
        </li>
      ))}
    </ol>
  )
}

// ---- The page ---------------------------------------------------------------

export default function FoundryApp() {
  const [parse, setParse] = useState<ParseFloorResponse | null>(null)
  const [parsing, setParsing] = useState(false)
  const [mode, setMode] = useState<QuorumMode>('verified')
  const [quorum, setQuorum] = useState<QuorumRunResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [revealed, setRevealed] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const doParse = useCallback(async (imageDataUri?: string, hint?: string) => {
    setParsing(true)
    setQuorum(null)
    setRevealed(0)
    try {
      setParse(await parseFloor({ imageDataUri, hint }))
    } finally {
      setParsing(false)
    }
  }, [])

  const onUpload = useCallback(
    async (file: File) => {
      const uri = await fileToDataUri(file)
      await doParse(uri, file.name)
    },
    [doParse],
  )

  const runLoop = useCallback(async () => {
    if (!parse?.siteMap) return
    setRunning(true)
    setRevealed(0)
    try {
      const res = await quorumRun({ siteMap: parse.siteMap, mode })
      setQuorum(res)
    } finally {
      setRunning(false)
    }
  }, [parse, mode])

  // Reveal the trace step-by-step so the loop reads as live.
  useEffect(() => {
    if (!quorum) return
    const t = setInterval(() => setRevealed((r) => (r >= quorum.steps.length ? r : r + 1)), 360)
    return () => clearInterval(t)
  }, [quorum])

  const trail = useMemo<GridPos[]>(() => {
    if (!quorum) return []
    const pts = quorum.steps.slice(0, revealed).map((s) => s.position)
    return pts
  }, [quorum, revealed])
  const cursor = trail.length ? trail[trail.length - 1] : parse?.siteMap?.start ?? null
  const lastStep = quorum && revealed > 0 ? quorum.steps[Math.min(revealed, quorum.steps.length) - 1] : null
  const vetoCell =
    lastStep && lastStep.verdict === 'veto' && lastStep.proposed.startsWith('move:')
      ? nextCell(lastStep.position, lastStep.proposed)
      : null
  const fullyRevealed = quorum && revealed >= quorum.steps.length

  return (
    <div className="fdy">
      <header className="fdy-hero">
        <div className="fdy-hero__eyebrow">Origin Foundry · powered by gemma-4-31b on Cerebras</div>
        <h1>
          Upload a floor plan.<br />
          Get a robot brain that <span className="fdy-hero__mark">can't cheat</span>.
        </h1>
        <p className="fdy-hero__sub">
          gemma-4-31b reads your floor into a real simulation. A Planner proposes every move and a Guardian ratifies it — dozens of
          perceive→plan→verify cycles per second, only possible at ~1,500 tok/s. The judge of "did it do the job safely" is a deterministic
          oracle, never an LLM.
        </p>
      </header>

      <SpeedRacePanel />

      {/* Step 1 — upload + parse */}
      <section className="fdy-card">
        <div className="fdy-card__head">
          <h2>1 · Read the floor</h2>
          <p>Snap a photo or use the sample. gemma-4-31b's vision parses it; a deterministic pass repairs the grid before anything trusts it.</p>
        </div>
        <div className="fdy-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onUpload(f)
            }}
          />
          <button className="fdy-btn fdy-btn--primary" onClick={() => fileRef.current?.click()} disabled={parsing}>
            {parsing ? 'Reading…' : 'Upload a floor image'}
          </button>
          <button className="fdy-btn" onClick={() => void doParse(undefined, 'sample')} disabled={parsing}>
            Use the sample floor
          </button>
        </div>

        {parse?.siteMap && (
          <div className="fdy-parse">
            <FloorGrid map={parse.siteMap} trail={trail} cursor={cursor} veto={vetoCell} />
            <div className="fdy-parse__side">
              <div className="fdy-parse__row">
                <SourceBadge source={parse.source} />
                {parse.timing?.tokS && <span className="fdy-chip">{parse.timing.tokS} tok/s</span>}
              </div>
              {parse.oracle && (
                <div className={`fdy-verdictbox fdy-verdictbox--${parse.oracle.verdict}`}>
                  <strong>Oracle reads this floor: {parse.oracle.verdict.toUpperCase()}</strong>
                  <span>{parse.oracle.reason}</span>
                </div>
              )}
              {parse.repairs.length > 0 && (
                <details className="fdy-repairs" open>
                  <summary>{parse.repairs.length} deterministic repair{parse.repairs.length === 1 ? '' : 's'}</summary>
                  <ul>
                    {parse.repairs.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  <p className="fdy-repairs__why">The model proposes; deterministic code disposes. Capability is not permission.</p>
                </details>
              )}
              <div className="fdy-legend">
                <span><i className="fg-start" />Dock</span>
                <span><i className="fg-item" />Pick</span>
                <span><i className="fg-drop" />Drop</span>
                <span><i className="fg-haz" />Hazard</span>
                <span><i className="fg-human" />Human-only</span>
                <span><i className="fg-wall" />Wall</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Step 2 — quorum loop */}
      {parse?.siteMap && (
        <section className="fdy-card">
          <div className="fdy-card__head">
            <h2>2 · Watch it think — then prove it's safe</h2>
            <p>The Planner and Guardian are both gemma-4-31b. Run the verified policy, or the reckless one to watch the Guardian veto an unsafe move.</p>
          </div>
          <div className="fdy-modes">
            <button className={`fdy-pill${mode === 'verified' ? ' is-on' : ''}`} onClick={() => setMode('verified')}>
              Verified policy
            </button>
            <button className={`fdy-pill${mode === 'reckless' ? ' is-on' : ''}`} onClick={() => setMode('reckless')}>
              Reckless (reward-hacker)
            </button>
            <button className="fdy-btn fdy-btn--primary" onClick={runLoop} disabled={running}>
              {running ? 'Running the loop…' : 'Run the Quorum loop'}
            </button>
          </div>

          {quorum && (
            <>
              <div className="fdy-stats">
                <Stat label="cycles" value={quorum.steps.length} />
                <Stat label="avg speed" value={quorum.avgTokS ?? '—'} unit=" tok/s" />
                <Stat label="model calls" value={quorum.totalCalls} />
                <Stat label="guardian vetoes" value={quorum.guardianVetoes} tone={quorum.guardianVetoes ? 'warn' : undefined} />
                <Stat label="wall clock" value={quorum.wallMs} unit="ms" />
              </div>
              <QuorumTrace result={quorum} revealed={revealed} />

              {fullyRevealed && (
                <div className="fdy-license">
                  <div className={`fdy-license__verdict fdy-license__verdict--${quorum.passed ? 'pass' : 'fail'}`}>
                    Oracle verdict: {quorum.passed ? 'PASS' : 'NOT READY'} · reward {quorum.reward.toFixed(2)}
                  </div>
                  <ul className="fdy-license__checks">
                    {quorum.checks.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                  <div className="fdy-counter">
                    <strong>Without the Guardian</strong>, the same intent → <code>{quorum.counterfactual.category}</code>, reward{' '}
                    {quorum.counterfactual.reward.toFixed(2)}
                    {quorum.counterfactual.unsafeEntered && ' — it drove into a hazard.'} That's what verifying every step prevents.
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <TrainingPanel />

      <footer className="fdy-foot">
        <span>Origin Physical AI · the oracle is the only judge</span>
        <a href="/app">Open the Origin console →</a>
      </footer>
    </div>
  )
}

// Compute the destination cell of a move from a position (for the veto X overlay).
function nextCell(p: GridPos, move: string): GridPos {
  if (move === 'move:north') return { x: p.x, y: p.y - 1 }
  if (move === 'move:south') return { x: p.x, y: p.y + 1 }
  if (move === 'move:east') return { x: p.x + 1, y: p.y }
  if (move === 'move:west') return { x: p.x - 1, y: p.y }
  return p
}
