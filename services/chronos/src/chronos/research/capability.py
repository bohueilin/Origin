"""Memory and VM capability gate classification."""

from __future__ import annotations

from typing import Literal

from .models import CapabilityGateRecord, CapabilityOutcome


class CapabilityGateError(RuntimeError):
    """Invalid capability gate evidence."""


def classify_capability_gate(
    *,
    profile: Literal["memory", "vm"],
    probe_succeeded: bool,
    probe_ref: str,
    task_need_ref: str | None = None,
    task_need_unique: bool = False,
    security_ref: str | None = None,
    security_sufficient: bool = False,
    consumed_path_ref: str | None = None,
    durable_conversion_ref: str | None = None,
) -> CapabilityGateRecord:
    """Return exactly one Plan 007 capability outcome."""

    if not probe_ref:
        raise CapabilityGateError("capability probe evidence reference is required")
    if not probe_succeeded:
        return CapabilityGateRecord(
            profile=profile,
            outcome="unavailable",
            probe_ref=probe_ref,
            task_need_ref=None,
            security_ref=None,
        )
    if not task_need_unique:
        if not task_need_ref:
            raise CapabilityGateError(
                "available-unneeded outcome requires task-need evidence"
            )
        return CapabilityGateRecord(
            profile=profile,
            outcome="available-unneeded",
            probe_ref=probe_ref,
            task_need_ref=task_need_ref,
            security_ref=security_ref,
        )
    if not security_sufficient or not security_ref:
        raise CapabilityGateError(
            "available-needed outcome requires sufficient security evidence"
        )
    if not consumed_path_ref:
        raise CapabilityGateError(
            "available-needed outcome requires a consumed research path"
        )
    if profile == "memory" and not durable_conversion_ref:
        raise CapabilityGateError(
            "Memory discoveries require durable filesystem-class conversion"
        )
    outcome: CapabilityOutcome = "available-needed"
    return CapabilityGateRecord(
        profile=profile,
        outcome=outcome,
        probe_ref=probe_ref,
        task_need_ref=task_need_ref,
        security_ref=security_ref,
        consumed_path_ref=consumed_path_ref,
        durable_conversion_ref=durable_conversion_ref,
    )
