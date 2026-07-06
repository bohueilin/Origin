# Why Passport wins — the whitespace, the moat, the honest map

**Position:** the productized version of the agent-governance thesis OpenAI/Anthropic keep
publishing — *least-privilege, auditable, interruptible agents with verifiable identity* — running on
**1Password** (credential plane) + **Daytona** (compute plane). Model-agnostic, vendor-neutral.

## The four primitives — and the claim
No incumbent combines all four. That combination **is** the product:
1. **Holder-side attenuation** — each handoff can only *narrow* (POLA). Parent can delegate a strictly
   smaller passport; child can never exceed it.
2. **Proof-of-possession** — sender-constrained (DPoP-style, `cnf` / RFC 9449 / 7800). A stolen
   passport copy is inert without the holder's key.
3. **Instant *cascading* kill-switch** — revoke a passport and every descendant dies in real time,
   across the credential plane (1P) and the compute plane (Daytona). No expiry wait.
4. **Tamper-evident ledger** — hash-chained, append-only; tamper one entry and verification breaks.
   Non-repudiation / "flight recorder."

## Competitive map (where each camp falls short)
| Player / standard | Has | Missing vs us |
|---|---|---|
| **Okta Cross-App Access (ID-JAG)** | cross-app tokens | **forbids re-delegation** → no holder-side attenuation; ~5-min expiry, not instant revoke |
| **Auth0 / standard OAuth** | scopes, issuance | access tokens "valid until expiration, cannot be invalidated" (default 24h); RFC 7009 only *SHOULDs* revocation + admits propagation delay |
| **MCP authorization spec** | tool auth | "no standardized token revocation propagation" (named a gap in SEP #1461) |
| **SPIFFE/SPIRE** | workload identity | revocation latency = remaining TTL; no capability attenuation |
| **UCAN / ZCAP-LD / Biscuit / macaroons** | attenuation + PoP (some revocation) | no **central real-time cascading kill-switch**; no tamper-evident ledger; not per-vendor-scoped by default |
| **Astrix / Token Security (NHI governance)** | *watch* non-human identities | don't **issue** killable capabilities — they'd integrate *us* |

**The killer line:** *standard OAuth literally can't kill a token instantly — a prompt-injected agent
stays armed for up to a day after you hit "revoke." We kill the capability mid-execution, and it
cascades.*

## Positioning (complement vs compete)
- **Complement:** slot in as an **MCP authorization extension**; layer capabilities on **SPIFFE**
  identity; mirror **AP2's** mandate + PoP stack for interop.
- **Compete:** against the IdP/broker camp (Okta/Auth0/Descope/Aembit) on attenuation + instant
  revocation, and against UCAN/macaroons on the cascading kill-switch + tamper-evident ledger.

## Why it's a company (the "is it a company?" answer)
- **82 machine identities per human** (CyberArk 2025); **68%** of orgs have no AI-agent identity
  controls.
- **Gartner:** ~**25% of enterprise breaches** traced to AI agent abuse **by 2028**.
- **EU AI Act** Art. 12 (logging) + Art. 14 (human oversight / stop button) make audit + kill a
  *regulatory requirement*, not a nice-to-have.
- Precedent: the AgentOps/"Agency" agent-observability console won an SF AI hackathon → ~$2.6M
  pre-seed. Passport is the same shape (trust/trace console) with a sharper wedge (issuance +
  kill, not just observability).

## Why it impresses the sponsors / the room
- **1Password:** it's the *canonical* use of Service Accounts + SDK — agent holds **zero** long-lived
  secrets, fetches scoped creds JIT, never on disk, never in `.env`. Exactly their agentic-AI thesis.
- **Daytona:** ephemeral per-agent sandboxes + linked delegation tree + instant reap = the canonical
  isolation/teardown story.
- **OpenAI-minded judges:** we operationalize "trust must be granted, scoped, enforced" and "assume
  prompt injection is unsolved → contain blast radius."

## Interop — we wrap the ecosystem, we don't replace it
A passport is an *envelope* the existing rails fit inside, so we're additive on day one:
- **AP2 (payments):** an AP2 Intent/Cart/Payment **mandate** rides *inside* a passport as a scoped
  capability; we reuse AP2's proof-of-possession stack (`cnf` confirmation key, DPoP/RFC 9449,
  RFC 7800) rather than inventing one — so a passport-bound agent is AP2-interoperable, and our
  cascading kill-switch + ledger add the revocation and audit AP2 doesn't specify.
- **MCP (tools):** Origin slots in as an **MCP authorization extension** — the passport is the
  capability an MCP client presents to a server; we fill MCP's named gap (SEP #1461: "no standardized
  token revocation propagation") with instant cascading revoke.
- **SPIFFE/SPIRE (workload identity):** SPIFFE answers *who the workload is*; the passport answers
  *what this delegation may do, for how long, and how to kill it* — we layer capabilities on a SVID
  rather than competing with it.
- **1Password = the credential plane, Daytona = the compute plane, Passport = the capability
  + kill + audit plane** that ties them together. One sentence: *bring your own identity (SPIFFE),
  your own payments (AP2), your own tools (MCP) — the passport makes them scoped, provable, and
  killable.*

## Honesty / stat hygiene (do NOT misattribute on stage)
- **82:1** = **CyberArk**, never Gartner.
- **EchoLeak** severity: say **"9.3 per Microsoft"** (NVD lists 7.5).
- **Drop "Cloudflare uses macaroons"** — it's false. Production macaroon user is **Fly.io**;
  macaroon-as-OAuth patent is **ForgeRock/Ping (Neil Madden)**.
- Verify any **2026-dated** paper/citation before quoting; paraphrase single-source quotes.
- Label mocked-vs-real in the demo (1P `itemusages` simulated; SA-token revoke console-only).
