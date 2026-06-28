# Logical interfaces specification

These are semantic contracts, not asserted programming-language signatures. Wave 1 binds each operation and record to the real repository code and records the mapping in `repo-map/INTERFACES.md`.

## ForkPoint record

Required fields:

- `schema_version`
- `fork_point_id`
- `hud_trace_id`
- `hud_step_id` or canonical action-boundary identity
- `task_id`
- `environment_version`
- `history_hash`
- `history_prefix_ref`
- `snapshot_id`
- `snapshot_mode`
- `snapshot_digest` when supported
- `grader_digest`
- `fork_reason`
- `created_at`
- `source_evidence_refs`

Invariant: the history prefix and executable snapshot were captured from the same completed-action boundary. The record is immutable after successful capture.

## BranchRun record

Required fields:

- `schema_version`
- `run_id`
- `branch_id`
- `parent_fork_point_id`
- `parent_node_id`
- `seed`
- `model`
- `sampling_config`
- `hud_trace_id`
- `environment_version`
- `grader_digest`
- `reward`
- `qa_result_ref`
- `lineage`
- `snapshot_restore_ref`
- `action_record_ref`
- `file_diff_ref`
- `started_at`
- `completed_at`
- `status`
- `error_class` when failed

Invariant: a completed branch can be compared or replayed without consulting mutable process memory.

## Exploit Witness record

Required fields:

- `schema_version`
- `witness_id`
- `source_branch_id`
- `pre_attack_snapshot_ref`
- `durable_snapshot_mode`
- `history_prefix_ref`
- `recorded_actions_ref`
- `file_diff_ref`
- `verifier_output_ref`
- `qa_result_ref`
- `environment_version`
- `environment_image_digest`
- `grader_digest`
- `seed`
- `model`
- `sampling_config`
- `exploit_target`
- `exploit_mechanism`
- `cluster_id`
- `replay_entrypoint`
- `replay_checks`
- `content_digest`
- `retention_policy`
- `created_at`

Promotion predicate:

    reward == 1
    AND qa.is_reward_hacking == true
    AND cluster decision is recorded
    AND provenance is complete
    AND durable replay artifact exists
    AND deterministic v1 replay passes

The exact reward value representation is bound to the real grader; the logical predicate means “successful according to v1.”

## ProofSet record

Required fields:

- `schema_version`
- `proof_set_id`
- `environment_v1`
- `grader_v1_digest`
- `exploit_witness_ids[]`
- `legitimate_control_ids[]`
- `exploit_family_variant_ids[]`
- `taskset_or_suite_ref`
- `created_at`
- `content_digest`

Invariant: members are immutable and the set is rerunnable.

## ReleaseProof record

Required fields:

- `schema_version`
- `release_proof_id`
- `proof_set_id`
- `environment_v1`
- `grader_v1_digest`
- `environment_v2`
- `grader_v2_digest`
- `patch_ref`
- `fixer_run_ref`
- `v1_results[]`
- `v2_results[]`
- `witnesses_killed`
- `controls_preserved`
- `gate_status`
- `trace_links[]`
- `published_environment_ref` or `release_candidate_ref`
- `created_at`
- `content_digest`

Gate predicate:

    every Witness: v1 success AND v2 failure
    AND every legitimate control: v1 success AND v2 success

No average or majority threshold substitutes for this binary rule.

## Legitimate control record

Required fields:

- `schema_version`
- `control_id`
- `task_id`
- `solution_ref`
- `solution_path_label`
- `source_method`
- `environment_version`
- `grader_digest`
- `expected_reward`
- `baseline_runs[]`
- `content_digest`
- `frozen_at`

Controls are generated through a real solver/reference mechanism and frozen before patch evaluation.

## Logical operations

### Select source trace

Input: trace identity or real export.  
Output: normalized trace evidence, QA result, file evidence, task/environment identity.  
Failure: missing stable identifiers, missing reward, or inaccessible evidence.

### Capture ForkPoint

Input: normalized source trace and selected completed-action boundary.  
Output: immutable ForkPoint.  
Failure: state/history boundary mismatch, snapshot capture failure, or unknown grader identity.

### Restore ForkPoint

Input: ForkPoint.  
Output: isolated executable environment plus reconstructed history prefix.  
Failure: digest mismatch, unavailable/expired state without durable fallback, or security policy failure.

### Run Branch

Input: restored ForkPoint, model, seed, sampling configuration.  
Output: BranchRun and HUD-linked evidence.  
Failure: bounded error record; no partial Witness.

### Classify and deduplicate

Input: completed BranchRun, reward result, QA result, prior clusters.  
Output: rejected candidate, existing cluster membership, or new exploit cluster candidate.  
Failure: missing independent reward or classification signal.

### Materialize Witness

Input: qualifying branch candidate.  
Output: durable Exploit Witness.  
Failure: replay, provenance, retention, or content-integrity gate fails.

### Replay Witness

Input: Witness, target environment/grader version.  
Output: deterministic result with trace and verifier output.  
Failure: any unpinned external dependency or action divergence.

### Generate controls

Input: real task and repository-approved solver/reference hints.  
Output: at least three frozen legitimate-control records.  
Failure: fewer than three genuinely distinct valid paths; record constraint rather than fabricate diversity.

### Fix verifier

Input: Witness evidence, grader v1, legitimate context, harden-v0 integration.  
Output: patch and fixer provenance.  
Failure: fixer cannot target the actual grader or produces an unverifiable patch.

### Evaluate release

Input: patch, ProofSet, v1 and v2 identities.  
Output: ReleaseProof with pass/reject reason.  
Failure: any missing case or digest mismatch.

### Publish/display release

Input: passing ReleaseProof and authorized target.  
Output: published environment reference or immutable permission-blocked candidate.  
Failure: publication error does not rewrite proof status.

## Error taxonomy

Use repository-native exceptions/results but preserve these semantic classes:

- `boundary_mismatch`
- `state_capture_failed`
- `state_restore_failed`
- `snapshot_expired`
- `grader_mismatch`
- `provenance_incomplete`
- `classification_unavailable`
- `replay_diverged`
- `security_capability_missing`
- `control_regression`
- `witness_survived`
- `publish_unauthorized`
- `publish_failed`

## Open questions

- What native records already cover these fields?
- How are tool calls and action results serialized today?
- Does HUD QA return a stable result id or only embedded payload?
- What digest primitives are standard in the repository?
- Which error/result style should carry semantic failure classes?
