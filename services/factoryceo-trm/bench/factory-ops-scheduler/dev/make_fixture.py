"""Generate the held-out task instance + its oracle reward.

We pick a deliberately hard, high-mix scenario (many jobs, tight horizon, a
breakdown + an absence + late material) so a feasible schedule is non-trivial.
Writes fixtures/state.json (the agent's input) and fixtures/meta.json (the
oracle's verifier reward + the messy prompt + the quality bar).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]   # factoryceo_trm/
sys.path.insert(0, str(ROOT))
TASK = Path(__file__).resolve().parents[1]

from src.generator import generate_state, messy_prompt   # noqa: E402
sys.path.insert(0, str(TASK))
from grade import oracle_plan, grade_plan                  # noqa: E402

SEED = 73
N_JOBS = 18
HORIZON = 21


def main() -> None:
    state = generate_state(seed=SEED, horizon_days=HORIZON, n_jobs=N_JOBS)
    oracle = oracle_plan(state)
    from src.verifier import evaluate
    oracle_reward = evaluate(state, oracle).reward

    (TASK / "fixtures" / "state.json").write_text(json.dumps(state.model_dump(mode="json"), indent=2))
    (TASK / "fixtures" / "meta.json").write_text(json.dumps({
        "seed": SEED, "n_jobs": N_JOBS, "horizon_days": HORIZON,
        "oracle_reward": oracle_reward,
        "quality_frac": 0.6,
        "messy_prompt": messy_prompt(state, seed=SEED),
    }, indent=2))
    # sanity: the oracle must pass its own grader
    g = grade_plan(state, oracle, oracle_reward)
    assert g["passed"], g
    print(f"fixture written · oracle_reward={oracle_reward:.0f} · oracle passes={g['passed']}")


if __name__ == "__main__":
    main()
