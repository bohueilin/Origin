// Rule of Two — an enforced gate for the "lethal trifecta" (Simon Willison) /
// Meta's "Agents Rule of Two". The trifecta: an agent that simultaneously (1) can reach
// PRIVATE DATA, (2) is exposed to UNTRUSTED CONTENT, and (3) can COMMUNICATE EXTERNALLY
// can be turned into an exfiltration tool by a single injected prompt.
//
// The rule: without a human in the loop, an agent may hold AT MOST TWO of the three. If
// a grant carries all three, the broker must NOT let the agent act autonomously — it
// escalates to a human. This converts a famous heuristic into a hard control at the
// consent layer, independent of whether the model itself resists the injection.

export interface TrifectaExposure {
  privateData: boolean        // can read the user's private data (mail, docs, db)
  untrustedContent: boolean   // ingests content from untrusted sources (web, inbound msgs)
  externalComms: boolean      // can send data outward (network calls, links, messages)
}

export interface RuleOfTwoVerdict {
  count: number               // how many of the three are present (0–3)
  withinBudget: boolean       // count <= 2
  requiresHuman: boolean      // all three present and not yet human-approved
  present: Array<keyof TrifectaExposure>
  reason: string
}

const LABELS: Record<keyof TrifectaExposure, string> = {
  privateData: 'private data',
  untrustedContent: 'untrusted content',
  externalComms: 'external communication',
}

/** Evaluate a grant's exposure against the Rule of Two. `humanApproved` is true only
 *  after the user completed a step-up approval for this action. Fail-closed: all three
 *  without approval => requiresHuman. */
export function evaluateRuleOfTwo(exposure: TrifectaExposure, humanApproved = false): RuleOfTwoVerdict {
  const present = (Object.keys(LABELS) as Array<keyof TrifectaExposure>).filter((k) => exposure[k])
  const count = present.length
  const withinBudget = count <= 2
  const requiresHuman = count >= 3 && !humanApproved
  const reason = count >= 3
    ? (humanApproved
        ? 'all three trifecta exposures present — permitted only because a human approved this action'
        : 'lethal trifecta: private data + untrusted content + external communication present at once — a human must approve before the agent may act')
    : `within the Rule of Two budget (${count}/2 of the trifecta: ${present.map((k) => LABELS[k]).join(', ') || 'none'})`
  return { count, withinBudget, requiresHuman, present, reason }
}

/** Short human-readable summary for a grant's exposure (UI + audit). */
export function describeExposure(exposure: TrifectaExposure): string {
  const present = (Object.keys(LABELS) as Array<keyof TrifectaExposure>).filter((k) => exposure[k])
  if (present.length === 0) return 'no trifecta exposure'
  return present.map((k) => LABELS[k]).join(' + ')
}

export const TRIFECTA_LABELS = LABELS
