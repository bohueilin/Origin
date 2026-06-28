from __future__ import annotations

import json
from pathlib import Path

import pytest

from chronos.forkpoints.core import (
    ForkPointError,
    ForkPointStore,
    InMemorySnapshotProvider,
    boundary_token,
    capture_forkpoint,
    environment_source_digest,
    load_source_trace,
    restore_forkpoint,
)
from chronos.forkpoints.replay_probe import QUERY_STUB, _setup_command


def source(tmp_path: Path) -> dict:
    status = {
        "live_trace": {
            "env_id": "env-1",
            "env_name": "mongodb_sales_aggregation_engine_v1",
            "job_id": "job-1",
            "trace_id": "trace-1",
            "reward": 1.0,
            "kind": "legitimate-solve",
            "grader_digest_sha256": "abc123",
        }
    }
    path = tmp_path / "STATUS.json"
    path.write_text(json.dumps(status), encoding="utf-8")
    return load_source_trace(path)


def history() -> list[dict[str, str]]:
    return [{"role": "assistant", "content": "action completed"}]


def state() -> dict[str, str]:
    return {"task_state_root": "/state", "probe": "after-action"}


def capture(tmp_path: Path):
    provider = InMemorySnapshotProvider()
    src = source(tmp_path)
    record = capture_forkpoint(
        source=src,
        hud_step_id="step-1",
        history_prefix=history(),
        task_state=state(),
        snapshot_mode="filesystem",
        provider=provider,
        store=ForkPointStore(tmp_path / "store"),
    )
    return src, provider, record


def test_valid_capture_has_required_fields(tmp_path: Path):
    _src, _provider, record = capture(tmp_path)
    for field in (
        "schema_version",
        "fork_point_id",
        "hud_trace_id",
        "hud_step_id",
        "task_id",
        "environment_version",
        "history_hash",
        "history_prefix_ref",
        "snapshot_id",
        "snapshot_mode",
        "snapshot_digest",
        "grader_digest",
        "fork_reason",
        "created_at",
        "content_digest",
        "source_evidence_refs",
    ):
        assert record[field]


def test_valid_restore_returns_branch_handoff(tmp_path: Path):
    src, provider, record = capture(tmp_path)
    handoff = restore_forkpoint(
        record=record,
        provider=provider,
        expected_boundary_token=boundary_token(src, "step-1"),
        history_prefix=history(),
        grader_digest=src["grader_digest"],
    )
    assert handoff["fork_point_id"] == record["fork_point_id"]
    assert handoff["task_visible_probe"]["probe"] == "after-action"


def test_boundary_mismatch_rejects_without_handoff(tmp_path: Path):
    src, provider, record = capture(tmp_path)
    with pytest.raises(ForkPointError) as err:
        restore_forkpoint(
            record=record,
            provider=provider,
            expected_boundary_token=boundary_token(src, "wrong-step"),
            history_prefix=history(),
            grader_digest=src["grader_digest"],
        )
    assert err.value.error_class == "boundary_mismatch"


def test_history_mismatch_rejects_without_handoff(tmp_path: Path):
    src, provider, record = capture(tmp_path)
    with pytest.raises(ForkPointError) as err:
        restore_forkpoint(
            record=record,
            provider=provider,
            expected_boundary_token=boundary_token(src, "step-1"),
            history_prefix=[{"role": "assistant", "content": "different"}],
            grader_digest=src["grader_digest"],
        )
    assert err.value.error_class == "history_mismatch"


def test_grader_mismatch_rejects_without_handoff(tmp_path: Path):
    src, provider, record = capture(tmp_path)
    with pytest.raises(ForkPointError) as err:
        restore_forkpoint(
            record=record,
            provider=provider,
            expected_boundary_token=boundary_token(src, "step-1"),
            history_prefix=history(),
            grader_digest="different",
        )
    assert err.value.error_class == "grader_mismatch"


def test_unsupported_snapshot_mode_rejects_on_restore(tmp_path: Path):
    _src, provider, record = capture(tmp_path)
    record["snapshot_mode"] = "memory"
    with pytest.raises(ForkPointError) as err:
        restore_forkpoint(
            record=record,
            provider=provider,
            expected_boundary_token=record["boundary_token"],
            history_prefix=history(),
            grader_digest=record["grader_digest"],
        )
    assert err.value.error_class == "state_restore_failed"


def test_partial_capture_cleans_provider_snapshot(tmp_path: Path):
    provider = InMemorySnapshotProvider()
    src = source(tmp_path)
    store = ForkPointStore(tmp_path / "store")
    capture_forkpoint(
        source=src,
        hud_step_id="step-1",
        history_prefix=history(),
        task_state=state(),
        snapshot_mode="filesystem",
        provider=provider,
        store=store,
    )
    with pytest.raises(ForkPointError):
        capture_forkpoint(
            source=src,
            hud_step_id="step-1",
            history_prefix=history(),
            task_state=state(),
            snapshot_mode="filesystem",
            provider=provider,
            store=store,
        )
    assert provider.cleaned


def test_finalized_record_is_immutable(tmp_path: Path):
    _src, _provider, record = capture(tmp_path)
    store = ForkPointStore(tmp_path / "store")
    with pytest.raises(ForkPointError):
        store.put(record)


def test_capture_returns_store_verified_record(tmp_path: Path):
    provider = InMemorySnapshotProvider()
    src = source(tmp_path)
    store = ForkPointStore(tmp_path / "store")
    record = capture_forkpoint(
        source=src,
        hud_step_id="step-1",
        history_prefix=history(),
        task_state=state(),
        snapshot_mode="filesystem",
        provider=provider,
        store=store,
    )
    stored = store.get(record["fork_point_id"])

    assert record == stored


def test_store_rejects_tampered_finalized_record(tmp_path: Path):
    provider = InMemorySnapshotProvider()
    src = source(tmp_path)
    store = ForkPointStore(tmp_path / "store")
    record = capture_forkpoint(
        source=src,
        hud_step_id="step-1",
        history_prefix=history(),
        task_state=state(),
        snapshot_mode="filesystem",
        provider=provider,
        store=store,
    )
    path = store.root / f"{record['fork_point_id']}.json"
    tampered = json.loads(path.read_text(encoding="utf-8"))
    tampered["grader_digest"] = "tampered"
    path.write_text(json.dumps(tampered), encoding="utf-8")

    with pytest.raises(ForkPointError) as err:
        store.get(record["fork_point_id"])
    assert err.value.error_class == "state_restore_failed"


def test_environment_source_digest_covers_copied_task_assets(tmp_path: Path):
    env_root = tmp_path / "envs" / "mongodb-sales-aggregation-engine"
    for path in (
        env_root / ".hud" / "config.json",
        env_root / "Dockerfile.hud",
        env_root / "env.py",
        env_root / "pyproject.toml",
        env_root / "tasks.py",
        env_root / "uv.lock",
        env_root / "task_assets" / "init_data.py",
        env_root / "task_assets" / "instruction.md",
        env_root / "task_assets" / "orders.json",
        env_root / "task_assets" / "products.json",
        env_root / "task_assets" / "reference_solution.sh",
        env_root / "task_assets" / "test_outputs.py",
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(path.name, encoding="utf-8")

    before = environment_source_digest(tmp_path)
    (env_root / "task_assets" / "reference_solution.sh").write_text(
        "changed", encoding="utf-8"
    )

    assert environment_source_digest(tmp_path) != before


def test_trace_replay_setup_writes_query_stub_without_indentation():
    command = _setup_command()
    heredoc = command.split("cat > /app/query.py <<'PY'\n", 1)[1].split("\nPY\n", 1)[0]

    assert heredoc + "\n" == QUERY_STUB
    assert heredoc.startswith('"""Implement SalesAnalyzer here')
    assert "mkdir -p /app/task_assets /data/db /var/log /protected" in command
    assert (
        "cp /app/task_assets/orders.json /app/task_assets/products.json /protected/"
        in command
    )
