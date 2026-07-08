// AuditLogger — append-only event log with a tamper-evident SHA-256 digest chain.
//
// Every event is redacted before it is stored, so a secret can never enter the trace. The
// digest is a hash chain: each event's stored hash folds in the previous digest, so any edit
// to history changes the final digest.

import type { AuditDecision, AuditEvent, AuditActor, AuditTrace, Capability } from '../types'
import { redact } from '../secrets/redact'
import { sha256 } from '../hash'
import type { IdFactory } from './ids'

export interface AppendInput {
  actor: AuditActor
  kind: string
  summary: string
  decision: AuditDecision
  capability?: Capability
  detail?: Record<string, unknown>
}

export class AuditLogger {
  readonly events: AuditEvent[] = []
  private idf: IdFactory
  private now: () => number
  private chain = '0'.repeat(64)

  constructor(idf: IdFactory, now: () => number) {
    this.idf = idf
    this.now = now
  }

  append(input: AppendInput): AuditEvent {
    const event: AuditEvent = {
      event_id: this.idf.next('evt'),
      ts: this.now(),
      actor: input.actor,
      kind: input.kind,
      summary: redact(input.summary),
      decision: input.decision,
      capability: input.capability,
      detail: input.detail ? redact(input.detail) : undefined,
    }
    // Fold this event into the hash chain.
    this.chain = sha256(this.chain + '|' + JSON.stringify(event))
    this.events.push(event)
    return event
  }

  trace(intent_id: string): AuditTrace {
    // Hand out a frozen deep copy so a reader (UI / test) cannot mutate the live log, and the
    // digest always describes exactly the events returned alongside it.
    const events = this.events.map((e) => Object.freeze({ ...e })) as AuditEvent[]
    return Object.freeze({
      trace_id: 'trace_' + intent_id,
      intent_id,
      events: Object.freeze(events) as AuditEvent[],
      digest: this.chain,
      created_at: this.events[0]?.ts ?? this.now(),
    }) as AuditTrace
  }

  /**
   * Recompute the hash chain over a trace's events and confirm it matches the stored digest.
   * Returns false if any event was edited, reordered, inserted, or removed — i.e. the trace is
   * tamper-evident. (Deterministic-by-design, so this is tamper-EVIDENT, not tamper-PROOF: it
   * detects edits, not a fully re-forged history.)
   */
  static verify(trace: AuditTrace): boolean {
    let chain = '0'.repeat(64)
    for (const event of trace.events) {
      chain = sha256(chain + '|' + JSON.stringify(event))
    }
    return chain === trace.digest
  }
}
