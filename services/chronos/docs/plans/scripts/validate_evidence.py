#!/usr/bin/env python3
"""Validate per-plan evidence-manifest presence and optional completion."""

from __future__ import annotations

import argparse
from typing import Any

from common import (
    PLAN_DIR,
    ValidationError,
    load_json,
    load_plans,
    plan_by_number,
    print_errors,
    print_ok,
)

REQUIRED_KEYS = {
    "schema_version",
    "plan_id",
    "plan_name",
    "wave",
    "status",
    "started_at",
    "updated_at",
    "completed_at",
    "commit",
    "commands",
    "checks",
    "artifacts",
    "screenshots",
    "skips",
    "blockers",
    "notes",
}

GATE1_PREREQUISITES = {
    "source_trace",
    "mongodb_task",
    "hud_adapter",
    "modal_adapter",
    "grader",
    "harden_v0",
    "artifact_store",
    "security_controls",
    "baseline_command",
}

GATE1_STATES = {"verified-present", "located-owned"}


def validate_gate1_acceptance() -> list[str]:
    path = PLAN_DIR / "repo-map" / "STATUS.json"
    errors: list[str] = []
    try:
        status = load_json(path)
    except ValidationError as exc:
        return [str(exc)]

    if not isinstance(status, dict):
        return [f"{path}: root must be an object"]
    if status.get("status") != "accepted":
        errors.append(f"{path}: status must be accepted for complete Plan 001 evidence")

    prerequisites = status.get("core_prerequisites")
    if not isinstance(prerequisites, dict):
        errors.append(f"{path}: core_prerequisites must be an object")
        prerequisites = {}

    acceptance = status.get("gate1_acceptance")
    if not isinstance(acceptance, dict):
        return errors + [f"{path}: gate1_acceptance must be an object"]

    missing = GATE1_PREREQUISITES - set(acceptance)
    extra = set(acceptance) - GATE1_PREREQUISITES - {"_doc"}
    if missing:
        errors.append(f"{path}: gate1_acceptance missing {sorted(missing)}")
    if extra:
        errors.append(f"{path}: gate1_acceptance has unknown keys {sorted(extra)}")

    for key in sorted(GATE1_PREREQUISITES & set(acceptance)):
        entry = acceptance[key]
        if not isinstance(entry, dict):
            errors.append(f"{path}: gate1_acceptance.{key} must be an object")
            continue
        state = entry.get("state")
        if state not in GATE1_STATES:
            errors.append(f"{path}: gate1_acceptance.{key}.state is invalid")
            continue
        refs = entry.get("evidence_refs")
        if (
            not isinstance(refs, list)
            or not refs
            or not all(isinstance(ref, str) for ref in refs)
        ):
            errors.append(f"{path}: gate1_acceptance.{key} needs evidence_refs")
        if state == "verified-present" and prerequisites.get(key) is not True:
            errors.append(
                f"{path}: {key} is verified-present but prerequisite is not true"
            )
        if state == "located-owned":
            owners = entry.get("owner_plans")
            if (
                not isinstance(owners, list)
                or not owners
                or not all(isinstance(owner, str) for owner in owners)
            ):
                errors.append(f"{path}: gate1_acceptance.{key} needs owner_plans")
            if prerequisites.get(key) is not False:
                errors.append(
                    f"{path}: {key} is located-owned but prerequisite is not false"
                )
    return errors


def validate_manifest(plan: Any, require_complete: bool) -> list[str]:
    path = PLAN_DIR / "evidence" / plan.number / "MANIFEST.json"
    errors: list[str] = []
    try:
        data = load_json(path)
    except ValidationError as exc:
        return [str(exc)]

    if not isinstance(data, dict):
        return [f"{path}: root must be an object"]
    missing = REQUIRED_KEYS - set(data)
    if missing:
        errors.append(f"{path}: missing keys {sorted(missing)}")
    if str(data.get("plan_id")) != plan.number:
        errors.append(f"{path}: plan_id does not match {plan.number}")
    if data.get("plan_name") != plan.name:
        errors.append(f"{path}: plan_name does not match {plan.name}")
    if data.get("wave") != plan.wave:
        errors.append(f"{path}: wave does not match {plan.wave}")
    if data.get("status") not in {"not-started", "in-progress", "blocked", "complete"}:
        errors.append(f"{path}: invalid status {data.get('status')!r}")
    for key in (
        "commands",
        "checks",
        "artifacts",
        "screenshots",
        "skips",
        "blockers",
        "notes",
    ):
        if key in data and not isinstance(data[key], list):
            errors.append(f"{path}: {key} must be a list")

    if require_complete:
        if data.get("status") != "complete":
            errors.append(f"{path}: status must be complete")
        if not data.get("completed_at"):
            errors.append(f"{path}: completed_at is required")
        if not data.get("commands"):
            errors.append(f"{path}: at least one executed command is required")
        if not data.get("checks"):
            errors.append(f"{path}: at least one behavior check is required")
        if not data.get("artifacts"):
            errors.append(f"{path}: at least one artifact is required")
        if data.get("blockers"):
            errors.append(f"{path}: complete manifest cannot have blockers")

        for index, command in enumerate(data.get("commands", [])):
            if not isinstance(command, dict):
                errors.append(f"{path}: commands[{index}] must be an object")
                continue
            if not command.get("argv"):
                errors.append(f"{path}: commands[{index}] lacks argv")
            if not isinstance(command.get("exit_code"), int):
                errors.append(f"{path}: commands[{index}] lacks integer exit_code")
            if command.get("exit_code") != 0:
                errors.append(f"{path}: commands[{index}] did not exit 0")

        for index, check in enumerate(data.get("checks", [])):
            if not isinstance(check, dict):
                errors.append(f"{path}: checks[{index}] must be an object")
                continue
            if check.get("status") not in {"pass", "skipped"}:
                errors.append(
                    f"{path}: checks[{index}] must pass or be evidence-backed skipped"
                )
            if check.get("status") == "skipped" and not check.get("evidence"):
                errors.append(f"{path}: checks[{index}] skip lacks evidence")

        for index, artifact in enumerate(data.get("artifacts", [])):
            if not isinstance(artifact, dict) or not artifact.get("ref"):
                errors.append(f"{path}: artifacts[{index}] lacks ref")

    plan_text = plan.path.read_text(encoding="utf-8")
    expected = f"docs/plans/evidence/{plan.number}/MANIFEST.json"
    if expected not in plan_text:
        errors.append(f"{plan.path}: does not reference its evidence manifest")
    if require_complete and plan.number == "001":
        errors.extend(validate_gate1_acceptance())
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", help="Three-digit or integer plan number")
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()

    try:
        plans = load_plans()
        selected = [plan_by_number(plans, args.plan)] if args.plan else plans
        errors: list[str] = []
        for plan in selected:
            errors.extend(validate_manifest(plan, args.require_complete))
        if errors:
            return print_errors(errors)
        mode = "complete" if args.require_complete else "present/structured"
        print_ok(f"{len(selected)} evidence manifest(s) are {mode}")
        return 0
    except ValidationError as exc:
        return print_errors([str(exc)])


if __name__ == "__main__":
    raise SystemExit(main())
