"""Modal wrapper for the Target-B fine-tune — train both arms on an A100, no local GPU.

  modal run src/cobra/train/modal_app.py \
      --arm-naive runs/sft_arm_naive.jsonl --arm-hardened runs/sft_arm_hardened.jsonl

Each arm becomes a LoRA adapter in the 'cobra-adapters' Modal volume. After training, eval
each on the held-out split with train.eval.held_out_eval(train.finetune.hf_policy(adapter), ...)
to produce the two-model gap (⑤).

This is the gated gamble — run it deliberately, not live on stage. The Modal API moves fast;
adjust the image / gpu / local-source line to your account + modal version if needed.
"""

import modal

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("torch", "transformers", "peft", "trl", "datasets", "accelerate")
    .add_local_python_source("cobra")  # makes cobra.train.finetune importable in the container
)
app = modal.App("cobra-finetune", image=image)
adapters = modal.Volume.from_name("cobra-adapters", create_if_missing=True)


@app.function(gpu="A100", timeout=3600, volumes={"/adapters": adapters})
def train(arm_name: str, rows: list[dict], epochs: int = 2) -> str:
    """LoRA-SFT one arm inside the GPU container; persist the adapter to the volume."""
    import json
    import tempfile

    from cobra.train.finetune import train_arm

    with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
        arm_path = f.name

    out = f"/adapters/{arm_name}"
    train_arm(arm_path, out, epochs=epochs)
    adapters.commit()
    return out


@app.local_entrypoint()
def main(
    arm_naive: str = "runs/sft_arm_naive.jsonl",
    arm_hardened: str = "runs/sft_arm_hardened.jsonl",
    epochs: int = 2,
):
    import json

    def load(path: str) -> list[dict]:
        with open(path, encoding="utf-8") as f:
            return [json.loads(line) for line in f if line.strip()]

    for name, path in (("naive", arm_naive), ("hardened", arm_hardened)):
        out = train.remote(name, load(path), epochs)
        print(f"trained arm_{name} -> {out} (in the cobra-adapters volume)")
