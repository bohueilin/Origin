// ApprovalManager — owns the lifecycle of ApprovalPackets: create (pending), approve, deny,
// expire. An approved packet is the ONLY key that unlocks a (simulated) commit tool.

import type { ApprovalPacket, ApprovalStatus, UserIntent } from '../types'
import type { ApprovalPacketSpec } from '../scenarios/types'
import type { IdFactory } from './ids'
import { canonical, sha256 } from '@origin/evidence/env-evidence'

export class ApprovalManager {
  private readonly storedPackets: ApprovalPacket[] = []
  private idf: IdFactory
  private now: () => number
  private ttlMs: number

  constructor(idf: IdFactory, now: () => number, ttlMs = 15 * 60 * 1000) {
    this.idf = idf
    this.now = now
    this.ttlMs = ttlMs
  }

  private clone(packet: ApprovalPacket): ApprovalPacket {
    return structuredClone(packet)
  }

  private find(id: string): ApprovalPacket | undefined {
    return this.storedPackets.find((packet) => packet.approval_id === id)
  }

  /** Read-only-by-isolation view: no caller receives an authority-bearing packet. */
  get packets(): ApprovalPacket[] {
    return this.storedPackets.map((packet) => this.clone(packet))
  }

  create(spec: ApprovalPacketSpec, intent: UserIntent, commitTool: string, commitInput: Record<string, unknown>): ApprovalPacket {
    const approvalId = this.idf.next('appr')
    const toolInput = structuredClone(commitInput)
    const packet: ApprovalPacket = {
      approval_id: approvalId,
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
      tool_input: toolInput,
      input_digest: sha256(canonical(toolInput)),
      nonce_digest: sha256(canonical({ domain: 'origin.approval-nonce.v1', approval_id: approvalId, intent_id: intent.intent_id })),
      execution_mode: 'simulated',
    }
    const stored = this.clone(packet)
    this.storedPackets.push(stored)
    return this.clone(stored)
  }

  get(id: string): ApprovalPacket | undefined {
    const packet = this.find(id)
    return packet ? this.clone(packet) : undefined
  }

  private setStatus(id: string, status: ApprovalStatus): ApprovalPacket | undefined {
    const p = this.find(id)
    if (!p) return undefined
    // Only a pending packet can transition (one-shot).
    if (p.status !== 'pending') return this.clone(p)
    if (status === 'approved' && this.now() >= p.expires_at) {
      p.status = 'expired'
      return this.clone(p)
    }
    p.status = status
    return this.clone(p)
  }

  approve(id: string): ApprovalPacket | undefined {
    return this.setStatus(id, 'approved')
  }

  deny(id: string): ApprovalPacket | undefined {
    return this.setStatus(id, 'denied')
  }

  /** Mark an approved packet as consumed after its one-shot commit runs (single-use). */
  consume(id: string): ApprovalPacket | undefined {
    const p = this.find(id)
    if (p && p.status === 'approved') p.status = 'consumed'
    return p ? this.clone(p) : undefined
  }

  /** Synchronous compare-and-set used at the adapter I/O boundary. */
  consumeApproved(id: string): ApprovalPacket | undefined {
    const p = this.find(id)
    if (!p || p.status !== 'approved') return undefined
    if (this.now() >= p.expires_at) { p.status = 'expired'; return undefined }
    p.status = 'consumed'
    return this.clone(p)
  }

  expireApproved(id: string): ApprovalPacket | undefined {
    const p = this.find(id)
    if (!p || p.status !== 'approved') return undefined
    p.status = 'expired'
    return this.clone(p)
  }

  /** Expire any pending packets past their window (call before reading state). */
  expireDue(): void {
    const now = this.now()
    for (const p of this.storedPackets) {
      if (p.status === 'pending' && now >= p.expires_at) p.status = 'expired'
    }
  }
}
