# Passport — Local Demo

> **Passport** is a local-first agentic **identity + intent-authorization** layer for personal
> agents and multi-agent workflows. *"1Password for agentic intent, credentials, and delegated
> action."*
>
> **Capability is not permission.** You declare intent. The agent proposes a plan. Passport issues
> a **scoped, revocable** grant. Tools run only within bounds, risky actions need your approval,
> and every action leaves a tamper-evident trace.

This demo is **100% local and deterministic**. There is **no backend, no network egress, and no
real credentials.** Nothing can register, book, order, message, or spend — the connectors are mock
adapters with no real-world reach. Side-effecting actions are *simulated* and gated behind explicit
approval.

---

## Run it

```bash
# from the repo root
npm install          # if you haven't already
npm run dev          # starts Vite

# then open the Passport demo entry:
#   http://localhost:5173/passport.html
# (if 5173 is busy Vite picks another port — watch the terminal output)
```

The existing "Autonomy Trace Console" still lives at `http://localhost:5173/` (`index.html`).
Passport is a **separate, self-contained entry** at `/passport.html` — it shares only the repo's
build tooling.

### Tests

```bash
npx vitest run src/passport     # 21 Passport tests (engine + SHA-256)
npx vitest run                  # full repo suite (110 tests)
```

### Production build (optional)

```bash
npm run build                   # type-checks + bundles both entries (dist/passport.html)
```

---

## What you'll see (the 10-stage flow)

Pick a scenario on the home screen (or type a request and press Run). Each scenario runs the full
loop:

1. **Intent understanding** — your raw request → a normalized intent, goal, success criteria,
   constraints, and a risk level.
2. **Risk classification** — a risk badge + plain-English notes (spending, third parties, location…).
3. **Required capabilities** — what the agent asked for.
4. **Scoped authorization grant** — the **Passport identity card**: capability *chips* split into
   **Granted** (green), **Approval required** (amber), and **Denied to the agent** (red, struck
   through), a TTL, an optional spend ceiling, and a **Revoke** button.
5. **Multi-step plan** — the agent proposes; Passport gates. Approval steps are marked.
6. **Tool activity** — every call, authorized *before* it runs; simulated commits are flagged.
7. **Human approval gates** — sensitive actions appear as **approval cards** (action, external
   party, estimated cost, data shared, reversibility). Approve or deny.
8. **Final itinerary** — the assembled execution packet.
9. **Audit trace** — append-only event log + a tamper-evident **SHA-256 hash-chain digest**.
10. **Revocation / expiry** — revoke at any time; every later action then fails closed.

There's also a **"What Passport prevented"** panel that names the overreach that did *not* happen.

---

## The three scenarios

| Scenario | What it shows |
|---|---|
| **Fill My Night** | Turn a free evening into a buildable SF hackathon: discover → rank → check feasibility → **broker a scoped login (the agent never sees the password)** → prepare registration → read only the *hackmates* contact group → draft an invite → propose a calendar event. Approvals: register, add to calendar, send invite. |
| **Enrich My Life** | A **spoiler-safe** FIFA catch-up night: pick a free evening, find a replay (result never shown), plan setup + food + reminders. Approvals: place the food order, block the calendar, set reminders. |
| **Airport Pickup** | A higher-risk, multi-party logistics chain: track a flight, estimate a ride, prepare the booking, prepare safety-sharing for both parties, plan optional dinner — **without leaving the event**. Approvals: book the ride (+ payment), share safety details, confirm the reservation. |

Use cases 4–7 (Recover My Evening, Trusted Hackmate Coordination, Credentialed Task Without
Exposure, Revoke Agent Access) appear as cards on the home screen; #6 is exercised live inside *Fill
My Night* (the credential broker step), and #7 is the global **Revoke** path on every scenario.

---

## Architecture (where things live)

```
src/passport/
  types.ts              core data models (UserIntent, CapabilityGrant, AgentPlan, ToolCall,
                        ApprovalPacket, AuditTrace) + ToolAdapter + SecretBroker contracts
  capabilities.ts       capability catalog: read/prepare (grantable) vs commit (deny + approval-only)
  hash.ts               synchronous SHA-256 (FIPS 180-4) for the audit digest
  engine/
    intentParser.ts     IntentParser        riskClassifier.ts   RiskClassifier
    policyEngine.ts     CapabilityPolicyEngine   grantManager.ts GrantManager (fail-closed liveness)
    planner.ts          Planner             toolRouter.ts       ToolRouter (the authorization chokepoint)
    approvalManager.ts  ApprovalManager     auditLogger.ts      AuditLogger (hash chain)
    revocationManager.ts RevocationManager  session.ts          PassportSession = DemoScenarioRunner
  secrets/
    secretBroker (in types.ts)  mockSecretBroker.ts  onePasswordSecretBroker.ts  redact.ts
  connectors/index.ts   ~31 mock ToolAdapters (deterministic, no egress)
  fixtures/index.ts     believable local demo data (calendar, events, flights, rides, …)
  scenarios/            fillMyNight · enrichMyLife · airportPickup (+ secondary use-case cards)
  ui/                   React app: App, usePassport, PassportCard, IntentPanel, PlanTimeline,
                        ToolActivityFeed, ApprovalCard, ItineraryPanel, AuditTraceViewer,
                        PreventedPanel, Home, passport.css
passport.html           the Vite entry → src/passport/main.tsx
```

### How "capability is not permission" is enforced

- **Read/prepare** tools are gated by the **grant**: the required capability must be in
  `allowed_capabilities` and the grant must be live (active, not expired, not revoked) — else the
  call **fails closed**.
- **Commit** tools (send / submit / spend) are placed in **`denied_capabilities`** — the agent can
  *never* invoke them on its own. They are unlocked **only** by an **approved `ApprovalPacket`**,
  and even then run in **simulation** (return `{ simulated: true }`), performing no real action.
- `credential.unrestricted` and `payment.spend` are **globally forbidden** — not executable even
  with approval.

### Security controls (all implemented)

Fail-closed authorization · scoped grants · TTL expiry · explicit deny list · approval packets for
every external side effect · **no raw secret in code/logs/traces/UI** (a redaction backstop +
`assertNoSecret` boundary) · no real spending / messaging / booking · deterministic mock connectors
· an audit event for **every** tool call · an append-only hash-chain digest · an immediate,
verifiable **revocation** path.

---

## 1Password

`OnePasswordSecretBroker` is a **fail-closed scaffold**: with no `OP_CONNECT_HOST` / `OP_CONNECT_TOKEN`
configured it reports `isAvailable() === false`, so Passport uses the `MockSecretBroker`. The mock
returns only an **opaque, task-scoped handle** plus **redacted metadata** (field *labels*, never
values). The agent never owns or sees a credential — it requests scoped access *through* Passport.

---

## Safety guarantees in this build

- Local only · no push · no deploy · no live irreversible actions.
- No real registration, ride/booking, food order, message send, or spend — all simulated.
- The only "secret-shaped" string in the bundle is the self-documenting **mock tracer**
  `MOCK_VAULT_VALUE__never_returned__never_logged`, which exists solely so a leak test can prove it
  never reaches a handle, summary, trace, or the UI.
