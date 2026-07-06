"""Real Daytona sandbox runtime — a drop-in for the mock `SandboxManager`.

Selected with `SANDBOX_BACKEND=daytona`. Each agent gets an isolated Daytona sandbox
(`daytona.create(... ephemeral=True ...)`); the delegation tree (parent/descendant) is
tracked locally exactly as in the mock, so the kill-switch still reaps a whole subtree.

The same public interface as `SandboxManager` (create / snapshot / kill / stop_all / live)
and the same `Sandbox` dataclass + ledger events, so the monitor/agents/UI are unchanged.

Safety: a real, irreversible `delete(force=True)` is only issued when
`ALLOW_REAL_SANDBOX_KILL=1`; otherwise the kill flips local state only (and ephemeral
sandboxes self-reap), so the kill-switch demo is always safe and offline-friendly. Never
runs unless explicitly selected; the demo default stays the local-subprocess mock.

Setup (one-time, never committed):
    export DAYTONA_API_KEY=...
    export SANDBOX_BACKEND=daytona
    # optional, opt-in to real deletion on kill:
    export ALLOW_REAL_SANDBOX_KILL=1
"""
from __future__ import annotations

import os
import time
from typing import List, Optional

from .sandbox import Sandbox, SandboxManager


class DaytonaSandboxManager(SandboxManager):
    def __init__(self, ledger=None):
        super().__init__(ledger=ledger)
        if not os.environ.get("DAYTONA_API_KEY"):
            raise RuntimeError(
                "SANDBOX_BACKEND=daytona requires DAYTONA_API_KEY. See sandbox_daytona.py."
            )
        from daytona import Daytona  # lazy: SDK only needed when this backend is selected

        self._client = Daytona()
        self._handles: dict = {}  # our sandbox_id -> real Daytona sandbox handle
        self._allow_real_kill = os.environ.get("ALLOW_REAL_SANDBOX_KILL") == "1"

    def create(self, agent_id: str, passport, parent_sandbox_id: Optional[str] = None) -> Sandbox:
        from daytona import CreateSandboxFromSnapshotParams

        # ephemeral → self-reaps; labels carry the passport so the tree is queryable; and
        # linked_sandbox makes the parent/child link first-class IN Daytona (a real
        # delegation tree), so reaping a parent can cascade to its linked children.
        kwargs = {
            "ephemeral": True,
            "labels": {
                "agent_id": agent_id,
                "passport_id": passport.passport_id,
                "parent": parent_sandbox_id or "",
            },
        }
        parent_real = self._handles.get(parent_sandbox_id) if parent_sandbox_id else None
        if parent_real is not None:
            kwargs["linked_sandbox"] = getattr(parent_real, "id", parent_sandbox_id)
        real = self._client.create(CreateSandboxFromSnapshotParams(**kwargs))
        sb = Sandbox(
            sandbox_id="sbx_" + os.urandom(4).hex(),
            agent_id=agent_id, passport_id=passport.passport_id,
            parent_sandbox_id=parent_sandbox_id, created_at=time.time(), pid=None,
        )
        self.sandboxes[sb.sandbox_id] = sb
        self._handles[sb.sandbox_id] = real
        if self.ledger:
            link = f" (linked child of {parent_sandbox_id})" if parent_sandbox_id else " (isolated)"
            self.ledger.append(
                "SANDBOX_CREATED", agent_id,
                f"Daytona sandbox {sb.sandbox_id}{link}",
                {"sandbox_id": sb.sandbox_id, "parent": parent_sandbox_id},
            )
        return sb

    def kill(self, sandbox_id: str, reason: str = "") -> List[str]:
        targets = [sandbox_id] + self._descendant_ids(sandbox_id)
        killed = []
        for sid in targets:
            sb = self.sandboxes.get(sid)
            if not sb or sb.state == "KILLED":
                continue
            real = self._handles.get(sid)
            if real is not None and self._allow_real_kill:
                try:
                    real.delete()  # irreversible; opt-in only
                except Exception:  # noqa: BLE001 - never let a remote error block containment
                    pass
            sb.state = "KILLED"
            killed.append(sid)
        if killed and self.ledger:
            self.ledger.append(
                "SANDBOX_KILLED", self.sandboxes[sandbox_id].agent_id,
                f"killed {len(killed)} Daytona sandbox(es) {killed}" + (f" · {reason}" if reason else ""),
                {"killed": killed, "real_delete": self._allow_real_kill},
            )
        return killed

    def stop_all(self) -> None:
        if not self._allow_real_kill:
            return  # ephemeral sandboxes self-reap; nothing to force locally
        for sid, real in self._handles.items():
            sb = self.sandboxes.get(sid)
            if sb and sb.state != "KILLED":
                try:
                    real.delete()
                except Exception:  # noqa: BLE001
                    pass
