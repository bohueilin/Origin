# Origin Web — public trust layer, evidence formats, and demos

> **Canonical product boundary:** see the repository-root [`README.md`](../../README.md).
> Proprietary algorithm work stays in its private repository. This public app contains
> the trust layer, deterministic verifiers, evidence formats, and explicitly labeled demos.

Origin's core control model is:

> Model proposes. Environment executes. Verifier evaluates. Gate decides. Trace proves.
> Capability is not permission.

## What is implemented publicly

- A browser-only synthetic policy reference check over declared configuration and a
  deterministic checked-in battery. It does not contact or execute the named agent.
- A browser-session-signed Action/Run evidence envelope. The session key is unpinned,
  so intact demo evidence correctly verifies as untrusted by default and does not prove
  a provider or real-world effect.
- Offline verification and tamper/config-drift demonstrations.
- Deterministic simulation and route/map evaluators using route-summary and map-derived
  features—not raw end-to-end perception and not production-autonomy validation.
- A Foundry public mode with a deterministic browser-local sample. The sample makes no
  backend or provider request.

The proposed runtime gate/proxy and proposed hosted verification API are design artifacts,
not generally deployed public capabilities. Origin issues evidence; a customer's gate and
risk owner retain release authority.

## Foundry authority and data flow

Public production exposes only the labeled browser-local sample. External parse, quorum,
and provider-speed operations are disabled and marked `local/backend demo only`.

A developer can deliberately enable a loopback-only backend demo. Image processing then
requires all of the following: development mode, an explicit local-backend selector, an
explicit upload-UX flag, server-side external-processing enablement, service authority,
a configured provider key, and affirmative user consent. A selected image leaves the
browser for Cerebras. Origin handler code does not intentionally persist it; provider
terms and retention apply. Never submit personal, confidential, regulated, or customer
data. This is deterministic simulated evaluation, not robot training, deployment, or
execution.

## Evidence lanes

Keep these claims separate:

- **Synthetic demo evidence:** checked-in/browser-generated examples; not customer proof.
- **Counterfactual robustness:** generated tests; not customer-owned proof.
- **Authorized fixture:** permitted test input; not real customer data.
- **External/customer evidence:** not earned until an authorized design partner actually
  runs the scoped workflow and its provenance is captured.

A valid artifact can record `not_attempted`; artifact validity is not execution success.
Only deterministic verifiers provide labels. An LLM never grades another LLM.

## Run locally

Requires Node 20+ and the root npm workspace install.

```bash
npm ci
npm --prefix apps/origin-web run dev
npm run test -w @origin/origin-web
npm run build -w @origin/origin-web
node scripts/honesty-lint.mjs
```

The hermetic browser gate is:

```bash
npm --prefix apps/origin-web run test:e2e -- tests/e2e/smoke.spec.ts tests/e2e/investor-ready.spec.ts
```

It runs public mode plus one isolated loopback-demo consent test. Foundry/provider requests
are intercepted and must remain at zero in the covered flows.

## Deployment

Production release is human-dispatched, main-ref-bound, protected-Environment-gated, and
uploads the exact tested artifact with an exact three-route Pages Function allowlist. No
push or pull request deploys. See [`docs/DEPLOY.md`](../../docs/DEPLOY.md) and
[`docs/CUTOVER.md`](../../docs/CUTOVER.md).

No secrets ship to the browser. Only public `VITE_*` configuration is bundled, and no
`VITE_*` value grants service authority. Never commit `.env*` other than `.env.example`.

## Claim boundary

Results mean reproducible under the named verifier, inputs, and environment. They are not
a safety guarantee, regulatory certification, robot sign-off, provider-effect proof, or
deployment authorization. Simulation evidence must be followed by the fidelity-appropriate
real-world validation and a named residual-risk owner.
