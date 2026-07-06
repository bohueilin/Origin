"""1Password Events API audit feed — "every credential access is recorded."

Pulls the 1Password activity trail so the dashboard can show, beside our own
hash-chained ledger, that the credential plane itself recorded every sign-in / audit
event (non-repudiation, defense-in-depth). Stdlib only (`urllib`), zero dependencies.

Honesty (verified against 1Password docs):
  • `signinattempts` and `auditevents` ARE recorded for Service Accounts → REAL when an
    `OP_EVENTS_TOKEN` is set (Events Reporting → issue token; Business/Teams).
  • `itemusages` is NOT emitted by a Service-Account `secrets.resolve()` — so we surface
    per-fetch item usage ONLY as a clearly-labeled **simulated** feed; we never imply a
    capability 1Password doesn't expose for service accounts.
  • With no token (the demo default) the whole feed is simulated + labeled, so it runs
    offline and never fabricates a "real" trail.

Endpoint: POST {OP_EVENTS_BASE}/api/v2/{signinattempts|auditevents}  (Bearer token).
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from typing import List, Dict

EVENTS_BASE = os.environ.get("OP_EVENTS_BASE", "https://events.1password.com")
REAL_ENDPOINTS = ("signinattempts", "auditevents")


def _iso(ts: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def _post(endpoint: str, token: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{EVENTS_BASE}/api/v2/{endpoint}",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "User-Agent": "Passport/0.1"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:  # noqa: S310 - fixed 1Password host
        return json.loads(r.read().decode())


def _norm(endpoint: str, item: dict, simulated: bool) -> Dict:
    return {
        "kind": endpoint,
        "actor": (item.get("target_user") or {}).get("name")
                 or (item.get("actor") or {}).get("name") or item.get("uuid", "service-account"),
        "detail": item.get("action") or item.get("category") or item.get("type") or endpoint,
        "time": item.get("timestamp") or _iso(time.time()),
        "simulated": simulated,
    }


def _fetch_real(endpoint: str, token: str, limit: int) -> List[Dict]:
    data = _post(endpoint, token, {"limit": limit, "start_time": _iso(time.time() - 3600)})
    return [_norm(endpoint, it, simulated=False) for it in data.get("items", [])]


def _simulated() -> List[Dict]:
    now = time.time()
    return [
        {"kind": "signinattempts", "actor": "origin-passport (service account)",
         "detail": "credentials · success", "time": _iso(now - 9), "simulated": True},
        {"kind": "itemusages", "actor": "airline-agent",
         "detail": "op://airline/passport-no · resolved (in-memory)", "time": _iso(now - 7), "simulated": True},
        {"kind": "itemusages", "actor": "payments-agent",
         "detail": "op://payments/virtual-card · resolved (in-memory)", "time": _iso(now - 6), "simulated": True},
        {"kind": "auditevents", "actor": "origin-passport",
         "detail": "service_account.grant_scope", "time": _iso(now - 4), "simulated": True},
    ]


def recent_events(limit: int = 12) -> List[Dict]:
    """Most-recent activity. REAL signinattempts/auditevents when OP_EVENTS_TOKEN is set
    (itemusages always simulated + labeled); fully simulated + labeled otherwise."""
    token = os.environ.get("OP_EVENTS_TOKEN")
    if not token:
        return _simulated()[:limit]
    out: List[Dict] = []
    for ep in REAL_ENDPOINTS:
        try:
            out += _fetch_real(ep, token, limit)
        except Exception:  # noqa: BLE001 - a real trail is best-effort; never crash the UI
            pass
    # per-fetch item usage is not produced by service accounts → simulated, labeled.
    out += [e for e in _simulated() if e["kind"] == "itemusages"]
    out.sort(key=lambda e: e["time"], reverse=True)
    return out[:limit]


def events_mode() -> str:
    return "real+simulated" if os.environ.get("OP_EVENTS_TOKEN") else "simulated"
