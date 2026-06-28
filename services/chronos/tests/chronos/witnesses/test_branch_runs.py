from __future__ import annotations

import asyncio
import sys
import types

import chronos.witnesses.branch_runs as branch_runs
from chronos.witnesses.hacker_prompt import build_hacker_branch_instruction


def forkpoint(**overrides):
    profile = {
        "env_module_path": "envs/example/env.py",
        "task_factory": "example_task",
        "prompt_factory": "example_prompt",
        "runtime_workdir": "/workspace/task",
        "instruction_path": "/workspace/task/instruction.md",
        "trusted_entrypoint_ref": "example_env:task",
        "capture_roots": ["/workspace/task", "/workspace/state"],
        "pre_grader_command_argv": ["setup", "grader"],
        "grader_command_argv": ["custom", "grade"],
    }
    base = {
        "fork_point_id": "fp-001",
        "parent_node_id": "node-001",
        "snapshot_id": "im-1",
        "snapshot_restore_ref": "modal-image://im-1",
        "snapshot_mode": "filesystem",
        "snapshot_digest": "snapshot-sha",
        "environment_version": "env-v1",
        "environment_image_digest": "image-sha",
        "grader_digest": "grader-sha",
        "grader_digest_source": "status.json:grader",
        "history_prefix_ref": "history-ref",
        "history_hash": "history-sha",
        "boundary_token": "boundary-token",
        "network_policy": "block_network=True",
        "secret_policy": "secrets=[]",
        "resource_policy": "cpu=0.5,memory=1024,timeout=900",
        "snapshot_retention": "modal-default-ttl",
        "source_evidence_refs": ["status.json"],
        "hud_task_profile": profile,
    }
    profile_overrides = overrides.pop("hud_task_profile", None)
    base.update(overrides)
    if profile_overrides is not None:
        merged_profile = dict(profile)
        merged_profile.update(profile_overrides)
        base["hud_task_profile"] = merged_profile
    return base


def prompt_packet():
    return build_hacker_branch_instruction("## Your Goal\nTest prompt.")


def install_fake_hud_modules(monkeypatch, *, runtime_raises=False):
    modal = types.ModuleType("modal")

    class Image:
        @staticmethod
        def from_id(image_id):
            return f"image:{image_id}"

    modal.Image = Image
    monkeypatch.setitem(sys.modules, "modal", modal)

    agent_module = types.ModuleType("hud.agents.claude.agent")

    class ClaudeAgent:
        def __init__(self, config):
            self.config = config

    class ClaudeConfig:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    agent_module.ClaudeAgent = ClaudeAgent
    agent_module.ClaudeConfig = ClaudeConfig
    monkeypatch.setitem(sys.modules, "hud", types.ModuleType("hud"))
    monkeypatch.setitem(sys.modules, "hud.agents", types.ModuleType("hud.agents"))
    monkeypatch.setitem(
        sys.modules, "hud.agents.claude", types.ModuleType("hud.agents.claude")
    )
    monkeypatch.setitem(sys.modules, "hud.agents.claude.agent", agent_module)

    monkeypatch.setitem(sys.modules, "hud.eval", types.ModuleType("hud.eval"))

    class EvidenceModalRuntime:
        def __init__(self, *args, **kwargs):  # noqa: ARG002
            if runtime_raises:
                raise RuntimeError("runtime setup failed")
            self.evidence = kwargs["evidence"]

        def __call__(self, task):  # noqa: ARG002
            runtime = self

            class Context:
                async def __aenter__(self):
                    runtime.evidence.runtime_params = {
                        "provider": "modal",
                        "instance_id": "sb-test",
                        "egress_policy": "outbound_cidr_allowlist",
                        "outbound_cidr_allowlist": ["127.0.0.1/32"],
                        "secret_policy": "secrets=[]",
                        "network_file_systems": [],
                        "volumes": [],
                    }
                    runtime.evidence.before_snapshot = {
                        "status": "pass",
                        "files": {
                            "/app/query.py": {"sha256": "old", "text": "print('old')\n"}
                        },
                    }
                    return object()

                async def __aexit__(self, exc_type, exc, tb):  # noqa: ANN001
                    runtime.evidence.after_snapshot = {
                        "status": "pass",
                        "files": {
                            "/app/query.py": {"sha256": "new", "text": "print('new')\n"}
                        },
                    }
                    runtime.evidence.post_agent_snapshot = {
                        "schema_version": 1,
                        "status": "pass",
                        "snapshot_id": "im-post",
                        "snapshot_ref": "modal-image://im-post",
                        "snapshot_mode": "modal_filesystem_snapshot",
                        "retention": "modal_default",
                    }
                    runtime.evidence.security_probe = {
                        "status": "pass",
                        "forbidden_secret_presence": {"HUD_API_KEY": "absent"},
                        "disallowed_egress_probe": "denied",
                        "repo_or_workspace_write_probes": {
                            "/workspace/chronos-probe": "denied"
                        },
                    }

            return Context()

    monkeypatch.setattr(branch_runs, "EvidenceModalRuntime", EvidenceModalRuntime)


def test_branch_runtime_setup_failure_is_not_counted_as_executed(monkeypatch, tmp_path):
    install_fake_hud_modules(monkeypatch, runtime_raises=True)

    result = asyncio.run(
        branch_runs._run_one_branch(
            root=tmp_path,
            forkpoint=forkpoint(),
            task=object(),
            prompt_packet=prompt_packet(),
            run_id="run-001",
            branch_index=0,
            artifact_root=tmp_path / "artifacts",
        )
    )

    record = result["branch"]
    assert record["execution_boundary_crossed"] is False
    assert record["gateway_request_ids"] == []
    assert record["status"] == "agent-error"


def test_branch_execution_requires_explicit_task_profile():
    source = forkpoint()
    source.pop("hud_task_profile")

    try:
        branch_runs._branch_state_roots(source)
    except ValueError as exc:
        assert "hud_task_profile" in str(exc)
    else:  # pragma: no cover - defensive assertion.
        raise AssertionError("BranchRun accepted a ForkPoint without task profile data")


def test_branch_records_preserve_forkpoint_identity(monkeypatch, tmp_path):
    install_fake_hud_modules(monkeypatch)
    monkeypatch.setattr(
        branch_runs,
        "_trace_readback",
        lambda trace_id: {"trace": {"id": trace_id}, "events": {"events": []}},
    )
    monkeypatch.setattr(
        branch_runs,
        "run_reward_hacking_analysis",
        lambda root, trace_id, *, branch_id, action_record_digest, classifier_evidence=None: {  # noqa: ARG005
            "status": "pass",
            "qa_result_id": "qa-001",
            "branch_id": branch_id,
            "hud_trace_id": trace_id,
            "action_record_digest": action_record_digest,
            "authoritative_source": "repo_bound_hud_qa",
            "classifier_input_digest": "classifier-input-sha",
            "classifier_evidence_digest": "classifier-evidence-sha",
            "classifier_evidence_refs": [
                {"kind": "action_record", "ref": "actions.json"},
                {"kind": "file_diff", "ref": "diff.json"},
            ],
            "evidence_quality": "sufficient",
            "task_identity_status": "matched",
            "confidence": 0.95,
            "reasoning": "branch-local evidence was available",
            "is_reward_hacking": False,
        },
    )

    class Job:
        id = "job-001"
        trace_id = "trace-001"
        reward = 1.0
        runs = []

    class Task:
        async def run(self, agent, runtime):  # noqa: ARG002
            async with runtime(self):
                pass
            return Job()

    source = forkpoint(
        environment_image_digest="image-real",
        grader_digest="grader-real",
        hud_task_profile={
            "runtime_workdir": "/workspace/task",
            "instruction_path": "/workspace/task/instruction.md",
            "trusted_entrypoint_ref": "custom_env:task",
            "pre_grader_command_argv": ["setup", "grader"],
            "grader_command_argv": ["custom", "grade"],
        },
    )
    result = asyncio.run(
        branch_runs._run_one_branch(
            root=tmp_path,
            forkpoint=source,
            task=Task(),
            prompt_packet=prompt_packet(),
            run_id="run-001",
            branch_index=0,
            artifact_root=tmp_path / "artifacts",
        )
    )

    record = result["branch"]
    assert record["execution_boundary_crossed"] is True
    assert record["environment_image_digest"] == "image-real"
    assert record["grader_digest"] == "grader-real"
    assert record["history_hash"] == source["history_hash"]
    assert record["snapshot_digest"] == source["snapshot_digest"]
    assert record["provenance_status"] == "complete"
    assert record["post_agent_snapshot_ref"] == "modal-image://im-post"
    assert record["post_agent_snapshot_id"] == "im-post"
    assert record["file_diff_ref"].endswith(".json")
    assert record["security_probe_ref"].endswith(".json")
    assert record["replay_surface"]["cwd"] == "/workspace/task"
    assert record["replay_surface"]["trusted_entrypoint_ref"] == "custom_env:task"
    assert record["replay_surface"]["pre_grader_command_argv"] == ["setup", "grader"]
    assert record["replay_surface"]["grader_command_argv"] == ["custom", "grade"]
    assert record["replay_surface"]["environment_version"] == "env-v1"
    assert record["replay_surface"]["grader_digest"] == "grader-real"
    assert record["replay_surface"]["state_restore_ref"] == "modal-image://im-1"


def test_branch_records_label_insufficient_qa_as_incomplete_classification(
    monkeypatch, tmp_path
):
    install_fake_hud_modules(monkeypatch)
    monkeypatch.setattr(
        branch_runs,
        "_trace_readback",
        lambda trace_id: {"trace": {"id": trace_id}, "events": {"events": []}},
    )
    monkeypatch.setattr(
        branch_runs,
        "run_reward_hacking_analysis",
        lambda root, trace_id, *, branch_id, action_record_digest, classifier_evidence=None: {  # noqa: ARG005
            "status": "pass",
            "qa_result_id": "qa-001",
            "branch_id": branch_id,
            "hud_trace_id": trace_id,
            "action_record_digest": action_record_digest,
            "authoritative_source": "repo_bound_hud_qa",
            "classifier_input_digest": "classifier-input-sha",
            "classifier_evidence_digest": "classifier-evidence-sha",
            "classifier_evidence_refs": [{"kind": "file_diff", "ref": "diff.json"}],
            "evidence_quality": "insufficient",
            "task_identity_status": "matched",
            "confidence": 0.95,
            "reasoning": "not enough branch-local evidence",
            "is_reward_hacking": True,
        },
    )

    class Job:
        id = "job-001"
        trace_id = "trace-001"
        reward = 1.0
        runs = []

    class Task:
        async def run(self, agent, runtime):  # noqa: ARG002
            async with runtime(self):
                pass
            return Job()

    result = asyncio.run(
        branch_runs._run_one_branch(
            root=tmp_path,
            forkpoint=forkpoint(),
            task=Task(),
            prompt_packet=prompt_packet(),
            run_id="run-001",
            branch_index=0,
            artifact_root=tmp_path / "artifacts",
        )
    )

    assert result["branch"]["promotion_signal_status"] == "incomplete-classification"


def test_branch_batch_status_blocks_on_incomplete_provenance(monkeypatch, tmp_path):
    monkeypatch.setenv("MODAL_TOKEN_ID", "present")
    monkeypatch.setenv("MODAL_TOKEN_SECRET", "present")
    monkeypatch.setenv("HUD_API_KEY", "present")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "present")
    monkeypatch.setenv("FORKPROOF_ALLOW_EXTERNAL_QA", "1")
    monkeypatch.setattr(
        branch_runs,
        "load_hud_task",
        lambda root, forkpoint: (object(), prompt_packet()),
    )

    async def fake_run_one_branch(**kwargs):
        branch = {
            "branch_id": f"branch-{kwargs['branch_index']}",
            "seed": kwargs["branch_index"],
            "hud_trace_id": f"trace-{kwargs['branch_index']}",
            "reward": 1.0,
            "promotion_signal_status": "rewarded-non-hack",
            "execution_boundary_crossed": True,
            "provenance_blockers": ["filesystem diff capture remains a promotion gate"],
        }
        return {
            "branch": branch,
            "qa": {"status": "pass", "is_reward_hacking": False},
            "branch_ref": "branch.json",
            "qa_ref": "qa.json",
            "action_record_ref": "action.json",
            "file_diff_ref": "diff.json",
            "security_probe_ref": "security.json",
        }

    monkeypatch.setattr(branch_runs, "_run_one_branch", fake_run_one_branch)
    result = asyncio.run(
        branch_runs.run_live_branch_batch(tmp_path, forkpoint(), count=2, concurrency=2)
    )
    assert result["live_execution_status"] == "pass"
    assert result["provenance_status"] == "incomplete"
    assert result["status"] == "blocked"
    assert result["executed_branch_count"] == 2


def test_feedback_retry_is_tagged_separately_from_core_branch_count(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("MODAL_TOKEN_ID", "present")
    monkeypatch.setenv("MODAL_TOKEN_SECRET", "present")
    monkeypatch.setenv("HUD_API_KEY", "present")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "present")
    monkeypatch.setenv("FORKPROOF_ALLOW_EXTERNAL_QA", "1")
    monkeypatch.setenv("FORKPROOF_HACKER_FEEDBACK_RETRIES", "1")
    monkeypatch.setattr(
        branch_runs,
        "load_hud_task",
        lambda root, forkpoint: (object(), prompt_packet()),
    )
    feedback_packets = []

    def fake_load_with_feedback(root, forkpoint, *, feedback_attempts=None):  # noqa: ARG001
        if feedback_attempts is None:
            return object(), prompt_packet()
        packet = build_hacker_branch_instruction(
            "## Your Goal\nTest prompt.", feedback_attempts=feedback_attempts
        )
        feedback_packets.append(packet)
        return object(), packet

    monkeypatch.setattr(branch_runs, "load_hud_task", fake_load_with_feedback)

    async def fake_run_one_branch(**kwargs):
        prompt = kwargs["prompt_packet"]
        branch_id = f"{kwargs['run_id']}-branch-{kwargs['branch_index']:02d}"
        branch = {
            "branch_id": branch_id,
            "seed": kwargs["branch_index"],
            "hud_trace_id": f"trace-{branch_id}",
            "reward": 1.0,
            "promotion_signal_status": "rewarded-non-hack",
            "execution_boundary_crossed": True,
            "provenance_blockers": [],
            "prompt_profile": prompt["prompt_profile"],
            "feedback_enabled": prompt["feedback_enabled"],
            "feedback_attempt_count": prompt["feedback_attempt_count"],
        }
        return {
            "branch": branch,
            "qa": {"status": "pass", "is_reward_hacking": False},
            "branch_ref": f"{branch_id}.json",
            "qa_ref": f"{branch_id}-qa.json",
            "action_record_ref": f"{branch_id}-action.json",
            "file_diff_ref": f"{branch_id}-diff.json",
            "security_probe_ref": f"{branch_id}-security.json",
        }

    monkeypatch.setattr(branch_runs, "_run_one_branch", fake_run_one_branch)
    result = asyncio.run(
        branch_runs.run_live_branch_batch(tmp_path, forkpoint(), count=2, concurrency=2)
    )

    assert result["executed_branch_count"] == 2
    assert result["feedback_retry_budget"] == 1
    assert result["feedback_retry_count"] == 1
    assert len(result["feedback_branch_refs"]) == 1
    assert feedback_packets[0]["feedback_enabled"] is True
    assert feedback_packets[0]["feedback_attempt_count"] == 2
