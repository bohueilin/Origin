"""Profile-specific v2 evaluator-subversion checks."""

from __future__ import annotations

from typing import Any

from .models import ReleaseError


PYTEST_SUBVERSION_CHECKS = {
    "conftest.py",
    "pytest11",
    "hook/TestReport fabrication",
    "cwd/import shadowing",
    "site-packages mutation",
    "trusted test replacement",
}

GENERIC_VERIFIER_SUBVERSION_CHECKS = {
    "grader entrypoint replacement",
    "cwd/import shadowing",
    "trusted test replacement",
}

REQUIRED_SUBVERSION_CHECKS_BY_PROFILE = {
    "pytest": PYTEST_SUBVERSION_CHECKS,
    "generic-verifier": GENERIC_VERIFIER_SUBVERSION_CHECKS,
}

# Compatibility export for tests and docs that refer to the Plan 005 pytest profile.
REQUIRED_SUBVERSION_CHECKS = PYTEST_SUBVERSION_CHECKS


def required_subversion_checks(evaluator_profiles: list[str] | None) -> set[str]:
    """Return the closed subversion set for the declared evaluator profiles."""

    profiles = evaluator_profiles or ["generic-verifier"]
    checks: set[str] = set()
    unknown = sorted(
        profile
        for profile in profiles
        if profile not in REQUIRED_SUBVERSION_CHECKS_BY_PROFILE
    )
    if unknown:
        raise ReleaseError(
            "subversion_profile_unknown", f"unknown evaluator profiles {unknown}"
        )
    for profile in profiles:
        checks.update(REQUIRED_SUBVERSION_CHECKS_BY_PROFILE[profile])
    return checks


def validate_subversion_results(
    results: list[dict[str, Any]],
    *,
    evaluator_profiles: list[str] | None = None,
) -> None:
    """Require the closed profile-specific subversion check set to be blocked."""

    by_id = {str(result.get("case_id")): result for result in results}
    required = required_subversion_checks(evaluator_profiles)
    missing = sorted(required - set(by_id))
    if missing:
        raise ReleaseError(
            "subversion_incomplete", f"missing mandatory subversion checks {missing}"
        )
    survived = sorted(
        case_id
        for case_id, result in by_id.items()
        if case_id in required and result.get("status") != "blocked"
    )
    if survived:
        raise ReleaseError(
            "subversion_survived",
            f"mandatory evaluator-subversion layer survived: {survived}",
        )
