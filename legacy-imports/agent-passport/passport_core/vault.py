"""Mock 1Password — scoped, short-lived credential leases bound to a Passport.

Mirrors the real 1Password model: Service Accounts (least privilege), `op://`
secret references, and `op run` semantics where a secret lives in memory for the
life of one process only — never on disk, never in a log. A lease is issued ONLY
if the presenting passport's scope permits that `op://` reference; it carries its
own TTL (bounded by the sandbox lifetime) and is torn down the instant the
kill-switch fires. The raw secret is never logged or printed — only a masked handle.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Dict, List, Optional


def _mask(secret: str) -> str:
    tail = secret[-4:] if len(secret) >= 4 else "????"
    return f"••••••••{tail}"


@dataclass
class Lease:
    lease_id: str
    ref: str  # op:// reference
    subject: str  # agent id holding the lease
    sandbox_id: Optional[str]
    issued_at: float
    expires_at: float
    revoked: bool = False
    _secret: str = ""  # in-memory only; never serialized to the ledger/UI

    @property
    def masked(self) -> str:
        return _mask(self._secret)

    def active(self, now: Optional[float] = None) -> bool:
        return (not self.revoked) and (now or time.time()) < self.expires_at

    def reveal(self) -> str:
        """Used ONLY inside the sandbox at the moment of use. Never logged."""
        if not self.active():
            raise PermissionError("lease expired or revoked")
        return self._secret


class Vault:
    """A scoped secrets broker. Secrets are stored against `op://` refs; leases are
    minted per-passport and tracked so the kill-switch can revoke them instantly."""

    def __init__(self, ledger=None):
        self._secrets: Dict[str, str] = {}
        self.leases: Dict[str, Lease] = {}
        self.ledger = ledger

    def put(self, ref: str, secret: str) -> None:
        if not ref.startswith("op://"):
            raise ValueError("secret ref must be an op:// reference")
        self._secrets[ref] = secret

    def issue_lease(self, passport, ref: str, sandbox_id: Optional[str], ttl_seconds: int = 60) -> Lease:
        """Mint a short-lived lease iff the passport scope permits `ref`. Raises
        PermissionError otherwise (the caller logs the DENY)."""
        scope = passport.get_scope()
        if not scope.allows_secret(ref):
            raise PermissionError(f"passport scope does not permit {ref}")
        if ref not in self._secrets:
            raise KeyError(f"no secret registered at {ref}")
        now = time.time()
        exp = min(now + ttl_seconds, passport.expires_at)
        lease = Lease(
            lease_id="lease_" + os.urandom(4).hex(),
            ref=ref,
            subject=passport.subject,
            sandbox_id=sandbox_id,
            issued_at=now,
            expires_at=exp,
            _secret=self._secrets[ref],
        )
        self.leases[lease.lease_id] = lease
        if self.ledger:
            self.ledger.append(
                "LEASE_ISSUED", passport.subject,
                f"scoped credential {ref} → {lease.masked} (in-memory, ttl {int(exp - now)}s)",
                {"lease_id": lease.lease_id, "ref": ref, "masked": lease.masked},
            )
        return lease

    def revoke_for(self, subject: str, reason: str = "") -> List[str]:
        """Revoke every lease held by an agent (kill-switch). Returns lease ids."""
        killed = []
        for lease in self.leases.values():
            if lease.subject == subject and not lease.revoked:
                lease.revoked = True
                lease._secret = ""  # scrub from memory
                killed.append(lease.lease_id)
        if killed and self.ledger:
            self.ledger.append(
                "LEASE_REVOKED", subject, reason or f"{len(killed)} lease(s) torn down",
                {"lease_ids": killed},
            )
        return killed

    def suspend_identity(self, subject: str, reason: str = "") -> dict:
        """Identity-plane half of the dual-plane kill. In production this calls the
        1Password Users API to SUSPEND the agent's non-human identity (so it can't even
        re-authenticate). The mock logs a clearly-SIMULATED event so the dual-plane
        (compute + identity) kill reads end-to-end offline. Best-effort by contract —
        the caller never lets this block containment."""
        result = {"plane": "identity", "mode": "simulated", "subject": subject}
        if self.ledger:
            self.ledger.append(
                "IDENTITY_SUSPENDED", subject,
                f"identity suspended · simulated{(' · ' + reason) if reason else ''}", result,
            )
        return result


def make_vault(ledger=None) -> Vault:
    """Select the credential broker by env, defaulting to the in-memory mock so the
    zero-dependency demo always runs. `VAULT_BACKEND=onepassword` swaps in the real
    1Password adapter (lazy-imported, so the `op` CLI is never needed unless chosen)."""
    backend = os.environ.get("VAULT_BACKEND", "mock").lower()
    if backend in ("", "mock"):
        return Vault(ledger=ledger)
    if backend in ("onepassword", "1password", "op"):
        from .vault_onepassword import OnePasswordVault  # lazy: real backend only

        return OnePasswordVault(ledger=ledger)
    raise ValueError(f"unknown VAULT_BACKEND '{backend}' (use 'mock' or 'onepassword')")
