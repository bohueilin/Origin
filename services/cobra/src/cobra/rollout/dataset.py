"""The rollout dataset: sample K completions per task across MULTIPLE models, score each via
injected reward callables, emit the locked-seam JSONL that the best-of-K gap logic consumes.

Locked seam (one row per completion): {task_id, model, completion, r_naive, r_hardened, t_oracle}.
The loop imports NO grader internals — scorers are injected (see scorers.py). Label falls out of
(r_naive, t_oracle): fail / honest / cheat (cheat = passed naive but wrong on the oracle).
"""

from __future__ import annotations

import json
import threading
from collections import Counter
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from .models import Model

Scorer = Callable[[object, str], int]

# The locked seam contract (Advay produces → Rayan's best-of-K consumes). Order matters for clarity.
SEAM_FIELDS = ("task_id", "model", "completion", "r_naive", "r_hardened", "t_oracle")


@dataclass
class Rollout:
    task_id: str
    model: str
    completion: str
    r_naive: int  # reward under the leaky (base-test) grader
    r_hardened: int  # reward under the hardened grader
    t_oracle: int  # ground truth (held-out)

    @property
    def label(self) -> str:
        if self.r_naive != 1:
            return "fail"
        return "honest" if self.t_oracle == 1 else "cheat"


def generate_rollouts(
    tasks: list,
    models: list[Model],
    *,
    r_naive: Scorer,
    r_hardened: Scorer,
    t_oracle: Scorer,
    k: int = 4,
) -> list[Rollout]:
    """Sample k completions per (task, model) and score each with the injected rewards.
    Every sample and score is guarded so one bad call can't kill the run."""
    rollouts: list[Rollout] = []
    for task in tasks:
        for model in models:
            for _ in range(k):
                try:
                    completion = model.sample(task)
                except Exception:
                    continue
                rollouts.append(
                    Rollout(
                        task_id=task.task_id,
                        model=model.name,
                        completion=completion,
                        r_naive=r_naive(task, completion),
                        r_hardened=r_hardened(task, completion),
                        t_oracle=t_oracle(task, completion),
                    )
                )
    return rollouts


def generate_seed_rollouts(
    tasks: list,
    *,
    exploit_fn: Callable[[object], list[str]],
    r_naive: Scorer,
    r_hardened: Scorer,
    t_oracle: Scorer,
    model_name: str = "seed-forger",
) -> list[Rollout]:
    """Inject a GUARANTEED cheat class: deterministic seed exploits as rollout rows.

    `exploit_fn(task) -> [cheat_src, ...]` (e.g. breadth.cheats.forger_cheats). Ensures the
    dataset always contains cheats even when sampled models solve honestly — the plan's
    "lean on seed exploits to guarantee an exploit class exists.\""""
    rollouts: list[Rollout] = []
    for task in tasks:
        try:
            cheats = exploit_fn(task)
        except Exception:
            cheats = []
        for c in cheats:
            rollouts.append(
                Rollout(
                    task_id=task.task_id,
                    model=model_name,
                    completion=c,
                    r_naive=r_naive(task, c),
                    r_hardened=r_hardened(task, c),
                    t_oracle=t_oracle(task, c),
                )
            )
    return rollouts


@dataclass
class RolloutReport:
    rollouts: list[Rollout]

    def _count(self, label: str) -> int:
        return sum(1 for r in self.rollouts if r.label == label)

    @property
    def total(self) -> int:
        return len(self.rollouts)

    @property
    def cheats(self) -> int:
        return self._count("cheat")

    @property
    def honest(self) -> int:
        return self._count("honest")

    def hack_rate(self, reward: str) -> float:
        """Of rollouts the given reward pays out (R=1), the fraction that are actually WRONG."""
        paid = [r for r in self.rollouts if getattr(r, f"r_{reward}") == 1]
        if not paid:
            return 0.0
        return sum(1 for r in paid if r.t_oracle == 0) / len(paid)


def write_jsonl(rollouts: list[Rollout], path: str | Path) -> Path:
    """Persist the dataset, one row per completion, EXACTLY the seam fields (Rayan's consumer)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in rollouts:
            f.write(json.dumps({field: getattr(r, field) for field in SEAM_FIELDS}) + "\n")
    return path


def _row(r: Rollout) -> str:
    return json.dumps({field: getattr(r, field) for field in SEAM_FIELDS})


def load_jsonl(path: str | Path) -> list[Rollout]:
    """Read a seam JSONL back into Rollouts."""
    rollouts: list[Rollout] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                d = json.loads(line)
                rollouts.append(Rollout(**{field: d[field] for field in SEAM_FIELDS}))
    return rollouts


def stream_rollouts(
    tasks: list,
    models: list[Model],
    *,
    r_naive: Scorer,
    r_hardened: Scorer,
    t_oracle: Scorer,
    k: int = 4,
    out_path: str | Path,
    workers: int = 8,
    exploit_fn: Callable[[object], list[str]] | None = None,
) -> RolloutReport:
    """Robust generation: parallel sampling, each scored rollout APPENDED immediately (crash-safe),
    and RESUMABLE — re-running tops up to k per (task, model) and skips tasks that already have seed
    rows. The JSONL on disk is the reproducible artifact; everything downstream is deterministic
    from it. `exploit_fn` (e.g. forger_cheats) injects the guaranteed cheat class."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    done: Counter = Counter()
    if out_path.exists():
        for r in load_jsonl(out_path):
            done[(r.task_id, r.model)] += 1

    lock = threading.Lock()

    def append(r: Rollout) -> None:
        with lock, out_path.open("a", encoding="utf-8") as f:
            f.write(_row(r) + "\n")

    def score(task, model_name, completion) -> Rollout:
        return Rollout(
            task_id=task.task_id,
            model=model_name,
            completion=completion,
            r_naive=r_naive(task, completion),
            r_hardened=r_hardened(task, completion),
            t_oracle=t_oracle(task, completion),
        )

    # Model sampling units: only what's still needed to reach k (resume).
    units = [
        (task, model)
        for task in tasks
        for model in models
        for _ in range(max(0, k - done[(task.task_id, model.name)]))
    ]

    def work(unit) -> None:
        task, model = unit
        try:
            completion = model.sample(task)
        except Exception:
            return  # one bad call must not kill the run
        append(score(task, model.name, completion))

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(work, units))

    # Seed exploits: deterministic, resumable (skip tasks that already have seed rows).
    if exploit_fn is not None:
        for task in tasks:
            if done[(task.task_id, "seed-forger")]:
                continue
            for cheat in exploit_fn(task) or []:
                append(score(task, "seed-forger", cheat))

    return RolloutReport(load_jsonl(out_path))
