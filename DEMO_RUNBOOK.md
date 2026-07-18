# Origin 90-second demo runbook — iteration 1

## Purpose and claim boundary

Show that the model proposes, deterministic code verifies, the gate decides, and a trace proves the outcome. The interactive reference check uses a **synthetic, client-side battery** and an **in-session signing key**. It demonstrates reproducibility and tamper/config-drift detection, not production safety, customer evidence, issuer identity, or compliance certification.

## Setup

1. From the repository root run `npm --workspace @origin/origin-web run dev`.
2. Open `http://localhost:5173/reference-check` (use the port Vite reports if different).
3. Keep `/verify` open in a second tab. No network, production credentials, clipboard, or downloaded file is required.

## 90-second sequence

| Time | Interaction | Expected result / presenter claim |
|---|---|---|
| 0–15s | On `/reference-check`, keep **Customer-support agent** and describe the visible model/tools/config fields. | “The model and its available tools are inputs, not authority. The exact config is hashed into the credential.” |
| 15–30s | Select a permissive preset, then **Run the reference check**. | The deterministic support oracle exposes mismatches and catastrophic over-grants. A bad action cannot be averaged away into a high readiness level. |
| 30–45s | Select **Least privilege** and run again. | The table shows each proposed action, the configured policy decision, oracle decision, and match/miss. This is deterministic verification, never LLM self-grading. |
| 45–58s | On `/verify`, choose **Synthetic sandbox reference check**, then **Verify**. | The real credential verifier reports `VALID · Crucible credential — config-bound reference check · code 0`. It recomputes internal consistency, digest/configuration binding, and the supplied environment/verifier bindings. |
| 58–73s | Check **Tamper one field (see it void)**, then choose **Verify** again. | The control inflates the bound `pass_rate` without re-minting. The same verifier reports `VOID · … · code 3` because the credential digest no longer matches. |
| 73–83s | Choose **Reset selected example**, then **Verify**. | The checkbox clears and the original deterministic example returns to `VALID … code 0`, without stale browser state. |
| 83–90s | Close on the displayed **Scope, honestly** text. | “This proves internal consistency, integrity, configuration binding, and reproducibility under the named verifier. Capability is not permission.” |

## Coverage of required story

- Proposal: synthetic support actions in `packages/verifier-core/supportGym` and the `/reference-check` decision table.
- Permission/scope/policy/budget/approval: support policy controls and deterministic oracle decisions.
- Verdict and safe refusal: allow/escalate/refuse outcomes; catastrophic over-grants cap readiness.
- Controlled execution boundary: explain using the homepage simulated proxy panel; the reference check itself evaluates policy and does **not** claim a live side effect.
- Evidence and independent verification: bundled synthetic sandbox credential bundle → the real `/verify` credential path.
- Tamper/config failure: a bound-field mutation fails with code 3 on `/verify`.

## Reset

On `/verify`, choose **Reset selected example**. For the full demo, reload `/reference-check`, select **Customer-support agent** and **Least privilege**, then reload `/verify`. No local storage, clipboard content, download, or credential cleanup is required.

## Offline fallback

The bundled `/verify` example is the primary offline fallback because it is generated entirely from checked-in inputs. If browser interaction fails, show `/proof#tr-a002` and run:

```bash
cd apps/origin-web
npm run proof:verify
```

The command independently recomputes the checked-in 12-event sandbox trace and final digest. Do not edit the checked-in artifact during a presentation.

## Allowed and prohibited presenter claims

- Allowed: successful verification establishes internal consistency, digest integrity, configuration/environment/version binding, and reproducibility under the named verifier for this synthetic sandbox artifact.
- Do not claim: production safety, real-world signer identity, customer acceptance, reviewer approval, compliance certification, general security correctness, or that this synthetic evidence is customer evidence.

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

The reference check and runtime controlled-proxy example remain separate surfaces. The bundled credential is deterministic but illustrative: it does not replay the original battery, prove a run occurred, or establish a real-world signer identity.
