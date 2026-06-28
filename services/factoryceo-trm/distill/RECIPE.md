# Distillation: large teacher → small specialized TRM student

**The thesis (validated by Sillon / RATP).** Pleias' *Sillon* is a 600M reasoner
built with RATP (Paris transit) that matches or beats frontier LLMs on a narrow
operational task (French transit distress detection) by training on **synthetic
data + domain reasoning traces** against a **real verifier/eval set** — see
*"Model in Distress: Sentiment Analysis on French Synthetic Social Media"* and
the Pleias SYNTH dataset. The lesson isn't "small beats big"; it's:

> narrow operational domain + synthetic data + domain reasoning traces + a real
> verifier ⇒ a small specialized model can outperform general frontier models.

FactoryCEO-TRM is the manufacturing analogue, and the pipeline already produces
every ingredient:

```
Sillon / RATP:
  small seed corpus → synthetic transit distress msgs → 600M reasoner → verified safety classification

FactoryCEO-TRM:
  factory schemas + seed scenarios → synthetic orders/RFQs/logs/disruptions
    → large teacher (Claude / Gemma-via-vLLM) proposes plans
    → verifier + recursive repair produce VERIFIED reasoning traces  (results/episodes.jsonl)
    → distill a small recursive reasoner (TRM) student
    → verifier is the real, non-synthetic eval set
```

## Ingredients we already generate

| Sillon ingredient | FactoryCEO-TRM artifact |
|---|---|
| Synthetic domain data | `generator.py` — synthetic factories + disruptions (seeded, unlimited) |
| Reasoning traces | `repair_trace` in `results/episodes.jsonl` — each step's targeted error → repair action → reward |
| Teacher | `src/llm.py` `AnthropicPlanner` (Claude) or `VLLMPlanner` (Gemma) |
| Real verifier / eval | `src/verifier.py` — hard constraints + profit + safety reward |
| Privacy/cost win | data is synthetic; no real plant data needed |

## Student: keep it a TRM

The student is the **same recursive reasoner** that runs the loop today, just
learned instead of rule-based: given `(factory_state, current_plan, verifier
errors, reward)` it emits the next local repair action. Train it to imitate the
verified traces (SFT), then improve it against the verifier reward (RFT/GRPO via
the HUD environment in `src/hud_env.py`). The recursion is preserved — TRM stays
the architecture; the heuristic `repair_model` becomes a tiny trained model.

## Steps

1. **Generate teacher data** (already done by `run.py`): `results/episodes.jsonl`.
   Scale up with `python run.py --scenarios 1000`. Optionally swap the teacher to
   Gemma-via-vLLM or Claude to get richer/messier proposals before repair.
2. **Format** trace steps into `(prompt, completion)` pairs — see
   `train_trm.py` (`iter_examples`). Prompt = state + current plan + verifier
   errors; completion = the repair action JSON.
3. **SFT** a small base (e.g. a 0.5–0.6B reasoner, à la Sillon, or a tiny
   from-scratch TRM) on the pairs with the HF `Trainer`.
4. **RFT / GRPO** with the HUD env reward (`normalized_reward`) to push past
   imitation — the verifier is the reward, no human labels.
5. **Evaluate** the student by plugging it in as `repair_model` and re-running
   `run.py`; compare its scoreboard to the rule-based loop and the teacher.

No new research required: synthetic data + traces + verifier + a small model.
