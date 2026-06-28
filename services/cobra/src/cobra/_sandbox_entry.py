"""Sandbox subprocess entrypoint — run one test file under network/CPU/memory limits.

Invoked ONLY as a subprocess:
    python -m cobra._sandbox_entry <target_dir> <report> <test_file> <mem_mb> <cpu_seconds>
It mutates global process state (disables sockets, sets rlimits) and is meant to die with
the child — never import it in-process.
"""

import os
import sys


def _disable_network() -> None:
    """Make any socket use raise — a portable, in-process 'no network'."""
    import socket

    def _blocked(*args, **kwargs):
        raise OSError("network access is disabled in the sandbox")

    socket.socket = _blocked
    socket.create_connection = _blocked
    socket.create_server = _blocked


def _limit_resources(mem_mb: int, cpu_seconds: int) -> None:
    """Best-effort CPU and memory caps (Unix). The hard wall-clock timeout in the parent
    is the primary guard; these are backstops."""
    try:
        import resource
    except ImportError:
        return
    if cpu_seconds > 0 and hasattr(resource, "RLIMIT_CPU"):
        try:
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        except (ValueError, OSError):
            pass
    # RLIMIT_AS on macOS routinely kills normal processes (huge reserved virtual memory),
    # so only cap address space on Linux.
    if mem_mb > 0 and sys.platform.startswith("linux") and hasattr(resource, "RLIMIT_AS"):
        nbytes = mem_mb * 1024 * 1024
        try:
            resource.setrlimit(resource.RLIMIT_AS, (nbytes, nbytes))
        except (ValueError, OSError):
            pass


def main() -> None:
    target_dir, report_path, test_file, mem_mb, cpu_seconds = (
        sys.argv[1],
        sys.argv[2],
        sys.argv[3],
        int(sys.argv[4]),
        int(sys.argv[5]),
    )
    _disable_network()
    _limit_resources(mem_mb, cpu_seconds)
    os.chdir(target_dir)
    sys.path.insert(0, target_dir)

    import pytest

    raise SystemExit(
        pytest.main(
            [
                test_file,
                f"--junitxml={report_path}",
                "-p",
                "no:cacheprovider",
                "-q",
            ]
        )
    )


if __name__ == "__main__":
    main()
