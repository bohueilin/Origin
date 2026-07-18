# Origin canonical content map — iteration 1

Canonical entity sentence: **Origin is the evidence layer for AI agents: prototype/private-pilot infrastructure that tests proposed actions with deterministic verifiers, gates permission before side effects, and emits tamper-evident evidence that can be independently rechecked.**

Canonical thesis: **The model proposes. The environment verifies. The gate decides. The trace proves. Capability is not permission.**

| Buyer or reviewer question | Current canonical source | Status / evidence boundary |
|---|---|---|
| What is Origin, who is it for, and why now? | `/` (`apps/origin-web/index.html`), `/brief` | Prototype/private pilot; not production SaaS or certification. |
| What is the primary use case? | `/reference-check`, `src/reference-check/ReferenceCheckPage.tsx` | Synthetic support/IAM batteries; real design-partner evidence remains blocked until authorized. |
| How does runtime enforcement work? | `/trust`, `/app`, `public/llms.txt` | Policy verdict and controlled proxy architecture; demo console is explicitly simulated. |
| What is the architecture and where are trust boundaries? | `/trust`, `docs/architecture/`, `apps/janus` | Deterministic gate is separate from model proposal; credentials use handles rather than raw secrets. |
| How are verifier and rewards protected? | `/security`, `packages/verifier-core`, `packages/evidence`, `services/cobra`, `services/chronos` | Oracle is the sole label/hard-zero authority; never an LLM grading an LLM. |
| What is the evidence format and tamper behavior? | `/proof`, `/verify`, `evidence/README.md`, `scripts/verify-tr-a002.mjs` | TR-A001 is authored; TR-A002 is machine-emitted sandbox evidence; external TR-A003 is not yet earned. |
| How are human approvals and policy verdicts represented? | Homepage demo, `/app`, `/reference-check` | Allow/cap/require-approval/deny/pause language; named risk-owner example is simulated. |
| What happens on failure or config drift? | `/reference-check`, `/verify`, verifier-core tests | Verification fails closed; config change voids the credential; malformed/tampered evidence is not accepted. |
| What are the limitations? | `/trust`, `/proof`, `public/llms.txt`, legal pages | Integrity is not issuer identity, “reproducible” is not “safe,” review-ready is not reviewer-accepted. |
| How is Origin different? | `/` and `public/llms.txt` | Identity identifies; observability debugs; Origin gates permission before side effects and preserves evidence. A fuller policy/compliance comparison is planned. |
| How do I verify evidence? | `/verify`; `npm run proof:verify`; `npm run env:verify` | Browser verification is offline; repository scripts recompute checked-in examples. |
| How do I run the demo? | `DEMO_RUNBOOK.md` | Local, credential-free sequence with reset and offline fallback. |

## Planned canonical coverage

One future crawlable technical explainer should cover policy-engine and compliance-tool distinctions, trust boundaries, failure/exception handling, evidence provenance, and the boundary between currently implemented reference-check behavior and runtime design intent. It should link to code/tests instead of duplicating slogans.

## Deferred work and residual risk

- The public surface uses both “reference check” and “runtime enforcement.” Without an explicit mode comparison, retrieval can flatten those into an overbroad maturity claim.
- Physical-AI Labs are demonstrations on the same evidence contract, not the primary product or certification evidence.
- No current source supports customer adoption, production deployment, reviewer acceptance, search ranking, or certification claims.
