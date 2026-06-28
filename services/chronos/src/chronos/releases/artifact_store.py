"""Append-only release artifact store."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import ReleaseError, digest_json


class ReleaseArtifactStore:
    """Content-checked append-only JSON store for Plan 005 artifacts."""

    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def create(self, kind: str, record_id: str, record: dict[str, Any]) -> Path:
        path = self.root / kind / f"{record_id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            raise ReleaseError("artifact_immutable", f"artifact already exists: {path}")
        sealed = dict(record)
        sealed["content_digest"] = digest_json(
            {k: v for k, v in sealed.items() if k != "content_digest"}
        )
        path.write_text(
            json.dumps(sealed, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return path

    def read(self, kind: str, record_id: str) -> dict[str, Any]:
        path = self.root / kind / f"{record_id}.json"
        record = json.loads(path.read_text(encoding="utf-8"))
        expected = record.get("content_digest")
        actual = digest_json({k: v for k, v in record.items() if k != "content_digest"})
        if expected != actual:
            raise ReleaseError("digest_mismatch", f"artifact digest mismatch: {path}")
        return record
