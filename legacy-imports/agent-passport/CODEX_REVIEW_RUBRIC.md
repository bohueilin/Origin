# Codex Review Rubric

Codex is the review/design brain in this loop. Claude Code implements; Codex reviews the implementation and decides what should happen next.

## Review Priorities

1. **P0 security correctness**: anything that breaks signed delegation, attenuation, mediation, credential containment, revocation, sandbox kill, or ledger integrity.
2. **P1 production credibility**: bypasses, ambiguous semantics, incomplete tests, weak adapter seams, demo claims that are not backed by behavior.
3. **P2 polish with leverage**: clarity, dashboard comprehension, founder/judge narrative, concise docs, and visual proof.

## Security Checklist

- Can an unrelated enrolled key sign a passport that verifies under another parent?
- Can a child widen tools, files, network, secrets, TTL, children, depth, or call budget?
- Are all side-effecting operations mediated before execution?
- Can a tampered in-memory passport be used by lower-level components?
- Does revocation invalidate current and descendant passports?
- Are credential leases bound to a verified passport and live sandbox?
- Are raw secrets absent from prompts, logs, ledger entries, files, and UI?
- Does sandbox kill terminate the full contained execution tree?
- Does the ledger detect edit, deletion, insertion, and reorder tampering?

## Product And Demo Checklist

- Is the 3-minute story obvious without narration?
- Does the dashboard show who authorized whom, what narrowed, what was denied, what got killed, and why the parent survived?
- Are sponsor mappings concrete: 1Password for scoped short-lived secrets, Daytona for isolated execution and forced teardown?
- Would a YC judge understand the wedge in one sentence?
- Would a security founder believe the invariant claims after seeing the tests/probes?

## Frontend / Illustration Checklist

- First screen should be the working console, not a marketing page.
- The trust graph should make delegation and attenuation visually obvious.
- The kill event should be unmistakable but not gimmicky.
- The ledger should be scannable: actor, event, reason, seal.
- Avoid vague decorative visuals; every visual element should teach the security model.

## Codex Output Shape

When reviewing Claude Code work, lead with findings:

- `P0`: must fix before continuing.
- `P1`: should fix before sponsor/demo polish.
- `P2`: useful enhancement or clarity improvement.

Then include:

- gates verified or not run;
- concise change assessment;
- next Claude Code implementation prompt.
