# Passport — Build Notes (what, why, how)

A comprehensive engineering + decision log for the prototype in `agent-passport/`,
written to bring a fresh agent (Codex) fully up to speed. Pairs with `README.md`
(the pitch + runbook) — this file is the *why behind every choice*.

- **Event:** AGI House · *Agent Identity Build Day* (June 27). Sponsors: **1Password**, **Daytona**.
- **Status:** working, verified, **local-only** (nothing pushed/published — deliberate).
- **Runtime:** Python 3.9+ **standard library only**. Optional Ed25519 if `cryptography` is installed.
- **Heritage:** built on top of **Origin** (robot-readiness). Same thesis — *capability is
  not permission; authority is earned, scoped, signed, enforced at runtime, killable* —
  retargeted from "robot on a floor" to "agent in a runtime."

---

## 1. The problem (why this exists)

The hackathon's exact framing: *"Who authorized this agent? What is it allowed to do?
If agent A hands off to agent B, how does trust travel with it — and how do you kill it
when something goes wrong?"* Production agents call APIs, spawn sub-agents, and hold
credentials, but have no real identity/authorization layer. The concrete, documented
threat we target: **prompt-injection credential exfiltration and scope escalation** in
multi-agent handoffs.

Our answer — **Passport** — is the identity + scoped-authorization + kill-switch
layer: every agent carries a signed capability token that can only *narrow* on handoff,
credentials are short-lived and sandbox-bound, a reference monitor mediates every action,
and a kill-switch contains any breach — all on a tamper-evident audit ledger.

## 2. Architecture (what each piece is, and why)

All under `passport_core/`. Designed as small modules with clean interfaces so the two
sponsor mocks (vault, sandbox) can later be swapped for the real products without
touching the engine.

| Module | What | Why it's built this way |
| --- | --- | --- |
| `crypto.py` | `Signer` interface; `HmacSigner` (default) + `Ed25519Signer` (auto if `cryptography` present); `KeyPair`, `fingerprint()` | Zero-dep guarantee — must run on stock Python *tonight*. HMAC is symmetric (the Authority/monitor is the trusted verifier — a reference-monitor model); Ed25519 upgrades to true offline asymmetric verification with no code change elsewhere. |
| `scope.py` | `Scope` (tools, fs r/w globs, net hosts/methods, `op://` secrets, max_calls/children/depth, ttl); `intersect()`, `is_subset_of()`, glob coverage | The **attenuation algebra** is the security core. `intersect` = what a parent may grant (drops anything the parent lacks); `is_subset_of` = the verifier's no-escalation guard, re-checked every hop. Privilege can't be raised even by a tampered/malicious token. |
| `passport.py` | `Passport` dataclass + `canonical_bytes()` (stable signing image) + chain/path helpers | The token. `chain` records the full transit path (root→…→subject) = the audit chain-of-custody (RFC 8693 `act`). Canonical JSON so any tamper changes the signed bytes. |
| `authority.py` | Root key, public **keyring**, passport **registry**, **revocation epochs**; `issue_root`, `delegate` (parent-signs-child), `verify` (walks chain), `revoke`, `descendants` | Authority signs *root* passports; a **parent signs its child** (trust travels with the handoff — biscuit model). `verify` checks, at every hop: signature, expiry, revocation epoch, chain linkage, and scope ⊆ parent. `revoke` bumps a per-subject epoch → all current passports for that subject become invalid (the kill-switch's teeth). |
| `vault.py` | `Vault` + `Lease`; `issue_lease` (only if passport scope permits the `op://` ref), masked display, `reveal()` in-sandbox only, `revoke_for` | Mocks **1Password**: Service-Account least-privilege + `op://` references + `op run` semantics (secret in memory for one task, never on disk/in logs). Lease TTL is bounded by the sandbox lifetime; kill scrubs the secret from memory. |
| `sandbox.py` | `SandboxManager` + `Sandbox`; `create` (real `subprocess.Popen`), `snapshot`, `kill` (SIGKILL + cascade to descendants) | Mocks **Daytona**: one isolated sandbox per agent, handoff = linked child, kill reaps the subtree. Uses a **real OS subprocess** per sandbox so the kill-switch terminates an observable live PID — containment is real, not simulated. |
| `monitor.py` | `Monitor` (reference monitor); `Action`, `Decision`; `mediate()`, `trip_kill_switch()` | **Complete mediation** — every action goes through `mediate`. In-scope → ALLOW; out-of-scope → DENY; **critical** (`escalate_scope`, `secret_egress` — the injection payloads) → KILL: revoke subject + descendants, tear down leases, SIGKILL the sandbox subtree. |
| `ledger.py` | `Ledger` + `Entry`; SHA-256 **hash-chained** append-only log; `verify_chain()`, `seal_id()` | Tamper-evident audit (Origin's "Approval seal"). Each entry commits to the prev hash; any edit/deletion breaks the chain. The `on_append` hook is what the dashboard streams live. |
| `agents.py` | `AgentSystem` (wires authority+vault+sandbox+monitor) + `Agent`; `authorize_root`, `handoff`, `act`, `lease_secret` | The runtime. Enforces the parent's sub-agent budget; there is **no code path around the monitor** for a side-effecting action. |

### Two front-ends
- `demo.py` — terminal walkthrough with ANSI colour: scene 1 authorized, scene 2
  injection→kill, tamper-evidence, full ledger + chain verify + seal.
- `dashboard/` — `server.py` (stdlib `http.server` + **SSE**, no FastAPI) streams the
  real engine's lifecycle to `index.html` (single page, Origin warm-paper design):
  trust graph, live ledger, and the **KILL banner firing live**. `PACE` env controls
  beat timing for stage demos.

## 3. The invariants (do NOT break)

1. **Attenuation is monotonic** — a child's scope is always ⊆ its parent's; escalation
   is impossible by construction *and* re-verified at every hop.
2. **Complete mediation** — every side-effecting action passes through the monitor.
3. **Credentials are sandbox-bound** — never in a prompt, on disk, or in a log; only
   `Lease.reveal()` inside the sandbox; scrubbed on kill.
4. **The ledger is tamper-evident** — append-only, hash-chained; `verify_chain()` must hold.
5. **Kill is total + contained** — revoke + lease teardown + SIGKILL cascade to the whole
   subtree; siblings/parents keep running.

## 4. Key design decisions (the "why")

- **Zero dependencies / stdlib only.** The hard constraint was "runs tonight, no cloud
  deps." HMAC + `subprocess` + `http.server` + SSE deliver the whole thing on stock
  Python 3.9. Ed25519 is a transparent upgrade, not a requirement.
- **Parent-signs-child (not Authority-signs-all).** Matches the brief ("the agent
  generates the token") and the biscuit model; trust literally travels with the handoff.
  Verification still roots at the Authority's keyring.
- **Real subprocess sandboxes.** A simulated kill isn't convincing; SIGKILL on a real PID
  (visible in `ps`) is the demo's most tangible proof of containment.
- **Critical-vs-blocking deny.** An out-of-scope *request* is just DENIED (agent lives);
  an escalation/exfiltration *attempt* is CRITICAL → kill. This makes the demo arc honest:
  defense-in-depth, not a hair-trigger.
- **Mocks behind clean interfaces.** `vault.py`/`sandbox.py` are the only sponsor-specific
  files; swapping in the real `op` CLI and `daytona.create()/delete()` is a localized change.

## 5. How to run + what's verified

```bash
cd agent-passport
python3 demo.py                 # terminal arc (authorized → injection → kill)
python3 dashboard/server.py     # http://localhost:8765 → "Run scenario" (PACE=0.6 default)
python3 tests/test_core.py      # 7/7 security tests
```

Verified this session: `demo.py` runs the full lifecycle with real PIDs; **7/7** tests
pass; the dashboard serves (HTTP 200), streams the SSE lifecycle, marks the payments
agent TERMINATED, fires the KILL banner, and seals a hash-chain-intact ledger — **zero
browser console errors**. Both signer backends round-trip; tamper is detected.

## 6. Prior art (defensibility) + sponsor mapping

Cite: **biscuit tokens / macaroons** (attenuated offline-verifiable delegation — our
direct foundation), **SPIFFE/SPIRE** (workload identity; we add attenuated, revocable
authority), **OAuth 2.0 Token Exchange RFC 8693** (`act`/`may_act` delegation chain = our
ledger), **object-capability security + reference monitor** (complete mediation). Novel
combination: agent-to-agent attenuated delegation + sandbox-bound credentials + instant
kill + tamper-evident audit in one runtime. 1Password → scoped, short-lived, never-logged
leases (`op://` + `op run`). Daytona → isolated per-agent sandboxes, linked children, kill
cascade. (Full sourced brief: see `README.md`.)

## 7. Next steps for June 27 (recommended order)

1. **Real 1Password** — replace `vault.py` internals with a Service Account + `op://`
   references + `op run`-style injection (keep the `Lease`/`issue_lease`/`revoke_for` API).
2. **Real Daytona** — replace `sandbox.py` internals with `daytona.create()` (from a
   snapshot for sub-second spin-up) and `delete(force=True)`; keep the cascade-kill API.
3. **Rehearse the 3-min arc** to the second (script in `README.md`); the escalation→kill
   must be live on the dashboard, not narrated.
4. Optional depth: a tiny real LLM agent loop whose tool-calls feed `monitor.mediate`;
   `may_act` pre-authorization; multi-sibling fan-out to show subtree-scoped kills.

## 8. Prompt to give Codex

> Read `agent-passport/BUILD_NOTES.md` and `agent-passport/README.md`. The prototype is a
> local-only, stdlib Python implementation of "Passport" — scoped agent identity
> with attenuated delegation, 1Password-style credential leases, Daytona-style sandboxes,
> a reference-monitor kill-switch, and a hash-chained audit ledger. Do NOT push/publish.
> First run the gates (`python3 demo.py`, `python3 tests/test_core.py`, and the dashboard
> at `python3 dashboard/server.py` → localhost:8765). Then audit, preserving the five
> invariants in §3: (1) correctness of the attenuation algebra (`scope.py`) and chain
> verification (`authority.py`) — try to construct an escalation that verifies; (2) the
> kill-switch cascade actually SIGKILLs every descendant and scrubs leases; (3) no path
> bypasses the monitor; (4) the ledger is genuinely tamper-evident; (5) secrets never
> leave the sandbox/appear in logs. Report findings with file:line + severity; then help
> swap the two mocks (§7) for the real 1Password + Daytona SDKs behind their existing
> interfaces.
