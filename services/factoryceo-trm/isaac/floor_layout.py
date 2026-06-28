"""Warehouse floor layout for MuJoCo / three.js sim harnesses.

The symbolic factory verifier still schedules M1–M4 production machines, but the
Staer/MAPF floor plans declare many docks, aisles, staging lanes, pick faces,
and no-go zones. This module turns those declarations plus the job-stream
station ids into a single coordinate map the simulators render.
"""

from __future__ import annotations

import math
from typing import Iterable

# metres between grid cells in the browser / MuJoCo scene
CELL_SPACING = 1.35


def _grid_positions(n: int, *, row: int, col_start: int = 0, cols: int | None = None) -> list[tuple[int, int]]:
    cols = cols or max(1, math.ceil(math.sqrt(n)))
    out: list[tuple[int, int]] = []
    for i in range(n):
        out.append((col_start + i % cols, row + i // cols))
    return out


def build_sim_layout(
    *,
    layout: dict | None = None,
    machines: Iterable[str] | None = None,
    target_stations: Iterable[str] | None = None,
    source_locations: Iterable[str] | None = None,
    floorplan_id: str | None = None,
    max_sources: int = 16,
) -> dict:
    """Return a floor layout the UI and MuJoCo can render.

    Stations dict maps id -> {x, y, kind, label}. Production machines (M1–M4)
    sit in a fab cell; warehouse zones follow declared layout counts and the
    actual RAFS/SOAR target stations on this floor.
    """
    layout = dict(layout or {})
    docks = max(0, int(layout.get("docks", 0)))
    aisles = max(0, int(layout.get("aisles", 0)))
    staging = max(0, int(layout.get("staging_lanes", 0)))
    robots = max(0, int(layout.get("robots", 0)))
    no_go = max(0, int(layout.get("no_go_zones", 0)))

    targets = sorted({str(t) for t in (target_stations or []) if t})
    sources = sorted({str(s) for s in (source_locations or []) if s})
    if len(sources) > max_sources:
        step = max(1, len(sources) // max_sources)
        sources = sources[::step][:max_sources]

    machine_ids = list(machines or ["M1", "M2", "M3", "M4"])
    stations: dict[str, dict] = {}

    # --- warehouse bands (match floor-plan manifest counts) -------------------
    row = 0
    for i, (cx, cy) in enumerate(_grid_positions(docks, row=row, cols=max(4, docks))):
        sid = f"dock-{i + 1:02d}"
        stations[sid] = {"x": cx * CELL_SPACING, "y": cy * CELL_SPACING, "kind": "dock", "label": sid}
    row += max(1, math.ceil(docks / max(4, docks)))

    for i, (cx, cy) in enumerate(_grid_positions(aisles, row=row, cols=max(4, min(8, aisles or 1)))):
        sid = f"aisle-{i + 1:02d}"
        stations[sid] = {"x": cx * CELL_SPACING, "y": cy * CELL_SPACING, "kind": "aisle", "label": sid}
    row += max(1, math.ceil(aisles / max(4, min(8, aisles or 1))))

    for i, (cx, cy) in enumerate(_grid_positions(staging, row=row, cols=max(4, staging or 1))):
        sid = f"staging-{i + 1:02d}"
        stations[sid] = {"x": cx * CELL_SPACING, "y": cy * CELL_SPACING, "kind": "staging", "label": sid}
    row += max(1, math.ceil(staging / max(4, staging or 1)))

    # RAFS/SOAR order targets (pick faces, benches, dock roles)
    target_cols = max(4, min(10, len(targets) or 1))
    for i, tid in enumerate(targets):
        cx, cy = _grid_positions(len(targets), row=row, cols=target_cols)[i]
        stations[tid] = {"x": cx * CELL_SPACING, "y": cy * CELL_SPACING, "kind": "target", "label": tid}

    if targets:
        row += max(1, math.ceil(len(targets) / target_cols))

    # Source / reserve zones along the west edge
    for i, src in enumerate(sources):
        stations[src] = {
            "x": -1.8 * CELL_SPACING,
            "y": i * CELL_SPACING * 0.85,
            "kind": "source",
            "label": src,
        }

    # Production machines — fab cell on the east side (verifier schedule ids)
    fab_col = max(6, target_cols + 1)
    for i, mid in enumerate(machine_ids):
        stations[mid] = {
            "x": (fab_col + (i % 2)) * CELL_SPACING,
            "y": (i // 2) * CELL_SPACING,
            "kind": "machine",
            "label": mid,
        }

    # AMR / humanoid home positions near staging
    for i in range(robots):
        sid = f"robot-{i + 1:02d}"
        stations[sid] = {
            "x": (fab_col + 2) * CELL_SPACING,
            "y": (staging + i) * CELL_SPACING * 0.9,
            "kind": "robot",
            "label": sid,
        }

    # No-go / blocked zones
    max_x = max((s["x"] for s in stations.values()), default=0)
    max_y = max((s["y"] for s in stations.values()), default=0)
    for i in range(no_go):
        sid = f"no-go-{i + 1:02d}"
        stations[sid] = {
            "x": (2 + i * 2) * CELL_SPACING,
            "y": max_y + CELL_SPACING,
            "kind": "no_go",
            "label": sid,
        }

    xs = [s["x"] for s in stations.values()]
    ys = [s["y"] for s in stations.values()]
    min_x, max_x = (min(xs), max(xs)) if xs else (0.0, 0.0)
    min_y, max_y = (min(ys), max(ys)) if ys else (0.0, 0.0)

    # Normalise so the floor origin is friendly for three.js (shift to positive quadrant)
    shift_x = -min_x + CELL_SPACING if min_x < 0 else 0.0
    shift_y = -min_y + CELL_SPACING if min_y < 0 else 0.0
    for st in stations.values():
        st["x"] = round(st["x"] + shift_x, 3)
        st["y"] = round(st["y"] + shift_y, 3)

    xs = [s["x"] for s in stations.values()]
    ys = [s["y"] for s in stations.values()]
    width = max(xs) + CELL_SPACING * 2
    depth = max(ys) + CELL_SPACING * 2

    machines_xy = {sid: [st["x"], st["y"]] for sid, st in stations.items() if st["kind"] == "machine"}

    return {
        "floorplan_id": floorplan_id,
        "layout": layout,
        "cell_spacing": CELL_SPACING,
        "bounds": {"width": round(width, 2), "depth": round(depth, 2), "origin": [shift_x, shift_y]},
        "stations": stations,
        "machines": machines_xy,
        "n_stations": len(stations),
        "kinds": {
            "dock": docks,
            "aisle": aisles,
            "staging": staging,
            "target": len(targets),
            "source": len(sources),
            "machine": len(machine_ids),
            "robot": robots,
            "no_go": no_go,
        },
    }


def station_xy(layout: dict, station_id: str) -> list[float]:
    """Resolve a station/machine id to [x, y] metres."""
    st = layout.get("stations", {}).get(station_id)
    if st:
        return [st["x"], st["y"]]
    machines = layout.get("machines", {})
    if station_id in machines:
        return list(machines[station_id])
    return [0.0, 0.0]


def mjcf_from_floor_layout(floor_layout: dict) -> str:
    """Build a MuJoCo MJCF string that mirrors the warehouse floor layout."""
    bounds = floor_layout.get("bounds") or {}
    width = float(bounds.get("width", 8))
    depth = float(bounds.get("depth", 8))
    cx, cy = width / 2, depth / 2
    rgba = {
        "dock": "0.20 0.42 0.72 1",
        "aisle": "0.55 0.58 0.64 1",
        "staging": "0.72 0.58 0.22 1",
        "target": "0.28 0.55 0.42 1",
        "machine": "0.16 0.35 0.62 1",
        "no_go": "0.78 0.22 0.22 1",
    }
    size = {
        "dock": (0.45, 0.30, 0.22),
        "aisle": (0.12, 0.12, 0.45),
        "staging": (0.38, 0.28, 0.18),
        "target": (0.22, 0.22, 0.22),
        "machine": (0.22, 0.22, 0.28),
        "no_go": (0.35, 0.35, 0.05),
    }
    geoms = [
        f'    <geom name="floor" type="plane" pos="{cx:.2f} {cy:.2f} 0" '
        f'size="{width / 2:.2f} {depth / 2:.2f} 0.1" rgba="0.86 0.84 0.78 1"/>',
    ]
    for sid, st in (floor_layout.get("stations") or {}).items():
        kind = st.get("kind", "target")
        if kind in {"source", "robot"}:
            continue
        x, y = float(st["x"]), float(st["y"])
        sx, sy, sz = size.get(kind, (0.2, 0.2, 0.2))
        color = rgba.get(kind, "0.5 0.5 0.5 1")
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in sid)[:48]
        geoms.append(
            f'    <geom name="{safe}" type="box" pos="{x:.2f} {y:.2f} {sz:.2f}" '
            f'size="{sx:.2f} {sy:.2f} {sz:.2f}" rgba="{color}"/>'
        )
    cam_x, cam_y = width * 0.55, depth * 0.15
    cam_z = max(width, depth) * 0.85
    body = "\n".join(geoms)
    return f"""<mujoco>
  <visual><global offwidth="320" offheight="240"/></visual>
  <worldbody>
    <light pos="{cx:.1f} {cy:.1f} {cam_z + 2:.1f}" dir="0 0 -1"/>
    <camera name="iso" pos="{cam_x:.1f} {cam_y:.1f} {cam_z:.1f}" xyaxes="1 0 0 0 0.7 0.7"/>
{body}
    <body name="robot" mocap="true" pos="0 0 0.0">
      <geom type="capsule" fromto="0 0 0.05 0 0 0.55" size="0.09" rgba="0.46 0.61 0.85 1"/>
      <geom type="sphere" pos="0 0 0.68" size="0.13" rgba="0.46 0.61 0.85 1"/>
    </body>
  </worldbody>
</mujoco>
"""
