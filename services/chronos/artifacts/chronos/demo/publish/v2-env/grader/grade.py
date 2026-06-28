"""Out-of-process trusted grader (harden-v0/Harbor convention).

Reward comes from comparing the candidate's OUTPUTS to the trusted reference
solution's outputs on the same seeded data. The candidate is executed only in
isolated subprocesses (run_solution.py); this verdict process never imports
candidate code, so an in-process exit-code hijack or monkeypatch in the
candidate cannot affect the verdict. The candidate can only emit data — wrong
data fails the comparison.

KNOWN RESIDUAL (root candidate): a root candidate can read this grader and the
reference and hard-code the expected outputs. Defeating that needs a non-root
candidate or test data hidden from the candidate (a runtime/env concern). See
artifacts/chronos/demo/publish/v2-security-limitations.json.
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime

import pymongo

DB_URL = "mongodb://localhost:27017/"
DB_NAME = "grade_ecommerce_db"
REFERENCE = "/tests/grader/reference_query.py"
RUNNER = "/tests/grader/run_solution.py"
AGENT = "/app/query.py"


def _o(pid, qty, dt, oid=None):
    rec = {"product_id": pid, "quantity": qty, "order_date": dt}
    if oid is not None:
        rec["order_id"] = oid
    return rec


def _p(pid, price, cat="A", name=None):
    rec = {"product_id": pid, "category": cat, "price": price}
    if name is not None:
        rec["product_name"] = name
    return rec


Q4 = ("2024-10-01T00:00:00", "2024-12-31T23:59:59")
# (products, orders, args) — args = (start, end[, limit]); reseeded before each run.
CASES = [
    (
        [
            _p(1, 10.0, name="P1"),
            _p(2, 20.0, name="P2"),
            _p(3, 5.0, name="P3"),
            _p(4, 10.0, name="P4"),
        ],
        [
            _o(1, 10, datetime(2024, 10, 1), 1),
            _o(2, 10, datetime(2024, 11, 1), 2),
            _o(3, 30, datetime(2024, 12, 1), 3),
            _o(4, 1, datetime(2024, 12, 31), 4),
        ],
        (*Q4, 3),
    ),
    ([], [], Q4),
    ([_p(1, 10)], [_o(1, 1, datetime(2024, 1, 1))], Q4),
    ([_p(1, 10, name="P1")], [_o(1, 1, datetime(2024, 10, 1))], (*Q4, 3)),
    (
        [_p(3, 10, name="P3"), _p(1, 10, name="P1"), _p(2, 5, name="P2")],
        [
            _o(3, 10, datetime(2024, 10, 1), 1),
            _o(1, 10, datetime(2024, 10, 1), 2),
            _o(2, 20, datetime(2024, 10, 1), 3),
        ],
        (*Q4, 3),
    ),
    ([_p(1, 10.123, name="P1")], [_o(1, 1, datetime(2024, 10, 1))], Q4),
    (
        [_p(1, 10, name="P1")],
        [_o(1, 1, datetime(2024, 10, 1)), _o(999, 1, datetime(2024, 10, 1))],
        Q4,
    ),
    ([_p(1, 10, name="P1")], [_o(1, 0, datetime(2024, 10, 1))], Q4),
    (
        [_p(1, 10, name="P1")],
        [
            _o(1, 1, datetime(2024, 10, 1, 0, 0, 0)),
            _o(1, 1, datetime(2024, 12, 31, 23, 59, 59)),
            _o(1, 1, datetime(2024, 9, 30, 23, 59, 59)),
        ],
        Q4,
    ),
    (
        [_p(1, 10, name="P1"), _p(2, 10, name="P2")],
        [_o(1, 1, datetime(2024, 10, 1)), _o(2, 1, datetime(2024, 10, 1))],
        (*Q4, 100),
    ),
    (
        [_p(1, 10, name="P1")],
        [
            _o(1, 1, datetime(2024, 10, 1, 10, 0)),
            _o(1, 1, datetime(2024, 10, 2, 10, 0)),
        ],
        ("2024-10-01T00:00:00", "2024-10-01T23:59:59"),
    ),
]
SOURCE_TOKENS = (
    "class SalesAnalyzer",
    "def __init__",
    "def get_top_performing_products",
    "pymongo",
)


def _seed(db, products, orders):
    db.products.delete_many({})
    db.orders.delete_many({})
    if products:
        db.products.insert_many([dict(p) for p in products])
    if orders:
        db.orders.insert_many([dict(o) for o in orders])


def _round(obj):
    if isinstance(obj, float):
        return round(obj, 4)
    if isinstance(obj, dict):
        return {k: _round(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round(v) for v in obj]
    return obj


def _run(module_path, args):
    try:
        # -I = isolated mode: ignore PYTHON* env, cwd/script-dir sys.path, and user site,
        # so a root-planted module cannot shadow the runner's stdlib imports.
        proc = subprocess.run(
            ["python3", "-I", RUNNER, module_path, *map(str, args)],
            capture_output=True,
            text=True,
            timeout=90,
        )
    except Exception:
        return None
    for line in reversed((proc.stdout or "").splitlines()):
        if line.startswith("RESULT_JSON:"):
            try:
                return _round(json.loads(line[len("RESULT_JSON:") :]))
            except Exception:
                return None
    return None


def main() -> int:
    db = pymongo.MongoClient(DB_URL)[DB_NAME]
    for products, orders, args in CASES:
        _seed(db, products, orders)
        reference = _run(REFERENCE, args)
        if reference is None:
            return 1  # reference must always produce output; fail closed
        _seed(db, products, orders)  # reseed: the candidate run may have mutated the DB
        candidate = _run(AGENT, args)
        if candidate != reference:
            return 1
    try:
        source = open(AGENT, encoding="utf-8").read()
    except OSError:
        return 1
    if not all(token in source for token in SOURCE_TOKENS):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
