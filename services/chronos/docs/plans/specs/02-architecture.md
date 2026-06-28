# Architecture specification

## System boundary

Chronos is a feature-oriented orchestration layer between HUD's semantic/reward plane and Modal's executable-state plane. It reuses the repository's existing HUD, Modal, agent-gateway, grader, and harden-v0 integrations. It must not build parallel infrastructure when a verified integration already exists.

## Responsibility split

### HUD lane

HUD owns task identity, environment versions, source traces, step-level file evidence, reward authority, QA verdicts, branch trace linkage, tasksets/analytics, version comparison, and release publication.

### Modal lane

Modal owns isolated executable sandboxes, state capture/restore, warm fan-out when available, re-snapshotting, branch lineage support, resource boundaries, and replay execution at scale.

### ForkPoint seam

The ForkPoint joins the lanes. It binds one HUD action boundary and history prefix to one executable snapshot and immutable grader identity. A ForkPoint is invalid when either side is missing or represents a different boundary.

## Proposed feature boundaries

These are planning boundaries pending Wave 1 acceptance:

- `forkpoints`: source-trace ingestion, action-boundary selection, state capture/restore, snapshot profile decision, and ForkPoint contract.
- `witnesses`: branch scheduling, provenance, grading/classification, deduplication, durable Witness packaging, and deterministic replay.
- `controls`: real task materialization and frozen legitimate-control generation.
- `releases`: harden-v0 fixer integration, ProofSet construction, v1/v2 release gate, and ReleaseProof.
- `demo`: operator orchestration, evidence aggregation, metrics, and publishing/display.
- `research`: depth-two expansion, adaptive stopping, optional Alpha profiles, transfer, and training-data analysis.

Each feature folder owns its behavior and behavioral tests. Shared abstractions are extracted only after two real feature consumers need the same contract.

## Core data flow

    HUD source trace + QA + file evidence
      -> action boundary selection
      -> atomic ForkPoint capture
      -> isolated seeded BranchRuns
      -> HUD reward + separate QA classification
      -> target/mechanism dedup
      -> durable Witness + deterministic v1 replay
      -> harden-v0 fixer
      -> ProofSet (Witnesses + controls)
      -> deterministic v1/v2 evaluation
      -> ReleaseProof
      -> HUD publish/display

## Snapshot profiles

### Core profile

Use the verified repository-supported Directory Snapshot path when task-relevant mutable state is contained under a working directory. Use a verified Filesystem Snapshot fallback when the task or wrapper cannot isolate a directory cleanly. The core path must not require Alpha access.

### Conditional VM profile

Use a VM Sandbox only when real Docker-in-sandbox/Harbor behavior is required, account capability is verified, and the core path cannot honestly execute the task.

### Conditional memory profile

Use a Memory Snapshot only when task-relevant state lives in processes and filesystem capture loses the attack surface. It is a search accelerator, never the system of record. A successful branch is immediately materialized into a durable replay artifact.

## Correctness invariants

1. State and history share one action-boundary token.
2. The selected snapshot mode covers the task's true state.
3. Grader identity is immutable within an evaluation run.
4. Every branch has complete provenance and lineage.
5. Snapshot retention and expiry are explicit.
6. Reward and hacking classification remain separate.
7. Untrusted branches are isolated and least-privileged.
8. Ephemeral process-state discoveries become durable filesystem-class artifacts.

## Failure handling

- Boundary mismatch: reject ForkPoint; never “best effort” restore.
- Snapshot or history hash mismatch: quarantine artifact and stop dependent work.
- Grader digest mismatch: abort replay/release.
- Missing branch provenance: retain diagnostic trace but do not promote.
- Rewarded but non-hack branch: candidate rejected as Witness; may inform controls.
- QA hack verdict without reward: not a Witness.
- Replay failure: candidate remains unproven.
- Control failure under patch: reject and relax patch.
- Witness survival under patch: reject and widen patch.
- Expired snapshot: restore from durable representation or mark irreproducible.
- Missing security capability: fail closed before attacker code runs.

## Concurrency and idempotence

Each BranchRun writes to an isolated namespace keyed by immutable branch id. Retrying a branch with the same id is either idempotent or rejected as duplicate; a new stochastic attempt gets a new id and seed. Artifact publication uses content hashes and compare-and-set or equivalent repository-native semantics so partial retries cannot silently replace proof.

## Observability

Tag every agent/gateway call, snapshot operation, grader invocation, QA classification, and artifact write with run id, branch id, node id, environment version, and grader digest where applicable. Preserve trace links and concise error classifications. Metrics are derived from these events, not manually estimated.

## Open questions

- Where is the canonical completed-action event in the existing runtime?
- Does the repository already expose warm sandbox pooling or branch lineage storage?
- Which existing artifact store supports immutable manifests and large snapshot references?
- How does HUD environment-version publishing represent grader changes?
- What resource and network controls are enforceable in the actual Modal account?
