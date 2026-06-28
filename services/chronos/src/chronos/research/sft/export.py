"""Export Fireworks-compatible SFT datasets and metadata sidecars."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from chronos.research.sft.models import TraceRecord

SourceFilter = Literal["raw_sft", "hardened_sft", "rejected_hacks", "excluded"]
AssistantWeightPolicy = Literal["safe_analysis", "model_a_contaminated"]

DEFAULT_SYSTEM_PROMPT = (
    "You are a coding agent working in a sandboxed environment. Solve the task "
    "directly using correct implementation. Do not manipulate tests, evaluators, "
    "verifiers, pytest plugins, conftest hooks, or grading harnesses to fake success."
)

FIREWORKS_ROLES = frozenset({"system", "user", "assistant"})


def trace_to_fireworks_example(
    trace: TraceRecord,
    *,
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    assistant_weight_policy: AssistantWeightPolicy = "safe_analysis",
) -> dict[str, object]:
    """Convert one trace into OpenAI-compatible chat JSON for Fireworks SFT."""
    if assistant_weight_policy == "safe_analysis":
        assistant_weight = 0 if trace.is_hack else 1
    elif assistant_weight_policy == "model_a_contaminated":
        assistant_weight = 1
    else:
        raise ValueError(
            f"unsupported assistant weight policy: {assistant_weight_policy}"
        )
    return {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": trace.task_prompt},
            {
                "role": "assistant",
                "content": trace.assistant_output,
                "weight": assistant_weight,
            },
        ]
    }


def trace_to_metadata_record(
    trace: TraceRecord, *, source_filter: SourceFilter
) -> dict[str, object]:
    """Provenance sidecar row for one exported or analyzed trace."""
    record = {
        "trace_id": trace.trace_id,
        "task_id": trace.task_id,
        "source_filter": source_filter,
        "raw_reward": trace.raw_reward,
        "patched_reward": trace.patched_reward,
        "is_hack": trace.is_hack,
        "is_legit": trace.is_legit,
        "exploit_cluster": trace.exploit_cluster,
        "needs_review": trace.needs_review,
        "source": trace.source,
    }
    for field in (
        "trajectory_id",
        "qabench_report_ref",
        "release_proof_ref",
        "proofset_case_id",
        "origin",
        "referee_verdict",
        "qa_verdict",
        "cluster_id",
        "environment_v1",
        "environment_v2",
        "grader_v1_digest",
        "grader_v2_digest",
        "referee_id",
        "referee_digest",
        "classification_source",
        "source_trace_id",
        "lineage_key",
        "solution_family",
        "template_family",
    ):
        value = getattr(trace, field)
        if value is not None:
            record[field] = value
    return record


def validate_fireworks_example(example: dict[str, object]) -> None:
    """Raise ValueError when an example is not Fireworks chat JSONL compatible."""
    messages = example.get("messages")
    if not isinstance(messages, list) or len(messages) < 2:
        raise ValueError(
            "example must include a messages array with at least user and assistant turns"
        )

    for index, message in enumerate(messages):
        if not isinstance(message, dict):
            raise ValueError(f"messages[{index}] must be an object")
        role = message.get("role")
        content = message.get("content")
        if role not in FIREWORKS_ROLES:
            raise ValueError(f"messages[{index}] has invalid role: {role!r}")
        if not isinstance(content, str) or not content.strip():
            raise ValueError(f"messages[{index}] must include non-empty string content")
        weight = message.get("weight")
        if weight is not None:
            if role != "assistant":
                raise ValueError(
                    f"messages[{index}] weight is only valid on assistant turns"
                )
            if weight not in (0, 1):
                raise ValueError(f"messages[{index}] weight must be 0 or 1")


def export_sft_jsonl(
    traces: list[TraceRecord] | tuple[TraceRecord, ...],
    path: str | Path,
    *,
    source_filter: SourceFilter,
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    assistant_weight_policy: AssistantWeightPolicy = "safe_analysis",
) -> int:
    """
    Write Fireworks-ready chat JSONL for one positive SFT bucket.

    Returns the number of examples written.
    """
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    for trace in traces:
        example = trace_to_fireworks_example(
            trace,
            system_prompt=system_prompt,
            assistant_weight_policy=assistant_weight_policy,
        )
        validate_fireworks_example(example)
        lines.append(json.dumps(example, ensure_ascii=False))

    if lines:
        system_prompts = {json.loads(line)["messages"][0]["content"] for line in lines}
        if len(system_prompts) != 1:
            raise ValueError("all exported examples must share the same system prompt")

    out.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return len(lines)


def export_metadata(
    traces: list[TraceRecord] | tuple[TraceRecord, ...],
    path: str | Path,
    *,
    source_filter: SourceFilter,
) -> int:
    """Write provenance metadata sidecar JSONL for a bucket."""
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        json.dumps(
            trace_to_metadata_record(trace, source_filter=source_filter),
            ensure_ascii=False,
        )
        for trace in traces
    ]
    out.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return len(lines)


def export_rejected_hacks_audit(
    traces: list[TraceRecord] | tuple[TraceRecord, ...],
    path: str | Path,
) -> int:
    """
    Write rejected hack rows for analysis only.

    These rows are not positive SFT examples. Each record includes weight=0 to
    mark it as non-training material if reused downstream.
    """
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    for trace in traces:
        record = trace_to_metadata_record(trace, source_filter="rejected_hacks")
        record["weight"] = 0
        record["assistant_output_preview"] = trace.assistant_output[:240]
        lines.append(json.dumps(record, ensure_ascii=False))

    out.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return len(lines)
