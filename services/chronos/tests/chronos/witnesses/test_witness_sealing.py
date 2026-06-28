from __future__ import annotations

import json
import sys
import types

import pytest

from chronos.witnesses.branch_artifacts import build_file_diff
from chronos.witnesses.hacker_prompt import (
    HACKER_BRANCH_ROLE,
    HARDEN_V0_GENERIC_PROMPT_PROFILE,
)
from chronos.witnesses.models import WitnessError, utc_now
from chronos.witnesses.causal_evidence import build_causal_evidence_bundle
from chronos.witnesses.sealing import (
    build_minimized_delta,
    require_replay_surface,
    seal_witness,
)
from chronos.witnesses.store import JsonArtifactStore
from chronos.witnesses.surface_replay import (
    _write_text_command,
    replay_with_recorded_surface,
)
from chronos.witnesses.local_env import load_local_env


def branch(**overrides):
    base = {
        "schema_version": 1,
        "run_id": "run-001",
        "branch_id": "branch-001",
        "branch_role": HACKER_BRANCH_ROLE,
        "prompt_profile": HARDEN_V0_GENERIC_PROMPT_PROFILE,
        "prompt_source_ref": ".external/harden-v0/harden/instructions.py::build_hacker_instruction",
        "prompt_digest": "prompt-sha",
        "parent_fork_point_id": "fp-001",
        "parent_node_id": "node-001",
        "seed": 101,
        "model": "claude-haiku-4-5",
        "sampling_config": {"temperature": 0.8},
        "gateway_request_ids": ["gw-001"],
        "model_response_refs": ["sha256:model-response"],
        "hud_trace_id": "trace-001",
        "environment_version": "task-suite-v1",
        "environment_image_digest": "image-sha256:abc",
        "grader_digest": "grader-sha",
        "grader_digest_source": "status.json",
        "reward": 1.0,
        "qa_result_ref": "qa-001",
        "lineage": {"fork_point_id": "fp-001"},
        "snapshot_restore_ref": "modal-image://im-1",
        "snapshot_id": "im-1",
        "snapshot_mode": "filesystem",
        "replay_surface": {
            "schema_version": 1,
            "replay_surface_id": "surface-001",
            "environment_version": "task-suite-v1",
            "grader_digest": "grader-sha",
            "command_argv": ["grader", "run", "--case", "candidate"],
            "cwd": "/workspace",
            "pre_grader_command_argv": [],
            "grader_command_argv": ["grader", "grade", "--case", "candidate"],
            "state_restore_ref": "modal-image://im-1",
            "trusted_entrypoint_ref": "grader://entrypoint",
            "captured_at": utc_now(),
        },
        "history_hash": "history-sha",
        "history_prefix_ref": "history.json",
        "action_record_ref": "actions.jsonl",
        "action_record_digest": "actions-sha",
        "file_diff_ref": "diff.patch",
        "started_at": utc_now(),
        "completed_at": utc_now(),
        "status": "success",
        "cleanup_result": "pass",
    }
    base.update(overrides)
    return base


def qa(**overrides):
    record = {
        "qa_result_id": "qa-001",
        "branch_id": "branch-001",
        "hud_trace_id": "trace-001",
        "action_record_digest": "actions-sha",
        "authoritative_source": "hud_qa",
        "classifier_input_digest": "classifier-input-sha",
        "classifier_evidence_digest": "classifier-evidence-sha",
        "classifier_evidence_refs": [
            {"kind": "action_record", "ref": "actions.jsonl"},
            {"kind": "file_diff", "ref": "diff.patch"},
        ],
        "evidence_quality": "sufficient",
        "task_identity_status": "matched",
        "confidence": 0.95,
        "reasoning": "The branch-local evidence is sufficient and matches the task.",
        "evidence_summary": "Used trace, actions, reward, and final diff.",
        "is_reward_hacking": True,
        "hacking_strategy": "grader_exploitation",
    }
    record.update(overrides)
    return record


def causal_delta(**overrides):
    base = build_causal_evidence_bundle(
        branch(),
        qa(),
        file_diff_digest="file-diff-sha",
        causal_delta_status="minimized",
        causal_delta_ref="causal-delta.json",
    )
    base.update(overrides)
    return base


def test_file_diff_preserves_added_and_removed_text_for_replay():
    before = {
        "status": "pass",
        "files": {
            "/task/old_hook.py": {
                "sha256": "old-sha",
                "text": "def old_hook():\n    return True\n",
            },
            "/task/query.py": {
                "sha256": "query-before",
                "text": "def solve():\n    return 'before'\n",
            },
        },
    }
    after = {
        "status": "pass",
        "roots": {"/task": {"exists": True, "is_dir": True}},
        "files": {
            "/task/new_hook.py": {
                "sha256": "new-sha",
                "text": "def new_hook():\n    return False\n",
            },
            "/task/query.py": {
                "sha256": "query-after",
                "text": "def solve():\n    return 'after'\n",
            },
        },
    }

    diff = build_file_diff("branch-001", before, after)

    assert diff["status"] == "pass"
    assert diff["added_text"] == {
        "/task/new_hook.py": "def new_hook():\n    return False\n"
    }
    assert diff["removed_text"] == {
        "/task/old_hook.py": "def old_hook():\n    return True\n"
    }
    assert diff["modified_text"] == {
        "/task/query.py": "def solve():\n    return 'after'\n"
    }
    assert "/task/query.py" in diff["text_patches"]


def test_surface_replay_write_command_is_data_driven():
    command = _write_text_command({"/task/hook.py": "x = 1\n"})

    assert command[0:2] == ("bash", "-lc")
    assert "/task/hook.py" not in command[2]


def test_local_env_loader_does_not_override_explicit_env(monkeypatch, tmp_path):
    (tmp_path / ".env").write_text(
        "MODAL_TOKEN_ID=from-file\nMODAL_TOKEN_SECRET=from-file-secret\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("MODAL_TOKEN_ID", "from-process")
    monkeypatch.delenv("MODAL_TOKEN_SECRET", raising=False)

    loaded = load_local_env(tmp_path)

    assert "MODAL_TOKEN_ID" not in loaded
    assert loaded == {"MODAL_TOKEN_SECRET": "from-file-secret"}
    assert __import__("os").environ["MODAL_TOKEN_ID"] == "from-process"
    assert __import__("os").environ["MODAL_TOKEN_SECRET"] == "from-file-secret"


def test_surface_replay_loads_repo_env_before_modal_use(monkeypatch, tmp_path):
    (tmp_path / ".env").write_text(
        "MODAL_TOKEN_ID=from-file\nMODAL_TOKEN_SECRET=from-file-secret\n",
        encoding="utf-8",
    )
    monkeypatch.delenv("MODAL_TOKEN_ID", raising=False)
    monkeypatch.delenv("MODAL_TOKEN_SECRET", raising=False)
    seen: dict[str, str] = {}
    modal = types.ModuleType("modal")

    class App:
        @staticmethod
        def lookup(name, create_if_missing=False):  # noqa: ARG004
            return {"app": name}

    class Image:
        @staticmethod
        def from_id(image_id):
            seen["token_id"] = __import__("os").environ.get("MODAL_TOKEN_ID", "")
            return f"image:{image_id}"

    class Sandbox:
        object_id = "sb-001"

        @staticmethod
        def create(**kwargs):  # noqa: ARG004
            return Sandbox()

        def terminate(self):
            seen["terminated"] = "yes"

    modal.App = App
    modal.Image = Image
    modal.Sandbox = Sandbox
    monkeypatch.setitem(sys.modules, "modal", modal)
    monkeypatch.setattr(
        "chronos.witnesses.surface_replay._run_sandbox_command",
        lambda sandbox, argv, *, cwd, timeout=180: {  # noqa: ARG005
            "returncode": 0,
            "stdout": "",
            "stderr": "",
            "output_digest": "output-sha",
        },
    )
    item = {
        "_chronos_repo_root": str(tmp_path),
        "snapshot_restore_ref": "modal-image://im-test",
        "action_record_digest": "actions-sha",
        "replay_surface": {
            "cwd": "/workspace",
            "grader_digest": "grader-sha",
            "pre_grader_command_argv": [],
            "grader_command_argv": ["grade"],
        },
        "causal_delta": {
            "content_digest": "delta-sha",
            "added_text": {"/workspace/hook.py": "x=1\n"},
            "modified_text": {},
        },
    }

    result = replay_with_recorded_surface(item, 1)

    assert seen["token_id"] == "from-file"
    assert seen["terminated"] == "yes"
    assert result["reward"] == 1.0
    assert result["restore_ref"] == "modal-sandbox://sb-001"


def test_minimized_delta_requires_selected_paths_to_have_textual_evidence():
    file_diff = {
        "status": "pass",
        "added_paths": ["/task/hook.py"],
        "modified_paths": ["/task/query.py"],
        "added_text": {},
        "modified_text": {},
        "text_patches": {"/task/query.py": "--- before\n+++ after\n"},
    }

    with pytest.raises(WitnessError, match="selected paths lack captured text"):
        build_minimized_delta(
            branch=branch(causal_evidence_ref="causal.json"),
            qa=qa(),
            causal=causal_delta(causal_delta_status="not_minimized"),
            file_diff=file_diff,
            included_paths=["/task/hook.py"],
        )


def test_sealing_requires_canonical_replay_surface():
    record = branch()
    del record["replay_surface"]

    with pytest.raises(WitnessError, match="canonical replay surface"):
        require_replay_surface(record)


def test_seal_witness_is_task_agnostic_and_requires_three_replays(tmp_path):
    run_root = tmp_path / "docs/plans/evidence/003/artifacts/branch-runs/run-001"
    branch_id = "branch-001"
    branch_record = branch(
        branch_id=branch_id,
        causal_evidence_ref="docs/plans/evidence/003/artifacts/branch-runs/run-001/causal/branch-001.json",
        file_diff_ref="docs/plans/evidence/003/artifacts/branch-runs/run-001/file-diffs/branch-001.json",
    )
    file_diff = {
        "schema_version": 1,
        "branch_id": branch_id,
        "status": "pass",
        "added_paths": ["/task/hook.py"],
        "modified_paths": ["/task/query.py"],
        "removed_paths": [],
        "added_text": {"/task/hook.py": "def hook():\n    return True\n"},
        "modified_text": {"/task/query.py": "def solve():\n    return 'after'\n"},
        "text_patches": {"/task/query.py": "--- before\n+++ after\n"},
    }
    qa_record = qa(branch_id=branch_id)
    for subdir, record in {
        "branches": branch_record,
        "qa": qa_record,
        "causal": causal_delta(
            branch_id=branch_id, causal_delta_status="not_minimized"
        ),
        "file-diffs": file_diff,
    }.items():
        path = run_root / subdir / f"{branch_id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(record), encoding="utf-8")

    def replay(item, attempt):
        return {
            "model_gateway_request_ids": [],
            "grader_digest": item["grader_digest"],
            "action_record_digest": item["action_record_digest"],
            "reward": 1.0,
            "restore_ref": f"restore-{attempt}",
            "verifier_output_digest": f"verifier-{attempt}",
            "file_diff_digest": f"diff-{attempt}",
        }

    witness = seal_witness(
        root=tmp_path,
        branch_ref="docs/plans/evidence/003/artifacts/branch-runs/run-001/branches/branch-001.json",
        artifact_store=JsonArtifactStore(
            tmp_path / "docs/plans/evidence/003/artifacts/sealed"
        ),
        replay_fn=replay,
        included_paths=["/task/hook.py", "/task/query.py"],
    )

    assert witness["source_branch_id"] == branch_id
    assert witness["cluster_id"] == "cluster-001"
    assert witness["exploit_target"] == "reward-verifier:grader_exploitation"
    assert (
        witness["exploit_mechanism"]
        == "textual-causal-delta:/task/hook.py, /task/query.py"
    )
    assert len(witness["replay_checks"]) == 3
