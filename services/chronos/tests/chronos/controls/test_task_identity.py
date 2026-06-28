"""Tests for pinned task identity digests."""

from chronos.controls.task_identity import compute_task_identity, verify_task_identity


def test_task_identity_matches_fixture() -> None:
    computed = compute_task_identity()
    assert computed["grader_digest"] == (
        "ecaf12227976729261555ba1c5c229ad89487fc1beb945b4b8ae52509b56f61f"
    )
    verify_task_identity()
