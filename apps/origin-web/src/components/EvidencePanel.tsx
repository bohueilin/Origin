import { LICENSE_LEVELS } from '../license'
import type { EvidenceStatus, HistorySource, LicenseLevelId, PersistenceStatus } from '../types'

interface Props {
  /** Live status of the most recent server-episode action. */
  status: PersistenceStatus
  /** Backend snapshot from GET /api/evidence/status (survives client reload). */
  evidence: EvidenceStatus | null
  /** Whether the evidence-status endpoint responded. */
  reached: boolean
}

const STATUS_LABEL: Record<PersistenceStatus, string> = {
  idle: 'Idle — run a server episode',
  saving: 'Saving server trace…',
  saved: 'Trace saved to InsForge',
  local_only: 'Local only — InsForge not configured',
  unavailable: 'InsForge unavailable — server trace returned locally',
}

const SOURCE_LABEL: Record<HistorySource, string> = {
  memory: 'in-memory (this server process)',
  insforge: 'InsForge (rehydrated)',
  local_only: 'local-only (InsForge not configured)',
  unavailable: 'InsForge unavailable',
  error: 'InsForge read error',
}

function licenseColor(id?: string): string | undefined {
  return id && id in LICENSE_LEVELS ? LICENSE_LEVELS[id as LicenseLevelId].color : undefined
}

export function EvidencePanel({ status, evidence, reached }: Props) {
  const configured = evidence?.persistence.configured ?? false
  const table = evidence?.persistence.table ?? 'eval_episodes'
  const summary = evidence?.currentLicenseSummary ?? null
  const source = evidence?.historySource ?? 'local_only'
  const rows = evidence?.recentCompactRuns ?? []

  return (
    <div className="evidence-panel">
      <div className="evidence-head">
        <span className="evidence-title">Evidence store</span>
        <span className={`evidence-dot status-${status}`} aria-hidden="true" />
      </div>

      <div className={`evidence-status status-${status}`}>{STATUS_LABEL[status]}</div>

      <dl className="evidence-grid">
        <dt>Evidence source</dt>
        <dd>{reached ? SOURCE_LABEL[source] : <span className="evidence-muted">unreachable</span>}</dd>

        <dt>Rehydrated</dt>
        <dd>
          {evidence?.rehydratedFromInsForge
            ? `yes · ${evidence.rehydratedCount} row(s)`
            : 'no'}
        </dd>

        <dt>Scope</dt>
        <dd>{evidence?.historyScope === 'run' ? 'one run' : 'global recent'}</dd>

        <dt>Version mismatch</dt>
        <dd>
          {evidence && evidence.versionMismatchCount > 0 ? (
            <span className="evidence-warn">{evidence.versionMismatchCount} excluded</span>
          ) : (
            '0'
          )}
        </dd>

        <dt>Malformed dropped</dt>
        <dd>
          {evidence && evidence.rejectedMalformedCount > 0 ? (
            <span className="evidence-warn">{evidence.rejectedMalformedCount}</span>
          ) : (
            '0'
          )}
        </dd>

        <dt>Digest</dt>
        <dd>
          {evidence ? (
            <>
              {evidence.digestValidCount} valid
              {evidence.digestMissingCount > 0 && ` · ${evidence.digestMissingCount} legacy`}
              {evidence.digestMismatchedCount > 0 && (
                <span className="evidence-warn"> · {evidence.digestMismatchedCount} tampered</span>
              )}
            </>
          ) : (
            '—'
          )}
        </dd>

        <dt>Trusted evidence</dt>
        <dd>{evidence?.trustedEvidenceCount ?? 0}</dd>

        <dt>Storage</dt>
        <dd>
          InsForge · <code>{table}</code>
          {!configured && <span className="evidence-muted"> (unconfigured)</span>}
        </dd>

        <dt>Server episodes</dt>
        <dd>{evidence?.serverEpisodeCount ?? 0}</dd>

        <dt>Latest trace id</dt>
        <dd>
          {evidence?.latestServerTraceId ? (
            <code>{evidence.latestServerTraceId}</code>
          ) : (
            <span className="evidence-muted">—</span>
          )}
        </dd>

        <dt>Latest record</dt>
        <dd>
          {evidence?.latestPersistedRecordId ? (
            <code>{evidence.latestPersistedRecordId}</code>
          ) : (
            <span className="evidence-muted">—</span>
          )}
        </dd>

        <dt>Server license</dt>
        <dd>
          {summary ? (
            <span style={{ color: licenseColor(summary.level), fontWeight: 700 }}>
              {summary.level} {summary.name}
            </span>
          ) : (
            <span className="evidence-muted">—</span>
          )}
        </dd>
      </dl>

      {rows.length > 0 && (
        <div className="evidence-recent">
          <div className="evidence-recent-label">Recent evidence</div>
          <ul>
            {rows.map((r) => (
              <li key={r.traceId} className={r.versionMismatch ? 'mismatch' : ''}>
                <span className={`mini-verdict ${r.passed ? 'ok' : 'bad'}`}>
                  {r.passed ? 'PASS' : 'FAIL'}
                  {r.catastrophic ? ' ⚠' : ''}
                </span>
                <span className="mini-scn">{r.scenarioTitle}</span>
                <span className="mini-act">{r.action.toUpperCase()}</span>
                {r.fallback && <span className="mini-fb">fallback</span>}
                <span
                  className="mini-digest"
                  title={`digest ${r.digestStatus}`}
                  aria-label={`digest ${r.digestStatus}`}
                >
                  {r.digestStatus === 'valid' ? '✓' : r.digestStatus === 'missing' ? '?' : '✕'}
                </span>
                <span className="mini-lvl">{r.licenseLevel}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="evidence-note">
        InsForge preserves evidence. The verifier code remains the source of truth.
      </p>
    </div>
  )
}
