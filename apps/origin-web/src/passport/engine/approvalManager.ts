// ApprovalManager — owns the lifecycle of ApprovalPackets: create (pending), approve, deny,
// expire. An approved packet is the ONLY key that unlocks a (simulated) commit tool.

import type { ApprovalPacket, ApprovalStatus, UserIntent } from '../types'
import type { ApprovalPacketSpec } from '../scenarios/types'
import type { IdFactory } from './ids'

export class ApprovalManager {
  readonly packets: ApprovalPacket[] = []
  private idf: IdFactory
  private now: () => number
  private ttlMs: number

  constructor(idf: IdFactory, now: () => number, ttlMs = 15 * 60 * 1000) {
    this.idf = idf
    this.now = now
    this.ttlMs = ttlMs
  }

  create(spec: ApprovalPacketSpec, intent: UserIntent, commitTool: string, commitInput: Record<string, unknown>): ApprovalPacket {
    const packet: ApprovalPacket = {
      approval_id: this.idf.next('appr'),
      intent_id: intent.intent_id,
      action_type: spec.action_type,
      description: spec.description,
      external_party: spec.external_party,
      estimated_cost: spec.estimated_cost,
      data_shared: spec.data_shared,
      irreversible: spec.irreversible,
      expires_at: this.now() + this.ttlMs,
      approve_button_label: spec.approve_button_label,
      deny_button_label: spec.deny_button_label,
      status: 'pending',
      capability: spec.capability,
      tool_name: commitTool,
      tool_input: commitInput,
    }
    this.packets.push(packet)
    return packet
  }

  get(id: string): ApprovalPacket | undefined {
    return this.packets.find((p) => p.approval_id === id)
  }

  private setStatus(id: string, status: ApprovalStatus): ApprovalPacket | undefined {
    const p = this.get(id)
    if (!p) return undefined
    // Only a pending packet can transition (one-shot).
    if (p.status !== 'pending') return p
    if (status === 'approved' && this.now() >= p.expires_at) {
      p.status = 'expired'
      return p
    }
    p.status = status
    return p
  }

  approve(id: string): ApprovalPacket | undefined {
    return this.setStatus(id, 'approved')
  }

  deny(id: string): ApprovalPacket | undefined {
    return this.setStatus(id, 'denied')
  }

  /** Mark an approved packet as consumed after its one-shot commit runs (single-use). */
  consume(id: string): ApprovalPacket | undefined {
    const p = this.get(id)
    if (p && p.status === 'approved') p.status = 'consumed'
    return p
  }

  /** Expire any pending packets past their window (call before reading state). */
  expireDue(): void {
    const now = this.now()
    for (const p of this.packets) {
      if (p.status === 'pending' && now >= p.expires_at) p.status = 'expired'
    }
  }
}
