#!/usr/bin/env python3
"""Validate that every normalized requirement maps to a known plan or governance file."""

from __future__ import annotations

import re

from common import PLAN_DIR, ValidationError, load_plans, print_errors, print_ok

ROW_RE = re.compile(r"^\|\s*(R-\d{3})\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$")
PLAN_TOKEN_RE = re.compile(r"\b(00[1-9]|0[1-9]\d|[1-9]\d{2}|000|AGENTS)\b")


def main() -> int:
    try:
        plans = load_plans()
        known_numbers = {plan.number for plan in plans}
        allowed = known_numbers | {"000", "AGENTS"}
        path = PLAN_DIR / "REQUIREMENTS-MAP.md"
        rows: list[tuple[str, str, str, str]] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            match = ROW_RE.match(line)
            if match:
                rows.append(match.groups())

        errors: list[str] = []
        if not rows:
            errors.append(f"{path}: no requirement rows found")
        ids = [row[0] for row in rows]
        if len(ids) != len(set(ids)):
            errors.append(f"{path}: duplicate requirement ids")

        used_plans: set[str] = set()
        for req_id, requirement, mappings, acceptance in rows:
            tokens = set(PLAN_TOKEN_RE.findall(mappings))
            if not requirement.strip():
                errors.append(f"{req_id}: empty requirement")
            if not acceptance.strip():
                errors.append(f"{req_id}: empty acceptance")
            if not tokens:
                errors.append(f"{req_id}: no recognized plan mapping")
            unknown = tokens - allowed
            if unknown:
                errors.append(f"{req_id}: unknown plan mappings {sorted(unknown)}")
            used_plans |= tokens & known_numbers

        unused = known_numbers - used_plans
        if unused:
            errors.append(f"Plans not referenced by traceability: {sorted(unused)}")

        if errors:
            return print_errors(errors)
        print_ok(f"{len(rows)} requirements map to all {len(known_numbers)} plans")
        return 0
    except (ValidationError, FileNotFoundError) as exc:
        return print_errors([str(exc)])


if __name__ == "__main__":
    raise SystemExit(main())
