import { useState } from 'react'
import { Section } from '../bits'
import { ControlRoom, type AgentStatus, type LineageNode } from '../../engine/controlRoom'

// Surfaces the REAL ControlRoom engine: a live delegation tree with operator controls. Buttons
// mutate the deterministic engine and the render reflects the cascade (pause/freeze flow down
// the sub-tree; resume never thaws a freeze). This is the control-plane primitive, interactive.

const STATUS_LABEL: Record<AgentStatus, string> = {
  running: 'running',
  paused: 'paused',
  awaiting_approval: 'awaiting approval',
  denied: 'denied',
  frozen: 'frozen',
}

function seed(): ControlRoom {
  const cr = new ControlRoom()
  cr.spawn('orchestrator', null, 'Orchestrator')
  cr.spawn('assistant', 'orchestrator', 'Assistant')
  cr.spawn('drafts', 'assistant', 'Drafts')
  cr.spawn('payments', 'assistant', 'Payments')
  cr.spawn('notifier', 'orchestrator', 'Notifier')
  cr.requestApproval('payments', 'payments.refund', 'high')
  return cr
}

function depthOf(node: LineageNode, byId: Map<string, LineageNode>): number {
  let d = 0
  let p = node.parent_id
  while (p) {
    d++
    p = byId.get(p)?.parent_id ?? null
  }
  return d
}

export function ControlRoomPanel() {
  const [cr, setCr] = useState<ControlRoom>(() => seed())
  const [, setTick] = useState(0)
  const [selected, setSelected] = useState('assistant')

  const snap = cr.snapshot()
  const byId = new Map(snap.lineage.map((n) => [n.agent_id, n]))
  const pendingFor = snap.pending.find((p) => p.agent_id === selected)

  const op = (fn: (cr: ControlRoom) => void) => {
    fn(cr)
    setTick((t) => t + 1)
  }

  return (
    <Section
      kicker="Control Room — live lineage + operator controls"
      title="Pause, approve, or contain — mid-flight"
      aside={
        <span className="pp-cr-counts">
          {snap.counts.running}▶ · {snap.counts.paused}⏸ · {snap.counts.frozen}🧊
        </span>
      }
    >
      <div className="pp-cr">
        <ul className="pp-cr-tree">
          {snap.lineage.map((n) => (
            <li
              key={n.agent_id}
              className={`pp-cr-node pp-cr-${n.status} ${selected === n.agent_id ? 'pp-cr-sel' : ''}`}
              style={{ marginLeft: depthOf(n, byId) * 20 }}
              onClick={() => setSelected(n.agent_id)}
              role="button"
              tabIndex={0}
            >
              <span className="pp-cr-name">{n.label ?? n.agent_id}</span>
              <span className={`pp-cr-pill pp-cr-pill-${n.status}`}>{STATUS_LABEL[n.status]}</span>
            </li>
          ))}
        </ul>

        <div className="pp-cr-controls">
          <div className="pp-cr-sel-label">
            Operating on <strong>{byId.get(selected)?.label ?? selected}</strong>
          </div>
          <div className="pp-cr-btns">
            {pendingFor ? (
              <>
                <button className="pp-cr-btn pp-cr-approve" onClick={() => op((cr) => cr.approve(pendingFor.approval_id))}>
                  ✓ Approve “{pendingFor.action}”
                </button>
                <button className="pp-cr-btn pp-cr-deny" onClick={() => op((cr) => cr.deny(pendingFor.approval_id))}>
                  ✕ Deny
                </button>
              </>
            ) : (
              <button className="pp-cr-btn" onClick={() => op((cr) => cr.requestApproval(selected, 'sensitive.action', 'high'))}>
                Request approval
              </button>
            )}
            <button className="pp-cr-btn" onClick={() => op((cr) => cr.pause(selected))}>⏸ Pause sub-tree</button>
            <button className="pp-cr-btn" onClick={() => op((cr) => cr.resume(selected))}>▶ Resume</button>
            <button className="pp-cr-btn pp-cr-freeze" onClick={() => op((cr) => cr.freeze(selected))}>🧊 Freeze (contain)</button>
            <button className="pp-cr-btn pp-cr-reset" onClick={() => { setCr(seed()); setSelected('assistant') }}>↻ Reset</button>
          </div>
          <p className="pp-cr-hint">
            Pause &amp; freeze cascade down the sub-tree; siblings keep running. <strong>Resume never thaws a freeze</strong> —
            containment isn’t undone by a resume.
          </p>
        </div>
      </div>
    </Section>
  )
}
