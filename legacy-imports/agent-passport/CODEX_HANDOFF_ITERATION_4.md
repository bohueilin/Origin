# Handoff: Iteration 4 - Codex to Claude Code

Iteration: 4
State: IMPLEMENT
Date: 2026-06-23
Repo: agent-passport
Baton: Claude Code

## Task
Fix the remaining P0 root-of-trust issue: the default HMAC backend makes the Authority keyring effectively a signing-secret registry. Move the prototype to a real asymmetric default so the keyring can be treated as public verification material. Keep the local demo/gates green and preserve public interfaces.

## Context Read
- `CLAUDE_HANDOFF.md` Iteration 3.
- `ITERATION_LOG.md`.
- `passport_core/crypto.py`, `passport_core/authority.py`, `passport_core/passport.py`.
- Codex reran gates and probes after Iteration 3.

## Gates Run
- `python3 tests/test_core.py`: pass, 10/10.
- `python3 demo.py`: pass.
- Secret scan: no raw secret hits; one expected false-positive match was demo text `max_calls→9999`.
- Additional probes:
  - `issuer=parent` signed by wrong key fails with signature mismatch.
  - 3-deep chain with bad middle issuer fails via parent invalid.
  - `max_calls` subset/intersection matrix is coherent for `None`, `0`, and bounded values.
  - Killing one branch leaves sibling sandbox running and sibling action allowed.
  - Remaining HMAC forge confirmed: attacker with `authority.keyring["authority"]` can forge a root passport that verifies.

## Findings Or Changes
- Iteration 3 implementation is accepted for its scoped slice.
- No P0/P1 regression found in the Iteration 3 changes.
- Remaining P0 is now the highest priority: HMAC must not be the default if the keyring is described as public/verifier-only.

## Files Changed
- `CLAUDE_HANDOFF.md`: synced to the Iteration 3 handoff summary supplied by the user.
- `CODEX_HANDOFF_ITERATION_4.md`: created this handoff.
- `ITERATION_LOG.md`: appended Iteration 4.

## Risks And Unknowns
- The project currently advertises zero dependencies. The cleanest fix may require either requiring `cryptography` for secure mode or vendoring a small Ed25519 implementation. Do not silently fall back to HMAC without an explicit insecure flag.
- The demo currently runs with HMAC because `cryptography` is not installed in this environment.
- Avoid making this slice a broad refactor. The acceptance test is simple: public keyring bytes cannot sign a verifying passport.

## Next Recommended Action
Claude Code should implement the asymmetric root-of-trust slice, add regression tests, run gates, update `CLAUDE_HANDOFF.md` as Iteration 5, append `ITERATION_LOG.md`, and hand back to Codex.

## Prompt To Share Back
```text
You are Claude Code acting as the execution agent in the Codex brain + Claude Code loop.

Iteration: 5
State: IMPLEMENT
Repo: agent-passport

Read these first:
- `agent-passport/LOOP_ENGINEERING.md`
- `agent-passport/CODEX_HANDOFF_ITERATION_4.md`
- `agent-passport/CLAUDE_HANDOFF.md`
- `agent-passport/BUILD_NOTES.md`
- `agent-passport/README.md`

Source of truth:
- Always read loop instructions and handoff notes from `/Users/bohueilin/hackathons/0620-test/physical-ai-demo-test/agent-passport`.

Local-only boundaries:
- Do not push, publish, deploy, or install cloud infrastructure.
- Do not expose or hardcode secrets.
- Do not stage unrelated files.
- Claude Code check logic: if working/building/verifying, do not stop to poll; finish the slice and write `CLAUDE_HANDOFF.md`.
- If Claude Code is not actively working, check the source-of-truth directory every 3 minutes for new Codex instructions, handoff changes, or iteration-log updates.

Implement only this P0 root-of-trust slice:

1. Make the default signer asymmetric and safe.
   - The Authority keyring must hold verification-only public keys by default.
   - `default_signer()` must not silently use HMAC unless an explicit insecure local-development flag is set, for example `ORIGIN_INSECURE_HMAC=1`.
   - If `cryptography` is available, use the existing Ed25519 signer.
   - If `cryptography` is unavailable, choose one:
     - fail closed with a clear RuntimeError explaining how to install/enable Ed25519 or set `ORIGIN_INSECURE_HMAC=1` for local insecure demo mode; or
     - vendor a small audited/public-domain pure-Python Ed25519 implementation.
   - Prefer the smallest safe implementation. Do not add network/cloud dependencies.

2. Keep insecure HMAC explicit and visibly labeled.
   - HMAC can remain for local demo fallback only behind `ORIGIN_INSECURE_HMAC=1`.
   - Emit a clear stderr warning when insecure HMAC is used.
   - Demo output may show the signer name, but do not imply HMAC keyring is public/offline-verifiable.

3. Add regression tests.
   - Test that, under the secure/default signer, an attacker holding a copy of every `verify_key` in `authority.keyring` cannot forge a root passport that `authority.verify()` accepts.
   - Test delegated forgery similarly if practical: public verify keys cannot sign a child passport.
   - Test that HMAC fallback only activates when `ORIGIN_INSECURE_HMAC=1` is set.
   - Keep existing 10/10 tests green or update expected count.

4. Preserve public interfaces.
   - Keep `Signer`, `KeyPair`, `default_signer()`, `Authority`, and `Passport` call sites stable where possible.
   - Do not implement sponsor SDK adapters, dashboard redesign, TTL/depth cleanup, glob boundary hardening, duplicate-id containment, or P2 polish in this iteration.

Required gates:
- `python3 tests/test_core.py`
- `python3 demo.py`
- Secret-leak scan of demo output.
- If demo now requires secure signer setup not available in this environment, document the exact command/env needed and keep insecure local fallback explicit.

At the end:
- Write/update `CLAUDE_HANDOFF.md` with title `# Handoff: Iteration 5 - Claude Code to Codex`.
- Include `Iteration: 5`, `State: REVIEW`, `Baton: Codex`.
- Append an Iteration 5 row to `ITERATION_LOG.md`.
- Include files changed, gates run, remaining risks, and a section titled `Prompt To Share Back To Codex`.
- The prompt back to Codex should ask Codex to review the root-of-trust implementation, verify the public-keyring forgery tests, rerun gates, and scope the next P1 slice.
```
