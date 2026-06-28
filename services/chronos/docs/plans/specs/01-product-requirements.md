# Product and requirements specification

## Outcome

Chronos lets an environment author turn one suspicious, rewarded HUD trace into an executable regression asset and a defended verifier release. The author can reopen the exact task state, search alternate attacks from it, save confirmed attacks as Exploit Witnesses, patch the verifier through the existing harden-v0 loop, and ship only when attacks fail and legitimate solutions still pass.

## Primary user

The primary user is an environment or benchmark author who owns the task, verifier, and environment-version lifecycle. A demo operator may exercise the same workflow, but judge-facing presentation is not a separate product surface.

## Trigger

The workflow begins with a real HUD trace that:

1. completed with reward 1,
2. has stable task and environment-version identity,
3. exposes step-level evidence needed to select an action boundary,
4. has a HUD Reward Hacking QA result that warrants investigation.

The QA result is evidence, not proof. Chronos must execute alternate continuations and deterministic replay.

## Core lifecycle

1. Select one suspicious source trace.
2. Bind one trace action boundary to matching executable state, history prefix, and grader digest as a ForkPoint.
3. Restore the ForkPoint into isolated sandboxes and run about 12 seeded stochastic continuations.
4. Grade and separately classify each branch for reward hacking.
5. Deduplicate confirmed attacks by target and mechanism.
6. Promote only replayable, fully provenanced attacks to Exploit Witnesses.
7. Freeze at least three path-diverse legitimate controls.
8. Ask the existing harden-v0 fixer to patch the exact verifier.
9. Construct a ProofSet containing Witnesses, controls, and optional family variants.
10. Run the deterministic release gate: every Witness must score 0 and every control must score 1.
11. Emit a ReleaseProof and publish or honestly display the hardened environment version.

## Must-ship acceptance

The core build is complete only when all of these are evidenced on the real integration surface:

- HUD Python/runtime version and protocol are pinned by the repository.
- The MongoDB sales aggregation task is reproducibly materialized.
- HUD file tracking is available on the source trace.
- One real reward-1 trace and one ForkPoint exist.
- Twelve genuine BranchRuns have unique branch identity, seeds, and lineage.
- At least one Exploit Witness passes every promotion gate.
- One Witness replays deterministically without rediscovery.
- One verifier patch is produced through harden-v0.
- At least three legitimate controls are frozen.
- One rerunnable ProofSet exists.
- One v1-versus-v2 ReleaseProof passes the binary release gate.
- The 13-step demo can be shown with linked evidence.

## Stretch acceptance

Stretch work is valuable only after the depth-1 release loop works:

- Re-snapshot a promising child and run at least one depth-two branch.
- Stop node expansion after four consecutive branches produce no new exploit cluster.
- Exercise Memory Snapshot or VM Sandbox paths only when capability and task need are real.
- Measure cross-task transfer only with real additional tasks.
- Measure raw-versus-hardened trajectory filtering before any optional training experiment.
- Compare state branching with flat restarts only when both are honestly measured.

An unavailable Alpha capability or missing research dataset produces an evidence-backed skip, not unused scaffolding.

## Product objects

- **ForkPoint:** semantic HUD boundary plus executable state.
- **BranchRun:** one seeded stochastic continuation with complete provenance.
- **Exploit Witness:** confirmed, deduplicated, durably stored, deterministically replayable reward hack.
- **ProofSet:** Witnesses to kill plus legitimate controls to preserve.
- **ReleaseProof:** immutable before/after evidence for a hardened environment version.

Required fields and logical interface contracts are in `03-interfaces.md`.

## User-visible demo contract

The operator opens the suspicious trace, shows QA and file evidence, shows the ForkPoint, starts genuine stochastic branches, inspects branch identities and one exploit, saves the Witness, adds it to the ProofSet, applies the patch, replays the Witness against v2, reruns controls, shows the ReleaseProof, and publishes or displays the hardened version.

When live stochastic discovery misses during presentation, the operator may restore a Witness produced by an earlier genuine stochastic run. The report must label it as prior-run evidence and never imply live discovery.

## Non-goals

The core does not promise a broad benchmark campaign, complete exploit coverage, a general MCTS implementation, general-purpose “harden anything,” infrastructure redesign for observationally impossible tasks, or live reinforcement learning. Snapshot branching itself is not claimed as novel.

## Metrics

Record observed values for:

- BranchRun count,
- distinct exploit clusters,
- time to first Witness,
- v1 and v2 Witness rewards,
- legitimate-control retention,
- deterministic replay success,
- snapshot restore latency,
- setup work avoided,
- optional coverage/compute comparison with flat restarts.

Unknown values remain `TBD` or `not-measured`; no illustrative number may be reported as a result.

## Open questions

- Which real source trace and export format are available?
- Does the task support three genuinely path-diverse controls?
- Which HUD taskset/version-publication operations already exist in the repository?
- Is public publishing authorized, or is a release candidate the honest endpoint?
- What measured result, if any, is strong enough to justify the optional flat-restart comparison?
