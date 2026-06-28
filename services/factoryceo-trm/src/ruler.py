"""RULER-style natural-language reward judge (OpenPipe ART pattern).

Karpathy's critique: a single scalar reward is too low-dimensional and
hand-coded reward functions are brittle. RULER (in OpenPipe ART) answers this by
writing the reward criteria in plain English and letting an LLM grade each
trajectory against that rubric -- "reward engineering becomes prompt
engineering."

In FactoryCEO-TRM the **verifier stays the trusted hard signal** (feasibility,
profit, safety -- programmatically checkable, un-gameable). RULER adds the
*soft, higher-dimensional* channel for the parts a scalar can't capture: was the
customer communication appropriate, was the quoting judicious, was the
disruption recovery sensible rather than lucky. The two are blended in
``hud_env.hybrid_reward`` with the verifier gating feasibility first, so the
judge can never bless an infeasible or unsafe plan.

Backends (auto-detected, all optional): Claude (``ANTHROPIC_API_KEY``) or a
vLLM-served open model (Gemma). With neither reachable, a deterministic
heuristic scores the same soft dimensions so the pipeline + tests run offline.
"""

from __future__ import annotations

import json
import os
from typing import Optional

from .schemas import FactoryState, ActionPlan, deadline_hour
from .verifier import evaluate

DEFAULT_RUBRIC = """\
Grade this autonomous factory operations plan on operational *judgment* (not
feasibility -- that is checked separately). Award credit for:
  - Customer care: every late job carries a proactive delay warning.
  - Commercial judgment: negative-margin RFQs are rejected; profitable ones accepted.
  - Safety posture: degraded machines and fatigued humans have explicit controls;
    off-hours work prefers the 24/7 robot.
  - Completeness: all accepted work is actually scheduled.
Return JSON: {"score": <0.0-1.0>, "rationale": "<one sentence>"}.
"""


class RulerJudge:
    def __init__(self, rubric: str = DEFAULT_RUBRIC, use_llm: Optional[bool] = None,
                 anthropic_model: str = "claude-opus-4-8",
                 vllm_base_url: str = "http://localhost:8000/v1",
                 vllm_model: str = "google/gemma-2-9b-it",
                 fireworks_model: Optional[str] = None):
        self.rubric = rubric
        self.fireworks_model = fireworks_model or os.environ.get(
            "FIREWORKS_MODEL", "accounts/fireworks/models/gemma-4-31b-it")
        # Default OFF: the heuristic is deterministic, free, and offline. LLM
        # grading is opt-in (use_llm=True or env FACTORYCEO_RULER_LLM=1) so batch
        # runs don't make a network call per scenario.
        self.use_llm = (os.environ.get("FACTORYCEO_RULER_LLM") == "1"
                        if use_llm is None else use_llm)
        self.anthropic_model = anthropic_model
        self.vllm_base_url = vllm_base_url.rstrip("/")
        self.vllm_model = vllm_model

    def score(self, state: FactoryState, plan: ActionPlan) -> dict:
        """Return {"score": 0..1, "rationale": str, "backend": str}."""
        if self.use_llm:
            prompt = self._prompt(state, plan)
            for backend in (self._score_anthropic, self._score_fireworks, self._score_vllm):
                out = backend(prompt)
                if out is not None:
                    return out
        s = self._heuristic_score(state, plan)
        return {"score": s, "rationale": "heuristic (no LLM judge reachable)",
                "backend": "heuristic"}

    # --- backends -------------------------------------------------------- #
    def _score_anthropic(self, prompt: str) -> Optional[dict]:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return None
        try:
            import anthropic
            client = anthropic.Anthropic()
            resp = client.messages.create(
                model=self.anthropic_model, max_tokens=512,
                system=self.rubric,
                messages=[{"role": "user", "content": prompt}])
            text = "".join(b.text for b in resp.content if b.type == "text")
            return self._parse(text, "claude")
        except Exception:
            return None

    def _score_fireworks(self, prompt: str) -> Optional[dict]:
        """Fireworks AI (serverless Gemma) -- zero GPU."""
        from .llm import fireworks_key, FIREWORKS_BASE_URL
        key = fireworks_key()
        if not key:
            return None
        return self._openai_chat(FIREWORKS_BASE_URL, self.fireworks_model,
                                 key, prompt, "gemma-fireworks")

    def _score_vllm(self, prompt: str) -> Optional[dict]:
        return self._openai_chat(self.vllm_base_url, self.vllm_model, "EMPTY",
                                 prompt, "gemma-vllm")

    def _openai_chat(self, base_url, model, token, prompt, label) -> Optional[dict]:
        import urllib.request
        try:
            body = json.dumps({
                "model": model, "max_tokens": 512, "temperature": 0.0,
                "messages": [{"role": "system", "content": self.rubric},
                             {"role": "user", "content": prompt}],
            }).encode()
            req = urllib.request.Request(
                f"{base_url.rstrip('/')}/chat/completions", data=body,
                headers={"Content-Type": "application/json",
                         "Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, timeout=30) as r:
                out = json.loads(r.read())
            return self._parse(out["choices"][0]["message"]["content"], label)
        except Exception:
            return None

    # --- helpers --------------------------------------------------------- #
    def _prompt(self, state: FactoryState, plan: ActionPlan) -> str:
        m = evaluate(state, plan).metrics
        summary = {
            "completed_jobs": m["completed_jobs"], "total_jobs": m["total_jobs"],
            "on_time_rate": m["on_time_rate"], "safety_incidents": m["safety_incidents"],
            "n_delay_warnings": len(plan.customer_messages),
            "n_safety_controls": len(plan.safety),
            "quotes": [{"rfq": q.rfq_id, "accept": q.accept} for q in plan.quote_decisions],
        }
        return ("Plan summary:\n" + json.dumps(summary, indent=2) +
                "\n\nGrade per the rubric and return the JSON.")

    @staticmethod
    def _parse(text: str, backend: str) -> dict:
        start, end = text.find("{"), text.rfind("}")
        data = json.loads(text[start:end + 1])
        score = max(0.0, min(1.0, float(data.get("score", 0.0))))
        return {"score": score, "rationale": data.get("rationale", ""),
                "backend": backend}

    def _heuristic_score(self, state: FactoryState, plan: ActionPlan) -> float:
        """Offline proxy: score the same soft dimensions the rubric names."""
        from collections import defaultdict
        sched = defaultdict(list)
        for a in plan.schedule:
            sched[a.job_id].append(a)
        warned = {mm.job_id for mm in plan.customer_messages
                  if mm.message_type == "delay_warning"}
        # customer care: late jobs that were warned
        late = [j for j in state.jobs if sched.get(j.id) and
                max(a.end for a in sched[j.id]) > deadline_hour(j.due_day)]
        care = 1.0 if not late else sum(j.id in warned for j in late) / len(late)
        # commercial judgment: no accepted negative-margin RFQs
        bad_quotes = sum(1 for q in plan.quote_decisions for r in state.rfqs
                         if q.rfq_id == r.id and q.accept
                         and q.price_per_unit <= r.est_unit_cost)
        commercial = 1.0 if not plan.quote_decisions else \
            1.0 - bad_quotes / len(plan.quote_decisions)
        # safety posture: no uncontrolled incidents
        safety = 1.0 if evaluate(state, plan).metrics["safety_incidents"] == 0 else 0.4
        # completeness
        done = sum(1 for j in state.jobs if sched.get(j.id) and
                   {a.operation_id for a in sched[j.id]}.issuperset({o.id for o in j.operations}))
        completeness = done / len(state.jobs) if state.jobs else 0.0
        return round((care + commercial + safety + completeness) / 4, 3)
