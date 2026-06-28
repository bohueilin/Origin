import type { ApprovalPacket } from '../../types'

export function ApprovalCard({
  packet,
  onApprove,
  onDeny,
  active,
  canRun = true,
}: {
  packet: ApprovalPacket
  onApprove: () => void
  onDeny: () => void
  active: boolean
  canRun?: boolean
}) {
  const resolved = packet.status !== 'pending'
  return (
    <div className={`pp-approval pp-approval-${packet.status} ${active ? 'pp-approval-active' : ''}`}>
      <div className="pp-approval-head">
        <span className="pp-approval-flag">⚠ Approval required</span>
        <span className="pp-approval-type">{packet.action_type}</span>
        {resolved && (
          <span className={`pp-approval-state pp-approval-state-${packet.status}`}>
            {packet.status === 'consumed' ? 'approved' : packet.status}
          </span>
        )}
      </div>
      <p className="pp-approval-desc">{packet.description}</p>
      <div className="pp-approval-grid">
        {packet.external_party && <Cell k="External party" v={packet.external_party} warn />}
        <Cell k="Data shared" v={packet.data_shared.join(', ')} />
        <Cell k="Reversible?" v={packet.irreversible ? 'No — irreversible' : 'Yes'} warn={packet.irreversible} />
      </div>
      <div className="pp-approval-actions">
        <button className="pp-btn pp-btn-approve" onClick={onApprove} disabled={resolved || !canRun} aria-disabled={resolved || !canRun}>
          {packet.approve_button_label}
        </button>
        <button className="pp-btn pp-btn-deny" onClick={onDeny} disabled={resolved || !canRun} aria-disabled={resolved || !canRun}>
          {packet.deny_button_label}
        </button>
      </div>
      <div className="pp-approval-note">
        The agent cannot do this on its own — this capability is on its deny list. Even if you approve, the action runs in <b>simulation</b> here. No real-world action is taken.
      </div>
    </div>
  )
}

function Cell({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className={`pp-acell ${warn ? 'pp-acell-warn' : ''}`}>
      <span className="pp-mini-label">{k}</span>
      <span className="pp-acell-v">{v}</span>
    </div>
  )
}
