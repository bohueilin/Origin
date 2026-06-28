"""Offline materializer (Plan 008 WP1).

Turns a declared list of Terminal-Wrench task ids into ``envs/qabench/<slug>/``
HUD env layouts via the importer, and records a per-task import report. OFFLINE:
it reads a pinned Terminal-Wrench checkout and writes layouts; it does NOT deploy
to HUD. Non-deployable tasks (e.g. an unverified private base) are honestly
skipped in the report rather than materialized.

Run: ``uv run python -m chronos.qabench.materialize --manifest envs/qabench/tasks.json``
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from chronos.qabench.hud_env import write_hud_env
from chronos.qabench.importer import discover_task, plan_env

_DEFAULT_TASKS_DIR = Path(".external/terminal-wrench/tasks")


@dataclass(frozen=True)
class MaterializeResult:
    task_id: str
    slug: str
    deployable: bool
    base_image: str
    base_rewritten: bool
    base_digest: str
    env_dir: str | None
    skip_reason: str | None


def materialize(
    tasks_dir: Path | str,
    task_ids: list[str],
    dest_root: Path | str,
    revision: str = "",
    with_hud: bool = True,
) -> list[MaterializeResult]:
    """Discover + plan + write each task; skip (don't write) non-deployable ones.

    When ``with_hud`` (default), also emit the per-task HUD serve artifacts
    (``env.py``/``Dockerfile.hud``/``pyproject.toml``/``tasks.py``) for live deploy.
    """
    results: list[MaterializeResult] = []
    for task_id in task_ids:
        task = discover_task(tasks_dir, task_id, revision=revision)
        env_dir = None
        if task.deployable:
            env_dir = str(plan_env(task, dest_root).write())
            if with_hud:
                write_hud_env(env_dir)
        results.append(
            MaterializeResult(
                task_id=task_id,
                slug=task.slug(),
                deployable=task.deployable,
                base_image=task.base_image,
                base_rewritten=task.base_rewritten,
                base_digest=task.base_digest,
                env_dir=env_dir,
                skip_reason=task.skip_reason,
            )
        )
    return results


def import_report(
    results: list[MaterializeResult], tasks_dir: Path | str, revision: str
) -> dict:
    return {
        "terminal_wrench_revision": revision,
        "tasks_dir": str(tasks_dir),
        "total": len(results),
        "deployable": sum(r.deployable for r in results),
        "skipped": sum(not r.deployable for r in results),
        "tasks": [asdict(r) for r in results],
    }


def load_manifest(path: Path | str) -> tuple[list[str], str]:
    """Return (task_ids, terminal_wrench_revision) from a tasks manifest."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return list(data["tasks"]), str(data.get("terminal_wrench_revision", ""))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Materialize qabench envs from TW tasks."
    )
    parser.add_argument("--manifest", required=True, help="tasks manifest JSON")
    parser.add_argument(
        "--tasks-dir", default=str(_DEFAULT_TASKS_DIR), help="TW tasks dir"
    )
    parser.add_argument("--dest-root", default="envs/qabench", help="env output root")
    parser.add_argument("--report", default="envs/qabench/IMPORT_REPORT.json")
    args = parser.parse_args(argv)

    task_ids, revision = load_manifest(args.manifest)
    results = materialize(args.tasks_dir, task_ids, args.dest_root, revision=revision)
    report = import_report(results, args.tasks_dir, revision)
    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    for r in results:
        status = f"deploy {r.env_dir}" if r.deployable else f"SKIP ({r.skip_reason})"
        print(f"{r.slug:42s} {r.base_image:55s} {status}")
    print(
        f"\n{report['deployable']}/{report['total']} deployable; report -> {args.report}"
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
