# Handoff: Iteration 10 - Claude Code to Codex

Iteration: 10
State: REVIEW
Date: 2026-06-23
Repo: agent-passport
Baton: Codex

## Task
Close the P2 trio — the last items in the audit backlog: P2-1 canonical signing-image
normalization, P2-2 idempotent kill-switch, P2-3 `stop_all` process reaping. Smallest safe
changes; preserve interfaces; keep demo + gates green.

## Context Read
- `CLAUDE_HANDOFF.md` (Iter 9), `ITERATION_LOG.md`.
- `passport_core/passport.py` (`canonical_bytes`), `monitor.py` (`trip_kill_switch`),
  `sandbox.py` (`stop_all`).

## Gates Run
- `python3 tests/test_core.py`: **pass — 24/24** (21 prior + 3 new).
- `python3 demo.py`: **pass** (exit 0). secret-leak scan: **0 hits**. Dashboard: unaffected.

## Findings Or Changes
- **P2-1 — `passport.canonical_bytes` is now normalization-stable.** Added a recursive
  `_canon` that NFC-normalizes every string and folds whole-number floats to ints before
  JSON-serializing the signing image. So `1` vs `1.0` and NFC vs NFD forms of an id produce
  the SAME signed bytes — signatures no longer break across a JSON/unicode round-trip. Sign
  and verify both use it, so existing passports are unaffected (ASCII ids + decimal
  timestamps normalize to themselves).
- **P2-2 — `monitor.trip_kill_switch` is idempotent.** Guard is now purely `if subject in
  self.killed: return`. The first trip already adds the subject + all descendants to
  `killed`, so a re-trip is a no-op (the old guard consulted `descendants()`, which scans the
  never-pruned registry and is ~never empty, causing re-teardown + ledger spam).
- **P2-3 — `sandbox.stop_all` reaps.** Each killed proc is now `wait()`-ed (timeout 2s) so
  shutdown leaves no zombies.
- **`tests/test_core.py` — +3**: canonical-bytes stable across int/float + NFC/NFD;
  kill-switch idempotent (second trip adds 0 ledger entries); `stop_all` leaves every proc
  with a returncode (reaped).

## Files Changed
- `passport_core/passport.py`, `passport_core/monitor.py`, `passport_core/sandbox.py`
- `tests/test_core.py`, `CLAUDE_HANDOFF.md`, `ITERATION_LOG.md`

## Risks And Unknowns
- **Backlog is now EMPTY** — P0 + P1-1/2/3 + P2-1/2/3 are all fixed, 24 regression tests
  encode the specific attacks/bugs. Security/correctness track is effectively DONE.
- Residual (intentional, low severity, all flagged in prior handoffs):
  1. `_canon` makes the SIGNATURE normalization-stable, but `authority` still keys the
     registry / `min_epoch` on the raw `subject` string — two visually-identical-but-distinct-
     byte ids (NFC vs NFD) could still co-enroll. A 1-line follow-up (NFC-normalize `agent_id`
     in `enroll`) would close that theoretical revocation-evasion vector; deferred to keep
     this slice to the agreed P2 scope.
  2. `_glob_match` runtime matcher still uses `fnmatch` (a bare-`*` PARENT scope over-grants
     itself at runtime); attenuation is safe (Iter 8). Optional future path-aware matcher.
  3. Real 1Password/Daytona adapters (Iter 9) are not live-verified — no creds locally.

## Next Recommended Action
The audit backlog is closed. Codex decides the track: (A) mark the security/correctness
track DONE; (B) live-validate the real backends when creds are available; or (C) a small new
hardening/feature — recommended micro-slice: NFC-normalize `agent_id` at `enroll` (closes
residual #1), or add RFC-8693-style `may_act` pre-authorization. Otherwise pivot to demo/pitch
polish for the AGI House submission.

## Prompt To Share Back To Codex
```text
You are Codex in the agent-passport loop. State: REVIEW. Read CLAUDE_HANDOFF.md (Iteration 10)
and ITERATION_LOG.md first. Local only — no push/publish/deploy/secrets.

Review the P2 trio: confirm canonical_bytes normalization is correct and does not change the
signing image for existing ASCII/decimal passports (sign+verify still consistent), that
trip_kill_switch is now idempotent without weakening containment (subtree still fully reaped
on the FIRST trip), and that stop_all reaps procs. Re-run gates: `python3 tests/test_core.py`
(24/24), `python3 demo.py` (exit 0), secret scan, and load the dashboard.

The audit backlog (P0 + all P1 + all P2) is now closed with 24 regression tests. Decide the
track: (A) declare the security/correctness track DONE and write a short closeout; (B)
live-validate the real 1Password/Daytona backends if creds are available; or (C) one small
hardening/feature slice — recommended: NFC-normalize agent_id at enroll (test: enrolling an
NFD namesake of an existing NFC id is rejected as a duplicate), or a `may_act` pre-auth check.
Produce the Iteration 11 Claude Code prompt with explicit acceptance tests + gates, append
Iteration 11 to ITERATION_LOG.md, and set Baton accordingly.
```
