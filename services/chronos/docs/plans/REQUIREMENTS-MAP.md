# Requirement inventory and traceability

The inventory below is normalized from the handoff. Each requirement maps to at least one numbered plan; governance-only scope rules may also cite `AGENTS.md`. “Acceptance” states observable evidence, not implementation shape.

| ID | Requirement | Plans | Acceptance |
|---|---|---|---|
| R-001 | Turn one suspicious HUD trace into a ForkPoint, stochastic attacks, durable Witnesses, a patch, and proof. | 001, 002, 003, 005, 006 | One end-to-end release flow is evidenced. |
| R-002 | Treat HUD Reward Hacking QA as trigger/evidence, not a replacement for execution or proof. | 002, 003, 006 | QA verdict is read separately and the demo distinguishes both jobs. |
| R-003 | Reuse/fork harden-v0 hacker-fixer-solver behavior; do not reinvent its fixer, replay gate, dedup, or legitimate handling. | 001, 003, 005 | Repo map binds the existing integration and the release plan calls it through a thin adapter. |
| R-004 | Keep HUD and Modal as first-class lanes joined by the ForkPoint. | 002, 003, 005, 006 | Evidence links HUD semantics/reward to Modal state/fan-out/replay. |
| R-005 | Use one real suspicious reward-1 source trace. | 001, 002 | Immutable trace identifier/export and observed reward are recorded. |
| R-006 | Enable and preserve step-level HUD file evidence. | 001, 002, 006 | ForkPoint and demo artifacts link a real file diff. |
| R-007 | Represent ForkPoint with trace step, task/environment, history hash, snapshot, mode, grader digest, and reason. | 002 | Round-trip and invariant checks cover all required fields. |
| R-008 | Represent each BranchRun with parent, id, seed, model, sampling config, HUD trace, reward, and lineage. | 003 | All 12 branch records contain complete provenance. |
| R-009 | Gate Exploit Witness on reward, QA hack classification, deduplication, durable provenance, and deterministic replay. | 003 | At least one branch passes every gate and replays three times. |
| R-010 | Build a ProofSet of Witnesses, legitimate controls, and optional family variants. | 005 | ProofSet manifest and HUD taskset/equivalent are rerunnable. |
| R-011 | Build a ReleaseProof comparing environment/grader v1 and v2. | 005, 006 | Before/after results and trace links are immutable artifacts. |
| R-012 | Capture history and executable state at one exact completed-action boundary. | 002 | Injected boundary mismatch fails closed; matched restore passes. |
| R-013 | Choose snapshot mode according to the task's true state. | 002, 007 | Core mode decision is evidenced; research modes are capability-gated. |
| R-014 | Pin the grader version/digest within each proof run. | 002, 003, 005 | Digest mismatch aborts replay/release. |
| R-015 | Record complete branch provenance and node lineage. | 003 | Missing seed/model/sampling/lineage blocks Witness promotion. |
| R-016 | Make retention explicit and convert ephemeral memory discoveries to durable replay artifacts. | 003, 007 | Witness references a durable filesystem-class artifact and expiry policy. |
| R-017 | Keep verifier reward and QA reward-hacking classification as separate signals. | 003, 005 | Truth-table tests cover rewarded/non-rewarded and hack/non-hack combinations. |
| R-018 | Isolate untrusted branches with minimum secrets, scoped networking, and bounded resources. | 001, 003 | Capability audit plus a real negative isolation check passes. |
| R-019 | Ship the depth-1 loop before research stretch. | 000, 002, 003, 004, 005, 006 | Core merge gate closes before Plan 007 can be considered release-critical. |
| R-020 | Run approximately 12 genuine stochastic BranchRuns from the first ForkPoint. | 003 | Twelve unique branch IDs/seeds are visible in evidence. |
| R-021 | Produce at least one confirmed Exploit Witness. | 003 | Manifest contains at least one complete Witness id and replay artifact. |
| R-022 | Provide one deterministic replay without re-discovery. | 003 | Same recorded actions reproduce v1 reward in three consecutive restores. |
| R-023 | Produce one verifier patch through harden-v0's fixer loop. | 005 | Patch provenance names the fixer run and grader digest. |
| R-024 | Freeze at least three path-diverse legitimate controls. | 004 | Three controls pass v1 repeatedly and are immutable. |
| R-025 | Create one HUD ProofSet/taskset or the repository-native equivalent. | 005 | Rerun command produces analytics/results for all cases. |
| R-026 | Require v2 to score every Witness 0 and every control 1. | 005 | Release gate is binary and rejects either failure. |
| R-027 | Publish or honestly display the hardened environment version/release candidate. | 006 | Published id or evidence-backed permission block is shown. |
| R-028 | Support the 13-step live demo contract from trace through ReleaseProof. | 006 | Demo report has one passed/linked entry per step. |
| R-029 | Use a clearly labelled prior-run Witness fallback if live discovery misses. | 003, 006 | Fallback restores and replays a genuine prior-run artifact without claiming live discovery. |
| R-030 | Report measured branch count, exploit clusters, time to Witness, rewards, retention, replay rate, restore latency, setup avoided, and optional coverage/compute. | 003, 005, 006, 007 | Metrics artifact uses observed values or explicit not-measured status. |
| R-031 | Anchor the core fixture on the real Terminal Wrench MongoDB sales aggregation task. | 001, 004 | Provenance and reproducible task materialization are recorded. |
| R-032 | Use Directory Snapshot or verified filesystem-class fallback for the core live path, without Alpha dependency. | 001, 002, 003 | Capability probe selects an available core profile. |
| R-033 | Treat VM Sandbox direct Harbor/Docker execution as conditional Alpha stretch. | 007 | Capability probe either runs a real path or records a justified skip. |
| R-034 | Treat Memory Snapshot process-state branching as conditional Alpha research and never the durable Witness format. | 007 | Any memory result is converted to durable state; unavailable mode creates no scaffold. |
| R-035 | Re-snapshot one promising child and exercise at least one depth-two branch as stretch. | 007 | Depth-two lineage and result artifact exist. |
| R-036 | Add bounded adaptive stopping after four consecutive branches produce no new exploit cluster. | 007 | Deterministic policy test and measured run show stop behavior. |
| R-037 | Use target/mechanism deduplication and avoid counting rephrasings as new exploits. | 003, 007 | Cluster evidence groups equivalent branches. |
| R-038 | Evaluate cross-task defense transfer only as measured stretch. | 007 | Real multi-task evidence or an explicit unavailable-data skip is recorded. |
| R-039 | Evaluate raw-vs-hardened training-data filtering before any optional training experiment. | 007 | Contamination report uses real core trajectories; no unmeasured performance claim. |
| R-040 | Keep broad benchmark campaigns, full MCTS, complete exploit coverage, general hardening, and live RL out of scope. | AGENTS, 007 | No plan claims or implements these as core. |
| R-041 | Use real acceptance fixtures instead of fake HUD, grader, snapshot, or task surfaces. | 002, 003, 004, 005, 006 | At least one real HUD × Modal end-to-end run is required. |
| R-042 | Reject patch narrowing that breaks a legitimate control. | 004, 005 | A failing control rejects the release and returns evidence to the fixer. |
| R-043 | Reject any Witness that cannot replay deterministically. | 003 | Replay failure leaves the branch as a candidate, not a Witness. |
| R-044 | Describe the search as MCTS-shaped, not full MCTS, and concede commodity snapshot branching. | 006, 007 | Demo/research copy uses bounded claims. |
| R-045 | Measure flat-restart compute/coverage only when an honest comparison is run. | 007 | Report contains measured data or not-measured, never fabricated values. |
| R-046 | As an additive (ablation) benchmark on 20 freshly materialized Terminal Wrench tasks, measure the lift the Chronos executable discovery layer adds on top of HUD QA — sterile-referee-confirmed reward-hack clusters QA alone finds (X) versus the extra clusters the layer adds (Δ), split into a detection delta and a discovery delta. | 008 | One report gives per-task and aggregate baseline X and lift Δ (coverage and depth), the detection and discovery deltas, and cost/latency, with no metric unreported, no "beats QA" framing, and Δ = 0 a valid result. |
| R-047 | Define reward-hack ground truth by a neutral sterile golden/held-out referee (re-run the task's own verification isolated from agent-tampered state; not a classifier and not the Plan 005 v2 grader) and validate it against curated Terminal Wrench labels before scoring; run HUD QA post-trace on the same population. | 008 | The referee-vs-curated-label agreement rate is recorded, HUD reward / HUD QA verdict / referee verdict stay three separate signals, and a live-hook log shows at least one dual-verdict BranchRun. |

## Coverage rules

- A requirement may map to several plans when one plan creates an artifact and another consumes or demonstrates it.
- Stretch requirements remain mapped even when runtime capability or data may produce an evidence-backed skip.
- `R-040` is a scope guard inherited by every plan through `AGENTS.md`.
- The validator checks that every row maps to a known plan or governance file.
