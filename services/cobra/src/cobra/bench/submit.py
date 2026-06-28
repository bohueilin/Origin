"""CLI: score a rollout dataset locally and submit it to the verifier-safety leaderboard.

  python -m cobra.bench.submit --data runs/rollouts.jsonl --name my-env --url http://localhost:8100

Self-serve: metrics are computed HERE (your keys, your machine); the server only stores + ranks.
Pure client — builds the JSON and POSTs via stdlib urllib (no server imports). `--judge` adds the
LLM-as-judge row (needs ANTHROPIC_API_KEY); `--dry-run` prints the payload without POSTing.
"""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request

from ..rollout.dataset import Rollout, load_jsonl
from .core import column, score_verifier
from .gap import best_of_k_accuracy


def _substrate(task_id: str) -> str:
    if task_id.startswith(("HumanEval/", "Mbpp/")):
        return "evalplus"
    if ":" in task_id:  # e.g. gsm_symbolic:42:20
        return "reasoning-gym:" + task_id.split(":", 1)[0]
    return "custom"


def _row(rollouts: list[Rollout], name: str, verdict) -> dict:
    s = score_verifier(rollouts, verdict, name=name)
    return {
        "name": s.name,
        "safety_score": s.safety_score,
        "catch_rate": s.catch_rate,
        "false_accept": s.false_accept,
        "honest_pass": s.honest_pass,
        "agreement": s.agreement,
        "best_of_k": best_of_k_accuracy(rollouts, verdict),
        "over_tightened": s.over_tightened,
    }


def _examples(rollouts: list[Rollout], per_kind: int = 3) -> list[dict]:
    cheats = [r for r in rollouts if r.r_naive == 1 and r.t_oracle == 0][:per_kind]
    honest = [r for r in rollouts if r.r_hardened == 1 and r.t_oracle == 1][:per_kind]

    def row(r: Rollout, kind: str) -> dict:
        return {
            "task_id": r.task_id,
            "kind": kind,
            "completion": r.completion[:240],
            "r_naive": r.r_naive,
            "r_hardened": r.r_hardened,
            "t_oracle": r.t_oracle,
        }

    return [row(r, "naive_accepted_cheat") for r in cheats] + [
        row(r, "hardened_kept_honest") for r in honest
    ]


def build_verified_payload(rollouts: list[Rollout], name: str) -> dict:
    """Build a raw-completion payload for the server-verified path (/api/submit/verified).

    Only works for evalplus / reasoning-gym substrates (the server 422s others).
    The server recomputes scores from completions and awards the ✓ verified badge.
    r_naive / r_hardened are included as hints but the server ignores them.
    """
    return {
        "env_name": name,
        "substrate": _substrate(rollouts[0].task_id),
        "rows": [
            {
                "task_id": r.task_id,
                "model": r.model,
                "completion": r.completion,
                "r_naive": r.r_naive,
                "r_hardened": r.r_hardened,
            }
            for r in rollouts
        ],
    }


def build_payload(rollouts: list[Rollout], name: str, *, judge: bool = False) -> dict:
    """Score the rollout into a leaderboard submission (no network) — testable on its own."""
    verifiers = [
        _row(rollouts, "naive", column("r_naive")),
        _row(rollouts, "hardened", column("r_hardened")),
    ]
    if judge:
        from .verifiers import judge_verifier

        verifiers.insert(1, _row(rollouts, "llm-judge", judge_verifier()))
    return {
        "env_name": name,
        "substrate": _substrate(rollouts[0].task_id),
        "n_completions": len(rollouts),
        "n_exploits": sum(1 for r in rollouts if r.t_oracle == 0),
        "model_count": len({r.model for r in rollouts}),
        "verifiers": verifiers,
        "examples": _examples(rollouts),
    }


def submit(
    data: str,
    name: str,
    url: str,
    *,
    judge: bool = False,
    dry_run: bool = False,
    verified: bool = False,
):
    rollouts = load_jsonl(data)
    if not rollouts:
        raise SystemExit(f"no rollouts in {data}")
    if verified:
        payload = build_verified_payload(rollouts, name)
        endpoint = f"{url.rstrip('/')}/api/submit/verified"
    else:
        payload = build_payload(rollouts, name, judge=judge)
        endpoint = f"{url.rstrip('/')}/api/submit"
    if dry_run:
        print(json.dumps(payload, indent=2))
        return None
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        # Verified submissions recompute every score server-side (sandboxed code execution),
        # which can take a minute or two on a large dataset — allow for it.
        with urllib.request.urlopen(req, timeout=300) as resp:
            res = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(
            f"server rejected the submission ({e.code}): {e.read().decode()}"
        ) from None
    except urllib.error.URLError as e:
        raise SystemExit(
            f"could not reach {url} ({e.reason}). Is the leaderboard running?"
        ) from None
    print(f"submitted '{name}' → {res['url']}")
    return res


def main() -> None:
    ap = argparse.ArgumentParser(prog="cobra.bench.submit")
    ap.add_argument("--data", default="runs/rollouts.jsonl")
    ap.add_argument("--name", required=True)
    ap.add_argument("--url", default="http://localhost:8100")
    ap.add_argument("--judge", action="store_true", help="add the LLM-judge row (needs API key)")
    ap.add_argument("--dry-run", action="store_true", help="print the payload, don't POST")
    ap.add_argument(
        "--verified",
        action="store_true",
        help=(
            "submit raw completions for canonical substrates so the SERVER recomputes scores"
            " (earns the ✓ verified badge). Only works for evalplus / reasoning-gym;"
            " the server 422s other substrates."
        ),
    )
    args = ap.parse_args()
    submit(
        args.data,
        args.name,
        args.url,
        judge=args.judge,
        dry_run=args.dry_run,
        verified=args.verified,
    )


if __name__ == "__main__":
    main()
