import type { AuditActor } from '../../types'
import type { JanusSnapshot } from '../../engine/session'
import { Section } from '../bits'
import { clockTime, shortDigest } from '../format'

const ACTOR_LABEL: Record<AuditActor, string> = { user: 'You', agent: 'Agent', janus: 'Janus', tool: 'Tool' }

export function AuditTraceViewer({ snap }: { snap: JanusSnapshot }) {
  const { audit } = snap
  return (
    <Section
      kicker="9 · Audit trace"
      title="Every delegated action is traceable"
      aside={<span className="pp-digest mono" title="SHA-256 hash chain of the full event log">⛓ {shortDigest(audit.digest)}</span>}
    >
      <ul className="pp-audit">
        {audit.events.map((e) => (
          <li key={e.event_id} className={`pp-audit-row pp-audit-${e.decision}`}>
            <span className="pp-audit-time mono">{clockTime(e.ts)}</span>
            <span className={`pp-audit-actor pp-actor-${e.actor}`}>{ACTOR_LABEL[e.actor]}</span>
            <span className="pp-audit-summary">{e.summary}</span>
            {e.capability && <code className="pp-audit-cap">{e.capability}</code>}
          </li>
        ))}
      </ul>
      <div className="pp-audit-foot">
        Append-only · {audit.events.length} events · tamper-evident digest <span className="mono">{shortDigest(audit.digest)}</span>
      </div>
    </Section>
  )
}
