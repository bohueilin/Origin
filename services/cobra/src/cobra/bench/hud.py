"""HUD trace-logging for the verifier leaderboard — make a Cobra eval observable on hud.ai.

Wraps a leaderboard run as a HUD trace: each verifier scored is a span, and the final best-of-K
gap is reported as the trace's reward. Degrades gracefully — no hud-python, no HUD_API_KEY, or any
HUD error → falls back to the plain (untraced) leaderboard. It never crashes the pipeline.

Mechanism (hud-python 0.6.6, validated): @hud.instrument records spans; trace_enter registers the
trace BEFORE spans (the upload endpoint 404s on an unknown id); flush uploads + writes <id>.jsonl
locally (HUD_TELEMETRY_LOCAL_DIR, works with no key); _report finalizes with a reward.
"""

from __future__ import annotations

import os
import uuid

from ..rollout.dataset import Rollout
from .core import Verdict, VerifierScore, column, leaderboard, score_verifier
from .gap import bestofk_gap


def hud_available() -> bool:
    try:
        import hud  # noqa: F401

        return True
    except Exception:
        return False


def _default_verifiers() -> list[tuple[str, Verdict]]:
    return [("naive", column("r_naive")), ("hardened", column("r_hardened"))]


def trace_leaderboard(
    rollouts: list[Rollout],
    verifiers: list[tuple[str, Verdict]] | None = None,
    *,
    model: str = "cobra-bench",
    local_dir: str | None = "runs/_hud_traces",
) -> list[VerifierScore]:
    """Score the leaderboard inside a HUD trace; return the rows. Safe with no key / no hud."""
    verifiers = verifiers or _default_verifiers()
    if not hud_available():
        return leaderboard(rollouts, verifiers)
    try:
        import asyncio

        return asyncio.run(_traced(rollouts, verifiers, model=model, local_dir=local_dir))
    except Exception as e:  # any HUD/version issue → never break the pipeline
        print(f"[hud] tracing unavailable ({e}); returning untraced leaderboard")
        return leaderboard(rollouts, verifiers)


async def _traced(rollouts, verifiers, *, model, local_dir):
    import hud
    from hud.eval.job import _report, job_enter, trace_enter
    from hud.settings import settings
    from hud.telemetry import flush
    from hud.telemetry.context import set_trace_context

    if local_dir:
        os.environ.setdefault("HUD_TELEMETRY_LOCAL_DIR", local_dir)
        settings.telemetry_local_dir = local_dir

    # Register a JOB first, then the trace under it — uploads 404 ("trace not found") if the trace
    # isn't bound to a registered job. Canonical dashed uuids (no-dash hex also 404s on lookup).
    job_id, trace_id = str(uuid.uuid4()), str(uuid.uuid4())
    await job_enter(job_id, name="cobra-bench", group=1)
    await trace_enter(trace_id, job_id=job_id, group_id=None, model=model)
    rows: list[VerifierScore] = []
    with set_trace_context(trace_id):
        for name, verdict in verifiers:

            @hud.instrument(name=f"cobra.verifier.{name}")
            def _run(v=verdict, n=name):
                return score_verifier(rollouts, v, name=n)

            rows.append(_run())
        gap = bestofk_gap(rollouts)

    # Live upload races the async trace registration server-side and can 404; the LOCAL span dump
    # is the reliable artifact. Quiet HUD's upload-failure logging — it's best-effort here.
    import logging

    logging.getLogger("hud").setLevel(logging.CRITICAL)
    ok = bool(flush(timeout=10.0))
    try:
        await _report(f"/trace/{trace_id}/exit", {"status": "completed", "reward": float(gap.gap)})
    except Exception:  # noqa: BLE001
        ok = False
    if ok and settings.api_key:
        print(f"[hud] uploaded → {settings.hud_web_url}/traces/{trace_id}")
    else:
        loc = f"{local_dir}/{trace_id}.jsonl" if local_dir else "(telemetry dir)"
        print(f"[hud] local trace at {loc} (live upload best-effort; rerun if not on hud.ai)")
    return rows
