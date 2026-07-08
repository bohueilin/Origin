# Janus — Demo Script (AGI House)

**One line:** *Janus is the control plane for delegated autonomy — identity-bound,
policy-governed, user-authorized, auditable, and revocable.*

**Setup:** `npm run dev` → open `http://localhost:5173/janus.html`. Full screen, dark room.

---

## The 30-second hook (say this first)

> "Agents are about to act on our accounts, calendars, wallets, and devices. The frontier isn't a
> more capable agent — it's a **trustworthy** one. Janus is the missing layer between an agent
> and the real world: **capability is not permission.** The agent can *propose*; Janus decides
> what it may actually do — and you can see, approve, and revoke all of it."

---

## The 90-second core demo — "Airport Pickup"

Pick **Airport Pickup** (the strongest case: time conflict, payment, another person, location).

1. **Intent (5s).** "I read the request and turn it into a bounded intent — goal, time window,
   constraints. Note the **HIGH RISK** badge: this touches ride-hailing, payment, and another
   person."

2. **The Janus card (15s) — the signature moment.** Point at the identity card on the left.
   "This is the grant. Green = **granted** to the agent: read calendar, check flights, *prepare* a
   ride. Amber = **approval required**. Red and struck-through = **denied to the agent entirely** —
   book a ride, send a message, **spend money**, **unrestricted credentials**. The agent *cannot*
   do these on its own. It has a 90-minute TTL and a revoke button."

3. **Plan + tool feed (15s).** Scroll the plan. "It tracked the flight, priced the ride, read
   **only** the one pickup contact, and **prepared** the booking — but look at the feed: nothing
   external has happened. Discovery and drafting only."

4. **Approval gate (25s) — the payoff.** "Here's the booking. Before any money moves, Janus
   raises an **approval card**: who it's with (Uber + the driver + Priya), the **estimated cost**,
   exactly **what data is shared**, and that it's **irreversible**. The agent can't reach this — only
   I can. And read the fine print: *even if I approve, it runs in simulation. No real action is
   taken.*" → Click **Approve & book**. "One approval, one action. It does not chain into the next."

5. **Revoke (10s) — the kill switch.** Click **Revoke all authority**. "Done. The grant is dead;
   every future action fails closed. Immediate and verifiable."

6. **Audit (10s).** Scroll to the trace. "Every step — agent proposed, Janus granted, tool ran,
   I approved, I revoked — is here, append-only, under a **SHA-256 hash-chain digest**. Tamper one
   line and the digest changes."

7. **What Janus prevented (5s).** "And here's the point in one panel: it never booked silently,
   never shared live location, never messaged a real person, never exposed a credential."

---

## The 2-second proofs (have these ready)

- **Capability is not permission:** the red, struck-through **Denied** chips next to the green ones.
- **No silent spend:** the approval card's cost line + "runs in simulation" note.
- **Credentials brokered, not owned:** in **Fill My Night**, the *"Broker a scoped login"* step —
  "the agent gets an opaque handle; it never sees the password."
- **Revocable + auditable:** the revoke button + the hash-chain digest at the bottom.

---

## If a judge asks "is anything real?"

> "Nothing. It's fully local and deterministic — mock connectors with no network egress, so it
> *can't* book, order, message, or spend even if it tried. That's deliberate: the demo proves the
> **control plane**, not the integrations. Each connector is a `ToolAdapter` behind the same
> authorization chokepoint, so swapping a mock for a real, sandboxed integration is a one-file
> change — the policy, approval, audit, and revocation layer doesn't move."

## If a judge asks "why does this matter for AI security?"

> "Five things, one layer: **AI security** (agents run inside bounded, fail-closed systems),
> **agent security** (every action is tied to identity, scope, policy, revocation), **governance**
> (intent, approvals, denials, residual risk are explicit and auditable), **trust** (you can
> understand, approve, inspect, revoke), and **safe deployment** (powerful workflows with no silent
> overreach, credential exposure, or runaway spend). Janus is the infrastructure layer safe agent
> adoption is missing."

---

## Backup scenarios

- **Fill My Night** — best for the **credential-broker** beat (scoped handle, no password) and
  **limited contact access** (reads only the *hackmates* group, not the address book).
- **Enrich My Life** — best for **spoiler-safe** intent (the agent finds the replay but the result
  is never shown) and **recommendation vs purchase** separation (food cart prepared, not ordered).

## Closing line

> "More capable agents are coming no matter what. **Trustworthy** ones need a control plane.
> That's Janus."
