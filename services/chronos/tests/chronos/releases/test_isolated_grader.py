"""Behaviour tests for the Plan 005 isolated, randomised-input grader's pure logic.

The full isolation/anti-hardcoding guarantee is proven in a real container by
`chronos.releases.isolated_grader_proof`; these fast tests lock the pure helpers
that make randomisation sound (varied data, distinct prices, normalised compare).
"""

from __future__ import annotations

import importlib.util
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GRADE_PY = ROOT / "artifacts" / "chronos" / "releases" / "isolated-grader" / "grade.py"


def _load_grade():
    spec = importlib.util.spec_from_file_location("isolated_grade", GRADE_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


grade = _load_grade()


def test_round_normalises_nested_floats():
    out = grade._round({"A": [{"total_revenue": 10.123456, "total_quantity": 2}]})
    assert out == {"A": [{"total_revenue": 10.1235, "total_quantity": 2}]}


def test_random_case_has_valid_structure():
    products, orders, args = grade._random_case(random.Random(1))
    assert products and all(
        {"product_id", "category", "price", "product_name"} <= p.keys()
        for p in products
    )
    assert all({"product_id", "quantity", "order_date"} <= o.keys() for o in orders)
    assert len(args) in (2, 3)  # start, end, optional limit
    # distinct prices keep revenues distinct so the reference's ordering is unambiguous
    prices = [p["price"] for p in products]
    assert len(prices) == len(set(prices))


def test_random_case_includes_orphan_and_out_of_range_orders():
    products, orders, _ = grade._random_case(random.Random(7))
    product_ids = {p["product_id"] for p in products}
    assert any(
        o["product_id"] not in product_ids for o in orders
    )  # orphan order present
    assert any(
        o["order_date"] < grade.WINDOW_START for o in orders
    )  # out-of-range order present


def test_cases_are_freshly_randomised_per_run():
    a = grade._cases(random.Random(1))
    b = grade._cases(random.Random(2))
    # the two structured edge cases are fixed; the randomised tail differs by seed,
    # so a candidate cannot precompute answers keyed by fixed inputs.
    assert a[:2] == b[:2]
    assert a[2:] != b[2:]
    assert len(a) == 2 + grade.RANDOM_CASES
