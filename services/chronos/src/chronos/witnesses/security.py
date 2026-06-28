"""Branch isolation and redaction checks."""

from __future__ import annotations

from typing import Any

from .models import WitnessError


FORBIDDEN_BRANCH_CAPABILITIES = {
    "HUD_PUBLICATION_TOKEN",
    "MODAL_ADMIN_TOKEN",
    "RELEASE_SIGNING_KEY",
    "GITHUB_TOKEN",
    "OPENAI_API_KEY_RAW",
}


def assert_branch_security(policy: dict[str, Any]) -> None:
    branch_secrets = set(policy.get("branch_secret_names", []))
    leaked = sorted(branch_secrets & FORBIDDEN_BRANCH_CAPABILITIES)
    if leaked:
        raise WitnessError(
            "security_capability_missing",
            f"branch received forbidden capabilities {leaked}",
        )
    if policy.get("sibling_writable_state") is True:
        raise WitnessError(
            "security_capability_missing", "siblings share writable state"
        )
    if policy.get("artifact_writer") != "trusted_orchestrator":
        raise WitnessError(
            "security_capability_missing", "branch can write canonical artifacts"
        )
    if policy.get("grader_trust_zone") != "trusted_grader":
        raise WitnessError(
            "security_capability_missing", "grader is not in trusted zone"
        )
    if policy.get("denied_egress_probe") != "pass":
        raise WitnessError("security_capability_missing", "egress denial probe missing")
    if policy.get("denied_secret_probe") != "pass":
        raise WitnessError("security_capability_missing", "secret denial probe missing")


def contains_secret_material(value: Any) -> bool:
    text = str(value)
    markers = (
        "sk-",
        "AKIA",
        "BEGIN PRIVATE KEY",
        "HUD_API_KEY=",
        "MODAL_TOKEN_SECRET=",
    )
    return any(marker in text for marker in markers)
