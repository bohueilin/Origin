"""Pull real warehouse order data from RAFS, SOAR, and ARMBench.

ShiftBench fixtures use Staer/MAPF for the spatial world and RAFS/SOAR/ARMBench
for the work. This script downloads open order files and normalizes them into one
offline pool the job adapter can draw real SKU references and quantities from:

  * SOAR     (github.com/200815147/SOAR): example_order.csv
  * RAFS     (github.com/xor-lab/rafs-datasets): orders_*_sku_*.xml
  * ARMBench (armbench.com): gated identification picks — set ARMBENCH_IDENT_DIR
             to a local extract of Picks/*/container.json + annotation.json, or
             fall back to the bundled schema-faithful example manifest.

Output:
  data/job_sources/{soar,rafs,armbench}/...   raw / bundled provenance
  data/job_sources/order_pools.json           normalized offline pool + summary

``src/job_sources.py`` reads order_pools.json at build time (no network).
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = ROOT / "data" / "job_sources"

SOAR_RAW = "https://raw.githubusercontent.com/200815147/SOAR/main"
RAFS_RAW = "https://raw.githubusercontent.com/xor-lab/rafs-datasets/HEAD"
RAFS_TREE = "https://api.github.com/repos/xor-lab/rafs-datasets/git/trees/HEAD?recursive=1"

SOAR_FILES = [
    "dataset/preprocessed/example_order.csv",
    "layouts/example.json",
    "layouts/syn.json",
]
# Extra context files (layout/pods) kept for provenance alongside discovered orders.
RAFS_CONTEXT_FILES = [
    "datasets/sku24/layout_sku_24_1.xml",
    "datasets/sku24/pods_items_dedicated_1.txt",
]


def _rafs_order_files(max_files: int) -> list[str]:
    """Discover RAFS order XMLs across all SKU sizes, preferring the realistic
    mean_5 demand variants and spreading across sku24/sku360/sku3240."""
    try:
        tree = json.loads(_get(RAFS_TREE).decode("utf-8")).get("tree", [])
    except Exception as e:  # noqa: BLE001
        print(f"  tree discovery failed ({type(e).__name__}); falling back to sku24")
        return [f"datasets/sku24/orders_{n}_mean_5_sku_24.xml" for n in (10, 20)]
    orders = [x["path"] for x in tree
              if x.get("type") == "blob" and "/orders_" in x["path"] and x["path"].endswith(".xml")]
    # Prefer mean_5 (steady demand) then 1x6 (bursty); keep base files before a/b dups.
    def rank(p: str) -> tuple:
        return (0 if "mean_5" in p else 1, 0 if p.endswith(f"sku_{p.split('sku_')[-1]}") else 1, p)
    orders.sort(key=rank)
    return orders[:max_files]


def _get(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "shiftbench-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _download(base: str, rel: str, dest_root: Path) -> Path | None:
    try:
        data = _get(f"{base}/{rel}")
    except Exception as e:  # noqa: BLE001
        print(f"  skip {rel}: {type(e).__name__}: {e}")
        return None
    out = dest_root / rel.split("/")[-1]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return out


def _parse_soar(csv_path: Path, cap: int) -> list[dict]:
    lines: list[dict] = []
    with csv_path.open(newline="") as f:
        for row in csv.DictReader(f):
            sku = row.get("sku_id")
            if sku is None or sku == "":
                continue
            qty = int(float(row.get("num") or 1))
            lines.append({"token": f"soar-{sku}", "quantity": max(1, qty)})
            if len(lines) >= cap:
                break
    return lines


def _parse_rafs(xml_paths: list[Path], cap: int) -> list[dict]:
    import re
    lines: list[dict] = []
    for p in xml_paths:
        m = re.search(r"sku_(\d+)", p.name)
        skuset = m.group(1) if m else "x"
        try:
            root = ET.fromstring(p.read_text())
        except Exception as e:  # noqa: BLE001
            print(f"  skip {p.name}: {type(e).__name__}")
            continue
        for pos in root.iter("Position"):
            iid = pos.get("ItemDescriptionID")
            if iid is None:
                continue
            qty = int(float(pos.get("Count") or 1))
            lines.append({"token": f"rafs{skuset}-{iid}", "quantity": max(1, qty)})
            if len(lines) >= cap:
                return lines
    return lines


def _parse_armbench_example(path: Path, cap: int) -> list[dict]:
    data = json.loads(path.read_text())
    lines: list[dict] = []
    for pick in data.get("picks", []):
        pid = pick.get("pick_id") or pick.get("gt_product_id")
        token = f"ab-{pick.get('gt_product_id', pid)}"
        qty = max(1, int(pick.get("quantity", 1)))
        lines.append({"token": token, "quantity": qty, "pick_id": pid,
                      "description": pick.get("description", "")})
        if len(lines) >= cap:
            break
    return lines


def _parse_armbench_dir(root: Path, cap: int) -> list[dict]:
    """Walk ARMBench identification Picks/*/container.json + annotation.json."""
    lines: list[dict] = []
    picks_root = root / "Picks" if (root / "Picks").is_dir() else root
    for pick_dir in sorted(picks_root.iterdir()):
        if not pick_dir.is_dir():
            continue
        ann_path = pick_dir / "annotation.json"
        cont_path = pick_dir / "container.json"
        if not ann_path.exists():
            continue
        try:
            ann = json.loads(ann_path.read_text())
            cont = json.loads(cont_path.read_text()) if cont_path.exists() else []
        except Exception as e:  # noqa: BLE001
            print(f"  skip {pick_dir.name}: {type(e).__name__}")
            continue
        gt = ann.get("GT_ID") or ann.get("gt_id")
        manifest = cont if isinstance(cont, list) else cont.get("products") or cont.get("Products") or []
        desc = f"manifest {len(manifest)} items" if manifest else ""
        token = f"ab-{gt or pick_dir.name}"
        lines.append({"token": token, "quantity": 1, "pick_id": pick_dir.name, "description": desc})
        if len(lines) >= cap:
            return lines
    return lines


def _summary(pool: list[dict]) -> dict:
    tokens = Counter(x["token"] for x in pool)
    qtys = [x["quantity"] for x in pool]
    return {
        "n_lines": len(pool),
        "n_skus": len(tokens),
        "qty_min": min(qtys) if qtys else 0,
        "qty_max": max(qtys) if qtys else 0,
        "qty_mean": round(sum(qtys) / len(qtys), 2) if qtys else 0,
        "sample_skus": [t for t, _ in tokens.most_common(8)],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cap-per-source", type=int, default=12000,
                    help="Max normalized order lines kept per source.")
    ap.add_argument("--max-rafs-files", type=int, default=24,
                    help="Max RAFS order XML files to download (spread across SKU sizes).")
    args = ap.parse_args()

    soar_dir = OUT_ROOT / "soar"
    rafs_dir = OUT_ROOT / "rafs"

    print("SOAR:")
    soar_paths = [p for rel in SOAR_FILES if (p := _download(SOAR_RAW, rel, soar_dir))]
    print("RAFS:")
    rafs_order_rel = _rafs_order_files(args.max_rafs_files)
    rafs_paths = [p for rel in (rafs_order_rel + RAFS_CONTEXT_FILES) if (p := _download(RAFS_RAW, rel, rafs_dir))]

    soar_csv = next((p for p in soar_paths if p.suffix == ".csv"), None)
    soar_pool = _parse_soar(soar_csv, args.cap_per_source) if soar_csv else []
    rafs_xml = [p for p in rafs_paths if p.suffix == ".xml" and p.name.startswith("orders_")]
    rafs_pool = _parse_rafs(rafs_xml, args.cap_per_source)

    print("ARMBench:")
    armbench_dir = OUT_ROOT / "armbench"
    armbench_dir.mkdir(parents=True, exist_ok=True)
    example_path = armbench_dir / "example_picks.json"
    if not example_path.exists():
        bundled = ROOT / "data" / "job_sources" / "armbench" / "example_picks.json"
        if bundled.exists():
            example_path.write_bytes(bundled.read_bytes())
    ident_dir = os.environ.get("ARMBENCH_IDENT_DIR", "").strip()
    armbench_files: list[str] = []
    if ident_dir and Path(ident_dir).is_dir():
        armbench_pool = _parse_armbench_dir(Path(ident_dir), args.cap_per_source)
        armbench_files.append(ident_dir)
        armbench_provenance = "real:armbench-ident"
    else:
        armbench_pool = _parse_armbench_example(example_path, args.cap_per_source) if example_path.exists() else []
        armbench_files.append(str(example_path.relative_to(ROOT)) if example_path.exists() else "")
        armbench_provenance = "example:armbench-schema"
        if not ident_dir:
            print("  no ARMBENCH_IDENT_DIR; using bundled example picks (request full dataset at armbench.com)")

    pools = {
        "schema": "shiftbench-real-order-pools-v1",
        "soar": {
            "dataset": "SOAR robotic mobile fulfillment benchmark",
            "source": "https://github.com/200815147/SOAR",
            "files": [str(p.relative_to(ROOT)) for p in soar_paths],
            "summary": _summary(soar_pool),
            "order_lines": soar_pool,
        },
        "rafs": {
            "dataset": "RAFS warehouse order streams",
            "source": "https://github.com/xor-lab/rafs-datasets",
            "files": [str(p.relative_to(ROOT)) for p in rafs_paths],
            "summary": _summary(rafs_pool),
            "order_lines": rafs_pool,
        },
        "armbench": {
            "dataset": "ARMBench Amazon warehouse pick identification",
            "source": "https://www.armbench.com/identification.html",
            "provenance": armbench_provenance,
            "files": [f for f in armbench_files if f],
            "summary": _summary(armbench_pool),
            "order_lines": armbench_pool,
        },
    }
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    (OUT_ROOT / "order_pools.json").write_text(json.dumps(pools, indent=2) + "\n")
    print(f"SOAR pool: {pools['soar']['summary']}")
    print(f"RAFS pool: {pools['rafs']['summary']}")
    print(f"ARMBench pool: {pools['armbench']['summary']} ({armbench_provenance})")
    print(f"Wrote {OUT_ROOT / 'order_pools.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
