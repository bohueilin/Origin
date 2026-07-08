import type { JanusSnapshot } from '../../engine/session'
import { CapabilityChip, StatusPill } from '../bits'
import { ttlLabel } from '../format'

export function JanusCard({ snap, onRevoke }: { snap: JanusSnapshot; onRevoke: () => void }) {
  const { grant, brokerId } = snap
  const revoked = grant.status === 'revoked'
  return (
    <div className={`pp-card ${revoked ? 'pp-card-revoked' : ''}`}>
      <div className="pp-card-sheen" aria-hidden="true" />
      <div className="pp-card-top">
        <div className="pp-card-brand">
          <span className="pp-card-chip" aria-hidden="true" />
          <span className="pp-card-wordmark">JANUS</span>
        </div>
        <StatusPill status={grant.status} />
      </div>

      <div className="pp-card-scope">{grant.scope}</div>

      <div className="pp-card-meta">
        <div>
          <span className="pp-card-meta-k">Bearer (agent)</span>
          <span className="pp-card-meta-v mono">{grant.agent_id}</span>
        </div>
        <div>
          <span className="pp-card-meta-k">Grant</span>
          <span className="pp-card-meta-v mono">{grant.grant_id}</span>
        </div>
        <div>
          <span className="pp-card-meta-k">Expires in</span>
          <span className="pp-card-meta-v">{ttlLabel(grant.ttl)} · revocable</span>
        </div>
        {grant.budget_limit && (
          <div>
            <span className="pp-card-meta-k">Spend ceiling</span>
            <span className="pp-card-meta-v">${grant.budget_limit.amount.toFixed(0)} {grant.budget_limit.currency}</span>
          </div>
        )}
      </div>

      <div className="pp-card-caps">
        <div className="pp-caps-group">
          <div className="pp-caps-label pp-caps-label-allowed">Granted</div>
          <div className="pp-caps-row">
            {grant.allowed_capabilities.map((c) => (
              <CapabilityChip key={c} cap={c} kind="allowed" />
            ))}
          </div>
        </div>

        {grant.requires_approval_for.length > 0 && (
          <div className="pp-caps-group">
            <div className="pp-caps-label pp-caps-label-approval">Approval required</div>
            <div className="pp-caps-row">
              {grant.requires_approval_for.map((c) => (
                <CapabilityChip key={c} cap={c} kind="approval" />
              ))}
            </div>
          </div>
        )}

        <div className="pp-caps-group">
          <div className="pp-caps-label pp-caps-label-denied">Denied to the agent</div>
          <div className="pp-caps-row">
            {grant.denied_capabilities.map((c) => (
              <CapabilityChip key={c} cap={c} kind="denied" />
            ))}
          </div>
        </div>
      </div>

      <div className="pp-card-foot">
        <span className="pp-card-broker">🔐 secrets brokered via <b>{brokerId}</b> · handle-only</span>
        <button className="pp-revoke" onClick={onRevoke} disabled={revoked}>
          {revoked ? 'Revoked' : 'Revoke all authority'}
        </button>
      </div>
    </div>
  )
}
