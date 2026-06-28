# Plan 006 publish workspace

Evidence and the deploy delta for publishing the hardened `mongodb-sales-aggregation-engine`
environment to HUD. No secrets are stored here.

## What's here

- `hud-target.json` — the authorized publish target, found via a read-only `GET /v2/registry`
  probe (team `hud-hacks`, registry env `b3409057`).
- `v2/tests/` — the hardened grader (`test.sh` + `task_assets/test_outputs.py`) regenerated from
  committed sources; its `grader_v2_digest` matches the sealed ReleaseProof.
- `v2-grader-verification.json` — offline digest match against the ReleaseProof.
- `v2-runtime-kill-proof.json` — grader-form kill in real `mongo:7.0` containers (witness `0.0`,
  controls `1.0`), via the Plan 005 `_DockerVerifierRunner` harness.
- `v2-deploy-proof.json` — deploy-form kill: builds the actual image and runs `env.py`'s served
  grader; witness `0.0`, controls `1.0`, and all root `/tests` subversions blocked `0.0`.
- `v2-env/` — the **deploy delta** layered on the v1 env (`envs/mongodb-sales-aggregation-engine`)
  to build the deployable image: `env.py` (hardened grader), `Dockerfile.hud` (bakes the trusted
  suite at read-only `/tests`), `.hud/config.json` (targets registry `b3409057`). The full build
  context = v1 env + this delta + `v2/tests/` at `/tests` (assembled transiently for `hud deploy`,
  so large files like `uv.lock` are not duplicated here).
- `publication-prepared-attempt.json` / `publication-published-attempt.json` — the validated
  `prepared` and `published` PublicationAttempts.

## The v1 → v2 hardening delta

v1's grader runs `pytest` from the agent-writable `/app`, so an agent-planted `conftest.py`
force-passes it (the recorded reward hack). The hardened grader:

1. serves the trusted suite from `/tests` (outside `/app`);
2. pins the suite digest and **allow-lists the whole `/tests` tree**, so any planted file
   (e.g. a `conftest.py` next to the suite) is rejected;
3. runs `pytest` from `/` with conftest discovery off (`--noconftest`), plugin auto-load off,
   the cache plugin off, and import shadowing blocked.

## Grader hardening history (v3 → v6)

Successive bug hunts found that an **in-process** grader (one that imports the candidate
`/app/query.py` into the verdict process) is fundamentally bypassable by a root candidate:

- **v3** (`3bc11838`): a force-pass `conftest.py` planted in `/tests/task_assets/` bypassed it.
- **v4** (`d7b8043a`): added `--noconftest` + a `/tests` tree allow-list — but an in-process
  **exit-code hijack** (`atexit → os._exit(0)`) still bypassed it.
- **v5** (`0290bbb9`, current live): graded from pytest's JUnit XML in a second process —
  blocked the exit-code hijack, but an in-process **monkeypatch** could still subvert it.
- **v6** (committed, proven, not yet deployed): the **out-of-process grader** (`grader/grade.py`).
  Following the harden-v0/Harbor convention, the candidate runs only in throwaway isolated
  subprocesses (`grader/run_solution.py`, invoked `python3 -I`); the verdict process compares the
  candidate's outputs to the **trusted reference** (`grader/reference_query.py`) and never imports
  candidate code. Re-proven in `v2-deploy-proof.json`: witness, exit-hijack, **monkeypatch**, and
  root grader-tampering all blocked, controls preserved.

**Residual (recorded):** a root candidate can still read the grader + reference + the *fixed*
cases and hard-code outputs. Closing that needs randomised/hidden test data or a non-root
candidate / SEPARATE verifier environment — see `v2-security-limitations.json`.
