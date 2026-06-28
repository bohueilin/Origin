# Repository interface bindings

Status: **accepted for Gate 1**

This repository currently contains the Chronos planning bundle, dependency
bootstrap, source handoff, and the Plan-001-owned live HUD environment for
`mongodb-sales-aggregation-engine`. Gate 1 is accepted because required surfaces
are either verified-present with evidence or located-owned by a later plan in
`STATUS.json.gate1_acceptance`.

| Semantic operation | Repository path | Symbol/entrypoint | Exercise/evidence | Status |
|---|---|---|---|---|
| HUD trace retrieval/export | `envs/mongodb-sales-aggregation-engine/**`; SDK installed through `hud-python[modal]==0.6.4` | `implement_sales_analyzer` task; live trace recorded in `STATUS.json.live_trace` | Live tcp-runtime HUD job `8b482f14f81741f49ba6d8b812c3bd7b` produced trace `92b654c6-cdde-43cf-9096-3681df6df2e1` with reward `1.0`. Reusable trace export wrapper remains later-wave scope. | verified (Gate 1 trace) |
| HUD step/file evidence | `STATUS.json.live_trace`, `docs/plans/evidence/001/MANIFEST.json` | HUD job/trace identifiers | Stable env/job/trace ids and grader digest are recorded. Full BranchRun file-diff evidence is Plan 003 scope. | verified (Gate 1 trace identity) |
| HUD Reward Hacking QA | Not present | Not present | Reward-hack reproducibility is proven in-container; live stochastic discovery and QA reward-hacking classification are Plan 003 scope. | located-owned:003 |
| HUD taskset/analytics | Not present | Not present | No taskset runner or analytics export is checked in; Witness/ProofSet analytics are later-wave scope. | located-owned:003 |
| HUD environment version publish/compare | `COMMANDS.json:hud-deploy` (bound, deferred) | `hud.cli.deploy.deploy_environment` (POST /v2/builds/trigger, get-or-rebuild by name) + `hud.cli.utils.registry` (GET /v2/registry version-compare) | Bound for Plan 006. Authorized target = the authenticated account's `mongodb-sales-aggregation-engine` registry env (`artifacts/chronos/demo/publish/hud-target.json`); hardened v2 verified offline (grader digest matches the sealed ReleaseProof) and its kill proven at runtime — both as the grader form and as the deployed `env.py` form in real `mongo:7.0` containers (witness exploit reward `0.0`, three controls reward `1.0`, and all root `/tests` subversions — overwrite, planted conftest, planted sitecustomize — blocked `0.0`; `artifacts/chronos/demo/publish/v2-{runtime,deploy}-{kill-proof,proof}.json`). **PUBLISHED** via `hud deploy`: `mongodb-sales-aggregation-engine` **version 5** is the live latest (registry `b3409057`, build `0290bbb9`, team `hud-hacks`; `docs/plans/evidence/006/publish-receipt.json`). These defeat the RECORDED conftest/plugin reward hack and `/tests` tampering — but **NOT** general verifier isolation. **STOP (weak isolation):** the suite imports the agent solution in-process. v3 and v4 were bypassable by an in-process exit-code hijack (`atexit`/`os._exit`); **v5 (live) blocks it** by computing the verdict from pytest's JUnit XML in a second process (re-proven in `v2-deploy-proof.json`: `exit_code_hijack_blocked`). Residual in-process monkeypatch / answer-hardcoding classes still bypass v5. **FIX implemented (v6, committed, proven, not yet deployed):** the out-of-process grader (`artifacts/chronos/demo/publish/v2-env/grader/`, run via `python3 -I /tests/grader/grade.py`) runs the candidate only in throwaway isolated subprocesses and compares its outputs to the trusted reference — the verdict process never imports candidate code, so the exit-hijack AND monkeypatch are blocked (re-proven in `v2-deploy-proof.json`: `exit_code_hijack_blocked`, `monkeypatch_blocked`, `root_grader_tamper_blocked`; controls preserved). This adopts the harden-v0/Harbor reward-by-separate-process convention. Remaining residual: answer-hardcoding (needs randomised/hidden test data or a non-root candidate / SEPARATE verifier env). See `artifacts/chronos/demo/publish/v2-security-limitations.json`. Non-destructive: v1-v4 retained. | published v5 (live); v6 out-of-process fix proven (deploy pending); located-owned:006 + env redesign |
| Modal sandbox create | `modal==1.5.0`; capability probe at `repo-map/probes/modal_snapshot_probe.py` | `modal.Sandbox.create` | Authenticated `modal app list` succeeds; probe creates/terminates sandboxes on the `rsi-hackathon` profile. Repo-native adapter is Plan 002. | verified (capability) |
| Modal core snapshot capture/restore | `modal==1.5.0`; `repo-map/probes/modal_snapshot_probe.py` | `Sandbox.snapshot_filesystem`, `Sandbox.snapshot_directory` | Filesystem snapshot full round-trip PASS (state survives restore as base image); Directory Snapshot (Beta) creation PASS (`snapshot_directory`, default ttl 30d). Mount-based directory restore is Plan 002 scope. | verified (capability) |
| Modal Memory/VM capability probe | Not present | `Sandbox._experimental_snapshot` exists in SDK | Alpha. Not probed; core path does not depend on it (A-018). | blocked |
| Agent/model gateway | `envs/mongodb-sales-aggregation-engine/env.py`; branch runner not present | `ClaudeAgent(model="claude-haiku-4-5")` for Plan 001 live trace | Live trace used the gateway with `claude-haiku-4-5`. Seeded stochastic branch runner and sampling metadata are Plan 003 scope. | verified (Gate 1 run); located-owned:003 |
| Grader/verifier run and digest | `envs/mongodb-sales-aggregation-engine/task_assets/test_outputs.py`; `env.py` | `BashGrader.grade`, `GRADE_CMD` | Real grader digest `ecaf12227976729261555ba1c5c229ad89487fc1beb945b4b8ae52509b56f61f`; stub=0, reference=1, force-pass hack=1 in-container; live legitimate solve reward=1. | verified |
| harden-v0 fixer | `.external/harden-v0` via `scripts/bootstrap_external_deps.sh` | `python -m harden` | Pinned revision `b9dd28c...`; `env PYTHONPATH=.external/harden-v0 uv run python -m harden --help` exits 0. No repository adapter exists yet. | partial |
| harden-v0 replay/dedup/legitimate handling | `.external/harden-v0` via `scripts/bootstrap_external_deps.sh` | `python -m harden`, `dedup_hacks.py` | Help output exposes `--replay-enabled`, `.legitimate` behavior, and pool flags. No adapter or task binding exists yet. | partial |
| Persistence/artifact store | Not present | Not present | No database, object store, manifest store, or artifact retention implementation is checked in. Durable Witness and ReleaseProof storage are later-wave scope. | located-owned:003+005 |
| MongoDB task materialization | `.external/terminal-wrench/tasks/mongodb-sales-aggregation-engine` via `scripts/bootstrap_external_deps.sh` | Dataset task directory | Pinned revision `d8a2961...`; task source exists for `claude-opus-4.6` and `gemini-3.1-pro`. No repository-native fixture materialization command exists yet. | partial |
| Legitimate solver/reference hints | Terminal Wrench source checkout; controls not frozen | Candidate attacker-legitimate solves in source checkout | Plan 004 owns freezing at least three path-diverse controls on the real task. | located-owned:004 |
| Secrets/network/resource isolation | `env.workspace(..., network=True)` for Plan 001 env; full policy not present | HUD/bwrap workspace isolation for live env | Plan 003 owns branch isolation, secret scoping, egress, resource, and negative security checks before adversarial branch execution. | located-owned:003 |

## Terminal Wrench task path binding

`TASK-PATH-CONTRACT.md` is the canonical task-path materialization contract for
Plan 001 and later fixture work. It records that `/app` is task-derived for the
MongoDB env from the source Dockerfile/prompt/tests, not a HUD default. Future
Terminal Wrench conversions must parse the pinned source task for Dockerfile
`WORKDIR`, test command cwd, instruction/test absolute paths, compose overrides,
and mutable state outside the workspace before choosing the HUD
`env.workspace(..., guest_path=...)` and grader `cwd`.

## Verified local operations

| Operation | Repository path | Entry point | Exercise/evidence | Status |
|---|---|---|---|---|
| Plan graph validation | `docs/plans/scripts/validate_graph.py` | CLI | `python docs/plans/scripts/validate_graph.py` exits 0. | verified |
| Plan section validation | `docs/plans/scripts/validate_sections.py` | CLI | `python docs/plans/scripts/validate_sections.py` exits 0. | verified |
| Proposed ownership validation | `docs/plans/scripts/validate_ownership.py` | CLI | `python docs/plans/scripts/validate_ownership.py` exits 0. | verified |
| Repo-bound ownership validation | `docs/plans/scripts/validate_ownership.py` | CLI | `python -B docs/plans/scripts/validate_ownership.py --repo-bound` exits 0 with `STATUS.json` accepted and all owned non-doc globs bound. | verified |
| Mapped command runner | `docs/plans/scripts/run_mapped.py` | CLI | `python docs/plans/scripts/run_mapped.py baseline` exits 0 using `COMMANDS.json`. | verified |
| Dependency sync | `pyproject.toml`, `uv.lock` | CLI | `uv sync --all-extras --all-groups` exits 0. | verified |
| External dependency checkout | `scripts/bootstrap_external_deps.sh`, `scripts/verify_external_deps.sh` | CLI | Fetches harden-v0, HUD Trace Explorer, and a sparse Terminal Wrench MongoDB-task checkout pinned under `.external/`; verifies required source paths. | verified |
| Local environment config | `.env.example`, root `.env` | dotenv-compatible env file | `.env.example` is committed; `.env` is ignored and loaded by `scripts/bootstrap_external_deps.sh` when present. | verified |

## Required next inputs

Plans 002-007 can begin only from the accepted Gate-1 state. Dependency
installation and source checkouts remain necessary, but not sufficient, for
later gates: each later adapter needs a checked-in path plus command/output
evidence before its own plan can complete.

These inputs arrive as structured evidence packets. `EVIDENCE-PACKETS.md`
defines the runtime packet (Ashton) and the proof/control packet (Katherine),
maps every packet field to the prerequisite, interface row, and command it
unblocks, and states the integration procedure Akhil follows to flip each
`STATUS.json` prerequisite. The Akhil-owned HUD-facing inputs are listed there
too.
