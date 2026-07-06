# Going live — real 1Password + Daytona (optional)

The demo runs **100% on the mock by default** (nothing to install, no keys). These steps swap in the
real sponsor backends, key-by-key — each is independent. **Local only — never commit tokens.**
`.env*` is gitignored. Honesty rule: anything not wired stays clearly **simulated + labeled** in the
UI; we never imply a capability the vendor doesn't actually expose.

Backends are chosen by env var, read once when the dashboard server starts (`python3 dashboard/server.py`).

---

## 1Password — credential plane (JIT secrets, never on disk)
```bash
pip install onepassword-sdk            # SDK path (preferred); or: brew install 1password-cli
export OP_SERVICE_ACCOUNT_TOKEN=ops_…  # least-privilege, READ-ONLY service account; env only
export VAULT_BACKEND=onepassword
```
On a lease, `OnePasswordVault` resolves `op://vault/item/field` **in memory** via the SDK
(`client.secrets.resolve`), falling back to `op read`; the value never lands on disk, the ledger
shows only the masked handle, and the kill-switch scrubs it. Create a dedicated read-only vault with
the demo items (`op://airline/passport-no`, `op://hotel/loyalty`, `op://payments/virtual-card`, …).

## 1Password — audit plane (every access recorded)
```bash
export OP_EVENTS_TOKEN=eyJ…           # 1Password → Integrations → Events Reporting → issue token
```
`onepassword_events.recent_events()` pulls the real **`signinattempts` + `auditevents`** trail
(shown beside our hash-chained ledger). ⚠️ `itemusages` is **not** emitted by a service-account
`resolve()`, so per-fetch item usage is **always shown simulated + labeled** — never as real.

## 1Password — identity-plane kill-switch (suspend the agent identity)
```bash
export OP_USERS_API_TOKEN=…           # OAuth partner app (Business/Enterprise; Users API, public preview)
export OP_ACCOUNT_ID=…                # your 1Password account id
export OP_USER_MAP='{"airline-agent":"<1p_user_id>","activity-agent":"<1p_user_id>"}'  # agent → 1P user
```
On a kill, `vault.suspend_identity()` POSTs `…/users/<uid>:suspend` (real). ⚠️ Service-**account**
*token* revocation has **no API — console-only**; we suspend the **user** identity instead, and the
capability + credential planes are revoked regardless. With these unset, the identity plane is
**simulated + labeled** (the demo still shows the dual-plane kill end-to-end).

## Daytona — compute plane (ephemeral per-agent sandboxes + delegation tree)
```bash
pip install daytona
export DAYTONA_API_KEY=dtn_…           # app.daytona.io → API Keys (free tier: $200 credits, no card)
export SANDBOX_BACKEND=daytona
export ALLOW_REAL_SANDBOX_KILL=1       # opt-in: real irreversible delete() on kill (else local state-flip)
```
Each agent gets an `ephemeral=True` sandbox; children are created with `linked_sandbox=parent.id` +
passport labels (a real, queryable delegation tree); the kill-switch reaps the subtree.

---

## Real-vs-mock matrix (what's live with keys, what stays simulated)
| Capability | With keys | Default (no keys) |
|---|---|---|
| JIT secret resolve (`op://…`), in-memory, masked | **REAL** (SDK or `op` CLI) | mock in-memory broker |
| Audit: `signinattempts` / `auditevents` | **REAL** | simulated + labeled |
| Audit: `itemusages` (per-fetch) | **simulated** (SA doesn't emit it) | simulated + labeled |
| Kill — capability plane (passport revoked, cascades) | **REAL** (always, no keys) | **REAL** |
| Kill — credential plane (leases scrubbed) | **REAL** (always) | **REAL** |
| Kill — identity plane (Users-API `:suspend`) | **REAL** (user) | simulated + labeled |
| Kill — service-account token revoke | console-only (no API) | n/a |
| Daytona ephemeral + linked sandboxes + reap | **REAL** | local-subprocess mock |
| Proof-of-possession + anti-replay + ledger + monitor | **REAL (ours)** | **REAL (ours)** |

**Never made real (by design):** no real money movement, no real credential egress. The demo proves
the *broker + scoped capability + dual-plane revocation + audit* story. The single highest-impact
live integration for judges is **1Password `secrets.resolve` on a throwaway vault**; the
**dual-plane kill** (Daytona reap + 1P suspend) is the showstopper; both run real with the keys above.
