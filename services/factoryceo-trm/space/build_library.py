"""Precompute the floor library (all archetypes) as STATIC artifacts the UI can
serve without a live brain — the brain still GENERATES them here, offline.

    python space/build_library.py /path/to/autonomy-trace-console/public/factoryceo
"""

from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from src.library import ARCHETYPES, build_run  # noqa: E402


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "results", "library_out")
    libdir = os.path.join(out, "library")
    os.makedirs(libdir, exist_ok=True)
    catalog = []
    for i, arch in enumerate(ARCHETYPES):
        try:
            run = build_run(arch, base=i + 1)
        except Exception as e:
            print(f"  skip {arch['id']}: {type(e).__name__}: {e}")
            continue
        cat = run.pop("_catalog")
        with open(os.path.join(libdir, f"{arch['id']}.json"), "w") as f:
            json.dump(run, f)
        catalog.append(cat)
        print(f"  {cat['label']:32} reward={cat['metrics']['reward']:>7} "
              f"viol={cat['metrics']['hard_violations']} naive={cat['naive_violations']}")
    with open(os.path.join(out, "library.json"), "w") as f:
        json.dump({"floors": catalog, "count": len(catalog),
                   "note": "pre-built, verified floor archetypes (brain-generated, static)"}, f, indent=2)
    print(f"wrote {len(catalog)} floors -> {out}/library.json")


if __name__ == "__main__":
    main()
