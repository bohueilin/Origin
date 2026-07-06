"""Pluggable signing for Agent Passports.

Default backend is **asymmetric Ed25519** so the Authority keyring holds genuine
PUBLIC verification keys — a passport is offline-verifiable by anyone holding the
issuer's public key, and the private seed is required to sign. If the `cryptography`
package is importable it is used; otherwise a vendored, dependency-free pure-Python
Ed25519 (`_ed25519.py`) is used so the prototype is secure-by-default even with zero
dependencies.

Symmetric HMAC remains available ONLY behind `ORIGIN_INSECURE_HMAC=1` for local
dev/perf — it makes the keyring a shared secret (NOT public/offline-verifiable) and
prints a warning. The rest of the system depends only on the `Signer` interface, so
the backend swaps without touching passport / authority logic.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import sys
from dataclasses import dataclass


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


@dataclass(frozen=True)
class KeyPair:
    """An agent's keys. For HMAC, signing_key == verify_key (symmetric); for
    Ed25519 they differ (private vs public). The Authority's keyring stores only
    verify_key per agent id."""

    agent_id: str
    signing_key: bytes
    verify_key: bytes
    algorithm: str


class HmacSigner:
    algorithm = "HMAC-SHA256"

    def generate(self, agent_id: str) -> KeyPair:
        secret = os.urandom(32)
        return KeyPair(agent_id, secret, secret, self.algorithm)

    def sign(self, kp: KeyPair, message: bytes) -> bytes:
        return hmac.new(kp.signing_key, message, hashlib.sha256).digest()

    def verify(self, verify_key: bytes, message: bytes, signature: bytes) -> bool:
        expected = hmac.new(verify_key, message, hashlib.sha256).digest()
        return hmac.compare_digest(expected, signature)


try:  # optional asymmetric upgrade — used only if available, never required
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
        Ed25519PublicKey,
    )

    class Ed25519Signer:
        algorithm = "Ed25519"

        def generate(self, agent_id: str) -> KeyPair:
            sk = Ed25519PrivateKey.generate()
            return KeyPair(
                agent_id,
                sk.private_bytes_raw(),
                sk.public_key().public_bytes_raw(),
                self.algorithm,
            )

        def sign(self, kp: KeyPair, message: bytes) -> bytes:
            return Ed25519PrivateKey.from_private_bytes(kp.signing_key).sign(message)

        def verify(self, verify_key: bytes, message: bytes, signature: bytes) -> bool:
            try:
                Ed25519PublicKey.from_public_bytes(verify_key).verify(signature, message)
                return True
            except InvalidSignature:
                return False

    _HAS_ED25519 = True
except Exception:  # noqa: BLE001 - cryptography not installed; vendored Ed25519 is used
    _HAS_ED25519 = False


class PurePyEd25519Signer:
    """Asymmetric Ed25519 with NO third-party dependency (vendored RFC 8032 ref).
    Verification is memoized — passports are immutable, and the monitor re-verifies
    the same (key, message, signature) repeatedly, which would otherwise be slow."""

    algorithm = "Ed25519"

    def __init__(self) -> None:
        self._vcache: dict = {}

    def generate(self, agent_id: str) -> KeyPair:
        from . import _ed25519

        seed = os.urandom(32)
        return KeyPair(agent_id, seed, _ed25519.publickey(seed), self.algorithm)

    def sign(self, kp: KeyPair, message: bytes) -> bytes:
        from . import _ed25519

        return _ed25519.sign(message, kp.signing_key, kp.verify_key)

    def verify(self, verify_key: bytes, message: bytes, signature: bytes) -> bool:
        cache_key = (verify_key, message, signature)
        result = self._vcache.get(cache_key)
        if result is None:
            from . import _ed25519

            result = _ed25519.verify(verify_key, message, signature)
            self._vcache[cache_key] = result
        return result


def default_signer():
    """Asymmetric (Ed25519) by default so the keyring is genuinely public. HMAC is
    used ONLY when explicitly opted into via ORIGIN_INSECURE_HMAC=1 (local/dev), and
    prints a warning because it makes the keyring a shared signing secret."""
    if os.environ.get("ORIGIN_INSECURE_HMAC") == "1":
        print(
            "WARNING: ORIGIN_INSECURE_HMAC=1 — using symmetric HMAC signing. The keyring "
            "is a SHARED SECRET, not a public/offline-verifiable keyring. Local dev only.",
            file=sys.stderr,
        )
        return HmacSigner()
    return Ed25519Signer() if _HAS_ED25519 else PurePyEd25519Signer()


def fingerprint(verify_key: bytes) -> str:
    """Short, stable public-key fingerprint for display (like an SSH key hash)."""
    return "k_" + b64(hashlib.sha256(verify_key).digest())[:10]
