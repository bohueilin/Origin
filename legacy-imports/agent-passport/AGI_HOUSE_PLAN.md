# Passport — AGI House Win Plan (Agent Identity Build Day · 1Password + Daytona)

Goal: win the competition / land a founding product. Impress the 1Password CEO, an OpenAI leader,
and the judges. Treat it like launching the startup in a week. **Local-only build** (no push/deploy
for Passport); keys arrive later, so build the real adapters correct-by-construction (mock-default),
validated by tests + the live dashboard. Gates green every iteration.

## The thesis (one line)
**A2A/AP2 let agents find, instruct, and pay each other — but nothing issues, scopes, proves, or
revokes their authority. Passport is that missing trust layer: a signed, attenuating,
proof-of-possession capability passport with an instant dual-plane kill-switch and a tamper-evident
audit ledger — the seatbelt for the agent economy.** Model-agnostic, vendor-neutral (Auth0/Stripe/
Plaid precedent): we don't out-think OpenAI, we make anyone's agent safe to deploy.

## The canonical demo (from the 1Password+Daytona research — the thing that makes their teams say "yes")
"Capability passport → live sandbox → instant kill, with a tamper-evident audit ledger," in ~90s:
1. **Mint** a signed attenuating passport (scopes, vault refs, TTL, parent-hash → delegation chain).
2. **JIT secret, never on disk** — reference monitor checks scope, then 1Password SDK
   `client.secrets.resolve("op://…")` in memory → injected into a **Daytona ephemeral sandbox** as an
   env var for a subprocess only (masked in logs). Secret never hits disk or the ledger.
3. **Delegation tree = real child sandboxes** — child passport (attenuated) spawns a linked Daytona
   child sandbox (`linked_sandbox=parent.id`, labels carry passport_id) → a queryable live tree.
4. **Instant kill-switch (showstopper)** — one button, two real effects: `daytona.delete()` reaps the
   sandbox subtree (compute gone) **and** 1Password Users API `:suspend` suspends the identity
   (identity plane). Then pull 1Password Events API (`signinattempts`/`auditevents`) + our
   hash-chained ledger to prove every decision was recorded (non-repudiation).

## Verified integration facts (build to these)
- **1P SDK** (`onepassword-sdk`, Python async): `Client.authenticate(auth=OP_SERVICE_ACCOUNT_TOKEN,…)`
  → `await client.secrets.resolve("op://vault/item/field")` (in-memory). CLI: `op run`/`op read`.
- **1P Events API** `POST https://events.1password.com/api/v2/{signinattempts|auditevents|itemusages}`
  (Bearer OP_EVENTS_TOKEN). ⚠️ `itemusages` is NOT produced by a service-account `resolve()` — use
  `signinattempts`+`auditevents` for the real trail; label any per-fetch itemusage **simulated**.
- **1P kill-switch:** Users API `POST …/users/<uid>:suspend` is **real** (Business/Enterprise, OAuth
  partner app). ⚠️ **Service-account token revocation has NO API — console-only.** Be honest about this.
- **Daytona** (`daytona` SDK): `Daytona().create(CreateSandboxFromSnapshotParams(ephemeral=True,
  labels={…}, linked_sandbox=parent.id))`; `sandbox.process.code_run/exec`; `sandbox.delete()`.
  Real free tier ($200 credits, 5GB, no card).
- Plan gating: 1P Service Accounts + Events + Users API need **Business/Teams** (14-day trial path).

## Build backlog (priority order; each = one loop iteration, gates green, log it)
- [x] **I1 — Autoplay hero film** on the Trust page (inline SVG/CSS, muted, looping; mp4 auto-swap).
- [ ] **I2 — 1P adapter → real SDK shape.** Refit `vault_onepassword.py` to `onepassword-sdk`
      `secrets.resolve` (async-safe wrapper), keep `op run` path, in-memory + masked + scrubbed.
- [ ] **I3 — 1P Events/audit module.** New `passport_core/onepassword_events.py`: pull
      signinattempts/auditevents; expose a "every access recorded" feed. itemusages labeled simulated.
- [ ] **I4 — Dual-plane kill-switch.** `kill = Daytona.delete(subtree) + 1P Users-API :suspend`;
      service-account revoke framed console-only. Wire into the monitor's `trip_kill_switch`.
- [ ] **I5 — Daytona adapter → linked delegation tree.** Refit `sandbox_daytona.py` to
      `linked_sandbox` + labels; `ephemeral=True`; subtree reap on kill.
- [ ] **I6 — Dashboard "audit + identity" panel.** Show 1P Events trail beside our hash-chained
      ledger (non-repudiation), and a live "dual-plane kill" beat. Honesty labels for mocked bits.
- [ ] **I7 — "Steal the passport" live attack button** on the dashboard → proof-of-possession denies
      it (visceral PoP demo). Plus a replay-attack button.
- [x] **I8 — DEMO_SCRIPT.md** (3-min no-slides judge script) + pitch one-liner + objection rebuttals.
- [x] **I9 — WHY_WE_WIN.md** competitive one-pager (Okta/Auth0/AP2/MCP/SPIFFE/UCAN/Astrix; our gap).
- [ ] **I-priority (from strategy research): make the CASCADING kill-switch the unmissable peak** in
      the dashboard, and add a **second relying party that rejects a revoked passport** live (not a UI
      toggle) — this is the demo's emotional peak + the field's universal weak point.
- [ ] **I10 — SETUP_REAL.md refresh** with exact env (OP_SERVICE_ACCOUNT_TOKEN, OP_EVENTS_TOKEN,
      Users-API OAuth app, DAYTONA_API_KEY) + the real-vs-mock matrix.
- [ ] **I11 — Tests** for every new module; honesty pass (label measured vs simulated); full gates.
- [ ] (stretch) **I12 — AP2/MCP-auth bridge note**: how a passport wraps an AP2 mandate / MCP auth.

## Loop discipline
Each iteration: EVALUATE → IMPLEMENT (smallest safe slice) → REVIEW → VERIFY (run
`python3 tests/test_core.py && python3 tests/test_redteam.py`, plus any new test) → log to
`AGI_HOUSE_LOG.md`. Never fabricate metrics; label mocked vs real. Preserve the five invariants
(attenuation-only, complete mediation, signed root-of-trust, instant revoke/kill, tamper-evident
ledger). No push/deploy.
