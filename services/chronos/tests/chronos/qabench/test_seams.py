"""The deferred 003 / live seams stay clearly not-wired and the default dedup works."""

import pytest

from chronos.qabench.models import ConfirmedHack, TrajectorySource
from chronos.qabench.seams import (
    Deduplicator,
    NotWiredCleanVerifyRunner,
    NotWiredLiveDiscoveryDriver,
    NotWiredError,
    TargetMechanismDeduplicator,
)


def _hack(target: str | None, mechanism: str | None) -> ConfirmedHack:
    return ConfirmedHack(
        trajectory_id="t",
        task_id="task",
        source=TrajectorySource.BASE,
        exploit_target=target,
        exploit_mechanism=mechanism,
        qa_visible=True,
        qa_flagged=False,
        has_divergence_lineage=False,
    )


def test_live_discovery_driver_is_not_wired() -> None:
    with pytest.raises(NotWiredError):
        NotWiredLiveDiscoveryDriver().run_discovery_tree("task-1")


def test_clean_verify_runner_is_not_wired() -> None:
    with pytest.raises(NotWiredError):
        NotWiredCleanVerifyRunner().run("workspace-ref")


def test_default_dedup_groups_by_target_and_mechanism_case_insensitively() -> None:
    deduper = TargetMechanismDeduplicator()
    assert deduper.cluster_key(_hack("G1", "Conftest")) == deduper.cluster_key(
        _hack("g1", "conftest")
    )
    assert deduper.cluster_key(_hack("g1", "conftest")) != deduper.cluster_key(
        _hack("g2", "conftest")
    )


def test_default_dedup_missing_and_blank_collapse_but_not_with_a_literal() -> None:
    deduper = TargetMechanismDeduplicator()
    # None and blank both mean "no value" and collapse together...
    assert deduper.cluster_key(_hack(None, None)) == deduper.cluster_key(
        _hack("  ", "")
    )
    # ...but a real value that happens to read "unknown-target" does NOT collide.
    assert deduper.cluster_key(_hack(None, None)) != deduper.cluster_key(
        _hack("unknown-target", "unknown-mechanism")
    )


def test_default_dedup_does_not_collide_on_separator_characters() -> None:
    deduper = TargetMechanismDeduplicator()
    assert deduper.cluster_key(_hack("a", "b::c")) != deduper.cluster_key(
        _hack("a::b", "c")
    )


def test_default_dedup_satisfies_the_deduplicator_protocol() -> None:
    assert isinstance(TargetMechanismDeduplicator(), Deduplicator)
