# Origin canonical content map — iteration 1

Canonical entity sentence: **Origin is the evidence layer for AI agents: prototype/private-pilot infrastructure that tests proposed actions with deterministic verifiers, gates permission before side effects, and emits tamper-evident evidence that can be independently rechecked.**

Canonical thesis: **The model proposes. The environment verifies. The gate decides. The trace proves. Capability is not permission.**

| Priority | Buyer or reviewer question | Current canonical source | Status / evidence boundary |
|---|---|---|---|
| P0 | What is Origin, who is it for, and why now? | `/` (`apps/origin-web/index.html`), `/brief` | Prototype/private pilot; not production SaaS or certification. |
| P0 | What is the primary use case? | `/reference-check`, `src/reference-check/ReferenceCheckPage.tsx` | Synthetic support/IAM batteries; real design-partner evidence remains blocked until authorized. |
| P0 | How does runtime enforcement differ from the reference check? | `/reference-check-vs-runtime`, `apps/origin-web/reference-check-vs-runtime.html` | Reference check is implemented with synthetic batteries; runtime controlled-proxy enforcement is explicitly proposed architecture. |
| P0 | What is the architecture and where are trust boundaries? | `/trust`, `docs/architecture/`, `apps/janus` | Deterministic gate is separate from model proposal; credentials use handles rather than raw secrets. |
| P0 | What is the threat model and adversarial scope? | `/security`, `/trust`, `packages/verifier-core/sigil.test.ts`, `packages/verifier-core/gymHardening.mjs`, `scripts/honesty-lint.mjs` | Checked-in coverage addresses untrusted proposals, adversarial policies, rogue signing keys, and claim inflation; it is not an exhaustive production threat model or proof of general security. |
| P0 | How are verifier and rewards protected? | `/security`, `packages/verifier-core`, `packages/evidence`, `services/cobra`, `services/chronos` | Oracle is the sole label/hard-zero authority; never an LLM grading an LLM. |
| P0 | What is the evidence format and tamper behavior? | `/proof`, `/verify`, `evidence/README.md`, `scripts/verify-tr-a002.mjs` | TR-A001 is authored; TR-A002 is machine-emitted sandbox evidence; external TR-A003 is not yet earned. |
| P0 | How are human approvals and policy verdicts represented? | Homepage demo, `/app`, `/reference-check` | Allow/cap/require-approval/deny/pause language; named risk-owner example is simulated. |
| P0 | What happens on failure or config drift? | `/reference-check`, `/verify`, verifier-core tests | Verification fails closed; config change voids the credential; malformed/tampered evidence is not accepted. |
| P0 | What are the limitations? | `/trust`, `/proof`, `public/llms.txt`, legal pages | Integrity is not issuer identity, “reproducible” is not “safe,” review-ready is not reviewer-accepted. |
| P1 | How is Origin different? | `/reference-check-vs-runtime`, `apps/origin-web/reference-check-vs-runtime.html` | Implemented canonical comparison distinguishes Origin from identity, observability, generic guardrails, policy engines, and compliance tools; runtime enforcement remains proposed architecture. |
| P0 | How do I verify evidence? | `/verify`; `npm run proof:verify`; `npm run env:verify` | Browser verification is offline; repository scripts recompute checked-in examples. |
| P0 | How do I run the demo? | `DEMO_RUNBOOK.md` | Local, credential-free sequence with reset and offline fallback. |

## Implemented canonical coverage

`/reference-check-vs-runtime` now covers policy-engine and compliance-tool distinctions, trust boundaries, verdict/failure behavior, evidence provenance, and the boundary between implemented reference-check behavior and runtime design intent. The `/reference-check` React flow visibly links to it, and claim-minimal `TechArticle` JSON-LD matches the page headline, description, and canonical URL. Route, structured-data, unsupported-claim, internal-link, and accessibility invariants are tested in `apps/origin-web/tests/e2e/`.

## Deferred work and residual risk

- Existing public HTML navigation and `public/sitemap.xml` are protected, so the route is linked from the modifiable `/reference-check` product surface but is not yet in global navigation or the sitemap. Recommended human-authorized edits: add `/reference-check-vs-runtime` beside Trust/Brief in one primary footer and add its canonical URL to the sitemap.
- Physical-AI Labs are demonstrations on the same evidence contract, not the primary product or certification evidence.
- No current source supports customer adoption, production deployment, reviewer acceptance, search ranking, or certification claims.
