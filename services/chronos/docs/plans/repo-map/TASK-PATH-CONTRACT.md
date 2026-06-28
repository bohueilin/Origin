# Terminal Wrench Task Path Contract

Status: **accepted for Plan 001 env materialization**

This contract prevents a recurring false fix: treating `/app` as a universal
agent workspace. `/app` is correct for `mongodb-sales-aggregation-engine`
because that source task declares it through its Dockerfile `WORKDIR` and its
prompt/tests refer to `/app/query.py`. It is not a general Terminal Wrench or
HUD default.

## Contract

When materializing a Terminal Wrench task into HUD, derive the agent workspace
and grader working directory from the source task, in this order:

1. Select the exact pinned `original_task` variant recorded by the fixture
   source checkout.
2. Parse `task.toml` for task identity, resources, environment, and metadata.
   Do not infer the working directory from `task.toml` unless it explicitly
   declares one.
3. Parse the final effective Dockerfile `WORKDIR` with Docker semantics:
   relative `WORKDIR` values resolve against the previous `WORKDIR`, and the
   last value in the final runtime stage wins.
4. Parse `test.sh` for verifier command, expected cwd, reward-file location,
   service startup, and any PWD guard.
5. Parse instructions, tests, and reference or hack trajectories for absolute
   artifact paths and import paths.
6. If `docker-compose.yml` or equivalent runtime metadata exists, apply
   `working_dir`, volume, environment, and service overrides on top of the
   Dockerfile result.
7. Mount the HUD workspace at the same guest path when the source task uses
   absolute paths:

   `env.workspace(Path(source_workdir), guest_path=source_workdir, ...)`

8. Run the grader with an explicit `cwd=source_workdir` and prefer relative
   grader command paths inside that cwd.

Only rewrite task paths when the converter rewrites all prompts, tests,
reference scripts, trajectories, and verifier commands together and records the
rewrite as a fixture transformation.

## Mutable State Inventory

The workspace path is only one state root. A task may also depend on mutable
state outside the workspace, including database directories, service repos,
browser profiles, `/var/www`, `/data/db`, `/var/log`, `/usr/local`, and user
home directories. Those paths must be declared as task state before snapshot,
fork, replay, or grader proof work can be trusted.

## STOP Conditions

Stop materialization and record a blocker when any of these are true:

- The final effective `WORKDIR` is missing, unparseable, or `/`.
- Dockerfile `WORKDIR`, prompt target path, test imports, and verifier command
  disagree without a recorded rewrite.
- The verifier relies on dynamic `cd`, environment indirection, or shell
  variables that the converter cannot resolve deterministically.
- Compose or runtime metadata changes `working_dir`, mounts, or environment and
  the converter cannot apply those changes.
- The task writes outside the workspace and that mutable state is not declared.
- The agent and grader cannot be proven to see the same writable path.

## Proof Gate

Before accepting a converted HUD task:

- A startup probe prints the expected agent PWD.
- An agent-written sentinel under the source workdir is visible to the grader.
- Trusted verifier files are isolated unless the task is intentionally
  subvertible and the vulnerability is part of the experiment.
- Stub solution rewards 0 and reference solution rewards 1.
- Extra mutable state outside the workspace is recorded.

## Evidence Sample

A scan of 323 pinned `claude-opus-4.6` Terminal Wrench tasks found multiple
runtime workdirs:

| Workdir | Count |
|---|---:|
| `/app` | 273 |
| `/workspace` | 15 |
| none declared | 11 |
| `/home/user` | 10 |
| `/workdir` | 5 |
| other task-specific paths | 9 |

Examples: the MongoDB sales task uses `/app`; a multi-head-attention task uses
`/workspace`; several system tasks target `/home/user`, `/usr/local`,
`/var/lib/flatpak`, or service repositories. Therefore `/app` is a common
source-task value, not a safe converter default.
