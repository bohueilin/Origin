"""Oracle solver: deterministic scheduler + recursive repair → output/plan.json.
This is the human-expert-equivalent ground truth; it passes the verifier."""

from __future__ import annotations

import json
import sys
from pathlib import Path

TASK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TASK))
from grade import load_state, oracle_plan                  # noqa: E402


def main() -> None:
    state = load_state()
    plan = oracle_plan(state)
    out = TASK / "output"
    out.mkdir(exist_ok=True)
    (out / "plan.json").write_text(json.dumps(plan.model_dump(mode="json"), indent=2))
    print("wrote", out / "plan.json")


if __name__ == "__main__":
    main()
