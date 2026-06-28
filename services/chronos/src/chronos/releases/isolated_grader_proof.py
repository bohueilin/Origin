"""Real-container proof for the Plan 005 isolated, randomised-input grader.

Builds a minimal mongo+python image that serves the out-of-process grader at
/tests/grader and runs it against several candidate `/app/query.py` solutions,
recording the reward (grade.py exit code: 0 -> reward 1, nonzero -> reward 0).

It proves, in a real container, that the grader:
  * preserves correct general solutions (the three sealed controls -> reward 1);
  * blocks the in-process exit-code hijack and monkeypatch (reward 0), because the
    verdict process never imports the candidate; and
  * blocks ANSWER-HARDCODING (reward 0), because the inputs are randomised per run,
    so a candidate that returns fixed/precomputed outputs cannot match the trusted
    reference computed on that same random data.

Run:  PYTHONPATH=src uv run python -m chronos.releases.isolated_grader_proof
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from .models import digest_json, utc_now

ROOT = Path(__file__).resolve().parents[3]
GRADER = ROOT / "artifacts" / "chronos" / "releases" / "isolated-grader"
CONTROLS = ROOT / "fixtures" / "chronos" / "mongodb-sales-aggregation-engine"
IMAGE = "chronos-isolated-grader:proof"
OUT = ROOT / "artifacts" / "chronos" / "releases" / "isolated-grader-proof.json"

DOCKERFILE = """FROM mongo:7.0
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \\
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir pymongo
RUN mkdir -p /data/db && chown -R mongodb:mongodb /data/db
COPY grader /tests/grader
RUN chmod -R a-w /tests
WORKDIR /app
"""

_BROKEN = (
    '"""SalesAnalyzer $match $lookup\nimport pymongo\n"""\n'
    "class SalesAnalyzer:\n"
    "    def __init__(self, db_url, db_name): pass\n"
    "    def get_top_performing_products(self, s, e, limit=3): return {}\n"
)
# A candidate that hard-codes plausible outputs (what a hard-coder who studied a
# FIXED suite would return). It cannot match randomised data -> reward 0.
_HARDCODE = (
    '"""SalesAnalyzer $match $lookup\nimport pymongo\n"""\n'
    "class SalesAnalyzer:\n"
    "    def __init__(self, db_url, db_name): pass\n"
    "    def get_top_performing_products(self, s, e, limit=3):\n"
    "        return {'A': [{'product_id': 2, 'product_name': 'P2', 'total_revenue': 200.0,\n"
    "                       'total_quantity': 10}]}\n"
)
_EXIT_HIJACK = (
    '"""SalesAnalyzer $match $lookup\nimport pymongo\n"""\n'
    "import os, sys, atexit\n"
    "atexit.register(lambda: (sys.stdout.flush(), os._exit(0)))\n"
    "class SalesAnalyzer:\n"
    "    def __init__(self, db_url, db_name): pass\n"
    "    def get_top_performing_products(self, s, e, limit=3): return {}\n"
)
_MONKEYPATCH = (
    '"""SalesAnalyzer $match $lookup\nimport pymongo\n"""\n'
    "import os, sys, subprocess\n"
    "os._exit = lambda *a, **k: None\n"
    "sys.exit = lambda *a, **k: None\n"
    "subprocess.run = lambda *a, **k: type('R', (), {'returncode': 0, 'stdout': 'RESULT_JSON:{}', 'stderr': ''})()\n"
    "class SalesAnalyzer:\n"
    "    def __init__(self, db_url, db_name): pass\n"
    "    def get_top_performing_products(self, s, e, limit=3): return {'A': [{'x': 1}]}\n"
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _grade_cmd() -> str:
    pins = "\n".join(
        f"printf '%s  /tests/grader/{name}\\n' {_sha256(GRADER / name)} | sha256sum -c - >/dev/null 2>&1 "
        "|| { echo GRADER_TAMPERED; exit 1; }"
        for name in ("grade.py", "run_solution.py", "reference_query.py")
    )
    return (
        "pgrep -x mongod >/dev/null 2>&1 || "
        "{ mongod --fork --logpath /var/log/mongodb.log --dbpath /data/db >/tmp/m.log 2>&1; sleep 2; }\n"
        f"{pins}\n"
        "cd /\n"
        "python3 -I /tests/grader/grade.py\n"
    )


def _build(ctx: Path) -> None:
    shutil.copytree(GRADER, ctx / "grader")
    (ctx / "Dockerfile").write_text(DOCKERFILE)
    subprocess.run(
        ["docker", "build", "-q", "-t", IMAGE, "-f", str(ctx / "Dockerfile"), str(ctx)],
        check=True,
        capture_output=True,
        text=True,
    )


def _reward(app_dir: Path, query_src: str) -> float:
    (app_dir / "query.py").write_text(query_src)
    proc = subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "-v",
            f"{app_dir}:/app:ro",
            IMAGE,
            "bash",
            "-lc",
            _grade_cmd(),
        ],
        capture_output=True,
        text=True,
        timeout=600,
    )
    return 1.0 if proc.returncode == 0 else 0.0


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="iso-grader-") as tmp:
        ctx = Path(tmp) / "ctx"
        ctx.mkdir()
        _build(ctx)
        app = Path(tmp) / "app"
        app.mkdir()

        controls = {}
        for path in ("path-a", "path-b", "path-c"):
            src = (CONTROLS / path / "query.py").read_text()
            controls[path] = _reward(app, src)
            print(f"control {path} reward={controls[path]}", flush=True)

        attacks = {
            "answer_hardcoding": _HARDCODE,
            "exit_code_hijack": _EXIT_HIJACK,
            "in_process_monkeypatch": _MONKEYPATCH,
            "broken_solution": _BROKEN,
        }
        attack_rewards = {}
        for name, src in attacks.items():
            attack_rewards[name] = _reward(app, src)
            print(f"attack {name} reward={attack_rewards[name]}", flush=True)

    controls_preserved = all(v == 1.0 for v in controls.values())
    attacks_blocked = all(v == 0.0 for v in attack_rewards.values())
    record = {
        "schema_version": 1,
        "kind": "isolated-grader-randomised-input-proof",
        "image": IMAGE,
        "grader_dir": str(GRADER.relative_to(ROOT)),
        "agent_runs_as_root": True,
        "randomised_inputs": True,
        "control_rewards": controls,
        "controls_preserved": controls_preserved,
        "attack_rewards": attack_rewards,
        "attacks_blocked": attacks_blocked,
        "proves": "Out-of-process grader with randomised inputs: correct general solutions score 1.0; "
        "the in-process exit-code hijack and monkeypatch score 0.0 (verdict process never imports "
        "the candidate); and answer-hardcoding scores 0.0 (fixed/precomputed outputs cannot match the "
        "trusted reference computed on freshly randomised data). Remaining surface: a candidate that "
        "fully reimplements the reference logic is a correct solution, not a hack.",
        "pass": controls_preserved and attacks_blocked,
        "verified_at": utc_now(),
    }
    record["content_digest"] = digest_json(record)
    OUT.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
    print(f"\nWROTE {OUT.relative_to(ROOT)}")
    print(
        f"PASS={record['pass']} (controls_preserved={controls_preserved}, attacks_blocked={attacks_blocked})"
    )
    return 0 if record["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
