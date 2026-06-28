"""Pure-logic behavior of the Modal capture/restore module (Plan 008).

The Modal calls (capture_forkpoint, ModalCleanVerifyRunner.run) are real-spend and
validated live; here we pin the dict shape, the trusted-bundle tar, ref parsing, and
protocol conformance.
"""

import base64
import io
import tarfile
from pathlib import Path

from chronos.qabench.modal_runtime import (
    ModalCleanVerifyRunner,
    _snapshot_id_of,
    forkpoint_dict,
    trusted_assets_tar_b64,
)
from chronos.qabench.seams import CleanVerifyRunner


def test_forkpoint_dict_has_fields_branch_runs_consumes() -> None:
    fp = forkpoint_dict(
        "envs/qabench/solve-ode-with-sympy", "im-ABC123", state_roots=("/app", "/data")
    )
    assert fp["snapshot_id"] == "im-ABC123"
    assert fp["snapshot_mode"] == "filesystem"
    assert fp["snapshot_restore_ref"] == "modal-image://im-ABC123"
    assert fp["task_id"] == "solve-ode-with-sympy"
    assert fp["task_state_roots"] == ["/app", "/data"]
    assert fp["fork_point_id"].startswith("fp-")
    # branch_runs selects its task from the embedded, self-describing hud_task_profile.
    assert (
        fp["hud_task_profile"]["env_module_path"]
        == "envs/qabench/solve-ode-with-sympy/env.py"
    )
    assert fp["hud_task_profile"]["task_factory"] == "build_task"


def test_forkpoint_dict_is_deterministic() -> None:
    a = forkpoint_dict("envs/qabench/x", "im-1", state_roots=("/app",))
    b = forkpoint_dict("envs/qabench/x", "im-1", state_roots=("/app",))
    assert a == b


def test_snapshot_id_parsing() -> None:
    assert _snapshot_id_of("modal-image://im-XYZ") == "im-XYZ"
    assert _snapshot_id_of("im-PLAIN") == "im-PLAIN"


def test_trusted_assets_tar_roundtrips(tmp_path: Path) -> None:
    env = tmp_path / "env"
    (env / "task_assets").mkdir(parents=True)
    (env / "task_assets" / "test_outputs.py").write_text(
        "def test_x():\n    assert True\n"
    )
    (env / "clean_verify.sh").write_text("#!/usr/bin/env bash\nexit 0\n")

    members = set()
    with tarfile.open(
        fileobj=io.BytesIO(base64.b64decode(trusted_assets_tar_b64(env))), mode="r:gz"
    ) as tar:
        members = {m.name for m in tar.getmembers()}
    assert "task_assets/test_outputs.py" in members
    assert "clean_verify.sh" in members


def test_modal_runner_satisfies_seam_protocol(tmp_path: Path) -> None:
    assert isinstance(ModalCleanVerifyRunner(tmp_path), CleanVerifyRunner)
