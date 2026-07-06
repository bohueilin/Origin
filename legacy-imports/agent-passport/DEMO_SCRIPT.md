# Passport — 3-minute demo script (no slides, story-first)

AGI House rewards **live running code + a fast human story + "is this a company?"**. Pitch nights
run **2 min, no slides**. So: open on stakes, show the product live, end on the market. Build the
demo to win with zero slides. The live surface is the Passport dashboard (localhost:8765) + the
console (localhost:5275/app.html).

## The one-liner
**"Passport gives every AI agent a signed, attenuating capability passport — scoped
per-vendor, proof-of-possession bound, instantly killable, and recorded on a tamper-evident ledger.
It's the trust layer agents need, running on 1Password and Daytona."**

Hallway version: **"Passports for AI agents — least-privilege credentials you can kill in one
click, with a black-box flight recorder for every action."**

## The script (~3 min)

**[0:00 — the threat, human stakes]**
"Simon Willison named it the *lethal trifecta*: give an agent private data, untrusted content, and a
way to communicate out — and one poisoned web page can make it exfiltrate your secrets. This isn't
theory — EchoLeak (CVE-2025-32711, 9.3 per Microsoft), GitHub MCP, Slack AI, Notion. Vendors *can't
fully patch it server-side* — it's architectural."

**[0:25 — why today's auth is broken]**
"And when you realize an agent's compromised and hit 'revoke' — standard OAuth keeps that token alive
until it expires. Auth0's default is **24 hours**. Your agent stays armed for a day. Meanwhile there
are **82 machine identities for every human** (CyberArk), and Gartner predicts **25% of enterprise
breaches will trace to AI agent abuse by 2028**."

**[0:50 — the product, LIVE]** (Passport dashboard · Travel · multi-agent · international)
"This is Passport. Press Run. An orchestrator boots and mints a **capability passport** to each
vendor agent — scoped to *one vendor, one action*, short TTL, **sender-constrained** so a stolen copy
is inert. The real credential is fetched **just-in-time from 1Password** — `op://…` resolved in memory,
never on disk, never in a `.env`. Each agent runs in its own **Daytona sandbox**."

**[1:30 — attenuation]**
"Watch the handoff. Each passport can only **narrow** — the airline agent sees the passport number but
never the card; the review-reader holds *zero* secrets. The child can never do more than the parent.
That's capability security — least privilege — and it's the one thing Okta and Auth0 structurally
*can't* do."

**[1:55 — the attack + the kill (the wow)]**
"Now the attack: a poisoned tour confirmation tells one agent to exfiltrate the passport. Our
reference monitor catches it — proof-of-possession denies the stolen credential, the out-of-scope
reach is blocked — and the kill-switch fires **instantly**, and **cascades** to every descendant.
That agent is disarmed in real time. No 24-hour window. And only its branch dies — the rest of the
trip still books." *(single-agent run shows the contrast: one identity = the whole keychain dies.)*

**[2:20 — the ledger / flight recorder]**
"Every decision is on a **hash-chained, tamper-evident ledger** — non-repudiation. Tamper with one
entry and the chain breaks. This is exactly what the EU AI Act Article 12 logging obligation needs:
the agent's logs become *evidence*, not just logs."

**[2:40 — close, the market]**
"Prompt injection won't be solved — OpenAI's own security lead calls it a frontier, unsolved problem.
So you can't prevent the injection — you **contain the blast radius**: least privilege, instant
cascading kill, a forensic ledger. We assume compromise. NHI governance vendors can *watch*
identities; we *issue* killable ones. **Every agent should have a passport. We can issue you one right
now** — on 1Password and Daytona."

## What's live-real vs needs keys (be honest on stage)
- **Real now (no keys):** the signed/attenuating passports, proof-of-possession + anti-replay, the
  reference monitor, the **cascading kill-switch**, the hash-chained ledger, the whole scenario engine.
- **Real with keys (flip at the event):** 1Password JIT `secrets.resolve` (Service Account), Daytona
  ephemeral + linked sandboxes, 1P Events-API audit trail, Users-API `:suspend` (identity-plane kill).
- **Honestly mocked + labeled:** per-fetch `itemusages` events (service accounts don't emit them);
  service-account *token* revocation is console-only (no API) — we kill the **user** + the capability.

## Objection rebuttals (memorize)
- *"Just OAuth scopes / Okta Cross-App Access?"* → OAuth can't attenuate down a delegation chain;
  Okta's ID-JAG forbids re-delegation; neither kills a token instantly (RFC 7009 only SHOULDs it).
- *"Macaroons / UCAN / Biscuit exist."* → We mirror their attenuation + AP2's PoP for interop; what
  none ship is a **central real-time cascading kill-switch + tamper-evident ledger**. That's the gap.
- *"Just rotate the secret in 1Password."* → That's the credential. We revoke the **capability**
  mid-execution and it cascades to sub-agents; rotation doesn't stop an already-running agent.
- *"Prompt injection is unsolved — doesn't that defeat the point?"* → That's *why* we exist: contain
  the blast radius. Assume compromise.
- *"Is this a company?"* → 82:1 NHI ratio, 25%-of-breaches-by-2028, EU AI Act mandates logging + a
  stop button (Art. 12/14). We're the issuance layer the NHI-governance vendors would integrate.

## Stage-craft
- **Let a judge break it themselves** — the dashboard has three live buttons that run on the real
  engine: **🪪 Steal the passport** (presents it without the holder key → DENIED) and **♻ Replay an
  action** (reuses a captured proof → DENIED) prove proof-of-possession + anti-replay; **⛔ Revoke
  (2nd party rejects)** shows relying party A accept the passport, then after the kill an *independent*
  relying party B reject the very same passport — instant, no expiry wait. Hand them the laptop.
- The **Audit + identity** panel (1Password Events beside our hash-chained ledger) is the
  "non-repudiation / flight recorder" beat — every access recorded on two independent planes.
- Lock the demo path; have a backup screen-recording.
- For the revocation "wow," show a **second relying party rejecting the revoked passport** + the
  ledger hash-chain verifying — don't just toggle UI state.
- Stats hygiene: 82:1 = **CyberArk** (never Gartner); EchoLeak **9.3 per Microsoft**; do **not** claim
  "Cloudflare uses macaroons" (it's Fly.io / ForgeRock). Verify any 2026 citation before saying it.
