import { useEffect, useRef } from 'react'
import type { AgentView, CollabMsg } from '../../types'
import type { PassportSnapshot } from '../../engine/session'
import { Section } from '../bits'

const STATUS_LABEL: Record<AgentView['status'], string> = {
  idle: 'idle',
  thinking: 'thinking',
  working: 'working',
  waiting: 'waiting',
  done: 'done',
}

const PHASE_LABEL: Record<string, string> = {
  thinking: 'reasoning about the step',
  authorizing: 'asking Passport for the capability',
  working: 'doing the work',
  escalating: 'escalating to you for approval',
}

function Avatar({ a, active }: { a: AgentView; active: boolean }) {
  return (
    <span
      className={`pp-ava pp-ava-${a.status} ${active ? 'pp-ava-active' : ''}`}
      style={{ ['--hue' as string]: a.hue }}
      title={`${a.name} — ${STATUS_LABEL[a.status]}`}
    >
      <span className="pp-ava-mono">{a.mono}</span>
      {(a.status === 'thinking' || a.status === 'working') && (
        <span className="pp-ava-dots" aria-hidden="true"><i /><i /><i /></span>
      )}
      {a.status === 'done' && <span className="pp-ava-check" aria-hidden="true">✓</span>}
    </span>
  )
}

export function AgentCollab({ snap }: { snap: PassportSnapshot }) {
  const { agents, collab, activeAgentId, activePhase, status } = snap
  const byId = new Map(agents.map((a) => [a.id, a]))
  const streamRef = useRef<HTMLDivElement>(null)
  const active = activeAgentId ? byId.get(activeAgentId) : undefined

  // Keep the newest hand-off in view.
  useEffect(() => {
    const el = streamRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [collab.length, activePhase])

  const phaseChip =
    status === 'revoked' ? (
      <span className="pp-phase pp-phase-stop">stood down</span>
    ) : active && activePhase ? (
      <span className="pp-phase pp-phase-live">
        <span className="pp-phase-pulse" aria-hidden="true" />
        {active.name} · {PHASE_LABEL[activePhase] ?? activePhase}
      </span>
    ) : status === 'completed' ? (
      <span className="pp-phase pp-phase-done">done · nothing irreversible ran</span>
    ) : null

  return (
    <Section
      kicker="Live · agents collaborating"
      title="A team of agents, working under one Passport"
      aside={phaseChip}
    >
      <div className="pp-roster">
        {agents.map((a) => (
          <div key={a.id} className="pp-roster-cell">
            <Avatar a={a} active={a.id === activeAgentId} />
            <div className="pp-roster-meta">
              <span className="pp-roster-name">{a.name}</span>
              <span className="pp-roster-role">{a.role}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="pp-stream" ref={streamRef} aria-live="polite">
        {collab.length === 0 ? (
          <div className="pp-empty">The team is forming…</div>
        ) : (
          collab.map((m) => <Handoff key={m.id} m={m} byId={byId} />)
        )}
        {active && activePhase && status !== 'revoked' && (
          <div className="pp-think">
            <Avatar a={active} active />
            <span className="pp-think-text">
              {active.name} is {PHASE_LABEL[activePhase] ?? activePhase}
              <span className="pp-think-dots" aria-hidden="true"><i /><i /><i /></span>
            </span>
          </div>
        )}
      </div>
    </Section>
  )
}

function Handoff({ m, byId }: { m: CollabMsg; byId: Map<string, AgentView> }) {
  const from = byId.get(m.from)
  const to = byId.get(m.to)
  const selfNote = m.from === m.to
  return (
    <div className={`pp-hand pp-hand-${m.kind}`}>
      <span className="pp-hand-from">{from?.mono ?? m.from}</span>
      {!selfNote && (
        <>
          <span className="pp-hand-arrow" aria-hidden="true">→</span>
          <span className="pp-hand-to">{to?.mono ?? m.to}</span>
        </>
      )}
      <span className="pp-hand-text">{m.text}</span>
      <span className={`pp-hand-kind pp-hand-kind-${m.kind}`}>{m.kind}</span>
    </div>
  )
}
