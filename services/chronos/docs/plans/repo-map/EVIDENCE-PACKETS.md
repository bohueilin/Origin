# Gate 1 evidence-packet contracts

Status: **open — awaiting packets**

Gate 1 (`STATUS.json` → `accepted`) cannot be reached by Plan 001 alone. Several
core prerequisites describe runtime and proof surfaces owned by other lanes.
During Wave 1, Ashton and Katherine do **not** implement their plans; they each
return one evidence packet to Akhil, who integrates it into this repo map.

Each packet field below names the exact `STATUS.json` `core_prerequisites` key,
`INTERFACES.md` row, and `COMMANDS.json` key it unblocks. A field is only
accepted with a **checked-in path plus command and observed output** — an SDK
install or an upstream URL is necessary but never sufficient (see
`INTERFACES.md` "Required next inputs" and assumptions A-003, A-005, A-011).

Akhil flips a prerequisite boolean to `true` only when the packet field is
accepted with command evidence. If the field is intentionally later-wave work,
Akhil records it in `STATUS.json.gate1_acceptance` as `located-owned` with the
owning plan and evidence reference instead of fabricating a `true` value. Akhil
owns the HUD-facing prerequisites directly; Ashton owns the runtime packet;
Katherine owns the proof/control packet.

## Field acceptance rule

Every packet field record uses:

    - field: <name>
      unblocks_prerequisite: <core_prerequisites key | none>
      unblocks_interface_row: <INTERFACES.md semantic operation>
      unblocks_command: <COMMANDS.json key | none>
      path: <repository-relative path that now exists>
      command: <argv that exercises it>
      observed: <concise real output>
      status: accepted | partial | blocked
      blocker: <text if not accepted>

`partial` and `blocked` are honest states. Do not mark a field `accepted` from
documentation, a help message, or an SDK import alone; it must exercise the real
product surface.

## Packet A — runtime (owner: Ashton)

> Partial pre-verification (Akhil, 2026-06-20): Modal auth + core snapshot
> capability were verified directly via `probes/modal_snapshot_probe.py`
> (filesystem round-trip PASS, directory-snapshot Beta create PASS), flipping
> `modal_adapter` to `true`. Still owned by Ashton's packet: branch **isolation**
> / secret scoping (`security_controls`) and the **agent/model gateway** binding.
> The HUD branch model is set to `claude-haiku-4-5` (gateway, agent type
> `claude`).

Answers the runtime/branching questions and unblocks the executable-state lane.

| Field | Prerequisite | Interface row | Command key |
|---|---|---|---|
| Modal account/config location | `modal_adapter` | Modal sandbox create | — |
| Snapshot mode available (Directory/Filesystem core; Memory/VM alpha) | `modal_adapter` | Modal core snapshot capture/restore | — |
| Capture + restore executable state proof | `modal_adapter` | Modal core snapshot capture/restore | `integration-forkpoint` |
| Branch isolation (sandbox tenancy, no sibling reach) | `security_controls` | Secrets/network/resource isolation | `security-branch` |
| Secret scoping / egress / resource limits | `security_controls` | Secrets/network/resource isolation | `security-branch` |
| Agent/model gateway + seed/sampling config | `modal_adapter` | Agent/model gateway | `integration-witness` |
| Command that proves the runtime path | `modal_adapter` | Modal sandbox create | `integration-forkpoint` |

STOP for Packet A: if executable state cannot be captured and restored on the
core (non-Alpha) snapshot path, record `modal_adapter` as blocked. The core demo
must not depend on Alpha VM/Memory access (A-005, A-018).

## Packet B — proof / control (owner: Katherine)

Answers the harden-v0 and task-fixture questions and unblocks the proof lane.

| Field | Prerequisite | Interface row | Command key |
|---|---|---|---|
| harden-v0 pin + repo-native integration contract | `harden_v0` | harden-v0 fixer | `integration-release` |
| harden-v0 replay/dedup/legitimate handling | `harden_v0` | harden-v0 replay/dedup/legitimate handling | `integration-release` |
| Can harden-v0 patch the **actual** grader (digest before/after) | `grader` | Grader/verifier run and digest | `integration-release` |
| MongoDB task materialization command | `mongodb_task` | MongoDB task materialization | `integration-controls` |
| Solver/reference/control path (≥3 path-diverse) | `mongodb_task` | Legitimate solver/reference hints | `plan-004-tests` |
| Command that proves the task fixture works | `mongodb_task` | MongoDB task materialization | `integration-controls` |
| Where release artifacts live | `artifact_store` | Persistence/artifact store | — |

STOP for Packet B: the grader prerequisite is only `accepted` when harden-v0
patches the exact grader used in replay and both v1/v2 digests are captured from
the real execution surface, not a detached copy (A-011, Seam 3).

## Akhil-owned prerequisites (HUD-facing)

These do not come from a peer packet; Akhil records them directly and they need
real HUD access. Until then they stay blocked.

| Item | Prerequisite | Interface row |
|---|---|---|
| Real reward-1 suspicious source trace + trace ID | `source_trace` | HUD trace retrieval/export |
| Reward-1 result + step/file evidence | `source_trace` | HUD step/file evidence |
| HUD QA reward-hacking classification | `source_trace` | HUD Reward Hacking QA |
| task ID / environment version / grader identity+digest | `grader` | Grader/verifier run and digest |
| Taskset / version-compare / publish capability or blocker | `artifact_store` | HUD environment version publish/compare |

## Integration procedure (Akhil)

1. Receive a packet; for each field, verify the cited path exists and rerun the
   cited command in this checkout.
2. Copy the field record into the relevant `INTERFACES.md` row with status and
   evidence; add any mapped command to `COMMANDS.json`.
3. Flip the corresponding `core_prerequisites` key in `STATUS.json` to `true`
   only when its backing field(s) are `accepted`; otherwise keep the boolean
   `false` and record the Gate-1 state as `located-owned` with owner plans and
   evidence refs.
4. Add a dated entry to Plan 001's Living-doc log naming the packet, field, and
   resulting prerequisite change.
5. When every prerequisite is either `verified-present` or `located-owned` in
   `STATUS.json.gate1_acceptance`, set `STATUS.json` status to `accepted`, run
   the Done-when validators, and complete `evidence/001/`.

## Acceptance gate

`STATUS.json` becomes `accepted` only when every Gate-1 prerequisite has an
explicit `STATUS.json.gate1_acceptance` entry. `verified-present` entries need
backing evidence in this file, `INTERFACES.md`, `COMMANDS.json`, the evidence
manifest, or a named artifact. `located-owned` entries need at least one owner
plan and evidence reference. No prerequisite boolean is flipped on a packet that
is only `partial` or `blocked`.
