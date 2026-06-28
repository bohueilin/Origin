"""Target B fine-tune (the gated gamble): LoRA-SFT a small model on one expert-iteration arm.

"Training on a reward" = SFT on the completions that reward kept (rejection sampling). Run this
once per arm; arm_naive → the model imitates cheats, arm_hardened → it learns the task. Then eval
both on the HELD-OUT split with `held_out_eval` (via `hf_policy`) → the two-model gap chart (⑤).

GPU only — NOT imported by the package (heavy deps live inside the functions). Run on Modal or any
A100 box. Deps: torch transformers peft trl datasets accelerate.

  # one arm at a time
  python -m cobra.train.finetune --arm runs/sft_arm_naive.jsonl    --out adapters/naive
  python -m cobra.train.finetune --arm runs/sft_arm_hardened.jsonl --out adapters/hardened

  # Modal sketch (your account): wrap train_arm in a @app.function(gpu="A100", image=image)
  # where image = modal.Image.debian_slim().pip_install("torch","transformers","peft","trl",
  # "datasets","accelerate"), mount runs/ , call train_arm inside.

Pre-set abort line: this is the gamble layered on Target A. If the arms don't diverge by the
checkpoint, freeze it and demo Target A — don't train live on stage.
"""

from __future__ import annotations

import argparse
import json

BASE_MODEL = "Qwen/Qwen2.5-Coder-0.5B"


def _load_sft(path: str) -> list[dict]:
    """Read an arm JSONL into {prompt, completion} rows (write_sft with prompts=... emits these)."""
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def train_arm(
    arm_jsonl: str,
    out_dir: str,
    *,
    base_model: str = BASE_MODEL,
    epochs: int = 2,
    lr: float = 2e-4,
    max_seq_len: int = 1024,
) -> str:
    """LoRA-SFT `base_model` on the arm; save the adapter to out_dir. GPU required."""
    import torch
    from datasets import Dataset
    from peft import LoraConfig
    from transformers import AutoTokenizer
    from trl import SFTConfig, SFTTrainer

    rows = _load_sft(arm_jsonl)
    tok = AutoTokenizer.from_pretrained(base_model)
    text = [f"{r.get('prompt', '')}{r['completion']}{tok.eos_token or ''}" for r in rows]
    dataset = Dataset.from_dict({"text": text})

    lora = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        task_type="CAUSAL_LM",
    )
    cfg = SFTConfig(
        output_dir=out_dir,
        num_train_epochs=epochs,
        learning_rate=lr,
        per_device_train_batch_size=4,
        gradient_accumulation_steps=4,
        max_seq_length=max_seq_len,
        dataset_text_field="text",
        bf16=torch.cuda.is_available(),
        logging_steps=10,
        save_strategy="epoch",
    )
    trainer = SFTTrainer(model=base_model, train_dataset=dataset, args=cfg, peft_config=lora)
    trainer.train()
    trainer.save_model(out_dir)
    return out_dir


def hf_policy(adapter_dir: str, base_model: str = BASE_MODEL, temperature: float = 0.7):
    """A rollout `Model` backed by a fine-tuned adapter, so `held_out_eval` can measure it. GPU."""
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    from .models import POLICY_SYSTEM, Model, _strip

    tok = AutoTokenizer.from_pretrained(base_model)
    model = AutoModelForCausalLM.from_pretrained(base_model, torch_dtype="auto", device_map="auto")
    model = PeftModel.from_pretrained(model, adapter_dir)

    def sample(task) -> str:
        msgs = [
            {"role": "system", "content": POLICY_SYSTEM},
            {"role": "user", "content": task.prompt},
        ]
        prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        inputs = tok(prompt, return_tensors="pt").to(model.device)
        with torch.no_grad():
            out = model.generate(
                **inputs, max_new_tokens=512, do_sample=True, temperature=temperature
            )
        return _strip(tok.decode(out[0][inputs["input_ids"].shape[1] :], skip_special_tokens=True))

    return Model(name=f"ft:{adapter_dir}", sample=sample)


def main() -> None:
    p = argparse.ArgumentParser(prog="cobra.train.finetune")
    p.add_argument("--arm", required=True, help="SFT JSONL ({prompt, completion}) for one arm")
    p.add_argument("--out", required=True, help="adapter output dir")
    p.add_argument("--base-model", default=BASE_MODEL)
    p.add_argument("--epochs", type=int, default=2)
    args = p.parse_args()
    path = train_arm(args.arm, args.out, base_model=args.base_model, epochs=args.epochs)
    print(f"saved adapter: {path}")


if __name__ == "__main__":
    main()
