"""Behavior of the sterile clean_verify runner (Plan 008 WP3)."""

from pathlib import Path

from chronos.qabench.clean_verify_runner import (
    LocalCleanVerifyRunner,
    build_docker_command,
)
from chronos.qabench.seams import CleanVerifyRunner


class _FakeExecutor:
    def __init__(self, code: int) -> None:
        self.code = code
        self.calls: list[dict[str, str]] = []

    def run(
        self, *, image: str, workspace: str, trusted_assets: str, entrypoint: str
    ) -> int:
        self.calls.append(
            {
                "image": image,
                "workspace": workspace,
                "trusted_assets": trusted_assets,
                "entrypoint": entrypoint,
            }
        )
        return self.code


def _env_dir(tmp_path: Path) -> Path:
    env = tmp_path / "env"
    (env / "task_assets").mkdir(parents=True)
    (env / "task_assets" / "test_outputs.py").write_text(
        "def test_x():\n    assert True\n"
    )
    (env / "clean_verify.sh").write_text("#!/usr/bin/env bash\nexit 0\n")
    return env


def test_runner_satisfies_seam_protocol(tmp_path: Path) -> None:
    runner = LocalCleanVerifyRunner(
        _env_dir(tmp_path), "img", executor=_FakeExecutor(0)
    )
    assert isinstance(runner, CleanVerifyRunner)


def test_exit_zero_passes_nonzero_fails(tmp_path: Path) -> None:
    env = _env_dir(tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()
    assert (
        LocalCleanVerifyRunner(env, "img", executor=_FakeExecutor(0)).run(str(ws))
        is True
    )
    assert (
        LocalCleanVerifyRunner(env, "img", executor=_FakeExecutor(1)).run(str(ws))
        is False
    )


def test_runner_passes_trusted_assets_and_resolved_workspace(tmp_path: Path) -> None:
    env = _env_dir(tmp_path)
    ws = tmp_path / "workspace"
    ws.mkdir()
    fake = _FakeExecutor(0)
    outcome = LocalCleanVerifyRunner(env, "task-img", executor=fake).adjudicate(str(ws))

    assert (
        outcome.passed is True
        and outcome.exit_code == 0
        and outcome.image == "task-img"
    )
    call = fake.calls[0]
    assert call["image"] == "task-img"
    assert call["workspace"] == str(ws.resolve())
    # The trusted grader comes from the env's task_assets, NOT the agent workspace.
    assert call["trusted_assets"] == str((env / "task_assets").resolve())
    assert call["entrypoint"] == str((env / "clean_verify.sh").resolve())


def test_missing_trusted_assets_raises(tmp_path: Path) -> None:
    env = tmp_path / "bare"
    env.mkdir()
    (env / "clean_verify.sh").write_text("exit 0\n")
    try:
        LocalCleanVerifyRunner(env, "img", executor=_FakeExecutor(0)).run(str(tmp_path))
    except FileNotFoundError as exc:
        assert "task_assets" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("expected FileNotFoundError for missing task_assets")


def test_docker_command_is_sterile() -> None:
    cmd = build_docker_command(
        image="task-img",
        workspace="/host/ws",
        trusted_assets="/host/env/task_assets",
        entrypoint="/host/env/clean_verify.sh",
        network="none",
    )
    joined = " ".join(cmd)
    # Verification runs offline; the trusted grader is read-only and OUTSIDE /app.
    assert "--network=none" in cmd
    assert "/host/env/task_assets:/opt/clean_verify/task_assets:ro" in joined
    assert "/host/env/clean_verify.sh:/opt/clean_verify/clean_verify.sh:ro" in joined
    assert "/host/ws:/app" in joined
    assert "CLEAN_VERIFY_TESTS=/opt/clean_verify/task_assets" in joined
    assert cmd[-3:] == ["task-img", "bash", "/opt/clean_verify/clean_verify.sh"]
