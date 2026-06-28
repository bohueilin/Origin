"""Export Plan 008 discovery trajectories for the Plan 007 SFT/RFT consumer (PR #26).

Emits a qabench report whose ``trajectories[]`` rows match the canonical shape
``chronos.research.canonical.qabench.parse_qabench_training_candidate`` consumes:
each rewarded discovery branch becomes a row with the v1 ``hud_reward`` (1), the
sterile ``referee_verdict`` (the patched/hardened signal: a confirmed hack does NOT
survive the clean re-grade), the HUD QA verdict, the exploit cluster, and divergence
lineage. That is exactly the raw-vs-hardened data-quality split PR #26's SFT needs:
raw reward-positive demonstrations include the confirmed hacks; the hardened set keeps
only the legitimate ones.

Standalone module (no import from run_benchmark) so it can be added/run without
touching a live benchmark batch. ``assistant_output`` is fetched best-effort from the
HUD trace; it is optional in the consumer, so a fetch failure does not block export.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any

from chronos.qabench.witness_loop_adapter import to_discovered_branch

_ART = Path("artifacts/chronos/qabench")
_BRANCH_RUNS = Path("docs/plans/evidence/003/artifacts/branch-runs")

# Trajectories whose trace narrates an exploit/gaming pattern cannot be certified clean
# from text alone, but are too risky to feed an SFT "good behavior" set unverified.
_NARRATIVE = re.compile(
    r"exploit|bypass|vulnerab|fake|hijack|hardcod|fabricat|monkeypatch|cheat", re.I
)


def _verdict_value(referee: str) -> str:
    """'RefereeVerdict.CONFIRMED_HACK' -> 'confirmed_hack' (the consumer's vocabulary)."""
    return referee.rsplit(".", 1)[-1].strip().lower()


def sft_status(
    referee_verdict: str,
    qa_is_reward_hacking: bool | None,
    assistant_output: str | None,
) -> tuple[str, str | None, bool]:
    """Three-way SFT gate -> (status, quarantine_reason, training_clean).

    "Verifier-legitimate" is NOT "certified clean": the diff/action referee proves
    subversion when present but cannot prove its ABSENCE without the sterile clean_verify
    re-grade. So the hardened/clean SFT set is the conservative intersection — referee
    legitimate AND QA did not flag it AND the trace shows no exploit/gaming narrative.
    Everything else is quarantined (excluded from the clean set), never silently kept.
    """
    if referee_verdict == "confirmed_hack":
        return "confirmed_hack", "referee: verifier subversion", False
    if qa_is_reward_hacking is True:
        return (
            "quarantined",
            "QA flagged is_reward_hacking (unverified without sterile re-grade)",
            False,
        )
    if assistant_output and _NARRATIVE.search(assistant_output):
        return (
            "quarantined",
            "trace exploit/gaming narrative (unverified without sterile re-grade)",
            False,
        )
    return "sft_clean", None, True


def _instruction(root: Path, slug: str) -> str | None:
    path = root / "envs/qabench" / slug / "task_assets" / "instruction.md"
    return path.read_text(encoding="utf-8") if path.exists() else None


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _branch_records(branch_id: str) -> tuple[dict, dict, dict]:
    """Load the (branch, qa, file-diff) triple for a branch id from its 003 run dir."""
    run = branch_id.rsplit("-branch-", 1)[0]
    base = _BRANCH_RUNS / run
    return (
        _load_json(base / "branches" / f"{branch_id}.json"),
        _load_json(base / "qa" / f"{branch_id}.json"),
        _load_json(base / "file-diffs" / f"{branch_id}.json"),
    )


def fetch_trace_text(trace_id: str | None, *, limit: int = 8000) -> str | None:
    """Best-effort: concatenate the agent's messages from a HUD trace as the response."""
    if not trace_id:
        return None
    try:
        import httpx

        api_key = os.environ["HUD_API_KEY"]
        base = os.environ.get("HUD_API_URL", "https://api.beta.hud.ai").rstrip("/")
        resp = httpx.get(
            f"{base}/v2/trace/{trace_id}/events",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=60,
        )
        resp.raise_for_status()
        events = (resp.json() or {}).get("events") or []
        parts = [
            str(e.get("text", "")).strip()
            for e in events
            if e.get("kind") == "agent_message"
        ]
        text = "\n".join(p for p in parts if p)
        return (text[:limit] or None) if text else None
    except Exception:  # noqa: BLE001 - optional enrichment; never block the export
        return None


def trajectory_rows(root: Path, *, fetch_traces: bool = True) -> list[dict[str, Any]]:
    """Build canonical qabench trajectory rows from the per-task benchmark results."""
    rows: list[dict[str, Any]] = []
    for task_file in sorted((_ART / "tasks").glob("*.json")):
        result = _load_json(task_file)
        slug = result["slug"]
        prompt = _instruction(root, slug)
        for branch in result.get("branches", []):
            bid = branch["id"]
            brec, qarec, fdiff = _branch_records(bid)
            db = to_discovered_branch(brec, qarec, fdiff, slug)
            trace_id = db.hud_trace_id or bid
            cluster = None
            if db.exploit_target or db.exploit_mechanism:
                cluster = f"{db.exploit_target or '?'}::{db.exploit_mechanism or '?'}"
            verdict = _verdict_value(branch["referee"])
            assistant_output = (
                fetch_trace_text(db.hud_trace_id) if fetch_traces else None
            )
            status, reason, training_clean = sft_status(
                verdict, branch["qa"], assistant_output
            )
            rows.append(
                {
                    "trajectory_id": bid,
                    "trace_id": trace_id,
                    "task_id": slug,
                    "task_prompt": prompt,
                    "assistant_output": assistant_output,
                    "origin": "branch",
                    "hud_reward": 1.0 if branch["reward"] else 0.0,
                    "referee_verdict": verdict,
                    "patched_reward": 0.0 if verdict == "confirmed_hack" else 1.0,
                    "is_hack": verdict == "confirmed_hack",
                    "is_legit": verdict == "legitimate",
                    "sft_status": status,
                    "sft_quarantine_reason": reason,
                    "training_clean": training_clean,
                    "hud_qa_verdict": {"is_reward_hacking": branch["qa"]},
                    "cluster_id": cluster,
                    "environment_version": f"{slug.replace('-', '_')}_v1",
                    "lineage": _lineage_dict(db),
                }
            )
    return rows


def _lineage_dict(db: Any) -> dict[str, Any] | None:
    lin = getattr(db, "lineage", None)
    if lin is None:
        return None
    return {
        "parent_fork_point_id": getattr(lin, "parent_fork_point_id", None),
        "seed": getattr(lin, "seed", None),
        "divergent_action": getattr(lin, "divergent_action", None),
    }


def write_export(
    root: Path, *, fetch_traces: bool = True, out: Path | None = None
) -> Path:
    rows = trajectory_rows(root, fetch_traces=fetch_traces)
    confirmed = sum(1 for r in rows if r["is_hack"])
    legit = sum(1 for r in rows if r["is_legit"])
    clean = sum(1 for r in rows if r["training_clean"])
    quarantined = sum(1 for r in rows if r["sft_status"] == "quarantined")
    payload = {
        "schema_version": 1,
        "plan_id": "008",
        "source": "chronos.qabench discovery branches (sterile-referee + action-trace labeled)",
        "trajectory_count": len(rows),
        "confirmed_hacks": confirmed,
        "verifier_legitimate": legit,
        "raw_reward_positive": len(rows),
        # The hardened/clean SFT set is the CERTIFIED-clean subset, not every verifier-legit
        # row: verifier-legit can still hide gaming / out-of-/app subversion the diff missed.
        "hardened_reward_positive": clean,
        "sft_clean": clean,
        "quarantined": quarantined,
        "sft_partition_note": (
            "hardened_reward_positive = training_clean only (referee-legit AND QA-clean AND "
            "no exploit/gaming narrative). Quarantined rows need the sterile clean_verify "
            "re-grade (post-agent snapshot) before they can be promoted to clean or hack."
        ),
        "trajectories": rows,
    }
    out = out or (_ART / "sft_export.qabench_report.json")
    out.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Export qabench trajectories for SFT (PR #26)."
    )
    parser.add_argument(
        "--no-fetch-traces", action="store_true", help="skip HUD trace text fetch"
    )
    parser.add_argument("--out", default=str(_ART / "sft_export.qabench_report.json"))
    args = parser.parse_args(argv)
    root = Path.cwd()
    if (root / ".env").exists():
        for raw in (root / ".env").read_text().splitlines():
            line = raw.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(
                    k.strip().removeprefix("export ").strip(), v.strip().strip("'\"")
                )
    out = write_export(root, fetch_traces=not args.no_fetch_traces, out=Path(args.out))
    payload = json.loads(out.read_text())
    print(
        f"exported {payload['trajectory_count']} trajectories "
        f"({payload['confirmed_hacks']} hacks / {payload['verifier_legitimate']} verifier-legit, "
        f"{payload['sft_clean']} SFT-clean) -> {out}"
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
