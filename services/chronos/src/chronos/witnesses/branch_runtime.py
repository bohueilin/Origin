"""Modal runtime wrapper that captures same-sandbox BranchRun evidence."""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any


@dataclass
class BranchRuntimeEvidence:
    branch_id: str
    capture_roots: list[str]
    capture_root_source: str
    runtime_params: dict[str, Any] = field(default_factory=dict)
    before_snapshot: dict[str, Any] | None = None
    after_snapshot: dict[str, Any] | None = None
    post_agent_snapshot: dict[str, Any] | None = None
    security_probe: dict[str, Any] | None = None


CAPTURE_SCRIPT = r"""
import hashlib
import json
from pathlib import Path

import os

ROOTS = [Path(item) for item in json.loads(os.environ["FORKPROOF_CAPTURE_ROOTS"])]
TEXT_SUFFIXES = {".py", ".md", ".json", ".txt", ".yaml", ".yml", ".toml", ".sh", ".sql"}
IGNORED_PARTS = {".git", ".venv", "venv", "__pycache__", ".pytest_cache", ".ruff_cache", "node_modules"}
TEXT_LIMIT = 65536

def ignored(path):
    return any(part in IGNORED_PARTS for part in path.parts)

files = {}
roots = {}
for root in ROOTS:
    roots[str(root)] = {"exists": root.exists(), "is_dir": root.is_dir(), "is_file": root.is_file()}
    if not root.exists():
        continue
    paths = [root] if root.is_file() else root.rglob("*")
    for path in paths:
        if ignored(path) or not path.is_file():
            continue
        try:
            data = path.read_bytes()
        except OSError as exc:
            files[str(path)] = {"status": "unreadable", "error_class": type(exc).__name__}
            continue
        entry = {
            "status": "captured",
            "size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "mode": oct(path.stat().st_mode & 0o777),
        }
        if path.suffix.lower() in TEXT_SUFFIXES and len(data) <= TEXT_LIMIT:
            try:
                entry["text"] = data.decode("utf-8")
            except UnicodeDecodeError:
                entry["text_decode_error"] = "UnicodeDecodeError"
        files[str(path)] = entry
print(json.dumps({"schema_version": 1, "status": "pass", "roots": roots, "files": files}, sort_keys=True))
"""

SECURITY_SCRIPT = r"""
import json
import os
import socket
from pathlib import Path

forbidden = ["HUD_API_KEY", "ANTHROPIC_API_KEY", "MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET", "GITHUB_TOKEN"]
secret_presence = {name: ("present" if os.environ.get(name) else "absent") for name in forbidden}

try:
    socket.create_connection(("1.1.1.1", 80), timeout=2).close()
    egress = "allowed"
except OSError:
    egress = "denied"

write_probes = {}
for probe_path in ["/workspace/chronos-probe", "/Users/ashtonchew/projects/hack2fix2hack/chronos-probe"]:
    try:
        Path(probe_path).write_text("probe", encoding="utf-8")
        write_probes[probe_path] = "writable"
    except OSError:
        write_probes[probe_path] = "denied"

status = "pass"
if any(value != "absent" for value in secret_presence.values()):
    status = "blocked"
if egress != "denied":
    status = "blocked"
if any(value != "denied" for value in write_probes.values()):
    status = "blocked"

print(json.dumps({
    "schema_version": 1,
    "status": status,
    "forbidden_secret_presence": secret_presence,
    "disallowed_egress_probe": egress,
    "repo_or_workspace_write_probes": write_probes,
}, sort_keys=True))
"""


async def _exec_json(sandbox: Any, script: str, *, timeout: int) -> dict[str, Any]:
    proc = await sandbox.exec.aio(
        "python3", "-c", script, timeout=timeout, workdir="/app"
    )
    stdout, stderr, returncode = await asyncio.gather(
        proc.stdout.read.aio(),
        proc.stderr.read.aio(),
        proc.wait.aio(),
    )
    if returncode != 0:
        return {
            "schema_version": 1,
            "status": "blocked",
            "returncode": returncode,
            "stdout": stdout,
            "stderr": stderr,
        }
    try:
        return json.loads(stdout)
    except json.JSONDecodeError as exc:
        return {
            "schema_version": 1,
            "status": "blocked",
            "error_class": type(exc).__name__,
            "stdout": stdout,
            "stderr": stderr,
        }


async def _snapshot_post_agent_workspace(sandbox: Any) -> dict[str, Any]:
    try:
        proc = await sandbox.exec.aio("sync", timeout=120, workdir="/app")
        stdout, stderr, returncode = await asyncio.gather(
            proc.stdout.read.aio(),
            proc.stderr.read.aio(),
            proc.wait.aio(),
        )
        if returncode != 0:
            return {
                "schema_version": 1,
                "status": "blocked",
                "operation": "sync",
                "returncode": returncode,
                "stdout": stdout,
                "stderr": stderr,
            }
        snapshot = await sandbox.snapshot_filesystem.aio()
        snapshot_id = str(getattr(snapshot, "object_id", "") or snapshot)
        return {
            "schema_version": 1,
            "status": "pass",
            "snapshot_id": snapshot_id,
            "snapshot_ref": f"modal-image://{snapshot_id}",
            "snapshot_mode": "modal_filesystem_snapshot",
            "retention": "modal_default",
        }
    except Exception as exc:  # noqa: BLE001 - promotion needs the blocker recorded.
        return {
            "schema_version": 1,
            "status": "blocked",
            "error_class": type(exc).__name__,
            "error": str(exc),
        }


class EvidenceModalRuntime:
    """HUD Modal runtime with a before/after capture hook for Plan 003."""

    def __init__(
        self,
        *,
        image: Any,
        command: Sequence[str],
        app_name: str,
        workdir: str,
        evidence: BranchRuntimeEvidence,
        port: int = 8765,
    ) -> None:
        self.image = image
        self.command = tuple(command)
        self.app_name = app_name
        self.workdir = workdir
        self.evidence = evidence
        self.port = port

    def _env(self) -> dict[str, str]:
        return {"FORKPROOF_CAPTURE_ROOTS": json.dumps(self.evidence.capture_roots)}

    @asynccontextmanager
    async def __call__(self, task: Any):
        import modal
        from hud.eval.runtime import Runtime

        app = await modal.App.lookup.aio(self.app_name, create_if_missing=True)
        sandbox = await modal.Sandbox.create.aio(
            *self.command,
            app=app,
            image=self.image,
            env=self._env(),
            workdir=self.workdir,
            unencrypted_ports=[self.port],
            readiness_probe=modal.Probe.with_tcp(self.port),
            timeout=3600,
            outbound_cidr_allowlist=["127.0.0.1/32"],
            secrets=[],
            tags={"chronos_plan": "003", "branch_id": self.evidence.branch_id},
        )
        self.evidence.runtime_params = {
            "provider": "modal",
            "instance_id": sandbox.object_id,
            "egress_policy": "outbound_cidr_allowlist",
            "outbound_cidr_allowlist": ["127.0.0.1/32"],
            "secret_policy": "secrets=[]",
            "network_file_systems": [],
            "volumes": [],
            "capture_roots": self.evidence.capture_roots,
            "capture_root_source": self.evidence.capture_root_source,
        }
        try:
            await sandbox.wait_until_ready.aio(timeout=600)
            self.evidence.before_snapshot = await _exec_json(
                sandbox, CAPTURE_SCRIPT, timeout=120
            )
            self.evidence.security_probe = await _exec_json(
                sandbox, SECURITY_SCRIPT, timeout=30
            )
            host, port = (await sandbox.tunnels.aio())[self.port].tcp_socket
            yield Runtime(
                f"tcp://{host}:{port}",
                params={"provider": "modal", "instance_id": sandbox.object_id},
            )
        finally:
            with contextlib.suppress(Exception):
                self.evidence.after_snapshot = await _exec_json(
                    sandbox, CAPTURE_SCRIPT, timeout=120
                )
            self.evidence.post_agent_snapshot = await _snapshot_post_agent_workspace(
                sandbox
            )
            with contextlib.suppress(Exception):
                await sandbox.terminate.aio()
