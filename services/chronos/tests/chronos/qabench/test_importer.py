"""Behavior of the Terminal-Wrench-to-HUD importer planner (Plan 008 WP1)."""

import json
from pathlib import Path

import pytest

from chronos.qabench.materialize import materialize
from chronos.qabench.importer import (
    deployability,
    discover_task,
    plan_env,
    rewrite_base_image,
)

_REPO_ROOT = Path(__file__).resolve().parents[3]
TW_TASKS = _REPO_ROOT / "fixtures" / "chronos" / "qabench" / "tw-tasks"

# Pinned public ghcr.io refs verified against the registry on 2026-06-21.
_PY_REF = "ghcr.io/laude-institute/t-bench/python-3-13:20250620"
_PY_DIGEST = "sha256:236734f0cafcce942ca09316d57236c2273a2b5411e116454a22cf6d718d95f5"


# --- base-image rewrite / deployability units ----------------------------------


def test_rewrite_private_mirror_to_verified_public_ref() -> None:
    image, rewritten, digest = rewrite_base_image(
        "skylensage-registry.cn-hangzhou.cr.aliyuncs.com/instances/1124:t-bench-python-3-13"
    )
    assert (image, rewritten, digest) == (_PY_REF, True, _PY_DIGEST)


def test_unverified_variant_is_not_rewritten() -> None:
    # A variant we have NOT verified must stay private so deployability flags it,
    # rather than being silently rewritten to a guessed (possibly missing) tag.
    original = (
        "skylensage-registry.cn-hangzhou.cr.aliyuncs.com/instances/1124:t-bench-go-1-22"
    )
    image, rewritten, digest = rewrite_base_image(original)
    assert (image, rewritten, digest) == (original, False, "")


def test_public_ghcr_base_keeps_image_but_gains_pinned_digest() -> None:
    image, rewritten, digest = rewrite_base_image(_PY_REF)
    assert (image, rewritten) == (_PY_REF, False)
    assert digest == _PY_DIGEST


def test_non_tbench_image_passes_through() -> None:
    assert rewrite_base_image("ubuntu:24.04") == ("ubuntu:24.04", False, "")


def test_deployability_flags_private_registry_and_missing_base() -> None:
    assert (
        deployability("ghcr.io/laude-institute/t-bench/ubuntu-24-04:20250624")[0]
        is True
    )
    assert deployability("ubuntu:24.04")[0] is True
    ok, reason = deployability(
        "skylensage-registry.cn-hangzhou.cr.aliyuncs.com/instances/1124:t-bench-go-1-22"
    )
    assert ok is False and "private registry" in (reason or "")
    assert deployability("")[0] is False


# --- discovery -----------------------------------------------------------------


def test_discover_public_task_parses_layout() -> None:
    task = discover_task(TW_TASKS, "public-sample", revision="deadbeef")
    assert task.model == "claude-opus-4.6"
    assert task.base_image == "ubuntu:24.04"
    assert task.base_rewritten is False and task.base_digest == ""
    assert task.workdir == "/app"
    assert task.deployable is True and task.skip_reason is None
    assert task.grader_path.name == "test_outputs.py"
    assert (
        task.test_harness_path is not None and task.test_harness_path.name == "test.sh"
    )
    assert task.instruction_path is not None
    assert task.solution_path is not None


def test_discover_private_task_rewrites_base() -> None:
    task = discover_task(TW_TASKS, "private-sample")
    assert task.base_image == _PY_REF
    assert task.base_rewritten is True and task.base_digest == _PY_DIGEST
    assert task.deployable is True


def test_discover_unverified_variant_is_not_deployable() -> None:
    task = discover_task(TW_TASKS, "unverified-private-sample")
    assert task.base_rewritten is False
    assert task.deployable is False
    assert "private registry" in (task.skip_reason or "")


def test_discover_missing_task_is_skipped_not_raised() -> None:
    task = discover_task(TW_TASKS, "does-not-exist")
    assert task.deployable is False
    assert "no original_task" in (task.skip_reason or "")


def test_discover_rejects_invalid_ids_before_source_lookup() -> None:
    for task_id in (
        "../escape",
        "a/b",
        "a\\b",
        "a\nb",
        "x'; import os; #",
        "☃",
        "",
        "a" * 129,
    ):
        with pytest.raises(ValueError):
            discover_task(TW_TASKS, task_id)


def test_materialize_rejects_normalized_slug_collisions_before_writes(
    tmp_path: Path,
) -> None:
    dest_root = tmp_path / "envs"
    for task_ids in (["a_b", "a-b"], ["A", "a"], ["same", "same"]):
        with pytest.raises(ValueError):
            materialize(TW_TASKS, task_ids, dest_root)
        assert not dest_root.exists()


# --- env planning / materialization --------------------------------------------


def test_plan_env_materializes_layout_and_sterile_clean_verify(tmp_path: Path) -> None:
    task = discover_task(TW_TASKS, "public-sample")
    plan = plan_env(task, tmp_path, public_build_assets=("seed.txt",))
    env_dir = plan.write()

    assert env_dir == tmp_path / "public-sample"
    assert (env_dir / "task_assets" / "test_outputs.py").exists()
    assert (env_dir / "task_assets" / "test.sh").exists()
    assert (env_dir / "task_assets" / "instruction.md").exists()
    assert not (env_dir / "task_assets" / "solution.sh").exists()
    assert task_solution_not_in_plan(plan)
    assert task.solution_path not in plan.files.values()
    assert str(task.solution_path) not in json.dumps(plan.provenance)
    assert (env_dir / "Dockerfile").exists()
    # Build context (Dockerfile siblings, e.g. COPY-ed seed files) must travel
    # to the env root or the image build would fail on the missing COPY source.
    assert (env_dir / "seed.txt").read_text(encoding="utf-8").startswith("fixture")

    clean_verify = env_dir / "clean_verify.sh"
    text = clean_verify.read_text(encoding="utf-8")
    # Sterile via confined conftest discovery, but it must NOT globally disable
    # plugin autoload (that would break tasks whose verification needs plugins).
    assert "--confcutdir" in text
    assert "PYTEST_DISABLE_PLUGIN_AUTOLOAD" not in text
    assert plan.write() == env_dir


def task_solution_not_in_plan(plan: object) -> bool:
    return all("solution" not in rel for rel in plan.files)  # type: ignore[attr-defined]


def test_plan_env_rewrites_dockerfile_from_for_private_base(tmp_path: Path) -> None:
    plan = plan_env(
        discover_task(TW_TASKS, "private-sample"), tmp_path, public_build_assets=()
    )
    env_dir = plan.write()
    dockerfile = (env_dir / "Dockerfile").read_text(encoding="utf-8")
    # The materialized Dockerfile points at the verified public base, not the mirror.
    assert f"FROM {_PY_REF}" in dockerfile
    assert "aliyuncs.com" not in dockerfile


def test_provenance_records_pinned_digests(tmp_path: Path) -> None:
    plan = plan_env(
        discover_task(TW_TASKS, "private-sample", revision="cafe"),
        tmp_path,
        public_build_assets=(),
    )
    plan.write()
    provenance = json.loads((plan.dest / "provenance.json").read_text(encoding="utf-8"))
    assert provenance["task_id"] == "private-sample"
    assert provenance["terminal_wrench_revision"] == "cafe"
    assert provenance["base_rewritten"] == "true"
    assert provenance["base_image_digest"] == _PY_DIGEST
    for field in (
        "grader_digest",
        "dockerfile_digest",
        "build_context_digest",
        "content_digest",
    ):
        assert len(provenance[field]) == 64  # sha256 hex


def test_planning_is_idempotent_per_pinned_source(tmp_path: Path) -> None:
    first = plan_env(
        discover_task(TW_TASKS, "public-sample"), tmp_path, public_build_assets=("seed.txt",)
    ).provenance[
        "content_digest"
    ]
    second = plan_env(
        discover_task(TW_TASKS, "public-sample"), tmp_path, public_build_assets=("seed.txt",)
    ).provenance[
        "content_digest"
    ]
    assert first == second


def test_write_rejects_mismatched_existing_provenance_without_overwrite(
    tmp_path: Path,
) -> None:
    plan = plan_env(
        discover_task(TW_TASKS, "public-sample"), tmp_path, public_build_assets=("seed.txt",)
    )
    plan.write()
    marker = plan.dest / "keep.txt"
    marker.write_text("unchanged", encoding="utf-8")
    (plan.dest / "provenance.json").write_text(
        json.dumps({"task_id": "other", "content_digest": "not-this-plan"}),
        encoding="utf-8",
    )

    with pytest.raises(ValueError):
        plan.write()
    assert marker.read_text(encoding="utf-8") == "unchanged"


def test_slug_normalizes_task_id() -> None:
    assert discover_task(TW_TASKS, "public-sample").slug() == "public-sample"


def test_plan_requires_explicit_public_build_asset_policy(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="reviewed public build-asset policy"):
        plan_env(discover_task(TW_TASKS, "public-sample"), tmp_path)


def test_plan_snapshots_allowed_inputs_and_rejects_unreviewed_or_symlinked_context(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source"
    original = source / "public-sample" / "claude-opus-4.6" / "original_task"
    context = original / "environment"
    tests = original / "tests"
    context.mkdir(parents=True)
    tests.mkdir()
    (context / "Dockerfile").write_text("FROM ubuntu:24.04\n", encoding="utf-8")
    (context / "public.txt").write_text("public", encoding="utf-8")
    (context / "alternate_reference.py").write_text("secret", encoding="utf-8")
    solution = original / "solution"
    solution.mkdir()
    (solution / "solve.sh").write_text("secret", encoding="utf-8")
    (tests / "test_outputs.py").write_text("def test_x(): pass\n", encoding="utf-8")
    task = discover_task(source, "public-sample", revision="r1")

    plan = plan_env(task, tmp_path / "out", public_build_assets=("public.txt",))
    assert "alternate_reference.py" not in plan.files
    assert plan.files["public.txt"] == b"public"

    outside = tmp_path / "outside.txt"
    outside.write_text("host-only", encoding="utf-8")
    (context / "escape.txt").symlink_to(outside)
    with pytest.raises(ValueError, match="symlink"):
        plan_env(task, tmp_path / "out", public_build_assets=("escape.txt",))
    (context / "solution-link.sh").symlink_to(solution / "solve.sh")
    with pytest.raises(ValueError, match="symlink"):
        plan_env(task, tmp_path / "out", public_build_assets=("solution-link.sh",))


def test_plan_freezes_source_bytes_and_rejects_destination_symlinks(tmp_path: Path) -> None:
    task = discover_task(TW_TASKS, "public-sample")
    plan = plan_env(task, tmp_path / "out", public_build_assets=("seed.txt",))
    original_grader = task.grader_path.read_bytes()
    task.grader_path.write_text("changed after plan", encoding="utf-8")
    try:
        env = plan.write()
        assert (env / "task_assets" / "test_outputs.py").read_bytes() == plan.files[
            "task_assets/test_outputs.py"
        ]
    finally:
        # Fixture sources are shared; restore the exact source snapshot.
        task.grader_path.write_bytes(original_grader)

    target = tmp_path / "redirect"
    target.mkdir()
    destination = tmp_path / "symlink-dest"
    destination.symlink_to(target, target_is_directory=True)
    symlink_plan = plan_env(task, destination.parent, public_build_assets=("seed.txt",))
    object.__setattr__(symlink_plan, "dest", destination)
    with pytest.raises(ValueError, match="symlink"):
        symlink_plan.write()

    nested = tmp_path / "nested"
    nested.mkdir()
    (nested / "out").symlink_to(target, target_is_directory=True)
    nested_plan = plan_env(task, nested / "out", public_build_assets=("seed.txt",))
    with pytest.raises(ValueError, match="symlink"):
        nested_plan.write()


def test_materialize_is_batch_atomic_on_later_plan_or_hud_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dest = tmp_path / "out"
    original_plan_env = __import__("chronos.qabench.materialize", fromlist=["plan_env"]).plan_env

    def broken_plan(*args: object, **kwargs: object) -> object:
        if args[0].task_id == "private-sample":
            raise OSError("source read failed")
        return original_plan_env(*args, **kwargs)

    monkeypatch.setattr("chronos.qabench.materialize.plan_env", broken_plan)
    with pytest.raises(OSError, match="source read failed"):
        materialize(
            TW_TASKS,
            ["public-sample", "private-sample"],
            dest,
            build_asset_policies={("public-sample", "r1"): ("seed.txt",), ("private-sample", "r1"): ()},
            revision="r1",
        )
    assert not dest.exists()

    monkeypatch.setattr("chronos.qabench.materialize.plan_env", original_plan_env)
    monkeypatch.setattr(
        "chronos.qabench.materialize.write_hud_env",
        lambda _env: (_ for _ in ()).throw(RuntimeError("HUD failed")),
    )
    with pytest.raises(RuntimeError, match="HUD failed"):
        materialize(
            TW_TASKS,
            ["public-sample"],
            dest,
            build_asset_policies={("public-sample", "r1"): ("seed.txt",)},
            revision="r1",
        )
    assert not dest.exists()
    assert not list(tmp_path.glob(".out.stage-*"))


def test_materialize_rejects_nonempty_or_symlinked_destination_root(tmp_path: Path) -> None:
    destination = tmp_path / "out"
    destination.mkdir()
    (destination / "keep").write_text("unchanged", encoding="utf-8")
    with pytest.raises(ValueError, match="non-empty"):
        materialize(TW_TASKS, ["public-sample"], destination)
    assert (destination / "keep").read_text(encoding="utf-8") == "unchanged"

    redirected = tmp_path / "redirected"
    redirected.mkdir()
    link = tmp_path / "link"
    link.symlink_to(redirected, target_is_directory=True)
    with pytest.raises(ValueError, match="symlink"):
        materialize(TW_TASKS, ["public-sample"], link)
