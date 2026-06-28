"""Distill verified repair traces into a small TRM student (Sillon-style).

Runnable part (no GPU): turn ``results/episodes.jsonl`` into supervised
(prompt, completion) pairs where the model learns to predict the next verified
repair action from (factory state, current plan, verifier errors, reward). This
is the SFT dataset for a small specialised reasoner; the verifier is the real
eval set.

The actual training (HF Trainer) needs torch + a base model + GPU and is gated
behind ``train()`` — the data-prep + a dry-run print run anywhere. See RECIPE.md.
"""

from __future__ import annotations

import json
import os


SYSTEM = ("You are a factory-operations repair reasoner. Given the factory state, "
          "the current verifier errors and reward, output the single best next "
          "repair action as JSON.")


def iter_examples(episodes_path: str):
    """Yield HF chat-format examples {"messages": [...]} from verified repair traces.

    Conversational format = what HF `apply_chat_template` and Fireworks supervised
    fine-tuning both consume directly (no manual template strings). One example per
    repair step: system + user(state/errors/reward) -> assistant(repair action).
    """
    with open(episodes_path) as f:
        for line in f:
            ep = json.loads(line)
            state = ep["observation"]["factory_state"]
            errors = ep["verifier_before"]["errors"]
            reward = ep["verifier_before"]["reward"]
            for step in ep["repair_trace"]:
                user = (f"STATE: {json.dumps(state)}\n"
                        f"ERRORS: {json.dumps(errors)}\n"
                        f"REWARD: {reward}\n"
                        "What is the next repair action?")
                yield {"messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": user},
                    {"role": "assistant", "content": json.dumps(step["repair_action"])},
                ]}
                errors = step["errors_after"]
                reward = step["reward_after"]


def build_dataset(episodes_path: str, out_path: str) -> int:
    n = 0
    with open(out_path, "w") as f:
        for ex in iter_examples(episodes_path):
            f.write(json.dumps(ex) + "\n")
            n += 1
    return n


def train(dataset_path: str, base_model: str = "google/gemma-2-2b",
          out_dir: str = "distill/trm-student"):  # pragma: no cover - needs GPU
    """SFT a small student on the repair traces. Requires torch + transformers."""
    from datasets import load_dataset
    from transformers import (AutoModelForCausalLM, AutoTokenizer,
                              DataCollatorForLanguageModeling, Trainer, TrainingArguments)

    tok = AutoTokenizer.from_pretrained(base_model)
    model = AutoModelForCausalLM.from_pretrained(base_model)
    ds = load_dataset("json", data_files=dataset_path, split="train")

    def fmt(ex):
        # render the chat messages with the model's own template
        text = tok.apply_chat_template(ex["messages"], tokenize=False)
        return tok(text, truncation=True, max_length=2048)

    ds = ds.map(fmt, remove_columns=ds.column_names)
    Trainer(
        model=model,
        args=TrainingArguments(output_dir=out_dir, num_train_epochs=2,
                               per_device_train_batch_size=2, learning_rate=2e-5,
                               bf16=True, logging_steps=20, save_strategy="epoch"),
        train_dataset=ds,
        data_collator=DataCollatorForLanguageModeling(tok, mlm=False),
    ).train()
    model.save_pretrained(out_dir); tok.save_pretrained(out_dir)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    eps = os.path.join(root, "results", "episodes.jsonl")
    out = os.path.join(root, "distill", "sft_pairs.jsonl")
    if not os.path.exists(eps):
        raise SystemExit("run `python run.py` first to generate results/episodes.jsonl")
    n = build_dataset(eps, out)
    print(f"wrote {n} chat-format (messages) repair examples -> distill/sft_pairs.jsonl")
    print("HF/Fireworks SFT-ready. next: train(...) a small Gemma student on a GPU "
          "(see RECIPE.md); or train the TRM-native student via src/trm_student.py")
