"""LoRA-oriented training hints derived from exported SFT bucket size."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# From Thinking Machines "LoRA Without Regret" (2025-09): post-training small-data
# regime; all-layer LoRA; ~10× full-FT LR; LoRA more sensitive to large batches.
LORA_BLOG_REFERENCE = "https://thinkingmachines.ai/blog/lora/"

FIREWORKS_PREVIEW_LORA_BLOCKER = (
    "Fireworks preview qwen3-8b-128k rejects LORA_TRAINER on the Training API; "
    "managed SFT may still train adapters. Re-test --lora-rank when the training "
    "shape supports LoRA."
)


def _recommended_lora_rank(example_count: int) -> int:
    """Pick a conservative rank for small post-training datasets."""
    if example_count <= 10:
        return 16
    if example_count <= 100:
        return 32
    return 64


def _recommended_batch_size_max(example_count: int) -> int:
    """Cap batch size; LoRA degrades more than full FT at large batch."""
    if example_count <= 1:
        return 1
    return min(4, example_count)


def build_training_recommendations(*, hardened_example_count: int) -> dict[str, Any]:
    """
    Build Fireworks/HUD launch hints from the hardened SFT export size.

    Counts recompute on every pipeline run (mock or real Chronos export).
    """
    lora_rank = _recommended_lora_rank(hardened_example_count)
    batch_size_max = _recommended_batch_size_max(hardened_example_count)

    return {
        "regime": "post_training_small_data",
        "source_reference": LORA_BLOG_REFERENCE,
        "hardened_example_count": hardened_example_count,
        "sft": {
            "method": "lora_all_layers",
            "lora_target": "all_layers",
            "lora_rank": lora_rank,
            "batch_size_max": batch_size_max,
            "epochs": 1,
            "learning_rate_multiplier_vs_full_ft": 10,
            "example_full_ft_learning_rate": 1e-5,
            "example_lora_learning_rate": 1e-4,
            "notes": (
                "Prefer Fireworks managed SFT on hardened_verifier_sft.jsonl. "
                "Do not use attention-only LoRA."
            ),
        },
        "rft": {
            "method": "lora_all_layers",
            "lora_target": "all_layers",
            "lora_rank": min(lora_rank, 16),
            "batch_size_max": batch_size_max,
            "learning_rate_multiplier_vs_full_ft": 10,
            "example_full_ft_learning_rate": 1e-5,
            "example_lora_learning_rate": 1e-4,
            "notes": (
                "RL/RFT needs very low adapter capacity; rank 1–16 often matches full FT."
            ),
        },
        "platform_blocker": FIREWORKS_PREVIEW_LORA_BLOCKER,
    }


def export_training_recommendations(
    path: str | Path,
    *,
    hardened_example_count: int,
) -> dict[str, Any]:
    """Write training_recommendations.json and return the payload."""
    payload = build_training_recommendations(
        hardened_example_count=hardened_example_count
    )
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload
