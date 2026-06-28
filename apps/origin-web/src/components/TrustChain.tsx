// Presentational "how the verdict is earned" chain — the 30-second story for judges.
// Color-codes who is responsible at each step: you (declared/approved), AI (proposed),
// or the deterministic oracle (scored). No logic, no data, no spend. Used on the sample
// report (full) and the live results page (compact).

const STEPS: { k: string; who: 'you' | 'ai' | 'oracle'; d: string }[] = [
  { k: 'Input declared', who: 'you', d: 'Your text, video, photos, floor plan, and safety rules.' },
  { k: 'AI draft', who: 'ai', d: 'A proposed site map, storyboard, and rules — never the judge.' },
  { k: 'Human approval', who: 'you', d: 'You edit and confirm what the system understood.' },
  { k: 'Frozen workflow', who: 'you', d: 'An approved, hashed snapshot of the workflow.' },
  { k: 'Oracle labels', who: 'oracle', d: 'A fixed algorithm sets finish / escalate / refuse.' },
  { k: 'FAR / FRR', who: 'oracle', d: 'Calibration measured against those labels.' },
  { k: 'Evidence digest', who: 'oracle', d: 'A tamper-evident record of the run.' },
]

export function TrustChain({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`trust-chain ${compact ? 'tc-compact' : ''}`} aria-label="How the verdict is earned">
      <div className="panel-kicker">How the verdict is earned</div>
      <ol className="tc-flow">
        {STEPS.map((s) => (
          <li key={s.k} className={`tc-node tc-${s.who}`}>
            <span className="tc-k">{s.k}</span>
            {!compact && <span className="tc-d">{s.d}</span>}
          </li>
        ))}
      </ol>
      <div className="tc-legend">
        <span className="tc-leg tc-leg-ai">AI-proposed</span>
        <span className="tc-leg tc-leg-you">Confirmed by you</span>
        <span className="tc-leg tc-leg-oracle">Scored by the oracle</span>
      </div>
    </section>
  )
}
