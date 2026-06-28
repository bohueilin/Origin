"""Build the 13 Acceptance Demo report steps with honest status labels.

Live steps (4, 5) reference this invocation's fresh branch evidence. Witness and
v2-replay steps (6, 7, 10) are labelled ``fallback`` because this invocation
launches branches but does not re-run the three-replay sealing gate; their
evidence is the prior-run sealed Witness, named as such. A blocked run marks the
live and publish steps ``failed`` and points them at the resource STOP.
"""

from __future__ import annotations

from typing import Any

from .branch_launch import BranchBatchResult
from .forkpoint_inputs import DemoInputs
from .report import STEP_LABELS


def _step(
    number: int,
    status: str,
    evidence_refs: list[str],
    observed_behavior: str,
    *,
    started_at: str,
    finished_at: str,
) -> dict[str, Any]:
    return {
        "step_number": number,
        "label": STEP_LABELS[number],
        "status": status,
        "evidence_refs": [ref for ref in evidence_refs if ref],
        "observed_behavior": observed_behavior,
        "started_at": started_at,
        "finished_at": finished_at,
    }


def build_steps(
    *,
    batch: BranchBatchResult,
    inputs: DemoInputs,
    publication_attempt_ref: str,
    started_at: str,
    finished_at: str,
    blocked: bool,
    resource_stop_ref: str | None,
) -> list[dict[str, Any]]:
    """Return exactly 13 step records for the report."""

    prior = inputs.prior_run_id
    live_evidence = [batch.batch_artifact_ref] if batch.batch_artifact_ref else []
    sample_branch_refs = batch.branch_refs[:1] + batch.branch_refs[-1:]

    def s(number: int, status: str, refs: list[str], behavior: str) -> dict[str, Any]:
        return _step(
            number,
            status,
            refs,
            behavior,
            started_at=started_at,
            finished_at=finished_at,
        )

    steps: list[dict[str, Any]] = [
        s(
            1,
            "passed",
            [inputs.forkpoint_ref, inputs.source_trace_ref],
            f"Opened the suspicious source HUD trace {inputs.source_trace_id} recorded on the accepted ForkPoint.",
        ),
        s(
            2,
            "passed",
            [inputs.qa_verdict_ref, inputs.file_diff_ref],
            "Showed the Reward Hacking QA verdict and the file-diff evidence for the exploit branch.",
        ),
        s(
            3,
            "passed",
            [inputs.forkpoint_ref],
            "Showed the selected accepted ForkPoint with its snapshot, grader, and history identity.",
        ),
    ]

    if blocked:
        stop_refs = [resource_stop_ref] if resource_stop_ref else []
        steps.append(
            s(
                4,
                "failed",
                stop_refs or live_evidence or [inputs.prior_batch_ref],
                "The live branch batch did not launch the full accepted budget; recorded a resource STOP "
                "instead of claiming genuine stochastic branches.",
            )
        )
        steps.append(
            s(
                5,
                "failed",
                stop_refs or live_evidence or [inputs.prior_batch_ref],
                "No full set of fresh live branch ids/traces populated because the live launch was blocked.",
            )
        )
    else:
        steps.append(
            s(
                4,
                "passed",
                live_evidence,
                f"Started a genuine stochastic search: launched the full accepted budget of "
                f"{batch.executed_branch_count} live BranchRuns from the accepted ForkPoint.",
            )
        )
        steps.append(
            s(
                5,
                "passed",
                sample_branch_refs + live_evidence,
                f"Showed fresh live branch ids and HUD traces populating across all "
                f"{batch.executed_branch_count} BranchRuns this invocation.",
            )
        )

    steps.extend(
        [
            s(
                6,
                "fallback",
                [inputs.file_diff_ref, inputs.prior_branch_ref],
                f"Inspected one exploit and its file diff from the labelled prior run {prior} "
                "(this invocation did not re-seal a fresh Witness).",
            ),
            s(
                7,
                "fallback",
                [inputs.prior_witness_ref],
                f"Showed the prior-run sealed Exploit Witness {inputs.prior_witness_ref} "
                f"(digest {inputs.prior_witness_digest[:16]}) from run {prior}; not a fresh live Witness.",
            ),
            s(
                8,
                "displayed",
                [inputs.proofset_ref],
                "Displayed the Witness inside the Plan 005 ProofSet used to derive the release candidate.",
            ),
            s(
                9,
                "displayed",
                [inputs.patch_ref],
                "Displayed the applied verifier patch from the Plan 005 fixer run.",
            ),
            s(
                10,
                "fallback",
                [inputs.v2_replay_ref, inputs.release_candidate_ref],
                f"Replayed the prior-run Witness against v2: reward {inputs.v2_replay_reward} (neutralized). "
                f"Labelled fallback because the replayed Witness is from run {prior}.",
            ),
            s(
                11,
                "displayed",
                [inputs.controls_baseline_ref, inputs.proofset_ref],
                f"Reran the legitimate controls: {inputs.controls_preserved} baseline controls preserved on v2.",
            ),
            s(
                12,
                "displayed",
                [inputs.release_proof_ref],
                "Showed the passing ReleaseProof gating the hardened release candidate.",
            ),
        ]
    )

    if blocked:
        steps.append(
            s(
                13,
                "failed",
                [resource_stop_ref, publication_attempt_ref]
                if resource_stop_ref
                else [publication_attempt_ref],
                "Did not reach a clean publish/display step because the live acceptance run was blocked; "
                "the publication attempt remains an honest blocked-with-proof record.",
            )
        )
    else:
        steps.append(
            s(
                13,
                "blocked-with-proof",
                [publication_attempt_ref, inputs.release_candidate_ref],
                "Recorded an honest blocked-with-proof publish/display outcome: sealed release candidate and "
                "passing ReleaseProof present, but no repository-bound publish primitive exists to publish to.",
            )
        )

    return steps


__all__ = ["build_steps"]
