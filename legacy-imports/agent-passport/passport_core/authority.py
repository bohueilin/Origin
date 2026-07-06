"""The root Authority — issues root passports, holds the public keyring, registers
delegations, verifies the full trust chain, and owns revocation (the kill-switch's
teeth).

Model (biscuit / RFC 8693): the Authority signs ROOT passports; a PARENT agent
signs its CHILD's passport (delegation travels with the handoff). Verification
walks parent → … → root, checking at every hop: signature, expiry, revocation
epoch, and that the child scope is a strict subset of the parent's (no escalation,
ever — even against a tampered or malicious token).
"""
from __future__ import annotations

import os
import time
from typing import Dict, Optional, Set, Tuple

from .crypto import KeyPair, b64, default_signer, unb64
from .ledger import Ledger
from .passport import Passport
from .scope import Scope


class Authority:
    def __init__(self, signer=None, ledger: Optional[Ledger] = None):
        self.signer = signer or default_signer()
        self.ledger = ledger
        self.keyring: Dict[str, bytes] = {}  # agent_id -> verify_key
        self.registry: Dict[str, Passport] = {}  # passport_id -> Passport
        self.min_epoch: Dict[str, int] = {}  # subject -> lowest still-valid epoch
        self.root_kp = self.enroll("authority")

    # --- enrollment -------------------------------------------------------------
    def enroll(self, agent_id: str) -> KeyPair:
        """Register an agent's identity key. Returns the keypair the agent keeps to
        sign its own children; the Authority retains only the verify key.

        Identities must be globally unique: containment (revocation epochs, the kill
        set, the sandbox map) is keyed by subject, so a duplicate id would let one
        agent's kill revoke an unrelated namesake (sibling DoS) or mis-target a
        sandbox. We fail closed on collision rather than silently co-mingle identities."""
        if agent_id in self.keyring:
            raise ValueError(f"agent id '{agent_id}' is already enrolled — agent identities must be unique")
        kp = self.signer.generate(agent_id)
        self.keyring[agent_id] = kp.verify_key
        return kp

    # --- minting ----------------------------------------------------------------
    def _sign(self, passport: Passport, issuer_kp: KeyPair) -> Passport:
        passport.signature = b64(self.signer.sign(issuer_kp, passport.canonical_bytes()))
        return passport

    def issue_root(self, subject: str, scope: Scope, ttl_seconds: int = 600) -> Passport:
        now = time.time()
        p = Passport(
            subject=subject,
            issuer="authority",
            scope=scope.to_dict(),
            chain=[subject],
            issued_at=now,
            expires_at=now + ttl_seconds,
            epoch=self.min_epoch.get(subject, 0),
            nonce=os.urandom(6).hex(),
            algorithm=self.signer.algorithm,
        )
        self._sign(p, self.root_kp)
        self.registry[p.passport_id] = p
        self._log("PASSPORT_MINTED", subject, f"root passport · {scope.summary()}", p.to_dict())
        return p

    def delegate(
        self,
        parent_passport: Passport,
        parent_kp: KeyPair,
        child_subject: str,
        requested_scope: Scope,
        ttl_seconds: Optional[int] = None,
    ) -> Passport:
        """Parent mints + signs a child passport, attenuated to ⊆ parent scope."""
        ok, reason = self.verify(parent_passport)
        if not ok:
            raise PermissionError(f"parent passport invalid: {reason}")
        parent_scope = parent_passport.get_scope()
        if parent_scope.max_children <= 0:
            raise PermissionError("parent has no remaining sub-agent budget")
        if parent_scope.max_depth <= 0:
            raise PermissionError("parent has reached maximum delegation depth")
        granted = parent_scope.intersect(requested_scope)
        now = time.time()
        # Explicit ttl wins; else the attenuated child ttl; else a 300s default. None
        # (unbounded scope ttl) falls back to the default rather than never-expiring.
        eff_ttl = ttl_seconds if ttl_seconds is not None else (granted.ttl_seconds if granted.ttl_seconds is not None else 300)
        exp = min(now + eff_ttl, parent_passport.expires_at)  # a child can never outlive its parent
        child = Passport(
            subject=child_subject,
            issuer=parent_passport.subject,
            parent_id=parent_passport.passport_id,
            chain=parent_passport.chain + [child_subject],
            scope=granted.to_dict(),
            issued_at=now,
            expires_at=exp,
            epoch=self.min_epoch.get(child_subject, 0),
            nonce=os.urandom(6).hex(),
            algorithm=self.signer.algorithm,
        )
        self._sign(child, parent_kp)  # the PARENT signs — trust travels with the handoff
        self.registry[child.passport_id] = child
        ok, reason = self.verify(child)
        if not ok:
            del self.registry[child.passport_id]
            raise PermissionError(f"child passport rejected: {reason}")
        self._log(
            "PASSPORT_MINTED",
            child_subject,
            f"delegated by {parent_passport.subject} · {granted.summary()}",
            child.to_dict(),
        )
        return child

    # --- verification -----------------------------------------------------------
    def verify(self, passport: Passport, now: Optional[float] = None) -> Tuple[bool, str]:
        now = now or time.time()
        issuer_key = self.keyring.get(passport.issuer)
        if issuer_key is None:
            return False, f"unknown issuer '{passport.issuer}'"
        try:
            sig = unb64(passport.signature)
        except Exception:  # noqa: BLE001
            return False, "malformed signature"
        if not self.signer.verify(issuer_key, passport.canonical_bytes(), sig):
            return False, "signature mismatch (tampered)"
        if passport.is_expired(now):
            return False, "expired"
        if passport.epoch < self.min_epoch.get(passport.subject, 0):
            return False, "revoked"
        if passport.parent_id is None:
            if passport.issuer != "authority":
                return False, "root passport not signed by the Authority"
            return True, "ok"
        parent = self.registry.get(passport.parent_id)
        if parent is None:
            return False, "parent passport not found"
        # Delegation must be signed BY the parent: the issuer (whose key we verified
        # the signature with, above) must be the parent's subject. Without this, any
        # enrolled signer could mint a child under someone else's parent_id/chain.
        if passport.issuer != parent.subject:
            return False, "delegated passport not signed by its parent"
        if passport.chain[:-1] != parent.chain:
            return False, "broken trust chain"
        pok, preason = self.verify(parent, now)
        if not pok:
            return False, f"parent invalid: {preason}"
        if not passport.get_scope().is_subset_of(parent.get_scope()):
            return False, "scope escalation vs parent"
        return True, "ok"

    # --- revocation (the kill-switch's teeth) -----------------------------------
    def revoke(self, subject: str, reason: str = "") -> None:
        self.min_epoch[subject] = self.min_epoch.get(subject, 0) + 1
        if self.ledger:
            self.ledger.append(
                "REVOKED", subject, reason or "passport revoked",
                {"new_min_epoch": self.min_epoch[subject]},
            )

    def descendants(self, subject: str) -> Set[str]:
        """Every agent whose trust chain passes through `subject` (its delegation
        subtree) — so a kill can reap the whole branch."""
        out: Set[str] = set()
        for p in self.registry.values():
            if subject in p.chain and p.subject != subject:
                out.add(p.subject)
        return out

    def _log(self, kind: str, actor: str, detail: str, data: dict) -> None:
        if self.ledger:
            self.ledger.append(kind, actor, detail, data)
