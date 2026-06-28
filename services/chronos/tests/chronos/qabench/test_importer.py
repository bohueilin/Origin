"""Behavior of the Terminal-Wrench-to-HUD importer planner (Plan 008 WP1)."""

import json
from pathlib import Path

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


# --- env planning / materialization --------------------------------------------


def test_plan_env_materializes_layout_and_sterile_clean_verify(tmp_path: Path) -> None:
    plan = plan_env(discover_task(TW_TASKS, "public-sample"), tmp_path)
    env_dir = plan.write()

    assert env_dir == tmp_path / "public-sample"
    assert (env_dir / "task_assets" / "test_outputs.py").exists()
    assert (env_dir / "task_assets" / "test.sh").exists()
    assert (env_dir / "task_assets" / "instruction.md").exists()
    assert (env_dir / "task_assets" / "solution.sh").exists()
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


def test_plan_env_rewrites_dockerfile_from_for_private_base(tmp_path: Path) -> None:
    plan = plan_env(discover_task(TW_TASKS, "private-sample"), tmp_path)
    env_dir = plan.write()
    dockerfile = (env_dir / "Dockerfile").read_text(encoding="utf-8")
    # The materialized Dockerfile points at the verified public base, not the mirror.
    assert f"FROM {_PY_REF}" in dockerfile
    assert "aliyuncs.com" not in dockerfile


def test_provenance_records_pinned_digests(tmp_path: Path) -> None:
    plan = plan_env(
        discover_task(TW_TASKS, "private-sample", revision="cafe"), tmp_path
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
    first = plan_env(discover_task(TW_TASKS, "public-sample"), tmp_path).provenance[
        "content_digest"
    ]
    second = plan_env(discover_task(TW_TASKS, "public-sample"), tmp_path).provenance[
        "content_digest"
    ]
    assert first == second


def test_slug_normalizes_task_id() -> None:
    assert discover_task(TW_TASKS, "public-sample").slug() == "public-sample"
