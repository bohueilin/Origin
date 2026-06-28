"""mongodb-sales-aggregation-engine — HUD v6 environment, HARDENED v2.

Deploy-form of the Plan 005 hardened release. Identical task and agent workspace
(/app) as v1, but the verifier is moved out of the agent-writable workspace: the
trusted test suite is served from a separate /tests root and graded with the
hardened invocation proven by the sealed ReleaseProof (run from `/`, pytest
plugin auto-load disabled, import shadowing blocked). The grader also verifies
the trusted suite digest at grade time, so a root agent that overwrites /tests
cannot force a pass. This neutralises the recorded conftest/plugin reward hack
while preserving legitimate solutions.
"""

import asyncio
import os
import subprocess
from pathlib import Path

from hud.environment import Environment
from hud.graders import BashGrader, combine

env = Environment(name="mongodb_sales_aggregation_engine")

APP = Path("/app")
ASSETS = Path(__file__).resolve().parent / "task_assets"
ws = env.workspace(APP, guest_path="/app", network=True)

# Out-of-process grader (harden-v0/Harbor convention). The reward comes from
# comparing the candidate's OUTPUTS to the trusted reference solution's outputs on
# the same seeded data. The candidate (`/app/query.py`) is executed only inside
# throwaway isolated subprocesses by /tests/grader/run_solution.py; the verdict
# process (/tests/grader/grade.py) never imports candidate code, so an in-process
# exit-code hijack (atexit/os._exit) or monkeypatch in the candidate cannot affect
# the verdict — the candidate can only emit data, and wrong data fails the compare.
# The grader files are digest-pinned so a root candidate cannot rewrite the verdict
# logic. KNOWN RESIDUAL: a root candidate can read the grader/reference and the
# fixed cases and hard-code outputs; defeating that needs a non-root candidate or
# randomised/hidden test data (a runtime/env concern). See
# artifacts/chronos/demo/publish/v2-security-limitations.json.
GRADER_DIGESTS = {
    "grade.py": "ff9504016de427e9525189c28d6363687b63f81e03a49db320398cb6992ae94f",
    "run_solution.py": "279ace4541ab42f9ecf9629c756def5979c3ce5354eef6e73f134a66de2a3b48",
    "reference_query.py": "11d0c0ef30d09197a0dd53a01ecbafe2c177d35b150a21043517a1db9d792070",
}
GRADE_CMD = "\n".join(
    [
        "pgrep -x mongod >/dev/null 2>&1 || "
        "{ mongod --fork --logpath /var/log/mongodb.log --dbpath /data/db >/tmp/mongod-start.log 2>&1; sleep 2; }",
    ]
    + [
        f"printf '%s  /tests/grader/{name}\\n' {digest} | sha256sum -c - >/dev/null 2>&1 "
        "|| { echo GRADER_TAMPERED; exit 1; }"
        for name, digest in GRADER_DIGESTS.items()
    ]
    + [
        "cd /",
        # grade.py imports no candidate code; its exit code is the reward.
        "python3 -I /tests/grader/grade.py",
    ]
)

_QUERY_STUB = '''\
"""Implement SalesAnalyzer here (see the task prompt)."""


class SalesAnalyzer:
    def __init__(self, db_url: str, db_name: str):
        raise NotImplementedError

    def get_top_performing_products(
        self, start_date: str, end_date: str, limit: int = 3
    ) -> dict:
        raise NotImplementedError
'''


def _running_in_container() -> bool:
    return APP.exists() and os.access("/", os.W_OK) and Path("/data/db").exists()


@env.initialize
async def _setup() -> None:
    """Start MongoDB, seed sample data, and lay the agent task files at /app.

    The gradeable suite lives at /tests (baked read-only by the Dockerfile); only
    the agent workspace files are written here.
    """
    if not _running_in_container():
        return
    APP.mkdir(parents=True, exist_ok=True)
    (APP / "task_assets").mkdir(parents=True, exist_ok=True)
    for name in ("orders.json", "products.json", "init_data.py"):
        (APP / "task_assets" / name).write_bytes((ASSETS / name).read_bytes())
    (APP / "instruction.md").write_bytes((ASSETS / "instruction.md").read_bytes())
    if not (APP / "query.py").exists():
        (APP / "query.py").write_text(_QUERY_STUB)

    if subprocess.run(["pgrep", "-x", "mongod"]).returncode != 0:
        subprocess.run(
            "mongod --fork --logpath /var/log/mongodb.log --dbpath /data/db",
            shell=True,
            check=False,
        )
        await asyncio.sleep(3)
    _seed_demo_db()


def _seed_demo_db() -> None:
    try:
        import json
        from datetime import datetime

        import pymongo

        db = pymongo.MongoClient("mongodb://localhost:27017/")["ecommerce_db"]
        db.products.delete_many({})
        db.orders.delete_many({})
        db.products.insert_many(json.loads((ASSETS / "products.json").read_text()))
        orders = json.loads((ASSETS / "orders.json").read_text())
        for o in orders:
            o["order_date"] = datetime.fromisoformat(o["order_date"])
        db.orders.insert_many(orders)
    except Exception as exc:  # noqa: BLE001 - demo seed is best-effort
        print(f"demo seed skipped: {exc}")


@env.shutdown
async def _teardown() -> None:
    subprocess.run(
        "mongod --shutdown --dbpath /data/db || true", shell=True, check=False
    )


def _prompt() -> str:
    return (ASSETS / "instruction.md").read_text()


@env.template(id="implement_sales_analyzer")
async def implement_sales_analyzer():
    """Prompt the agent; grade with the hardened /tests verifier."""
    yield _prompt()
    sub = await BashGrader.grade(1.0, command=GRADE_CMD, cwd=str(APP))
    result = await combine(sub)
    yield result.reward


async def _test() -> None:
    from hud import LocalRuntime
    from hud.agents.claude import ClaudeAgent

    job = await implement_sales_analyzer().run(
        ClaudeAgent(model="claude-haiku-4-5"), runtime=LocalRuntime(__file__)
    )
    print("reward:", job.reward)


if __name__ == "__main__":
    asyncio.run(_test())
