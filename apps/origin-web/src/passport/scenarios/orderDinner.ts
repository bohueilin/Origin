import type { FinalizeContext, ScenarioSpec } from './types'
import { approvedCap, line } from './helpers'

// "Treat the Team" — the money-path scenario that makes the headline crisp:
//   payment.spend stays GLOBAL_FORBIDDEN (the agent can NEVER freely move money), shown DENIED.
//   snaplii.purchase is a SCOPED, capped, one-shot, broker-mediated buy that IS approval-gated.
// The agent prepares ONE specific $15 DoorDash gift card; Passport gates it on your approval;
// on approval the REAL deployed snaplii-broker charges (simulation by default, live on SNAPLII_LIVE=1).

const PURCHASE_AMOUNT = 15

export const orderDinner: ScenarioSpec = {
  id: 'treat-the-team',
  title: 'Treat the Team',
  tagline: 'The agent can never move your money freely — but it CAN make one capped, approved buy.',
  tools: [
    { name: 'Context', use: 'who is shipping late tonight' },
    { name: 'DoorDash', use: 'pick a $15 gift card' },
    { name: 'Snaplii', use: 'broker the one-shot charge', approval: true, cap: 'snaplii.purchase', doneLabel: '✓ bought' },
  ],
  prompt:
    'The team is grinding late on the demo. Buy them a $15 DoorDash gift card so they can order dinner — but I want to approve the actual charge.',
  normalized_intent: 'Buy the team a single $15 DoorDash gift card through the Snaplii broker, gated on the owner’s explicit approval.',
  user_goal: 'Let the agent handle ONE small, specific purchase for the team without ever handing it free spending power.',
  success_criteria: [
    'The right brand + amount is prepared ($15 DoorDash gift card)',
    'The agent holds no card — Passport brokers the charge',
    'The charge happens only after you approve it',
    'A single capped, one-shot buy — never a standing spend',
  ],
  constraints: ['Exactly $15', 'DoorDash gift card only', 'No free spending — the charge is yours to approve'],
  time_window: 'Tonight — while the team is still shipping',
  // Read/prepare only. The agent can discover + prepare; it cannot spend.
  requested_capabilities: ['food.recommend'],
  // payment.spend stays DENIED (GLOBAL_FORBIDDEN — listed so it's the headline DENIED chip).
  // snaplii.purchase is the SCOPED, approval-gated buy.
  commit_capabilities: ['payment.spend', 'snaplii.purchase'],
  budget_limit: { amount: 25, currency: 'USD' },
  ttl_seconds: 1800,
  risk_level: 'high',
  fallback_plan:
    'Deny the buy and nothing is charged — Passport keeps the prepared gift card, and you can approve it later in one tap. The agent never gets free spend either way.',
  prevented: [
    'Letting the agent move money freely — payment.spend is on its permanent deny list',
    'Charging your card without your explicit approval',
    'Handing the agent a reusable spending grant instead of one capped, one-shot buy',
    'Exposing a real payment credential to the agent — the charge is brokered server-side',
  ],
  steps: [
    { kind: 'note', title: 'Classify the risk', description: 'This touches money. payment.spend is forbidden outright; the only path is a single capped buy you approve through the broker.' },
    { kind: 'tool', title: 'Read the context', description: 'Confirm the team is shipping late and a $15 DoorDash gift card fits.', tool: 'food.recommend', input: {} },
    {
      kind: 'approval',
      title: 'Buy the $15 DoorDash gift card',
      description: 'Make the one-shot, capped Snaplii purchase — only after you approve.',
      commitTool: 'snaplii.buy',
      commitInput: { brand: 'DoorDash', amount: PURCHASE_AMOUNT, currency: 'USD' },
      packet: {
        action_type: 'Buy $15 DoorDash gift card',
        description: 'Charge $15 for a DoorDash gift card via the Snaplii broker. The agent holds no card — Passport brokers a single, capped, one-shot charge.',
        external_party: 'Snaplii · DoorDash',
        // Surfacing the amount on the packet so the UI can read it (estimated_cost).
        estimated_cost: { amount: PURCHASE_AMOUNT, currency: 'USD' },
        data_shared: ['Brand: DoorDash', 'Amount: $15', 'One-shot purchase nonce'],
        irreversible: true,
        approve_button_label: 'Approve & buy $15',
        deny_button_label: "Don't buy",
        capability: 'snaplii.purchase',
      },
    },
  ],
  finalize(ctx: FinalizeContext) {
    const bought = approvedCap(ctx, 'snaplii.purchase')
    return {
      title: bought ? 'Dinner is on you' : 'Gift card prepared',
      summary: bought
        ? 'A $15 DoorDash gift card was bought for the team — and only because you approved the charge.'
        : 'A $15 DoorDash gift card is prepared and waiting on your approval — nothing was charged.',
      lines: [
        line('Free spending', 'payment.spend — permanently denied to the agent', 'good'),
        line('Brand', 'DoorDash gift card', 'good'),
        line('Amount', '$15 · capped at $25/buy', bought ? 'good' : 'warn'),
        line('Charge', bought ? 'Brokered via Snaplii (real when SNAPLII_LIVE=1)' : 'Prepared — not charged', bought ? 'good' : 'warn'),
        line('Card', 'The agent never held a card — Passport brokered it', 'good'),
        line('Scope', 'One capped, one-shot buy — never a standing grant', 'good'),
      ],
      notes: [
        'The agent could never move money on its own — payment.spend is on its deny list.',
        'The only thing it could do was prepare ONE specific, capped purchase that you approved.',
      ],
    }
  },
}
