"""Promising child selection for depth-two research."""

from __future__ import annotations

from .models import ChildCandidate


class ResearchError(RuntimeError):
    """Plan 007 contract failure."""


def select_promising_child(candidates: list[ChildCandidate]) -> dict[str, object]:
    """Select a depth-one child only when observable evidence exists.

    Exposed reasoning can help explain a choice but cannot be the only signal.
    The selected child must be task-visible or grader-visible different from
    its parent through at least one accepted observable signal.
    """

    if not candidates:
        raise ResearchError("no child candidates were provided")

    ranked = sorted(
        candidates,
        key=lambda candidate: (
            candidate.observable_signal_count(),
            len(candidate.exposed_reasoning_refs),
        ),
        reverse=True,
    )
    selected = ranked[0]
    if selected.depth != 1:
        raise ResearchError(
            "depth-two expansion must select a completed depth-one child"
        )
    if selected.observable_signal_count() == 0:
        raise ResearchError(
            "promising child requires observable evidence beyond exposed reasoning"
        )
    if not selected.snapshot_ref:
        raise ResearchError("promising child is missing a snapshot reference")

    signal_kinds = ", ".join(
        sorted({str(signal["kind"]) for signal in selected.observable_signals})
    )
    fork_reason = (
        f"Selected {selected.node_id} for depth-two expansion because observable "
        f"signals differ from parent {selected.parent_node_id}: {signal_kinds}."
    )
    return selected.to_selection_record(fork_reason=fork_reason)
