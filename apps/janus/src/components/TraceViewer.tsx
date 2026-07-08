import type { Trace } from '../types'

interface Props {
  traces: Trace[]
}

/** Renders each episode as the canonical flow:
 *  scenario → action → verifier → reward → license signal. */
export function TraceViewer({ traces }: Props) {
  return (
    <div className="trace-viewer">
      <div className="trace-head">
        <h2>Traces</h2>
        <span className="muted">{traces.length} episode(s) recorded</span>
      </div>

      {traces.length === 0 ? (
        <p className="placeholder">No traces yet. Run an episode to record one.</p>
      ) : (
        <div className="trace-list">
          {[...traces].reverse().map((t) => (
            <div key={t.id} className={`trace-row ${t.result.passed ? 'row-pass' : 'row-fail'}`}>
              <span className="trace-ep">#{t.displayIndex ?? t.episode}</span>
              <span
                className={`auth-tag ${
                  t.authority === 'server_authoritative_episode' ? 'auth-server' : 'auth-demo'
                }`}
                title={
                  t.authority === 'server_authoritative_episode'
                    ? 'Server-authoritative episode (persisted evidence)'
                    : 'Demo client trace (not authoritative)'
                }
              >
                {t.authority === 'server_authoritative_episode' ? 'server' : 'demo'}
              </span>
              <span className="trace-flow">
                <span className="flow-node scenario">{t.scenario.title}</span>
                <span className="flow-arrow">→</span>
                <span className={`flow-node action action-${t.decision.action}`}>
                  {t.decision.action.toUpperCase()}
                </span>
                <span className="flow-arrow">→</span>
                <span className={`flow-node verdict ${t.result.passed ? 'ok' : 'bad'}`}>
                  {t.result.passed ? 'PASS' : 'FAIL'}
                  {t.result.catastrophic ? ' ⚠' : ''}
                </span>
                <span className="flow-arrow">→</span>
                <span
                  className={`flow-node reward ${
                    t.result.reward > 0 ? 'pos' : t.result.reward < 0 ? 'neg' : 'zero'
                  }`}
                >
                  {t.result.reward > 0 ? '+' : ''}
                  {t.result.reward.toFixed(2)}
                </span>
                <span className="flow-arrow">→</span>
                <span className="flow-node signal">{t.licenseSignal}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
