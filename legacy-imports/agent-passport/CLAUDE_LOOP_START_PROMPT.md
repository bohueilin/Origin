# Prompt To Start Claude Code Execution Loop

Copy this into Claude Code when you are ready to start the first execution turn.

```text
We are using a Codex + Claude Code loop engineering workflow.

Role contract:
- Codex is the brain: architecture, security review, product judgment, design direction, and next prompts.
- Claude Code is the execution agent: implement scoped changes, run gates, and write handoff notes back to Codex.
- Always read loop instructions and handoff notes from `/Users/bohueilin/hackathons/0620-test/physical-ai-demo-test/agent-passport`.
- Every handoff must include an iteration number, starting with `Iteration: 1`, then `Iteration: 2`, `Iteration: 3`, and so on.
- Claude Code check logic: if working/building/verifying, do not stop to poll; finish the slice and write `CLAUDE_HANDOFF.md`. If not actively working, check the source-of-truth directory every 3 minutes for new Codex instructions, handoff changes, or iteration-log updates.
- Codex check logic: Codex checks every 10 minutes while waiting; if no update appears, Codex switches to a 3-minute check loop until a meaningful update appears, then resets to 10 minutes.

Please read `agent-passport/LOOP_ENGINEERING.md`, `agent-passport/BUILD_NOTES.md`, and `agent-passport/README.md` first.

Project: Passport, in `agent-passport/` inside the Origin repo. It is a local-only, zero-dependency Python 3.9+ prototype for AGI House "Agent Identity Build Day": scoped agent identity with attenuated delegation, short-lived credential leases, isolated subprocess sandboxes, a reference-monitor kill-switch, and a hash-chained audit ledger.

Local-only boundaries:
- Do not push, publish, deploy, or install cloud infrastructure.
- Do not hardcode or expose secrets.
- Do not stage unrelated files.

Your task for this first execution turn:
1. Fix the confirmed P0 security issues first:
   - `authority.verify()` must require a delegated child passport's `issuer` to equal the registered parent passport's `subject`.
   - `max_calls=0` must not verify as narrower while executing as unlimited. Make budget semantics explicit and safe.
2. Add focused regression tests that prove both attacks fail.
3. If the P0 fixes require small supporting changes, keep them local and explain them.
4. Do not implement P1/P2 or sponsor SDK swaps yet unless required to keep gates green.

Run and report these gates:
- `cd agent-passport && python3 demo.py`
- `python3 tests/test_core.py`
- `python3 dashboard/server.py`, then open http://localhost:8765 and click "Run scenario" if your environment supports local browser verification. If not, say exactly what blocked it.

Preserve these five invariants:
1. Attenuation is monotonic: a child scope is always a subset of its parent's, escalation impossible by construction and re-verified at every hop.
2. Complete mediation: every side-effecting action goes through the monitor.
3. Credentials are sandbox-bound: never in a prompt, on disk, or in a log.
4. The ledger is append-only and hash-chained tamper-evident.
5. Kill is total and contained: revoke + lease teardown + SIGKILL cascade to the whole subtree, siblings/parent unaffected.

Audit and plan around these known Codex findings:
- P0: `authority.verify()` appears not to require `passport.issuer == parent.subject`, allowing an enrolled unrelated signer to forge a child under someone else's parent passport.
- P0: `max_calls=0` verifies as a subset but executes as unlimited because the monitor uses truthiness for the budget.
- P1: `Vault.issue_lease()` can be called directly with a tampered in-memory passport scope because it does not independently verify passport signature/revocation or require a live sandbox binding.
- P1: sandbox kill appears to kill manager-known sandbox PIDs but not necessarily subprocess descendants spawned inside a sandbox process.
- P1: `AgentSystem.handoff()` appears to bypass the monitor's `spawn` action and can proceed even after action budget exhaustion.
- P2: ledger entries are mutable in memory; secret masking currently leaks the last four characters into logs/ledger.

Your output must include:
1. A concise summary of code changes made.
2. Exact tests/gates run and results.
3. Any risks or follow-up work you intentionally did not implement.
4. A markdown handoff file named `CLAUDE_HANDOFF.md` in the repo root. If you cannot create files in your environment, provide the full file contents in your response.
5. An updated `ITERATION_LOG.md` row for this turn.

`CLAUDE_HANDOFF.md` must include:
- iteration number;
- state;
- task summary;
- files inspected;
- gates run;
- files changed;
- implementation notes;
- remaining findings and recommended next actions;
- risks and unknowns;
- a copy-paste prompt titled "Prompt To Share Back To Codex" asking Codex to review your implementation, inspect diffs, verify gates as needed, critique security/product/design quality, and provide the next Claude Code implementation prompt.
```
