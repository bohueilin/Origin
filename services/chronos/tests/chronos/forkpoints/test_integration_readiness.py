from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from dotenv import load_dotenv

pytestmark = pytest.mark.integration


def test_integration_readiness_probe_runs_from_mapped_command():
    load_dotenv(Path(__file__).resolve().parents[3] / ".env")
    env = os.environ.copy()
    env["PYTHONPATH"] = "src"
    if not env.get("HUD_API_KEY"):
        pytest.skip("HUD_API_KEY is required for the real trace-boundary export")
    completed = subprocess.run(
        [sys.executable, "-m", "chronos.forkpoints.integration_probe"],
        check=False,
        capture_output=True,
        env=env,
        text=True,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert "PASS integration-readiness" in completed.stdout
