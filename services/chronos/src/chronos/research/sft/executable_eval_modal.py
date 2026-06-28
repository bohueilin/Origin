"""Modal backend for the executable preliminary Model A/B evaluation."""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

from chronos.qabench.modal_runtime import ModalCleanVerifyRunner


def _process_result(process: Any, *, max_chars: int = 12000) -> dict[str, Any]:
    process.wait()
    output = process.stdout.read() + process.stderr.read()
    return {
        "ok": process.returncode == 0,
        "exit_code": process.returncode,
        "output": output[-max_chars:],
        "output_truncated": len(output) > max_chars,
    }


class ModalWorkspace:
    """One fresh, network-blocked, secret-free qabench sandbox."""

    def __init__(self, sandbox: Any, env_dir: Path, app_name: str) -> None:
        self._sandbox = sandbox
        self._env_dir = env_dir
        self._app_name = app_name

    def shell(self, command: str, *, timeout_seconds: int = 60) -> dict[str, Any]:
        process = self._sandbox.exec(
            "runuser",
            "-u",
            "agent",
            "--",
            "bash",
            "-lc",
            command,
            workdir="/app",
            timeout=timeout_seconds,
        )
        return _process_result(process)

    def write_file(self, path: str, content: str) -> dict[str, Any]:
        if not path.startswith("/app/"):
            return {"ok": False, "exit_code": 2, "error": "writes must stay under /app"}
        encoded_path = base64.b64encode(path.encode()).decode()
        encoded_content = base64.b64encode(content.encode()).decode()
        program = (
            "import base64,pathlib;"
            f"p=pathlib.Path(base64.b64decode('{encoded_path}').decode());"
            "p.parent.mkdir(parents=True,exist_ok=True);"
            f"p.write_bytes(base64.b64decode('{encoded_content}'))"
        )
        return _process_result(
            self._sandbox.exec(
                "runuser", "-u", "agent", "--", "python3", "-c", program, timeout=60
            )
        )

    def read_file(self, path: str, *, max_chars: int = 12000) -> dict[str, Any]:
        encoded_path = base64.b64encode(path.encode()).decode()
        program = (
            "import base64,pathlib;"
            f"p=pathlib.Path(base64.b64decode('{encoded_path}').decode());"
            f"print(p.read_text(errors='replace')[:{max_chars}])"
        )
        return _process_result(
            self._sandbox.exec(
                "runuser", "-u", "agent", "--", "python3", "-c", program, timeout=60
            ),
            max_chars=max_chars,
        )

    def snapshot(self) -> str:
        snapshot = self._sandbox.snapshot_filesystem()
        return f"modal-image://{snapshot.object_id}"

    def clean_verify(self, snapshot_ref: str) -> bool:
        return ModalCleanVerifyRunner(self._env_dir, app_name=self._app_name).run(
            snapshot_ref
        )

    def close(self) -> None:
        self._sandbox.terminate()


class ModalWorkspaceFactory:
    """Build task images and create isolated workspaces lazily per rollout."""

    def __init__(
        self, repo_root: Path, *, app_name: str = "chronos-plan-007-eval"
    ) -> None:
        self.repo_root = repo_root
        self.app_name = app_name
        self._images: dict[str, Any] = {}

    def _env_dir(self, task_id: str) -> Path:
        env_dir = self.repo_root / "envs" / "qabench" / task_id
        if not (env_dir / "Dockerfile.hud").is_file():
            raise FileNotFoundError(
                f"missing materialized qabench environment: {env_dir}"
            )
        return env_dir

    def _image(self, task_id: str) -> Any:
        import modal

        if task_id not in self._images:
            env_dir = self._env_dir(task_id)
            self._images[task_id] = modal.Image.from_dockerfile(
                str(env_dir / "Dockerfile.hud"),
                context_dir=str(env_dir),
            )
        return self._images[task_id]

    def create(self, task_id: str) -> ModalWorkspace:
        import modal

        env_dir = self._env_dir(task_id)
        app = modal.App.lookup(self.app_name, create_if_missing=True)
        sandbox = modal.Sandbox.create(
            "sleep",
            "infinity",
            image=self._image(task_id),
            app=app,
            block_network=True,
            secrets=[],
            cpu=1.0,
            memory=2048,
            timeout=1800,
            workdir="/app",
            tags={
                "chronos_plan": "007",
                "purpose": "preliminary_executable_ab_eval",
                "task": task_id,
            },
        )
        setup = _process_result(
            sandbox.exec(
                "bash",
                "-lc",
                "id agent >/dev/null 2>&1 || useradd --create-home --shell /bin/bash agent; "
                "cp /app/task_assets/instruction.md /app/instruction.md 2>/dev/null || true; "
                "chown -R agent:agent /app; chmod -R u+rwX /app",
                timeout=60,
            )
        )
        workspace = ModalWorkspace(sandbox, env_dir, self.app_name)
        if not setup.get("ok"):
            workspace.close()
            raise RuntimeError(f"workspace setup failed: {json.dumps(setup)}")
        return workspace
