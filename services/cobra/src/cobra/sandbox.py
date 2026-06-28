"""Shared subprocess sandbox: run one pytest suite under hard limits, return pass/fail.

Both the grader (visible tests) and the oracle (held-out plus tests) run through this, so
they share identical hardening: a hard wall-clock timeout, no network, CPU/memory caps, and
a verdict parsed from pytest's structured JUnit XML report — never from exit codes.
Deterministic: same target-dir bytes -> same result.
"""

import os
import shutil
import signal
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

_ENTRY = "cobra._sandbox_entry"
DEFAULT_TIMEOUT = 30.0
DEFAULT_MEM_MB = 2048


def run_suite(
    target_dir,
    test_file: str = "test_visible.py",
    timeout: float = DEFAULT_TIMEOUT,
    mem_mb: int = DEFAULT_MEM_MB,
) -> int:
    """Run `test_file` in `target_dir` in a sandboxed subprocess.

    Returns 1 iff at least one test ran with zero failures/errors. Timeout, crash, OOM,
    or a missing/garbled report -> 0.
    """
    target_dir = Path(target_dir)
    report_dir = Path(tempfile.mkdtemp(prefix="cobra_run_"))
    report = report_dir / "report.xml"  # outside target_dir — the code under test can't touch it
    cpu_seconds = int(timeout) + 1
    cmd = [
        sys.executable,
        "-s",
        "-m",
        _ENTRY,
        str(target_dir),
        str(report),
        test_file,
        str(mem_mb),
        str(cpu_seconds),
    ]
    try:
        proc = subprocess.Popen(
            cmd,
            env=_sandbox_env(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
        )
        try:
            proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            _kill_group(proc)
            proc.communicate()
            return 0  # timeout = fail
        return _parse_report(report)
    finally:
        shutil.rmtree(report_dir, ignore_errors=True)


def _sandbox_env() -> dict:
    """A deterministic environment; drop PYTHONPATH injection and proxy vars."""
    env = os.environ.copy()
    for key in ("PYTHONPATH", "PYTHONSTARTUP", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        env.pop(key, None)
        env.pop(key.lower(), None)
    env["PYTHONHASHSEED"] = "0"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] = "1"  # only core plugins -> deterministic
    return env


def _kill_group(proc: subprocess.Popen) -> None:
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        proc.kill()


def _parse_report(report: Path) -> int:
    if not report.exists():
        return 0  # process died before writing (crash / OOM-kill / hard exit)
    try:
        root = ET.parse(report).getroot()
    except ET.ParseError:
        return 0
    suites = root.findall("testsuite") if root.tag == "testsuites" else [root]
    total = failures = errors = skipped = 0
    for suite in suites:
        total += int(suite.get("tests", "0"))
        failures += int(suite.get("failures", "0"))
        errors += int(suite.get("errors", "0"))
        skipped += int(suite.get("skipped", "0"))
    ran = total - skipped
    return int(ran >= 1 and failures == 0 and errors == 0)
