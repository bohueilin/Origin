"""Mock Daytona — one isolated sandbox per agent, bound to its Passport.

Mirrors the real Daytona model: `create()` (optionally from a snapshot, sub-second),
isolated execution, `snapshot()`, and `stop(force=True)` / `delete()`. Handoff
A→B creates B's sandbox as a LINKED CHILD of A's, so the sandbox topology mirrors
the delegation tree — and killing a parent reaps every descendant (Daytona's
linked-children-are-ephemeral behaviour). To make the kill-switch tangible, each
sandbox launches a REAL OS subprocess representing the agent's running work; a kill
sends SIGKILL to that live PID, so containment is observable, not simulated.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

# A tiny idle worker = the "agent process" running inside the sandbox.
_WORKER_SRC = "import time, sys\nwhile True:\n    time.sleep(0.5)\n"


@dataclass
class Sandbox:
    sandbox_id: str
    agent_id: str
    passport_id: str
    parent_sandbox_id: Optional[str]
    created_at: float
    state: str = "RUNNING"  # RUNNING | SNAPSHOT | KILLED
    pid: Optional[int] = None
    snapshots: List[str] = field(default_factory=list)
    _proc: Optional[subprocess.Popen] = None


class SandboxManager:
    def __init__(self, ledger=None):
        self.sandboxes: Dict[str, Sandbox] = {}
        self.ledger = ledger

    def create(self, agent_id: str, passport, parent_sandbox_id: Optional[str] = None) -> Sandbox:
        proc = subprocess.Popen(
            [sys.executable, "-c", _WORKER_SRC],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        sb = Sandbox(
            sandbox_id="sbx_" + os.urandom(4).hex(),
            agent_id=agent_id,
            passport_id=passport.passport_id,
            parent_sandbox_id=parent_sandbox_id,
            created_at=time.time(),
            pid=proc.pid,
            _proc=proc,
        )
        self.sandboxes[sb.sandbox_id] = sb
        if self.ledger:
            link = f" (linked child of {parent_sandbox_id})" if parent_sandbox_id else " (isolated)"
            self.ledger.append(
                "SANDBOX_CREATED", agent_id,
                f"isolated sandbox {sb.sandbox_id} · pid {sb.pid}{link}",
                {"sandbox_id": sb.sandbox_id, "pid": sb.pid, "parent": parent_sandbox_id},
            )
        return sb

    def snapshot(self, sandbox_id: str) -> Optional[str]:
        sb = self.sandboxes.get(sandbox_id)
        if not sb or sb.state == "KILLED":
            return None
        snap = "snap_" + os.urandom(3).hex()
        sb.snapshots.append(snap)
        if self.ledger:
            self.ledger.append("SANDBOX_SNAPSHOT", sb.agent_id, f"snapshot {snap} of {sandbox_id}", {"snapshot": snap})
        return snap

    def _descendant_ids(self, sandbox_id: str) -> List[str]:
        kids = [s.sandbox_id for s in self.sandboxes.values() if s.parent_sandbox_id == sandbox_id]
        out = list(kids)
        for k in kids:
            out.extend(self._descendant_ids(k))
        return out

    def kill(self, sandbox_id: str, reason: str = "") -> List[str]:
        """Terminate a sandbox and EVERY descendant — real SIGKILL to each PID."""
        targets = [sandbox_id] + self._descendant_ids(sandbox_id)
        killed = []
        for sid in targets:
            sb = self.sandboxes.get(sid)
            if not sb or sb.state == "KILLED":
                continue
            if sb._proc and sb._proc.poll() is None:
                sb._proc.kill()
                try:
                    sb._proc.wait(timeout=2)
                except Exception:  # noqa: BLE001
                    pass
            sb.state = "KILLED"
            killed.append(sid)
        if killed and self.ledger:
            self.ledger.append(
                "SANDBOX_KILLED", self.sandboxes[sandbox_id].agent_id,
                f"SIGKILL {len(killed)} sandbox(es) {killed}" + (f" · {reason}" if reason else ""),
                {"killed": killed, "pids": [self.sandboxes[k].pid for k in killed]},
            )
        return killed

    def stop_all(self) -> None:
        for sb in self.sandboxes.values():
            if sb._proc and sb._proc.poll() is None:
                sb._proc.kill()
                try:
                    sb._proc.wait(timeout=2)  # reap — don't leave zombies on shutdown
                except Exception:  # noqa: BLE001
                    pass

    def live(self) -> List[Sandbox]:
        return [s for s in self.sandboxes.values() if s.state != "KILLED"]


def make_sandbox_manager(ledger=None) -> SandboxManager:
    """Select the sandbox runtime by env, defaulting to the local-subprocess mock so
    the zero-dependency demo always runs. `SANDBOX_BACKEND=daytona` swaps in the real
    Daytona adapter (lazy-imported; the SDK is never needed unless chosen)."""
    backend = os.environ.get("SANDBOX_BACKEND", "mock").lower()
    if backend in ("", "mock"):
        return SandboxManager(ledger=ledger)
    if backend == "daytona":
        from .sandbox_daytona import DaytonaSandboxManager  # lazy: real backend only

        return DaytonaSandboxManager(ledger=ledger)
    raise ValueError(f"unknown SANDBOX_BACKEND '{backend}' (use 'mock' or 'daytona')")
