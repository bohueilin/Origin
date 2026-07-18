# Origin 90-second demo runbook — iteration 1

## Purpose and claim boundary

Show that the model proposes, deterministic code verifies, the gate decides, and a trace proves the outcome. The interactive reference check uses a **synthetic, client-side battery** and an **in-session signing key**. It demonstrates reproducibility and tamper/config-drift detection, not production safety, customer evidence, issuer identity, or compliance certification.

## Setup

1. From the repository root run `npm --workspace @origin/origin-web run dev`.
2. Open `http://localhost:5173/reference-check` (use the port Vite reports if different).
3. Keep `/verify` open in a second tab. No production credentials or external API are required.

## 90-second sequence

| Time | Interaction | Expected result / presenter claim |
|---|---|---|
| 0–15s | On `/reference-check`, keep **Customer-support agent** and describe the visible model/tools/config fields. | “The model and its available tools are inputs, not authority. The exact config is hashed into the credential.” |
| 15–30s | Select a permissive preset, then **Run the reference check**. | The deterministic support oracle exposes mismatches and catastrophic over-grants. A bad action cannot be averaged away into a high readiness level. |
| 30–45s | Select **Least privilege** and run again. | The table shows each proposed action, the configured policy decision, oracle decision, and match/miss. This is deterministic verification, never LLM self-grading. |
| 45–58s | Download the Origin Attestation. | The evidence binds the verdict, verifier/environment versions, and configuration. It is synthetic pilot evidence signed with an in-session key. |
| 58–70s | Click **Change a tool → watch it void**. | The page reports `VOID (code 4) — config drift`; permission does not survive a changed tool set. |
| 70–83s | Open `/verify`, load/paste the downloaded JSON, and verify. | Untampered evidence verifies offline in the browser. Green means integrity/reproducibility under this verifier and config, not “safe.” |
| 83–90s | Use `/verify` tamper control and verify again. | The modified artifact becomes VOID. Close: “Capability is not permission; the trace makes the decision independently checkable.” |

## Coverage of required story

- Proposal: synthetic support actions in `packages/verifier-core/supportGym` and the `/reference-check` decision table.
- Permission/scope/policy/budget/approval: support policy controls and deterministic oracle decisions.
- Verdict and safe refusal: allow/escalate/refuse outcomes; catastrophic over-grants cap readiness.
- Controlled execution boundary: explain using the homepage simulated proxy panel; the reference check itself evaluates policy and does **not** claim a live side effect.
- Evidence and independent verification: downloaded attestation → `/verify`.
- Tamper/config failure: drift code 4 on `/reference-check`; altered evidence fails on `/verify`.

## Reset

Reload `/reference-check`; select **Customer-support agent** and **Least privilege**. All run state and signing keys are browser-session/local state. Delete the downloaded demo JSON if desired.

## Offline fallback

If browser interaction fails, show `/proof#tr-a002` and run:

```bash
cd apps/origin-web
npm run proof:verify
```

The command independently recomputes the checked-in 12-event sandbox trace and final digest. For a visible tamper case, use the built-in examples/tamper control on `/verify`; do not edit the checked-in artifact during a presentation.

## Stop conditions

- Do not proceed if the page labels the run as customer or production evidence.
- Do not describe a valid signature as proof of real-world signer identity; `/verify` explicitly limits that claim.
- If verification errors or cannot load the artifact, state the failure and switch to the checked-in offline fallback. Never narrate a failed/unknown state as success.

## Verification references

- UI flow: `apps/origin-web/src/reference-check/ReferenceCheckPage.tsx`
- Route/build: `apps/origin-web/vite.config.ts`
- Browser verification: `apps/origin-web/src/verify/VerifyPage.tsx` and `detect.mjs`
- Evidence recomputation: `apps/origin-web/scripts/verify-tr-a002.mjs`
- Focused route/accessibility test: `apps/origin-web/tests/e2e/smoke.spec.ts`

## Deferred work and residual risk

The reference check and runtime controlled-proxy example remain separate surfaces. A future slice should provide a bundled, tested attestation handoff into `/verify` so the presenter never relies on clipboard/download behavior.
