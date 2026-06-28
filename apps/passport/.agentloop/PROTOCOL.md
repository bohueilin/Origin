# PROTOCOL — how Codex (brain) and Claude (arm) collaborate

Both agents read this every turn. The goal is in `GOAL.md`. The orchestrator is
`.agentloop/run.sh`. Win together: ship the GOAL at demo quality with minimal human
interaction.

## Roles
- **Codex = Brain (read-only).** Designs, inspects the repo, reviews diffs,
  recommends. NEVER edits code. Runs with a read-only sandbox.
- **Claude = Arm (the only writer).** Reads the design, may object, otherwise
  implements it, runs the gates, fixes failures, reports back.
- **Gates = referee.** `npm run build && npm run lint && npm run verify:evidence`
  (and `npm test` once it exists). Objective; neither agent overrides it.
- **Human = oversight.** Watches; intervenes only on `STATUS: BLOCKED` or to stop.

## The round (one iteration of run.sh)
1. **Codex DESIGN** → writes `design.md`: the next plan (scope, exact files,
   acceptance criteria, gate commands). Reads `GOAL.md`, `PROTOCOL.md`, the previous
   `review.md`, `gates.log`, and the last commit diff.
2. **Claude IMPLEMENT** → reads `design.md`. If it disagrees or sees a real risk, it
   writes its objection and `STATUS: BLOCKED` and stops. Otherwise it implements
   EXACTLY that plan, runs the gates, fixes failures, and writes `implementation.md`
   (files changed, decisions, gate results, open questions).
3. **GATES** run; output saved to `gates.log`. The round is committed (`git`).
4. **Codex REVIEW** → reads `implementation.md`, `gates.log`, and the diff; writes
   `review.md` (P0/P1/P2 findings with file:line) AND the next round's `design.md`.

## Handoff files (the blackboard)
| File | Author | Meaning |
| --- | --- | --- |
| `GOAL.md` | human | fixed goal + definition-of-done (stop condition) |
| `design.md` | Codex | the plan to implement THIS round |
| `implementation.md` | Claude | what was done + gate results (or an objection) |
| `gates.log` | runner | build/lint/test output (the referee) |
| `review.md` | Codex | findings + next design |
| `STATE.json` | either | round #, phase, status |

## Rules
- **Small diffs.** One coherent change per round; no scope creep beyond `design.md`.
- **Gates must pass** before a round is considered done. If they fail, say so plainly
  in `implementation.md`; the next design fixes it first.
- **Determinism is sacred.** Don't change verifier/license semantics without a
  justified, tested reason.
- **Secrets** live only in `.env.local` (gitignored). Never commit or echo them.
- **One commit per round** = the audit trail Codex reviews.
- Stay in your role: Codex never writes code; Claude never silently expands scope.

## Sentinels (the orchestrator watches for these)
- `STATUS: SHIPPABLE` — first line of `design.md`: GOAL met + gates green → loop ends.
- `STATUS: BLOCKED` — anywhere in `implementation.md`: Claude needs human/Codex input
  → loop halts for review.
