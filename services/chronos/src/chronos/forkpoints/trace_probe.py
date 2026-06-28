"""Fetch and redact the accepted HUD trace for Plan 002 boundary evidence."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .core import digest_json, load_source_trace

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs" / "plans" / "evidence" / "002" / "artifacts"


def _load_remote_events(trace_id: str) -> list[dict[str, Any]]:
    from hud.utils.platform import PlatformClient

    data = PlatformClient.from_settings().get(f"/trace/{trace_id}/events")
    if isinstance(data, dict) and isinstance(data.get("events"), list):
        return data["events"]
    if isinstance(data, list):
        return data
    return []


def _redact_event(event: dict[str, Any]) -> dict[str, Any]:
    redacted = {
        key: event.get(key)
        for key in (
            "seq",
            "kind",
            "id",
            "parent_id",
            "name",
            "tool_name",
            "method",
            "started_at",
            "ended_at",
        )
        if key in event
    }
    for key in (
        "text",
        "reasoning",
        "arguments",
        "result",
        "result_text",
        "tool_calls",
    ):
        if key in event:
            redacted[f"{key}_len"] = len(str(event[key]))
            redacted[f"{key}_sha256"] = digest_json(event[key])
    if event.get("error"):
        redacted["error_present"] = True
        redacted["error_sha256"] = digest_json(event["error"])
    return redacted


def fetch_trace_summary() -> dict[str, Any]:
    source = load_source_trace(ROOT / "docs" / "plans" / "repo-map" / "STATUS.json")
    events = _load_remote_events(source["hud_trace_id"])
    if not events:
        raise RuntimeError("HUD trace export returned no events")
    redacted = [_redact_event(event) for event in events]
    final_event = redacted[-1]
    last_tool = next(
        (event for event in reversed(redacted) if event.get("kind") == "tool_call"),
        None,
    )
    summary = {
        "status": "trace-export-pass",
        "hud_trace_id": source["hud_trace_id"],
        "hud_job_id": source["hud_job_id"],
        "environment_id": source["environment_id"],
        "environment_version": source["environment_version"],
        "trace_kind": source["trace_kind"],
        "reward": source["reward"],
        "event_count": len(events),
        "raw_events_sha256": digest_json(events),
        "redacted_events_sha256": digest_json(redacted),
        "selected_boundary": {
            "boundary_kind": "final-scenario-evaluate",
            "event": final_event,
            "last_tool_event": last_tool,
            "rationale": "Latest checked-in source trace exposes final evaluation after the agent's completed action stream; no live executable sandbox remains attached to this historical boundary.",
        },
        "redacted_tail": redacted[-12:],
    }
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    path = EVIDENCE / "trace-boundary-summary.json"
    path.write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return summary


def main() -> int:
    summary = fetch_trace_summary()
    print(
        "PASS trace-boundary-summary "
        f"events={summary['event_count']} raw_sha256={summary['raw_events_sha256']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
