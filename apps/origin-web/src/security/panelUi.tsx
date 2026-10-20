// Shared presentation only; verifier results are supplied by each live panel.
import type { ReactNode } from 'react'

type Tone = 'ok' | 'bad' | 'info'
export interface Step {
  tone: Tone
  label: string
  text: string
}
function Pill({ tone }: { tone: Tone }) {
  const txt = tone === 'ok' ? 'pass' : tone === 'bad' ? 'blocked' : 'note'
  return <span className={`sec-pill sec-pill--${tone}`}>{txt}</span>
}

export function Log({ steps, status = false }: { steps: Step[]; status?: boolean }) {
  if (steps.length === 0) return null
  const log = (
    <ul className="sec-log" aria-live={status ? undefined : 'polite'}>
      {steps.map((s, i) => (
        <li key={i}>
          <Pill tone={s.tone} />
          <span>
            <b>{s.label}</b> — {s.text}
          </span>
        </li>
      ))}
    </ul>
  )
  return status ? <div role="status" aria-live="polite">{log}</div> : log
}

export function DemoCard(props: { id: string; kicker: string; title: string; lede: string; children: ReactNode }) {
  return (
    <article className="card sec-card" id={props.id} aria-labelledby={`${props.id}-title`}>
      <p className="kicker">{props.kicker}</p>
      <h2 id={`${props.id}-title`} style={{ marginTop: 6 }}>{props.title}</h2>
      <p className="section__lede" style={{ marginTop: 8 }}>
        {props.lede}
      </p>
      {props.children}
    </article>
  )
}
