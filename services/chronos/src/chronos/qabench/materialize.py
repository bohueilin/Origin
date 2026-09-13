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
import os
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path

from chronos.qabench.hud_env import write_hud_env
from chronos.qabench.importer import (
    _STAGE_MARKER,
    _assert_no_symlink,
    _atomic_write,
    _ensure_real_directory,
    _remove_owned_stage,
    ImportedEnvPlan,
    discover_task,
    plan_env,
    task_slug,
    validate_task_id,
)

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
    build_asset_policies: dict[tuple[str, str], tuple[str, ...]] | None = None,
) -> list[MaterializeResult]:
    """Discover + plan + write each task; skip (don't write) non-deployable ones.

    When ``with_hud`` (default), also emit the per-task HUD serve artifacts
    (``env.py``/``Dockerfile.hud``/``pyproject.toml``/``tasks.py``) for live deploy.
    """
    # Preflight all ids before source lookup or destination creation. A normalized
    # collision is ambiguous authority, not a name we may silently overwrite.
    slugs: set[str] = set()
    for task_id in task_ids:
        slug = task_slug(validate_task_id(task_id))
        if slug in slugs:
            raise ValueError(f"multiple task ids normalize to slug {slug!r}")
        slugs.add(slug)

    destination = Path(dest_root)
    _assert_no_symlink(destination)
    if destination.exists():
        if not destination.is_dir():
            raise ValueError(f"destination root is not a directory: {destination}")
        if any(destination.iterdir()):
            raise ValueError(
                f"destination root is non-empty; explicit refresh is required: {destination}"
            )
        raise ValueError(f"destination root already exists: {destination}")

    # Freeze every deployable source before creating the private batch stage.
    planned: list[tuple[MaterializeResult, ImportedEnvPlan]] = []
    results: list[MaterializeResult] = []
    for task_id in task_ids:
        task = discover_task(tasks_dir, task_id, revision=revision)
        if task.deployable:
            policy = (
                build_asset_policies.get((task_id, revision))
                if build_asset_policies is not None
                else None
            )
            plan = plan_env(
                task,
                destination / f".{destination.name}.stage-{uuid.uuid4().hex}",
                public_build_assets=policy,
            )
            result = MaterializeResult(
                task_id=task_id,
                slug=task.slug(),
                deployable=True,
                base_image=task.base_image,
                base_rewritten=task.base_rewritten,
                base_digest=task.base_digest,
                env_dir=str(destination / task.slug()),
                skip_reason=None,
            )
            planned.append((result, plan))
            results.append(result)
        else:
            results.append(
                MaterializeResult(
                    task_id=task_id,
                    slug=task.slug(),
                    deployable=False,
                    base_image=task.base_image,
                    base_rewritten=task.base_rewritten,
                    base_digest=task.base_digest,
                    env_dir=None,
                    skip_reason=task.skip_reason,
                )
            )

    _ensure_real_directory(destination.parent)
    batch_stage = destination.parent / f".{destination.name}.stage-{uuid.uuid4().hex}"
    marker = batch_stage.parent / f"{batch_stage.name}.{_STAGE_MARKER}"
    try:
        batch_stage.mkdir(mode=0o700)
        _atomic_write(marker, b"origin-qabench-stage\n")
        for result, plan in planned:
            plan.dest = batch_stage / result.slug
            env_dir = plan.write()
            if with_hud:
                write_hud_env(env_dir)
            for name in ("Dockerfile", "provenance.json"):
                candidate = env_dir / name
                if candidate.is_symlink() or not candidate.is_file():
                    raise ValueError(f"staged environment verification failed: {candidate}")
            if with_hud:
                for name in ("env.py", "pyproject.toml", "tasks.py", "Dockerfile.hud"):
                    candidate = env_dir / name
                    if candidate.is_symlink() or not candidate.is_file():
                        raise ValueError(f"staged HUD verification failed: {candidate}")
        _assert_no_symlink(destination.parent)
        if destination.exists() or destination.is_symlink():
            raise ValueError(f"destination appeared while publishing batch: {destination}")
        os.replace(batch_stage, destination)
        marker.unlink()
    except Exception:
        if marker.exists():
            _remove_owned_stage(batch_stage)
        raise
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


def load_build_asset_policies(path: Path | str) -> dict[tuple[str, str], tuple[str, ...]]:
    """Load exact reviewed public build inputs, keyed by task and source revision."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    revision = str(data.get("terminal_wrench_revision", ""))
    raw = data.get("public_build_assets", {})
    if not isinstance(raw, dict):
        raise ValueError("public_build_assets must be an object keyed by task id")
    policies: dict[tuple[str, str], tuple[str, ...]] = {}
    for task_id, assets in raw.items():
        validate_task_id(task_id)
        if not isinstance(assets, list) or not all(isinstance(item, str) for item in assets):
            raise ValueError(f"public build assets for {task_id!r} must be a string list")
        policies[(task_id, revision)] = tuple(assets)
    return policies


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
    results = materialize(
        args.tasks_dir,
        task_ids,
        args.dest_root,
        revision=revision,
        build_asset_policies=load_build_asset_policies(args.manifest),
    )
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
