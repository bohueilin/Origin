"""The Agent Passport — a signed, scoped, delegatable capability token.

A passport authorizes ONE agent (`subject`) to act within `scope`, signed by its
`issuer` (the root Authority, or a parent agent). `chain` records the full transit
path of trust (root → … → subject) so an auditor can see exactly who authorized
whom. Delegation produces a child passport whose scope is attenuated (⊆ parent) and
signed by the parent — trust travels with the handoff, and can only narrow.
"""
from __future__ import annotations

import json
import os
import time
import unicodedata
from dataclasses import asdict, dataclass, field
from typing import List, Optional

from .scope import Scope

VERSION = 1


def _canon(v):
    """Normalize a value so semantically-equal passports share one signing image:
    NFC-normalize all strings (so NFC/NFD forms of an id can't diverge) and fold
    whole-number floats to ints (so 1 and 1.0 agree). Applied recursively."""
    if isinstance(v, bool):  # bool is an int subclass — leave it alone
        return v
    if isinstance(v, str):
        return unicodedata.normalize("NFC", v)
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, dict):
        return {_canon(k): _canon(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_canon(x) for x in v]
    return v


def new_id() -> str:
    return "psp_" + os.urandom(6).hex()


@dataclass
class Passport:
    subject: str
    issuer: str
    scope: dict
    chain: List[str]
    issued_at: float
    expires_at: float
    epoch: int
    nonce: str
    algorithm: str
    parent_id: Optional[str] = None
    passport_id: str = field(default_factory=new_id)
    version: int = VERSION
    signature: str = ""  # urlsafe-b64; set by the issuer

    def canonical_bytes(self) -> bytes:
        """Stable byte image of everything the signature commits to (all fields
        except the signature itself). Any tamper changes these bytes → verify fails."""
        d = {k: v for k, v in asdict(self).items() if k != "signature"}
        return json.dumps(_canon(d), sort_keys=True, separators=(",", ":")).encode()

    def get_scope(self) -> Scope:
        return Scope.from_dict(self.scope)

    def is_expired(self, now: Optional[float] = None) -> bool:
        return (now or time.time()) > self.expires_at

    def to_dict(self) -> dict:
        return asdict(self)

    # --- display helpers --------------------------------------------------------
    def short(self) -> str:
        return self.passport_id

    def path(self) -> str:
        return " → ".join(self.chain)
