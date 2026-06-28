// The signature moment: a single DARK panel in Step 2 that streams the brain's
// plan → verify → repair, with each proposed call color-coded by its eventual
// finish / escalate / refuse verdict (the triad through-line). Built from the
// operator's own drafted rules — an honest illustration; the deterministic oracle
// scores the frozen workflow next (and live-streams from the brain when connected).

import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkflowUnderstanding } from '../../workflowDraft'

type Verdict = 'finish' | 'escalate' | 'refuse'
type Line =
  | { kind: 'stage'; text: string }
  | { kind: 'step'; text: string }
  | { kind: 'rule'; verdict: Verdict; text: string }
  | { kind: 'repair'; text: string }
  | { kind: 'done'; text: string }

const VERDICT_LABEL: Record<Verdict, string> = { finish: 'FINISH', escalate: 'ESCALATE', refuse: 'REFUSE' }

function buildLines(draft: WorkflowUnderstanding): Line[] {
  const lines: Line[] = [{ kind: 'stage', text: 'Reading the submitted site…' }]
  for (const s of draft.storyboard.slice(0, 4)) lines.push({ kind: 'step', text: s.text })
  lines.push({ kind: 'stage', text: 'Proposing the finish / escalate / refuse calls…' })
  for (const r of draft.finishRules.slice(0, 2)) lines.push({ kind: 'rule', verdict: 'finish', text: r.text })
  for (const r of draft.escalateRules.slice(0, 2)) lines.push({ kind: 'rule', verdict: 'escalate', text: r.text })
  for (const r of draft.refuseRules.slice(0, 2)) lines.push({ kind: 'rule', verdict: 'refuse', text: r.text })
  lines.push({ kind: 'stage', text: 'Verifying feasibility (deterministic check)…' })
  const ruleCount = draft.finishRules.length + draft.escalateRules.length + draft.refuseRules.length
  lines.push({ kind: 'repair', text: `Checked ${ruleCount} call(s) against the hard constraints · infeasible calls are gated, never scored.` })
  lines.push({ kind: 'done', text: 'Workflow drafted. The deterministic oracle scores it after you freeze.' })
  return lines
}

export function BrainStream({ draft, onDone }: { draft: WorkflowUnderstanding; onDone: () => void }) {
  const lines = useMemo(() => buildLines(draft), [draft])
  // Reduced-motion: reveal everything immediately (no streaming animation).
  const [shown, setShown] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? lines.length
      : 0,
  )
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const doneFired = useRef(false)

  useEffect(() => {
    if (shown >= lines.length) return
    const t = window.setInterval(() => {
      setShown((s) => {
        if (s >= lines.length) {
          window.clearInterval(t)
          return s
        }
        return s + 1
      })
    }, 420)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
    if (shown >= lines.length && !doneFired.current) {
      doneFired.current = true
      onDone()
    }
  }, [shown, lines.length, onDone])

  const streaming = shown < lines.length

  return (
    <div className="brainstream" aria-label="Building the robot brain — plan, verify, repair">
      <div className="bs-head">
        <span className="bs-dot" aria-hidden="true" />
        <span className="bs-title">Build the robot brain · plan → verify → repair</span>
        <span className="bs-tag">{streaming ? 'streaming' : 'verified'}</span>
      </div>
      <div className="bs-body" ref={bodyRef}>
        {lines.slice(0, shown).map((l, i) => {
          if (l.kind === 'stage') return <div className="bs-line bs-stage" key={i}><span className="bs-prompt">›</span> {l.text}</div>
          if (l.kind === 'step') return <div className="bs-line bs-step" key={i}><span className="bs-bullet">•</span> {l.text}</div>
          if (l.kind === 'repair') return <div className="bs-line bs-repair" key={i}><span className="bs-check">✓</span> {l.text}</div>
          if (l.kind === 'done') return <div className="bs-line bs-done" key={i}><span className="bs-check">✓</span> {l.text}</div>
          return (
            <div className={`bs-line bs-rule bs-${l.verdict}`} key={i}>
              <span className="bs-verdict">{VERDICT_LABEL[l.verdict]}</span>
              <span className="bs-rule-text">{l.text}</span>
            </div>
          )
        })}
        {streaming && <span className="bs-cursor" aria-hidden="true" />}
      </div>
      <div className="bs-foot" aria-hidden="true">
        <span className="bs-legend bs-finish">finish</span>
        <span className="bs-legend bs-escalate">escalate</span>
        <span className="bs-legend bs-refuse">refuse</span>
        <span className="bs-foot-note">Illustrative trace — the deterministic oracle is the judge.</span>
      </div>
    </div>
  )
}
