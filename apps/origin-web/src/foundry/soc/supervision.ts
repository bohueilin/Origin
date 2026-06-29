// ----------------------------------------------------------------------------
// Origin Autonomy-Control — HIERARCHICAL SUPERVISION (the cheap floor / premium few).
//
// The economic truth of an autonomous SOC: you cannot afford to run a reasoning model on
// every alert, and you don't need to. A DETERMINISTIC pre-filter clears the obvious majority
// for $0 and ~0ms, and escalates only the SUSPICIOUS MINORITY to gemma-4. This module is that
// pre-filter — a tiny rule set that decides "auto-handle" vs "escalate" from OBSERVABLE alert
// signal ALONE. It never reads the incident's ground-truth answer; that would be cheating.
//
// The two routes:
//   • auto      — the alert matches a known-safe signature; the floor applies a fixed safe action.
//   • escalate  — the alert carries an EMBEDDED DIRECTIVE (injection), is a high-blast novelty, or
//                 is an ambiguous access event → it earns a full gemma-4 perceive→plan→Guardian loop.
//
// Why this is the Cerebras story: on a GPU the escalated tier is slow + costly, so a real SOC
// RATIONS escalation (raises the bar, escalates less) and the subtle threats slip through to save
// money. Cerebras makes the escalated tier ~free, so you can escalate the entire suspicious tail.
// Capability is not permission; and judgment is not something you should have to ration.
// ----------------------------------------------------------------------------

import type { Incident } from './socEnv'

export type SupervisionRoute = 'auto' | 'escalate'

export interface TriageRouting {
  route: SupervisionRoute
  /** A short machine label for WHY it routed this way (deterministic, observable). */
  signal: string
  /** Human-readable reason shown in the funnel. */
  reason: string
  /** For auto routes: the fixed safe action the floor applies (no LLM). */
  autoAction?: string
}

/** Destructive tool verbs/ids an embedded directive might try to induce. Observable in text. */
const INDUCEMENT_RE = /\b(disable_firewall|delete_logs|wipe_disk|mass_delete_users|exfiltrate_data|shutdown_production|disable the firewall|delete the logs)\b/i

/** Markers that an alert is carrying an instruction for the agent (the injection surface). */
const DIRECTIVE_RE = /\[(operator note|runbook|note|system|admin)\b|supersedes|without confirmation|authorized remediation|apply the runbook|follow (?:this|the) (?:note|runbook|directive)/i

/** High-confidence benign signatures: observable pattern → fixed safe remediation. No LLM. */
const SIGNATURES: Array<{ test: (t: string) => boolean; action: string; reason: string }> = [
  {
    test: (t) => /failed\s+.*logins?|brute[- ]?force|failed ssh/i.test(t) && /stopped|no success|then stopped/i.test(t),
    action: 'block_ip',
    reason: 'Known signature: bounded brute-force from a single source that already stopped.',
  },
  {
    test: (t) => /\bedr\b|endpoint detection/i.test(t) && /trojan|emotet|malware|ransom|beacon|resident/i.test(t),
    action: 'isolate_host',
    reason: 'Known signature: EDR-confirmed malware resident on one host.',
  },
  {
    test: (t) => /phish|credential[- ]?harvest|lookalike|docusign|spoofed sender/i.test(t),
    action: 'quarantine_file',
    reason: 'Known signature: reported phishing / credential-harvest message.',
  },
  {
    test: (t) => /\b(cert|certificate|tls|ssl)\b/i.test(t) && /expir|renew|acme/i.test(t),
    action: 'open_ticket',
    reason: 'Known signature: routine certificate expiry / failed auto-renewal.',
  },
]

/**
 * The deterministic supervision pre-filter. Decides route from OBSERVABLE signal only — it must
 * NOT consult `incident.correctAction`. Evaluation order is a security posture, not a convenience:
 * a directive-bearing alert is escalated even if it superficially looks routine.
 */
export function routeIncident(inc: Incident): TriageRouting {
  const t = inc.alertText

  // 1. Embedded directive (prompt-injection surface) — NEVER auto-handle. Escalate for review.
  if (DIRECTIVE_RE.test(t) || INDUCEMENT_RE.test(t)) {
    return {
      route: 'escalate',
      signal: 'embedded-directive',
      reason: 'Alert text carries an instruction to run an action — a prompt-injection surface the floor will not auto-execute.',
    }
  }

  // 2. Known-safe signature → the floor applies a fixed safe remediation, no LLM.
  for (const sig of SIGNATURES) {
    if (sig.test(t)) {
      return { route: 'auto', signal: 'signature-match', reason: sig.reason, autoAction: sig.action }
    }
  }

  // 3. High-blast novelty (critical + data-egress signal, no signature) → escalate.
  if (inc.severity === 'critical' && /exfil|dlp|\bgb\b|to an? (?:unrecognized|unknown|external)|s3 bucket|data (?:leaving|out)/i.test(t)) {
    return {
      route: 'escalate',
      signal: 'high-blast',
      reason: 'Critical severity with a data-egress signal and no known signature — too high-blast to auto-handle.',
    }
  }

  // 4. Ambiguous access event (login from new identity/geo) → escalate.
  if (/login|sign[- ]?in|authentication/i.test(t) && /new|never[- ]?seen|unfamiliar|unusual|first[- ]?time|new country|new asn/i.test(t)) {
    return {
      route: 'escalate',
      signal: 'ambiguous-access',
      reason: 'Successful access from a new identity or geography — a judgment call, not a fixed rule.',
    }
  }

  // 5. Default: no confident signature → escalate rather than guess.
  return {
    route: 'escalate',
    signal: 'no-signature',
    reason: 'No high-confidence signature matched — escalate rather than auto-apply a guess.',
  }
}
