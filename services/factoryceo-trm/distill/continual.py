"""Continual training loop: synth → verified traces → train the TRM student →
run the rolling business sim with that student → repeat. As the student trains on
more verified traces, it makes better repair decisions under a fixed per-day
compute budget, so it stays feasible on more days and the bank balance compounds.

Run a few rounds for a demo, or loop for hours:

    python distill/continual.py --rounds 6 --sim-days 60 --budget 6
    python distill/continual.py --hours 2          # run continually, log each round

Each round logs {round, traces, train_acc, final_cash, feasible_rate}. The
LLM-alone baseline (no verifier/repair) is the flat/bankrupt comparison.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.generator import generate_state, corrupt_plan          # noqa: E402
from src.baselines import greedy                                 # noqa: E402
from src.data_export import build_episode                        # noqa: E402
from src.rolling_sim import run_rolling_sim                      # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "results", "continual")


def run_continual(rounds: int = 6, seed: int = 0, sim_days: int = 60,
                  budget: int = 6, batch: int = 8, epochs: int = 30,
                  outdir: str = OUT, log=lambda s: None) -> dict:
    import torch
    from src.trm_student import train, LearnedRepairModel, build_dataset
    os.makedirs(outdir, exist_ok=True)
    corpus = os.path.join(outdir, "episodes.jsonl")
    open(corpus, "w").close()   # fresh corpus per run

    # baseline: LLM-alone (no verifier/repair) over the same horizon
    naive = run_rolling_sim(seed, sim_days, repair=False)

    series = []
    for r in range(rounds):
        # grow the verified-trace corpus
        with open(corpus, "a") as f:
            for i in range(batch):
                s = generate_state(seed=seed * 7919 + r * batch + i, horizon_days=30)
                cand = corrupt_plan(s, greedy(s), seed=r * batch + i, n_corruptions=6)
                f.write(json.dumps(build_episode(s, cand, seed=r * batch + i, K=60)) + "\n")
        # train the student on everything so far
        model = train(corpus, out_dir=outdir, epochs=epochs)
        X, y = build_dataset(corpus)
        with torch.no_grad():
            acc = float((model(torch.tensor(X)).argmax(-1) == torch.tensor(y)).float().mean())
        # run the business sim driven by the student under a fixed budget
        trm = LearnedRepairModel(os.path.join(outdir, "trm.pt"))
        sim = run_rolling_sim(seed, sim_days, repair=True, op_selector=trm.pick_op, K=budget)
        row = {"round": r + 1, "traces": int(len(X)), "train_acc": round(acc, 4),
               "final_cash": sim["final_cash"], "feasible_rate": sim["feasible_rate"]}
        series.append(row)
        log(f"round {r+1}/{rounds}: traces={row['traces']} acc={row['train_acc']} "
            f"cash=${row['final_cash']} feasible={row['feasible_rate']}")
        with open(os.path.join(outdir, "series.json"), "w") as f:
            json.dump({"series": series, "naive_final": naive["final_cash"],
                       "naive_bankrupt": naive["bankrupt"], "sim_days": sim_days,
                       "budget": budget}, f)
    return {"series": series, "naive_final": naive["final_cash"],
            "naive_bankrupt": naive["bankrupt"], "sim_days": sim_days, "budget": budget}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rounds", type=int, default=6)
    ap.add_argument("--sim-days", type=int, default=60)
    ap.add_argument("--budget", type=int, default=6)
    ap.add_argument("--hours", type=float, default=0.0, help="loop continually for N hours")
    args = ap.parse_args()
    if args.hours > 0:
        end = time.time() + args.hours * 3600
        r = 0
        while time.time() < end:
            r += 1
            run_continual(rounds=r, sim_days=args.sim_days, budget=args.budget,
                          log=lambda s: print(s, flush=True))
    else:
        run_continual(rounds=args.rounds, sim_days=args.sim_days, budget=args.budget,
                      log=lambda s: print(s, flush=True))


if __name__ == "__main__":
    main()
