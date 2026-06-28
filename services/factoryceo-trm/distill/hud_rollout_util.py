"""Shared HUD rollout helpers: retry transient gateway timeouts."""

from __future__ import annotations

import asyncio
from typing import Any


def _transient_hud_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return any(
        token in msg
        for token in (
            "504",
            "timeout",
            "timed out",
            "upstream",
            "429",
            "connection error",
            "connection reset",
            "temporarily unavailable",
        )
    )


async def run_taskset_with_retry(
    taskset: Any,
    agent: Any,
    *,
    runtime: Any,
    group: int,
    job: Any,
    max_concurrent: int,
    retries: int = 5,
    timeout_s: float = 240.0,
    label: str = "rollout",
) -> None:
    """Run a HUD taskset; retry on gateway 504/timeout bursts."""
    delay = 8.0
    last: BaseException | None = None
    for attempt in range(1, retries + 1):
        try:
            await asyncio.wait_for(
                taskset.run(
                    agent,
                    runtime=runtime,
                    group=group,
                    job=job,
                    max_concurrent=max_concurrent,
                ),
                timeout=timeout_s,
            )
            return
        except asyncio.TimeoutError as exc:
            last = exc
            if attempt >= retries:
                raise TimeoutError(f"{label} timed out after {timeout_s:.0f}s") from exc
            print(
                f"[hud] {label} attempt {attempt}/{retries} timed out after "
                f"{timeout_s:.0f}s; retrying in {delay:.0f}s",
                flush=True,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 1.5, 90.0)
        except Exception as exc:
            last = exc
            if not _transient_hud_error(exc) or attempt >= retries:
                raise
            print(
                f"[hud] {label} attempt {attempt}/{retries} failed ({exc!s}); "
                f"retrying in {delay:.0f}s",
                flush=True,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 1.5, 90.0)
    if last is not None:
        raise last
