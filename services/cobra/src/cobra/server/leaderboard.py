"""FastAPI app for the verifier-safety leaderboard: submit + ranked board + per-env detail.

Separate from the siege app (server/app.py) — its own FastAPI on its own port. Self-serve: the
submitter computes metrics locally (via `bench`) and POSTs them; the server stores, ranks, displays.
Verified tier: canonical substrates (evalplus, reasoning-gym) POST raw completions; server
recomputes all scores so they cannot be spoofed.
"""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from cobra.server import store

_ROOT = Path(__file__).resolve().parents[3]
_PAGE = _ROOT / "dashboard" / "leaderboard.html"
_PLACEHOLDER = "<h1>leaderboard.html not built yet</h1><p>The API is live: try /api/leaderboard</p>"


class VerifierRow(BaseModel):
    name: str
    safety_score: float
    catch_rate: float
    false_accept: float
    honest_pass: float
    agreement: float
    best_of_k: float | None = None
    over_tightened: bool = False


class ExampleRow(BaseModel):
    task_id: str
    kind: str  # "naive_accepted_cheat" | "hardened_kept_honest"
    completion: str
    r_naive: int
    r_hardened: int
    t_oracle: int


class Submission(BaseModel):
    env_name: str = Field(min_length=1)
    substrate: str = "custom"
    n_completions: int
    n_exploits: int
    model_count: int = 1
    verifiers: list[VerifierRow]
    examples: list[ExampleRow] = []


class VerifiedSubmission(BaseModel):
    env_name: str = Field(min_length=1)
    substrate: str  # "evalplus" or "reasoning-gym:<dataset>"
    rows: list[dict]  # each: {task_id, model, completion, r_naive?, r_hardened?}


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _gap(verifiers: list[dict]) -> dict:
    by = {v["name"]: v.get("best_of_k") for v in verifiers}
    return {"naive": by.get("naive"), "hardened": by.get("hardened")}


def create_leaderboard_app(db_path: str = store.DEFAULT_DB) -> FastAPI:
    store.init_db(db_path)
    app = FastAPI(title="Cobra verifier-safety leaderboard")

    @app.post("/api/submit")
    async def submit(sub: Submission, request: Request) -> dict:
        naive = next((v for v in sub.verifiers if v.name == "naive"), None)
        if naive is None:
            raise HTTPException(
                422, "submission must include a 'naive' verifier row (the headline)"
            )
        sid = secrets.token_urlsafe(6)
        store.insert(
            {
                "id": sid,
                "env_name": sub.env_name,
                "substrate": sub.substrate,
                "headline_false_accept": naive.false_accept,
                "headline_safety": naive.safety_score,
                "n_completions": sub.n_completions,
                "n_exploits": sub.n_exploits,
                "model_count": sub.model_count,
                "verified": 0,
                "payload_json": sub.model_dump_json(),
                "created_at": _now(),
            },
            db_path,
        )
        base = str(request.base_url).rstrip("/")
        return {"id": sid, "url": f"{base}/env/{sid}"}

    @app.post("/api/submit/verified")
    async def submit_verified(sub: VerifiedSubmission, request: Request) -> dict:
        # Lazy imports — keep module import cheap; grader/substrate internals load here.
        from cobra.bench.submit import build_payload
        from cobra.rollout.dataset import Rollout
        from cobra.rollout.scorers import real_scorers, rg_real_scorers

        # Validate substrate.
        is_evalplus = sub.substrate == "evalplus"
        is_rg = sub.substrate.startswith("reasoning-gym:")
        if not is_evalplus and not is_rg:
            raise HTTPException(
                422,
                "verified tier supports only canonical substrates"
                " (evalplus, reasoning-gym:<dataset>)",
            )

        # Build scorer triple ONCE per request.
        if is_evalplus:
            from cobra.substrate import load_task

            r_naive, r_hardened, t_oracle = real_scorers()
        else:
            from cobra.substrate import load_rg_subset

            r_naive, r_hardened, t_oracle = rg_real_scorers()
            _rg_cache: dict[tuple[str, int], list] = {}  # (dataset, seed) -> loaded list

        # Score each row server-side; submitter-provided r_naive/r_hardened are ignored.
        rollouts: list[Rollout] = []
        for raw in sub.rows:
            try:
                task_id: str = raw["task_id"]
                model: str = raw.get("model", "unknown")
                completion: str = raw["completion"]

                if is_evalplus:
                    task = load_task(task_id)
                else:
                    # task_id is "dataset:seed:index"
                    dataset_name, seed_str, index_str = task_id.split(":")
                    seed_int = int(seed_str)
                    index_int = int(index_str)
                    cache_key = (dataset_name, seed_int)
                    if cache_key not in _rg_cache:
                        _rg_cache[cache_key] = load_rg_subset(dataset_name, index_int + 1, seed_int)
                    elif len(_rg_cache[cache_key]) <= index_int:
                        # Need to load more items for this (dataset, seed).
                        _rg_cache[cache_key] = load_rg_subset(dataset_name, index_int + 1, seed_int)
                    task = _rg_cache[cache_key][index_int]

                rollouts.append(
                    Rollout(
                        task_id=task_id,
                        model=model,
                        completion=completion,
                        r_naive=r_naive(task, completion),
                        r_hardened=r_hardened(task, completion),
                        t_oracle=t_oracle(task, completion),
                    )
                )
            except Exception:
                continue  # skip unloadable / malformed rows

        if not rollouts:
            raise HTTPException(422, "no rows could be scored; check task_ids and completions")

        payload = build_payload(rollouts, sub.env_name)
        naive = next((v for v in payload["verifiers"] if v["name"] == "naive"), None)
        sid = "v-" + secrets.token_urlsafe(6)
        store.insert(
            {
                "id": sid,
                "env_name": sub.env_name,
                "substrate": sub.substrate,
                "headline_false_accept": naive["false_accept"] if naive else 0.0,
                "headline_safety": naive["safety_score"] if naive else 0.0,
                "n_completions": payload["n_completions"],
                "n_exploits": payload["n_exploits"],
                "model_count": payload["model_count"],
                "verified": 1,
                "payload_json": json.dumps(payload),
                "created_at": _now(),
            },
            db_path,
        )
        base = str(request.base_url).rstrip("/")
        return {"id": sid, "url": f"{base}/env/{sid}"}

    @app.get("/api/leaderboard")
    async def board(sort: str = "gameable") -> dict:
        rows = store.leaderboard(db_path, sort=sort)
        out = [
            {
                "rank": i,
                "id": r["id"],
                "env_name": r["env_name"],
                "substrate": r["substrate"],
                "false_accept": r["headline_false_accept"],
                "safety_score": r["headline_safety"],
                "n_exploits": r["n_exploits"],
                "n_completions": r["n_completions"],
                "verified": bool(r["verified"]),
                "created_at": r["created_at"],
            }
            for i, r in enumerate(rows, 1)
        ]
        return {"rows": out, "sort": sort}

    @app.get("/api/env/{sub_id}")
    async def env(sub_id: str) -> dict:
        row = store.get(sub_id, db_path)
        if row is None:
            raise HTTPException(404, "submission not found")
        payload = json.loads(row["payload_json"])
        ranked = store.leaderboard(db_path, sort="gameable")
        board_rank = next(
            (i for i, r in enumerate(ranked, 1) if r["env_name"] == row["env_name"]), None
        )
        return {
            "id": row["id"],
            "env_name": row["env_name"],
            "substrate": row["substrate"],
            "verified": bool(row["verified"]),
            "n_completions": row["n_completions"],
            "n_exploits": row["n_exploits"],
            "verifiers": payload["verifiers"],
            "examples": payload.get("examples", []),
            "gap": _gap(payload["verifiers"]),
            "board_rank": board_rank,
        }

    @app.get("/board")
    async def board_page() -> HTMLResponse:
        return HTMLResponse(_PAGE.read_text() if _PAGE.exists() else _PLACEHOLDER)

    @app.get("/env/{sub_id}")
    async def env_page(sub_id: str) -> HTMLResponse:
        return HTMLResponse(_PAGE.read_text() if _PAGE.exists() else _PLACEHOLDER)

    return app
