"""Pluggable language layer: intake parser + planner.

The whole pipeline runs deterministically with no network and no API key -- the
default `DeterministicPlanner` is the greedy scheduler. An `AnthropicPlanner`
(Claude, model ``claude-opus-4-8``) is wired in behind a flag: when an API key
is present it asks Claude for a JSON plan from the messy plant context; when it
is absent (or anything goes wrong) it silently falls back to the deterministic
planner, so the demo never breaks. Whatever Claude returns is then handed to the
*same* verifier + recursive repair loop -- the brain proposes, the verifier
disposes.

Set ANTHROPIC_API_KEY (or pass api_key=) and use AnthropicPlanner to show live
LLM planning; otherwise everything is offline and reproducible.
"""

from __future__ import annotations

import json
import os
from typing import Optional, Protocol

from .schemas import FactoryState, ActionPlan
from .generator import messy_prompt
from .baselines import greedy

MODEL = "claude-opus-4-8"


class Planner(Protocol):
    def plan(self, state: FactoryState) -> ActionPlan: ...


class DeterministicPlanner:
    """Offline planner: the greedy EDD scheduler. Always available."""

    def plan(self, state: FactoryState) -> ActionPlan:
        return greedy(state)


class AnthropicPlanner:
    """Claude-backed planner. Falls back to greedy when no key / on any error.

    This is the "raw LLM output" stage of the brief's pipeline: Claude reads the
    messy context and emits a JSON ActionPlan. It is intentionally *not* trusted
    -- the verifier + repair loop downstream guarantee feasibility regardless of
    what the model returns.
    """

    def __init__(self, api_key: Optional[str] = None, model: str = MODEL):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.model = model
        self._fallback = DeterministicPlanner()

    @property
    def available(self) -> bool:
        if not self.api_key:
            return False
        try:
            import anthropic  # noqa: F401
            return True
        except ImportError:
            return False

    def plan(self, state: FactoryState) -> ActionPlan:
        if not self.available:
            return self._fallback.plan(state)
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self.api_key)
            prompt = self._build_prompt(state)
            resp = client.messages.create(
                model=self.model,
                max_tokens=16000,
                thinking={"type": "adaptive"},
                output_config={"effort": "high"},
                system=(
                    "You are the operations brain of an autonomous factory. "
                    "Read the messy plant context and the canonical factory "
                    "state, then output ONE JSON object matching the ActionPlan "
                    "schema: keys quote_decisions, procurement, schedule, "
                    "quality, customer_messages. Schedule every operation of "
                    "every job with {job_id, operation_id, machine_id, "
                    "operator_id, start, end} in absolute hours. Respond with "
                    "JSON only, no prose."
                ),
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in resp.content if b.type == "text")
            plan = ActionPlan.model_validate(json.loads(_extract_json(text)))
            return _seed_with_greedy(state, plan)
        except Exception:
            # any failure (network, parse, schema) -> deterministic plan;
            # the repair loop will make whatever we have feasible anyway.
            return self._fallback.plan(state)

    def _build_prompt(self, state: FactoryState) -> str:
        return (
            f"Messy plant context:\n{messy_prompt(state)}\n\n"
            f"Canonical factory state (JSON):\n"
            f"{json.dumps(state.model_dump(mode='json'))}\n\n"
            "Return the ActionPlan JSON."
        )


class VLLMPlanner:
    """Planner backed by a pre-existing open model (Gemma) served by vLLM.

    We do NOT train a model -- we serve an off-the-shelf instruct model behind
    vLLM's OpenAI-compatible endpoint and use it as the intake+planner teacher.
    Launch on a GPU box:

        vllm serve google/gemma-2-9b-it --port 8000

    Then point base_url at it. No key needed for a local server. Falls back to
    the deterministic planner if the endpoint is unreachable; whatever it returns
    still goes through the verifier + recursive repair loop, so a small/served
    model is safe to use here. This is also the *teacher* whose verified repair
    traces distill the small TRM student (see distill/RECIPE.md).
    """

    def __init__(self, base_url: str = "http://localhost:8000/v1",
                 model: str = "google/gemma-2-9b-it", api_key: str = "EMPTY",
                 timeout: float = 60.0):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout = timeout
        self._fallback = DeterministicPlanner()

    @property
    def available(self) -> bool:
        import urllib.request
        try:
            req = urllib.request.Request(f"{self.base_url}/models",
                                         headers={"Authorization": f"Bearer {self.api_key}"})
            with urllib.request.urlopen(req, timeout=3):
                return True
        except Exception:
            return False

    def plan(self, state: FactoryState) -> ActionPlan:
        if not self.available:
            return self._fallback.plan(state)
        import urllib.request
        try:
            body = json.dumps({
                "model": self.model,
                "max_tokens": 16000,           # reasoning models need headroom
                "temperature": 0.2,
                "response_format": {"type": "json_object"},  # force parseable JSON
                "messages": [
                    {"role": "system", "content":
                     "You are an autonomous factory operations brain. Output ONE "
                     "JSON ActionPlan object with keys quote_decisions, "
                     "procurement, schedule, quality, customer_messages, safety. "
                     "JSON only."},
                    {"role": "user", "content": _build_user_prompt(state)},
                ],
            }).encode()
            req = urllib.request.Request(
                f"{self.base_url}/chat/completions", data=body,
                headers={"Content-Type": "application/json",
                         "Authorization": f"Bearer {self.api_key}"})
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                out = json.loads(r.read())
            text = out["choices"][0]["message"]["content"]
            plan = ActionPlan.model_validate(json.loads(_extract_json(text)))
            return _seed_with_greedy(state, plan)   # LLM judgment + complete schedule
        except Exception:
            return self._fallback.plan(state)


FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1"
FIREWORKS_GEMMA = "accounts/fireworks/models/gemma-4-31b-it"


def fireworks_key() -> str:
    """Resolve the Fireworks API key from the environment."""
    import os
    return os.environ.get("FIREWORKS_API_KEY", "")


class FireworksPlanner(VLLMPlanner):
    """Planner via Fireworks AI (serverless, OpenAI-compatible) -- zero GPU.

    Fireworks hosts open models (Gemma) behind an OpenAI-compatible endpoint, so
    this reuses the same chat-completions path as vLLM, pointed at Fireworks with
    your ``FIREWORKS_API_KEY``. Falls back to the deterministic planner when no
    key / unreachable; output still goes through the verifier + repair loop.
    """

    def __init__(self, model: str | None = None,
                 base_url: str = FIREWORKS_BASE_URL,
                 api_key: str | None = None, timeout: float = 60.0):
        import os
        super().__init__(base_url=base_url,
                         model=model or os.environ.get("FIREWORKS_MODEL", FIREWORKS_GEMMA),
                         api_key=api_key or fireworks_key() or "EMPTY", timeout=timeout)

    @property
    def available(self) -> bool:
        # Fireworks' /models endpoint 500s, so don't health-check it. A real key
        # means "reachable"; plan() has try/except fallback for actual failures.
        return bool(self.api_key and self.api_key != "EMPTY")


def chat_json(system: str, user: str, max_tokens: int = 4000) -> Optional[dict]:
    """One-shot LLM call returning parsed JSON. Tries Fireworks (FIREWORKS_API_KEY)
    then Anthropic (ANTHROPIC_API_KEY); returns None if neither is reachable or the
    response doesn't parse. Used by the multi-modal intake to extract a factory
    spec from free-form user input."""
    import urllib.request
    # Fireworks (serverless, OpenAI-compatible)
    key = fireworks_key()
    if key:
        try:
            body = json.dumps({
                # intake needs a SERVERLESS model (Gemma-31B isn't); Qwen3.7 is.
                # NOTE: do NOT set response_format=json_object — this reasoning model
                # returns an empty {} under that mode. Ask for JSON in the prompt and
                # pull it out of the prose with _extract_json instead.
                "model": os.environ.get("FIREWORKS_CHAT_MODEL",
                                        "accounts/fireworks/models/qwen3p7-plus"),
                "max_tokens": max_tokens, "temperature": 0.2,
                "messages": [{"role": "system", "content": system},
                             {"role": "user", "content": user}],
            }).encode()
            req = urllib.request.Request(f"{FIREWORKS_BASE_URL}/chat/completions", data=body,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
            with urllib.request.urlopen(req, timeout=60) as r:
                txt = json.loads(r.read())["choices"][0]["message"]["content"]
            return json.loads(_extract_json(txt))
        except Exception:
            pass
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            import anthropic
            resp = anthropic.Anthropic().messages.create(
                model=MODEL, max_tokens=max_tokens, system=system,
                messages=[{"role": "user", "content": user}])
            txt = "".join(b.text for b in resp.content if b.type == "text")
            return json.loads(_extract_json(txt))
        except Exception:
            pass
    return None


VISION_SYS = (
    "You are a manufacturing analyst. You are shown one or more frames from a "
    "factory floor (often sampled from a video). Describe, in 3-5 sentences, what "
    "is being manufactured and the operations visible: machines/stations (molding, "
    "CNC, assembly, deburr, inspection), materials, and the apparent industry "
    "(automotive, electronics, medical, general). Be concrete; this description is "
    "compiled into a scheduler's factory state. Respond with ONLY the description "
    "prose — no preamble, no numbered analysis, no mention of the image or the task."
)


def vision_caption(image_data_urls: list[str], hint: str = "") -> Optional[str]:
    """Caption factory frames with a Fireworks multimodal model (Qwen3.7-plus is
    multimodal; override with FIREWORKS_VISION_MODEL). Frames come from an uploaded
    image or sampled from a video in the browser (base64 data URLs). Returns a
    free-text factory description fed into the intake, or None if no key / failure."""
    import urllib.request
    key = fireworks_key()
    if not key or not image_data_urls:
        return None
    model = os.environ.get("FIREWORKS_VISION_MODEL",
                           "accounts/fireworks/models/qwen3p7-plus")
    content: list[dict] = [{"type": "text",
                            "text": (hint or "Describe this factory floor.")}]
    for url in image_data_urls[:4]:
        content.append({"type": "image_url", "image_url": {"url": url}})
    try:
        body = json.dumps({
            "model": model, "max_tokens": 700, "temperature": 0.2,
            "messages": [{"role": "system", "content": VISION_SYS},
                         {"role": "user", "content": content}],
        }).encode()
        req = urllib.request.Request(f"{FIREWORKS_BASE_URL}/chat/completions", data=body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = json.loads(r.read())["choices"][0]["message"]["content"]
        return _clean_caption(raw)
    except Exception:
        return None


_META = ("the user wants", "i see", "i can see", "identify the", "let me",
         "in the image", "in the images", "this image", "the image shows",
         "here is", "here's", "**", "okay,", "sure,")


def _clean_caption(text: str) -> str:
    """Strip a thinking model's analysis preamble (numbered lists, 'the user wants…',
    markdown) and keep the descriptive prose."""
    import re
    text = re.sub(r"\*\*|\*|^#+\s*", "", text, flags=re.MULTILINE)
    sents = re.split(r"(?<=[.!?])\s+", text.replace("\n", " "))
    keep = [s.strip() for s in sents
            if s.strip() and not any(m in s.lower() for m in _META)
            and not re.match(r"^\d+[.)]", s.strip())]
    out = " ".join(keep).strip()
    return out or text.strip()


def _seed_with_greedy(state: FactoryState, plan: ActionPlan) -> ActionPlan:
    """Fill operations the LLM left unscheduled using the greedy backbone.

    A raw LLM is a poor *schedule author* (it returns sparse/empty schedules),
    and the repair loop only fixes proposed assignments -- it can't author a
    schedule from nothing. So we keep the LLM's judgment (quotes, procurement,
    customer messages, safety) and complete the schedule with greedy; the repair
    loop then makes the whole thing feasible. This is the teacher's real shape:
    LLM judgment + deterministic scheduling backbone.
    """
    from .baselines import greedy
    g = greedy(state)
    have = {(a.job_id, a.operation_id) for a in plan.schedule}
    for a in g.schedule:
        if (a.job_id, a.operation_id) not in have:
            plan.schedule.append(a)
    if not plan.quality:
        plan.quality = g.quality
    return plan


def _build_user_prompt(state: FactoryState) -> str:
    return (
        f"Messy plant context:\n{messy_prompt(state)}\n\n"
        f"Canonical factory state (JSON):\n"
        f"{json.dumps(state.model_dump(mode='json'))}\n\nReturn the ActionPlan JSON."
    )


def _extract_json(text: str) -> str:
    """Pull the first top-level JSON object out of a model response."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in response")
    return text[start:end + 1]
