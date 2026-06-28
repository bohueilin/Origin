"""Write the mapped Chronos records to static JSON under ``frontend/public/api``.

Run with::

    uv run python -m chronos.api.export

This produces one JSON file per ``ChronosApi`` resource. The frontend's
``HttpChronosApi`` fetches these as same-origin static files (no server),
which is what makes the real-data mode deployable as a plain static site
(e.g. Vercel). Re-run after the underlying artifacts change.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from chronos.api.mapping import ROOT, build_all

DEFAULT_OUT_DIR = ROOT / "frontend" / "public" / "api"

# route filename stem -> payload key in build_all()
ROUTES = (
    "forkpoint",
    "controls",
    "branches",
    "witnesses",
    "proofset",
    "release",
    "replay",
    "benchmark",
)


def export(out_dir: Path | None = None) -> list[Path]:
    """Write every route payload as ``<out_dir>/<route>.json``; return paths."""
    target = out_dir or DEFAULT_OUT_DIR
    target.mkdir(parents=True, exist_ok=True)
    payloads: dict[str, Any] = build_all()
    written: list[Path] = []
    for route in ROUTES:
        path = target / f"{route}.json"
        text = json.dumps(payloads[route], indent=2, sort_keys=True, ensure_ascii=False)
        path.write_text(text + "\n", encoding="utf-8")
        written.append(path)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help=f"Output directory (default: {DEFAULT_OUT_DIR})",
    )
    args = parser.parse_args()
    written = export(args.out_dir)
    for path in written:
        print(f"wrote {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")


if __name__ == "__main__":
    main()
