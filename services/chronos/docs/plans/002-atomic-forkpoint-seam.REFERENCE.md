# Plan 002 reference — boundary and fidelity protocol

## Boundary protocol

Wave 1 identifies the real completed-action event. The implementation should derive a boundary token from stable HUD run/trace/action identity plus task/environment identity. HUD v6 distinguishes the `Run` lifecycle, its `Trace`, and ordered trace steps, so do not collapse those identities into a single display trace id unless the repo-bound adapter proves that is the canonical action boundary ([HUD v6 Types](https://docs.hud.ai/v6/core/types)). The exact encoding is repository-native; it must not rely on wall-clock time alone.

Atomic capture conceptually performs:

1. Observe completed action `t`.
2. Stop accepting action `t+1`.
3. Flush task-visible side effects and file evidence for `t`; HUD file diffs are acceptable only when File Tracking was enabled before the source trace, because future traces capture filesystem changes after the setting is enabled ([HUD File Tracking](https://docs.hud.ai/platform/file-tracking)).
4. Freeze the agent-visible history through `t`, including tool result.
5. Capture the selected executable state at the same quiescent point.
6. Compute/store history and state integrity data.
7. Persist all required identity fields.
8. Finalize the ForkPoint.
9. Re-enable execution or end the source run.

Any failure before finalization rolls back or marks temporary provider state for cleanup. Modal's Sandbox API exposes explicit `terminate`/`detach` lifecycle calls and `Sandbox.exec` command handles, so cleanup and quiescence checks should be observable through provider operations rather than assumed from local object disposal ([Modal Sandboxes](https://modal.com/docs/guide/sandboxes), [Modal running commands](https://modal.com/docs/guide/sandbox-spawn)).

The selected boundary must be durably observed, not only syntactically present in a trace array. If an environment side effect, observation/tool result, file-tracking flush, or history append for action `t` is pending, the boundary is not ready. If any model call or action `t+1` has begun, the boundary has already passed and must be rejected for this ForkPoint.

## Fidelity probes

Choose probes that distinguish the selected MongoDB-task state from its predecessor and successor. Examples must be grounded in the real trace and may include:

- expected working-tree diff,
- installed package/plugin metadata,
- file hashes,
- process/service readiness when relevant,
- task command output,
- environment variables excluding secrets,
- grader-visible state,
- history's final action and observation.

File-evidence refs must be step-bound and content-integrity checked; a later filesystem scan cannot substitute for HUD step evidence. Do not use a probe that simply reads the ForkPoint manifest back. Prefer probes that grade the world state the agent left behind, matching HUD's v6 guidance that reliable grading often checks task-visible system state rather than only the final answer ([HUD v6 Tasks & Tasksets](https://docs.hud.ai/v6/core/tasks)).

## Six required scenarios

| Scenario | Expected public behavior |
|---|---|
| Valid capture | Finalized ForkPoint with complete required fields. |
| Valid restore | Isolated environment and history reproduce task-visible probes. |
| Boundary mismatch | Restore/capture rejects before branch execution. |
| History mismatch | Hash/token mismatch rejects and identifies `history_mismatch`. |
| Grader mismatch | Evaluation cannot start under a different digest. |
| Unsupported mode | Capture refuses when core snapshot cannot cover true state. |

Also test partial capture cleanup and immutable record behavior where the repository's persistence supports it.

## Snapshot decision record

Record:

- observed task state locations, including `/app`, MongoDB `dbpath` and logs, `/tmp`, `$HOME`, virtualenv/cache paths, Python site-packages, pytest plugin/conftest discovery paths, mounted volumes, and service sockets,
- the verified `task_state_root` when Directory Snapshot is selected, or the reason no single subtree honestly contains branch-relevant mutable state,
- chosen mode,
- rejected modes and why,
- capability probe output,
- provider object id,
- retention/expiry,
- explicit expired-snapshot failure handling,
- image/runtime identity,
- restore command/result,
- network policy and resource limits,
- secret-mount exclusion,
- durable fallback where applicable.

Modal Directory Snapshots are Beta and capture a specific directory for later mounting; they are a sufficient core profile only when all branch-relevant mutable state is under that directory and the base image/runtime are pinned. Filesystem Snapshots capture the Sandbox filesystem as an Image; Memory Snapshots are Alpha; VM Sandboxes are Alpha and currently support Filesystem Snapshots but not Memory Snapshots. Treat Directory/Filesystem as the core choices and record any Memory/VM dependency as a STOP or Plan 007 research path ([Modal Sandbox Snapshots](https://modal.com/docs/guide/sandbox-snapshots), [Modal VM Sandboxes](https://modal.com/docs/guide/vm-sandboxes), [modal.Sandbox API](https://modal.com/docs/sdk/py/latest/modal.Sandbox)).

Modal Sandboxes have no inbound access and no access to Modal resources by default, but they can make outbound public network connections unless `block_network` or outbound allowlists are configured. Snapshot evidence must therefore include the actual network setting, not only a generic "sandboxed" claim ([Modal Sandbox networking](https://modal.com/docs/guide/sandbox-networking)).

## Plan 001 evidence-packet compatibility

If Plan 001 PR [#4](https://github.com/ashtonchew/hack2fix2hack/pull/4), or an equivalent evidence-packet model, has merged, treat its `located-and-owned` fields as assignment metadata only. Plan 002 may consume only accepted runtime evidence with a checked-in path, command, and observed output.

Plan 002 consumes or produces these Packet A runtime fields:

| Packet A field | Plan 002 treatment |
|---|---|
| Modal account/config location | Consume as provider configuration evidence, then re-check it in the Plan 002 integration command. |
| Snapshot mode available | Consume Plan 001 capability probe only as account/SDK evidence; do not treat it as task fidelity. |
| Capture + restore executable state proof | Produce through `integration-forkpoint` with the real MongoDB task state and selected ForkPoint. |
| Branch isolation / secret scoping / egress / resource limits | Consume only if accepted with real negative/security probes; otherwise STOP before capture. |
| Command that proves the runtime path | Must be the mapped Plan 002 integration command, not a standalone capability probe. |

The Plan 001 Modal probe at `docs/plans/repo-map/probes/modal_snapshot_probe.py`, when present, proves only Filesystem Snapshot round-trip and Directory Snapshot creation. Directory Snapshot mode in Plan 002 still requires a task-specific `snapshot_directory` plus `mount_image`/`unmount_image` restore probe that exercises the restored MongoDB task state, history prefix, grader-visible state, and security policy.

If the live HUD env under `envs/mongodb-sales-aggregation-engine/**` is present, use it as the primary repo-owned substrate for task-state inventory and grader digest provenance. The original Terminal Wrench checkout remains provenance/background. If the workspace seen by the agent and the `/app` seen by the grader are different filesystem views, Plan 002 must STOP unless Plan 001 resolves the env wiring or ownership is explicitly updated to let Plan 002 change that env path. If PR #4's latest env is present, the agent and grader share `/app`, but `task_assets` live under `/app/task_assets`; treat that as a grader-integrity hazard rather than proof that `/app` is a safe Directory root. Directory capture of `/app` is valid only when trusted grader assets are isolated from branch-writable state, or when the plan explicitly records the branch-writable verifier as the intended vulnerable surface and pins the exact grader digest/source used for that experiment.

## MongoDB task snapshot probes

For the Terminal Wrench `mongodb-sales-aggregation-engine` task, do not treat `/app` as the snapshot boundary until proven. The handoff describes the task's layered pytest/plugin exploit path, and the checked-in Terminal Wrench source shows the task image seeds MongoDB under `/data/db`, starts `mongod` with `/var/log/mongodb.log`, and the verifier script installs/runs pytest and pymongo before executing the tests; the known attack family targets pytest/plugin surfaces rather than MongoDB business logic ([Chronos handoff](<html-spec/hack2fix2hack-handoff (4).html>), [Terminal Wrench Dockerfile](../../.external/terminal-wrench/tasks/mongodb-sales-aggregation-engine/claude-opus-4.6/original_task/environment/Dockerfile), [Terminal Wrench verifier script](../../.external/terminal-wrench/tasks/mongodb-sales-aggregation-engine/claude-opus-4.6/original_task/tests/test.sh), [Terminal Wrench tests](../../.external/terminal-wrench/tasks/mongodb-sales-aggregation-engine/claude-opus-4.6/original_task/tests/test_outputs.py), [Terminal Wrench task metadata](../../.external/terminal-wrench/tasks/mongodb-sales-aggregation-engine/claude-opus-4.6/task.json), [Terminal Wrench hack trajectory v5](../../.external/terminal-wrench/tasks/mongodb-sales-aggregation-engine/claude-opus-4.6/hack_trajectories/v5/metadata.json), [Terminal Wrench hack trajectory v5_2](../../.external/terminal-wrench/tasks/mongodb-sales-aggregation-engine/claude-opus-4.6/hack_trajectories/v5_2/metadata.json)).

Directory Snapshot is valid only after a probe proves one of these:

- All branch-relevant mutable state is under one `task_state_root`, and trusted verifier/test assets are outside branch-writable state.
- State outside the directory is deterministic from pinned base inputs and is recreated before branch execution.
- A repository-native layout conversion moved MongoDB `dbpath`, task-local caches, virtualenvs, and branch-writable runtime state under the task state root without changing task behavior.

Use Filesystem Snapshot when any relevant state remains outside that root, including MongoDB data/log mutation, pytest plugin installation, mutated Python package files, hidden caches, or branch-writable verifier assets. Directory Snapshot may rely on deterministic reconstruction only when the reconstruction recipe, pinned inputs, command argv, environment, and output hashes are recorded in ForkPoint evidence and re-executed before every restore probe. Reconstruction must not overwrite, ignore, or normalize branch-relevant mutations outside `task_state_root`; if any such mutation can affect reward, QA, replay, pytest/plugin loading, MongoDB state, or history-visible behavior, use Filesystem Snapshot or STOP. STOP rather than approximating if live process state is required and cannot be converted into a durable Directory/Filesystem restore.

Required capability probes:

- Directory probe: write marker files, package/plugin markers, and Mongo-visible state under the candidate `task_state_root`; snapshot, mount into a fresh Sandbox, and verify hashes plus task-visible outputs.
- Filesystem probe: write markers inside and outside the working directory; snapshot and restore; verify both expected markers and absence of prohibited secrets.
- MongoDB probe: verify `mongod` readiness, `dbpath`, process id, lock/fsync or clean shutdown strategy, journal state, restart command, seeded collections, restart behavior, and grader-visible database state after restore.
- Pytest/plugin probe: enumerate all Python startup and plugin injection surfaces visible to the verifier: `conftest.py` discovery roots, `PYTEST_DISABLE_PLUGIN_AUTOLOAD`, `PYTEST_PLUGINS`, pytest11 entry points, `.pth` files, `sitecustomize.py`, `usercustomize.py`, system site-packages, user site-packages, uv-created `.venv`, `UV_PROJECT_ENVIRONMENT`, `PYTHONPATH`, `PYTHONHOME`, cwd/rootdir, and import path ordering. Any mutable verifier import/plugin surface outside `task_state_root` forces Filesystem Snapshot or STOP; record contamination risk for Plan 005 without patching it here.
- Security probe: record network setting, secret mounts, sibling writable roots, resource limits, and trusted-evidence write isolation. Filesystem Snapshot must be captured from a sandbox without production secrets, local `.env`, host credentials, cloud metadata credentials, provider admin tokens, host Docker socket, or branch-irrelevant home/config directories. Include a harmless negative probe for a disallowed network or metadata destination, mounted secret names or absence markers, and CPU/memory/process/disk/wall-clock limits.
- Expiry probe: record snapshot TTL, provider object id retention, and expired/unavailable-snapshot error mapping.

Plan 005 owns verifier hardening for this pytest/plugin attack surface, tracked in [GitHub issue #7](https://github.com/ashtonchew/hack2fix2hack/issues/7). Plan 007 owns VM and Memory research capability probes, tracked in [GitHub issue #8](https://github.com/ashtonchew/hack2fix2hack/issues/8). Do not add Plan 005 or Plan 007 implementation scope to Plan 002.

## ForkPoint minimum evidence

The evidence manifest should link, not duplicate:

- source trace and selected step,
- trace kind, fork reason, QA result when available, and file diff when available,
- task/environment id,
- snapshot provider object,
- history artifact,
- state/history hashes,
- grader and image digests,
- fidelity probe command/output,
- failure-case test output.

## Common mistakes

- Snapshotting before the tool result enters history.
- Truncating history at a display step that does not equal the runtime action boundary.
- Patching or reading a “latest” grader during restore.
- Treating filesystem presence as proof that process state is irrelevant.
- Capturing broad home directories that contain secrets.
- Hiding a mismatched restore behind a retry from scratch.
- Assuming a provider can clean up untracked snapshots; persist provider object ids before any operation that may create an orphaned snapshot.
