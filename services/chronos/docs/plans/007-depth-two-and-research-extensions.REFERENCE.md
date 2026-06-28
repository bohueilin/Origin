# Plan 007 reference — research protocol and skip rules

## Promising-node evidence

Rank candidate child states from observable evidence:

- new or unusual file changes,
- changed test/plugin/grader interaction,
- a new exploit cluster precursor,
- verifier output suggesting a narrowed attack surface,
- task logs or process state that materially differs,
- optional exposed reasoning as one signal, never the sole dependency.

Any single observable signal from this list is sufficient to select a child — a file change alone qualifies — provided the selector records that signal, the alternatives considered, and why no other signal was observable at selection time. Exposed reasoning alone is never sufficient. Record the selected node, alternatives, evidence, and why the state merits reuse.

## Adaptive policy

Plan 007 owns the research scheduler. Plan 003 explicitly delegates adaptive stopping and depth-two expansion here (“Adaptive stopping and depth-two expansion belong to Plan 007”) and declares no core early stop.

Per node:

- initial child budget: at most 8,
- maximum tree depth: 2,
- count consecutive completed branches with no new target/mechanism cluster,
- reset count to zero when a new cluster is confirmed — including a cluster confirmed by a branch that was already in flight when the count reached 4,
- stop scheduling new branches at count 4,
- if count resets from an in-flight result, resume scheduling only when budget remains (total scheduled branches must stay at most 8),
- allow already-running branches to complete; cancel only when the core release needs resources and the scheduler's active branch list supports safe cancellation,
- never classify a raw rewarded branch as “new cluster” before QA/dedup.

## Depth-two replay anchor

A depth-two Witness's `pre_attack_snapshot_ref` points to the **child node's snapshot**, not the root ForkPoint. The root ForkPoint is never re-traversed during replay.

The child node snapshot must be a Directory or Filesystem artifact — a Memory Snapshot alone cannot satisfy Witness durability. The research scheduler records an explicit `retention/expiry` at child capture time sufficient to complete three consecutive replays.

The research scheduler owns the seal-or-discard decision. Once a depth-two Witness is sealed, its `pre_attack_snapshot_ref` passes to the core persistence layer under the same indefinite-retention rule as core Witnesses. Expiry of the child snapshot before three replays complete is a hard failure; there is no research-tier exemption.

## Flat comparison protocol

Make budgets comparable:

- same task and initial environment version,
- same attacker model family and sampling envelope,
- measured setup and execution time,
- comparable number of model calls or explicitly normalized compute,
- same reward/QA/dedup/Witness gates,
- multiple attempts only when budget permits.

Report raw counts and uncertainty/limitations. One task cannot establish universal superiority.

## Capability gate

A profile is implementable only when all are true:

1. Account/SDK probe succeeds.
2. The real task has state the profile uniquely preserves or enables.
3. Security boundaries are at least as strong as core.
4. The path has a real work packet/demo/research consumer.
5. Durable conversion is possible for any successful exploit.
6. Time/budget remain after core gates.

Otherwise record `skipped` with probe output and create no production adapter.

## VM and Memory capability matrix

Modal capability facts as of this plan's wave. Verify against the live SDK before implementing any path.

**Directory Snapshot** — Beta. Captures and mounts a specific directory. Default retention 30 days; explicit TTL available to opt out of expiry. Core Plan 002 path when task-relevant mutable state is contained under a verified directory boundary.

**Filesystem Snapshot** — captures the full Sandbox filesystem as an image. Default retention 30 days; explicit TTL available. Core Plan 002 fallback when directory containment is not honest.

**Memory Snapshot** — Alpha/experimental. 7-day expiry; cannot be extended. Source sandbox is terminated on snapshot. Cannot snapshot while `Sandbox.exec` is running. Background processes launched by `Sandbox.exec` are not reliably restored. Must never be the durable Witness system of record or `pre_attack_snapshot_ref`. VM Sandboxes do not support Memory Snapshots.

**VM Sandbox** — Alpha. Full VM with a real Linux kernel. Useful for Docker-in-Sandbox, Harbor, systemd/custom init, eBPF, cgroups/resource isolation, and loopback mounts. Supports Filesystem Snapshots; does not support Memory Snapshots. Not a replacement for Plan 002 Directory/Filesystem mode — use only when the real task cannot be honestly executed without kernel-level behavior.

| Evidence dimension | VM Sandbox | Memory Snapshot |
|---|---|---|
| **Availability** | Account/SDK probe succeeds for `vm` capability | Account/SDK probe succeeds for `memory` snapshot |
| **Task need** | Task genuinely requires Docker/Harbor, systemd, eBPF, cgroups, or loopback — not merely "more powerful" | Attack-relevant state is process-resident and cannot be reproduced from filesystem-class state plus recorded actions |
| **Security** | Isolation at least as strong as core; minimum secrets and scoped network | Same as core; no additional secrets passed to Alpha path |
| **Cleanup** | Record all created sandbox/snapshot ids; clean up after research run completes or is cancelled | Memory snapshot expires in 7 days regardless; successful discovery converted to durable artifact immediately |
| **Consumed path** | Real consumer exists in a research work packet before any adapter code is written | Durable conversion artifact exists (Directory/Filesystem snapshot + recorded actions + history prefix + env image digest + grader digest + restore command) before any Witness promotion |
| **Skip evidence** | Core Directory/Filesystem sandbox honestly executes the task without kernel-level behavior | No process-resident attack surface; filesystem-class capture plus recorded actions is sufficient to reproduce the attack |

## Transfer gate

Cross-task transfer requires at least one additional real task compatible with the existing shared defense pool. Report baseline and transferred-defense behavior separately. Do not claim Chronos invented transfer.

## Training-data analysis sequence

1. Gather real reward-1 trajectories from core/research runs.
2. Label them with sealed Witness/legitimate evidence.
3. Compare admission by raw v1 and hardened v2 verifier.
4. Report contamination count/fraction and exploit-cluster composition.
5. Only then consider optional SFT/RFT under a separate measured protocol.
6. Evaluate on held-out true behavior; label the prediction as hypothesis until measured.

No gradient-bearing monitor is introduced into the live architecture.

## Managed LoRA SFT launch policy

For a hackathon model-training artifact, prefer the smallest Fireworks managed-SFT
base model that supports LoRA and remains strong enough for the held-out eval.
Do not default to the Qwen3 8B Training API shape from `HUDDOC.MD`; that shape
previously rejected LoRA. If Fireworks confirms Qwen 3.5 4B is available as a
managed fine-tuning base with LoRA support, use it as the first candidate because
smaller models should train faster and cheaper for the raw-vs-Chronos-fixed
comparison.

Before launch, record a provider capability check with:

- supported base model id,
- training shape or managed SFT mode,
- LoRA rank accepted,
- dry-run or UI/CLI validation,
- expected cost/time,
- dataset row counts and tokenization pass.

Only claim "we did LoRA SFT on Qwen 3.5 4B" after `sft_job_request.json` and
`sft_job_result.json` prove the actual base model and LoRA config. Until then,
the model id, cost, time, and lift remain `TBD`.

## Managed RFT launch-readiness policy

RFT is supported as a secondary path after the SFT data-quality path, not as the
first hackathon bet. The RFT path consumes the same completed Plan 008 qabench
report and Plan 005 ReleaseProof, but emits launch-readiness artifacts rather
than starting a provider job.

Use managed Fireworks RFT only when:

- the SFT canonical export path is available,
- the ReleaseProof gate has passed,
- the evaluator scores against the hardened verifier / ReleaseProof contract,
- confirmed hacks are adversarial eval cases, not positive optimization targets,
- Fireworks provider capability, evaluator registration, dataset registration,
  expected cost/time, and dry-run or UI/CLI validation are recorded.

For coding-agent or tool-using tasks, managed RFT is not a tiny local-only path
unless a supported remote environment already exists. Remote RFT requires a
reachable HTTPS service, request authentication, reset/isolation semantics,
Fireworks tracing/correlation, and local evaluator tests. Without that evidence,
record `not_run` / `TBD` launch artifacts and do not claim RFT training.

Do not treat `HUDDOC.MD`'s low-level Training API loop as evidence of a managed
RFT job. It is a separate custom-training path.

## Valid evidence-backed skips

Examples:

- provider capability probe returns unavailable/unauthorized,
- no task state requires process memory,
- Docker-in-sandbox is not needed for the converted core task,
- no additional real task is materialized,
- branch budget consumed by core release,
- insufficient trajectories for a meaningful filter comparison.

“Ran out of interest” or “would take time” without budget evidence is not a valid skip.
