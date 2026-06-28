"""Assemble a self-contained Hugging Face *Static* Space from demo/ + results/.

The live demo is backend-free, so a HF Static Space is a drop-in: flatten the
assets to the Space root and point the data fetches at results/ (instead of
../results/). Produces space/site/ ready to upload.

    python space/build_space.py        # build into space/site/
"""

from __future__ import annotations

import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "space", "site")

SPACE_README = """\
---
title: FactoryCEO-TRM
emoji: 🏭
colorFrom: indigo
colorTo: gray
sdk: static
pinned: false
---

# FactoryCEO-TRM — demo

A verifiable RL/RFT environment for autonomous factory operation. The brain
decides, the verifier gates, the humanoid executes. Static, backend-free demo
generated from `run.py` artifacts. See the project repo for the full pipeline
(verifier + recursive TRM repair, HUD env, RULER reward, V-JEPA 2, Isaac bridge,
teacher→student distillation).
"""


def build() -> str:
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "results"))

    # flatten demo assets to root
    for name in ("index.html", "demo.css", "app.js"):
        shutil.copy(os.path.join(ROOT, "demo", name), os.path.join(OUT, name))

    # rewrite data paths: ../results/ -> results/
    app_path = os.path.join(OUT, "app.js")
    with open(app_path) as f:
        app = f.read()
    app = app.replace("../results/", "results/")
    with open(app_path, "w") as f:
        f.write(app)

    # copy the run artifacts the page fetches
    for name in ("run_30day.json", "isaac_tasks.json"):
        src = os.path.join(ROOT, "results", name)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(OUT, "results", name))

    with open(os.path.join(OUT, "README.md"), "w") as f:
        f.write(SPACE_README)
    return OUT


if __name__ == "__main__":
    out = build()
    print(f"built static Space at {os.path.relpath(out, ROOT)}/  "
          f"({', '.join(sorted(os.listdir(out)))})")
