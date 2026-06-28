"""End-to-end Cobra pipeline over an environment adapter — bring an env, get a verifier report.

An environment is just an **adapter**: how to list tasks, the verifier under test (`naive`), an
**independent** oracle (ground truth), and optionally the hardened verifier + a guaranteed cheat
injector. Given one, the SAME loop generates the adversarial rollout and produces the
verifier-safety leaderboard + best-of-K gap — for EvalPlus, reasoning-gym, or a HUD environment.

The one hard requirement is that `oracle` is independent of `naive` (else you grade the verifier
against a copy of itself). See SPEC eval-honesty. Adding an env = writing one adapter.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from .bench.core import VerifierScore, leaderboard
from .bench.gap import GapReport, bestofk_gap
from .rollout.dataset import Rollout, load_jsonl, stream_rollouts
from .rollout.models import Model

Scorer = Callable[[object, str], int]  # (task, completion) -> {0, 1}


@dataclass
class EnvAdapter:
    """Everything Cobra needs from an environment; the loop itself is env-agnostic."""

    name: str
    load_tasks: Callable[[int], list]
    naive: Scorer  # the verifier under test
    oracle: Scorer  # independent ground truth
    hardened: Scorer | None = None  # produced by the harden loop (defaults to naive)
    exploit_fn: Callable[[object], list[str]] | None = None  # optional guaranteed cheat injector


@dataclass
class PipelineResult:
    adapter: str
    rollouts: list[Rollout]
    leaderboard: list[VerifierScore]
    gap: GapReport


def run_pipeline(
    adapter: EnvAdapter,
    models: list[Model],
    *,
    n: int = 10,
    k: int = 4,
    out_path: str = "runs/pipeline.jsonl",
    workers: int = 8,
) -> PipelineResult:
    """Generate the rollout for `adapter`, then score the verifier leaderboard + best-of-K gap."""
    tasks = adapter.load_tasks(n)
    hardened = adapter.hardened or adapter.naive
    stream_rollouts(
        tasks,
        models,
        r_naive=adapter.naive,
        r_hardened=hardened,
        t_oracle=adapter.oracle,
        k=k,
        out_path=out_path,
        workers=workers,
        exploit_fn=adapter.exploit_fn,
    )
    rollouts = load_jsonl(out_path)
    return PipelineResult(adapter.name, rollouts, leaderboard(rollouts), bestofk_gap(rollouts))


def evalplus_adapter() -> EnvAdapter:
    """EvalPlus (HumanEval) code env: base tests = naive, plus tests = oracle, forger = cheats."""
    from .breadth.cheats import forger_cheats
    from .rollout.scorers import real_scorers
    from .substrate import load_hardest

    naive, hardened, oracle = real_scorers()
    return EnvAdapter("evalplus", load_hardest, naive, oracle, hardened, forger_cheats)


def rg_adapter(dataset: str = "gsm_symbolic", seed: int = 42) -> EnvAdapter:
    """The reasoning-gym math env: lenient scorer = naive, last-number = oracle."""
    from .rollout.scorers import rg_real_scorers
    from .substrate import load_rg_subset

    naive, hardened, oracle = rg_real_scorers()
    return EnvAdapter(
        f"rg:{dataset}", lambda n: load_rg_subset(dataset, n, seed), naive, oracle, hardened
    )
