"""Fetch gated Staer warehouse thumbnails into the public floorplan stack.

Reads HF_TOKEN from the process environment or local dotenv files. The token is
never printed. On success, staer-scene entries in floorplans/manifest.json are
rewritten to use local authenticated copies instead of fallback CAD stand-ins.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DOTENV_PATHS = [
    ROOT / ".env",
    ROOT / ".env.local",
    ROOT / "factoryceo_trm" / ".env",
    ROOT / "factoryceo_trm" / ".env.local",
]


def _dotenv_token() -> str | None:
    if os.environ.get("HF_TOKEN"):
        return os.environ["HF_TOKEN"].strip()
    for path in DOTENV_PATHS:
        if not path.exists():
            continue
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == "HF_TOKEN":
                return value.strip().strip('"').strip("'")
    return None


def _download(url: str, out: Path, token: str) -> None:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=45) as r:
        data = r.read()
        ctype = r.headers.get("content-type", "")
    if not data or "image" not in ctype:
        raise RuntimeError(f"not an image response ({ctype or 'unknown content-type'})")
    out.write_bytes(data)


def main() -> int:
    token = _dotenv_token()
    if not token:
        print("HF_TOKEN not found in env/.env files; cannot fetch gated Staer thumbnails.", file=sys.stderr)
        return 2

    manifest_path = ROOT / "public" / "factoryceo" / "floorplans" / "manifest.json"
    floor_dir = manifest_path.parent
    manifest = json.loads(manifest_path.read_text())
    plans = manifest.get("plans", [])
    fetched = 0
    failures: list[str] = []

    for plan in plans:
        if plan.get("kind") != "staer-gated" or not plan.get("remote_file"):
            continue
        scene_id = plan["id"]
        out = floor_dir / f"{scene_id}.jpg"
        try:
            _download(plan["remote_file"], out, token)
        except urllib.error.HTTPError as e:
            failures.append(f"{scene_id}: HTTP {e.code} {e.headers.get('x-error-code') or e.reason}")
            continue
        except (urllib.error.URLError, TimeoutError, RuntimeError) as e:
            failures.append(f"{scene_id}: {type(e).__name__}")
            continue
        plan["file"] = f"/factoryceo/floorplans/{out.name}"
        plan["kind"] = "staer"
        plan["fallback"] = False
        fetched += 1

    if fetched:
        manifest["note"] = (
            "Floor-plan backdrops include local CAD plans and authenticated Staer "
            "warehouse scene thumbnails fetched from the gated Hugging Face dataset."
        )
        manifest["attribution"] = "FloorPlanCAD (Voxel51) — CC BY-SA 4.0 · Staer Warehouses"
    else:
        manifest["note"] = (
            "Real CAD floor plans are used as local backdrops. Staer scene entries "
            "remain gated Hugging Face placeholders until HF_TOKEN has accepted "
            "access to staerrobotics/warehouses."
        )
        manifest["attribution"] = "FloorPlanCAD (Voxel51) — CC BY-SA 4.0 · Staer Warehouses scene slots require gated HF access"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Fetched {fetched} Staer thumbnails.")
    if failures:
        print(f"Skipped {len(failures)} thumbnails: {', '.join(failures)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
