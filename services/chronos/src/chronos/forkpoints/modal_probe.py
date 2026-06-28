"""Real Modal Filesystem Snapshot probe for Plan 002 evidence."""

from __future__ import annotations

import json
import secrets
from pathlib import Path
from typing import Any

from .core import digest_json

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs" / "plans" / "evidence" / "002" / "artifacts"


def _read_stdout(handle: Any) -> str:
    return handle.stdout.read().strip()


def run_modal_filesystem_probe() -> dict[str, Any]:
    import modal

    token = secrets.token_hex(8)
    app = modal.App.lookup("chronos-plan-002", create_if_missing=True)
    image = modal.Image.debian_slim().apt_install("bash", "coreutils")
    sb = modal.Sandbox.create(
        image=image,
        app=app,
        block_network=True,
        secrets=[],
        cpu=0.25,
        memory=512,
        timeout=120,
        workdir="/app",
        tags={"chronos_plan": "002", "purpose": "filesystem_snapshot_probe"},
    )
    snapshot = None
    restored = None
    try:
        setup = (
            "mkdir -p /app/task_assets /data/db /var/log "
            f"&& printf '%s' '{token}' > /app/query.py "
            f"&& printf '%s' '{token}' > /data/db/chronos.marker "
            f"&& printf '%s' '{token}' > /var/log/mongodb.log "
            "&& test ! -e /root/.env"
        )
        sb.exec("bash", "-lc", setup).wait()
        snapshot = sb.snapshot_filesystem()
        sb.terminate()
        restored = modal.Sandbox.create(
            image=snapshot,
            app=app,
            block_network=True,
            secrets=[],
            cpu=0.25,
            memory=512,
            timeout=120,
            workdir="/app",
            tags={
                "chronos_plan": "002",
                "purpose": "filesystem_snapshot_restore_probe",
            },
        )
        probe = (
            "cat /app/query.py /data/db/chronos.marker /var/log/mongodb.log "
            "&& test ! -e /root/.env "
            "&& test ! -S /var/run/docker.sock"
        )
        observed = _read_stdout(restored.exec("bash", "-lc", probe))
        expected = token * 3
        if observed != expected:
            raise RuntimeError("restored filesystem markers did not match")
        result = {
            "status": "modal-filesystem-roundtrip-pass",
            "snapshot_mode": "filesystem",
            "snapshot_id": snapshot.object_id,
            "snapshot_digest": digest_json(
                {"snapshot_id": snapshot.object_id, "markers": token}
            ),
            "verified_paths": [
                "/app/query.py",
                "/data/db/chronos.marker",
                "/var/log/mongodb.log",
            ],
            "network_policy": "block_network=True",
            "secret_policy": "secrets=[]; /root/.env absent",
            "resource_policy": "cpu=0.25,memory=512,timeout=120",
            "prohibited_mounts": ["/var/run/docker.sock absent"],
            "token_sha256": digest_json(token),
        }
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        path = EVIDENCE / "modal-filesystem-probe.json"
        path.write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return result
    finally:
        if restored is not None:
            restored.terminate()
        elif snapshot is None:
            sb.terminate()


def main() -> int:
    result = run_modal_filesystem_probe()
    print(f"PASS modal-filesystem snapshot={result['snapshot_id']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
