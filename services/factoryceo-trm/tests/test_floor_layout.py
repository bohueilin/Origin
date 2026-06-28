"""Floor layout harness matches warehouse archetypes, not just M1–M4."""

from isaac.floor_layout import build_sim_layout, mjcf_from_floor_layout
from src.library import ARCHETYPES, build_run


def test_crossdock_layout_has_many_stations():
    arch = next(a for a in ARCHETYPES if a["id"] == "staer_crossdock")
    run = build_run(arch, 1)
    fl = run["isaac_tasks"]["meta"]["floor_layout"]
    assert fl["n_stations"] > 20
    assert fl["kinds"]["dock"] == 6
    assert fl["kinds"]["aisle"] == 8
    assert fl["kinds"]["staging"] == 4
    assert fl["kinds"]["machine"] == 4
    assert "M1" in fl["stations"]
    assert any(st["kind"] == "target" for st in fl["stations"].values())


def test_mjcf_includes_warehouse_geoms():
    arch = next(a for a in ARCHETYPES if a["id"] == "staer_crossdock")
    fl = build_run(arch, 1)["isaac_tasks"]["meta"]["floor_layout"]
    xml = mjcf_from_floor_layout(fl)
    assert xml.count('type="box"') >= 20
    assert "dock-01" in xml or "plan-1-dock" in xml
