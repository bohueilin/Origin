"""Manifest completeness after Phase 2 seal."""

import json

from chronos.controls.freeze import controls_manifest_path, load_controls


def test_phase2_controls_expose_required_interface_fields() -> None:
    controls = load_controls()
    assert len(controls) == 3
    manifest = json.loads(controls_manifest_path().read_text(encoding="utf-8"))
    assert manifest["phase"] == 2
    for control in controls:
        assert control.missing_interface_fields() == []
