#!/usr/bin/env python3
"""Warm-start the repair student from Fireworks SYNTH records.

This is the dependency-free distillation path used before HUD GRPO. It consumes
one or more SYNTH jsonl corpora (as produced by ``gen_floor_synth.py``) and emits
two artifacts:

  * ``trm.json`` -- a compact JSON repair-policy checkpoint (error type -> best
    repair op), learned from the verified ``synthetic_reasoning`` traces. This is
    the same checkpoint format the live API trains and that ``hud_trm_agent``'s
    ``JsonRepairPolicy`` loads as a fallback when torch is unavailable.
  * ``gemma_sft.jsonl`` -- a chat-SFT file (system/user/assistant) that a Gemma or
    Fireworks fine-tune job would consume after operator approval. No paid job is
    launched here.

The parsing logic mirrors ``api.py`` (``_train_trm_json`` / ``_write_gemma_sft``)
so the offline corpus and the live pipeline stay schema-compatible.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def _iter_records(paths: list[Path]):
    for p in paths:
        if not p.exists():
            continue
        with p.open() as f:
            for line in f:
                line = line.strip()
                if line:
                    yield json.loads(line)


def train_trm_json(records: list[dict], out_dir: Path) -> dict:
    """Learn a compact repair policy from verified SYNTH traces."""
    action_counts: dict[str, int] = {}
    by_error: dict[str, dict[str, int]] = {}
    n_examples = 0
    for ep in records:
        errors = ep.get("verifier_before",
                         ep.get("verifier", {}).get("before", {})).get("errors", [])
        for step in ep.get("repair_trace", ep.get("synthetic_reasoning", [])):
            op = step.get("repair_action", {}).get("op", "noop")
            action_counts[op] = action_counts.get(op, 0) + 1
            n_examples += 1
            key = errors[0].get("type", "no_error") if errors else "no_error"
            bucket = by_error.setdefault(key, {})
            bucket[op] = bucket.get(op, 0) + 1
            errors = step.get("errors_after", [])
    policy = {
        err: max(counts.items(), key=lambda kv: kv[1])[0]
        for err, counts in by_error.items()
    }
    default_op = max(action_counts.items(), key=lambda kv: kv[1])[0] if action_counts else "noop"
    correct = sum(max(counts.values()) for counts in by_error.values())
    train_acc = (correct / n_examples) if n_examples else 0.0
    out_dir.mkdir(parents=True, exist_ok=True)
    ckpt = {
        "kind": "json_repair_policy",
        "default_op": default_op,
        "policy": policy,
        "action_counts": action_counts,
    }
    (out_dir / "trm.json").write_text(json.dumps(ckpt, indent=2))
    return {
        "checkpoint": str(out_dir / "trm.json"),
        "n_examples": n_examples,
        "n_error_types": len(by_error),
        "train_acc": round(train_acc, 4),
        "default_op": default_op,
        "policy_size": len(policy),
    }


def write_gemma_sft(records: list[dict], out_path: Path) -> int:
    """Build a chat-SFT artifact from verified traces."""
    rows = 0
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as dst:
        for ep in records:
            prompt = (ep.get("observation", {}).get("messy_prompt")
                      or ep.get("query", {}).get("messy_prompt", ""))
            repair_trace = ep.get("repair_trace", ep.get("synthetic_reasoning", []))
            final_plan = ep.get("final_plan", ep.get("synthetic_answer", {}))
            messages = [
                {"role": "system", "content": "You are ShiftBench. Produce verifier-safe factory and warehouse operating actions."},
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": json.dumps({
                    "repair_trace": repair_trace,
                    "final_plan": final_plan,
                }, separators=(",", ":"))},
            ]
            dst.write(json.dumps({"messages": messages}) + "\n")
            rows += 1
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--synth", action="append", default=[],
                    help="One or more SYNTH jsonl corpora (repeatable).")
    ap.add_argument("--trm-out", default="results/trm_floor",
                    help="Directory to write trm.json.")
    ap.add_argument("--gemma-out", default="results/gemma_sft_floor.jsonl",
                    help="Path to write the Gemma chat-SFT file.")
    args = ap.parse_args()

    paths = [Path(p) for p in (args.synth or ["results/floor_synth.jsonl"])]
    records = list(_iter_records(paths))
    if not records:
        print("No SYNTH records found in:", [str(p) for p in paths])
        return 1

    # Keep only verifier-grounded records when the flag is present.
    grounded = [r for r in records if r.get("verifier", {}).get("grounded", True)]
    use = grounded or records

    trm = train_trm_json(use, Path(args.trm_out))
    n_sft = write_gemma_sft(use, Path(args.gemma_out))

    summary = {
        "corpora": [str(p) for p in paths],
        "records_total": len(records),
        "records_grounded": len(grounded),
        "records_used": len(use),
        "trm": trm,
        "gemma_sft_rows": n_sft,
        "gemma_sft_path": args.gemma_out,
    }
    print(json.dumps(summary, indent=2))
    (Path(args.trm_out) / "train_summary.json").write_text(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
