#!/usr/bin/env python3
"""Run all planning-bundle validators and write a machine-readable report."""

from __future__ import annotations

import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PLAN_DIR = SCRIPT_DIR.parent

VALIDATORS = [
    "validate_graph.py",
    "validate_sections.py",
    "validate_ownership.py",
    "validate_traceability.py",
    "validate_evidence.py",
    "validate_file_sizes.py",
]


def main() -> int:
    results: list[dict[str, object]] = []
    failed = False
    for name in VALIDATORS:
        command = [sys.executable, str(SCRIPT_DIR / name)]
        completed = subprocess.run(command, text=True, capture_output=True, check=False)
        result = {
            "validator": name,
            "argv": command,
            "exit_code": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
        results.append(result)
        print(f"== {name} ==")
        if completed.stdout:
            print(completed.stdout.rstrip())
        if completed.stderr:
            print(completed.stderr.rstrip(), file=sys.stderr)
        if completed.returncode != 0:
            failed = True

    report = {
        "schema_version": 1,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "status": "fail" if failed else "pass",
        "results": results,
    }
    report_path = PLAN_DIR / "VALIDATION-RESULTS.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {report_path}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
