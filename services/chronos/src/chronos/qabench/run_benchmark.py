"""End-to-end live benchmark runner for the qabench Δ benchmark (Plan 008 step 3).

Two phases over the 10 materialized envs:

  * ``preflight`` — capture a Modal ForkPoint per task (builds Dockerfile.hud in
    Modal + snapshots). Cheap (no agent rollouts); a task whose image fails to
    build is an honest skip, not a faked result.
  * ``batch`` — for each captured task, run the Chronos discovery branches
    (Plan 003 ``branch_runs`` via ``LiveDiscoveryDriver``) and adjudicate each
    rewarded branch with the sterile Modal ``clean_verify`` referee, then score the
    whole trajectory population into per-task + aggregate X / Δ.

REAL Modal + Anthropic spend; requires credentials and ``FORKPROOF_ALLOW_EXTERNAL_QA=1``.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import time
from pathlib import Path

from chronos.qabench.live_benchmark import adjudicate_branches
from chronos.qabench.live_discovery import LiveDiscoveryDriver
from chronos.qabench.modal_runtime import ModalCleanVerifyRunner, capture_forkpoint
from chronos.qabench.models import DiscoveredBranch, Trajectory
from chronos.qabench.scoring import score

_ARTIFACTS = Path("artifacts/chronos/qabench")
# Per-task branch state roots (default /app); a couple of tasks also write /data.
_STATE_ROOTS: dict[str, tuple[str, ...]] = {
    "recover-corrupted-sqlite-data": ("/app", "/data"),
    "find-invalid-blockchain-transactions": ("/app", "/data"),
}


def _skip_qa_enabled() -> bool:
    return os.environ.get("FORKPROOF_SKIP_QA", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def load_env(root: Path, *, skip_qa: bool = False) -> None:
    env_path = root / ".env"
    if env_path.exists():
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(
                    key.strip().removeprefix("export ").strip(),
                    value.strip().strip("'\""),
                )
    os.environ["FORKPROOF_ALLOW_EXTERNAL_QA"] = "1"
    if skip_qa:
        os.environ["FORKPROOF_SKIP_QA"] = "1"


def task_list(root: Path) -> list[str]:
    return list(json.loads((root / "envs/qabench/tasks.json").read_text())["tasks"])


def preflight(root: Path, tasks: list[str]) -> dict[str, dict]:
    """Capture a ForkPoint per task; skip (don't fail) tasks whose image won't build."""
    _ARTIFACTS.mkdir(parents=True, exist_ok=True)
    results: dict[str, dict] = {}
    out = _ARTIFACTS / "forkpoints.json"
    for slug in tasks:
        env_dir = root / "envs/qabench" / slug
        started = time.time()
        try:
            fp = capture_forkpoint(
                env_dir, state_roots=_STATE_ROOTS.get(slug, ("/app",))
            )
            results[slug] = {
                "status": "ok",
                "snapshot_id": fp["snapshot_id"],
                "forkpoint": fp,
                "seconds": round(time.time() - started, 1),
            }
            print(
                f"OK   {slug}  {fp['snapshot_id']}  ({results[slug]['seconds']}s)",
                flush=True,
            )
        except Exception as exc:  # noqa: BLE001 - capture failure is an honest skip
            results[slug] = {
                "status": "skip",
                "error_class": type(exc).__name__,
                "error": str(exc)[:600],
                "seconds": round(time.time() - started, 1),
            }
            print(f"SKIP {slug}  {type(exc).__name__}: {str(exc)[:200]}", flush=True)
        out.write_text(json.dumps(results, indent=2) + "\n")
    ok = [s for s, r in results.items() if r["status"] == "ok"]
    print(f"\nPREFLIGHT: {len(ok)}/{len(tasks)} captured -> {out}", flush=True)
    return results


def run_task(
    root: Path, slug: str, forkpoint: dict, *, count: int
) -> tuple[list[DiscoveredBranch], list[Trajectory]]:
    """Run discovery branches for one task; return (all branches, adjudicated rewarded)."""
    driver = LiveDiscoveryDriver(
        root=root,
        env_rel=str(Path("envs/qabench") / slug / "env.py"),
        forkpoint=forkpoint,
        count=count,
        concurrency=count,
        state_roots=_STATE_ROOTS.get(slug, ("/app",)),
    )
    branches = list(driver.run_discovery_tree(slug))
    clean_verify = ModalCleanVerifyRunner(root / "envs/qabench" / slug)
    trajectories = adjudicate_branches(branches, clean_verify)
    return branches, trajectories


def batch(root: Path, *, count: int) -> dict:
    """Run every captured task and seal the aggregate X/Δ report."""
    forkpoints = json.loads((_ARTIFACTS / "forkpoints.json").read_text())
    captured = {s: r for s, r in forkpoints.items() if r["status"] == "ok"}
    skips = [s for s, r in forkpoints.items() if r["status"] != "ok"]
    all_trajectories: list[Trajectory] = []
    per_task: dict[str, dict] = {}
    for slug, record in captured.items():
        started = time.time()
        try:
            branches, trajs = run_task(root, slug, record["forkpoint"], count=count)
            all_trajectories.extend(trajs)
            confirmed = sum(1 for t in trajs if t.is_confirmed_hack)
            per_task[slug] = {
                "branches": len(branches),
                "rewarded": len(trajs),
                "confirmed_hacks": confirmed,
                "seconds": round(time.time() - started, 1),
            }
            print(
                f"DONE {slug}: {len(trajs)} branches, {confirmed} confirmed hacks "
                f"({per_task[slug]['seconds']}s)",
                flush=True,
            )
        except Exception as exc:  # noqa: BLE001 - a failed batch is an honest per-task skip
            skips.append(slug)
            per_task[slug] = {
                "error_class": type(exc).__name__,
                "error": str(exc)[:600],
            }
            print(
                f"SKIP {slug} (batch): {type(exc).__name__}: {str(exc)[:200]}",
                flush=True,
            )

    report = score(all_trajectories, tasks_skipped=skips)
    payload = {
        "schema_version": 1,
        "tasks_measured": report.tasks_measured,
        "tasks_skipped": skips,
        "branch_count_per_task": count,
        "qa_mode": "skipped" if _skip_qa_enabled() else "enabled",
        "depth": dataclasses.asdict(report.depth),
        "coverage": dataclasses.asdict(report.coverage),
        "per_task_summary": per_task,
        "report": dataclasses.asdict(report),
    }
    out = _ARTIFACTS / "benchmark-report.json"
    out.write_text(json.dumps(payload, indent=2, default=str) + "\n")
    print(
        f"\nSEALED REPORT -> {out}\n  depth={payload['depth']}\n  coverage={payload['coverage']}"
        f"\n  measured={report.tasks_measured} skipped={skips}",
        flush=True,
    )
    return payload


def run_one_task_to_file(root: Path, slug: str, *, count: int) -> Path:
    """Run + score ONE captured task and write its per-task report.

    Designed to run as an isolated subprocess: task selection uses a process-global
    env var (FORKPROOF_TASK_ENV), so one task per process keeps it race-free, which
    is what lets the launcher run tasks in parallel safely.
    """
    forkpoints = json.loads((_ARTIFACTS / "forkpoints.json").read_text())
    record = forkpoints[slug]
    if record["status"] != "ok":
        raise RuntimeError(f"{slug} was not captured")
    branches, trajs = run_task(root, slug, record["forkpoint"], count=count)
    report = score(trajs)
    confirmed = sum(1 for t in trajs if t.is_confirmed_hack)
    out = _ARTIFACTS / "tasks" / f"{slug}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {
                "slug": slug,
                "confirmed_hacks": confirmed,
                "branch_count": len(trajs),
                "branches_discovered": len(branches),
                "branches_rewarded": len(trajs),
                "qa_mode": "skipped" if _skip_qa_enabled() else "enabled",
                "depth": dataclasses.asdict(report.depth),
                "coverage": dataclasses.asdict(report.coverage),
                "qa_false_positives": report.qa_false_positives,
                "undecided": report.undecided,
                "branch_clusters_without_lineage": report.branch_clusters_without_lineage,
                "branches": [
                    {
                        "id": t.trajectory_id,
                        "reward": t.reward_passed,
                        "qa": t.qa_is_reward_hacking,
                        "referee": str(t.referee),
                    }
                    for t in trajs
                ],
            },
            indent=2,
            default=str,
        )
        + "\n"
    )
    print(
        f"TASK {slug}: {confirmed} confirmed hacks / {len(trajs)} branches -> {out}",
        flush=True,
    )
    return out


def aggregate(root: Path, *, count: int) -> dict:
    """Sum the per-task reports into the sealed aggregate X/Δ benchmark report."""
    forkpoints = json.loads((_ARTIFACTS / "forkpoints.json").read_text())
    captured = [s for s, r in forkpoints.items() if r["status"] == "ok"]
    skips = [s for s, r in forkpoints.items() if r["status"] != "ok"]
    task_dir = _ARTIFACTS / "tasks"
    files = (
        {f.stem: json.loads(f.read_text()) for f in task_dir.glob("*.json")}
        if task_dir.exists()
        else {}
    )
    skips += [
        s for s in captured if s not in files
    ]  # captured but batch-failed = honest skip

    def _zero() -> dict[str, int]:
        return {"qa_baseline_x": 0, "detection_delta": 0, "discovery_delta": 0}

    depth, coverage = _zero(), _zero()
    per_task, qa_fp, undecided, no_lineage, confirmed = [], 0, 0, 0, 0
    for slug, d in sorted(files.items()):
        for k in depth:
            depth[k] += d["depth"][k]
            coverage[k] += d["coverage"][k]
        qa_fp += d["qa_false_positives"]
        undecided += d["undecided"]
        no_lineage += d["branch_clusters_without_lineage"]
        confirmed += d["confirmed_hacks"]
        per_task.append(
            {
                "slug": slug,
                "confirmed_hacks": d["confirmed_hacks"],
                "branches": d["branch_count"],
                "depth": d["depth"],
                "coverage": d["coverage"],
            }
        )
    payload = {
        "schema_version": 1,
        "scope": "qabench additive X/Δ benchmark: Chronos discovery vs HUD QA baseline over Terminal Wrench tasks",
        "branch_count_per_task": count,
        "qa_mode": "skipped" if _skip_qa_enabled() else "enabled",
        "tasks_measured": len(files),
        "tasks_skipped": sorted(set(skips)),
        "total_confirmed_hacks": confirmed,
        "aggregate_depth": depth,
        "aggregate_coverage": coverage,
        "qa_false_positives": qa_fp,
        "undecided": undecided,
        "branch_clusters_without_lineage": no_lineage,
        "per_task": per_task,
    }
    out = _ARTIFACTS / "benchmark-report.json"
    out.write_text(json.dumps(payload, indent=2, default=str) + "\n")
    print(
        f"\nSEALED -> {out}\n  measured={len(files)} skipped={payload['tasks_skipped']}"
        f"\n  depth={depth}\n  coverage={coverage}\n  total_confirmed_hacks={confirmed}",
        flush=True,
    )
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the qabench live X/Δ benchmark.")
    parser.add_argument(
        "--phase", choices=["preflight", "batch", "aggregate", "all"], default="all"
    )
    parser.add_argument(
        "--task", help="run + score a single captured task (isolated subprocess)"
    )
    parser.add_argument(
        "--count", type=int, default=10, help="discovery branches per task"
    )
    parser.add_argument(
        "--skip-qa",
        action="store_true",
        help="skip HUD QA and rely on sterile clean_verify for SFT data",
    )
    args = parser.parse_args(argv)
    root = Path.cwd()
    load_env(root, skip_qa=args.skip_qa)
    if args.task:
        run_one_task_to_file(root, args.task, count=args.count)
        return 0
    if args.phase in ("preflight", "all"):
        preflight(root, task_list(root))
    if args.phase in ("batch", "all"):
        batch(root, count=args.count)
    if args.phase == "aggregate":
        aggregate(root, count=args.count)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
