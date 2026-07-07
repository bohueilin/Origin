// Control Room — live agent lineage + pause/approve/freeze state machine.
// =============================================================================
// Clean-room. Inspired by Agent Control Room's live lineage + pause/approve UI (no code copied —
// see docs/PRIOR_ART.md; that repo is unlicensed and its author is openly seeking collaborators).
//
// This is the ENGINE the control-plane UI renders: a delegation tree (who spawned whom), a
// per-agent status, a human-approval queue, and operator actions that CASCADE down a sub-tree —
// pause/resume, approve/deny a pending action, and freeze a poisoned sub-tree (the Cordon op,
// surfaced as an operator control). `snapshot()` is the render model; everything is deterministic
// (no wall-clock, no RNG), so a UI can drive it and tests can assert it.
// =============================================================================

export type AgentStatus = 'running' | 'paused' | 'awaiting_approval' | 'denied' | 'frozen'

export interface LineageNode {
  agent_id: string
  parent_id: string | null
  status: AgentStatus
  label?: string
}

export interface PendingApproval {
  approval_id: string
  agent_id: string
  action: string
  risk: string
}

export interface ControlRoomSnapshot {
  lineage: LineageNode[]
  pending: PendingApproval[]
  counts: Record<AgentStatus, number>
}

export class ControlRoom {
  private nodes = new Map<string, LineageNode>()
  private pending = new Map<string, PendingApproval>()
  private seq = 0

  /** Register an agent under a parent (null parent = the root orchestrator). */
  spawn(agentId: string, parentId: string | null = null, label?: string): void {
    if (parentId !== null && !this.nodes.has(parentId)) throw new Error(`unknown parent ${parentId}`)
    this.nodes.set(agentId, { agent_id: agentId, parent_id: parentId, status: 'running', label })
  }

  /** Direct + transitive children of an agent (the sub-tree, excluding the agent itself). */
  descendants(agentId: string): string[] {
    const out: string[] = []
    const walk = (id: string) => {
      for (const n of this.nodes.values()) {
        if (n.parent_id === id) {
          out.push(n.agent_id)
          walk(n.agent_id)
        }
      }
    }
    walk(agentId)
    return out
  }

  private setStatus(agentId: string, status: AgentStatus): void {
    const n = this.nodes.get(agentId)
    if (n) n.status = status
  }

  /** A sensitive action asks for human sign-off. The agent parks in `awaiting_approval`. */
  requestApproval(agentId: string, action: string, risk = 'medium'): string {
    if (!this.nodes.has(agentId)) throw new Error(`unknown agent ${agentId}`)
    const approval_id = `apr_${++this.seq}`
    this.pending.set(approval_id, { approval_id, agent_id: agentId, action, risk })
    this.setStatus(agentId, 'awaiting_approval')
    return approval_id
  }

  approve(approvalId: string): void {
    const a = this.pending.get(approvalId)
    if (!a) return
    this.pending.delete(approvalId)
    // Only resume if the agent wasn't paused/frozen by a separate operator action.
    if (this.nodes.get(a.agent_id)?.status === 'awaiting_approval') this.setStatus(a.agent_id, 'running')
  }

  deny(approvalId: string): void {
    const a = this.pending.get(approvalId)
    if (!a) return
    this.pending.delete(approvalId)
    this.setStatus(a.agent_id, 'denied')
  }

  /** Pause an agent and its whole sub-tree (operator hits the brakes). */
  pause(agentId: string): string[] {
    const affected = [agentId, ...this.descendants(agentId)]
    for (const id of affected) if (this.nodes.get(id)?.status !== 'frozen') this.setStatus(id, 'paused')
    return affected
  }

  /** Resume a paused sub-tree. Frozen agents stay frozen (containment is not undone by resume). */
  resume(agentId: string): string[] {
    const affected = [agentId, ...this.descendants(agentId)]
    for (const id of affected) if (this.nodes.get(id)?.status === 'paused') this.setStatus(id, 'running')
    return affected
  }

  /** Freeze a poisoned sub-tree (the Cordon op as an operator control). Returns the blast radius. */
  freeze(compromisedId: string): { frozen: string[]; blast_radius: number } {
    const frozen = [compromisedId, ...this.descendants(compromisedId)]
    for (const id of frozen) this.setStatus(id, 'frozen')
    // resolve any pending approvals for frozen agents
    for (const [aid, a] of this.pending) if (frozen.includes(a.agent_id)) this.pending.delete(aid)
    return { frozen, blast_radius: frozen.length }
  }

  /** The render model for the Control Room UI. */
  snapshot(): ControlRoomSnapshot {
    const counts: Record<AgentStatus, number> = { running: 0, paused: 0, awaiting_approval: 0, denied: 0, frozen: 0 }
    const lineage = [...this.nodes.values()].map((n) => ({ ...n }))
    for (const n of lineage) counts[n.status]++
    return { lineage, pending: [...this.pending.values()], counts }
  }
}
