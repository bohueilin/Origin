"""Harbor verifier for factory-ops-scheduler.

Loads the agent's submitted plan (output/plan.json), grades it with FactoryCEO's
deterministic verifier against the held-out fixture, and asserts a hard pass:
zero hard violations AND >= quality_frac of the oracle's reward.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

TASK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TASK))
from grade import grade_plan, load_state, parse_plan       # noqa: E402

SUBMISSION = os.environ.get("SUBMISSION", str(TASK / "output" / "plan.json"))


def _result() -> dict:
    state = load_state()
    meta = json.loads((TASK / "fixtures" / "meta.json").read_text())
    plan = parse_plan(Path(SUBMISSION).read_text())
    return grade_plan(state, plan, meta["oracle_reward"], meta.get("quality_frac", 0.6))


def test_submission_is_schema_valid_and_feasible():
    r = _result()
    assert r["feasible"], f"plan has {r['hard_violations']} hard violations: {r['errors']}"


def test_submission_meets_quality_bar():
    r = _result()
    assert r["quality_ok"], f"reward {r['reward']:.0f} < {0.6:.0%} of oracle {r['oracle_reward']:.0f} (ratio {r['reward_ratio']:.2f})"


if __name__ == "__main__":
    print(json.dumps(_result(), indent=2))
