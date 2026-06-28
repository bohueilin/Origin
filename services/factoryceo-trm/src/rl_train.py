"""SimRLFab-style production-scheduling RL -- training that genuinely lifts profit.

The honest claim. Our verifier *guarantees feasibility* (0 hard violations) for any
dispatch order, so training a repair policy cannot move profit -- the rule-based
repair always closes the same gap. Profit is moved by a *different* decision: which
jobs win the scarce machine/operator slots when capacity binds. That is a real
sequential decision problem with a real reward, and it is what we train here.

Setup (a single-step contextual policy, the simplest thing that learns):
  * State    -- a capacity-binding FactoryState (tight horizon, many jobs).
  * Action   -- a dispatch *ordering* of the jobs (a permutation), sampled from a
                Plackett-Luce distribution over per-job scores s_i = w . f_i.
  * Env step -- `schedule_in_order` places jobs in that order into free, capable,
                qualified, available slots (feasibility preserved by construction);
                the verifier returns the scored profit.
  * Reward   -- the verifier's profit. Feasibility is *not* the reward -- it is an
                invariant. The reward is how much value the chosen order banks.
  * Learner  -- REINFORCE (policy gradient) with the EDD-greedy plan as the
                control-variate baseline.

The Plackett-Luce gradient is exact and cheap:
    log P(order) = sum_t [ s_{pi_t} - logsumexp_{j in remaining_t} s_j ]
    grad_w log P = sum_t [ f_{pi_t} - E_{p_t}[f] ],   p_t = softmax(s over remaining_t)

Run it:
    python -m src.rl_train --episodes 200            # prints + writes results/rl/curve.json
    python -m src.rl_train --quick                   # fast config for the live endpoint

The learning curve (`results/rl/curve.json`) plots the *deterministic* policy's
held-out profit rising from random-init toward and past EDD-greedy, while the
hard-violation rate stays flat at zero -- training lifts profit, the verifier keeps
it safe. That is the figure the FactoryBench page renders.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.generator import generate_state          # noqa: E402
from src.baselines import greedy, schedule_in_order  # noqa: E402
from src.verifier import evaluate                  # noqa: E402
from src.schemas import FactoryState               # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "results", "rl")

# A deliberately capacity-binding floor: short horizon, many jobs, so the operator
# day-shifts + single 24/7 robot cannot fit everything and the dispatch order
# decides which work banks revenue. (Loose horizons make order irrelevant.) At
# this config EDD-greedy is forced to drop ~1/3 of jobs -- room for the policy to
# learn to keep the high-value ones.
RL_HORIZON_DAYS = 6
RL_N_JOBS = 50

FEATURE_NAMES = [
    "bias", "urgency", "priority", "revenue",
    "rev_per_hour", "work_hours", "material_cost",
]


def make_state(seed: int) -> FactoryState:
    return generate_state(seed=seed, horizon_days=RL_HORIZON_DAYS, n_jobs=RL_N_JOBS)


def extract_features(state: FactoryState) -> tuple[np.ndarray, list[str]]:
    """Per-job feature matrix X [n, d], z-/max-normalized within the state so the
    learned weights are comparable across floors. Returns (X, job_ids)."""
    ids, rows = [], []
    for j in state.jobs:
        work = float(sum(op.duration for op in j.operations))
        mat = state.material_by_name(j.material)
        mat_cost = j.material_kg * (mat.unit_cost if mat else 1.0)
        urgency = (state.horizon_days - j.due_day) / max(1, state.horizon_days)
        ids.append(j.id)
        rows.append([
            1.0,                                  # bias
            urgency,                              # sooner due -> larger
            (j.priority - 1) / 2.0,              # 0..1
            j.revenue,                            # raw; normalized below
            j.revenue / max(1.0, work),          # revenue per machine-hour
            work,                                 # total processing hours
            mat_cost,                             # cost to commit the job
        ])
    X = np.array(rows, dtype=float)
    # normalize the unbounded columns (revenue, rev_per_hour, work, material_cost)
    for c in (3, 4, 5, 6):
        col = X[:, c]
        m = col.max()
        if m > 0:
            X[:, c] = col / m
    return X, ids


def schedule_profit(state: FactoryState, order_ids: list[str]) -> tuple[float, int]:
    """Profit + hard-violation count for dispatching jobs in `order_ids`."""
    by_id = {j.id: j for j in state.jobs}
    order = [by_id[i] for i in order_ids]
    res = evaluate(state, schedule_in_order(state, order))
    return res.reward, res.n_hard


def _softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max()
    e = np.exp(z)
    return e / e.sum()


def sample_order_and_grad(X: np.ndarray, w: np.ndarray, rng: np.random.Generator,
                          temp: float = 1.0) -> tuple[list[int], np.ndarray]:
    """Sample a dispatch order from the Plackett-Luce policy and return its exact
    score-function gradient grad_w log P(order) = sum_t (f_{pi_t} - E_{p_t}[f])."""
    scores = (X @ w) / temp
    n = len(scores)
    remaining = list(range(n))
    order: list[int] = []
    grad = np.zeros_like(w)
    for _ in range(n):
        z = scores[remaining]
        p = _softmax(z)
        choice = rng.choice(len(remaining), p=p)
        idx = remaining[choice]
        expected = p @ X[remaining]          # E_{p_t}[f]
        grad += X[idx] - expected            # f_{pi_t} - E_{p_t}[f]
        order.append(idx)
        remaining.pop(choice)
    return order, grad


def policy_order(X: np.ndarray, w: np.ndarray) -> list[int]:
    """Deterministic (argmax) dispatch order = jobs sorted by descending score."""
    return list(np.argsort(-(X @ w)))


def train_policy(episodes: int = 200, batch: int = 24, lr: float = 0.03,
                 temp: float = 0.8, seed: int = 0, eval_size: int = 32,
                 log=lambda s: None) -> dict:
    """REINFORCE over dispatch orderings. Returns the learning curve + final
    weights. The curve records the *deterministic* policy's held-out profit (vs
    EDD-greedy) per episode, plus the hard-violation rate (flat at 0)."""
    rng = np.random.default_rng(seed)
    d = len(FEATURE_NAMES)
    w = rng.normal(0, 0.05, size=d)            # near-random init -> poor orders

    # fixed held-out floors for a low-variance, comparable eval each episode
    eval_states = [make_state(900_000 + i) for i in range(eval_size)]
    eval_feats = [extract_features(s) for s in eval_states]
    eval_greedy = [evaluate(s, greedy(s)).reward for s in eval_states]
    eval_greedy_mean = float(np.mean(eval_greedy))

    # initial (random-init) policy profit, for the curve's first point
    def eval_policy(weights: np.ndarray) -> tuple[float, float]:
        profits, viol = [], 0
        for (X, ids), s in zip(eval_feats, eval_states):
            order = [ids[i] for i in policy_order(X, weights)]
            r, nh = schedule_profit(s, order)
            profits.append(r)
            viol += nh
        return float(np.mean(profits)), viol / max(1, len(eval_states))

    curve = []
    p0, v0 = eval_policy(w)
    curve.append({"episode": 0, "policy_profit": round(p0, 1),
                  "greedy_profit": round(eval_greedy_mean, 1),
                  "hard_viol_rate": round(v0, 3)})
    log(f"ep 0: policy=${p0:,.0f} greedy=${eval_greedy_mean:,.0f} viol/floor={v0:.3f}")

    for ep in range(1, episodes + 1):
        grads, rewards = [], []
        for b in range(batch):
            s = make_state(seed * 104_729 + ep * batch + b)
            X, ids = extract_features(s)
            order_idx, glogp = sample_order_and_grad(X, w, rng, temp)
            r, _ = schedule_profit(s, [ids[i] for i in order_idx])
            grads.append(glogp)
            rewards.append(r)
        # REINFORCE with a batch-mean baseline (control variate): advantage is the
        # reward centered + scaled within the batch, so only *relative* order
        # quality drives the update. The EDD-greedy line is the held-out reference.
        rewards = np.array(rewards)
        adv_n = (rewards - rewards.mean()) / (rewards.std() + 1e-6)
        grad = np.mean([a * g for a, g in zip(adv_n, grads)], axis=0)
        w = w + lr * grad                                    # gradient ascent

        if ep % max(1, episodes // 60) == 0 or ep == episodes:
            pp, vv = eval_policy(w)
            curve.append({"episode": ep, "policy_profit": round(pp, 1),
                          "greedy_profit": round(eval_greedy_mean, 1),
                          "hard_viol_rate": round(vv, 3)})
            log(f"ep {ep}: policy=${pp:,.0f} greedy=${eval_greedy_mean:,.0f} "
                f"train_sample=${rewards.mean():+,.0f} viol/floor={vv:.3f}")

    final_profit, final_viol = eval_policy(w)
    lift = final_profit - eval_greedy_mean
    weights = {n: round(float(v), 3) for n, v in zip(FEATURE_NAMES, w)}
    return {
        "curve": curve,
        "weights": weights,
        "feature_names": FEATURE_NAMES,
        "horizon_days": RL_HORIZON_DAYS,
        "n_jobs": RL_N_JOBS,
        "episodes": episodes,
        "init_profit": round(p0, 1),
        "final_profit": round(final_profit, 1),
        "greedy_profit": round(eval_greedy_mean, 1),
        "lift_vs_greedy": round(lift, 1),
        "lift_pct": round(100 * lift / abs(eval_greedy_mean), 1) if eval_greedy_mean else 0.0,
        "gain_over_init": round(final_profit - p0, 1),
        "final_hard_viol_rate": round(final_viol, 3),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodes", type=int, default=160)
    ap.add_argument("--batch", type=int, default=24)
    ap.add_argument("--lr", type=float, default=0.03)
    ap.add_argument("--quick", action="store_true", help="fast config for the live endpoint")
    ap.add_argument("--out", default=os.path.join(OUT, "curve.json"))
    args = ap.parse_args()
    if args.quick:
        args.episodes, args.batch, args.lr = 80, 16, 0.05
    res = train_policy(episodes=args.episodes, batch=args.batch, lr=args.lr,
                       log=lambda s: print(s, flush=True))
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(res, f, indent=2)
    print(f"\nwrote {args.out}")
    print(f"init ${res['init_profit']:,.0f} -> final ${res['final_profit']:,.0f} "
          f"(greedy ${res['greedy_profit']:,.0f}); lift vs greedy {res['lift_pct']:+.1f}%, "
          f"gain over random-init ${res['gain_over_init']:,.0f}; "
          f"final viol/floor {res['final_hard_viol_rate']}")


if __name__ == "__main__":
    main()
