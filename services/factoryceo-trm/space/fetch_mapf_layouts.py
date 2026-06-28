"""Fetch MovingAI MAPF warehouse maps and normalize them for ShiftBench fixtures.

MAPF warehouse maps (movingai.com/benchmarks/mapf) are grid worlds with rack
blocks (T), walkable aisles (.), and multi-agent routing scenarios. This script
downloads the public map/png/scenario zips, parses each warehouse-* map into
layout counts our verifier understands (aisles, docks, robots, no-go zones),
and copies PNG previews into the hosted floor-plan library.

Output:
  data/floor_sources/mapf/{*.map,*.png}     raw provenance
  data/floor_sources/mapf_layouts.json        parsed layout + sample MAPF routes
  public/factoryceo/floorplans/mapf-*.png     UI backdrops (via --publish)
"""

from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = ROOT / "data" / "floor_sources" / "mapf"
PUBLIC_PLANS = ROOT.parent / "public" / "factoryceo" / "floorplans"

MAPF_BASE = "https://movingai.com/benchmarks/mapf"
WAREHOUSE_MAPS = [
    "warehouse-10-20-10-2-1.map",
    "warehouse-10-20-10-2-2.map",
    "warehouse-20-40-10-2-1.map",
    "warehouse-20-40-10-2-2.map",
]

# Tie each MAPF warehouse to an existing plan profile for job-family mapping.
PLAN_BINDINGS = {
    "warehouse-10-20-10-2-1.map": "plan-0",
    "warehouse-10-20-10-2-2.map": "plan-1",
    "warehouse-20-40-10-2-1.map": "plan-2",
    "warehouse-20-40-10-2-2.map": "plan-3",
}


def _get(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "shiftbench-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _extract_zip_member(zf: zipfile.ZipFile, pattern: str) -> dict[str, bytes]:
    rx = re.compile(pattern)
    out: dict[str, bytes] = {}
    for name in zf.namelist():
        base = Path(name).name
        if rx.search(base):
            out[base] = zf.read(name)
    return out


def _parse_map(text: str) -> tuple[dict, list[str]]:
    lines = [ln.rstrip("\n") for ln in text.splitlines()]
    meta: dict = {}
    grid_start = 0
    for i, line in enumerate(lines):
        parts = line.split()
        if parts[0] == "type":
            meta["type"] = parts[1]
        elif parts[0] == "height":
            meta["height"] = int(parts[1])
        elif parts[0] == "width":
            meta["width"] = int(parts[1])
        elif parts[0] == "map":
            grid_start = i + 1
            break
    grid = lines[grid_start: grid_start + meta["height"]]
    meta["grid"] = grid
    return meta, grid


def _layout_from_grid(grid: list[str]) -> dict:
    h, w = len(grid), len(grid[0]) if grid else 0
    walk = sum(row.count(".") + row.count("@") for row in grid)
    racks = sum(row.count("T") for row in grid)

    # Major horizontal corridors: rows dominated by walkable tiles between rack bands.
    corridor_rows = [i for i, row in enumerate(grid)
                     if row.count(".") >= w * 0.35 and row.count("T") <= w * 0.55]
    # Rack block columns from a mid-map scan line.
    mid = grid[h // 2] if grid else ""
    rack_blocks = 0
    in_block = False
    for ch in mid:
        if ch == "T" and not in_block:
            rack_blocks += 1
            in_block = True
        elif ch != "T":
            in_block = False

    left_dock = sum(1 for row in grid if row[0] in ".@")
    right_dock = sum(1 for row in grid if row[-1] in ".@")
    docks = 2 + (1 if left_dock > h * 0.6 else 0) + (1 if right_dock > h * 0.6 else 0)

    inner_blocked = sum(1 for i in range(1, h - 1) for j in range(1, w - 1) if grid[i][j] == "T")
    rack_islands = max(1, inner_blocked // max(1, w * 4))

    aisles = max(4, min(24, rack_blocks * 2, len(corridor_rows) // 2 or rack_blocks * 2))
    staging = max(2, min(8, aisles // 3))
    robots = max(2, min(12, aisles // 2))
    no_go = max(1, min(8, rack_islands // 8))

    return {
        "docks": docks,
        "aisles": aisles,
        "staging_lanes": staging,
        "robots": robots,
        "no_go_zones": no_go,
        "walkable_tiles": walk,
        "rack_tiles": racks,
        "dimensions": {"width": w, "height": h},
        "rack_blocks": rack_blocks,
        "corridor_rows": len(corridor_rows),
    }


def _parse_scenario(text: str, cap: int = 48) -> list[dict]:
    """Parse one MAPF even scenario file into agent start→goal routes."""
    routes: list[dict] = []
    for line in text.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 9:
            continue
        n_agents = int(parts[0])
        sx, sy, gx, gy = map(int, parts[4:8])
        opt_len = float(parts[8])
        routes.append({
            "n_agents": n_agents,
            "start": {"x": sx, "y": sy},
            "goal": {"x": gx, "y": gy},
            "optimal_length": opt_len,
        })
        if len(routes) >= cap:
            break
    return routes


def _map_id(name: str) -> str:
    return "mapf-" + name.replace(".map", "")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--publish", action="store_true", help="Copy PNG previews to public/factoryceo/floorplans/")
    args = ap.parse_args()

    print("Downloading MAPF zips…")
    map_zip = zipfile.ZipFile(io.BytesIO(_get(f"{MAPF_BASE}/mapf-map.zip")))
    png_zip = zipfile.ZipFile(io.BytesIO(_get(f"{MAPF_BASE}/mapf-png.zip")))
    scen_zip = zipfile.ZipFile(io.BytesIO(_get(f"{MAPF_BASE}/mapf-scen-even.zip")))

    maps = _extract_zip_member(map_zip, r"^warehouse-.*\.map$")
    pngs = _extract_zip_member(png_zip, r"^warehouse-.*\.png$")
    scens = _extract_zip_member(scen_zip, r"warehouse-.*-even-1\.scen$")

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    layouts: dict[str, dict] = {}

    for map_name in WAREHOUSE_MAPS:
        if map_name not in maps:
            print(f"  skip missing {map_name}")
            continue
        map_text = maps[map_name].decode("utf-8")
        meta, grid = _parse_map(map_text)
        layout = _layout_from_grid(grid)
        mid = _map_id(map_name)
        png_name = map_name.replace(".map", ".png")

        (OUT_ROOT / map_name).write_bytes(maps[map_name])
        if png_name in pngs:
            (OUT_ROOT / png_name).write_bytes(pngs[png_name])
            if args.publish:
                PUBLIC_PLANS.mkdir(parents=True, exist_ok=True)
                pub = PUBLIC_PLANS / f"{mid}.png"
                pub.write_bytes(pngs[png_name])
                print(f"  published {pub.relative_to(ROOT.parent)}")

        scen_key = next((k for k in scens if k.startswith(map_name.replace(".map", ""))), None)
        routes = _parse_scenario(scens[scen_key].decode("utf-8")) if scen_key else []

        layouts[mid] = {
            "id": mid,
            "map_file": map_name,
            "title": f"MAPF {map_name.replace('.map', '')}",
            "source": "https://movingai.com/benchmarks/mapf/index.html",
            "license": "MovingAI MAPF benchmark; verify upstream terms",
            "plan_binding": PLAN_BINDINGS.get(map_name, "plan-0"),
            "file": f"/factoryceo/floorplans/{mid}.png",
            "layout": {k: layout[k] for k in ("docks", "aisles", "staging_lanes", "robots", "no_go_zones")},
            "geometry": layout,
            "mapf_routes_sample": routes,
            "n_routes_sample": len(routes),
        }
        print(f"  {mid}: {layout['dimensions']} aisles={layout['aisles']} robots={layout['robots']}")

    out_json = ROOT / "data" / "floor_sources" / "mapf_layouts.json"
    out_json.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "shiftbench-mapf-layouts-v1",
        "source": MAPF_BASE,
        "layouts": layouts,
    }
    out_json.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {out_json} ({len(layouts)} warehouses)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
