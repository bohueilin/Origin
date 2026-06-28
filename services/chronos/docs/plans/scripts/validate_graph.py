#!/usr/bin/env python3
"""Validate plan dependencies, waves, and acyclicity."""

from __future__ import annotations

from common import ValidationError, load_plans, print_errors, print_ok


def main() -> int:
    try:
        plans = load_plans()
        by_name = {plan.name: plan for plan in plans}
        errors: list[str] = []

        if len(by_name) != len(plans):
            errors.append("Plan names are not unique")

        for plan in plans:
            if not plan.name:
                errors.append(f"{plan.path}: missing name")
            for dependency in plan.depends_on:
                if dependency not in by_name:
                    errors.append(f"{plan.path}: unknown dependency {dependency!r}")
                    continue
                if by_name[dependency].wave >= plan.wave:
                    errors.append(
                        f"{plan.path}: dependency {dependency} wave "
                        f"{by_name[dependency].wave} is not lower than wave {plan.wave}"
                    )

        state: dict[str, int] = {}
        stack: list[str] = []

        def visit(name: str) -> None:
            marker = state.get(name, 0)
            if marker == 1:
                cycle = " -> ".join(stack + [name])
                errors.append(f"Dependency cycle: {cycle}")
                return
            if marker == 2:
                return
            state[name] = 1
            stack.append(name)
            for dep in by_name[name].depends_on:
                if dep in by_name:
                    visit(dep)
            stack.pop()
            state[name] = 2

        for name in by_name:
            visit(name)

        waves = sorted({plan.wave for plan in plans})
        if waves and waves != list(range(min(waves), max(waves) + 1)):
            errors.append(f"Wave numbers are not contiguous: {waves}")

        if errors:
            return print_errors(errors)
        edges = sum(len(plan.depends_on) for plan in plans)
        print_ok(f"{len(plans)} plans, {edges} dependencies, waves {waves}, acyclic")
        return 0
    except ValidationError as exc:
        return print_errors([str(exc)])


if __name__ == "__main__":
    raise SystemExit(main())
