import type { JanusSnapshot } from '../../engine/session'
import { Section } from '../bits'
import { clockTime } from '../format'

export function ToolActivityFeed({ snap }: { snap: JanusSnapshot }) {
  const { toolCalls } = snap
  return (
    <Section kicker="6 · Tool activity" title="Every call, authorized before it runs" aside={<span className="pp-count">{toolCalls.length} calls</span>}>
      {toolCalls.length === 0 ? (
        <div className="pp-empty">No tool calls yet.</div>
      ) : (
        <ul className="pp-feed">
          {toolCalls.map((t) => {
            const result = snap.results[t.tool_name]
            const sim = Boolean(result?.simulated)
            return (
              <li key={t.tool_call_id} className={`pp-feed-row pp-feed-${t.status}`}>
                <span className="pp-feed-time mono">{clockTime(t.timestamp)}</span>
                <span className={`pp-feed-verdict pp-feed-verdict-${t.status}`}>
                  {t.status === 'ok' ? 'allowed' : t.status === 'denied' ? 'denied' : t.status}
                </span>
                <span className="pp-feed-tool mono">{t.tool_name}</span>
                <span className="pp-feed-out">
                  {t.output_summary}
                  {sim && <span className="pp-sim">simulated</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
