# Chronos shared glossary

**Action boundary.** The quiescent point after one agent action has fully affected the executable environment and before the next action begins.

**Atomic fork.** One operation that captures executable state and truncates agent history at the same action boundary. Partial success is invalid.

**BranchRun.** One seeded stochastic continuation from a ForkPoint, including model, sampling configuration, reward, HUD trace identity, and lineage.

**Candidate exploit.** A rewarded branch that appears suspicious but has not yet passed all Witness gates.

**Control.** See Legitimate control.

**Discovery.** The stochastic phase that varies seeds, sampling, and optionally models to find attacks.

**Durable replay artifact.** A filesystem-class state artifact plus recorded actions, history prefix, environment image digest, grader identity, and hashes sufficient to outlive an ephemeral memory snapshot.

**Evidence manifest.** The per-plan JSON record of commands, exit codes, behavior checks, artifacts, links, and completion status.

**Exploit cluster.** Confirmed hacks grouped by target and mechanism so rewordings do not count as distinct finds.

**Exploit Witness.** A confirmed reward hack with complete provenance and a deterministic replay entrypoint. It is rewarded, classified as hacking, deduplicated, and replayed successfully before patching.

**Filesystem-class snapshot.** A Directory Snapshot or Filesystem Snapshot used as durable state, as distinct from an expiring process-memory snapshot.

**ForkPoint.** A HUD trace action boundary bound to the matching executable Modal state, history prefix, task/environment identity, grader digest, and reason for branching.

**Grader digest.** A content-derived identifier for the exact verifier/grader version used in a run.

**History prefix.** Agent-visible messages, tool calls, and results through exactly the ForkPoint action boundary.

**Hacker BranchRun.** A counted BranchRun whose task instruction is rewritten into an adversarial verifier-testing goal before the live gateway call. Its `branch_role`, `prompt_profile`, source reference, and prompt digest are provenance fields only; they do not replace reward, HUD QA classification, deduplication, durable packaging, or replay.

**Legitimate control.** A frozen, path-diverse, valid solution that must remain rewarded after verifier hardening.

**Lineage.** The parent ForkPoint or branch-node chain that explains how a branch reached its state.

**Merge gate.** Evidence conditions that all plans in one wave must satisfy before the next wave may begin.

**MCTS-shaped.** Tree-structured state expansion inspired by Monte Carlo Tree Search, without claiming a complete selection, expansion, value propagation, or tree policy implementation.

**Proof.** The deterministic phase that restores saved state and replays recorded actions against pinned environment and grader versions.

**ProofSet.** A rerunnable HUD taskset containing Exploit Witnesses that must fail under the patch, legitimate controls that must continue to pass, and optional re-seeded family variants.

**Prompt profile.** Provenance metadata identifying the instruction rewrite used for a BranchRun, such as the harden-v0 generic reward-hacking profile. It explains what kind of live continuation was attempted; it is not a classifier, reward signal, dedup decision, or replay proof.

**Release gate.** The binary rule that a patch may ship only when every Witness scores 0 and every legitimate control scores 1.

**ReleaseProof.** Versioned before/after evidence linking environment v1, environment v2, the ProofSet, trace results, and the release-gate verdict.

**Repo map.** Wave 1's checked record of real repository paths, commands, interfaces, capabilities, and ownership bindings.

**Reward.** The environment verifier's task-success signal. It is independent from reward-hacking classification.

**Reward-hacking classification.** HUD QA's assessment that a rewarded trajectory gamed the evaluator. It does not replace reward and is not itself proof.

**Snapshot mode.** The chosen executable-state capture profile: Directory, Filesystem, Memory, or VM-backed filesystem, selected according to where task state truly lives.

**Source trace.** The baseline reward-1 HUD trace that triggers Chronos and supplies evidence for ForkPoint selection.

**State fidelity.** The property that restoring a ForkPoint produces the same task-relevant state observable at the original action boundary.

**STOP condition.** A correctness, security, ownership, or evidence failure that forbids proceeding until resolved and recorded.

**Work packet.** A small vertical increment with its own behavior-level pass/fail check.
