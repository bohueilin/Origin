"""Append-only, hash-chained audit ledger — the tamper-evident record of the whole
identity lifecycle (Origin's "Approval seal", applied to agent actions).

Each entry commits to the hash of the previous entry, so any after-the-fact edit
or deletion breaks the chain and is detectable. This is the auditability layer the
hackathon asks for: who authorized whom, what they did, and exactly when a breach
was contained.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict, dataclass, field
from typing import Callable, List, Optional

GENESIS = "0" * 64


@dataclass
class Entry:
    seq: int
    ts: float
    kind: str  # PASSPORT_MINTED, LEASE_ISSUED, SANDBOX_CREATED, ACTION_ALLOW, ACTION_DENY, KILL, ...
    actor: str  # agent id
    detail: str
    data: dict
    prev_hash: str
    hash: str = ""

    def _digest(self) -> str:
        body = {k: v for k, v in asdict(self).items() if k != "hash"}
        return hashlib.sha256(
            json.dumps(body, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()

    def seal(self) -> "Entry":
        self.hash = self._digest()
        return self


class Ledger:
    def __init__(self, on_append: Optional[Callable[[Entry], None]] = None):
        self.entries: List[Entry] = []
        self._on_append = on_append  # live hook (dashboard streaming)

    def append(self, kind: str, actor: str, detail: str, data: Optional[dict] = None) -> Entry:
        prev = self.entries[-1].hash if self.entries else GENESIS
        entry = Entry(
            seq=len(self.entries),
            ts=time.time(),
            kind=kind,
            actor=actor,
            detail=detail,
            data=data or {},
            prev_hash=prev,
        ).seal()
        self.entries.append(entry)
        if self._on_append:
            self._on_append(entry)
        return entry

    def verify_chain(self) -> bool:
        """Re-derive every hash and confirm the prev-links are intact."""
        prev = GENESIS
        for e in self.entries:
            if e.prev_hash != prev or e._digest() != e.hash:
                return False
            prev = e.hash
        return True

    def head(self) -> str:
        return self.entries[-1].hash if self.entries else GENESIS

    def seal_id(self) -> str:
        """Short fingerprint of the whole ledger head — the audit 'seal'."""
        return "seal_" + self.head()[:12]
