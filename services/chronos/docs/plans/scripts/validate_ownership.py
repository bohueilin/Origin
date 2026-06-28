#!/usr/bin/env python3
"""Validate collision-free ownership globs, optionally using repo-bound paths."""

from __future__ import annotations

import argparse

from common import (
    ValidationError,
    load_plans,
    prefixes_overlap,
    print_errors,
    print_ok,
    resolve_bound_paths,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repo-bound",
        action="store_true",
        help="Resolve proposed implementation globs through repo-map bindings.",
    )
    args = parser.parse_args()

    try:
        plans = load_plans()
        if args.repo_bound:
            paths_by_plan = resolve_bound_paths(plans)
        else:
            paths_by_plan = {plan.name: plan.owns for plan in plans}

        errors: list[str] = []
        for i, left in enumerate(plans):
            for right in plans[i + 1 :]:
                if left.wave != right.wave:
                    continue
                for left_path in paths_by_plan[left.name]:
                    for right_path in paths_by_plan[right.name]:
                        if prefixes_overlap(left_path, right_path):
                            errors.append(
                                f"wave {left.wave} collision: {left.name}:{left_path} "
                                f"<-> {right.name}:{right_path}"
                            )

        for plan in plans:
            owned = paths_by_plan[plan.name]
            if len(owned) != len(set(owned)):
                errors.append(f"{plan.path}: duplicate ownership path")

        if errors:
            return print_errors(errors)
        mode = "repo-bound" if args.repo_bound else "proposed"
        print_ok(f"{mode} ownership is collision-free for {len(plans)} plans")
        return 0
    except ValidationError as exc:
        return print_errors([str(exc)])


if __name__ == "__main__":
    raise SystemExit(main())
