import { describe, expect, it } from 'vitest'
import { ApprovalManager } from './approvalManager'
import { IdFactory } from './ids'
import type { UserIntent } from '../types'
const intent: UserIntent = { intent_id: 'intent-a', raw_user_request: 'x', normalized_intent: 'x', user_goal: 'x', success_criteria: [], constraints: [], time_window: null, risk_level: 'low', created_at: 0 }
const spec: any = { action_type: 'commit', description: 'x', external_party: null, estimated_cost: null, data_shared: [], irreversible: false, approve_button_label: 'approve', deny_button_label: 'deny', capability: 'messages.send' }
describe('ApprovalManager Task 3 bindings', () => {
  it('clones input and binds canonical input plus domain-separated nonce digests', () => {
    const manager = new ApprovalManager(new IdFactory(), () => 100)
    const input = { message: { body: 'hello' }, recipients: ['a'] }
    const packet = manager.create(spec, intent, 'messages.send', input)
    input.message.body = 'tampered'; input.recipients.push('b')
    expect(packet.tool_input).toEqual({ message: { body: 'hello' }, recipients: ['a'] })
    expect(packet.input_digest).toMatch(/^[a-f0-9]{64}$/); expect(packet.nonce_digest).toMatch(/^[a-f0-9]{64}$/)
    manager.approve(packet.approval_id)
    expect(manager.consumeApproved(packet.approval_id)?.status).toBe('consumed')
    expect(manager.consumeApproved(packet.approval_id)).toBeUndefined()
  })

  it('keeps stored authority private when create, get, and packets views are mutated', () => {
    const manager = new ApprovalManager(new IdFactory(), () => 100)
    const created = manager.create(spec, intent, 'messages.send', { nested: { recipient: 'a' } })
    const mutate = (packet: any) => {
      packet.tool_input.nested.recipient = 'attacker'
      packet.input_digest = '0'.repeat(64)
      packet.nonce_digest = '1'.repeat(64)
      packet.status = 'consumed'
      packet.expires_at = 0
      packet.tool_name = 'attacker.tool'
      packet.capability = 'attacker.capability'
    }
    mutate(created)
    mutate(manager.get(created.approval_id)!)
    mutate(manager.packets[0]!)
    expect(manager.get(created.approval_id)).toMatchObject({
      tool_input: { nested: { recipient: 'a' } }, status: 'pending', tool_name: 'messages.send', capability: 'messages.send', expires_at: 900100,
    })
    manager.approve(created.approval_id)
    expect(manager.consumeApproved(created.approval_id)?.status).toBe('consumed')
  })
})
