"""Resolve base-image identity and combine it with checked-in env inputs."""

from __future__ import annotations

import hashlib
import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from .core import digest_json, environment_source_digest

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs" / "plans" / "evidence" / "002" / "artifacts"
BASE_REPOSITORY = "library/mongo"
BASE_TAG = "7.0"
ACCEPT = ", ".join(
    [
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.v2+json",
        "application/vnd.oci.image.manifest.v1+json",
    ]
)


def _read_json(
    url: str, headers: dict[str, str] | None = None
) -> tuple[dict[str, Any], dict[str, str]]:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read()
        response_headers = dict(response.headers)
        response_headers["X-Body-Sha256"] = "sha256:" + hashlib.sha256(raw).hexdigest()
        return json.loads(raw.decode("utf-8")), response_headers


def _docker_hub_token(repository: str) -> str:
    params = urllib.parse.urlencode(
        {"service": "registry.docker.io", "scope": f"repository:{repository}:pull"}
    )
    data, _headers = _read_json(f"https://auth.docker.io/token?{params}")
    return str(data["token"])


def resolve_base_manifest(
    repository: str = BASE_REPOSITORY, tag: str = BASE_TAG
) -> dict[str, Any]:
    token = _docker_hub_token(repository)
    url = f"https://registry-1.docker.io/v2/{repository}/manifests/{tag}"
    data, headers = _read_json(
        url, {"Accept": ACCEPT, "Authorization": f"Bearer {token}"}
    )
    digest = headers.get("Docker-Content-Digest") or headers["X-Body-Sha256"]
    return {
        "repository": repository,
        "tag": tag,
        "manifest_digest": digest,
        "manifest_digest_source": "Docker-Content-Digest header"
        if headers.get("Docker-Content-Digest")
        else "sha256 of registry response body",
        "media_type": data.get("mediaType", "unknown"),
        "manifest_payload_sha256": digest_json(data),
        "source": "Docker Registry HTTP API",
    }


def run_image_identity_probe() -> dict[str, Any]:
    source_digest = environment_source_digest(ROOT)
    base = resolve_base_manifest()
    recipe = {
        "modal_base": f"{BASE_REPOSITORY}:{BASE_TAG}",
        "apt_packages": [
            "python3",
            "python3-pymongo",
            "python3-pytest",
            "bash",
            "coreutils",
            "procps",
        ],
        "local_dir": "envs/mongodb-sales-aggregation-engine/task_assets -> /seed/task_assets",
    }
    combined = "forkpoint-image-sha256:" + digest_json(
        {"base": base, "recipe": recipe, "source_digest": source_digest}
    )
    result = {
        "status": "image-identity-pass",
        "base_image": base,
        "environment_source_digest": source_digest,
        "modal_recipe": recipe,
        "environment_image_digest": combined,
        "limitations": [
            "Base image digest is resolved from Docker Hub at evidence time.",
            "Combined digest identifies the source inputs and Modal build recipe, not a Modal-internal built image manifest.",
        ],
    }
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    path = EVIDENCE / "image-identity.json"
    path.write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return result


def main() -> int:
    result = run_image_identity_probe()
    print(
        "PASS image-identity "
        f"base={result['base_image']['manifest_digest']} env={result['environment_image_digest']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
