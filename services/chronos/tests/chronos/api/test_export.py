"""The exporter writes one valid JSON file per route (the static "API")."""

from __future__ import annotations

import json
from pathlib import Path

from chronos.api import export


def test_export_writes_all_routes(tmp_path: Path) -> None:
    written = export.export(tmp_path)
    names = {p.name for p in written}
    assert names == {
        "forkpoint.json",
        "controls.json",
        "branches.json",
        "witnesses.json",
        "proofset.json",
        "release.json",
        "replay.json", "benchmark.json",
    }
    for path in written:
        # every file is valid, non-empty JSON
        payload = json.loads(path.read_text(encoding="utf-8"))
        assert payload


def test_export_is_idempotent(tmp_path: Path) -> None:
    first = {p.name: p.read_text() for p in export.export(tmp_path)}
    second = {p.name: p.read_text() for p in export.export(tmp_path)}
    assert first == second


def test_exported_forkpoint_matches_mapping(tmp_path: Path) -> None:
    export.export(tmp_path)
    from chronos.api import mapping

    on_disk = json.loads((tmp_path / "forkpoint.json").read_text())
    assert on_disk == mapping.build_fork_point()
