"""Sterile clean_verify referee runner (Plan 008 WP3, 008-owned).

Runs a materialized env's `clean_verify.sh` against a rewarded trajectory's
resulting `/app` workspace in a clean container, isolated from agent-planted
verification surface (conftest.py, pytest plugins, cached results). The trusted
grader + its conftest come from the env's `task_assets/` mounted read-only OUTSIDE
`/app`, and `clean_verify.sh` confines conftest discovery there (`--confcutdir`),
so a `/app/conftest.py` the agent planted cannot influence the verdict.

The container backend is injected (`CleanVerifyExecutor`) so the decision logic is
unit-tested without Docker; `DockerCleanVerifyExecutor` is the real local backend.
A Modal-snapshot backend (restoring a branch's `snapshot_restore_ref`) is a drop-in
executor for the live path and is wired separately.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable

# In-container paths for the trusted (agent-unwritable) referee assets.
_TRUSTED_ROOT = "/opt/clean_verify/task_assets"
_ENTRYPOINT = "/opt/clean_verify/clean_verify.sh"


@runtime_checkable
class CleanVerifyExecutor(Protocol):
    """Runs the sterile entrypoint in an isolated container; returns its exit code."""

    def run(
        self, *, image: str, workspace: str, trusted_assets: str, entrypoint: str
    ) -> int: ...


def build_docker_command(
    *, image: str, workspace: str, trusted_assets: str, entrypoint: str, network: str
) -> list[str]:
    """The sterile `docker run` argv: trusted grader read-only, /app overlaid."""
    return [
        "docker",
        "run",
        "--rm",
        f"--network={network}",
        "-v",
        f"{workspace}:/app",
        "-v",
        f"{trusted_assets}:{_TRUSTED_ROOT}:ro",
        "-v",
        f"{entrypoint}:{_ENTRYPOINT}:ro",
        "-e",
        f"CLEAN_VERIFY_TESTS={_TRUSTED_ROOT}",
        "-w",
        "/app",
        image,
        "bash",
        _ENTRYPOINT,
    ]


@dataclass(frozen=True)
class DockerCleanVerifyExecutor:
    """Real backend: a throwaway `docker run` with the trusted assets read-only.

    `--network=none` keeps verification offline (no exfil/callback) and the trusted
    grader + entrypoint are mounted read-only outside the agent-writable `/app`.
    """

    network: str = "none"

    def run(
        self, *, image: str, workspace: str, trusted_assets: str, entrypoint: str
    ) -> int:
        cmd = build_docker_command(
            image=image,
            workspace=workspace,
            trusted_assets=trusted_assets,
            entrypoint=entrypoint,
            network=self.network,
        )
        return subprocess.run(cmd, check=False).returncode


@dataclass(frozen=True)
class CleanVerifyOutcome:
    passed: bool
    exit_code: int
    image: str
    workspace_ref: str


class LocalCleanVerifyRunner:
    """Adjudicates a workspace with one materialized env's sterile clean_verify.

    Satisfies the ``seams.CleanVerifyRunner`` protocol (``run(workspace_ref) -> bool``).
    ``image`` is the env's built task image (it carries the grader's runtime deps);
    ``workspace_ref`` is a host directory holding the agent's resulting ``/app``.
    """

    def __init__(
        self,
        env_dir: Path | str,
        image: str,
        executor: CleanVerifyExecutor | None = None,
    ) -> None:
        self.env_dir = Path(env_dir)
        self.image = image
        self.executor = executor or DockerCleanVerifyExecutor()

    def adjudicate(self, workspace_ref: str) -> CleanVerifyOutcome:
        assets = self.env_dir / "task_assets"
        entrypoint = self.env_dir / "clean_verify.sh"
        if not assets.is_dir():
            raise FileNotFoundError(f"missing trusted task_assets: {assets}")
        if not entrypoint.is_file():
            raise FileNotFoundError(f"missing clean_verify entrypoint: {entrypoint}")
        code = self.executor.run(
            image=self.image,
            workspace=str(Path(workspace_ref).resolve()),
            trusted_assets=str(assets.resolve()),
            entrypoint=str(entrypoint.resolve()),
        )
        return CleanVerifyOutcome(
            passed=code == 0,
            exit_code=code,
            image=self.image,
            workspace_ref=workspace_ref,
        )

    def run(self, workspace_ref: str) -> bool:
        return self.adjudicate(workspace_ref).passed
