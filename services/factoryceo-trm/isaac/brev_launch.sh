#!/usr/bin/env bash
# Run the FactoryCEO-TRM humanoid on Isaac Sim via a Brev GPU instance.
# Isaac Sim needs an NVIDIA RTX GPU (no macOS build), so we run it on Brev.
# Requires the brev CLI + your Brev login. Costs GPU-hours while the box is up.
set -euo pipefail

# 1. Install + auth the Brev CLI (once):
#    brew install brevdev/tap/brev    # or: curl -fsSL https://brev.dev/install.sh | sh
#    brev login

# 2. Spin up a GPU box with an Isaac Sim container (Brev has NVIDIA templates):
brev create factoryceo-isaac --gpu a10g \
  --container nvcr.io/nvidia/isaac-sim:4.2.0

# 3. Generate the verified humanoid task queue locally, then copy it + the
#    consumer up to the box:
#    ./.venv/bin/python isaac/plan_to_isaac.py      # -> results/isaac_tasks.json
brev cp results/isaac_tasks.json factoryceo-isaac:/workspace/results/isaac_tasks.json
brev cp isaac/factory_humanoid_task.py factoryceo-isaac:/workspace/factory_humanoid_task.py

# 4. Run headless on the box with Isaac Lab's python (registers
#    Isaac-FactoryHumanoid-v0, steps the humanoid through the queue, renders frames):
brev shell factoryceo-isaac -- \
  "cd /workspace && ./python.sh factory_humanoid_task.py"

# 5. Score the rollout frames with V-JEPA 2 (src/jepa.py) -> execution reward,
#    fed back via src/closed_loop.py (Executor interface).

# 6. Stop billing when done:
brev stop factoryceo-isaac
