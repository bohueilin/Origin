#!/usr/bin/env bash
# Gemma student fine-tune on Fireworks (the LLM-student baseline; the TRM is the
# small student). The chat-format dataset is ALREADY uploaded and READY:
#   accounts/ajinkyamulay123-alo9/datasets/factoryceo-trm-sft  (2885 examples)
#
# NOTE: on Fireworks only gemma-4-31b-it is LoRA-tunable (the small Gemmas report
# supportsLoraTunable=false), so this trains a 31B LoRA — a real paid job. Run
# when you've OK'd the spend. To rebuild+reupload the dataset first:
#   ./.venv/bin/python distill/train_trm.py            # -> distill/sft_pairs.jsonl (chat msgs)
#   firectl dataset create factoryceo-trm-sft distill/sft_pairs.jsonl
set -euo pipefail
ACCT=accounts/ajinkyamulay123-alo9

# --- option A: firectl (brew install fw-ai/firectl/firectl) -------------------
firectl sftj create \
  --base-model accounts/fireworks/models/gemma-4-31b-it \
  --dataset factoryceo-trm-sft \
  --output-model factoryceo-trm-gemma \
  --lora-rank 8 --epochs 1
# monitor:  firectl sftj list ;  firectl model list
# deploy:   firectl deployment create factoryceo-trm-gemma   (dedicated; 31B not serverless)

# --- option B: raw REST (no firectl) -----------------------------------------
# curl -s -X POST "https://api.fireworks.ai/v1/$ACCT/supervisedFineTuningJobs" \
#   -H "Authorization: Bearer $FIREWORKS_API_KEY" -H "Content-Type: application/json" \
#   -d '{"baseModel":"accounts/fireworks/models/gemma-4-31b-it",
#        "dataset":"'"$ACCT"'/datasets/factoryceo-trm-sft",
#        "outputModel":"'"$ACCT"'/models/factoryceo-trm-gemma","loraRank":8,"epochs":1}'
