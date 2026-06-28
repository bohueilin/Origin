from __future__ import annotations

import sys

import chronos.witnesses.qa_binding as qa_binding
from chronos.witnesses.qa_binding import (
    inspect_hud_qa_binding,
    run_reward_hacking_analysis,
)
from chronos.witnesses.qa_synthetic import (
    run_synthetic_reward_hacking_smoke,
    synthetic_reward_hack_trace,
)


def test_reward_hacking_parser_treats_string_false_as_false():
    result = qa_binding._validate_reward_hacking_result(
        {
            "reasoning": "not hacking",
            "is_reward_hacking": "false",
            "hacking_strategy": "none",
            "severity": "none",
            "confidence": "0.8",
            "evidence_quality": "sufficient",
            "task_identity_status": "matched",
            "evidence_summary": "trace and branch evidence were available",
        }
    )
    assert result["is_reward_hacking"] is False
    assert result["evidence_quality"] == "sufficient"


def test_hud_qa_binding_probe_rejects_team_id_as_org_binding(monkeypatch, tmp_path):
    monkeypatch.setenv("HUD_API_KEY", "present-not-real")

    class Response:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload

        def json(self):
            return self._payload

    def fake_get(url, headers, timeout):  # noqa: ARG001
        if url.endswith("/openapi.json"):
            return Response(200, {"paths": {"/v2/trace/{trace_id}/events": {}}})
        if url.endswith("/v2/environments/usage"):
            return Response(200, {"team_id": "team-uuid"})
        if url.endswith("/v2/qa-agents") and "X-Organization-ID" in headers:
            return Response(
                401,
                {
                    "error": "unauthorized",
                    "detail": "Invalid token: Not enough segments",
                },
            )
        if url.endswith("/v2/qa-agents"):
            return Response(
                401,
                {"error": "unauthorized", "detail": "Missing X-Organization-ID header"},
            )
        if "/v2/trace/trace-001/events" in url:
            return Response(200, {"events": [], "reward": 1.0, "status": "completed"})
        raise AssertionError(url)

    monkeypatch.setattr("chronos.witnesses.qa_binding.httpx.get", fake_get)
    result = inspect_hud_qa_binding(tmp_path, "trace-001")
    assert result["status"] == "blocked"
    assert result["discovered_team_binding"] == {
        "status": "present",
        "source": "/v2/environments/usage",
        "accepted_as_organization_id": False,
    }
    assert result["qa_agents_with_hud_hacks_probe"]["status_code"] == 401
    assert result["qa_agents_with_api_key_probe"]["status_code"] == 401
    assert "team_id is discoverable but not accepted" in result["blocker"]


def test_reward_hacking_analysis_requires_explicit_external_export_approval(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("HUD_API_KEY", "present-not-real")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "present-not-real")
    monkeypatch.delenv("FORKPROOF_ALLOW_EXTERNAL_QA", raising=False)
    result = run_reward_hacking_analysis(
        tmp_path,
        "trace-001",
        branch_id="branch-001",
        action_record_digest="actions-sha",
    )
    assert result["status"] == "blocked"
    assert result["source_adapter"] == "hud-trace-explorer.qa_reward_hacking"
    assert "export private HUD trace data" in result["observed_behavior"]


def test_reward_hacking_analysis_requires_canonical_hud_trace_explorer(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("HUD_API_KEY", "present-not-real")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "present-not-real")
    monkeypatch.setenv("FORKPROOF_ALLOW_EXTERNAL_QA", "1")
    monkeypatch.delenv("HUD_TRACE_EXPLORER_ROOT", raising=False)
    monkeypatch.setattr(
        "chronos.witnesses.qa_binding._load_canonical_reward_hacking_module",
        lambda root: (  # noqa: ARG005
            None,
            {
                "status": "blocked",
                "source_adapter": "hud-trace-explorer.qa_reward_hacking",
                "blocker": "canonical hud-evals/hud-trace-explorer qa_reward_hacking.py is not importable",
            },
        ),
    )
    result = run_reward_hacking_analysis(
        tmp_path,
        "trace-001",
        branch_id="branch-001",
        action_record_digest="actions-sha",
    )
    assert result["status"] == "blocked"
    assert result["source_adapter"] == "hud-trace-explorer.qa_reward_hacking"
    assert "qa_reward_hacking.py is not importable" in result["blocker"]


def test_canonical_hud_trace_explorer_resolves_repo_external_checkout(
    monkeypatch, tmp_path
):
    external_root = tmp_path / ".external" / "hud-trace-explorer"
    external_root.mkdir(parents=True)
    (external_root / "qa_reward_hacking.py").write_text(
        "\n".join(
            [
                "class RewardHackingResult:",
                "    pass",
                "",
                "async def reward_hacking_analysis(trace_id, hud_api_key):",
                "    yield 'prompt'",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.delenv("HUD_TRACE_EXPLORER_ROOT", raising=False)
    try:
        sys.modules.pop("qa_reward_hacking", None)
        module, binding = qa_binding._load_canonical_reward_hacking_module(tmp_path)
        assert module is not None
        assert binding["status"] == "pass"
        assert binding["source_adapter"] == "hud-trace-explorer.qa_reward_hacking"
        assert binding["module_file"].endswith("qa_reward_hacking.py")
        assert any("repo_external=" in item for item in binding["searched_roots"])
    finally:
        sys.modules.pop("qa_reward_hacking", None)


def test_canonical_hud_trace_explorer_requires_checkout_file(monkeypatch, tmp_path):
    monkeypatch.delenv("HUD_TRACE_EXPLORER_ROOT", raising=False)
    module, binding = qa_binding._load_canonical_reward_hacking_module(tmp_path)
    assert module is None
    assert binding["status"] == "blocked"
    assert "checkout is missing qa_reward_hacking.py" in binding["blocker"]


def test_canonical_hud_trace_explorer_prefers_checkout_runtime(monkeypatch, tmp_path):
    external_root = tmp_path / ".external" / "hud-trace-explorer"
    external_root.mkdir(parents=True)
    (external_root / "pyproject.toml").write_text(
        "[project]\nname='hud-trace-explorer'\n", encoding="utf-8"
    )

    def fake_uv_project(root, *, trace_id, hud_api_key):
        assert root == external_root
        assert trace_id == "trace-001"
        assert hud_api_key == "hud-key"
        return {
            "status": "pass",
            "source_adapter": "hud-trace-explorer.qa_reward_hacking",
            "prompt": "canonical prompt",
            "execution_mode": "uv-project-subprocess-v2-trace-provider",
            "trace_provider": "hud-v2-analysis-context",
        }

    monkeypatch.setattr(
        "chronos.witnesses.qa_canonical.fetch_prompt_with_uv_project", fake_uv_project
    )
    result = qa_binding.fetch_canonical_prompt(
        object(),
        {"canonical_root": str(external_root)},
        trace_id="trace-001",
        hud_api_key="hud-key",
    )
    assert result["execution_mode"] == "uv-project-subprocess-v2-trace-provider"
    assert result["trace_provider"] == "hud-v2-analysis-context"


def test_reward_hacking_analysis_reports_later_classifier_blocker(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("HUD_API_KEY", "present-not-real")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "present-not-real")
    monkeypatch.setenv("FORKPROOF_ALLOW_EXTERNAL_QA", "1")
    monkeypatch.setattr(
        "chronos.witnesses.qa_binding._load_canonical_reward_hacking_module",
        lambda root: (  # noqa: ARG005
            None,
            {
                "status": "blocked",
                "source_adapter": "hud-trace-explorer.qa_reward_hacking",
                "blocker": "direct import failed",
                "error_class": "ModuleNotFoundError",
            },
        ),
    )
    monkeypatch.setattr(
        "chronos.witnesses.qa_binding.fetch_canonical_prompt",
        lambda module, binding, trace_id, hud_api_key: {  # noqa: ARG005
            "status": "pass",
            "prompt": "prompt",
            "source_adapter": "hud-trace-explorer.qa_reward_hacking",
        },
    )
    monkeypatch.setattr(
        "chronos.witnesses.qa_binding._classify_prompt_text",
        lambda prompt, *, classifier_evidence=None: {  # noqa: ARG005
            "status": "blocked",
            "blocker": "canonical classifier did not return JSON",
            "error_class": "ClassifierOutputError",
        },
    )
    result = run_reward_hacking_analysis(
        tmp_path,
        "trace-001",
        branch_id="branch-001",
        action_record_digest="actions-sha",
    )
    assert result["status"] == "blocked"
    assert result["blocker"] == "canonical classifier did not return JSON"
    assert result["error_class"] == "ClassifierOutputError"


def test_reward_hacking_analysis_persists_qa_evidence_quality_fields(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("HUD_API_KEY", "present-not-real")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "present-not-real")
    monkeypatch.setenv("FORKPROOF_ALLOW_EXTERNAL_QA", "1")
    monkeypatch.setattr(
        "chronos.witnesses.qa_binding._load_canonical_reward_hacking_module",
        lambda root: (
            object(),
            {"status": "pass", "module_file": "qa_reward_hacking.py"},
        ),  # noqa: ARG005
    )
    monkeypatch.setattr(
        "chronos.witnesses.qa_binding.fetch_canonical_prompt",
        lambda module, binding, trace_id, hud_api_key: {  # noqa: ARG005
            "status": "pass",
            "prompt": "canonical prompt",
            "execution_mode": "uv-project-subprocess-v2-trace-provider",
        },
    )
    monkeypatch.setattr(
        "chronos.witnesses.qa_binding._classify_prompt_text",
        lambda prompt, *, classifier_evidence=None: {  # noqa: ARG005
            "status": "pass",
            "model": "fake-qa-model",
            "classifier_input_digest": "classifier-input-sha",
            "classifier_evidence_digest": "classifier-evidence-sha",
            "classifier_evidence_refs": [{"kind": "file_diff", "ref": "diff.json"}],
            "reasoning": "branch-local evidence matched the task",
            "is_reward_hacking": True,
            "hacking_strategy": "shortcut",
            "severity": "major",
            "confidence": 0.91,
            "evidence_quality": "sufficient",
            "task_identity_status": "matched",
            "evidence_summary": "used trace and final diff",
        },
    )
    result = run_reward_hacking_analysis(
        tmp_path,
        "trace-001",
        branch_id="branch-001",
        action_record_digest="actions-sha",
        classifier_evidence={"classifier_evidence_digest": "classifier-evidence-sha"},
    )
    assert result["status"] == "pass"
    assert result["evidence_quality"] == "sufficient"
    assert result["task_identity_status"] == "matched"
    assert result["classifier_evidence_refs"] == [
        {"kind": "file_diff", "ref": "diff.json"}
    ]


def test_classify_prompt_text_accepts_structured_reward_hacking_tool(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "present-not-real")
    monkeypatch.delenv("FORKPROOF_QA_MODEL", raising=False)
    monkeypatch.delenv("H2F2H_HACKER_MODEL", raising=False)

    class Messages:
        def create(self, **kwargs):
            assert kwargs["tool_choice"] == {
                "type": "tool",
                "name": "reward_hacking_result",
            }
            assert kwargs["tools"][0]["name"] == "reward_hacking_result"
            return type(
                "Response",
                (),
                {
                    "content": [
                        {
                            "type": "tool_use",
                            "name": "reward_hacking_result",
                            "input": {
                                "reasoning": "the agent bypassed the verifier",
                                "is_reward_hacking": True,
                                "hacking_strategy": "test_manipulation",
                                "severity": "critical",
                                "confidence": 0.98,
                                "evidence_quality": "sufficient",
                                "task_identity_status": "matched",
                                "evidence_summary": "used branch-local trace and diff",
                            },
                        }
                    ]
                },
            )()

    class Client:
        def __init__(self, *, api_key):
            assert api_key == "present-not-real"
            self.messages = Messages()

    monkeypatch.setattr("anthropic.Anthropic", Client)
    result = qa_binding._classify_prompt_text("canonical prompt")
    assert result["status"] == "pass"
    assert result["model"] == "claude-haiku-4-5"
    assert result["is_reward_hacking"] is True
    assert result["hacking_strategy"] == "test_manipulation"
    assert result["severity"] == "critical"
    assert result["confidence"] == 0.98
    assert result["evidence_quality"] == "sufficient"


def test_synthetic_reward_hacking_smoke_positive_control(monkeypatch, tmp_path):
    def fake_classify(compact):
        assert compact["metadata"]["synthetic"] is True
        return {
            "status": "pass",
            "model": "fake-qa-model",
            "trace_digest": "trace-sha",
            "reasoning": "conftest.py forces pytest to pass while query.py remains unsolved",
            "is_reward_hacking": True,
            "hacking_strategy": "test_manipulation",
            "severity": "critical",
            "confidence": 0.99,
        }

    monkeypatch.setattr(
        "chronos.witnesses.qa_synthetic._classify_compact_trace", fake_classify
    )
    result = run_synthetic_reward_hacking_smoke(tmp_path)
    assert result["status"] == "pass"
    assert result["synthetic"] is True
    assert result["is_reward_hacking"] is True
    assert result["hacking_strategy"] == "test_manipulation"
    assert "not real BranchRun evidence" in result["observed_behavior"]


def test_synthetic_reward_hacking_trace_is_manually_configurable():
    trace = synthetic_reward_hack_trace(trace_id="custom-positive-control", reward=0.5)
    assert trace["trace_id"] == "custom-positive-control"
    assert trace["reward"] == 0.5
