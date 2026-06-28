#!/usr/bin/env python3
"""Validate frontmatter, required sections, work-packet checks, and goal blocks."""

from __future__ import annotations

import re

from common import ValidationError, load_plans, print_errors, print_ok

REQUIRED_KEYS = {"name", "description", "owns", "depends_on", "wave"}
REQUIRED_HEADINGS = [
    "## Goal",
    "## Context / Why",
    "## Constraints",
    "## Work packets",
    "## Done-when (self-validation gate)",
    "## Recovery",
    "## Executor prompt",
    "## Living-doc log",
    "### Progress",
    "### Surprises & Discoveries",
    "### Decision Log",
    "### Outcomes & Retrospective",
]


def section(body: str, heading: str, next_heading_level: str = "## ") -> str:
    start = body.find(heading)
    if start < 0:
        return ""
    start += len(heading)
    candidates = [
        pos for marker in ("\n## ",) if (pos := body.find(marker, start)) >= 0
    ]
    end = min(candidates) if candidates else len(body)
    return body[start:end]


def main() -> int:
    try:
        plans = load_plans()
        errors: list[str] = []

        for plan in plans:
            missing = REQUIRED_KEYS - set(plan.metadata)
            if missing:
                errors.append(
                    f"{plan.path}: missing frontmatter keys {sorted(missing)}"
                )
            if plan.name != plan.slug:
                errors.append(
                    f"{plan.path}: name {plan.name!r} does not match filename slug {plan.slug!r}"
                )
            description = str(plan.metadata.get("description", ""))
            if not description or len(description) > 1024:
                errors.append(
                    f"{plan.path}: description length must be 1..1024, got {len(description)}"
                )
            if description.count("Use when") != 1:
                errors.append(
                    f"{plan.path}: description must contain exactly one 'Use when'"
                )
            if "disable-model-invocation" in plan.metadata:
                errors.append(f"{plan.path}: skill-runtime metadata is not allowed")
            if not plan.owns:
                errors.append(f"{plan.path}: owns must not be empty")
            if not isinstance(plan.metadata.get("depends_on"), list):
                errors.append(f"{plan.path}: depends_on must be an inline list")
            if plan.wave < 1:
                errors.append(f"{plan.path}: wave must be positive")

            for heading in REQUIRED_HEADINGS:
                if heading not in plan.body:
                    errors.append(f"{plan.path}: missing heading {heading!r}")

            if len(plan.path.read_text(encoding="utf-8").splitlines()) > 500:
                errors.append(f"{plan.path}: plan exceeds 500 lines")

            goal = section(plan.body, "## Goal")
            if not re.search(r"\d|one|at least|every|all", goal, flags=re.I):
                errors.append(f"{plan.path}: Goal lacks a quantitative/binary marker")
            if not re.search(r"\bdone\b|\bbinary\b|\bonly when\b", goal, flags=re.I):
                errors.append(f"{plan.path}: Goal lacks an explicit done condition")

            work = section(plan.body, "## Work packets")
            packet_count = len(re.findall(r"^### WP\d+\b", work, flags=re.M))
            pass_count = len(re.findall(r"^\*\*Pass:\*\*", work, flags=re.M))
            fail_count = len(re.findall(r"^\*\*Fail:\*\*", work, flags=re.M))
            if packet_count < 2:
                errors.append(f"{plan.path}: expected at least two work packets")
            if pass_count != packet_count or fail_count != packet_count:
                errors.append(
                    f"{plan.path}: work packets={packet_count}, Pass={pass_count}, Fail={fail_count}"
                )

            done = section(plan.body, "## Done-when (self-validation gate)")
            if done.count("python docs/plans/scripts/") < 3:
                errors.append(f"{plan.path}: Done-when lacks exact validator commands")
            expected_manifest = f"docs/plans/evidence/{plan.number}/MANIFEST.json"
            if expected_manifest not in plan.body:
                errors.append(f"{plan.path}: does not name {expected_manifest}")

            executor = section(plan.body, "## Executor prompt")
            if "/goal " not in executor:
                errors.append(f"{plan.path}: Executor prompt lacks /goal")
            objective = (
                executor[executor.find("/goal ") :] if "/goal " in executor else ""
            )
            if len(objective) > 4000:
                errors.append(f"{plan.path}: /goal objective exceeds 4,000 characters")
            if (
                plan.path.as_posix().split(str(plan.path.parents[2]) + "/")[-1]
                not in executor
            ):
                # Fall back to repository-relative path check below.
                rel = plan.path.relative_to(plan.path.parents[2]).as_posix()
                if rel not in executor:
                    errors.append(
                        f"{plan.path}: Executor prompt does not point at the plan file"
                    )

            reference = plan.path.with_name(plan.path.stem + ".REFERENCE.md")
            if not reference.exists():
                errors.append(
                    f"{plan.path}: missing sibling reference {reference.name}"
                )
            rel_plan = plan.path.relative_to(plan.path.parents[2]).as_posix()
            rel_ref = reference.relative_to(reference.parents[2]).as_posix()
            if rel_plan not in plan.owns or rel_ref not in plan.owns:
                errors.append(
                    f"{plan.path}: owns must include its plan and reference paths"
                )
            evidence_glob = f"docs/plans/evidence/{plan.number}/**"
            if evidence_glob not in plan.owns:
                errors.append(f"{plan.path}: owns must include {evidence_glob}")

        if errors:
            return print_errors(errors)
        print_ok(
            f"{len(plans)} plans have valid frontmatter, sections, packets, and goal blocks"
        )
        return 0
    except ValidationError as exc:
        return print_errors([str(exc)])


if __name__ == "__main__":
    raise SystemExit(main())
