"""Real 1Password credential broker — a drop-in for the mock `Vault`.

Selected with `VAULT_BACKEND=onepassword`. Authenticates via a 1Password **Service
Account** (`OP_SERVICE_ACCOUNT_TOKEN`). The actual secret lives in 1Password, not in
this process. A lease is minted only if the passport's scope permits the `op://`
reference; the secret is fetched **just-in-time**, held in memory for the lease
lifetime, masked everywhere it's displayed, and scrubbed on revoke.

Two real fetch paths, in priority order (both in-memory, neither writes to disk):
  1. **1Password SDK** (`onepassword-sdk`, async): `client.secrets.resolve("op://…")`
     — the canonical agentic path 1Password recommends. Lazy-imported + cached client.
  2. **`op` CLI fallback**: `op read op://…` (auth from OP_SERVICE_ACCOUNT_TOKEN).

Same public interface as `Vault` (put / issue_lease / revoke_for + the `Lease` contract),
so nothing else in the system changes. Never runs unless explicitly selected; the demo
default stays the in-memory mock.

Setup (one-time, least privilege, never committed):
    pip install onepassword-sdk          # for the SDK path
    # or: brew install 1password-cli      # for the op-CLI fallback
    export OP_SERVICE_ACCOUNT_TOKEN=ops_...     # least-privilege, read-only; env only
    export VAULT_BACKEND=onepassword
Refs are standard `op://<vault>/<item>/<field>`.
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import time
import urllib.request
from typing import Optional

from .vault import Lease, Vault  # reuse the Lease contract (masking lives on Lease)


class OnePasswordVault(Vault):
    def __init__(self, ledger=None):
        super().__init__(ledger=ledger)
        if not os.environ.get("OP_SERVICE_ACCOUNT_TOKEN"):
            raise RuntimeError(
                "VAULT_BACKEND=onepassword requires a 1Password Service Account: set "
                "OP_SERVICE_ACCOUNT_TOKEN (least-privilege, read-only). See vault_onepassword.py."
            )
        self._refs: set = set()        # registered op:// references (the secret lives in 1Password)
        self._sdk_client = None        # cached, lazily-authenticated SDK client
        self._sdk_unavailable = False  # set once if the SDK isn't importable → use CLI
        self.backend_label = "1Password"  # refined to SDK/CLI on first fetch (for the UI)

    def put(self, ref: str, secret: Optional[str] = None) -> None:
        # The real secret already lives in 1Password; we only register that the ref is
        # in play (so issue_lease can validate it). Any provided literal is ignored —
        # never stored, never logged.
        if not ref.startswith("op://"):
            raise ValueError("secret ref must be an op:// reference")
        self._refs.add(ref)

    # ── real fetch paths (in-memory only) ──────────────────────────────────────
    def _resolve_sdk(self, ref: str) -> Optional[str]:
        """1Password SDK path. Returns the secret, or None if the SDK isn't available
        (so the caller falls back to the CLI). Auth is cached across leases."""
        if self._sdk_unavailable:
            return None
        try:
            from onepassword.client import Client  # lazy: only when this backend is used
        except Exception:  # noqa: BLE001 - SDK not installed; fall back to the op CLI
            self._sdk_unavailable = True
            return None

        async def _run() -> str:
            if self._sdk_client is None:
                self._sdk_client = await Client.authenticate(
                    auth=os.environ["OP_SERVICE_ACCOUNT_TOKEN"],
                    integration_name="Passport",
                    integration_version="v1.0.0",
                )
            return await self._sdk_client.secrets.resolve(ref)  # op://… resolved in memory

        secret = asyncio.run(_run())
        self.backend_label = "1Password SDK"
        return secret

    def _resolve_cli(self, ref: str) -> str:
        """`op read op://vault/item/field` — auth from OP_SERVICE_ACCOUNT_TOKEN in env."""
        proc = subprocess.run(
            ["op", "read", ref],
            capture_output=True, text=True, timeout=20, env={**os.environ},
        )
        if proc.returncode != 0:
            raise RuntimeError(f"op read failed for {ref}: {proc.stderr.strip()[:120]}")
        self.backend_label = "1Password CLI"
        return proc.stdout.strip()

    def _resolve(self, ref: str) -> str:
        """JIT fetch, SDK-first then CLI. In-memory only; the raw value is never logged."""
        secret = self._resolve_sdk(ref)
        if secret is None:
            secret = self._resolve_cli(ref)
        return secret

    def issue_lease(self, passport, ref: str, sandbox_id: Optional[str], ttl_seconds: int = 60) -> Lease:
        scope = passport.get_scope()
        if not scope.allows_secret(ref):
            raise PermissionError(f"passport scope does not permit {ref}")
        if ref not in self._refs:
            raise KeyError(f"no secret registered at {ref}")
        secret = self._resolve(ref)  # just-in-time fetch from 1Password; in-memory only
        now = time.time()
        exp = min(now + ttl_seconds, passport.expires_at)
        lease = Lease(
            lease_id="lease_" + os.urandom(4).hex(),
            ref=ref, subject=passport.subject, sandbox_id=sandbox_id,
            issued_at=now, expires_at=exp, _secret=secret,
        )
        self.leases[lease.lease_id] = lease
        if self.ledger:
            self.ledger.append(
                "LEASE_ISSUED", passport.subject,
                f"{self.backend_label} lease {ref} → {lease.masked} (in-memory, ttl {int(exp - now)}s)",
                {"lease_id": lease.lease_id, "ref": ref, "masked": lease.masked},
            )
        return lease

    def suspend_identity(self, subject: str, reason: str = "") -> dict:
        """Identity-plane kill via the 1Password **Users API** `:suspend` — REAL when
        configured (Business/Enterprise + an OAuth partner app). Needs OP_USERS_API_TOKEN,
        OP_ACCOUNT_ID, and a subject→user_id map (OP_USER_MAP, JSON). NOTE: service-ACCOUNT
        *token* revocation has NO API (console-only) — so we suspend the **user** identity.
        Best-effort: any failure is logged and swallowed so it never blocks containment."""
        token = os.environ.get("OP_USERS_API_TOKEN")
        account = os.environ.get("OP_ACCOUNT_ID")
        try:
            user_map = json.loads(os.environ.get("OP_USER_MAP", "{}"))
        except Exception:  # noqa: BLE001
            user_map = {}
        uid = user_map.get(subject)
        base = os.environ.get("OP_USERS_API_BASE", "https://api.1password.com")
        if token and account and uid:
            try:
                req = urllib.request.Request(
                    f"{base}/v1beta1/accounts/{account}/users/{uid}:suspend",
                    data=b"", method="POST",
                    headers={"Authorization": f"Bearer {token}", "User-Agent": "Passport/0.1"},
                )
                with urllib.request.urlopen(req, timeout=15) as r:  # noqa: S310 - fixed 1Password host
                    r.read()
                result = {"plane": "identity", "mode": "real", "state": "SUSPENDED", "subject": subject}
            except Exception as exc:  # noqa: BLE001 - never block containment
                result = {"plane": "identity", "mode": "error", "subject": subject, "error": str(exc)[:100]}
        else:
            result = {"plane": "identity", "mode": "simulated", "subject": subject,
                      "note": "set OP_USERS_API_TOKEN + OP_ACCOUNT_ID + OP_USER_MAP for the real "
                              ":suspend; service-account token revoke is console-only"}
        if self.ledger:
            self.ledger.append(
                "IDENTITY_SUSPENDED", subject,
                f"1Password identity suspend · {result['mode']}{(' · ' + reason) if reason else ''}", result,
            )
        return result

    # revoke_for() is inherited unchanged — it scrubs `_secret` and logs only lease ids.
