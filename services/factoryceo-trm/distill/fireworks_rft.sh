#!/usr/bin/env bash
# Full RL run on Fireworks (Reinforcement Fine-Tuning) for the ShiftBench gateway.
#
# Why Fireworks RFT instead of the local HUD/Tinker GRPO: the Tinker optim_step
# kept 400-ing ("invalid value") and runs on our box; Fireworks RFT is managed (no
# GPU/RL infra), and is FREE for base models under 16B params. The reward is our
# own symbolic verifier (distill/fireworks_rft_evaluator.py) — no LLM judge, no
# labels — and the prompts are the 360 curated golden-hard tasks.
#
# Reward space = SHAPED (coverage-gated): on a golden task greedy~0.94 vs empty {}
# ~0.08, so the model cannot reward-hack with an empty plan. Strict stays the final
# held-out eval.
#
# Prereqs (run once):
#   .venv-hud/bin/pip install "fireworks-ai[reward-kit]"
#   brew install fw-ai/firectl/firectl        # or: https://docs.fireworks.ai/tools-sdks/firectl
#   export FIREWORKS_API_KEY=...              # already in factoryceo_trm/.env
set -euo pipefail
cd "$(dirname "$0")/.."

ACCT="${FIREWORKS_ACCOUNT:-accounts/ajinkyamulay123-alo9}"
# Sub-16B => RFT is free. Qwen ~4-8B matches our current HUD head (Qwen3 4B).
BASE_MODEL="${BASE_MODEL:-accounts/fireworks/models/qwen2p5-7b-instruct}"
DATASET_NAME="${DATASET_NAME:-shiftbench-golden-hard}"
EVALUATOR_ID="${EVALUATOR_ID:-shiftbench-verifier}"
OUTPUT_MODEL="${OUTPUT_MODEL:-shiftbench-gateway-rft}"
DATA_FILE="results/rft_golden_dataset.jsonl"

echo "[rft] base=$BASE_MODEL  dataset=$DATASET_NAME ($(wc -l < "$DATA_FILE") rows)  evaluator=$EVALUATOR_ID"

# 1) Upload the prompt dataset (360 golden-hard tasks).
firectl create dataset "$DATASET_NAME" "$DATA_FILE"

# 2) Deploy the evaluator (our verifier). The Build SDK bundles src/ + distill/ and
#    the @reward_function in distill/fireworks_rft_evaluator.py. If your firectl
#    version uses a different evaluator-create verb, see:
#    https://docs.fireworks.ai/tools-sdks/python-client/developing-evaluators
firectl create evaluator "$EVALUATOR_ID" \
  --huggingface-readme "ShiftBench symbolic verifier (shaped reward)" \
  --requirements "pydantic" \
  --code distill/fireworks_rft_evaluator.py || \
  echo "[rft] evaluator create skipped/failed — deploy via Build SDK eval-protocol if needed"

# 3) Launch the reinforcement fine-tuning job.
firectl reinforcement-fine-tuning-job create \
  --base-model "$BASE_MODEL" \
  --dataset "$DATASET_NAME" \
  --evaluator "$ACCT/evaluators/$EVALUATOR_ID" \
  --output-model "$OUTPUT_MODEL" \
  --epochs 2 \
  --learning-rate 0.0001

echo "[rft] submitted. monitor: firectl list reinforcement-fine-tuning-jobs"
echo "[rft] deploy when done: firectl create deployment $OUTPUT_MODEL"
