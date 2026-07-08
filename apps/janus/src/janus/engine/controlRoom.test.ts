import { describe, it, expect } from 'vitest'
import { ControlRoom } from './controlRoom'

// orchestrator → assistant → {drafts, payments}; orchestrator → notifier
function tree() {
  const cr = new ControlRoom()
  cr.spawn('orchestrator', null, 'Orchestrator')
  cr.spawn('assistant', 'orchestrator', 'Assistant')
  cr.spawn('drafts', 'assistant', 'Drafts')
  cr.spawn('payments', 'assistant', 'Payments')
  cr.spawn('notifier', 'orchestrator', 'Notifier')
  return cr
}

describe('Control Room — lineage + operator controls', () => {
  it('tracks the delegation tree and rejects an unknown parent', () => {
    const cr = tree()
    expect(cr.descendants('assistant').sort()).toEqual(['drafts', 'payments'])
    expect(cr.descendants('orchestrator').sort()).toEqual(['assistant', 'drafts', 'notifier', 'payments'])
    expect(() => cr.spawn('ghost', 'nobody')).toThrow(/unknown parent/)
  })

  it('human approval: request parks the agent, approve resumes, deny stops it', () => {
    const cr = tree()
    const id = cr.requestApproval('payments', 'payments.refund', 'high')
    expect(cr.snapshot().lineage.find((n) => n.agent_id === 'payments')!.status).toBe('awaiting_approval')
    expect(cr.snapshot().pending).toHaveLength(1)
    cr.approve(id)
    expect(cr.snapshot().lineage.find((n) => n.agent_id === 'payments')!.status).toBe('running')
    expect(cr.snapshot().pending).toHaveLength(0)

    const id2 = cr.requestApproval('payments', 'payments.refund', 'high')
    cr.deny(id2)
    expect(cr.snapshot().lineage.find((n) => n.agent_id === 'payments')!.status).toBe('denied')
  })

  it('pause/resume cascade down the sub-tree; siblings are untouched', () => {
    const cr = tree()
    const paused = cr.pause('assistant')
    expect(paused.sort()).toEqual(['assistant', 'drafts', 'payments'])
    const snap = cr.snapshot()
    expect(snap.lineage.find((n) => n.agent_id === 'drafts')!.status).toBe('paused')
    expect(snap.lineage.find((n) => n.agent_id === 'notifier')!.status).toBe('running') // sibling untouched
    cr.resume('assistant')
    expect(cr.snapshot().counts.paused).toBe(0)
  })

  it('freeze contains a poisoned sub-tree (blast radius) and resume does NOT thaw it', () => {
    const cr = tree()
    const { frozen, blast_radius } = cr.freeze('assistant')
    expect(blast_radius).toBe(3) // assistant + drafts + payments
    expect(frozen.sort()).toEqual(['assistant', 'drafts', 'payments'])
    expect(cr.snapshot().counts.frozen).toBe(3)
    // resume must not undo containment
    cr.resume('assistant')
    expect(cr.snapshot().counts.frozen).toBe(3)
    // the untouched branch still runs
    expect(cr.snapshot().lineage.find((n) => n.agent_id === 'notifier')!.status).toBe('running')
  })

  it('freezing clears any pending approvals for the contained agents', () => {
    const cr = tree()
    cr.requestApproval('drafts', 'messages.send', 'medium')
    expect(cr.snapshot().pending).toHaveLength(1)
    cr.freeze('assistant')
    expect(cr.snapshot().pending).toHaveLength(0)
  })

  it('snapshot counts every status for the render model', () => {
    const cr = tree()
    cr.requestApproval('payments', 'x')
    cr.pause('notifier')
    const c = cr.snapshot().counts
    expect(c.running + c.paused + c.awaiting_approval + c.denied + c.frozen).toBe(5)
    expect(c.awaiting_approval).toBe(1)
    expect(c.paused).toBe(1)
  })
})
