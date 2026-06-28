"""Out-of-process trusted grader with RANDOMISED inputs (harden-v0/Harbor convention).

Isolation: the candidate (`/app/query.py`) is executed only inside throwaway
isolated subprocesses (run_solution.py, invoked `python3 -I`); this verdict
process never imports candidate code, so an in-process exit-code hijack
(atexit/os._exit) or monkeypatch in the candidate cannot affect the verdict —
the candidate can only emit data, and wrong data fails the comparison. The
grader files are digest-pinned by env.py at grade time.

Anti-hardcoding: each grade run SEEDS FRESH RANDOM DATA (distinct prices,
quantities, dates, categories, orphans, args). The expected result is computed
at grade time by the TRUSTED reference solution on that same random data, so a
candidate cannot pre-compute answers or hard-code outputs keyed by fixed args —
it must actually query the live database correctly. A correct general solution
matches the reference on any data; a hard-coded one does not.
"""

from __future__ import annotations

import json
import random
import subprocess
from datetime import datetime, timedelta

import pymongo

DB_URL = "mongodb://localhost:27017/"
DB_NAME = "grade_ecommerce_db"
REFERENCE = "/tests/grader/reference_query.py"
RUNNER = "/tests/grader/run_solution.py"
AGENT = "/app/query.py"

SOURCE_TOKENS = (
    "class SalesAnalyzer",
    "def __init__",
    "def get_top_performing_products",
    "pymongo",
)
WINDOW_START = datetime(2024, 10, 1, 0, 0, 0)
WINDOW_END = datetime(2024, 12, 31, 23, 59, 59)
RANDOM_CASES = 14


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def _random_case(rng):
    """Build one random (products, orders, args) case exercising the real logic."""
    categories = rng.sample(["A", "B", "C", "D"], rng.randint(1, 3))
    products, prices = [], set()
    pid = 1
    for cat in categories:
        for _ in range(rng.randint(1, 4)):
            # distinct prices keep revenues distinct, avoiding tie-break ambiguity.
            price = round(rng.uniform(1.0, 200.0), 2)
            while price in prices:
                price = round(rng.uniform(1.0, 200.0), 2)
            prices.add(price)
            products.append(
                {
                    "product_id": pid,
                    "category": cat,
                    "product_name": f"P{pid}",
                    "price": price,
                }
            )
            pid += 1

    orders, oid = [], 1
    for prod in products:
        for _ in range(rng.randint(0, 3)):
            span = (WINDOW_END - WINDOW_START).days
            day = rng.randint(0, span)
            dt = WINDOW_START + timedelta(days=day, seconds=rng.randint(0, 86399))
            orders.append(
                {
                    "order_id": oid,
                    "product_id": prod["product_id"],
                    "quantity": rng.choice([0, 1, 2, 5, 10, 25]),
                    "order_date": dt,
                }
            )
            oid += 1
    # out-of-range orders (must be excluded) and an orphan (no product) for realism.
    if products:
        orders.append(
            {
                "order_id": oid,
                "product_id": products[0]["product_id"],
                "quantity": 7,
                "order_date": WINDOW_START - timedelta(days=rng.randint(1, 60)),
            }
        )
        oid += 1
        orders.append(
            {
                "order_id": oid,
                "product_id": 99999,
                "quantity": 9,
                "order_date": WINDOW_START,
            }
        )
    rng.shuffle(orders)

    args = [_iso(WINDOW_START), _iso(WINDOW_END)]
    if rng.random() < 0.7:
        args.append(rng.randint(1, 5))
    return products, orders, tuple(args)


def _cases(rng):
    cases = [([], [], (_iso(WINDOW_START), _iso(WINDOW_END)))]  # empty dataset -> {}
    # all-out-of-range -> {}
    cases.append(
        (
            [{"product_id": 1, "category": "A", "product_name": "P1", "price": 10.0}],
            [
                {
                    "order_id": 1,
                    "product_id": 1,
                    "quantity": 3,
                    "order_date": datetime(2023, 1, 1),
                }
            ],
            (_iso(WINDOW_START), _iso(WINDOW_END)),
        )
    )
    cases.extend(_random_case(rng) for _ in range(RANDOM_CASES))
    return cases


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
    rng = random.SystemRandom()  # unseeded: fresh random data each grade run
    for products, orders, args in _cases(rng):
        _seed(db, products, orders)
        reference = _run(REFERENCE, args)
        if reference is None:
            return 1  # the trusted reference must always produce output; fail closed
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
